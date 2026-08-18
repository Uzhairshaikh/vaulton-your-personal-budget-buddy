import { and, asc, desc, eq, gte, gt, like, lt, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, lineItems, notifications, purchases, tagBudgets, users, warrantyClaims } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export type PurchaseFilters = { search?: string; category?: string; tag?: string; warrantyStatus?: "all" | "active" | "expiring soon" | "expired"; minPrice?: number; maxPrice?: number; sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "warranty_asc" | "warranty_desc" };

export async function listPurchases(userId: number, filters: PurchaseFilters = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(purchases.userId, userId)];
  if (filters.category && filters.category !== "all") conditions.push(eq(purchases.category, filters.category));
  if (filters.tag && filters.tag !== "all") conditions.push(like(purchases.tags, `%${filters.tag}%`));
  if (filters.search?.trim()) { const value = `%${filters.search.trim()}%`; conditions.push(or(like(purchases.merchantName, value), like(purchases.category, value), like(purchases.tags, value))!); }
  if (filters.minPrice !== undefined) conditions.push(gte(purchases.totalAmount, Number(filters.minPrice).toFixed(2)));
  if (filters.maxPrice !== undefined) conditions.push(lte(purchases.totalAmount, Number(filters.maxPrice).toFixed(2)));
  if (filters.warrantyStatus && filters.warrantyStatus !== "all") {
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86_400_000);
    if (filters.warrantyStatus === "expired") conditions.push(lt(purchases.warrantyExpiryDate, now));
    if (filters.warrantyStatus === "expiring soon") conditions.push(and(gte(purchases.warrantyExpiryDate, now), lte(purchases.warrantyExpiryDate, soon))!);
    if (filters.warrantyStatus === "active") conditions.push(gt(purchases.warrantyExpiryDate, soon));
  }
  const orderBy = filters.sort === "date_asc" ? asc(purchases.purchaseDate) : filters.sort === "amount_desc" ? desc(purchases.totalAmount) : filters.sort === "amount_asc" ? asc(purchases.totalAmount) : filters.sort === "warranty_asc" ? asc(purchases.warrantyExpiryDate) : filters.sort === "warranty_desc" ? desc(purchases.warrantyExpiryDate) : desc(purchases.purchaseDate);
  return db.select().from(purchases).where(and(...conditions)).orderBy(orderBy);
}

export async function getPurchase(userId: number, purchaseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(purchases).where(and(eq(purchases.userId, userId), eq(purchases.id, purchaseId))).limit(1);
  if (!rows[0]) return undefined;
  const items = await db.select().from(lineItems).where(eq(lineItems.purchaseId, purchaseId)).orderBy(asc(lineItems.id));
  return { ...rows[0], lineItems: items };
}

export async function insertPurchase(userId: number, purchase: Omit<typeof purchases.$inferInsert, "userId">, items: Array<Omit<typeof lineItems.$inferInsert, "purchaseId">> = []) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(purchases).values({ ...purchase, userId });
  const purchaseId = Number(result[0].insertId);
  if (items.length) await db.insert(lineItems).values(items.map(item => ({ ...item, purchaseId })));
  return getPurchase(userId, purchaseId);
}

export async function updatePurchase(userId: number, purchaseId: number, patch: Partial<typeof purchases.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(purchases).set({ ...patch, updatedAt: new Date() }).where(and(eq(purchases.id, purchaseId), eq(purchases.userId, userId)));
  return getPurchase(userId, purchaseId);
}

export async function replaceLineItems(userId: number, purchaseId: number, items: Array<Omit<typeof lineItems.$inferInsert, "purchaseId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await db.select({ id: purchases.id }).from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("Purchase not found");
  await db.delete(lineItems).where(eq(lineItems.purchaseId, purchaseId));
  if (items.length) await db.insert(lineItems).values(items.map(item => ({ ...item, purchaseId })));
}

export async function deletePurchase(userId: number, purchaseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(lineItems).where(eq(lineItems.purchaseId, purchaseId));
  await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.purchaseId, purchaseId)));
  await db.delete(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.userId, userId)));
}

export async function listNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function getAllPurchases(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.purchaseDate));
}

