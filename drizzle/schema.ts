import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  merchantName: varchar("merchantName", { length: 255 }).notNull(),
  purchaseDate: timestamp("purchaseDate").notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  category: varchar("category", { length: 100 }).default("Electronics").notNull(),
  receiptUrl: text("receiptUrl"),
  receiptFileKey: text("receiptFileKey"),
  warrantyDurationMonths: int("warrantyDurationMonths").default(12).notNull(),
  warrantyExpiryDate: timestamp("warrantyExpiryDate"),
  returnWindowDays: int("returnWindowDays").default(30).notNull(),
  returnDeadlineDate: timestamp("returnDeadlineDate"),
  notes: text("notes"),
  tags: varchar("tags", { length: 255 }).default("").notNull(),
  rawExtractedData: json("rawExtractedData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = typeof purchases.$inferInsert;

export const lineItems = mysqlTable("line_items", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId").notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }),
});

export type LineItem = typeof lineItems.$inferSelect;
export type InsertLineItem = typeof lineItems.$inferInsert;

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  purchaseId: int("purchaseId").notNull(),
  type: mysqlEnum("type", ["warranty_7day", "warranty_1day", "return_7day", "return_1day"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: int("isRead").default(0).notNull(), // 0 for unread, 1 for read
  targetDate: timestamp("targetDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const tagBudgets = mysqlTable("tag_budgets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tagName: varchar("tagName", { length: 100 }).notNull(),
  monthlyLimit: decimal("monthlyLimit", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TagBudget = typeof tagBudgets.$inferSelect;
export type InsertTagBudget = typeof tagBudgets.$inferInsert;

export const warrantyClaims = mysqlTable("warranty_claims", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  purchaseId: int("purchaseId").notNull(),
  status: mysqlEnum("status", ["Submitted", "Under Review", "Repairing", "Replacement Approved", "Resolved", "Rejected"]).default("Submitted").notNull(),
  issueDescription: text("issueDescription").notNull(),
  claimReference: varchar("claimReference", { length: 100 }),
  resolutionNotes: text("resolutionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WarrantyClaim = typeof warrantyClaims.$inferSelect;
export type InsertWarrantyClaim = typeof warrantyClaims.$inferInsert;
