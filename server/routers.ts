import { TRPCError } from "@trpc/server";
import { purchases } from "../drizzle/schema";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { invokeLLM } from "./_core/llm";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storageGetSignedUrl, storagePut } from "./storage";
import {
  DEADLINE_STATUSES,
  PRODUCT_CATEGORIES,
  addDays,
  addMonths,
  deadlineStatus,
  ensureDeadlineNotifications,
  formatDate,
  formatMoney,
  getAllPurchases,
  getAnalytics,
  getPurchase,
  getDeadlineItems,
  getExtractionSystemPrompt,
  getExtractionUserPrompt,
  getRequiredExtractionFields,
  insertPurchase,
  isReceiptMimeType,
  listNotifications,
  listPurchases,
  markNotificationRead,
  maxReceiptBytes,
  normalizeLineItems,
  normalizePurchaseInput,
  parseDataUrl,
  replaceLineItems,
  serializePurchase,
  updatePurchase,
  deletePurchase,
  receiptPath,
  utcCalendarDiff,
} from "./db";

const lineItemInput = z.object({
  itemName: z.string().min(1).max(255),
  quantity: z.number().int().min(1).default(1),
  price: z.number().nonnegative(),
  category: z.string().max(100).optional(),
});

const basePurchaseInput = z.object({
  merchantName: z.string().min(1).max(255),
  purchaseDate: z.coerce.date(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().min(3).max(10).default("INR"),
  category: z.enum(PRODUCT_CATEGORIES).default("Other"),
  warrantyDurationMonths: z.number().int().min(0).max(240).default(12),
  returnWindowDays: z.number().int().min(0).max(365).default(30),
  notes: z.string().max(10000).optional(),
  tags: z.string().max(255).optional(),
  lineItems: z.array(lineItemInput).default([]),
});

const extractionSchema = {
  type: "object",
  properties: {
    merchantName: { type: "string" },
    purchaseDate: { type: "string", description: "ISO date YYYY-MM-DD" },
    lineItems: { type: "array", items: { type: "object", properties: { itemName: { type: "string" }, quantity: { type: "integer" }, price: { type: "number" }, category: { type: "string" } }, required: ["itemName", "quantity", "price", "category"], additionalProperties: false } },
    totalAmount: { type: "number" },
    warrantyDurationMonths: { type: "integer" },
    returnWindowDays: { type: "integer" },
    category: { type: "string" },
    currency: { type: "string" },
    notes: { type: "string" },
  },
  required: ["merchantName", "purchaseDate", "lineItems", "totalAmount", "warrantyDurationMonths", "returnWindowDays", "category", "currency", "notes"],
  additionalProperties: false,
};

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : (part as { text?: string }).text || "").join("\n");
  return "";
}

function parseExtractedJson(content: unknown) {
  try { return JSON.parse(contentToText(content)); }
  catch { throw new TRPCError({ code: "BAD_REQUEST", message: "The receipt could not be read as structured data. Try a clearer image or enter it manually." }); }
}

function assertValidDate(value: Date, label: string) {
  if (Number.isNaN(value.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: `${label} is not a valid date.` });
}