export function toNumber(value: string | number | null | undefined) { return Number(value ?? 0); }
export function addMonths(date: Date, months: number) { const result = new Date(date); result.setUTCMonth(result.getUTCMonth() + months); return result; }
export function addDays(date: Date, days: number) { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }
export function utcCalendarDiff(target: Date, now = new Date()) { const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()); const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); return Math.round((targetUtc - nowUtc) / 86_400_000); }
export function deadlineStatus(date: Date | null | undefined, now = new Date()) { if (!date) return { status: "active" as const, daysRemaining: null as number | null }; const daysRemaining = Math.ceil((date.getTime() - now.getTime()) / 86_400_000); if (daysRemaining < 0) return { status: "expired" as const, daysRemaining }; if (daysRemaining <= 7) return { status: "expiring soon" as const, daysRemaining }; return { status: "active" as const, daysRemaining }; }
export function normalizePurchaseInput(input: { merchantName: string; purchaseDate: Date; totalAmount: number; currency?: string; category?: string; warrantyDurationMonths?: number; returnWindowDays?: number; notes?: string; tags?: string }) { const warrantyDurationMonths = Math.max(0, Math.floor(input.warrantyDurationMonths ?? 12)); const returnWindowDays = Math.max(0, Math.floor(input.returnWindowDays ?? 30)); return { merchantName: input.merchantName.trim().slice(0, 255), purchaseDate: input.purchaseDate, totalAmount: Number(input.totalAmount.toFixed(2)).toFixed(2), currency: "INR", category: (input.category || "Other").trim().slice(0, 100), warrantyDurationMonths, returnWindowDays, warrantyExpiryDate: addMonths(input.purchaseDate, warrantyDurationMonths), returnDeadlineDate: addDays(input.purchaseDate, returnWindowDays), notes: input.notes?.trim().slice(0, 10_000) || null, tags: input.tags?.trim().slice(0, 255) || "" }; }
export function normalizeLineItems(items: Array<{ itemName: string; quantity?: number; price: number; category?: string }> = []) { return items.map(item => ({ itemName: item.itemName.trim().slice(0, 255), quantity: Math.max(1, Math.floor(item.quantity ?? 1)), price: Number(item.price).toFixed(2), category: item.category?.trim().slice(0, 100) || null })); }
export function groupByMonth(rows: Array<typeof purchases.$inferSelect>) { const map = new Map<string, number>(); rows.forEach(row => { const date = new Date(row.purchaseDate); const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; map.set(key, (map.get(key) ?? 0) + toNumber(row.totalAmount)); }); return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([key, total]) => { const [year, month] = key.split("-").map(Number); return { key, label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short" }), total: Number(total.toFixed(2)) }; }); }
export function groupByCategory(rows: Array<typeof purchases.$inferSelect>) { const map = new Map<string, number>(); rows.forEach(row => map.set(row.category, (map.get(row.category) ?? 0) + toNumber(row.totalAmount))); return Array.from(map.entries()).sort(([, a], [, b]) => b - a).map(([name, total]) => ({ name, total: Number(total.toFixed(2)) })); }
export function groupByMerchant(rows: Array<typeof purchases.$inferSelect>) { const map = new Map<string, number>(); rows.forEach(row => map.set(row.merchantName, (map.get(row.merchantName) ?? 0) + toNumber(row.totalAmount))); return Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, total]) => ({ name, total: Number(total.toFixed(2)) })); }
export function groupByMonthAndTag(rows: Array<typeof purchases.$inferSelect>) { const map = new Map<string, { label: string; total: number; tags: Record<string, number> }>(); rows.forEach(row => { const date = new Date(row.purchaseDate); const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; const entry = map.get(key) ?? { label: date.toLocaleDateString("en-IN", { month: "short" }), total: 0, tags: {} }; const amount = toNumber(row.totalAmount); const tags = (row.tags || "").split(",").map(tag => tag.trim()).filter(Boolean); const tagNames = tags.length ? tags : ["Untagged"]; const allocation = amount / tagNames.length; entry.total += amount; tagNames.forEach(tag => { entry.tags[tag] = Number(((entry.tags[tag] ?? 0) + allocation).toFixed(2)); }); map.set(key, entry); }); return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([key, value]) => ({ key, label: value.label, total: Number(value.total.toFixed(2)), tags: value.tags })); }
export function getAnalytics(rows: Array<typeof purchases.$inferSelect>) { const totalSpend = rows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0); const now = new Date(); const monthSpend = rows.filter(row => { const date = new Date(row.purchaseDate); return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth(); }).reduce((sum, row) => sum + toNumber(row.totalAmount), 0); return { totalSpend: Number(totalSpend.toFixed(2)), purchaseCount: rows.length, averagePurchase: rows.length ? Number((totalSpend / rows.length).toFixed(2)) : 0, monthSpend: Number(monthSpend.toFixed(2)), monthly: groupByMonth(rows), monthlyByTag: groupByMonthAndTag(rows), categories: groupByCategory(rows), merchants: groupByMerchant(rows) }; }
export async function ensureDeadlineNotifications(userId: number, rows: Array<typeof purchases.$inferSelect>) { const db = await getDb(); if (!db) return; for (const purchase of rows) { for (const entry of [{ date: purchase.warrantyExpiryDate, prefix: "warranty" as const, label: "Warranty" }, { date: purchase.returnDeadlineDate, prefix: "return" as const, label: "Return window" }]) { if (!entry.date) continue; const days = utcCalendarDiff(entry.date); if (days !== 7 && days !== 1) continue; const type = `${entry.prefix}_${days}day` as "warranty_7day" | "warranty_1day" | "return_7day" | "return_1day"; const exists = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.purchaseId, purchase.id), eq(notifications.type, type))).limit(1); if (exists[0]) continue; await db.insert(notifications).values({ userId, purchaseId: purchase.id, type, title: `${entry.label} expires in ${days} day${days === 1 ? "" : "s"}`, message: `${purchase.merchantName} · ${entry.label.toLowerCase()} ends on ${entry.date.toLocaleDateString()}.`, isRead: 0, targetDate: entry.date }); } } }
export function serializePurchase(purchase: typeof purchases.$inferSelect) { return { ...purchase, totalAmount: toNumber(purchase.totalAmount) }; }
export function formatMoney(value: string | number | null | undefined, currency = "INR") { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(toNumber(value)); }
export function formatDate(value: Date | string | null | undefined) { return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set"; }
export const PRODUCT_CATEGORIES = ["Electronics", "Home", "Appliances", "Fashion", "Health", "Travel", "Other"] as const;
export const REMINDER_THRESHOLDS = [7, 1] as const;
export const DEADLINE_STATUSES = ["active", "expiring soon", "expired"] as const;
export function isReceiptMimeType(mimeType: string) { return mimeType === "application/pdf" || mimeType.startsWith("image/"); }
export function maxReceiptBytes() { return 12 * 1024 * 1024; }
export function receiptPath(userId: number, fileName: string) { return `${userId}/receipts/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`; }
export function parseDataUrl(value: string) { const match = value.match(/^data:([^;]+);base64,(.+)$/); return match ? { mimeType: match[1], base64: match[2] } : { mimeType: "application/octet-stream", base64: value }; }
export function getStatus(date: Date | null | undefined) { return deadlineStatus(date); }
export function getDeadlineItems(rows: Array<typeof purchases.$inferSelect>) { return rows.flatMap(row => [{ purchase: row, kind: "Warranty" as const, date: row.warrantyExpiryDate }, { purchase: row, kind: "Return" as const, date: row.returnDeadlineDate }]).filter(item => item.date).map(item => ({ ...item, ...deadlineStatus(item.date) })).sort((a, b) => a.date!.getTime() - b.date!.getTime()); }
export function getInitials(name: string | null | undefined) { return (name || "User").split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase(); }
export function getDateInputValue(date: Date | null | undefined) { return date ? new Date(date).toISOString().slice(0, 10) : ""; }
export function parseDateInput(value: string) { return new Date(`${value}T12:00:00.000Z`); }
export function getExtractionSystemPrompt() { return "You are a meticulous receipt parsing assistant. Read the attached receipt image or PDF and return only structured JSON. Always include merchantName, purchaseDate, lineItems, totalAmount, warrantyDurationMonths, and returnWindowDays. Use defaults of 12 months and 30 days when terms are not visible and note the assumption in notes."; }
export function getExtractionUserPrompt() { return "Extract merchant name, purchase date, every line item, total amount, warranty duration, and return window. Use YYYY-MM-DD for purchaseDate, a three-letter currency code, and categorize into Electronics, Home, Appliances, Fashion, Health, Travel, or Other."; }
export function getRequiredExtractionFields() { return ["merchantName", "purchaseDate", "lineItems", "totalAmount", "warrantyDurationMonths", "returnWindowDays"] as const; }
export function getReminderDescription() { return "In-app notifications are generated at exactly 7 days and exactly 1 day before expiry."; }
export function getManualFallbackDescription() { return "Manual entry is always available when no receipt is uploaded."; }
export function getAppName() { return "Receiptwise"; }
export function getAppTagline() { return "Keep every purchase in view."; }

export { lineItems, notifications, purchases, users };
export type { InsertUser };

export default { getDb, listPurchases, getPurchase, insertPurchase, updatePurchase, deletePurchase, listNotifications, ensureDeadlineNotifications, getAnalytics };

export const CLAIM_STATUSES = ["Submitted", "Under Review", "Repairing", "Replacement Approved", "Resolved", "Rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export async function listTagBudgets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tagBudgets).where(eq(tagBudgets.userId, userId)).orderBy(asc(tagBudgets.tagName));
}

export async function upsertTagBudget(userId: number, tagName: string, monthlyLimit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalizedTag = tagName.trim().slice(0, 100);
  const normalizedLimit = Number(monthlyLimit.toFixed(2)).toFixed(2);
  const existing = await db.select({ id: tagBudgets.id }).from(tagBudgets).where(and(eq(tagBudgets.userId, userId), eq(tagBudgets.tagName, normalizedTag))).limit(1);
  if (existing[0]) {
    await db.update(tagBudgets).set({ monthlyLimit: normalizedLimit, updatedAt: new Date() }).where(eq(tagBudgets.id, existing[0].id));
  } else {
    await db.insert(tagBudgets).values({ userId, tagName: normalizedTag, monthlyLimit: normalizedLimit });
  }
  return listTagBudgets(userId);
}

export async function deleteTagBudget(userId: number, budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(tagBudgets).where(and(eq(tagBudgets.id, budgetId), eq(tagBudgets.userId, userId)));
  return listTagBudgets(userId);
}

export function getBudgetStatuses(rows: Array<typeof purchases.$inferSelect>, budgets: Array<typeof tagBudgets.$inferSelect>, now = new Date()) {
  const spendByTag: Record<string, number> = {};
  rows.filter(row => {
    const date = new Date(row.purchaseDate);
    return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
  }).forEach(row => {
    const amount = toNumber(row.totalAmount);
    const tags = (row.tags || "").split(",").map(tag => tag.trim()).filter(Boolean);
    const names = tags.length ? tags : ["Untagged"];
    const allocation = amount / names.length;
    names.forEach(tag => { spendByTag[tag] = (spendByTag[tag] ?? 0) + allocation; });
  });
  return budgets.map(budget => {
    const spent = Number((spendByTag[budget.tagName] ?? 0).toFixed(2));
    const limit = toNumber(budget.monthlyLimit);
    const percentUsed = limit > 0 ? Number(Math.min((spent / limit) * 100, 999).toFixed(1)) : 0;
    return { ...budget, spent, remaining: Number((limit - spent).toFixed(2)), percentUsed, exceeded: spent > limit };
  });
}

export async function listWarrantyClaims(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const claims = await db.select().from(warrantyClaims).where(eq(warrantyClaims.userId, userId)).orderBy(desc(warrantyClaims.updatedAt));
  if (!claims.length) return [];
  const purchaseRows = await db.select({ id: purchases.id, merchantName: purchases.merchantName, purchaseDate: purchases.purchaseDate, totalAmount: purchases.totalAmount }).from(purchases).where(eq(purchases.userId, userId));
  const purchaseMap = new Map(purchaseRows.map(row => [row.id, row]));
  return claims.map(claim => ({ ...claim, purchase: purchaseMap.get(claim.purchaseId) ?? null }));
}

export async function createWarrantyClaim(userId: number, input: { purchaseId: number; issueDescription: string; claimReference?: string; status?: ClaimStatus }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await db.select({ id: purchases.id }).from(purchases).where(and(eq(purchases.id, input.purchaseId), eq(purchases.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("Purchase not found");
  await db.insert(warrantyClaims).values({ userId, purchaseId: input.purchaseId, issueDescription: input.issueDescription.trim().slice(0, 10_000), claimReference: input.claimReference?.trim().slice(0, 100) || null, status: input.status ?? "Submitted" });
  return listWarrantyClaims(userId);
}

export async function updateWarrantyClaim(userId: number, claimId: number, patch: { status?: ClaimStatus; issueDescription?: string; claimReference?: string; resolutionNotes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(warrantyClaims).set({ ...patch, updatedAt: new Date() }).where(and(eq(warrantyClaims.id, claimId), eq(warrantyClaims.userId, userId)));
  return listWarrantyClaims(userId);
}

export async function deleteWarrantyClaim(userId: number, claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(warrantyClaims).where(and(eq(warrantyClaims.id, claimId), eq(warrantyClaims.userId, userId)));
  return listWarrantyClaims(userId);
}
