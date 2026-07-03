import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

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
  authType: mysqlEnum("authType", [
    "credentials",
    "oauth",
    "api_key",
  ]).notNull(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Outreach campaigns created by users */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetPlatforms: text("targetPlatforms").notNull(), // JSON array of platform IDs
  searchCriteria: text("searchCriteria").notNull(), // JSON object with search parameters
  status: mysqlEnum("status", [
    "draft",
    "active",
    "paused",
    "completed",
    "scheduled",
    "archived",
  ])
    .default("draft")
    .notNull(),
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
  campaignId: int("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id),
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
  status: mysqlEnum("status", [
    "discovered",
    "matched",
    "contacted",
    "responded",
    "rejected",
  ])
    .default("discovered")
    .notNull(),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Messages sent to candidates */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id),
  subject: varchar("subject", { length: 500 }),
  content: text("content").notNull(),
  language: mysqlEnum("language", ["nl", "en"]).default("nl").notNull(),
  status: mysqlEnum("status", [
    "draft",
    "queued",
    "approved",
    "sent",
    "delivered",
    "failed",
    "responded",
    "replied",
    "rejected",
  ])
    .default("draft")
    .notNull(),
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
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id, { onDelete: "cascade" }),
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
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  factor: varchar("factor", { length: 100 }).notNull(), // e.g., "location", "experience", "services"
  score: int("score").notNull(), // 0-100
  weight: int("weight").notNull(), // Importance weight 0-100
  reasoning: text("reasoning"), // AI-generated explanation
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Follow-up sequences for automated outreach */
export const followUps = mysqlTable("followUps", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  sequence: int("sequence").notNull(), // Follow-up number (1, 2, 3...)
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["scheduled", "sent", "skipped", "cancelled"])
    .default("scheduled")
    .notNull(),
  messageId: int("messageId").references(() => messages.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Deduplicated person identity shared by candidate source profiles */
export const candidateIdentities = mysqlTable("candidateIdentities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  canonicalName: varchar("canonicalName", { length: 255 }).notNull(),
  canonicalEmail: varchar("canonicalEmail", { length: 320 }),
  canonicalPhone: varchar("canonicalPhone", { length: 50 }),
  location: varchar("location", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Platform-specific source profile connected to a deduplicated identity */
export const candidateSources = mysqlTable("candidateSources", {
  id: int("id").autoincrement().primaryKey(),
  candidateIdentityId: int("candidateIdentityId")
    .notNull()
    .references(() => candidateIdentities.id, { onDelete: "cascade" }),
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id),
  externalId: varchar("externalId", { length: 255 }),
  profileUrl: text("profileUrl"),
  profileHash: varchar("profileHash", { length: 128 }),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Persisted campaign safety/readiness evaluations */
export const campaignReadinessChecks = mysqlTable("campaignReadinessChecks", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["ready", "warning", "blocked"]).notNull(),
  checksJson: text("checksJson").notNull(),
  blockersJson: text("blockersJson"),
  warningsJson: text("warningsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Explicit approval/rejection decision for an outreach message */
export const messageApprovals = mysqlTable("messageApprovals", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  campaignId: int("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  decision: mysqlEnum("decision", ["approved", "rejected"]).notNull(),
  decisionReason: text("decisionReason"),
  approvedContentSnapshot: text("approvedContentSnapshot"),
  approvedSubjectSnapshot: varchar("approvedSubjectSnapshot", { length: 500 }),
  decidedAt: timestamp("decidedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Delivery attempt record. A message is not sent just because an attempt exists. */
export const messageSendAttempts = mysqlTable("messageSendAttempts", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  campaignId: int("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id),
  status: mysqlEnum("status", ["blocked", "started", "succeeded", "failed"])
    .default("started")
    .notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
  errorMessage: text("errorMessage"),
  externalMessageId: varchar("externalMessageId", { length: 255 }),
  confirmationText: text("confirmationText"),
  retryCount: int("retryCount").default(0).notNull(),
  rateLimitState: text("rateLimitState"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Candidate response or manual reply entry */
export const candidateResponses = mysqlTable("candidateResponses", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: int("candidateId")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  messageId: int("messageId").references(() => messages.id, {
    onDelete: "set null",
  }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id),
  rawContent: text("rawContent").notNull(),
  normalizedContent: text("normalizedContent"),
  classification: mysqlEnum("classification", [
    "interested",
    "not_interested",
    "more_info",
    "unavailable",
    "no_response",
    "unknown",
  ])
    .default("unknown")
    .notNull(),
  confidence: int("confidence").default(0).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  source: mysqlEnum("source", ["manual", "platform", "import"])
    .default("manual")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Explicit operator decision on whether a candidate is qualified for a campaign */
export const candidateQualificationDecisions = mysqlTable(
  "candidateQualificationDecisions",
  {
    id: int("id").autoincrement().primaryKey(),
    candidateId: int("candidateId")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: int("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: mysqlEnum("decision", [
      "qualified",
      "not_qualified",
      "needs_review",
    ]).notNull(),
    reason: text("reason").notNull(),
    sensitiveAssumptionsAcknowledged: int("sensitiveAssumptionsAcknowledged")
      .default(0)
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

/** Explicit operator decision for a possible duplicate candidate pair */
export const candidateDuplicateResolutions = mysqlTable(
  "candidateDuplicateResolutions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetCandidateId: int("targetCandidateId")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    sourceCandidateId: int("sourceCandidateId")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    decision: mysqlEnum("decision", ["merged", "not_duplicate"]).notNull(),
    confidence: int("confidence").default(0).notNull(),
    reasonsJson: text("reasonsJson"),
    decisionReason: text("decisionReason").notNull(),
    resolvedAt: timestamp("resolvedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

/** Durable queue visibility even when the in-memory worker is used */
export const queueJobRecords = mysqlTable("queueJobRecords", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  campaignId: int("campaignId").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  messageId: int("messageId").references(() => messages.id, {
    onDelete: "set null",
  }),
  queueName: mysqlEnum("queueName", ["messages", "discovery"]).notNull(),
  jobType: varchar("jobType", { length: 100 }).notNull(),
  status: mysqlEnum("status", [
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "cancelled",
  ])
    .default("waiting")
    .notNull(),
  payloadJson: text("payloadJson"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Platform rate-limit/safety events */
export const rateLimitEvents = mysqlTable("rateLimitEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platformId: int("platformId").references(() => platforms.id, {
    onDelete: "set null",
  }),
  campaignId: int("campaignId").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "blocked"])
    .default("info")
    .notNull(),
  detailJson: text("detailJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Credential lifecycle events without exposing secrets */
export const credentialEvents = mysqlTable("credentialEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platformId: int("platformId")
    .notNull()
    .references(() => platforms.id, { onDelete: "cascade" }),
  eventType: mysqlEnum("eventType", [
    "saved",
    "tested",
    "failed",
    "disconnected",
  ]).notNull(),
  status: mysqlEnum("status", ["ok", "warning", "error"])
    .default("ok")
    .notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Human-readable audit trail for consequential outreach actions */
export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: int("entityId").notNull(),
  campaignId: int("campaignId").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  action: varchar("action", { length: 120 }).notNull(),
  actor: mysqlEnum("actor", ["user", "system"]).default("system").notNull(),
  source: varchar("source", { length: 120 }),
  beforeState: text("beforeState"),
  afterState: text("afterState"),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high"])
    .default("low")
    .notNull(),
  approvalId: int("approvalId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** User-owned reusable drafting snippets for approval-gated outreach messages */
export const messageSnippets = mysqlTable("messageSnippets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  body: text("body").notNull(),
  language: mysqlEnum("language", ["nl", "en"]).default("nl").notNull(),
  tonePreset: mysqlEnum("tonePreset", ["careful", "warm", "concise"])
    .default("careful")
    .notNull(),
  isActive: int("isActive").default(1).notNull(),
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
export type CandidateIdentity = typeof candidateIdentities.$inferSelect;
export type CandidateSource = typeof candidateSources.$inferSelect;
export type CampaignReadinessCheck =
  typeof campaignReadinessChecks.$inferSelect;
export type MessageApproval = typeof messageApprovals.$inferSelect;
export type MessageSendAttempt = typeof messageSendAttempts.$inferSelect;
export type CandidateResponse = typeof candidateResponses.$inferSelect;
export type CandidateQualificationDecision =
  typeof candidateQualificationDecisions.$inferSelect;
export type CandidateDuplicateResolution =
  typeof candidateDuplicateResolutions.$inferSelect;
export type QueueJobRecord = typeof queueJobRecords.$inferSelect;
export type RateLimitEvent = typeof rateLimitEvents.$inferSelect;
export type CredentialEvent = typeof credentialEvents.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type MessageSnippet = typeof messageSnippets.$inferSelect;