async function ensureUserDeadlineState(userId: number) {
  const rows = await getAllPurchases(userId);
  await ensureDeadlineNotifications(userId, rows);
  return rows;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  purchase: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional(), tag: z.string().optional(), warrantyStatus: z.enum(["all", "active", "expiring soon", "expired"]).optional(), minPrice: z.number().nonnegative().optional(), maxPrice: z.number().nonnegative().optional(), sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc", "warranty_asc", "warranty_desc"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const rows = await listPurchases(ctx.user.id, input ?? {});
      return rows.map(serializePurchase);
    }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const purchase = await getPurchase(ctx.user.id, input.id);
      if (!purchase) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
      return { ...serializePurchase(purchase), lineItems: purchase.lineItems.map(item => ({ ...item, price: Number(item.price) })) };
    }),
    createManual: protectedProcedure.input(basePurchaseInput).mutation(async ({ ctx, input }) => {
      const purchase = normalizePurchaseInput(input);
      const created = await insertPurchase(ctx.user.id, purchase, normalizeLineItems(input.lineItems));
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Purchase could not be saved." });
      return { ...serializePurchase(created), lineItems: created.lineItems.map(item => ({ ...item, price: Number(item.price) })) };
    }),
    update: protectedProcedure.input(basePurchaseInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { id, lineItems: items, ...patch } = input;
      const normalizedPatch: Partial<typeof purchases.$inferInsert> = { ...patch, totalAmount: patch.totalAmount === undefined ? undefined : Number(patch.totalAmount).toFixed(2) };
      const updated = await updatePurchase(ctx.user.id, id, normalizedPatch);
      if (items) await replaceLineItems(ctx.user.id, id, normalizeLineItems(items));
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
      const result = await getPurchase(ctx.user.id, id);
      return result ? { ...serializePurchase(result), lineItems: result.lineItems.map(item => ({ ...item, price: Number(item.price) })) } : null;
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await deletePurchase(ctx.user.id, input.id); return { success: true }; }),
    uploadAndParse: protectedProcedure.input(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1), dataUrl: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      if (!isReceiptMimeType(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload an image or PDF receipt." });
      const parsedData = parseDataUrl(input.dataUrl);
      if (parsedData.mimeType !== input.mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file type does not match its content." });
      const data = Buffer.from(parsedData.base64, "base64");
      if (data.byteLength > maxReceiptBytes()) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Receipt files must be 12 MB or smaller." });
      const upload = await storagePut(receiptPath(ctx.user.id, input.fileName), data, input.mimeType);
      const signedUrl = await storageGetSignedUrl(upload.key);
      const media = input.mimeType === "application/pdf" ? { type: "file_url" as const, file_url: { url: signedUrl, mime_type: "application/pdf" as const } } : { type: "image_url" as const, image_url: { url: signedUrl, detail: "high" as const } };
      const response = await invokeLLM({ messages: [{ role: "system", content: getExtractionSystemPrompt() }, { role: "user", content: [{ type: "text", text: getExtractionUserPrompt() }, media] }], response_format: { type: "json_schema", json_schema: { name: "receipt_extraction", strict: true, schema: extractionSchema } }, maxTokens: 1800 });
      const extracted = parseExtractedJson(response.choices[0]?.message?.content);
      const purchaseDate = new Date(String(extracted.purchaseDate));
      assertValidDate(purchaseDate, "Purchase date");
      const merchantName = String(extracted.merchantName || "Unknown merchant").trim();
      const warrantyDurationMonths = Math.max(0, Number(extracted.warrantyDurationMonths ?? 12));
      const returnWindowDays = Math.max(0, Number(extracted.returnWindowDays ?? 30));
      const purchase = normalizePurchaseInput({ merchantName, purchaseDate, totalAmount: Number(extracted.totalAmount ?? 0), currency: "INR", category: PRODUCT_CATEGORIES.includes(extracted.category) ? extracted.category : "Other", warrantyDurationMonths, returnWindowDays, notes: String(extracted.notes || "") });
      const created = await insertPurchase(ctx.user.id, { ...purchase, receiptUrl: upload.url, receiptFileKey: upload.key, rawExtractedData: extracted }, normalizeLineItems(Array.isArray(extracted.lineItems) ? extracted.lineItems.map((item: Record<string, unknown>) => ({ itemName: String(item.itemName || "Item"), quantity: Number(item.quantity || 1), price: Number(item.price || 0), category: item.category ? String(item.category) : undefined })) : []));
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The parsed purchase could not be saved." });
      return { ...serializePurchase(created), lineItems: created.lineItems.map(item => ({ ...item, price: Number(item.price) })), extracted, receiptUrl: upload.url, requiredFields: getRequiredExtractionFields(), message: "Receipt parsed and purchase saved." };
    }),
  }),

  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const rows = await ensureUserDeadlineState(ctx.user.id);
      const analytics = getAnalytics(rows);
      const deadlines = getDeadlineItems(rows).map(item => ({ id: item.purchase.id, merchantName: item.purchase.merchantName, kind: item.kind, date: item.date, ...deadlineStatus(item.date) })).slice(0, 12);
      return { analytics, deadlines, statuses: DEADLINE_STATUSES, reminderThresholds: [7, 1] as const };
    }),
    categories: protectedProcedure.query(() => PRODUCT_CATEGORIES),
  }),

  warranty: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await ensureUserDeadlineState(ctx.user.id);
      return rows.filter(row => row.warrantyExpiryDate).map(row => ({ ...serializePurchase(row), deadline: row.warrantyExpiryDate, ...deadlineStatus(row.warrantyExpiryDate) })).sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime());
    }),
  }),

  returns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await ensureUserDeadlineState(ctx.user.id);
      return rows.filter(row => row.returnDeadlineDate).map(row => ({ ...serializePurchase(row), deadline: row.returnDeadlineDate, ...deadlineStatus(row.returnDeadlineDate) })).sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime());
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => { await ensureUserDeadlineState(ctx.user.id); return listNotifications(ctx.user.id); }),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await markNotificationRead(ctx.user.id, input.id); return { success: true }; }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => { const rows = await listNotifications(ctx.user.id); await Promise.all(rows.filter(row => row.isRead === 0).map(row => markNotificationRead(ctx.user.id, row.id))); return { success: true }; }),
  }),
});

export type AppRouter = typeof appRouter;
export const receiptExtractionContract = { fields: getRequiredExtractionFields(), statuses: DEADLINE_STATUSES, reminderDays: [7, 1] as const, storage: "S3-compatible" as const };
export const receiptParserDefaults = { warrantyDurationMonths: 12, returnWindowDays: 30, currency: "INR" };
export function getRouterDiagnostics() { return { ready: true, extraction: receiptExtractionContract, defaults: receiptParserDefaults, helpers: { addDays, addMonths, deadlineStatus, formatDate, formatMoney, utcCalendarDiff } }; }
