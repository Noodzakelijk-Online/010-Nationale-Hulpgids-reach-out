import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
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

// Multi-platform reach-out tool tables

/** Supported platforms for candidate discovery and outreach */
export const platforms = mysqlTable("platforms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  baseUrl: text("baseUrl").notNull(),
  authType: mysqlEnum("authType", ["credentials", "oauth", "api_key"]).notNull(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Outreach campaigns created by users */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetPlatforms: text("targetPlatforms").notNull(), // JSON array of platform IDs
  searchCriteria: text("searchCriteria").notNull(), // JSON object with search parameters
  status: mysqlEnum("status", ["draft", "active", "paused", "completed", "scheduled"]).default("draft").notNull(),
  totalCandidates: int("totalCandidates").default(0).notNull(),
  messagesSent: int("messagesSent").default(0).notNull(),
  responsesReceived: int("responsesReceived").default(0).notNull(),
  // Scheduling fields
  isScheduled: int("isScheduled").default(0).notNull(), // 0 = immediate, 1 = scheduled
  scheduledFor: timestamp("scheduledFor"), // When to execute the campaign
  isRecurring: int("isRecurring").default(0).notNull(), // 0 = one-time, 1 = recurring
  recurringPattern: varchar("recurringPattern", { length: 50 }), // daily, weekly, monthly
  lastExecutedAt: timestamp("lastExecutedAt"), // Last execution time for recurring campaigns
  nextExecutionAt: timestamp("nextExecutionAt"), // Next scheduled execution
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Discovered candidates from all platforms */
export const candidates = mysqlTable("candidates", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  platformId: int("platformId").notNull().references(() => platforms.id),
  externalId: varchar("externalId", { length: 255 }), // Platform-specific ID
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  profileUrl: text("profileUrl"),
  location: varchar("location", { length: 255 }),
  distance: int("distance"), // Distance in km from search location
  experience: text("experience"), // JSON array of experience items
  services: text("services"), // JSON array of services offered
  availability: text("availability"), // JSON object with availability data
  hourlyRate: int("hourlyRate"), // Rate in cents
  bio: text("bio"),
  profileData: text("profileData"), // JSON object with full profile data
  compatibilityScore: int("compatibilityScore").default(0).notNull(), // 0-100
  matchReasons: text("matchReasons"), // JSON array of match reasoning
  status: mysqlEnum("status", ["discovered", "matched", "contacted", "responded", "rejected"]).default("discovered").notNull(),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Messages sent to candidates */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  platformId: int("platformId").notNull().references(() => platforms.id),
  subject: varchar("subject", { length: 500 }),
  content: text("content").notNull(),
  language: mysqlEnum("language", ["nl", "en"]).default("nl").notNull(),
  status: mysqlEnum("status", ["draft", "queued", "approved", "sent", "delivered", "failed", "responded", "replied", "rejected"]).default("draft").notNull(),
  externalMessageId: varchar("externalMessageId", { length: 255 }), // Platform-specific message ID
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  respondedAt: timestamp("respondedAt"),
  responseContent: text("responseContent"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Platform credentials for authenticated access */
export const platformCredentials = mysqlTable("platformCredentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  platformId: int("platformId").notNull().references(() => platforms.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }),
  encryptedPassword: text("encryptedPassword"), // Encrypted with platform key
  apiKey: text("apiKey"), // For API-based platforms
  sessionData: text("sessionData"), // JSON object with session cookies/tokens
  isConnected: int("isConnected").default(0).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** AI matching factors and scores for transparency */
export const matchFactors = mysqlTable("matchFactors", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  factor: varchar("factor", { length: 100 }).notNull(), // e.g., "location", "experience", "services"
  score: int("score").notNull(), // 0-100
  weight: int("weight").notNull(), // Importance weight 0-100
  reasoning: text("reasoning"), // AI-generated explanation
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Follow-up sequences for automated outreach */
export const followUps = mysqlTable("followUps", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  sequence: int("sequence").notNull(), // Follow-up number (1, 2, 3...)
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["scheduled", "sent", "skipped", "cancelled"]).default("scheduled").notNull(),
  messageId: int("messageId").references(() => messages.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Platform = typeof platforms.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type PlatformCredential = typeof platformCredentials.$inferSelect;
export type MatchFactor = typeof matchFactors.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;