var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
var users, platforms, campaigns, candidates, messages, platformCredentials, matchFactors, followUps, candidateIdentities, candidateSources, campaignReadinessChecks, messageApprovals, messageSendAttempts, candidateResponses, candidateQualificationDecisions, candidateDuplicateResolutions, queueJobRecords, rateLimitEvents, credentialEvents, auditEvents, messageSnippets;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
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
      lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
    });
    platforms = mysqlTable("platforms", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 100 }).notNull().unique(),
      baseUrl: text("baseUrl").notNull(),
      authType: mysqlEnum("authType", [
        "credentials",
        "oauth",
        "api_key"
      ]).notNull(),
      isActive: int("isActive").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    campaigns = mysqlTable("campaigns", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      title: varchar("title", { length: 255 }).notNull(),
      description: text("description"),
      targetPlatforms: text("targetPlatforms").notNull(),
      // JSON array of platform IDs
      searchCriteria: text("searchCriteria").notNull(),
      // JSON object with search parameters
      status: mysqlEnum("status", [
        "draft",
        "active",
        "paused",
        "completed",
        "scheduled",
        "archived"
      ]).default("draft").notNull(),
      totalCandidates: int("totalCandidates").default(0).notNull(),
      messagesSent: int("messagesSent").default(0).notNull(),
      responsesReceived: int("responsesReceived").default(0).notNull(),
      // Scheduling fields
      isScheduled: int("isScheduled").default(0).notNull(),
      // 0 = immediate, 1 = scheduled
      scheduledFor: timestamp("scheduledFor"),
      // When to execute the campaign
      isRecurring: int("isRecurring").default(0).notNull(),
      // 0 = one-time, 1 = recurring
      recurringPattern: varchar("recurringPattern", { length: 50 }),
      // daily, weekly, monthly
      lastExecutedAt: timestamp("lastExecutedAt"),
      // Last execution time for recurring campaigns
      nextExecutionAt: timestamp("nextExecutionAt"),
      // Next scheduled execution
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    candidates = mysqlTable("candidates", {
      id: int("id").autoincrement().primaryKey(),
      campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
      platformId: int("platformId").notNull().references(() => platforms.id),
      externalId: varchar("externalId", { length: 255 }),
      // Platform-specific ID
      name: varchar("name", { length: 255 }).notNull(),
      email: varchar("email", { length: 320 }),
      phone: varchar("phone", { length: 50 }),
      profileUrl: text("profileUrl"),
      location: varchar("location", { length: 255 }),
      distance: int("distance"),
      // Distance in km from search location
      experience: text("experience"),
      // JSON array of experience items
      services: text("services"),
      // JSON array of services offered
      availability: text("availability"),
      // JSON object with availability data
      hourlyRate: int("hourlyRate"),
      // Rate in cents
      bio: text("bio"),
      profileData: text("profileData"),
      // JSON object with full profile data
      compatibilityScore: int("compatibilityScore").default(0).notNull(),
      // 0-100
      matchReasons: text("matchReasons"),
      // JSON array of match reasoning
      status: mysqlEnum("status", [
        "discovered",
        "matched",
        "contacted",
        "responded",
        "rejected"
      ]).default("discovered").notNull(),
      discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    messages = mysqlTable("messages", {
      id: int("id").autoincrement().primaryKey(),
      campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      platformId: int("platformId").notNull().references(() => platforms.id),
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
        "rejected"
      ]).default("draft").notNull(),
      externalMessageId: varchar("externalMessageId", { length: 255 }),
      // Platform-specific message ID
      sentAt: timestamp("sentAt"),
      deliveredAt: timestamp("deliveredAt"),
      respondedAt: timestamp("respondedAt"),
      responseContent: text("responseContent"),
      errorMessage: text("errorMessage"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    platformCredentials = mysqlTable("platformCredentials", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      platformId: int("platformId").notNull().references(() => platforms.id, { onDelete: "cascade" }),
      email: varchar("email", { length: 320 }),
      encryptedPassword: text("encryptedPassword"),
      // Encrypted with platform key
      apiKey: text("apiKey"),
      // For API-based platforms
      sessionData: text("sessionData"),
      // JSON object with session cookies/tokens
      isConnected: int("isConnected").default(0).notNull(),
      lastSyncAt: timestamp("lastSyncAt"),
      lastError: text("lastError"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    matchFactors = mysqlTable("matchFactors", {
      id: int("id").autoincrement().primaryKey(),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      factor: varchar("factor", { length: 100 }).notNull(),
      // e.g., "location", "experience", "services"
      score: int("score").notNull(),
      // 0-100
      weight: int("weight").notNull(),
      // Importance weight 0-100
      reasoning: text("reasoning"),
      // AI-generated explanation
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    followUps = mysqlTable("followUps", {
      id: int("id").autoincrement().primaryKey(),
      campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      sequence: int("sequence").notNull(),
      // Follow-up number (1, 2, 3...)
      scheduledAt: timestamp("scheduledAt").notNull(),
      status: mysqlEnum("status", ["scheduled", "sent", "skipped", "cancelled"]).default("scheduled").notNull(),
      messageId: int("messageId").references(() => messages.id),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    candidateIdentities = mysqlTable("candidateIdentities", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      canonicalName: varchar("canonicalName", { length: 255 }).notNull(),
      canonicalEmail: varchar("canonicalEmail", { length: 320 }),
      canonicalPhone: varchar("canonicalPhone", { length: 50 }),
      location: varchar("location", { length: 255 }),
      notes: text("notes"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    candidateSources = mysqlTable("candidateSources", {
      id: int("id").autoincrement().primaryKey(),
      candidateIdentityId: int("candidateIdentityId").notNull().references(() => candidateIdentities.id, { onDelete: "cascade" }),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      platformId: int("platformId").notNull().references(() => platforms.id),
      externalId: varchar("externalId", { length: 255 }),
      profileUrl: text("profileUrl"),
      profileHash: varchar("profileHash", { length: 128 }),
      firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
      lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    campaignReadinessChecks = mysqlTable("campaignReadinessChecks", {
      id: int("id").autoincrement().primaryKey(),
      campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      status: mysqlEnum("status", ["ready", "warning", "blocked"]).notNull(),
      checksJson: text("checksJson").notNull(),
      blockersJson: text("blockersJson"),
      warningsJson: text("warningsJson"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    messageApprovals = mysqlTable("messageApprovals", {
      id: int("id").autoincrement().primaryKey(),
      messageId: int("messageId").notNull().references(() => messages.id, { onDelete: "cascade" }),
      campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      decision: mysqlEnum("decision", ["approved", "rejected"]).notNull(),
      decisionReason: text("decisionReason"),
      approvedContentSnapshot: text("approvedContentSnapshot"),
      approvedSubjectSnapshot: varchar("approvedSubjectSnapshot", { length: 500 }),
      decidedAt: timestamp("decidedAt").defaultNow().notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    messageSendAttempts = mysqlTable("messageSendAttempts", {
      id: int("id").autoincrement().primaryKey(),
      messageId: int("messageId").notNull().references(() => messages.id, { onDelete: "cascade" }),
      campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      platformId: int("platformId").notNull().references(() => platforms.id),
      status: mysqlEnum("status", ["blocked", "started", "succeeded", "failed"]).default("started").notNull(),
      startedAt: timestamp("startedAt").defaultNow().notNull(),
      finishedAt: timestamp("finishedAt"),
      errorMessage: text("errorMessage"),
      externalMessageId: varchar("externalMessageId", { length: 255 }),
      confirmationText: text("confirmationText"),
      retryCount: int("retryCount").default(0).notNull(),
      rateLimitState: text("rateLimitState"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    candidateResponses = mysqlTable("candidateResponses", {
      id: int("id").autoincrement().primaryKey(),
      candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
      messageId: int("messageId").references(() => messages.id, {
        onDelete: "set null"
      }),
      platformId: int("platformId").notNull().references(() => platforms.id),
      rawContent: text("rawContent").notNull(),
      normalizedContent: text("normalizedContent"),
      classification: mysqlEnum("classification", [
        "interested",
        "not_interested",
        "more_info",
        "unavailable",
        "no_response",
        "unknown"
      ]).default("unknown").notNull(),
      confidence: int("confidence").default(0).notNull(),
      receivedAt: timestamp("receivedAt").defaultNow().notNull(),
      source: mysqlEnum("source", ["manual", "platform", "import"]).default("manual").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    candidateQualificationDecisions = mysqlTable(
      "candidateQualificationDecisions",
      {
        id: int("id").autoincrement().primaryKey(),
        candidateId: int("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
        campaignId: int("campaignId").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
        userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
        decision: mysqlEnum("decision", [
          "qualified",
          "not_qualified",
          "needs_review"
        ]).notNull(),
        reason: text("reason").notNull(),
        sensitiveAssumptionsAcknowledged: int("sensitiveAssumptionsAcknowledged").default(0).notNull(),
        createdAt: timestamp("createdAt").defaultNow().notNull()
      }
    );
    candidateDuplicateResolutions = mysqlTable(
      "candidateDuplicateResolutions",
      {
        id: int("id").autoincrement().primaryKey(),
        userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
        targetCandidateId: int("targetCandidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
        sourceCandidateId: int("sourceCandidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
        decision: mysqlEnum("decision", ["merged", "not_duplicate"]).notNull(),
        confidence: int("confidence").default(0).notNull(),
        reasonsJson: text("reasonsJson"),
        decisionReason: text("decisionReason").notNull(),
        resolvedAt: timestamp("resolvedAt").defaultNow().notNull(),
        createdAt: timestamp("createdAt").defaultNow().notNull()
      }
    );
    queueJobRecords = mysqlTable("queueJobRecords", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      campaignId: int("campaignId").references(() => campaigns.id, {
        onDelete: "set null"
      }),
      messageId: int("messageId").references(() => messages.id, {
        onDelete: "set null"
      }),
      queueName: mysqlEnum("queueName", ["messages", "discovery"]).notNull(),
      jobType: varchar("jobType", { length: 100 }).notNull(),
      status: mysqlEnum("status", [
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "cancelled"
      ]).default("waiting").notNull(),
      payloadJson: text("payloadJson"),
      errorMessage: text("errorMessage"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    rateLimitEvents = mysqlTable("rateLimitEvents", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      platformId: int("platformId").references(() => platforms.id, {
        onDelete: "set null"
      }),
      campaignId: int("campaignId").references(() => campaigns.id, {
        onDelete: "set null"
      }),
      eventType: varchar("eventType", { length: 100 }).notNull(),
      severity: mysqlEnum("severity", ["info", "warning", "blocked"]).default("info").notNull(),
      detailJson: text("detailJson"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    credentialEvents = mysqlTable("credentialEvents", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      platformId: int("platformId").notNull().references(() => platforms.id, { onDelete: "cascade" }),
      eventType: mysqlEnum("eventType", [
        "saved",
        "tested",
        "failed",
        "disconnected"
      ]).notNull(),
      status: mysqlEnum("status", ["ok", "warning", "error"]).default("ok").notNull(),
      message: text("message"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    auditEvents = mysqlTable("auditEvents", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      entityType: varchar("entityType", { length: 80 }).notNull(),
      entityId: int("entityId").notNull(),
      campaignId: int("campaignId").references(() => campaigns.id, {
        onDelete: "set null"
      }),
      action: varchar("action", { length: 120 }).notNull(),
      actor: mysqlEnum("actor", ["user", "system"]).default("system").notNull(),
      source: varchar("source", { length: 120 }),
      beforeState: text("beforeState"),
      afterState: text("afterState"),
      riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high"]).default("low").notNull(),
      approvalId: int("approvalId"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    messageSnippets = mysqlTable("messageSnippets", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
      title: varchar("title", { length: 120 }).notNull(),
      body: text("body").notNull(),
      language: mysqlEnum("language", ["nl", "en"]).default("nl").notNull(),
      tonePreset: mysqlEnum("tonePreset", ["careful", "warm", "concise"]).default("careful").notNull(),
      isActive: int("isActive").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
  }
});

// server/_core/env.ts
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
    };
  }
});

// server/services/platformCapabilities.ts
function getPlatformCapability(platformName) {
  const supportsAuthenticatedAutomation = AUTHENTICATED_AUTOMATION_PLATFORMS.has(platformName);
  return {
    supportsAuthenticatedAutomation,
    publicDiscoveryAvailable: true,
    mode: supportsAuthenticatedAutomation ? "authenticated" : "public_only"
  };
}
var AUTHENTICATED_AUTOMATION_PLATFORMS;
var init_platformCapabilities = __esm({
  "server/services/platformCapabilities.ts"() {
    "use strict";
    AUTHENTICATED_AUTOMATION_PLATFORMS = /* @__PURE__ */ new Set(["Nationale Hulpgids"]);
  }
});

// server/services/safeSerialization.ts
function serializeSafeJson(value, options = {}) {
  const maxJsonChars = options.maxJsonChars ?? DEFAULT_MAX_JSON_CHARS;
  const sanitized = sanitizeForJson(value, {
    maxStringChars: options.maxStringChars ?? DEFAULT_MAX_STRING_CHARS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS
  });
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= maxJsonChars)
    return serialized;
  return JSON.stringify({
    truncated: true,
    originalLength: serialized.length,
    preview: serialized.slice(0, maxJsonChars)
  });
}
function truncateOperationalText(value, maxChars = 2e3) {
  if (value == null)
    return void 0;
  const text2 = String(value);
  if (text2.length <= maxChars)
    return text2;
  return `${text2.slice(0, maxChars)}...[truncated]`;
}
function sanitizeForJson(value, options, depth = 0) {
  if (value == null)
    return value;
  if (typeof value === "string") {
    if (value.length <= options.maxStringChars)
      return value;
    return `${value.slice(0, options.maxStringChars)}...[truncated]`;
  }
  if (typeof value === "number")
    return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean")
    return value;
  if (typeof value === "bigint")
    return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return void 0;
  }
  if (value instanceof Date)
    return value.toISOString();
  if (depth >= options.maxDepth) {
    return "[max depth exceeded]";
  }
  if (Array.isArray(value)) {
    const entries = value.slice(0, options.maxArrayItems).map((entry) => sanitizeForJson(entry, options, depth + 1));
    if (value.length > options.maxArrayItems) {
      entries.push(`[${value.length - options.maxArrayItems} items truncated]`);
    }
    return entries;
  }
  if (typeof value === "object") {
    const result = {};
    const entries = Object.entries(value);
    for (const [key, entryValue] of entries.slice(0, options.maxObjectKeys)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[redacted]";
      } else {
        const sanitizedValue = sanitizeForJson(entryValue, options, depth + 1);
        if (sanitizedValue !== void 0)
          result[key] = sanitizedValue;
      }
    }
    if (entries.length > options.maxObjectKeys) {
      result.__truncatedKeys = entries.length - options.maxObjectKeys;
    }
    return result;
  }
  return String(value);
}
var DEFAULT_MAX_JSON_CHARS, DEFAULT_MAX_STRING_CHARS, DEFAULT_MAX_DEPTH, DEFAULT_MAX_ARRAY_ITEMS, DEFAULT_MAX_OBJECT_KEYS, SENSITIVE_KEY_PATTERN;
var init_safeSerialization = __esm({
  "server/services/safeSerialization.ts"() {
    "use strict";
    DEFAULT_MAX_JSON_CHARS = 12e3;
    DEFAULT_MAX_STRING_CHARS = 1e3;
    DEFAULT_MAX_DEPTH = 6;
    DEFAULT_MAX_ARRAY_ITEMS = 50;
    DEFAULT_MAX_OBJECT_KEYS = 50;
    SENSITIVE_KEY_PATTERN = /(^|[_-])(password|passphrase|secret|token|cookie|session|api[-_]?key|authorization|credential|csrf|private[-_]?key)([_-]|$)|encryptedPassword|sessionData|messageContent|responseContent|rawContent|normalizedContent|approvedContentSnapshot|content$/i;
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  archiveCampaign: () => archiveCampaign,
  archiveMessageSnippet: () => archiveMessageSnippet,
  bulkUpdateMessageStatus: () => bulkUpdateMessageStatus,
  cancelQueueJobRecord: () => cancelQueueJobRecord,
  createAuditEvent: () => createAuditEvent,
  createCampaign: () => createCampaign,
  createCandidate: () => createCandidate,
  createCandidateDuplicateResolution: () => createCandidateDuplicateResolution,
  createCandidateQualificationDecision: () => createCandidateQualificationDecision,
  createCandidateResponse: () => createCandidateResponse,
  createFollowUp: () => createFollowUp,
  createMatchFactor: () => createMatchFactor,
  createMessage: () => createMessage,
  createMessageApproval: () => createMessageApproval,
  createMessageSendAttempt: () => createMessageSendAttempt,
  createMessageSnippet: () => createMessageSnippet,
  createQueueJobRecord: () => createQueueJobRecord,
  createRateLimitEvent: () => createRateLimitEvent,
  deleteCampaign: () => deleteCampaign,
  getActiveFollowUpDraftForCandidate: () => getActiveFollowUpDraftForCandidate,
  getActiveMessageSnippets: () => getActiveMessageSnippets,
  getAllMessages: () => getAllMessages,
  getAllPlatforms: () => getAllPlatforms,
  getAuditEventsForCampaign: () => getAuditEventsForCampaign,
  getAuditEventsForEntity: () => getAuditEventsForEntity,
  getCampaignById: () => getCampaignById,
  getCampaignCandidates: () => getCampaignCandidates,
  getCampaignMessages: () => getCampaignMessages,
  getCampaignStats: () => getCampaignStats,
  getCandidateById: () => getCandidateById,
  getCandidateDuplicateGroups: () => getCandidateDuplicateGroups,
  getCandidateDuplicateReviewQueue: () => getCandidateDuplicateReviewQueue,
  getCandidateIdentityContext: () => getCandidateIdentityContext,
  getCandidateMatchFactors: () => getCandidateMatchFactors,
  getCandidateMessages: () => getCandidateMessages,
  getCandidatePotentialDuplicates: () => getCandidatePotentialDuplicates,
  getCandidateQualificationDecisionsByCandidateId: () => getCandidateQualificationDecisionsByCandidateId,
  getCandidateQualificationDecisionsForCampaign: () => getCandidateQualificationDecisionsForCampaign,
  getCandidateResponseById: () => getCandidateResponseById,
  getCandidateResponsesByCandidateId: () => getCandidateResponsesByCandidateId,
  getCandidateResponsesForCampaign: () => getCandidateResponsesForCampaign,
  getCandidateResponsesForUser: () => getCandidateResponsesForUser,
  getCredentialEvents: () => getCredentialEvents,
  getCredentialStatus: () => getCredentialStatus,
  getDb: () => getDb,
  getDueFollowUps: () => getDueFollowUps,
  getEngagementMetrics: () => getEngagementMetrics,
  getFollowUpById: () => getFollowUpById,
  getFollowUpSuggestions: () => getFollowUpSuggestions,
  getFollowUpsForCandidate: () => getFollowUpsForCandidate,
  getLatestCampaignReadinessCheck: () => getLatestCampaignReadinessCheck,
  getMessageApprovalsByMessageId: () => getMessageApprovalsByMessageId,
  getMessageApprovalsForCampaign: () => getMessageApprovalsForCampaign,
  getMessageSendAttemptsForCampaign: () => getMessageSendAttemptsForCampaign,
  getMessageSendAttemptsForCandidate: () => getMessageSendAttemptsForCandidate,
  getMessageSnippetById: () => getMessageSnippetById,
  getOrCreateCandidateIdentity: () => getOrCreateCandidateIdentity,
  getPlatformById: () => getPlatformById,
  getPlatformByName: () => getPlatformByName,
  getPlatformCredential: () => getPlatformCredential,
  getQueueHealthSummary: () => getQueueHealthSummary,
  getQueueJobRecordForUser: () => getQueueJobRecordForUser,
  getQueueJobRecords: () => getQueueJobRecords,
  getRateLimitEventsForCampaign: () => getRateLimitEventsForCampaign,
  getUserByOpenId: () => getUserByOpenId,
  getUserCampaigns: () => getUserCampaigns,
  getUserCandidates: () => getUserCandidates,
  getUserPlatformCredentials: () => getUserPlatformCredentials,
  mergeCandidateIdentitySources: () => mergeCandidateIdentitySources,
  recordCampaignReadinessCheck: () => recordCampaignReadinessCheck,
  recordCredentialEvent: () => recordCredentialEvent,
  resolvePlatformIdentity: () => resolvePlatformIdentity,
  searchUserCandidatePickerOptions: () => searchUserCandidatePickerOptions,
  updateCampaign: () => updateCampaign,
  updateCandidate: () => updateCandidate,
  updateCandidateResponseClassification: () => updateCandidateResponseClassification,
  updateFollowUpStatus: () => updateFollowUpStatus,
  updateMessage: () => updateMessage,
  updateMessageResponse: () => updateMessageResponse,
  updateMessageStatus: () => updateMessageStatus,
  updateQueueJobRecord: () => updateQueueJobRecord,
  upsertPlatformCredential: () => upsertPlatformCredential,
  upsertUser: () => upsertUser
});
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function getLocalStorePath() {
  const localDataDir = process.env.LOCAL_DATA_DIR || (process.env.NODE_ENV === "test" || process.env.VITEST ? path.resolve(process.cwd(), ".test-local-data") : path.join(
    process.env.APPDATA || os.tmpdir(),
    "NationaleHulpgidsReachOut"
  ));
  return path.join(localDataDir, "local-store.json");
}
function reviveDates(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => reviveDates(entry));
  }
  if (!value || typeof value !== "object")
    return value;
  const record = value;
  for (const [key, fieldValue] of Object.entries(record)) {
    if (fieldValue && typeof fieldValue === "object") {
      record[key] = reviveDates(fieldValue);
    } else if (dateFields.has(key) && typeof fieldValue === "string") {
      record[key] = new Date(fieldValue);
    }
  }
  return value;
}
function createEmptyLocalStore() {
  return {
    users: [],
    platforms: DEFAULT_PLATFORMS.map((platform) => ({ ...platform })),
    campaigns: [],
    candidates: [],
    messages: [],
    platformCredentials: [],
    matchFactors: [],
    followUps: [],
    candidateIdentities: [],
    candidateSources: [],
    campaignReadinessChecks: [],
    messageApprovals: [],
    messageSendAttempts: [],
    candidateResponses: [],
    candidateQualificationDecisions: [],
    candidateDuplicateResolutions: [],
    queueJobRecords: [],
    rateLimitEvents: [],
    credentialEvents: [],
    auditEvents: [],
    messageSnippets: [],
    nextIds: {
      user: 1,
      campaign: 1,
      candidate: 1,
      message: 1,
      platformCredential: 1,
      matchFactor: 1,
      followUp: 1,
      candidateIdentity: 1,
      candidateSource: 1,
      campaignReadinessCheck: 1,
      messageApproval: 1,
      messageSendAttempt: 1,
      candidateResponse: 1,
      candidateQualificationDecision: 1,
      candidateDuplicateResolution: 1,
      queueJobRecord: 1,
      rateLimitEvent: 1,
      credentialEvent: 1,
      auditEvent: 1,
      messageSnippet: 1
    }
  };
}
function getLocalStore() {
  if (localStore)
    return localStore;
  const storePath = getLocalStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const parsed = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      const loadedStore = reviveDates({
        ...createEmptyLocalStore(),
        ...parsed
      });
      loadedStore.nextIds = {
        ...createEmptyLocalStore().nextIds,
        ...parsed.nextIds ?? {}
      };
      loadedStore.platforms = DEFAULT_PLATFORMS.map((platform) => {
        return loadedStore.platforms.find((stored) => stored.name === platform.name) ?? platform;
      });
      localStore = loadedStore;
      return loadedStore;
    }
  } catch (error) {
    console.warn(
      "[Database] Failed to read local store, starting empty:",
      error
    );
  }
  localStore = createEmptyLocalStore();
  return localStore;
}
function persistLocalStore() {
  const store = getLocalStore();
  const storePath = getLocalStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
}
function nextLocalId(key) {
  const store = getLocalStore();
  const id = store.nextIds[key];
  store.nextIds[key] += 1;
  return id;
}
function createLocalUser(user) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: nextLocalId("user"),
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
    lastSignedIn: user.lastSignedIn ?? now
  };
}
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const existing = store.users.find(
      (storedUser) => storedUser.openId === user.openId
    );
    if (existing) {
      Object.assign(existing, {
        name: user.name ?? existing.name,
        email: user.email ?? existing.email,
        loginMethod: user.loginMethod ?? existing.loginMethod,
        role: user.role ?? existing.role,
        lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      });
    } else {
      store.users.push(createLocalUser(user));
    }
    persistLocalStore();
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0)
        return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().users.find((user) => user.openId === openId);
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getAllPlatforms() {
  const db = await getDb();
  if (!db)
    return getLocalStore().platforms.filter(
      (platform) => platform.isActive === 1
    );
  const configuredPlatforms = await db.select().from(platforms).where(eq(platforms.isActive, 1));
  if (configuredPlatforms.length > 0)
    return configuredPlatforms;
  try {
    for (const platform of DEFAULT_PLATFORM_INSERTS) {
      await db.insert(platforms).values(platform).onDuplicateKeyUpdate({
        set: {
          baseUrl: platform.baseUrl,
          authType: platform.authType,
          isActive: platform.isActive
        }
      });
    }
    return db.select().from(platforms).where(eq(platforms.isActive, 1));
  } catch (error) {
    console.warn("[Database] Failed to seed default platforms:", error);
    return DEFAULT_PLATFORMS;
  }
}
async function getPlatformById(id) {
  const db = await getDb();
  if (!db)
    return getLocalStore().platforms.find((platform) => platform.id === id);
  const result = await db.select().from(platforms).where(eq(platforms.id, id)).limit(1);
  return result[0];
}
async function getPlatformByName(name) {
  const normalizedName = name.trim().toLowerCase();
  const allPlatforms = await getAllPlatforms();
  return allPlatforms.find(
    (platform) => platform.name.trim().toLowerCase() === normalizedName
  );
}
async function resolvePlatformIdentity(input) {
  const platformById = input.platformId != null ? await getPlatformById(input.platformId) : null;
  const platformByName = input.platformName ? await getPlatformByName(input.platformName) : null;
  if (platformById && platformByName && platformById.id !== platformByName.id) {
    throw new Error(
      `Platform mismatch: platformId ${platformById.id} is ${platformById.name}, not ${platformByName.name}`
    );
  }
  return platformById ?? platformByName ?? null;
}
async function getUserCampaigns(userId) {
  const db = await getDb();
  if (!db)
    return getLocalStore().campaigns.filter((campaign) => campaign.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
}
async function getCampaignById(id) {
  const db = await getDb();
  if (!db)
    return getLocalStore().campaigns.find((campaign) => campaign.id === id);
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}
async function createCampaign(campaign) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localCampaign = {
      id: nextLocalId("campaign"),
      userId: campaign.userId,
      title: campaign.title,
      description: campaign.description ?? null,
      targetPlatforms: campaign.targetPlatforms,
      searchCriteria: campaign.searchCriteria,
      status: campaign.status ?? "draft",
      totalCandidates: campaign.totalCandidates ?? 0,
      messagesSent: campaign.messagesSent ?? 0,
      responsesReceived: campaign.responsesReceived ?? 0,
      isScheduled: campaign.isScheduled ?? 0,
      scheduledFor: campaign.scheduledFor ?? null,
      isRecurring: campaign.isRecurring ?? 0,
      recurringPattern: campaign.recurringPattern ?? null,
      lastExecutedAt: campaign.lastExecutedAt ?? null,
      nextExecutionAt: campaign.nextExecutionAt ?? null,
      createdAt: campaign.createdAt ?? now,
      updatedAt: campaign.updatedAt ?? now
    };
    getLocalStore().campaigns.push(localCampaign);
    persistLocalStore();
    return localCampaign.id;
  }
  const result = await db.insert(campaigns).values(campaign);
  return Number(result[0].insertId);
}
async function updateCampaign(id, updates) {
  const db = await getDb();
  if (!db) {
    const campaign = getLocalStore().campaigns.find((entry) => entry.id === id);
    if (!campaign)
      throw new Error("Campaign not found");
    Object.assign(campaign, updates, { updatedAt: /* @__PURE__ */ new Date() });
    persistLocalStore();
    return;
  }
  await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
}
async function archiveCampaign(id, userId) {
  const campaign = await getCampaignById(id);
  if (!campaign || campaign.userId !== userId) {
    throw new Error("Campaign not found");
  }
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    getLocalStore().followUps.filter(
      (followUp) => followUp.campaignId === id && followUp.status === "scheduled"
    ).forEach((followUp) => {
      followUp.status = "cancelled";
      followUp.updatedAt = now;
    });
  } else {
    await db.update(followUps).set({ status: "cancelled" }).where(
      and(eq(followUps.campaignId, id), eq(followUps.status, "scheduled"))
    );
  }
  await updateCampaign(id, {
    status: "archived",
    isScheduled: 0,
    nextExecutionAt: null
  });
  return campaign;
}
async function deleteCampaign(id, userId) {
  const db = await getDb();
  const campaign = await getCampaignById(id);
  if (!campaign || campaign.userId !== userId) {
    throw new Error("Campaign not found");
  }
  if (!db) {
    const store = getLocalStore();
    const campaignCandidateIds = new Set(
      store.candidates.filter((candidate) => candidate.campaignId === id).map((candidate) => candidate.id)
    );
    store.messages = store.messages.filter(
      (message) => message.campaignId !== id
    );
    store.candidateDuplicateResolutions = store.candidateDuplicateResolutions.filter(
      (resolution) => !campaignCandidateIds.has(resolution.targetCandidateId) && !campaignCandidateIds.has(resolution.sourceCandidateId)
    );
    store.candidates = store.candidates.filter(
      (candidate) => candidate.campaignId !== id
    );
    store.campaignReadinessChecks = store.campaignReadinessChecks.filter(
      (check) => check.campaignId !== id
    );
    store.followUps = store.followUps.filter(
      (followUp) => followUp.campaignId !== id
    );
    store.messageApprovals = store.messageApprovals.filter(
      (approval) => approval.campaignId !== id
    );
    store.messageSendAttempts = store.messageSendAttempts.filter(
      (attempt) => attempt.campaignId !== id
    );
    store.candidateQualificationDecisions = store.candidateQualificationDecisions.filter(
      (decision) => decision.campaignId !== id
    );
    store.queueJobRecords = store.queueJobRecords.filter(
      (job) => job.campaignId !== id
    );
    store.rateLimitEvents = store.rateLimitEvents.filter(
      (event) => event.campaignId !== id
    );
    store.auditEvents = store.auditEvents.filter(
      (event) => event.campaignId !== id
    );
    store.campaigns = store.campaigns.filter(
      (entry) => entry.id !== id || entry.userId !== userId
    );
    persistLocalStore();
    return;
  }
  await db.delete(auditEvents).where(eq(auditEvents.campaignId, id));
  await db.delete(rateLimitEvents).where(eq(rateLimitEvents.campaignId, id));
  await db.delete(queueJobRecords).where(eq(queueJobRecords.campaignId, id));
  await db.delete(messageSendAttempts).where(eq(messageSendAttempts.campaignId, id));
  await db.delete(candidateQualificationDecisions).where(eq(candidateQualificationDecisions.campaignId, id));
  await db.delete(messageApprovals).where(eq(messageApprovals.campaignId, id));
  await db.delete(campaignReadinessChecks).where(eq(campaignReadinessChecks.campaignId, id));
  await db.delete(followUps).where(eq(followUps.campaignId, id));
  await db.delete(messages).where(eq(messages.campaignId, id));
  await db.delete(candidates).where(eq(candidates.campaignId, id));
  await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
}
async function getCampaignCandidates(campaignId) {
  const db = await getDb();
  if (!db) {
    const campaignCandidates2 = getLocalStore().candidates.filter((candidate) => candidate.campaignId === campaignId).sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    const qualificationSummaries2 = await getLatestCandidateQualificationSummariesByCandidateId(
      campaignCandidates2.map((candidate) => candidate.id)
    );
    return campaignCandidates2.map((candidate) => ({
      ...candidate,
      latestQualificationDecision: qualificationSummaries2.get(candidate.id) ?? null
    }));
  }
  const campaignCandidates = await db.select().from(candidates).where(eq(candidates.campaignId, campaignId)).orderBy(desc(candidates.compatibilityScore));
  const qualificationSummaries = await getLatestCandidateQualificationSummariesByCandidateId(
    campaignCandidates.map((candidate) => candidate.id)
  );
  return campaignCandidates.map((candidate) => ({
    ...candidate,
    latestQualificationDecision: qualificationSummaries.get(candidate.id) ?? null
  }));
}
async function getCandidateById(id) {
  const db = await getDb();
  if (!db)
    return getLocalStore().candidates.find((candidate) => candidate.id === id);
  const result = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  return result[0];
}
function toCandidateQualificationDecisionSummary(decision) {
  return {
    id: decision.id,
    candidateId: decision.candidateId,
    campaignId: decision.campaignId,
    userId: decision.userId,
    decision: decision.decision,
    sensitiveAssumptionsAcknowledged: Boolean(
      decision.sensitiveAssumptionsAcknowledged
    ),
    createdAt: decision.createdAt
  };
}
async function getLatestCandidateQualificationSummariesByCandidateId(candidateIds) {
  const summariesByCandidateId = /* @__PURE__ */ new Map();
  const uniqueCandidateIds = Array.from(new Set(candidateIds));
  if (uniqueCandidateIds.length === 0)
    return summariesByCandidateId;
  const db = await getDb();
  const decisions = db ? await db.select().from(candidateQualificationDecisions).where(
    inArray(
      candidateQualificationDecisions.candidateId,
      uniqueCandidateIds
    )
  ).orderBy(desc(candidateQualificationDecisions.createdAt)) : getLocalStore().candidateQualificationDecisions.filter(
    (decision) => uniqueCandidateIds.includes(decision.candidateId)
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const decision of decisions) {
    if (summariesByCandidateId.has(decision.candidateId))
      continue;
    summariesByCandidateId.set(
      decision.candidateId,
      toCandidateQualificationDecisionSummary(decision)
    );
  }
  return summariesByCandidateId;
}
async function getCandidateIdentityIdsByCandidateId(candidateIds, userId) {
  const identityIdsByCandidateId = /* @__PURE__ */ new Map();
  const uniqueCandidateIds = Array.from(new Set(candidateIds));
  if (uniqueCandidateIds.length === 0)
    return identityIdsByCandidateId;
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    for (const source of store.candidateSources) {
      if (!uniqueCandidateIds.includes(source.candidateId))
        continue;
      const identity = store.candidateIdentities.find(
        (entry) => entry.id === source.candidateIdentityId
      );
      if (identity?.userId !== userId)
        continue;
      identityIdsByCandidateId.set(source.candidateId, identity.id);
    }
    return identityIdsByCandidateId;
  }
  const rows = await db.select({
    candidateId: candidateSources.candidateId,
    identityId: candidateSources.candidateIdentityId,
    userId: candidateIdentities.userId
  }).from(candidateSources).leftJoin(
    candidateIdentities,
    eq(candidateSources.candidateIdentityId, candidateIdentities.id)
  ).where(inArray(candidateSources.candidateId, uniqueCandidateIds));
  for (const row of rows) {
    if (row.userId !== userId)
      continue;
    identityIdsByCandidateId.set(row.candidateId, row.identityId);
  }
  return identityIdsByCandidateId;
}
async function getCandidateDuplicateListSummariesByCandidateId(userCandidates, userId) {
  const summariesByCandidateId = /* @__PURE__ */ new Map();
  for (const candidate of userCandidates) {
    summariesByCandidateId.set(candidate.id, {
      unresolvedCount: 0,
      highestConfidence: 0,
      reasons: [],
      candidateIds: []
    });
  }
  if (userCandidates.length <= 1)
    return summariesByCandidateId;
  const identityIdsByCandidateId = await getCandidateIdentityIdsByCandidateId(
    userCandidates.map((candidate) => candidate.id),
    userId
  );
  const resolvedPairKeys = await getResolvedCandidateDuplicatePairKeys(userId);
  const duplicateMatchesByCandidateId = /* @__PURE__ */ new Map();
  const signalBuckets = /* @__PURE__ */ new Map();
  for (const candidate of userCandidates) {
    const normalized = normalizeDuplicateCandidate(candidate);
    const signals = [];
    if (normalized.email) {
      signals.push({
        key: `email:${normalized.email}`,
        confidence: 100,
        reason: "same email"
      });
    }
    if (normalized.phone) {
      signals.push({
        key: `phone:${normalized.phone}`,
        confidence: 95,
        reason: "same phone"
      });
    }
    if (normalized.profileUrl) {
      signals.push({
        key: `profile:${normalized.profileUrl}`,
        confidence: 90,
        reason: "same profile URL"
      });
    }
    if (normalized.name && normalized.location) {
      signals.push({
        key: `name-location:${normalized.name}|${normalized.location}`,
        confidence: 70,
        reason: "same name and location"
      });
    }
    for (const signal of signals) {
      const bucket = signalBuckets.get(signal.key) ?? {
        confidence: signal.confidence,
        reason: signal.reason,
        candidateIds: []
      };
      bucket.candidateIds.push(candidate.id);
      signalBuckets.set(signal.key, bucket);
    }
  }
  const addMatch = (candidateId, otherCandidateId, confidence, reason) => {
    const candidateIdentityId = identityIdsByCandidateId.get(candidateId);
    const otherIdentityId = identityIdsByCandidateId.get(otherCandidateId);
    if (candidateIdentityId && otherIdentityId && candidateIdentityId === otherIdentityId) {
      return;
    }
    const candidateMatches = duplicateMatchesByCandidateId.get(candidateId) ?? /* @__PURE__ */ new Map();
    if (resolvedPairKeys.has(candidateDuplicatePairKey(candidateId, otherCandidateId))) {
      return;
    }
    const match = candidateMatches.get(otherCandidateId) ?? {
      confidence: 0,
      reasons: /* @__PURE__ */ new Set()
    };
    match.confidence = Math.max(match.confidence, confidence);
    match.reasons.add(reason);
    candidateMatches.set(otherCandidateId, match);
    duplicateMatchesByCandidateId.set(candidateId, candidateMatches);
  };
  for (const bucket of Array.from(signalBuckets.values())) {
    if (bucket.candidateIds.length <= 1)
      continue;
    for (const candidateId of bucket.candidateIds) {
      for (const otherCandidateId of bucket.candidateIds) {
        if (candidateId === otherCandidateId)
          continue;
        addMatch(
          candidateId,
          otherCandidateId,
          bucket.confidence,
          bucket.reason
        );
      }
    }
  }
  for (const [candidateId, matches] of Array.from(
    duplicateMatchesByCandidateId.entries()
  )) {
    const reasons = /* @__PURE__ */ new Set();
    let highestConfidence = 0;
    for (const match of Array.from(matches.values())) {
      highestConfidence = Math.max(highestConfidence, match.confidence);
      Array.from(match.reasons).forEach(
        (reason) => reasons.add(reason)
      );
    }
    summariesByCandidateId.set(candidateId, {
      unresolvedCount: matches.size,
      highestConfidence,
      reasons: Array.from(reasons).sort(),
      candidateIds: Array.from(matches.keys()).sort(
        (a, b) => a - b
      )
    });
  }
  return summariesByCandidateId;
}
async function getUserCandidates(userId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns.filter((campaign) => campaign.userId === userId).map((campaign) => campaign.id)
    );
    const userCandidates2 = store.candidates.filter((candidate) => campaignIds.has(candidate.campaignId)).sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    const qualificationSummaries2 = await getLatestCandidateQualificationSummariesByCandidateId(
      userCandidates2.map((candidate) => candidate.id)
    );
    const duplicateSummaries2 = await getCandidateDuplicateListSummariesByCandidateId(
      userCandidates2,
      userId
    );
    return userCandidates2.map((candidate) => ({
      ...candidate,
      campaign: store.campaigns.find(
        (campaign) => campaign.id === candidate.campaignId
      ) ?? null,
      platform: store.platforms.find(
        (platform) => platform.id === candidate.platformId
      ) ?? null,
      latestQualificationDecision: qualificationSummaries2.get(candidate.id) ?? null,
      duplicateSummary: duplicateSummaries2.get(candidate.id) ?? {
        unresolvedCount: 0,
        highestConfidence: 0,
        reasons: [],
        candidateIds: []
      }
    }));
  }
  const userCandidates = await db.select({
    id: candidates.id,
    campaignId: candidates.campaignId,
    platformId: candidates.platformId,
    externalId: candidates.externalId,
    name: candidates.name,
    email: candidates.email,
    phone: candidates.phone,
    profileUrl: candidates.profileUrl,
    location: candidates.location,
    distance: candidates.distance,
    experience: candidates.experience,
    services: candidates.services,
    availability: candidates.availability,
    hourlyRate: candidates.hourlyRate,
    bio: candidates.bio,
    profileData: candidates.profileData,
    compatibilityScore: candidates.compatibilityScore,
    matchReasons: candidates.matchReasons,
    status: candidates.status,
    discoveredAt: candidates.discoveredAt,
    updatedAt: candidates.updatedAt,
    campaign: {
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status
    },
    platform: {
      id: platforms.id,
      name: platforms.name
    }
  }).from(candidates).leftJoin(campaigns, eq(candidates.campaignId, campaigns.id)).leftJoin(platforms, eq(candidates.platformId, platforms.id)).where(eq(campaigns.userId, userId)).orderBy(desc(candidates.compatibilityScore));
  const qualificationSummaries = await getLatestCandidateQualificationSummariesByCandidateId(
    userCandidates.map((candidate) => candidate.id)
  );
  const duplicateSummaries = await getCandidateDuplicateListSummariesByCandidateId(
    userCandidates,
    userId
  );
  return userCandidates.map((candidate) => ({
    ...candidate,
    latestQualificationDecision: qualificationSummaries.get(candidate.id) ?? null,
    duplicateSummary: duplicateSummaries.get(candidate.id) ?? {
      unresolvedCount: 0,
      highestConfidence: 0,
      reasons: [],
      candidateIds: []
    }
  }));
}
async function searchUserCandidatePickerOptions(userId, options) {
  const normalizedSearch = options?.search?.trim().toLowerCase();
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns.filter((campaign) => campaign.userId === userId).filter(
        (campaign) => !options?.campaignId || campaign.id === options.campaignId
      ).map((campaign) => campaign.id)
    );
    return store.candidates.filter((candidate) => campaignIds.has(candidate.campaignId)).filter((candidate) => {
      if (!normalizedSearch)
        return true;
      const haystack = [
        candidate.name,
        candidate.email,
        candidate.location,
        candidate.profileUrl
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    }).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      campaignId: candidate.campaignId,
      compatibilityScore: candidate.compatibilityScore,
      status: candidate.status,
      campaign: store.campaigns.find(
        (campaign) => campaign.id === candidate.campaignId
      ) ?? null,
      platform: store.platforms.find(
        (platform) => platform.id === candidate.platformId
      ) ?? null
    }));
  }
  const conditions = [eq(campaigns.userId, userId)];
  if (options?.campaignId) {
    conditions.push(eq(campaigns.id, options.campaignId));
  }
  if (normalizedSearch) {
    const pattern = `%${normalizedSearch}%`;
    conditions.push(sql`(
      lower(${candidates.name}) like ${pattern}
      or lower(${candidates.email}) like ${pattern}
      or lower(${candidates.location}) like ${pattern}
      or lower(${candidates.profileUrl}) like ${pattern}
    )`);
  }
  return db.select({
    id: candidates.id,
    name: candidates.name,
    campaignId: candidates.campaignId,
    compatibilityScore: candidates.compatibilityScore,
    status: candidates.status,
    campaign: {
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status
    },
    platform: {
      id: platforms.id,
      name: platforms.name
    }
  }).from(candidates).leftJoin(campaigns, eq(candidates.campaignId, campaigns.id)).leftJoin(platforms, eq(candidates.platformId, platforms.id)).where(and(...conditions)).orderBy(desc(candidates.updatedAt)).limit(limit);
}
async function getCandidateDuplicateReviewQueue(userId, options) {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const db = await getDb();
  let userCandidates;
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns.filter((campaign) => campaign.userId === userId).map((campaign) => campaign.id)
    );
    userCandidates = store.candidates.filter((candidate) => campaignIds.has(candidate.campaignId)).map((candidate) => ({
      ...candidate,
      campaign: store.campaigns.find(
        (campaign) => campaign.id === candidate.campaignId
      ) ?? null,
      platform: store.platforms.find(
        (platform) => platform.id === candidate.platformId
      ) ?? null
    }));
  } else {
    userCandidates = await db.select({
      id: candidates.id,
      campaignId: candidates.campaignId,
      platformId: candidates.platformId,
      externalId: candidates.externalId,
      name: candidates.name,
      email: candidates.email,
      phone: candidates.phone,
      profileUrl: candidates.profileUrl,
      location: candidates.location,
      distance: candidates.distance,
      experience: candidates.experience,
      services: candidates.services,
      availability: candidates.availability,
      hourlyRate: candidates.hourlyRate,
      bio: candidates.bio,
      profileData: candidates.profileData,
      compatibilityScore: candidates.compatibilityScore,
      matchReasons: candidates.matchReasons,
      status: candidates.status,
      discoveredAt: candidates.discoveredAt,
      updatedAt: candidates.updatedAt,
      campaign: {
        id: campaigns.id,
        title: campaigns.title,
        status: campaigns.status
      },
      platform: {
        id: platforms.id,
        name: platforms.name
      }
    }).from(candidates).leftJoin(campaigns, eq(candidates.campaignId, campaigns.id)).leftJoin(platforms, eq(candidates.platformId, platforms.id)).where(eq(campaigns.userId, userId));
  }
  const identityIdsByCandidateId = await getCandidateIdentityIdsByCandidateId(
    userCandidates.map((candidate) => candidate.id),
    userId
  );
  const resolvedPairKeys = await getResolvedCandidateDuplicatePairKeys(userId);
  const candidatesById = new Map(
    userCandidates.map((candidate) => [candidate.id, candidate])
  );
  const pairMatches = /* @__PURE__ */ new Map();
  const signalBuckets = /* @__PURE__ */ new Map();
  for (const candidate of userCandidates) {
    const normalized = normalizeDuplicateCandidate(candidate);
    const signals = [];
    if (normalized.email) {
      signals.push({
        key: `email:${normalized.email}`,
        confidence: 100,
        reason: "same email"
      });
    }
    if (normalized.phone) {
      signals.push({
        key: `phone:${normalized.phone}`,
        confidence: 95,
        reason: "same phone"
      });
    }
    if (normalized.profileUrl) {
      signals.push({
        key: `profile:${normalized.profileUrl}`,
        confidence: 90,
        reason: "same profile URL"
      });
    }
    if (normalized.name && normalized.location) {
      signals.push({
        key: `name-location:${normalized.name}|${normalized.location}`,
        confidence: 70,
        reason: "same name and location"
      });
    }
    for (const signal of signals) {
      const bucket = signalBuckets.get(signal.key) ?? {
        confidence: signal.confidence,
        reason: signal.reason,
        candidateIds: []
      };
      bucket.candidateIds.push(candidate.id);
      signalBuckets.set(signal.key, bucket);
    }
  }
  const addPair = (candidateAId, candidateBId, confidence, reason) => {
    const candidateAIdentityId = identityIdsByCandidateId.get(candidateAId);
    const candidateBIdentityId = identityIdsByCandidateId.get(candidateBId);
    if (candidateAIdentityId && candidateBIdentityId && candidateAIdentityId === candidateBIdentityId) {
      return;
    }
    const pairKey = candidateDuplicatePairKey(candidateAId, candidateBId);
    if (resolvedPairKeys.has(pairKey))
      return;
    const orderedIds = pairKey.split(":").map((value) => Number(value));
    const pair = pairMatches.get(pairKey) ?? {
      candidateAId: orderedIds[0],
      candidateBId: orderedIds[1],
      confidence: 0,
      reasons: /* @__PURE__ */ new Set()
    };
    pair.confidence = Math.max(pair.confidence, confidence);
    pair.reasons.add(reason);
    pairMatches.set(pairKey, pair);
  };
  for (const bucket of Array.from(signalBuckets.values())) {
    const uniqueCandidateIds = Array.from(new Set(bucket.candidateIds));
    if (uniqueCandidateIds.length <= 1)
      continue;
    for (let index = 0; index < uniqueCandidateIds.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < uniqueCandidateIds.length; otherIndex += 1) {
        addPair(
          uniqueCandidateIds[index],
          uniqueCandidateIds[otherIndex],
          bucket.confidence,
          bucket.reason
        );
      }
    }
  }
  const toReviewCandidate = (candidate) => ({
    id: candidate.id,
    name: candidate.name,
    campaignId: candidate.campaignId,
    compatibilityScore: candidate.compatibilityScore,
    status: candidate.status,
    location: candidate.location,
    campaign: candidate.campaign,
    platform: candidate.platform
  });
  const buildDuplicateReviewExplanation = (pair, targetCandidate, sourceCandidate) => {
    const reasons = Array.from(pair.reasons).sort();
    const hasStrongIdentifier = reasons.some(
      (reason) => ["same email", "same phone", "same profile URL"].includes(reason)
    );
    const onlyWeakProfileSignal = reasons.length > 0 && reasons.every((reason) => reason === "same name and location");
    const samePlatform = targetCandidate.platformId === sourceCandidate.platformId;
    const sameCampaign = targetCandidate.campaignId === sourceCandidate.campaignId;
    const targetLocation = targetCandidate.location?.trim().toLowerCase();
    const sourceLocation = sourceCandidate.location?.trim().toLowerCase();
    const hasDifferentKnownLocations = !!targetLocation && !!sourceLocation && targetLocation !== sourceLocation;
    const falsePositiveSignals = [];
    if (onlyWeakProfileSignal) {
      falsePositiveSignals.push(
        "Only name and location matched; this can be a different person with a similar profile."
      );
    }
    if (hasDifferentKnownLocations) {
      falsePositiveSignals.push(
        "The visible locations differ, so inspect both profiles before merging."
      );
    }
    if (!samePlatform) {
      falsePositiveSignals.push(
        "Profiles came from different platforms; details may be copied or incomplete."
      );
    }
    if (!sameCampaign) {
      falsePositiveSignals.push(
        "Profiles belong to different campaigns; confirm the campaign context still points to the same helper."
      );
    }
    const riskLevel = pair.confidence >= 95 && hasStrongIdentifier ? "high" : pair.confidence >= 80 ? "medium" : "low";
    const recommendedAction = riskLevel === "high" && falsePositiveSignals.length === 0 ? "merge_if_same_person" : "manual_review";
    return {
      summary: recommendedAction === "merge_if_same_person" ? "Strong redacted identity signals matched. Open both ledgers and merge only after confirming they describe the same person." : "Review manually before deciding. The duplicate signal is useful, but it is not enough for an automatic identity merge.",
      recommendedAction,
      riskLevel,
      whyShown: reasons.map((reason) => {
        if (reason === "same email") {
          return "The normalized email values matched; the raw email is hidden.";
        }
        if (reason === "same phone") {
          return "The normalized phone values matched; the raw phone number is hidden.";
        }
        if (reason === "same profile URL") {
          return "The source profile URL matched; open the ledgers before merging.";
        }
        if (reason === "same name and location") {
          return "The visible name and location matched; treat this as a weaker signal.";
        }
        return `Matched signal: ${reason}.`;
      }),
      reviewChecklist: [
        "Compare platform, campaign, location, and compatibility score.",
        "Open both ledgers before merging identity history.",
        "Use Not duplicate when visible profile context points to different people."
      ],
      falsePositiveSignals
    };
  };
  return Array.from(pairMatches.values()).map((pair) => {
    const candidateA = candidatesById.get(pair.candidateAId);
    const candidateB = candidatesById.get(pair.candidateBId);
    if (!candidateA || !candidateB)
      return null;
    const targetCandidate = candidateA.compatibilityScore > candidateB.compatibilityScore || candidateA.compatibilityScore === candidateB.compatibilityScore && candidateA.id < candidateB.id ? candidateA : candidateB;
    const sourceCandidate = targetCandidate.id === candidateA.id ? candidateB : candidateA;
    return {
      pairKey: `${pair.candidateAId}:${pair.candidateBId}`,
      confidence: pair.confidence,
      reasons: Array.from(pair.reasons).sort(),
      explanation: buildDuplicateReviewExplanation(
        pair,
        targetCandidate,
        sourceCandidate
      ),
      targetCandidate: toReviewCandidate(targetCandidate),
      sourceCandidate: toReviewCandidate(sourceCandidate)
    };
  }).filter(Boolean).sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    return a.pairKey.localeCompare(b.pairKey);
  }).slice(0, limit);
}
async function createCandidate(candidate) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localCandidate = {
      id: nextLocalId("candidate"),
      campaignId: candidate.campaignId,
      platformId: candidate.platformId,
      externalId: candidate.externalId ?? null,
      name: candidate.name,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
      profileUrl: candidate.profileUrl ?? null,
      location: candidate.location ?? null,
      distance: candidate.distance ?? null,
      experience: candidate.experience ?? null,
      services: candidate.services ?? null,
      availability: candidate.availability ?? null,
      hourlyRate: candidate.hourlyRate ?? null,
      bio: candidate.bio ?? null,
      profileData: candidate.profileData ?? null,
      compatibilityScore: candidate.compatibilityScore ?? 0,
      matchReasons: candidate.matchReasons ?? null,
      status: candidate.status ?? "discovered",
      discoveredAt: candidate.discoveredAt ?? now,
      updatedAt: candidate.updatedAt ?? now
    };
    getLocalStore().candidates.push(localCandidate);
    persistLocalStore();
    return localCandidate.id;
  }
  const result = await db.insert(candidates).values(candidate);
  return Number(result[0].insertId);
}
async function updateCandidate(id, updates) {
  const db = await getDb();
  if (!db) {
    const candidate = getLocalStore().candidates.find((entry) => entry.id === id);
    if (!candidate)
      throw new Error("Candidate not found");
    Object.assign(candidate, updates, { updatedAt: /* @__PURE__ */ new Date() });
    persistLocalStore();
    return;
  }
  await db.update(candidates).set(updates).where(eq(candidates.id, id));
}
async function getCampaignMessages(campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messages.filter((message) => message.campaignId === campaignId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(messages).where(eq(messages.campaignId, campaignId)).orderBy(desc(messages.createdAt));
}
async function getCandidateMessages(candidateId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messages.filter((message) => message.candidateId === candidateId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(messages).where(eq(messages.candidateId, candidateId)).orderBy(desc(messages.createdAt));
}
async function createMessage(message) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localMessage = {
      id: nextLocalId("message"),
      campaignId: message.campaignId,
      candidateId: message.candidateId,
      platformId: message.platformId,
      subject: message.subject ?? null,
      content: message.content,
      language: message.language ?? "nl",
      status: message.status ?? "draft",
      externalMessageId: message.externalMessageId ?? null,
      sentAt: message.sentAt ?? null,
      deliveredAt: message.deliveredAt ?? null,
      respondedAt: message.respondedAt ?? null,
      responseContent: message.responseContent ?? null,
      errorMessage: message.errorMessage ?? null,
      createdAt: message.createdAt ?? now,
      updatedAt: message.updatedAt ?? now
    };
    getLocalStore().messages.push(localMessage);
    persistLocalStore();
    return localMessage.id;
  }
  const result = await db.insert(messages).values(message);
  return Number(result[0].insertId);
}
async function updateMessage(id, subject, content) {
  const db = await getDb();
  if (!db) {
    const message = getLocalStore().messages.find((entry) => entry.id === id);
    if (!message)
      throw new Error("Message not found");
    Object.assign(message, { subject, content, updatedAt: /* @__PURE__ */ new Date() });
    persistLocalStore();
    return;
  }
  await db.update(messages).set({ subject, content }).where(eq(messages.id, id));
}
async function getAllMessages(userId, status, campaignId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const userCampaignIds = new Set(
      store.campaigns.filter((campaign) => campaign.userId === userId).map((campaign) => campaign.id)
    );
    return store.messages.filter((message) => userCampaignIds.has(message.campaignId)).filter((message) => !status || message.status === status).filter((message) => !campaignId || message.campaignId === campaignId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((message) => {
      const latestCandidateResponse = store.candidateResponses.filter((response) => response.candidateId === message.candidateId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
      return {
        ...message,
        campaign: store.campaigns.find(
          (campaign) => campaign.id === message.campaignId
        ) ?? null,
        candidate: store.candidates.find(
          (candidate) => candidate.id === message.candidateId
        ) ?? null,
        platform: store.platforms.find(
          (platform) => platform.id === message.platformId
        ) ?? null,
        latestCandidateResponse
      };
    });
  }
  let query = db.select({
    id: messages.id,
    campaignId: messages.campaignId,
    candidateId: messages.candidateId,
    platformId: messages.platformId,
    subject: messages.subject,
    content: messages.content,
    status: messages.status,
    language: messages.language,
    sentAt: messages.sentAt,
    createdAt: messages.createdAt,
    candidate: {
      id: candidates.id,
      name: candidates.name,
      location: candidates.location,
      experience: candidates.experience,
      compatibilityScore: candidates.compatibilityScore
    },
    campaign: {
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status,
      searchCriteria: campaigns.searchCriteria
    },
    platform: {
      id: platforms.id,
      name: platforms.name
    }
  }).from(messages).leftJoin(candidates, eq(messages.candidateId, candidates.id)).leftJoin(platforms, eq(messages.platformId, platforms.id)).leftJoin(campaigns, eq(messages.campaignId, campaigns.id));
  const conditions = [eq(campaigns.userId, userId)];
  if (status) {
    conditions.push(eq(messages.status, status));
  }
  if (campaignId) {
    conditions.push(eq(messages.campaignId, campaignId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  const rows = await query.orderBy(desc(messages.createdAt));
  const candidateIds = Array.from(
    new Set(rows.map((message) => message.candidateId).filter(Boolean))
  );
  const responses = candidateIds.length > 0 ? await db.select().from(candidateResponses).where(inArray(candidateResponses.candidateId, candidateIds)).orderBy(desc(candidateResponses.createdAt)) : [];
  const latestResponseByCandidateId = /* @__PURE__ */ new Map();
  for (const response of responses) {
    if (!latestResponseByCandidateId.has(response.candidateId)) {
      latestResponseByCandidateId.set(response.candidateId, response);
    }
  }
  return rows.map((message) => ({
    ...message,
    latestCandidateResponse: latestResponseByCandidateId.get(message.candidateId) ?? null
  }));
}
async function updateMessageStatus(messageId, status) {
  const db = await getDb();
  if (!db) {
    const message = getLocalStore().messages.find(
      (entry) => entry.id === messageId
    );
    if (!message)
      throw new Error("Message not found");
    message.status = status;
    if (status === "sent")
      message.sentAt = /* @__PURE__ */ new Date();
    message.updatedAt = /* @__PURE__ */ new Date();
    persistLocalStore();
    return;
  }
  const updates = { status };
  if (status === "sent") {
    updates.sentAt = /* @__PURE__ */ new Date();
  }
  await db.update(messages).set(updates).where(eq(messages.id, messageId));
}
async function updateMessageResponse(messageId, responseContent, respondedAt = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) {
    const message = getLocalStore().messages.find(
      (entry) => entry.id === messageId
    );
    if (!message)
      throw new Error("Message not found");
    Object.assign(message, {
      status: "replied",
      responseContent,
      respondedAt,
      updatedAt: /* @__PURE__ */ new Date()
    });
    persistLocalStore();
    return;
  }
  await db.update(messages).set({
    status: "replied",
    responseContent,
    respondedAt
  }).where(eq(messages.id, messageId));
}
async function bulkUpdateMessageStatus(messageIds, status) {
  const db = await getDb();
  if (!db) {
    for (const messageId of messageIds) {
      await updateMessageStatus(messageId, status);
    }
    return messageIds.length;
  }
  const updates = { status };
  if (status === "sent") {
    updates.sentAt = /* @__PURE__ */ new Date();
  }
  for (const messageId of messageIds) {
    await db.update(messages).set(updates).where(eq(messages.id, messageId));
  }
  return messageIds.length;
}
async function getEngagementMetrics(campaignId) {
  const db = await getDb();
  if (!db) {
    const allMessages2 = getLocalStore().messages.filter(
      (message) => message.campaignId === campaignId
    );
    const totalSent2 = allMessages2.filter(
      (message) => ["sent", "delivered", "replied", "responded"].includes(message.status)
    ).length;
    const totalReplied2 = allMessages2.filter(
      (message) => ["replied", "responded"].includes(message.status)
    ).length;
    const totalPending2 = allMessages2.filter(
      (message) => ["sent", "delivered"].includes(message.status)
    ).length;
    const responseRate2 = totalSent2 > 0 ? totalReplied2 / totalSent2 * 100 : 0;
    return {
      totalSent: totalSent2,
      totalReplied: totalReplied2,
      totalPending: totalPending2,
      responseRate: responseRate2,
      avgResponseTime: void 0,
      trend: responseRate2 > 20 ? "up" : responseRate2 < 10 && totalSent2 > 5 ? "down" : "stable"
    };
  }
  const allMessages = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
  const totalSent = allMessages.filter(
    (m) => m.status === "sent" || m.status === "delivered" || m.status === "replied" || m.status === "responded"
  ).length;
  const totalReplied = allMessages.filter(
    (m) => m.status === "replied" || m.status === "responded"
  ).length;
  const totalPending = allMessages.filter(
    (m) => m.status === "sent" || m.status === "delivered"
  ).length;
  const responseRate = totalSent > 0 ? totalReplied / totalSent * 100 : 0;
  let avgResponseTime = void 0;
  const repliedMessages = allMessages.filter(
    (m) => (m.status === "replied" || m.status === "responded") && m.sentAt && m.respondedAt
  );
  if (repliedMessages.length > 0) {
    const totalResponseTime = repliedMessages.reduce((sum, m) => {
      if (m.sentAt && m.respondedAt) {
        const diff = m.respondedAt.getTime() - m.sentAt.getTime();
        return sum + diff;
      }
      return sum;
    }, 0);
    avgResponseTime = totalResponseTime / repliedMessages.length / (1e3 * 60 * 60);
  }
  let trend = "stable";
  if (responseRate > 20) {
    trend = "up";
  } else if (responseRate < 10 && totalSent > 5) {
    trend = "down";
  }
  return {
    totalSent,
    totalReplied,
    totalPending,
    responseRate,
    avgResponseTime,
    trend
  };
}
async function getUserPlatformCredentials(userId) {
  const db = await getDb();
  if (!db)
    return getLocalStore().platformCredentials.filter(
      (credential) => credential.userId === userId
    );
  return db.select().from(platformCredentials).where(eq(platformCredentials.userId, userId));
}
async function getPlatformCredential(userId, platformId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().platformCredentials.find(
      (credential) => credential.userId === userId && credential.platformId === platformId
    );
  }
  const result = await db.select().from(platformCredentials).where(
    and(
      eq(platformCredentials.userId, userId),
      eq(platformCredentials.platformId, platformId)
    )
  ).limit(1);
  return result[0];
}
async function upsertPlatformCredential(credential) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const existing2 = store.platformCredentials.find(
      (entry) => entry.userId === credential.userId && entry.platformId === credential.platformId
    );
    if (existing2) {
      Object.assign(existing2, credential, { updatedAt: /* @__PURE__ */ new Date() });
      persistLocalStore();
      return existing2.id;
    }
    const now = /* @__PURE__ */ new Date();
    const localCredential = {
      id: nextLocalId("platformCredential"),
      userId: credential.userId,
      platformId: credential.platformId,
      email: credential.email ?? null,
      encryptedPassword: credential.encryptedPassword ?? null,
      apiKey: credential.apiKey ?? null,
      sessionData: credential.sessionData ?? null,
      isConnected: credential.isConnected ?? 0,
      lastSyncAt: credential.lastSyncAt ?? null,
      lastError: credential.lastError ?? null,
      createdAt: credential.createdAt ?? now,
      updatedAt: credential.updatedAt ?? now
    };
    store.platformCredentials.push(localCredential);
    persistLocalStore();
    return localCredential.id;
  }
  const existing = await getPlatformCredential(
    credential.userId,
    credential.platformId
  );
  if (existing) {
    await db.update(platformCredentials).set(credential).where(
      and(
        eq(platformCredentials.userId, credential.userId),
        eq(platformCredentials.platformId, credential.platformId)
      )
    );
    return existing.id;
  } else {
    const result = await db.insert(platformCredentials).values(credential);
    return Number(result[0].insertId);
  }
}
async function getCandidateMatchFactors(candidateId) {
  const db = await getDb();
  if (!db)
    return getLocalStore().matchFactors.filter(
      (factor) => factor.candidateId === candidateId
    );
  return db.select().from(matchFactors).where(eq(matchFactors.candidateId, candidateId));
}
async function createMatchFactor(factor) {
  const db = await getDb();
  if (!db) {
    const localFactor = {
      id: nextLocalId("matchFactor"),
      candidateId: factor.candidateId,
      factor: factor.factor,
      score: factor.score,
      weight: factor.weight,
      reasoning: factor.reasoning ?? null,
      createdAt: factor.createdAt ?? /* @__PURE__ */ new Date()
    };
    getLocalStore().matchFactors.push(localFactor);
    persistLocalStore();
    return localFactor.id;
  }
  const result = await db.insert(matchFactors).values(factor);
  return Number(result[0].insertId);
}
async function createAuditEvent(event) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localEvent = {
      id: nextLocalId("auditEvent"),
      userId: event.userId,
      entityType: event.entityType,
      entityId: event.entityId,
      campaignId: event.campaignId ?? null,
      action: event.action,
      actor: event.actor ?? "system",
      source: event.source ?? null,
      beforeState: event.beforeState ?? null,
      afterState: event.afterState ?? null,
      riskLevel: event.riskLevel ?? "low",
      approvalId: event.approvalId ?? null,
      createdAt: event.createdAt ?? now
    };
    getLocalStore().auditEvents.push(localEvent);
    persistLocalStore();
    return localEvent.id;
  }
  const result = await db.insert(auditEvents).values(event);
  return Number(result[0].insertId);
}
async function getAuditEventsForCampaign(userId, campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().auditEvents.filter(
      (event) => event.userId === userId && event.campaignId === campaignId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(auditEvents).where(
    and(
      eq(auditEvents.userId, userId),
      eq(auditEvents.campaignId, campaignId)
    )
  ).orderBy(desc(auditEvents.createdAt));
}
async function getAuditEventsForEntity(userId, entityType, entityId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().auditEvents.filter(
      (event) => event.userId === userId && event.entityType === entityType && event.entityId === entityId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(auditEvents).where(
    and(
      eq(auditEvents.userId, userId),
      eq(auditEvents.entityType, entityType),
      eq(auditEvents.entityId, entityId)
    )
  ).orderBy(desc(auditEvents.createdAt));
}
async function getMessageSnippetById(id) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageSnippets.find((snippet) => snippet.id === id);
  }
  const result = await db.select().from(messageSnippets).where(eq(messageSnippets.id, id)).limit(1);
  return result[0];
}
async function getActiveMessageSnippets(userId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageSnippets.filter(
      (snippet) => snippet.userId === userId && snippet.isActive === 1
    ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return db.select().from(messageSnippets).where(
    and(eq(messageSnippets.userId, userId), eq(messageSnippets.isActive, 1))
  ).orderBy(desc(messageSnippets.updatedAt));
}
async function createMessageSnippet(snippet) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localSnippet = {
      id: nextLocalId("messageSnippet"),
      userId: snippet.userId,
      title: snippet.title,
      body: snippet.body,
      language: snippet.language ?? "nl",
      tonePreset: snippet.tonePreset ?? "careful",
      isActive: snippet.isActive ?? 1,
      createdAt: snippet.createdAt ?? now,
      updatedAt: snippet.updatedAt ?? now
    };
    getLocalStore().messageSnippets.push(localSnippet);
    persistLocalStore();
    return localSnippet.id;
  }
  const result = await db.insert(messageSnippets).values(snippet);
  return Number(result[0].insertId);
}
async function archiveMessageSnippet(id, userId) {
  const existing = await getMessageSnippetById(id);
  if (!existing || existing.userId !== userId || existing.isActive !== 1) {
    throw new Error("Message snippet not found");
  }
  const db = await getDb();
  if (!db) {
    existing.isActive = 0;
    existing.updatedAt = /* @__PURE__ */ new Date();
    persistLocalStore();
    return existing;
  }
  await db.update(messageSnippets).set({ isActive: 0 }).where(and(eq(messageSnippets.id, id), eq(messageSnippets.userId, userId)));
  return existing;
}
async function createMessageApproval(approval) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localApproval = {
      id: nextLocalId("messageApproval"),
      messageId: approval.messageId,
      campaignId: approval.campaignId,
      candidateId: approval.candidateId,
      userId: approval.userId,
      decision: approval.decision,
      decisionReason: approval.decisionReason ?? null,
      approvedContentSnapshot: approval.approvedContentSnapshot ?? null,
      approvedSubjectSnapshot: approval.approvedSubjectSnapshot ?? null,
      decidedAt: approval.decidedAt ?? now,
      createdAt: approval.createdAt ?? now
    };
    getLocalStore().messageApprovals.push(localApproval);
    persistLocalStore();
    return localApproval.id;
  }
  const result = await db.insert(messageApprovals).values(approval);
  return Number(result[0].insertId);
}
async function getMessageApprovalsForCampaign(campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageApprovals.filter((approval) => approval.campaignId === campaignId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(messageApprovals).where(eq(messageApprovals.campaignId, campaignId)).orderBy(desc(messageApprovals.createdAt));
}
async function getMessageApprovalsByMessageId(messageId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageApprovals.filter((approval) => approval.messageId === messageId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(messageApprovals).where(eq(messageApprovals.messageId, messageId)).orderBy(desc(messageApprovals.createdAt));
}
async function createMessageSendAttempt(attempt) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localAttempt = {
      id: nextLocalId("messageSendAttempt"),
      messageId: attempt.messageId,
      campaignId: attempt.campaignId,
      candidateId: attempt.candidateId,
      platformId: attempt.platformId,
      status: attempt.status ?? "started",
      startedAt: attempt.startedAt ?? now,
      finishedAt: attempt.finishedAt ?? null,
      errorMessage: attempt.errorMessage ?? null,
      externalMessageId: attempt.externalMessageId ?? null,
      confirmationText: attempt.confirmationText ?? null,
      retryCount: attempt.retryCount ?? 0,
      rateLimitState: attempt.rateLimitState ?? null,
      createdAt: attempt.createdAt ?? now
    };
    getLocalStore().messageSendAttempts.push(localAttempt);
    persistLocalStore();
    return localAttempt.id;
  }
  const result = await db.insert(messageSendAttempts).values(attempt);
  return Number(result[0].insertId);
}
async function getMessageSendAttemptsForCampaign(campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageSendAttempts.filter((attempt) => attempt.campaignId === campaignId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(messageSendAttempts).where(eq(messageSendAttempts.campaignId, campaignId)).orderBy(desc(messageSendAttempts.createdAt));
}
async function getMessageSendAttemptsForCandidate(candidateId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageSendAttempts.filter(
      (attempt) => attempt.candidateId === candidateId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(messageSendAttempts).where(eq(messageSendAttempts.candidateId, candidateId)).orderBy(desc(messageSendAttempts.createdAt));
}
async function createCandidateResponse(response) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localResponse = {
      id: nextLocalId("candidateResponse"),
      candidateId: response.candidateId,
      messageId: response.messageId ?? null,
      platformId: response.platformId,
      rawContent: response.rawContent,
      normalizedContent: response.normalizedContent ?? null,
      classification: response.classification ?? "unknown",
      confidence: response.confidence ?? 0,
      receivedAt: response.receivedAt ?? now,
      source: response.source ?? "manual",
      createdAt: response.createdAt ?? now
    };
    getLocalStore().candidateResponses.push(localResponse);
    persistLocalStore();
    return localResponse.id;
  }
  const result = await db.insert(candidateResponses).values(response);
  return Number(result[0].insertId);
}
async function getCandidateResponseById(id) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().candidateResponses.find(
      (response) => response.id === id
    );
  }
  const result = await db.select().from(candidateResponses).where(eq(candidateResponses.id, id)).limit(1);
  return result[0];
}
async function updateCandidateResponseClassification(id, classification, confidence) {
  const db = await getDb();
  if (!db) {
    const response = getLocalStore().candidateResponses.find(
      (entry) => entry.id === id
    );
    if (!response)
      throw new Error("Candidate response not found");
    response.classification = classification;
    response.confidence = confidence;
    persistLocalStore();
    return;
  }
  await db.update(candidateResponses).set({ classification, confidence }).where(eq(candidateResponses.id, id));
}
async function getCandidateResponsesForCampaign(campaignId) {
  const db = await getDb();
  if (!db) {
    const candidateIds = new Set(
      getLocalStore().candidates.filter((candidate) => candidate.campaignId === campaignId).map((candidate) => candidate.id)
    );
    return getLocalStore().candidateResponses.filter(
      (response) => candidateIds.has(response.candidateId)
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select({
    id: candidateResponses.id,
    candidateId: candidateResponses.candidateId,
    messageId: candidateResponses.messageId,
    platformId: candidateResponses.platformId,
    rawContent: candidateResponses.rawContent,
    normalizedContent: candidateResponses.normalizedContent,
    classification: candidateResponses.classification,
    confidence: candidateResponses.confidence,
    receivedAt: candidateResponses.receivedAt,
    source: candidateResponses.source,
    createdAt: candidateResponses.createdAt
  }).from(candidateResponses).leftJoin(candidates, eq(candidateResponses.candidateId, candidates.id)).where(eq(candidates.campaignId, campaignId)).orderBy(desc(candidateResponses.createdAt));
}
async function getCandidateResponsesByCandidateId(candidateId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().candidateResponses.filter(
      (response) => response.candidateId === candidateId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(candidateResponses).where(eq(candidateResponses.candidateId, candidateId)).orderBy(desc(candidateResponses.createdAt));
}
async function createCandidateQualificationDecision(decision) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localDecision = {
      id: nextLocalId("candidateQualificationDecision"),
      candidateId: decision.candidateId,
      campaignId: decision.campaignId,
      userId: decision.userId,
      decision: decision.decision,
      reason: decision.reason,
      sensitiveAssumptionsAcknowledged: decision.sensitiveAssumptionsAcknowledged ?? 0,
      createdAt: decision.createdAt ?? now
    };
    getLocalStore().candidateQualificationDecisions.push(localDecision);
    persistLocalStore();
    return localDecision.id;
  }
  const result = await db.insert(candidateQualificationDecisions).values(decision);
  return Number(result[0].insertId);
}
async function getCandidateQualificationDecisionsByCandidateId(candidateId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().candidateQualificationDecisions.filter(
      (decision) => decision.candidateId === candidateId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(candidateQualificationDecisions).where(eq(candidateQualificationDecisions.candidateId, candidateId)).orderBy(desc(candidateQualificationDecisions.createdAt));
}
async function getCandidateQualificationDecisionsForCampaign(campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().candidateQualificationDecisions.filter(
      (decision) => decision.campaignId === campaignId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(candidateQualificationDecisions).where(eq(candidateQualificationDecisions.campaignId, campaignId)).orderBy(desc(candidateQualificationDecisions.createdAt));
}
async function getCandidateResponsesForUser(userId, options) {
  const db = await getDb();
  const limit = options?.limit;
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns.filter(
        (campaign) => campaign.userId === userId && campaign.status !== "archived"
      ).filter(
        (campaign) => !options?.campaignId || campaign.id === options.campaignId
      ).map((campaign) => campaign.id)
    );
    const candidateIds = new Set(
      store.candidates.filter((candidate) => campaignIds.has(candidate.campaignId)).map((candidate) => candidate.id)
    );
    const responses = store.candidateResponses.filter((response) => candidateIds.has(response.candidateId)).filter(
      (response) => !options?.classification || response.classification === options.classification
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((response) => {
      const candidate = store.candidates.find((entry) => entry.id === response.candidateId) ?? null;
      const campaign = candidate ? store.campaigns.find((entry) => entry.id === candidate.campaignId) ?? null : null;
      const message = response.messageId ? store.messages.find((entry) => entry.id === response.messageId) ?? null : null;
      const platform = store.platforms.find((entry) => entry.id === response.platformId) ?? null;
      return { ...response, candidate, campaign, message, platform };
    });
    return typeof limit === "number" ? responses.slice(0, limit) : responses;
  }
  const conditions = [eq(campaigns.userId, userId)];
  if (options?.classification) {
    conditions.push(
      eq(candidateResponses.classification, options.classification)
    );
  }
  if (options?.campaignId) {
    conditions.push(eq(campaigns.id, options.campaignId));
  }
  const query = db.select({
    id: candidateResponses.id,
    candidateId: candidateResponses.candidateId,
    messageId: candidateResponses.messageId,
    platformId: candidateResponses.platformId,
    rawContent: candidateResponses.rawContent,
    normalizedContent: candidateResponses.normalizedContent,
    classification: candidateResponses.classification,
    confidence: candidateResponses.confidence,
    receivedAt: candidateResponses.receivedAt,
    source: candidateResponses.source,
    createdAt: candidateResponses.createdAt,
    candidate: {
      id: candidates.id,
      name: candidates.name,
      campaignId: candidates.campaignId,
      compatibilityScore: candidates.compatibilityScore
    },
    campaign: {
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status
    },
    message: {
      id: messages.id,
      subject: messages.subject,
      status: messages.status
    },
    platform: {
      id: platforms.id,
      name: platforms.name
    }
  }).from(candidateResponses).leftJoin(candidates, eq(candidateResponses.candidateId, candidates.id)).leftJoin(campaigns, eq(candidates.campaignId, campaigns.id)).leftJoin(messages, eq(candidateResponses.messageId, messages.id)).leftJoin(platforms, eq(candidateResponses.platformId, platforms.id)).where(and(...conditions)).orderBy(desc(candidateResponses.createdAt));
  return typeof limit === "number" ? query.limit(limit) : query;
}
async function recordCampaignReadinessCheck(check) {
  const db = await getDb();
  if (!db) {
    const localCheck = {
      id: nextLocalId("campaignReadinessCheck"),
      campaignId: check.campaignId,
      userId: check.userId,
      status: check.status,
      checksJson: check.checksJson,
      blockersJson: check.blockersJson ?? null,
      warningsJson: check.warningsJson ?? null,
      createdAt: check.createdAt ?? /* @__PURE__ */ new Date()
    };
    getLocalStore().campaignReadinessChecks.push(localCheck);
    persistLocalStore();
    return localCheck.id;
  }
  const result = await db.insert(campaignReadinessChecks).values(check);
  return Number(result[0].insertId);
}
async function getLatestCampaignReadinessCheck(campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().campaignReadinessChecks.filter((check) => check.campaignId === campaignId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }
  const result = await db.select().from(campaignReadinessChecks).where(eq(campaignReadinessChecks.campaignId, campaignId)).orderBy(desc(campaignReadinessChecks.createdAt)).limit(1);
  return result[0];
}
async function recordCredentialEvent(event) {
  const db = await getDb();
  if (!db) {
    const localEvent = {
      id: nextLocalId("credentialEvent"),
      userId: event.userId,
      platformId: event.platformId,
      eventType: event.eventType,
      status: event.status ?? "ok",
      message: event.message ?? null,
      createdAt: event.createdAt ?? /* @__PURE__ */ new Date()
    };
    getLocalStore().credentialEvents.push(localEvent);
    persistLocalStore();
    return localEvent.id;
  }
  const result = await db.insert(credentialEvents).values(event);
  return Number(result[0].insertId);
}
async function getCredentialEvents(userId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().credentialEvents.filter((event) => event.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(credentialEvents).where(eq(credentialEvents.userId, userId)).orderBy(desc(credentialEvents.createdAt));
}
function toPublicCredentialEvent(event) {
  const message = event.message && credentialEventSecretPattern.test(event.message) ? "[redacted]" : event.message ? event.message.slice(0, 500) : null;
  return {
    id: event.id,
    platformId: event.platformId,
    eventType: event.eventType,
    status: event.status,
    message,
    createdAt: event.createdAt
  };
}
async function getCredentialStatus(userId) {
  const [credentials, platformsList, events] = await Promise.all([
    getUserPlatformCredentials(userId),
    getAllPlatforms(),
    getCredentialEvents(userId)
  ]);
  return platformsList.map((platform) => {
    const capability = getPlatformCapability(platform.name);
    const credential = credentials.find((entry) => entry.platformId === platform.id) ?? null;
    const recentEvents = events.filter((event) => event.platformId === platform.id).slice(0, RECENT_CREDENTIAL_EVENT_LIMIT).map(toPublicCredentialEvent);
    const latestEvent = recentEvents[0] ?? null;
    return {
      platform,
      credential: credential ? {
        id: credential.id,
        platformId: credential.platformId,
        email: credential.email,
        isConnected: credential.isConnected,
        lastSyncAt: credential.lastSyncAt,
        lastError: credential.lastError,
        updatedAt: credential.updatedAt
      } : null,
      latestEvent,
      recentEvents,
      capability,
      status: !credential ? capability.supportsAuthenticatedAutomation ? "missing" : "public_only" : !capability.supportsAuthenticatedAutomation ? "public_only_saved" : credential.lastError ? "error" : credential.isConnected === 1 ? "connected" : "unverified"
    };
  });
}
async function getRateLimitEventsForCampaign(campaignId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().rateLimitEvents.filter((event) => event.campaignId === campaignId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(rateLimitEvents).where(eq(rateLimitEvents.campaignId, campaignId)).orderBy(desc(rateLimitEvents.createdAt));
}
async function createRateLimitEvent(event) {
  const db = await getDb();
  if (!db) {
    const localEvent = {
      id: nextLocalId("rateLimitEvent"),
      userId: event.userId,
      platformId: event.platformId ?? null,
      campaignId: event.campaignId ?? null,
      eventType: event.eventType,
      severity: event.severity ?? "info",
      detailJson: event.detailJson ?? null,
      createdAt: event.createdAt ?? /* @__PURE__ */ new Date()
    };
    getLocalStore().rateLimitEvents.push(localEvent);
    persistLocalStore();
    return localEvent.id;
  }
  const result = await db.insert(rateLimitEvents).values(event);
  return Number(result[0].insertId);
}
async function createQueueJobRecord(job) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localJob = {
      id: nextLocalId("queueJobRecord"),
      userId: job.userId,
      campaignId: job.campaignId ?? null,
      messageId: job.messageId ?? null,
      queueName: job.queueName,
      jobType: job.jobType,
      status: job.status ?? "waiting",
      payloadJson: job.payloadJson ?? null,
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt ?? now,
      updatedAt: job.updatedAt ?? now
    };
    getLocalStore().queueJobRecords.push(localJob);
    persistLocalStore();
    return localJob.id;
  }
  const result = await db.insert(queueJobRecords).values(job);
  return Number(result[0].insertId);
}
async function updateQueueJobRecord(id, updates) {
  const db = await getDb();
  const normalizedUpdates = {
    ...updates,
    updatedAt: /* @__PURE__ */ new Date()
  };
  if (!db) {
    const job = getLocalStore().queueJobRecords.find((entry) => entry.id === id);
    if (!job)
      return false;
    Object.assign(job, normalizedUpdates);
    persistLocalStore();
    return true;
  }
  await db.update(queueJobRecords).set(normalizedUpdates).where(eq(queueJobRecords.id, id));
  return true;
}
async function getQueueJobRecords(userId, queueName, status, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const db = await getDb();
  if (!db) {
    return getLocalStore().queueJobRecords.filter((job) => job.userId === userId).filter((job) => !queueName || job.queueName === queueName).filter((job) => !status || job.status === status).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(offset, offset + limit);
  }
  const conditions = [eq(queueJobRecords.userId, userId)];
  if (queueName)
    conditions.push(eq(queueJobRecords.queueName, queueName));
  if (status)
    conditions.push(eq(queueJobRecords.status, status));
  return db.select().from(queueJobRecords).where(and(...conditions)).orderBy(desc(queueJobRecords.createdAt)).limit(limit).offset(offset);
}
async function getQueueJobRecordForUser(id, userId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().queueJobRecords.find(
      (job) => job.id === id && job.userId === userId
    );
  }
  const result = await db.select().from(queueJobRecords).where(and(eq(queueJobRecords.id, id), eq(queueJobRecords.userId, userId))).limit(1);
  return result[0];
}
async function cancelQueueJobRecord(input) {
  const job = await getQueueJobRecordForUser(input.id, input.userId);
  if (!job)
    return { cancelled: false, reason: "not_found" };
  if (job.status === "cancelled") {
    return { cancelled: true, alreadyCancelled: true, job };
  }
  if (job.status !== "waiting" && job.status !== "delayed") {
    return {
      cancelled: false,
      reason: "not_cancellable",
      job
    };
  }
  const cancellationReason = redactOperationalError(
    truncateOperationalText(input.reason, 300) ?? "Cancelled by user"
  );
  await updateQueueJobRecord(job.id, {
    status: "cancelled",
    errorMessage: `Cancelled by user: ${cancellationReason}`
  });
  const updatedJob = await getQueueJobRecordForUser(job.id, input.userId);
  return {
    cancelled: true,
    job: updatedJob ?? { ...job, status: "cancelled" }
  };
}
async function getQueueHealthSummary(userId, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const db = await getDb();
  const records = !db ? getLocalStore().queueJobRecords.filter((job) => job.userId === userId).sort(
    (a, b) => (b.updatedAt ?? b.createdAt).getTime() - (a.updatedAt ?? a.createdAt).getTime()
  ).slice(0, limit) : await db.select().from(queueJobRecords).where(eq(queueJobRecords.userId, userId)).orderBy(desc(queueJobRecords.updatedAt)).limit(limit);
  const queueNames = ["messages", "discovery"];
  const now = /* @__PURE__ */ new Date();
  const recentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  return {
    generatedAt: now,
    recentRecordLimit: limit,
    queues: queueNames.map((queueName) => {
      const queueRecords = records.filter(
        (record) => record.queueName === queueName
      );
      const countByStatus = {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        cancelled: 0
      };
      for (const record of queueRecords) {
        countByStatus[record.status] += 1;
      }
      const lastActivityAt = latestDate(
        queueRecords.map((record) => record.updatedAt ?? record.createdAt)
      );
      const lastCompletedAt = latestDate(
        queueRecords.filter((record) => record.status === "completed").map((record) => record.updatedAt ?? record.createdAt)
      );
      const lastFailedAt = latestDate(
        queueRecords.filter((record) => record.status === "failed").map((record) => record.updatedAt ?? record.createdAt)
      );
      const failedLast24h = queueRecords.filter((record) => {
        const activityAt = record.updatedAt ?? record.createdAt;
        return record.status === "failed" && activityAt >= recentCutoff;
      }).length;
      return {
        queueName,
        durable: {
          recentRecords: queueRecords.length,
          ...countByStatus
        },
        lastActivityAt,
        lastCompletedAt,
        lastFailedAt,
        recentErrors: queueRecords.filter((record) => record.status === "failed" && record.errorMessage).slice(0, 3).map((record) => ({
          id: record.id,
          jobType: record.jobType,
          campaignId: record.campaignId,
          failedAt: record.updatedAt ?? record.createdAt,
          errorMessage: redactOperationalError(record.errorMessage)
        })),
        failedLast24h
      };
    })
  };
}
function latestDate(values) {
  const timestamps = values.filter((value) => value instanceof Date).map((value) => value.getTime());
  if (timestamps.length === 0)
    return null;
  return new Date(Math.max(...timestamps));
}
function redactOperationalError(value) {
  if (!value)
    return null;
  return value.replace(
    /\b(password|passphrase|api[-_\s]?key|token|session|cookie|authorization|secret)\s*[:=]\s*\S+/gi,
    "$1=[redacted]"
  ).replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]").slice(0, 500);
}
async function createFollowUp(followUp) {
  const db = await getDb();
  if (!db) {
    const now = /* @__PURE__ */ new Date();
    const localFollowUp = {
      id: nextLocalId("followUp"),
      campaignId: followUp.campaignId,
      candidateId: followUp.candidateId,
      sequence: followUp.sequence,
      scheduledAt: followUp.scheduledAt,
      status: followUp.status ?? "scheduled",
      messageId: followUp.messageId ?? null,
      createdAt: followUp.createdAt ?? now,
      updatedAt: followUp.updatedAt ?? now
    };
    getLocalStore().followUps.push(localFollowUp);
    persistLocalStore();
    return localFollowUp.id;
  }
  const result = await db.insert(followUps).values(followUp);
  return Number(result[0].insertId);
}
async function getFollowUpById(id) {
  const db = await getDb();
  if (!db)
    return getLocalStore().followUps.find((followUp) => followUp.id === id);
  const result = await db.select().from(followUps).where(eq(followUps.id, id)).limit(1);
  return result[0];
}
async function updateFollowUpStatus(id, status) {
  const db = await getDb();
  if (!db) {
    const followUp = getLocalStore().followUps.find((entry) => entry.id === id);
    if (!followUp)
      throw new Error("Follow-up not found");
    followUp.status = status;
    followUp.updatedAt = /* @__PURE__ */ new Date();
    persistLocalStore();
    return;
  }
  await db.update(followUps).set({ status }).where(eq(followUps.id, id));
}
async function getDueFollowUps(userId) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns.filter((campaign) => campaign.userId === userId).map((campaign) => campaign.id)
    );
    return store.followUps.filter((followUp) => campaignIds.has(followUp.campaignId)).filter((followUp) => followUp.status === "scheduled").filter((followUp) => followUp.scheduledAt <= now).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).map((followUp) => {
      const candidate = store.candidates.find((entry) => entry.id === followUp.candidateId) ?? null;
      const campaign = store.campaigns.find((entry) => entry.id === followUp.campaignId) ?? null;
      const message = followUp.messageId ? store.messages.find((entry) => entry.id === followUp.messageId) ?? null : null;
      return { ...followUp, candidate, campaign, message };
    });
  }
  return db.select({
    id: followUps.id,
    campaignId: followUps.campaignId,
    candidateId: followUps.candidateId,
    sequence: followUps.sequence,
    scheduledAt: followUps.scheduledAt,
    status: followUps.status,
    messageId: followUps.messageId,
    createdAt: followUps.createdAt,
    updatedAt: followUps.updatedAt,
    candidate: {
      id: candidates.id,
      name: candidates.name,
      compatibilityScore: candidates.compatibilityScore
    },
    campaign: {
      id: campaigns.id,
      title: campaigns.title
    },
    message: {
      id: messages.id,
      subject: messages.subject,
      content: messages.content,
      status: messages.status
    }
  }).from(followUps).leftJoin(campaigns, eq(followUps.campaignId, campaigns.id)).leftJoin(candidates, eq(followUps.candidateId, candidates.id)).leftJoin(messages, eq(followUps.messageId, messages.id)).where(
    and(
      eq(campaigns.userId, userId),
      sql`${campaigns.status} <> 'archived'`,
      eq(followUps.status, "scheduled"),
      sql`${followUps.scheduledAt} <= now()`
    )
  ).orderBy(followUps.scheduledAt);
}
async function getFollowUpSuggestions(userId, options) {
  const minDaysSinceContact = Math.min(
    Math.max(options?.minDaysSinceContact ?? 5, 1),
    30
  );
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const now = /* @__PURE__ */ new Date();
  const cutoff = new Date(
    now.getTime() - minDaysSinceContact * 24 * 60 * 60 * 1e3
  );
  const activeFollowUpStatuses = /* @__PURE__ */ new Set(["scheduled"]);
  const activeMessageStatuses = /* @__PURE__ */ new Set(["draft", "queued", "approved"]);
  const contactedMessageStatuses2 = /* @__PURE__ */ new Set(["sent", "delivered"]);
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const userCampaigns = store.campaigns.filter(
      (campaign) => campaign.userId === userId && campaign.status !== "archived"
    );
    const campaignIds = new Set(userCampaigns.map((campaign) => campaign.id));
    const responsesByCandidateId = new Set(
      store.candidateResponses.map((response) => response.candidateId)
    );
    return store.messages.filter((message) => campaignIds.has(message.campaignId)).filter((message) => contactedMessageStatuses2.has(message.status)).filter((message) => !message.respondedAt).map((message) => ({
      message,
      lastContactAt: message.deliveredAt ?? message.sentAt ?? message.updatedAt
    })).filter((entry) => entry.lastContactAt <= cutoff).filter((entry) => !responsesByCandidateId.has(entry.message.candidateId)).filter((entry) => {
      return !store.followUps.filter((followUp) => followUp.candidateId === entry.message.candidateId).filter((followUp) => activeFollowUpStatuses.has(followUp.status)).some((followUp) => {
        if (!followUp.messageId)
          return true;
        const followUpMessage = store.messages.find(
          (message) => message.id === followUp.messageId
        );
        return !followUpMessage || activeMessageStatuses.has(followUpMessage.status);
      });
    }).sort((a, b) => a.lastContactAt.getTime() - b.lastContactAt.getTime()).slice(0, limit).map((entry) => {
      const candidate = store.candidates.find(
        (candidate2) => candidate2.id === entry.message.candidateId
      ) ?? null;
      const campaign = store.campaigns.find(
        (campaign2) => campaign2.id === entry.message.campaignId
      ) ?? null;
      const platform = store.platforms.find(
        (platform2) => platform2.id === entry.message.platformId
      ) ?? null;
      const daysSinceContact = Math.max(
        1,
        Math.floor(
          (now.getTime() - entry.lastContactAt.getTime()) / (24 * 60 * 60 * 1e3)
        )
      );
      return {
        messageId: entry.message.id,
        candidateId: entry.message.candidateId,
        campaignId: entry.message.campaignId,
        platformId: entry.message.platformId,
        lastContactAt: entry.lastContactAt,
        daysSinceContact,
        sequence: 1,
        candidate: candidate ? {
          id: candidate.id,
          name: candidate.name,
          compatibilityScore: candidate.compatibilityScore
        } : null,
        campaign: campaign ? { id: campaign.id, title: campaign.title, status: campaign.status } : null,
        platform: platform ? { id: platform.id, name: platform.name } : null,
        message: {
          id: entry.message.id,
          subject: entry.message.subject,
          status: entry.message.status
        }
      };
    });
  }
  const contactedMessages = await db.select({
    id: messages.id,
    campaignId: messages.campaignId,
    candidateId: messages.candidateId,
    platformId: messages.platformId,
    subject: messages.subject,
    status: messages.status,
    sentAt: messages.sentAt,
    deliveredAt: messages.deliveredAt,
    respondedAt: messages.respondedAt,
    updatedAt: messages.updatedAt,
    candidate: {
      id: candidates.id,
      name: candidates.name,
      compatibilityScore: candidates.compatibilityScore
    },
    campaign: {
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status
    },
    platform: {
      id: platforms.id,
      name: platforms.name
    }
  }).from(messages).leftJoin(campaigns, eq(messages.campaignId, campaigns.id)).leftJoin(candidates, eq(messages.candidateId, candidates.id)).leftJoin(platforms, eq(messages.platformId, platforms.id)).where(
    and(
      eq(campaigns.userId, userId),
      sql`${campaigns.status} <> 'archived'`,
      inArray(messages.status, ["sent", "delivered"])
    )
  );
  const staleMessages = contactedMessages.map((message) => ({
    ...message,
    lastContactAt: message.deliveredAt ?? message.sentAt ?? message.updatedAt
  })).filter((message) => !message.respondedAt).filter((message) => message.lastContactAt <= cutoff);
  const candidateIds = Array.from(
    new Set(staleMessages.map((message) => message.candidateId))
  );
  if (candidateIds.length === 0)
    return [];
  const [responses, activeFollowUps] = await Promise.all([
    db.select({ candidateId: candidateResponses.candidateId }).from(candidateResponses).where(inArray(candidateResponses.candidateId, candidateIds)),
    db.select({
      candidateId: followUps.candidateId,
      messageStatus: messages.status,
      messageId: followUps.messageId
    }).from(followUps).leftJoin(messages, eq(followUps.messageId, messages.id)).where(
      and(
        inArray(followUps.candidateId, candidateIds),
        eq(followUps.status, "scheduled")
      )
    )
  ]);
  const responseCandidateIds = new Set(
    responses.map((response) => response.candidateId)
  );
  const activeFollowUpCandidateIds = new Set(
    activeFollowUps.filter(
      (followUp) => !followUp.messageId || !followUp.messageStatus || activeMessageStatuses.has(followUp.messageStatus)
    ).map((followUp) => followUp.candidateId)
  );
  return staleMessages.filter((message) => !responseCandidateIds.has(message.candidateId)).filter((message) => !activeFollowUpCandidateIds.has(message.candidateId)).sort((a, b) => a.lastContactAt.getTime() - b.lastContactAt.getTime()).slice(0, limit).map((message) => {
    const daysSinceContact = Math.max(
      1,
      Math.floor(
        (now.getTime() - message.lastContactAt.getTime()) / (24 * 60 * 60 * 1e3)
      )
    );
    return {
      messageId: message.id,
      candidateId: message.candidateId,
      campaignId: message.campaignId,
      platformId: message.platformId,
      lastContactAt: message.lastContactAt,
      daysSinceContact,
      sequence: 1,
      candidate: message.candidate,
      campaign: message.campaign,
      platform: message.platform,
      message: {
        id: message.id,
        subject: message.subject,
        status: message.status
      }
    };
  });
}
async function getFollowUpsForCandidate(candidateId) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().followUps.filter((followUp) => followUp.candidateId === candidateId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(followUps).where(eq(followUps.candidateId, candidateId)).orderBy(desc(followUps.createdAt));
}
async function getActiveFollowUpDraftForCandidate(candidateId, sequence) {
  const activeMessageStatuses = /* @__PURE__ */ new Set(["draft", "queued", "approved"]);
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const followUp = store.followUps.filter((entry) => entry.candidateId === candidateId).filter((entry) => entry.sequence === sequence).filter((entry) => entry.status === "scheduled").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).find((entry) => {
      if (!entry.messageId)
        return true;
      const message = store.messages.find(
        (candidateMessage) => candidateMessage.id === entry.messageId
      );
      return !message || activeMessageStatuses.has(message.status);
    });
    if (!followUp)
      return void 0;
    return {
      ...followUp,
      message: followUp.messageId ? store.messages.find((message) => message.id === followUp.messageId) ?? null : null
    };
  }
  const result = await db.select({
    id: followUps.id,
    campaignId: followUps.campaignId,
    candidateId: followUps.candidateId,
    sequence: followUps.sequence,
    scheduledAt: followUps.scheduledAt,
    status: followUps.status,
    messageId: followUps.messageId,
    createdAt: followUps.createdAt,
    updatedAt: followUps.updatedAt,
    message: {
      id: messages.id,
      status: messages.status,
      subject: messages.subject
    }
  }).from(followUps).leftJoin(messages, eq(followUps.messageId, messages.id)).where(
    and(
      eq(followUps.candidateId, candidateId),
      eq(followUps.sequence, sequence),
      eq(followUps.status, "scheduled"),
      sql`(${followUps.messageId} is null or ${messages.status} in ('draft', 'queued', 'approved'))`
    )
  ).orderBy(desc(followUps.createdAt)).limit(1);
  return result[0];
}
async function getOrCreateCandidateIdentity(candidate, userId) {
  const db = await getDb();
  const normalizedEmail = candidate.email?.toLowerCase() || null;
  const normalizedPhone = candidate.phone?.replace(/\D/g, "") || null;
  if (!db) {
    const store = getLocalStore();
    const existingIdentity = store.candidateIdentities.find((identity2) => {
      return (normalizedEmail && identity2.canonicalEmail?.toLowerCase() === normalizedEmail || normalizedPhone && identity2.canonicalPhone?.replace(/\D/g, "") === normalizedPhone) && identity2.userId === userId;
    });
    if (existingIdentity) {
      ensureLocalCandidateSource(existingIdentity.id, candidate);
      persistLocalStore();
      return existingIdentity;
    }
    const now = /* @__PURE__ */ new Date();
    const identity = {
      id: nextLocalId("candidateIdentity"),
      userId,
      canonicalName: candidate.name,
      canonicalEmail: normalizedEmail,
      canonicalPhone: normalizedPhone,
      location: candidate.location ?? null,
      notes: null,
      createdAt: now,
      updatedAt: now
    };
    store.candidateIdentities.push(identity);
    ensureLocalCandidateSource(identity.id, candidate);
    persistLocalStore();
    return identity;
  }
  const existing = normalizedEmail ? await db.select().from(candidateIdentities).where(
    and(
      eq(candidateIdentities.userId, userId),
      eq(candidateIdentities.canonicalEmail, normalizedEmail)
    )
  ).limit(1) : [];
  if (existing[0]) {
    await ensureDbCandidateSource(existing[0].id, candidate);
    return existing[0];
  }
  const result = await db.insert(candidateIdentities).values({
    userId,
    canonicalName: candidate.name,
    canonicalEmail: normalizedEmail,
    canonicalPhone: normalizedPhone,
    location: candidate.location
  });
  const identityId = Number(result[0].insertId);
  await db.insert(candidateSources).values({
    candidateIdentityId: identityId,
    candidateId: candidate.id,
    platformId: candidate.platformId,
    externalId: candidate.externalId,
    profileUrl: candidate.profileUrl,
    profileHash: createProfileHash(candidate)
  });
  const created = await db.select().from(candidateIdentities).where(eq(candidateIdentities.id, identityId)).limit(1);
  return created[0];
}
async function getCandidateDuplicateGroups(userId) {
  const db = await getDb();
  if (db) {
    const identities = await db.select().from(candidateIdentities).where(eq(candidateIdentities.userId, userId));
    const sources = await db.select().from(candidateSources);
    return identities.map((identity) => ({
      identity,
      sources: sources.filter(
        (source) => source.candidateIdentityId === identity.id
      )
    })).filter((group) => group.sources.length > 1);
  }
  const store = getLocalStore();
  return store.candidateIdentities.filter((identity) => identity.userId === userId).map((identity) => ({
    identity,
    sources: store.candidateSources.filter(
      (source) => source.candidateIdentityId === identity.id
    )
  })).filter((group) => group.sources.length > 1);
}
async function getCandidatePotentialDuplicates(candidateId, userId) {
  const candidate = await getCandidateById(candidateId);
  if (!candidate)
    return [];
  const candidateContext = await getCandidateIdentityContext(candidate.id);
  const userCandidates = await getUserCandidates(userId);
  const normalizedCandidate = normalizeDuplicateCandidate(candidate);
  const resolvedPairKeys = await getResolvedCandidateDuplicatePairKeys(userId);
  const scored = [];
  for (const otherCandidate of userCandidates) {
    if (otherCandidate.id === candidate.id)
      continue;
    if (resolvedPairKeys.has(
      candidateDuplicatePairKey(candidate.id, otherCandidate.id)
    )) {
      continue;
    }
    const otherContext = await getCandidateIdentityContext(otherCandidate.id);
    if (candidateContext.identity && otherContext.identity && candidateContext.identity.id === otherContext.identity.id) {
      continue;
    }
    const otherNormalized = normalizeDuplicateCandidate(otherCandidate);
    const reasons = [];
    let confidence = 0;
    if (normalizedCandidate.email && normalizedCandidate.email === otherNormalized.email) {
      reasons.push("same email");
      confidence = Math.max(confidence, 100);
    }
    if (normalizedCandidate.phone && normalizedCandidate.phone === otherNormalized.phone) {
      reasons.push("same phone");
      confidence = Math.max(confidence, 95);
    }
    if (normalizedCandidate.profileUrl && normalizedCandidate.profileUrl === otherNormalized.profileUrl) {
      reasons.push("same profile URL");
      confidence = Math.max(confidence, 90);
    }
    if (normalizedCandidate.name && normalizedCandidate.location && normalizedCandidate.name === otherNormalized.name && normalizedCandidate.location === otherNormalized.location) {
      reasons.push("same name and location");
      confidence = Math.max(confidence, 70);
    }
    if (confidence > 0) {
      scored.push({
        candidate: otherCandidate,
        identity: otherContext.identity,
        source: otherContext.source,
        sources: otherContext.sources,
        confidence,
        reasons
      });
    }
  }
  return scored.sort((a, b) => b.confidence - a.confidence);
}
async function mergeCandidateIdentitySources(input) {
  const targetCandidate = await getCandidateById(input.targetCandidateId);
  const sourceCandidate = await getCandidateById(input.sourceCandidateId);
  if (!targetCandidate || !sourceCandidate) {
    throw new Error("Candidate not found");
  }
  let targetContext = await getCandidateIdentityContext(targetCandidate.id);
  let sourceContext = await getCandidateIdentityContext(sourceCandidate.id);
  if (!targetContext.identity) {
    await getOrCreateCandidateIdentity(targetCandidate, input.userId);
    targetContext = await getCandidateIdentityContext(targetCandidate.id);
  }
  if (!sourceContext.identity) {
    await getOrCreateCandidateIdentity(sourceCandidate, input.userId);
    sourceContext = await getCandidateIdentityContext(sourceCandidate.id);
  }
  if (!targetContext.identity || !sourceContext.identity) {
    throw new Error("Candidate identity could not be resolved");
  }
  if (targetContext.identity.userId !== input.userId) {
    throw new Error("Target identity is not owned by this user");
  }
  if (sourceContext.identity.userId !== input.userId) {
    throw new Error("Source identity is not owned by this user");
  }
  if (targetContext.identity.id === sourceContext.identity.id) {
    return {
      targetIdentityId: targetContext.identity.id,
      sourceIdentityId: sourceContext.identity.id,
      movedSourceCount: 0,
      alreadyMerged: true
    };
  }
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const movedSources = store.candidateSources.filter(
      (source) => source.candidateIdentityId === sourceContext.identity.id
    );
    movedSources.forEach((source) => {
      source.candidateIdentityId = targetContext.identity.id;
      source.lastSeenAt = /* @__PURE__ */ new Date();
    });
    const targetIdentity = store.candidateIdentities.find(
      (identity) => identity.id === targetContext.identity.id
    );
    if (targetIdentity) {
      targetIdentity.canonicalEmail = targetIdentity.canonicalEmail ?? sourceContext.identity.canonicalEmail ?? null;
      targetIdentity.canonicalPhone = targetIdentity.canonicalPhone ?? sourceContext.identity.canonicalPhone ?? null;
      targetIdentity.location = targetIdentity.location ?? sourceContext.identity.location ?? null;
      targetIdentity.updatedAt = /* @__PURE__ */ new Date();
    }
    store.candidateIdentities = store.candidateIdentities.filter(
      (identity) => identity.id !== sourceContext.identity.id
    );
    persistLocalStore();
    return {
      targetIdentityId: targetContext.identity.id,
      sourceIdentityId: sourceContext.identity.id,
      movedSourceCount: movedSources.length,
      alreadyMerged: false
    };
  }
  await db.update(candidateSources).set({
    candidateIdentityId: targetContext.identity.id,
    lastSeenAt: /* @__PURE__ */ new Date()
  }).where(eq(candidateSources.candidateIdentityId, sourceContext.identity.id));
  await db.update(candidateIdentities).set({
    canonicalEmail: targetContext.identity.canonicalEmail ?? sourceContext.identity.canonicalEmail,
    canonicalPhone: targetContext.identity.canonicalPhone ?? sourceContext.identity.canonicalPhone,
    location: targetContext.identity.location ?? sourceContext.identity.location,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq(candidateIdentities.id, targetContext.identity.id));
  await db.delete(candidateIdentities).where(eq(candidateIdentities.id, sourceContext.identity.id));
  return {
    targetIdentityId: targetContext.identity.id,
    sourceIdentityId: sourceContext.identity.id,
    movedSourceCount: sourceContext.sources.length,
    alreadyMerged: false
  };
}
async function getCandidateIdentityContext(candidateId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const source2 = store.candidateSources.find(
      (entry) => entry.candidateId === candidateId
    );
    const identity = source2 ? store.candidateIdentities.find(
      (entry) => entry.id === source2.candidateIdentityId
    ) ?? null : null;
    const sources2 = identity ? store.candidateSources.filter(
      (entry) => entry.candidateIdentityId === identity.id
    ) : [];
    return { identity, source: source2 ?? null, sources: sources2 };
  }
  const sourceResult = await db.select().from(candidateSources).where(eq(candidateSources.candidateId, candidateId)).limit(1);
  const source = sourceResult[0] ?? null;
  if (!source)
    return { identity: null, source: null, sources: [] };
  const identityResult = await db.select().from(candidateIdentities).where(eq(candidateIdentities.id, source.candidateIdentityId)).limit(1);
  const sources = await db.select().from(candidateSources).where(
    eq(candidateSources.candidateIdentityId, source.candidateIdentityId)
  );
  return { identity: identityResult[0] ?? null, source, sources };
}
function ensureLocalCandidateSource(candidateIdentityId, candidate) {
  const store = getLocalStore();
  const existing = store.candidateSources.find(
    (source2) => source2.candidateId === candidate.id
  );
  if (existing) {
    existing.lastSeenAt = /* @__PURE__ */ new Date();
    return existing.id;
  }
  const now = /* @__PURE__ */ new Date();
  const source = {
    id: nextLocalId("candidateSource"),
    candidateIdentityId,
    candidateId: candidate.id,
    platformId: candidate.platformId,
    externalId: candidate.externalId ?? null,
    profileUrl: candidate.profileUrl ?? null,
    profileHash: createProfileHash(candidate),
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now
  };
  store.candidateSources.push(source);
  return source.id;
}
async function ensureDbCandidateSource(candidateIdentityId, candidate) {
  const db = await getDb();
  if (!db)
    return ensureLocalCandidateSource(candidateIdentityId, candidate);
  const existing = await db.select().from(candidateSources).where(eq(candidateSources.candidateId, candidate.id)).limit(1);
  if (existing[0])
    return existing[0].id;
  const result = await db.insert(candidateSources).values({
    candidateIdentityId,
    candidateId: candidate.id,
    platformId: candidate.platformId,
    externalId: candidate.externalId,
    profileUrl: candidate.profileUrl,
    profileHash: createProfileHash(candidate)
  });
  return Number(result[0].insertId);
}
function createProfileHash(candidate) {
  const normalized = [
    candidate.name?.toLowerCase(),
    candidate.email?.toLowerCase(),
    candidate.phone?.replace(/\D/g, ""),
    candidate.profileUrl?.toLowerCase()
  ].filter(Boolean).join("|");
  return Buffer.from(normalized).toString("base64url").slice(0, 128);
}
function normalizeDuplicateCandidate(candidate) {
  return {
    name: candidate.name?.trim().toLowerCase() ?? "",
    email: candidate.email?.trim().toLowerCase() ?? "",
    phone: candidate.phone?.replace(/\D/g, "") ?? "",
    profileUrl: candidate.profileUrl?.trim().toLowerCase() ?? "",
    location: candidate.location?.trim().toLowerCase() ?? ""
  };
}
function candidateDuplicatePairKey(candidateAId, candidateBId) {
  const [firstId, secondId] = [candidateAId, candidateBId].sort(
    (a, b) => a - b
  );
  return `${firstId}:${secondId}`;
}
async function getResolvedCandidateDuplicatePairKeys(userId) {
  const db = await getDb();
  const resolutions = db ? await db.select().from(candidateDuplicateResolutions).where(eq(candidateDuplicateResolutions.userId, userId)) : getLocalStore().candidateDuplicateResolutions.filter(
    (resolution) => resolution.userId === userId
  );
  return new Set(
    resolutions.map(
      (resolution) => candidateDuplicatePairKey(
        resolution.targetCandidateId,
        resolution.sourceCandidateId
      )
    )
  );
}
async function createCandidateDuplicateResolution(input) {
  const now = /* @__PURE__ */ new Date();
  const db = await getDb();
  if (!db) {
    const resolution = {
      id: nextLocalId("candidateDuplicateResolution"),
      userId: input.userId,
      targetCandidateId: input.targetCandidateId,
      sourceCandidateId: input.sourceCandidateId,
      decision: input.decision,
      confidence: input.confidence ?? 0,
      reasonsJson: input.reasons ? JSON.stringify(input.reasons) : null,
      decisionReason: input.reason,
      resolvedAt: now,
      createdAt: now
    };
    getLocalStore().candidateDuplicateResolutions.push(resolution);
    persistLocalStore();
    return resolution.id;
  }
  const result = await db.insert(candidateDuplicateResolutions).values({
    userId: input.userId,
    targetCandidateId: input.targetCandidateId,
    sourceCandidateId: input.sourceCandidateId,
    decision: input.decision,
    confidence: input.confidence ?? 0,
    reasonsJson: input.reasons ? JSON.stringify(input.reasons) : null,
    decisionReason: input.reason,
    resolvedAt: now
  });
  return Number(result[0].insertId);
}
async function getCampaignStats(campaignId) {
  const db = await getDb();
  const campaign = await getCampaignById(campaignId);
  if (!campaign)
    return null;
  if (!db) {
    const store = getLocalStore();
    return {
      ...campaign,
      totalCandidates: store.candidates.filter(
        (candidate) => candidate.campaignId === campaignId
      ).length,
      messagesSent: store.messages.filter(
        (message) => message.campaignId === campaignId && message.status === "sent"
      ).length,
      responsesReceived: store.messages.filter(
        (message) => message.campaignId === campaignId && message.status === "responded"
      ).length
    };
  }
  const totalCandidates = await db.select({ count: sql`count(*)` }).from(candidates).where(eq(candidates.campaignId, campaignId));
  const messagesSent = await db.select({ count: sql`count(*)` }).from(messages).where(
    and(eq(messages.campaignId, campaignId), eq(messages.status, "sent"))
  );
  const responsesReceived = await db.select({ count: sql`count(*)` }).from(messages).where(
    and(eq(messages.campaignId, campaignId), eq(messages.status, "responded"))
  );
  return {
    ...campaign,
    totalCandidates: totalCandidates[0]?.count || 0,
    messagesSent: messagesSent[0]?.count || 0,
    responsesReceived: responsesReceived[0]?.count || 0
  };
}
var _db, RECENT_CREDENTIAL_EVENT_LIMIT, credentialEventSecretPattern, DEFAULT_PLATFORMS, DEFAULT_PLATFORM_INSERTS, dateFields, localStore;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    init_platformCapabilities();
    init_safeSerialization();
    _db = null;
    RECENT_CREDENTIAL_EVENT_LIMIT = 3;
    credentialEventSecretPattern = /\b(password|passphrase|api[-_\s]?key|token|session|cookie|authorization)\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]+/i;
    DEFAULT_PLATFORMS = [
      {
        id: 1,
        name: "Indeed",
        baseUrl: "https://www.indeed.com",
        authType: "credentials",
        isActive: 1,
        createdAt: /* @__PURE__ */ new Date(0)
      },
      {
        id: 2,
        name: "Nationale Hulpgids",
        baseUrl: "https://www.nationalehulpgids.nl",
        authType: "credentials",
        isActive: 1,
        createdAt: /* @__PURE__ */ new Date(0)
      },
      {
        id: 3,
        name: "PGBvacatures",
        baseUrl: "https://www.pgbvacatures.nl",
        authType: "credentials",
        isActive: 1,
        createdAt: /* @__PURE__ */ new Date(0)
      },
      {
        id: 4,
        name: "Zorgbanen",
        baseUrl: "https://www.zorgbanen.nl",
        authType: "credentials",
        isActive: 1,
        createdAt: /* @__PURE__ */ new Date(0)
      },
      {
        id: 5,
        name: "Jobbird",
        baseUrl: "https://www.jobbird.com",
        authType: "credentials",
        isActive: 1,
        createdAt: /* @__PURE__ */ new Date(0)
      }
    ];
    DEFAULT_PLATFORM_INSERTS = DEFAULT_PLATFORMS.map(
      ({ id: _id, createdAt: _createdAt, ...platform }) => platform
    );
    dateFields = /* @__PURE__ */ new Set([
      "createdAt",
      "updatedAt",
      "lastSignedIn",
      "scheduledFor",
      "lastExecutedAt",
      "nextExecutionAt",
      "discoveredAt",
      "sentAt",
      "deliveredAt",
      "respondedAt",
      "lastSyncAt",
      "scheduledAt",
      "firstSeenAt",
      "lastSeenAt",
      "decidedAt",
      "startedAt",
      "finishedAt",
      "receivedAt",
      "resolvedAt"
    ]);
    localStore = null;
  }
});

// server/services/rateLimiter.ts
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
async function consumeApiLimit(userId, points = 1) {
  try {
    return await apiLimiter.consume(userId.toString(), points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1e3) || 1;
      throw new Error(`Rate limit exceeded. Try again in ${secs} seconds.`);
    }
    throw rejRes;
  }
}
async function consumeScraperLimit(platform, points = 1) {
  const limiter = scraperLimiters[platform];
  if (!limiter) {
    console.warn(
      `[RateLimiter] No rate limiter configured for platform: ${platform}`
    );
    return {};
  }
  try {
    return await limiter.consume(platform, points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1e3) || 1;
      throw new Error(
        `Scraper rate limit exceeded for ${platform}. Try again in ${secs} seconds.`
      );
    }
    throw rejRes;
  }
}
async function consumeMessageLimit(platform, points = 1) {
  const limiter = messageLimiters[platform];
  if (!limiter) {
    console.warn(
      `[RateLimiter] No message rate limiter configured for platform: ${platform}`
    );
    return {};
  }
  try {
    return await limiter.consume(platform, points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1e3) || 1;
      throw new Error(
        `Message rate limit exceeded for ${platform}. Try again in ${secs} seconds.`
      );
    }
    throw rejRes;
  }
}
var apiLimiter, scraperLimiters, messageLimiters, authLimiter;
var init_rateLimiter = __esm({
  "server/services/rateLimiter.ts"() {
    "use strict";
    apiLimiter = new RateLimiterMemory({
      keyPrefix: "api",
      points: 100,
      // 100 requests
      duration: 60,
      // per 60 seconds
      blockDuration: 60 * 10
      // Block for 10 minutes if exceeded
    });
    scraperLimiters = {
      "Nationale Hulpgids": new RateLimiterMemory({
        keyPrefix: "scraper:nationale-hulpgids",
        points: 10,
        // 10 requests
        duration: 60,
        // per minute
        blockDuration: 60 * 5
        // Block for 5 minutes
      }),
      Indeed: new RateLimiterMemory({
        keyPrefix: "scraper:indeed",
        points: 20,
        // 20 requests
        duration: 60,
        // per minute
        blockDuration: 60 * 5
      }),
      PGBvacatures: new RateLimiterMemory({
        keyPrefix: "scraper:pgbvacatures",
        points: 15,
        // 15 requests
        duration: 60,
        // per minute
        blockDuration: 60 * 5
      }),
      Zorgbanen: new RateLimiterMemory({
        keyPrefix: "scraper:zorgbanen",
        points: 15,
        // 15 requests
        duration: 60,
        // per minute
        blockDuration: 60 * 5
      }),
      Jobbird: new RateLimiterMemory({
        keyPrefix: "scraper:jobbird",
        points: 20,
        // 20 requests
        duration: 60,
        // per minute
        blockDuration: 60 * 5
      })
    };
    messageLimiters = {
      "Nationale Hulpgids": new RateLimiterMemory({
        keyPrefix: "message:nationale-hulpgids",
        points: 5,
        // 5 messages
        duration: 60,
        // per minute
        blockDuration: 60 * 10
        // Block for 10 minutes
      }),
      Indeed: new RateLimiterMemory({
        keyPrefix: "message:indeed",
        points: 10,
        // 10 messages
        duration: 60,
        // per minute
        blockDuration: 60 * 10
      }),
      PGBvacatures: new RateLimiterMemory({
        keyPrefix: "message:pgbvacatures",
        points: 8,
        // 8 messages
        duration: 60,
        // per minute
        blockDuration: 60 * 10
      }),
      Zorgbanen: new RateLimiterMemory({
        keyPrefix: "message:zorgbanen",
        points: 8,
        // 8 messages
        duration: 60,
        // per minute
        blockDuration: 60 * 10
      }),
      Jobbird: new RateLimiterMemory({
        keyPrefix: "message:jobbird",
        points: 10,
        // 10 messages
        duration: 60,
        // per minute
        blockDuration: 60 * 10
      })
    };
    authLimiter = new RateLimiterMemory({
      keyPrefix: "auth",
      points: 5,
      // 5 attempts
      duration: 60 * 15,
      // per 15 minutes
      blockDuration: 60 * 60
      // Block for 1 hour
    });
  }
});

// server/services/campaignSafety.ts
function normalizeCampaignSafetyPolicy(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    dailySendLimit: normalizeDailySendLimit(source.dailySendLimit),
    quietHoursStart: normalizeQuietHour(
      source.quietHoursStart,
      DEFAULT_CAMPAIGN_SAFETY_POLICY.quietHoursStart,
      "quietHoursStart"
    ),
    quietHoursEnd: normalizeQuietHour(
      source.quietHoursEnd,
      DEFAULT_CAMPAIGN_SAFETY_POLICY.quietHoursEnd,
      "quietHoursEnd"
    )
  };
}
function mergeCampaignSafetyPolicy(criteria) {
  const safetyPolicy = normalizeCampaignSafetyPolicy(criteria.safetyPolicy);
  if (safetyPolicy.quietHoursStart === safetyPolicy.quietHoursEnd) {
    throw new Error("Quiet hours start and end must be different.");
  }
  return {
    ...criteria,
    operationMode: normalizeCampaignOperationMode(criteria.operationMode),
    safetyPolicy
  };
}
function parseCampaignSearchCriteria(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Campaign searchCriteria must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Campaign searchCriteria must be a JSON object.");
  }
  return mergeCampaignSafetyPolicy(parsed);
}
function isWithinQuietHours(date, policy) {
  const current = getMinutesOfDay(date);
  const start = getMinutesFromTime(policy.quietHoursStart);
  const end = getMinutesFromTime(policy.quietHoursEnd);
  if (start === end)
    return false;
  if (start < end)
    return current >= start && current < end;
  return current >= start || current < end;
}
function normalizeCampaignOperationMode(value) {
  if (value === "dry_run")
    return "dry_run";
  if (value === "reviewed_outreach" || value === void 0 || value === null) {
    return "reviewed_outreach";
  }
  throw new Error(
    "Campaign operation mode must be dry_run or reviewed_outreach."
  );
}
function isDryRunSearchCriteria(searchCriteria) {
  return parseCampaignSearchCriteria(searchCriteria || "{}").operationMode === "dry_run";
}
function getQuietHoursEnd(date, policy) {
  const endMinutes = getMinutesFromTime(policy.quietHoursEnd);
  const endDate = new Date(date);
  endDate.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  if (endDate <= date) {
    endDate.setDate(endDate.getDate() + 1);
  }
  return endDate;
}
function getScheduledExecutionDecision(searchCriteria, now = /* @__PURE__ */ new Date()) {
  const safetyPolicy = normalizeCampaignSafetyPolicy(
    searchCriteria.safetyPolicy
  );
  const quietHoursActive = isWithinQuietHours(now, safetyPolicy);
  return {
    safetyPolicy,
    quietHoursActive,
    nextAllowedExecutionAt: quietHoursActive ? getQuietHoursEnd(now, safetyPolicy) : now
  };
}
function countSuccessfulSendsToday(attempts, now = /* @__PURE__ */ new Date()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return attempts.filter((attempt) => {
    if (attempt.status !== "succeeded")
      return false;
    const timestamp2 = new Date(attempt.finishedAt ?? attempt.createdAt);
    return timestamp2 >= dayStart && timestamp2 <= now;
  }).length;
}
function normalizeDailySendLimit(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim().length > 0 ? Number(value) : DEFAULT_CAMPAIGN_SAFETY_POLICY.dailySendLimit;
  if (!Number.isInteger(parsed)) {
    throw new Error("Daily send limit must be a whole number.");
  }
  if (parsed < MIN_DAILY_SEND_LIMIT || parsed > MAX_DAILY_SEND_LIMIT) {
    throw new Error(
      `Daily send limit must be between ${MIN_DAILY_SEND_LIMIT} and ${MAX_DAILY_SEND_LIMIT}.`
    );
  }
  return parsed;
}
function normalizeQuietHour(value, fallback, field) {
  const normalized = typeof value === "string" ? value.trim() : fallback;
  if (!TIME_PATTERN.test(normalized)) {
    throw new Error(`${field} must use HH:mm 24-hour time.`);
  }
  return normalized;
}
function getMinutesFromTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function getMinutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}
var DEFAULT_CAMPAIGN_SAFETY_POLICY, MIN_DAILY_SEND_LIMIT, MAX_DAILY_SEND_LIMIT, TIME_PATTERN;
var init_campaignSafety = __esm({
  "server/services/campaignSafety.ts"() {
    "use strict";
    DEFAULT_CAMPAIGN_SAFETY_POLICY = {
      dailySendLimit: 5,
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00"
    };
    MIN_DAILY_SEND_LIMIT = 1;
    MAX_DAILY_SEND_LIMIT = 20;
    TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
  }
});

// server/services/outreachLedger.ts
var outreachLedger_exports = {};
__export(outreachLedger_exports, {
  classifyResponse: () => classifyResponse,
  getCampaignReadiness: () => getCampaignReadiness,
  getOperatingLedger: () => getOperatingLedger,
  recordReadinessSnapshot: () => recordReadinessSnapshot
});
function classifyResponse(content) {
  const normalized = content.toLowerCase();
  if (/\b(ja|zeker|interesse|interessant|graag|beschikbaar|bel|afspraak)\b/i.test(
    normalized
  )) {
    return { classification: "interested", confidence: 80 };
  }
  if (/\b(niet geinteresseerd|geen interesse|nee|stop|afmelden|niet benader)\b/i.test(
    normalized
  )) {
    return { classification: "not_interested", confidence: 85 };
  }
  if (/\b(meer informatie|info|voorwaarden|tarief|uren|wanneer|wat houdt)\b/i.test(
    normalized
  )) {
    return { classification: "more_info", confidence: 75 };
  }
  if (/\b(niet beschikbaar|vol|geen tijd|vakantie|ziek)\b/i.test(normalized)) {
    return { classification: "unavailable", confidence: 80 };
  }
  return { classification: "unknown", confidence: 35 };
}
async function getCampaignReadiness(campaign, userId) {
  const platforms2 = await getAllPlatforms();
  const credentials = await getUserPlatformCredentials(userId);
  const candidates2 = await getCampaignCandidates(campaign.id);
  const messages2 = await getCampaignMessages(campaign.id);
  const approvals = await getMessageApprovalsForCampaign(campaign.id);
  const attempts = await getMessageSendAttemptsForCampaign(campaign.id);
  const rateLimitEvents2 = await getRateLimitEventsForCampaign(campaign.id);
  const targetPlatformIds = parseTargetPlatformIds(campaign.targetPlatforms);
  const criteria = parseJson(
    campaign.searchCriteria,
    {}
  );
  const credentialByPlatformId = new Map(
    credentials.map((credential) => [credential.platformId, credential])
  );
  const checks = [];
  checks.push({
    key: "platforms",
    label: "Target platforms",
    status: targetPlatformIds.length > 0 ? "pass" : "blocked",
    detail: targetPlatformIds.length > 0 ? `${targetPlatformIds.length} platform${targetPlatformIds.length === 1 ? "" : "s"} selected` : "Select at least one platform before running discovery"
  });
  checks.push({
    key: "criteria",
    label: "Search criteria",
    status: hasUsefulCriteria(criteria) ? "pass" : "warning",
    detail: hasUsefulCriteria(criteria) ? "Campaign has usable location/service/search criteria" : "Add location, services, or experience criteria to reduce noisy results"
  });
  try {
    const operationMode = normalizeCampaignOperationMode(
      criteria.operationMode
    );
    checks.push({
      key: "operation-mode",
      label: "Operation mode",
      status: "pass",
      detail: operationMode === "dry_run" ? "Dry-run mode: discovery and draft generation are allowed, but approvals and external send attempts are blocked." : "Reviewed outreach mode: sends remain approval-gated and require delivery evidence."
    });
  } catch (error) {
    checks.push({
      key: "operation-mode",
      label: "Operation mode",
      status: "blocked",
      detail: error instanceof Error ? error.message : "Campaign operation mode is invalid"
    });
  }
  try {
    const safetyPolicy = normalizeCampaignSafetyPolicy(criteria.safetyPolicy);
    checks.push({
      key: "campaign-safety-policy",
      label: "Campaign safety policy",
      status: "pass",
      detail: `Daily send cap ${safetyPolicy.dailySendLimit}; quiet hours ${safetyPolicy.quietHoursStart}-${safetyPolicy.quietHoursEnd}`
    });
  } catch (error) {
    checks.push({
      key: "campaign-safety-policy",
      label: "Campaign safety policy",
      status: "blocked",
      detail: error instanceof Error ? error.message : "Campaign safety policy is invalid"
    });
  }
  const missingCredentials = targetPlatformIds.map((id) => platforms2.find((platform) => platform.id === id)).filter(Boolean).filter((platform) => {
    if (!getPlatformCapability(platform.name).supportsAuthenticatedAutomation)
      return false;
    const credential = credentialByPlatformId.get(platform.id);
    return !credential || credential.isConnected !== 1 || !!credential.lastError;
  });
  const publicOnlyPlatforms = targetPlatformIds.map((id) => platforms2.find((platform) => platform.id === id)).filter(Boolean).filter(
    (platform) => !getPlatformCapability(platform.name).supportsAuthenticatedAutomation
  );
  checks.push({
    key: "credentials",
    label: "Platform credentials",
    status: missingCredentials.length === 0 ? "pass" : "blocked",
    detail: missingCredentials.length === 0 ? publicOnlyPlatforms.length > 0 ? "Authenticated platforms are verified; public-only platforms can run discovery without credentials" : "Selected platforms have verified credentials" : `${missingCredentials.map((platform) => platform.name).join(", ")} need verified credentials before authenticated automation can run`
  });
  const queuedMessages = messages2.filter(
    (message) => message.status === "queued"
  );
  const approvedMessages = messages2.filter(
    (message) => message.status === "approved"
  );
  const approvalIds = new Set(
    approvals.filter((approval) => approval.decision === "approved").map((approval) => approval.messageId)
  );
  const approvedWithoutRecord = approvedMessages.filter(
    (message) => !approvalIds.has(message.id)
  );
  checks.push({
    key: "approval-gate",
    label: "Approval gate",
    status: approvedWithoutRecord.length === 0 ? "pass" : "warning",
    detail: queuedMessages.length > 0 ? `${queuedMessages.length} message${queuedMessages.length === 1 ? "" : "s"} still require review` : approvedMessages.length > 0 ? `${approvedMessages.length} approved message${approvedMessages.length === 1 ? "" : "s"} ready` : "No queued or approved messages yet"
  });
  const failedAttempts = attempts.filter(
    (attempt) => attempt.status === "failed" || attempt.status === "blocked"
  );
  checks.push({
    key: "send-attempts",
    label: "Send attempt health",
    status: failedAttempts.length === 0 ? "pass" : "warning",
    detail: failedAttempts.length === 0 ? "No failed or blocked send attempts recorded" : `${failedAttempts.length} send attempt${failedAttempts.length === 1 ? "" : "s"} need review`
  });
  const recentRateLimitEvents = rateLimitEvents2.filter((event) => {
    return Date.now() - new Date(event.createdAt).getTime() < 60 * 60 * 1e3;
  });
  const recentBlockedRateLimits = recentRateLimitEvents.filter(
    (event) => event.severity === "blocked"
  );
  checks.push({
    key: "rate-limit-safety",
    label: "Platform rate limits",
    status: recentBlockedRateLimits.length > 0 ? "blocked" : recentRateLimitEvents.length > 0 ? "warning" : "pass",
    detail: recentBlockedRateLimits.length > 0 ? `${recentBlockedRateLimits.length} platform rate-limit block${recentBlockedRateLimits.length === 1 ? "" : "s"} in the last hour. Pause sending until the platform window resets.` : recentRateLimitEvents.length > 0 ? `${recentRateLimitEvents.length} platform rate-limit warning${recentRateLimitEvents.length === 1 ? "" : "s"} in the last hour` : "No recent platform rate-limit blocks recorded"
  });
  const blockers = checks.filter((check) => check.status === "blocked").map((check) => check.detail);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => check.detail);
  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";
  return {
    campaignId: campaign.id,
    status,
    checks,
    blockers,
    warnings
  };
}
async function recordReadinessSnapshot(campaign, userId) {
  const readiness = await getCampaignReadiness(campaign, userId);
  await recordCampaignReadinessCheck({
    campaignId: campaign.id,
    userId,
    status: readiness.status,
    checksJson: JSON.stringify(readiness.checks),
    blockersJson: JSON.stringify(readiness.blockers),
    warningsJson: JSON.stringify(readiness.warnings)
  });
  return readiness;
}
async function getOperatingLedger(campaign, userId) {
  const [
    readiness,
    candidates2,
    messages2,
    approvals,
    attempts,
    responses,
    qualificationDecisionRecords,
    auditEvents2,
    rateLimitEvents2
  ] = await Promise.all([
    getCampaignReadiness(campaign, userId),
    getCampaignCandidates(campaign.id),
    getCampaignMessages(campaign.id),
    getMessageApprovalsForCampaign(campaign.id),
    getMessageSendAttemptsForCampaign(campaign.id),
    getCandidateResponsesForCampaign(campaign.id),
    getCandidateQualificationDecisionsForCampaign(campaign.id),
    getAuditEventsForCampaign(userId, campaign.id),
    getRateLimitEventsForCampaign(campaign.id)
  ]);
  const latestQualificationDecisions = getLatestQualificationDecisionsByCandidate(qualificationDecisionRecords);
  return {
    campaign,
    readiness,
    summary: summarizeLedger(
      candidates2,
      messages2,
      approvals,
      attempts,
      responses,
      latestQualificationDecisions
    ),
    quality: summarizeQuality(
      candidates2,
      messages2,
      attempts,
      responses,
      latestQualificationDecisions
    ),
    candidates: candidates2,
    messages: messages2,
    approvals,
    sendAttempts: attempts,
    responses,
    qualificationDecisions: qualificationDecisionRecords,
    latestQualificationDecisions: Array.from(
      latestQualificationDecisions.values()
    ),
    auditEvents: auditEvents2,
    rateLimitEvents: rateLimitEvents2,
    nextActions: buildNextActions(
      readiness,
      candidates2,
      messages2,
      attempts,
      responses,
      latestQualificationDecisions
    )
  };
}
function summarizeQuality(candidates2, messages2, attempts, responses, latestQualificationDecisions) {
  const contactedMessages = messages2.filter(
    (message) => contactedMessageStatuses.has(message.status)
  );
  const respondedMessageIds = new Set(
    responses.map((response) => response.messageId).filter((messageId) => typeof messageId === "number")
  );
  const sentOrDeliveredMessages = messages2.filter(
    (message) => ["sent", "delivered"].includes(message.status)
  );
  const pendingResponses = sentOrDeliveredMessages.filter(
    (message) => !respondedMessageIds.has(message.id)
  ).length;
  const classificationBreakdown = Object.fromEntries(
    responseClassifications.map((classification) => [
      classification,
      responses.filter((response) => response.classification === classification).length
    ])
  );
  const rejectionBreakdown = {
    notInterested: classificationBreakdown.not_interested,
    unavailable: classificationBreakdown.unavailable,
    noResponse: classificationBreakdown.no_response
  };
  const totalRejections = rejectionBreakdown.notInterested + rejectionBreakdown.unavailable + rejectionBreakdown.noResponse;
  const succeededAttempts = attempts.filter(
    (attempt) => attempt.status === "succeeded"
  );
  const attemptsWithEvidence = succeededAttempts.filter(
    (attempt) => Boolean(attempt.externalMessageId) || Boolean(attempt.confirmationText)
  ).length;
  const responseTimesHours = responses.map((response) => {
    if (!response.messageId)
      return null;
    const message = messages2.find((entry) => entry.id === response.messageId);
    if (!message?.sentAt || !response.receivedAt)
      return null;
    const diffMs = new Date(response.receivedAt).getTime() - new Date(message.sentAt).getTime();
    return diffMs >= 0 ? diffMs / (1e3 * 60 * 60) : null;
  }).filter((value) => typeof value === "number");
  const averageResponseTimeHours = responseTimesHours.length > 0 ? roundToOneDecimal(
    responseTimesHours.reduce((total, value) => total + value, 0) / responseTimesHours.length
  ) : null;
  const qualificationBreakdown = summarizeQualifications(
    candidates2,
    latestQualificationDecisions
  );
  return {
    contacted: contactedMessages.length,
    responsesReceived: responses.length,
    responseRate: percentage(responses.length, contactedMessages.length),
    interested: classificationBreakdown.interested,
    acceptanceRate: percentage(
      classificationBreakdown.interested,
      responses.length
    ),
    pendingResponses,
    needsResponseReview: classificationBreakdown.unknown,
    moreInformationNeeded: classificationBreakdown.more_info,
    totalRejections,
    rejectionBreakdown,
    classificationBreakdown,
    sendFailureCount: attempts.filter(
      (attempt) => attempt.status === "failed" || attempt.status === "blocked"
    ).length,
    deliveryEvidenceRate: percentage(
      attemptsWithEvidence,
      succeededAttempts.length
    ),
    averageResponseTimeHours,
    qualificationBreakdown,
    qualifiedCandidates: qualificationBreakdown.qualified,
    candidatesNeedingQualificationReview: qualificationBreakdown.needs_review + qualificationBreakdown.awaiting_decision
  };
}
function summarizeLedger(candidates2, messages2, approvals, attempts, responses, latestQualificationDecisions) {
  const qualificationBreakdown = summarizeQualifications(
    candidates2,
    latestQualificationDecisions
  );
  return {
    candidatesDiscovered: candidates2.length,
    candidatesAboveThreshold: candidates2.filter(
      (candidate) => candidate.compatibilityScore >= 70
    ).length,
    messagesDrafted: messages2.length,
    messagesQueued: messages2.filter((message) => message.status === "queued").length,
    messagesApproved: messages2.filter((message) => message.status === "approved").length,
    messagesSent: messages2.filter(
      (message) => contactedMessageStatuses.has(message.status)
    ).length,
    approvalsApproved: approvals.filter(
      (approval) => approval.decision === "approved"
    ).length,
    approvalsRejected: approvals.filter(
      (approval) => approval.decision === "rejected"
    ).length,
    sendAttemptsFailed: attempts.filter(
      (attempt) => attempt.status === "failed" || attempt.status === "blocked"
    ).length,
    responsesReceived: responses.length,
    candidatesQualified: qualificationBreakdown.qualified,
    candidatesNotQualified: qualificationBreakdown.not_qualified,
    candidatesNeedsReview: qualificationBreakdown.needs_review,
    candidatesAwaitingQualification: qualificationBreakdown.awaiting_decision,
    followUpsDue: messages2.filter((message) => {
      if (!message.sentAt || ["responded", "replied"].includes(message.status))
        return false;
      return Date.now() - new Date(message.sentAt).getTime() > 5 * 24 * 60 * 60 * 1e3;
    }).length
  };
}
function getLatestQualificationDecisionsByCandidate(decisions) {
  const latest = /* @__PURE__ */ new Map();
  for (const decision of decisions) {
    const existing = latest.get(decision.candidateId);
    if (!existing || new Date(decision.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latest.set(decision.candidateId, decision);
    }
  }
  return latest;
}
function summarizeQualifications(candidates2, latestQualificationDecisions) {
  const breakdown = {
    qualified: 0,
    not_qualified: 0,
    needs_review: 0,
    awaiting_decision: 0
  };
  candidates2.forEach((candidate) => {
    const latestDecision = latestQualificationDecisions.get(candidate.id);
    if (!latestDecision) {
      breakdown.awaiting_decision += 1;
      return;
    }
    breakdown[latestDecision.decision] += 1;
  });
  return breakdown;
}
function percentage(part, total) {
  return total > 0 ? roundToOneDecimal(part / total * 100) : 0;
}
function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10;
}
function buildNextActions(readiness, candidates2, messages2, attempts, responses, latestQualificationDecisions) {
  const actions = [];
  readiness.blockers.forEach((blocker) => {
    actions.push({ priority: "high", label: "Fix blocker", detail: blocker });
  });
  const queued = messages2.filter((message) => message.status === "queued").length;
  if (queued > 0) {
    actions.push({
      priority: "medium",
      label: "Review messages",
      detail: `${queued} queued message${queued === 1 ? "" : "s"} need approval or rejection`
    });
  }
  const qualificationBreakdown = summarizeQualifications(
    candidates2,
    latestQualificationDecisions
  );
  const qualificationReviewCount = qualificationBreakdown.awaiting_decision + qualificationBreakdown.needs_review;
  if (qualificationReviewCount > 0) {
    actions.push({
      priority: "medium",
      label: "Review candidate qualification",
      detail: `${qualificationReviewCount} candidate${qualificationReviewCount === 1 ? "" : "s"} need a current qualification decision`
    });
  }
  const failed = attempts.filter(
    (attempt) => attempt.status === "failed" || attempt.status === "blocked"
  ).length;
  if (failed > 0) {
    actions.push({
      priority: "medium",
      label: "Review send failures",
      detail: `${failed} send attempt${failed === 1 ? "" : "s"} failed or were blocked`
    });
  }
  if (readiness.checks.some(
    (check) => check.key === "rate-limit-safety" && check.status === "blocked"
  )) {
    actions.push({
      priority: "high",
      label: "Pause sending",
      detail: "A platform rate-limit block was recorded recently. Wait for the platform window to reset before recording more sends."
    });
  }
  const needsClassification = responses.filter(
    (response) => response.classification === "unknown"
  ).length;
  if (needsClassification > 0) {
    actions.push({
      priority: "low",
      label: "Classify responses",
      detail: `${needsClassification} response${needsClassification === 1 ? "" : "s"} need review`
    });
  }
  if (actions.length === 0) {
    actions.push({
      priority: "low",
      label: "No immediate blockers",
      detail: "Campaign ledger is currently clear"
    });
  }
  return actions;
}
function parseTargetPlatformIds(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
}
function parseJson(value, fallback) {
  if (!value)
    return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function hasUsefulCriteria(criteria) {
  return ["location", "services", "experience", "keywords"].some((key) => {
    const value = criteria[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}
var contactedMessageStatuses, responseClassifications;
var init_outreachLedger = __esm({
  "server/services/outreachLedger.ts"() {
    "use strict";
    init_db();
    init_campaignSafety();
    init_platformCapabilities();
    contactedMessageStatuses = /* @__PURE__ */ new Set([
      "sent",
      "delivered",
      "responded",
      "replied"
    ]);
    responseClassifications = [
      "interested",
      "not_interested",
      "more_info",
      "unavailable",
      "no_response",
      "unknown"
    ];
  }
});

// server/_core/llm.ts
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages: messages2,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gemini-2.5-flash",
    messages: messages2.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = params.maxTokens || params.max_tokens || 4096;
  payload.thinking = {
    budget_tokens: 64
  };
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
var ensureArray, normalizeContentPart, normalizeMessage, normalizeToolChoice, resolveApiUrl, assertApiKey, normalizeResponseFormat;
var init_llm = __esm({
  "server/_core/llm.ts"() {
    "use strict";
    init_env();
    ensureArray = (value) => Array.isArray(value) ? value : [value];
    normalizeContentPart = (part) => {
      if (typeof part === "string") {
        return { type: "text", text: part };
      }
      if (part.type === "text") {
        return part;
      }
      if (part.type === "image_url") {
        return part;
      }
      if (part.type === "file_url") {
        return part;
      }
      throw new Error("Unsupported message content part");
    };
    normalizeMessage = (message) => {
      const { role, name, tool_call_id } = message;
      if (role === "tool" || role === "function") {
        const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
        return {
          role,
          name,
          tool_call_id,
          content
        };
      }
      const contentParts = ensureArray(message.content).map(normalizeContentPart);
      if (contentParts.length === 1 && contentParts[0].type === "text") {
        return {
          role,
          name,
          content: contentParts[0].text
        };
      }
      return {
        role,
        name,
        content: contentParts
      };
    };
    normalizeToolChoice = (toolChoice, tools) => {
      if (!toolChoice)
        return void 0;
      if (toolChoice === "none" || toolChoice === "auto") {
        return toolChoice;
      }
      if (toolChoice === "required") {
        if (!tools || tools.length === 0) {
          throw new Error(
            "tool_choice 'required' was provided but no tools were configured"
          );
        }
        if (tools.length > 1) {
          throw new Error(
            "tool_choice 'required' needs a single tool or specify the tool name explicitly"
          );
        }
        return {
          type: "function",
          function: { name: tools[0].function.name }
        };
      }
      if ("name" in toolChoice) {
        return {
          type: "function",
          function: { name: toolChoice.name }
        };
      }
      return toolChoice;
    };
    resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
    assertApiKey = () => {
      if (!ENV.forgeApiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
    };
    normalizeResponseFormat = ({
      responseFormat,
      response_format,
      outputSchema,
      output_schema
    }) => {
      const explicitFormat = responseFormat || response_format;
      if (explicitFormat) {
        if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
          throw new Error(
            "responseFormat json_schema requires a defined schema object"
          );
        }
        return explicitFormat;
      }
      const schema = outputSchema || output_schema;
      if (!schema)
        return void 0;
      if (!schema.name || !schema.schema) {
        throw new Error("outputSchema requires both name and schema");
      }
      return {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
        }
      };
    };
  }
});

// server/services/aiMatching.ts
var aiMatching_exports = {};
__export(aiMatching_exports, {
  calculateCompatibility: () => calculateCompatibility,
  generateOutreachMessage: () => generateOutreachMessage,
  normalizeOutreachDraftingOptions: () => normalizeOutreachDraftingOptions,
  saveMatchFactors: () => saveMatchFactors
});
function normalizeOutreachDraftingOptions(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const requestedTone = typeof source.tonePreset === "string" ? source.tonePreset : void 0;
  const tonePreset = isOutreachTonePreset(requestedTone) ? requestedTone : DEFAULT_OUTREACH_TONE;
  const templateSnippet = normalizeTemplateSnippet(source.templateSnippet);
  return templateSnippet ? { tonePreset, templateSnippet } : { tonePreset };
}
function isOutreachTonePreset(value) {
  return value === "careful" || value === "warm" || value === "concise";
}
function normalizeTemplateSnippet(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized)
    return void 0;
  return normalized.slice(0, MAX_TEMPLATE_SNIPPET_LENGTH);
}
function parseCandidateServices(services) {
  if (!services)
    return [];
  if (Array.isArray(services))
    return services.filter(
      (service) => typeof service === "string"
    );
  if (typeof services !== "string")
    return [];
  try {
    const parsed = JSON.parse(services);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (service) => typeof service === "string"
      );
    }
  } catch {
  }
  return services.split(",").map((service) => service.trim()).filter(Boolean);
}
async function calculateCompatibility(candidate, criteria) {
  const factors = [];
  if (candidate.distance !== void 0 && candidate.distance !== null && criteria.distance) {
    const distanceScore = Math.max(
      0,
      100 - candidate.distance / criteria.distance * 100
    );
    factors.push({
      factor: "location",
      score: Math.round(distanceScore),
      weight: 20,
      reasoning: `Candidate is ${candidate.distance}km away (max: ${criteria.distance}km)`
    });
  }
  if (candidate.services && criteria.services.length > 0) {
    const candidateServices = parseCandidateServices(candidate.services);
    const matchedServices = criteria.services.filter(
      (s) => candidateServices.some((cs) => cs.toLowerCase().includes(s.toLowerCase()))
    );
    const serviceScore = matchedServices.length / criteria.services.length * 100;
    factors.push({
      factor: "services",
      score: Math.round(serviceScore),
      weight: 25,
      reasoning: `Matched ${matchedServices.length}/${criteria.services.length} required services`
    });
  }
  if (candidate.hourlyRate && criteria.budget) {
    const rate = candidate.hourlyRate;
    const { min = 0, max = Infinity } = criteria.budget;
    const budgetScore = rate >= min && rate <= max ? 100 : Math.max(0, 100 - Math.abs(rate - max) / 100);
    factors.push({
      factor: "budget",
      score: Math.round(budgetScore),
      weight: 15,
      reasoning: `Hourly rate \u20AC${(rate / 100).toFixed(2)} (budget: \u20AC${(min / 100).toFixed(2)}-\u20AC${(max / 100).toFixed(2)})`
    });
  }
  if (candidate.experience && criteria.experience) {
    const experienceScore = await scoreExperienceMatch(
      candidate.experience,
      criteria.experience
    );
    factors.push({
      factor: "experience",
      score: experienceScore,
      weight: 15,
      reasoning: `Experience level matches requirements`
    });
  }
  if (candidate.availability && criteria.availability) {
    const availabilityScore = await scoreAvailabilityMatch(
      candidate.availability,
      criteria.availability
    );
    factors.push({
      factor: "availability",
      score: availabilityScore,
      weight: 10,
      reasoning: `Availability aligns with needs`
    });
  }
  if (criteria.specialNeeds && criteria.specialNeeds.length > 0) {
    const specialNeedsScore = await scoreSpecialNeedsMatch(
      candidate.bio || "",
      candidate.experience || "[]",
      criteria.specialNeeds
    );
    factors.push({
      factor: "special_needs",
      score: specialNeedsScore,
      weight: 15,
      reasoning: `Expertise in special care requirements`
    });
  }
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce(
    (sum, f) => sum + f.score * f.weight / 100,
    0
  );
  const compatibilityScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) : 0;
  const matchReasons = factors.filter((f) => f.score >= 70).map((f) => f.reasoning).slice(0, 3);
  let recommendation;
  if (compatibilityScore >= 80)
    recommendation = "excellent";
  else if (compatibilityScore >= 60)
    recommendation = "good";
  else if (compatibilityScore >= 40)
    recommendation = "fair";
  else
    recommendation = "poor";
  return {
    compatibilityScore,
    factors,
    matchReasons,
    recommendation
  };
}
async function scoreExperienceMatch(candidateExperience, requiredExperience) {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an expert at evaluating candidate experience. Score how well the candidate's experience matches the requirements on a scale of 0-100. Return only a JSON object with 'score' and 'reasoning' fields."
        },
        {
          role: "user",
          content: `Candidate experience: ${candidateExperience}

Required experience: ${requiredExperience}

Provide a compatibility score (0-100).`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "experience_score",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: {
                type: "integer",
                description: "Compatibility score 0-100"
              },
              reasoning: { type: "string", description: "Brief explanation" }
            },
            required: ["score", "reasoning"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === "string" ? content : "{}");
    return Math.min(100, Math.max(0, result.score || 50));
  } catch (error) {
    console.error("Error scoring experience match:", error);
    return 50;
  }
}
async function scoreAvailabilityMatch(candidateAvailability, requiredAvailability) {
  const candidate = candidateAvailability.toLowerCase();
  const required = requiredAvailability.toLowerCase();
  const timeKeywords = [
    "morning",
    "afternoon",
    "evening",
    "night",
    "weekday",
    "weekend",
    "24/7",
    "flexible"
  ];
  const matches = timeKeywords.filter(
    (keyword) => candidate.includes(keyword) && required.includes(keyword)
  );
  return Math.min(
    100,
    matches.length / Math.max(1, timeKeywords.filter((k) => required.includes(k)).length) * 100
  );
}
async function scoreSpecialNeedsMatch(bio, experience, specialNeeds) {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an expert at evaluating healthcare expertise. Score how well the candidate's background matches the special care needs on a scale of 0-100. Return only a JSON object with 'score' and 'reasoning' fields."
        },
        {
          role: "user",
          content: `Candidate bio: ${bio}

Candidate experience: ${experience}

Special needs: ${specialNeeds.join(", ")}

Provide a compatibility score (0-100).`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "special_needs_score",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: {
                type: "integer",
                description: "Compatibility score 0-100"
              },
              reasoning: { type: "string", description: "Brief explanation" }
            },
            required: ["score", "reasoning"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === "string" ? content : "{}");
    return Math.min(100, Math.max(0, result.score || 50));
  } catch (error) {
    console.error("Error scoring special needs match:", error);
    return 50;
  }
}
async function saveMatchFactors(candidateId, factors) {
  for (const factor of factors) {
    await createMatchFactor({
      candidateId,
      factor: factor.factor,
      score: factor.score,
      weight: factor.weight,
      reasoning: factor.reasoning
    });
  }
}
async function generateOutreachMessage(candidate, campaignDescription, language = "nl", options = {}) {
  const draftingOptions = normalizeOutreachDraftingOptions(options);
  const languageInstructions = language === "nl" ? "Write in Dutch (Nederlands). Use professional but friendly tone." : "Write in English. Use professional but friendly tone.";
  const templateInstruction = draftingOptions.templateSnippet ? ` Optional user-approved drafting note to incorporate when relevant, without making unsupported claims: ${draftingOptions.templateSnippet}` : "";
  const toneInstruction = OUTREACH_TONE_INSTRUCTIONS[draftingOptions.tonePreset];
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at writing personalized outreach messages for care workers and helpers. ${languageInstructions} ${toneInstruction} The message must be a draft for human review, should be factual, and should highlight why this specific person may be a good match.${templateInstruction}`
        },
        {
          role: "user",
          content: `Write a personalized outreach message to ${candidate.name} based on their profile:

Name: ${candidate.name}
Location: ${candidate.location}
Services: ${candidate.services}
Bio: ${candidate.bio}

Campaign description: ${campaignDescription}

Create a subject line and message body that feels personal and explains why they're a great match.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "outreach_message",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "Email subject line" },
              content: { type: "string", description: "Message body" }
            },
            required: ["subject", "content"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === "string" ? content : "{}");
    return {
      subject: result.subject || `Interessante kans voor ${candidate.name}`,
      content: result.content || `Beste ${candidate.name},

Ik kwam uw profiel tegen en denk dat u goed zou passen bij onze hulpvraag.

Met vriendelijke groet`
    };
  } catch (error) {
    console.error("Error generating outreach message:", error);
    const extraContext = draftingOptions.templateSnippet && draftingOptions.tonePreset !== "concise" ? language === "nl" ? `

Aanvullende context: ${draftingOptions.templateSnippet}` : `

Additional context: ${draftingOptions.templateSnippet}` : "";
    const reviewPrompt = draftingOptions.tonePreset === "careful" ? language === "nl" ? "Als dit aansluit, kom ik graag met u in contact om de mogelijkheden rustig te bespreken." : "If this is relevant for you, I would be glad to connect and discuss the possibilities." : language === "nl" ? "Graag kom ik met u in contact om de mogelijkheden te bespreken." : "I would love to connect with you to discuss the possibilities.";
    return {
      subject: language === "nl" ? `Hulpvraag in ${candidate.location}` : `Care opportunity in ${candidate.location}`,
      content: language === "nl" ? `Beste ${candidate.name},

Ik kwam uw profiel tegen en denk dat u mogelijk goed zou passen bij onze hulpvraag: ${campaignDescription}${extraContext}

${reviewPrompt}

Met vriendelijke groet` : `Dear ${candidate.name},

I came across your profile and think you may be a good fit for our care request: ${campaignDescription}${extraContext}

${reviewPrompt}

Best regards`
    };
  }
}
var DEFAULT_OUTREACH_TONE, MAX_TEMPLATE_SNIPPET_LENGTH, OUTREACH_TONE_INSTRUCTIONS;
var init_aiMatching = __esm({
  "server/services/aiMatching.ts"() {
    "use strict";
    init_llm();
    init_db();
    DEFAULT_OUTREACH_TONE = "careful";
    MAX_TEMPLATE_SNIPPET_LENGTH = 280;
    OUTREACH_TONE_INSTRUCTIONS = {
      careful: "Use a careful, respectful tone. Avoid pressure and make clear the candidate can decline or ask questions.",
      warm: "Use a warm, personal tone while staying professional and factual.",
      concise: "Use a concise tone. Keep the message short, direct, and easy to review."
    };
  }
});

// server/_core/crawleeStorage.ts
import os3 from "node:os";
import path3 from "node:path";
import { Configuration } from "crawlee";
function getCrawleeStorageDirectory() {
  if (process.env.CRAWLEE_STORAGE_DIR) {
    return path3.resolve(process.env.CRAWLEE_STORAGE_DIR);
  }
  const localDataDir = process.env.LOCAL_DATA_DIR;
  if (localDataDir) {
    return path3.resolve(process.cwd(), localDataDir, "crawlee-storage");
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return path3.resolve(process.cwd(), ".local-data", "crawlee-storage");
  }
  return path3.join(
    process.env.APPDATA || os3.tmpdir(),
    "NationaleHulpgidsReachOut",
    "crawlee-storage"
  );
}
function getCrawleeConfiguration() {
  if (crawleeConfiguration)
    return crawleeConfiguration;
  const localDataDirectory = getCrawleeStorageDirectory();
  const persistStorage = process.env.CRAWLEE_PERSIST_STORAGE != null ? !["false", "0", ""].includes(process.env.CRAWLEE_PERSIST_STORAGE) : !(process.env.NODE_ENV === "test" || process.env.VITEST);
  process.env.CRAWLEE_STORAGE_DIR = localDataDirectory;
  if (!persistStorage) {
    process.env.CRAWLEE_PERSIST_STORAGE = "false";
  }
  crawleeConfiguration = new Configuration({
    persistStorage,
    storageClientOptions: {
      localDataDirectory,
      persistStorage,
      writeMetadata: false
    }
  });
  return crawleeConfiguration;
}
var crawleeConfiguration;
var init_crawleeStorage = __esm({
  "server/_core/crawleeStorage.ts"() {
    "use strict";
    crawleeConfiguration = null;
  }
});

// server/services/scrapers/scraperAbort.ts
function throwIfScraperAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("Scraper run aborted", "AbortError");
  }
}
async function runWithScraperAbort(work, signal) {
  throwIfScraperAborted(signal);
  if (!signal)
    return work;
  let cleanup;
  return Promise.race([
    work.finally(() => cleanup?.()),
    new Promise((_, reject) => {
      const abort = () => reject(new DOMException("Scraper run aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      cleanup = () => signal.removeEventListener("abort", abort);
    })
  ]);
}
var init_scraperAbort = __esm({
  "server/services/scrapers/scraperAbort.ts"() {
    "use strict";
  }
});

// server/services/scrapers/crawleeIndeed.ts
var crawleeIndeed_exports = {};
__export(crawleeIndeed_exports, {
  CrawleeIndeedScraper: () => CrawleeIndeedScraper,
  createIndeedScraper: () => createIndeedScraper
});
import { CheerioCrawler, ProxyConfiguration } from "crawlee";
function createIndeedScraper(config) {
  return new CrawleeIndeedScraper(config);
}
var CrawleeIndeedScraper;
var init_crawleeIndeed = __esm({
  "server/services/scrapers/crawleeIndeed.ts"() {
    "use strict";
    init_crawleeStorage();
    init_scraperAbort();
    CrawleeIndeedScraper = class {
      config;
      proxyConfiguration;
      constructor(config) {
        this.config = {
          maxConcurrency: 5,
          maxRequestsPerCrawl: 100,
          ...config
        };
        if (config.proxyUrls && config.proxyUrls.length > 0) {
          this.proxyConfiguration = new ProxyConfiguration({
            proxyUrls: config.proxyUrls
          });
        }
      }
      async authenticate() {
        console.warn(
          "[Crawlee-Indeed] Authenticated automation is not implemented; using public job listings only"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        console.log("[Crawlee-Indeed] Starting candidate search:", criteria);
        throwIfScraperAborted(options.signal);
        const candidates2 = [];
        const crawler = new CheerioCrawler(
          {
            maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
            maxConcurrency: this.config.maxConcurrency,
            proxyConfiguration: this.proxyConfiguration,
            async requestHandler({ request, $, log }) {
              throwIfScraperAborted(options.signal);
              log.info(`Processing ${request.url}`);
              $(".job_seen_beacon, .jobsearch-SerpJobCard, .result").each(
                (index, element) => {
                  const $el = $(element);
                  const candidate = {
                    name: $el.find(".jobTitle, h2.title").first().text().trim() || "Unknown",
                    email: $el.find("[href^='mailto:']").first().attr("href")?.replace("mailto:", ""),
                    location: $el.find(".companyLocation, .location").first().text().trim() || criteria.location,
                    experience: $el.find(".experienceLevel, .snippet").first().text().trim(),
                    services: criteria.services || [],
                    availability: "Full-time",
                    profileUrl: $el.find("a").first().attr("href") || request.url,
                    platform: "Indeed"
                  };
                  if (candidate.name && candidate.name !== "Unknown") {
                    candidates2.push(candidate);
                  }
                }
              );
            },
            failedRequestHandler({ request, log }, error) {
              log.error(`Request ${request.url} failed: ${error.message}`);
            },
            preNavigationHooks: [
              async ({ request }, goToOptions) => {
                throwIfScraperAborted(options.signal);
                goToOptions.headers = {
                  ...goToOptions.headers,
                  "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                };
              }
            ]
          },
          getCrawleeConfiguration()
        );
        const searchUrl = this.buildSearchUrl(criteria);
        await runWithScraperAbort(crawler.run([searchUrl]), options.signal);
        console.log(`[Crawlee-Indeed] Found ${candidates2.length} candidates`);
        return candidates2;
      }
      buildSearchUrl(criteria) {
        const baseUrl = "https://nl.indeed.com/jobs";
        const params = new URLSearchParams({
          q: criteria.services?.join(" ") || "zorg",
          l: criteria.location
        });
        return `${baseUrl}?${params.toString()}`;
      }
      async close() {
        console.log("[Crawlee-Indeed] Scraper closed");
      }
    };
  }
});

// server/services/scrapers/nationaleHulpgids.ts
var nationaleHulpgids_exports = {};
__export(nationaleHulpgids_exports, {
  NationaleHulpgidsScraper: () => NationaleHulpgidsScraper
});
import * as cheerio from "cheerio";
var NationaleHulpgidsScraper;
var init_nationaleHulpgids = __esm({
  "server/services/scrapers/nationaleHulpgids.ts"() {
    "use strict";
    init_scraperAbort();
    NationaleHulpgidsScraper = class {
      baseUrl = "https://www.nationalehulpgids.nl";
      credentials;
      sessionCookies = "";
      isAuthenticated = false;
      constructor(credentials) {
        this.credentials = credentials;
      }
      /**
       * Authenticate with Nationale Hulpgids
       */
      async authenticate() {
        if (!this.credentials) {
          console.log(
            "[Nationale Hulpgids] No credentials provided, proceeding without authentication"
          );
          return false;
        }
        try {
          console.log("[Nationale Hulpgids] Authenticating...");
          const loginPageResponse = await fetch(`${this.baseUrl}/inloggen`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7"
            }
          });
          const loginPageHtml = await loginPageResponse.text();
          const $ = cheerio.load(loginPageHtml);
          const csrfToken = $('input[name="_token"]').val() || $('meta[name="csrf-token"]').attr("content");
          const formData = new URLSearchParams({
            email: this.credentials.email,
            password: this.credentials.password,
            ...csrfToken && { _token: csrfToken }
          });
          const loginResponse = await fetch(`${this.baseUrl}/inloggen`, {
            method: "POST",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "nl-NL,nl;q=0.9",
              Referer: `${this.baseUrl}/inloggen`
            },
            body: formData.toString(),
            redirect: "manual"
            // Don't follow redirects automatically
          });
          const setCookieHeaders = loginResponse.headers.getSetCookie();
          if (setCookieHeaders && setCookieHeaders.length > 0) {
            this.sessionCookies = setCookieHeaders.map((cookie) => cookie.split(";")[0]).join("; ");
            this.isAuthenticated = true;
            console.log("[Nationale Hulpgids] Authentication successful");
            return true;
          }
          if (loginResponse.status === 302 || loginResponse.status === 301) {
            const location = loginResponse.headers.get("location");
            if (location && !location.includes("inloggen")) {
              this.isAuthenticated = true;
              console.log(
                "[Nationale Hulpgids] Authentication successful (redirect)"
              );
              return true;
            }
          }
          console.error(
            "[Nationale Hulpgids] Authentication failed - no session cookies received"
          );
          return false;
        } catch (error) {
          console.error("[Nationale Hulpgids] Authentication error:", error);
          return false;
        }
      }
      /**
       * Search for helpers/candidates based on criteria
       */
      async searchCandidates(criteria, options = {}) {
        try {
          console.log("[Nationale Hulpgids] Searching with criteria:", criteria);
          throwIfScraperAborted(options.signal);
          if (this.credentials && !this.isAuthenticated) {
            await this.authenticate();
          }
          throwIfScraperAborted(options.signal);
          const searchParams = new URLSearchParams();
          if (criteria.location) {
            searchParams.append("plaats", criteria.location);
          }
          if (criteria.services) {
            searchParams.append("diensten", criteria.services);
          }
          if (criteria.keywords) {
            searchParams.append("q", criteria.keywords);
          }
          const searchUrl = `${this.baseUrl}/zoeken?${searchParams.toString()}`;
          console.log("[Nationale Hulpgids] Search URL:", searchUrl);
          const response = await fetch(searchUrl, {
            signal: options.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "nl-NL,nl;q=0.9",
              ...this.sessionCookies && { Cookie: this.sessionCookies }
            }
          });
          throwIfScraperAborted(options.signal);
          if (!response.ok) {
            console.error(
              "[Nationale Hulpgids] Search failed:",
              response.status,
              response.statusText
            );
            return [];
          }
          const html = await response.text();
          throwIfScraperAborted(options.signal);
          const $ = cheerio.load(html);
          const candidates2 = [];
          $(".helper-card, .hulpverlener-card, .profile-card, .search-result").each(
            (index, element) => {
              try {
                const $card = $(element);
                const name = $card.find(".name, .helper-name, h3, h4").first().text().trim();
                const profileUrl = $card.find("a").first().attr("href") || $card.find("a[href*='/hulp/']").attr("href") || "";
                const location = $card.find(".location, .plaats, .address").first().text().trim();
                const services = $card.find(".services, .diensten, .specialisaties").first().text().trim();
                const bio = $card.find(".bio, .description, .omschrijving, p").first().text().trim();
                const hourlyRate = $card.find(".rate, .tarief, .prijs").first().text().trim();
                const experience = $card.find(".experience, .ervaring").first().text().trim();
                if (name && profileUrl) {
                  candidates2.push({
                    name,
                    profileUrl: profileUrl.startsWith("http") ? profileUrl : `${this.baseUrl}${profileUrl}`,
                    location: location || criteria.location || "",
                    services: services || "",
                    bio: bio || "",
                    hourlyRate: this.parseHourlyRate(hourlyRate),
                    experience: experience || "",
                    availability: ""
                    // Would need to visit profile page for detailed availability
                  });
                }
              } catch (error) {
                console.error(
                  "[Nationale Hulpgids] Error parsing candidate card:",
                  error
                );
              }
            }
          );
          console.log(`[Nationale Hulpgids] Found ${candidates2.length} candidates`);
          if (candidates2.length === 0) {
            console.warn(
              "[Nationale Hulpgids] No candidate cards found in search results"
            );
          }
          return candidates2;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
          console.error("[Nationale Hulpgids] Search error:", error);
          return [];
        }
      }
      /**
       * Get detailed candidate profile
       */
      async getCandidateDetails(profileUrl) {
        try {
          console.log("[Nationale Hulpgids] Fetching profile:", profileUrl);
          const response = await fetch(profileUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "nl-NL,nl;q=0.9",
              ...this.sessionCookies && { Cookie: this.sessionCookies }
            }
          });
          if (!response.ok) {
            console.error(
              "[Nationale Hulpgids] Failed to fetch profile:",
              response.status
            );
            return null;
          }
          const html = await response.text();
          const $ = cheerio.load(html);
          const name = $("h1, .profile-name, .helper-name").first().text().trim();
          const location = $(".location, .plaats").first().text().trim();
          const bio = $(".bio, .description, .about, .over-mij").first().text().trim();
          const services = $(".services, .diensten").text().trim();
          const experience = $(".experience, .ervaring").text().trim();
          const hourlyRate = $(".rate, .tarief").text().trim();
          const availability = $(".availability, .beschikbaarheid").text().trim();
          const email = this.extractEmail($("body").text());
          const phone = this.extractPhone($("body").text());
          return {
            name,
            email,
            phone,
            profileUrl,
            location,
            services,
            bio,
            hourlyRate: this.parseHourlyRate(hourlyRate),
            experience,
            availability
          };
        } catch (error) {
          console.error(
            "[Nationale Hulpgids] Error fetching candidate details:",
            error
          );
          return null;
        }
      }
      /**
       * Parse hourly rate from text
       */
      parseHourlyRate(text2) {
        if (!text2)
          return "";
        const rateMatch = text2.match(
          /€\s*(\d+(?:[.,]\d+)?)\s*(?:\/|per)\s*(?:uur|hour)/i
        );
        return rateMatch ? `\u20AC${rateMatch[1]}/hour` : text2;
      }
      /**
       * Extract email from text
       */
      extractEmail(text2) {
        const emailMatch = text2.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        return emailMatch ? emailMatch[0] : void 0;
      }
      /**
       * Extract phone from text
       */
      extractPhone(text2) {
        const phoneMatch = text2.match(/(?:\+31|0)[0-9]{9,10}/);
        return phoneMatch ? phoneMatch[0] : void 0;
      }
      /**
       * Retained only as a guard against old call sites. Discovery must not emit
       * placeholder profiles when scraping fails or the platform markup changes.
       */
      getMockData(_criteria) {
        console.warn("[Nationale Hulpgids] Mock fallback disabled");
        return [];
      }
      /**
       * Send message to candidate (requires authentication)
       */
      async sendMessage(candidateId, message) {
        if (!this.isAuthenticated) {
          console.error(
            "[Nationale Hulpgids] Cannot send message - not authenticated"
          );
          return false;
        }
        throw new Error(
          "Nationale Hulpgids platform sending is not implemented. Use the approved manual send flow and record delivery evidence with messages.recordSendAttempt."
        );
      }
    };
  }
});

// server/services/scrapers/crawleePGBvacatures.ts
var crawleePGBvacatures_exports = {};
__export(crawleePGBvacatures_exports, {
  CrawleePGBvacaturesScraper: () => CrawleePGBvacaturesScraper,
  createPGBvacaturesScraper: () => createPGBvacaturesScraper
});
import { CheerioCrawler as CheerioCrawler2, ProxyConfiguration as ProxyConfiguration2 } from "crawlee";
function createPGBvacaturesScraper(config) {
  return new CrawleePGBvacaturesScraper(config);
}
var CrawleePGBvacaturesScraper;
var init_crawleePGBvacatures = __esm({
  "server/services/scrapers/crawleePGBvacatures.ts"() {
    "use strict";
    init_crawleeStorage();
    init_scraperAbort();
    CrawleePGBvacaturesScraper = class {
      config;
      proxyConfiguration;
      constructor(config) {
        this.config = {
          maxConcurrency: 5,
          maxRequestsPerCrawl: 100,
          ...config
        };
        if (config.proxyUrls && config.proxyUrls.length > 0) {
          this.proxyConfiguration = new ProxyConfiguration2({
            proxyUrls: config.proxyUrls
          });
        }
      }
      async authenticate() {
        console.warn(
          "[Crawlee-PGBvacatures] Authenticated automation is not implemented; using public listings only"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        console.log("[Crawlee-PGBvacatures] Starting candidate search:", criteria);
        throwIfScraperAborted(options.signal);
        const candidates2 = [];
        const crawler = new CheerioCrawler2(
          {
            maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
            maxConcurrency: this.config.maxConcurrency,
            proxyConfiguration: this.proxyConfiguration,
            async requestHandler({ request, $, log }) {
              throwIfScraperAborted(options.signal);
              log.info(`Processing ${request.url}`);
              $(".vacancy, .job-item, .result-item").each((index, element) => {
                const $el = $(element);
                const candidate = {
                  name: $el.find(".title, h2, h3").first().text().trim() || "Unknown",
                  email: $el.find("[href^='mailto:']").first().attr("href")?.replace("mailto:", ""),
                  location: $el.find(".location, .plaats").first().text().trim() || criteria.location,
                  experience: $el.find(".experience, .ervaring").first().text().trim(),
                  services: criteria.services || ["PGB zorg"],
                  availability: "Full-time",
                  profileUrl: $el.find("a").first().attr("href") || request.url,
                  platform: "PGBvacatures"
                };
                if (candidate.name && candidate.name !== "Unknown") {
                  candidates2.push(candidate);
                }
              });
            },
            failedRequestHandler({ request, log }, error) {
              log.error(`Request ${request.url} failed: ${error.message}`);
            },
            preNavigationHooks: [
              async ({ request }, goToOptions) => {
                throwIfScraperAborted(options.signal);
                goToOptions.headers = {
                  ...goToOptions.headers,
                  "Accept-Language": "nl-NL,nl;q=0.9",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                };
              }
            ]
          },
          getCrawleeConfiguration()
        );
        const searchUrl = this.buildSearchUrl(criteria);
        await runWithScraperAbort(crawler.run([searchUrl]), options.signal);
        console.log(`[Crawlee-PGBvacatures] Found ${candidates2.length} candidates`);
        return candidates2;
      }
      buildSearchUrl(criteria) {
        const baseUrl = "https://www.pgbvacatures.nl/vacatures";
        const params = new URLSearchParams({
          zoekterm: criteria.services?.join(" ") || "zorg",
          plaats: criteria.location
        });
        return `${baseUrl}?${params.toString()}`;
      }
      async close() {
        console.log("[Crawlee-PGBvacatures] Scraper closed");
      }
    };
  }
});

// server/services/scrapers/crawleeZorgbanen.ts
var crawleeZorgbanen_exports = {};
__export(crawleeZorgbanen_exports, {
  CrawleeZorgbanenScraper: () => CrawleeZorgbanenScraper,
  createZorgbanenScraper: () => createZorgbanenScraper
});
import { CheerioCrawler as CheerioCrawler3, ProxyConfiguration as ProxyConfiguration3 } from "crawlee";
function createZorgbanenScraper(config) {
  return new CrawleeZorgbanenScraper(config);
}
var CrawleeZorgbanenScraper;
var init_crawleeZorgbanen = __esm({
  "server/services/scrapers/crawleeZorgbanen.ts"() {
    "use strict";
    init_crawleeStorage();
    init_scraperAbort();
    CrawleeZorgbanenScraper = class {
      config;
      proxyConfiguration;
      constructor(config) {
        this.config = {
          maxConcurrency: 5,
          maxRequestsPerCrawl: 100,
          ...config
        };
        if (config.proxyUrls && config.proxyUrls.length > 0) {
          this.proxyConfiguration = new ProxyConfiguration3({
            proxyUrls: config.proxyUrls
          });
        }
      }
      async authenticate() {
        console.warn(
          "[Crawlee-Zorgbanen] Authenticated automation is not implemented; using public listings only"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        console.log("[Crawlee-Zorgbanen] Starting candidate search:", criteria);
        throwIfScraperAborted(options.signal);
        const candidates2 = [];
        const crawler = new CheerioCrawler3(
          {
            maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
            maxConcurrency: this.config.maxConcurrency,
            proxyConfiguration: this.proxyConfiguration,
            async requestHandler({ request, $, log }) {
              throwIfScraperAborted(options.signal);
              log.info(`Processing ${request.url}`);
              $(".vacature, .vacancy-item, .job-listing").each((index, element) => {
                const $el = $(element);
                const candidate = {
                  name: $el.find(".title, h2, h3").first().text().trim() || "Unknown",
                  email: $el.find("[href^='mailto:']").first().attr("href")?.replace("mailto:", ""),
                  location: $el.find(".location, .locatie").first().text().trim() || criteria.location,
                  experience: $el.find(".experience, .ervaring, .niveau").first().text().trim(),
                  services: criteria.services || ["Zorg"],
                  availability: "Full-time",
                  profileUrl: $el.find("a").first().attr("href") || request.url,
                  platform: "Zorgbanen"
                };
                if (candidate.name && candidate.name !== "Unknown") {
                  candidates2.push(candidate);
                }
              });
            },
            failedRequestHandler({ request, log }, error) {
              log.error(`Request ${request.url} failed: ${error.message}`);
            },
            preNavigationHooks: [
              async ({ request }, goToOptions) => {
                throwIfScraperAborted(options.signal);
                goToOptions.headers = {
                  ...goToOptions.headers,
                  "Accept-Language": "nl-NL,nl;q=0.9",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                };
              }
            ]
          },
          getCrawleeConfiguration()
        );
        const searchUrl = this.buildSearchUrl(criteria);
        await runWithScraperAbort(crawler.run([searchUrl]), options.signal);
        console.log(`[Crawlee-Zorgbanen] Found ${candidates2.length} candidates`);
        return candidates2;
      }
      buildSearchUrl(criteria) {
        const baseUrl = "https://www.zorgbanen.nl/vacatures";
        const params = new URLSearchParams({
          q: criteria.services?.join(" ") || "zorg",
          l: criteria.location
        });
        return `${baseUrl}?${params.toString()}`;
      }
      async close() {
        console.log("[Crawlee-Zorgbanen] Scraper closed");
      }
    };
  }
});

// server/services/scrapers/crawleeJobbird.ts
var crawleeJobbird_exports = {};
__export(crawleeJobbird_exports, {
  CrawleeJobbirdScraper: () => CrawleeJobbirdScraper,
  createJobbirdScraper: () => createJobbirdScraper
});
import { CheerioCrawler as CheerioCrawler4, ProxyConfiguration as ProxyConfiguration4 } from "crawlee";
function createJobbirdScraper(config) {
  return new CrawleeJobbirdScraper(config);
}
var CrawleeJobbirdScraper;
var init_crawleeJobbird = __esm({
  "server/services/scrapers/crawleeJobbird.ts"() {
    "use strict";
    init_crawleeStorage();
    init_scraperAbort();
    CrawleeJobbirdScraper = class {
      config;
      proxyConfiguration;
      constructor(config) {
        this.config = {
          maxConcurrency: 5,
          maxRequestsPerCrawl: 100,
          ...config
        };
        if (config.proxyUrls && config.proxyUrls.length > 0) {
          this.proxyConfiguration = new ProxyConfiguration4({
            proxyUrls: config.proxyUrls
          });
        }
      }
      async authenticate() {
        console.warn(
          "[Crawlee-Jobbird] Authenticated automation is not implemented; using public listings only"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        console.log("[Crawlee-Jobbird] Starting candidate search:", criteria);
        throwIfScraperAborted(options.signal);
        const candidates2 = [];
        const crawler = new CheerioCrawler4(
          {
            maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
            maxConcurrency: this.config.maxConcurrency,
            proxyConfiguration: this.proxyConfiguration,
            async requestHandler({ request, $, log }) {
              throwIfScraperAborted(options.signal);
              log.info(`Processing ${request.url}`);
              $(".job, .vacancy, .listing-item").each((index, element) => {
                const $el = $(element);
                const candidate = {
                  name: $el.find(".title, h2, h3, .job-title").first().text().trim() || "Unknown",
                  email: $el.find("[href^='mailto:']").first().attr("href")?.replace("mailto:", ""),
                  location: $el.find(".location, .city").first().text().trim() || criteria.location,
                  experience: $el.find(".experience, .level").first().text().trim(),
                  services: criteria.services || [],
                  availability: "Full-time",
                  profileUrl: $el.find("a").first().attr("href") || request.url,
                  platform: "Jobbird"
                };
                if (candidate.name && candidate.name !== "Unknown") {
                  candidates2.push(candidate);
                }
              });
            },
            failedRequestHandler({ request, log }, error) {
              log.error(`Request ${request.url} failed: ${error.message}`);
            },
            preNavigationHooks: [
              async ({ request }, goToOptions) => {
                throwIfScraperAborted(options.signal);
                goToOptions.headers = {
                  ...goToOptions.headers,
                  "Accept-Language": "nl-NL,nl;q=0.9",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                };
              }
            ]
          },
          getCrawleeConfiguration()
        );
        const searchUrl = this.buildSearchUrl(criteria);
        await runWithScraperAbort(crawler.run([searchUrl]), options.signal);
        console.log(`[Crawlee-Jobbird] Found ${candidates2.length} candidates`);
        return candidates2;
      }
      buildSearchUrl(criteria) {
        const baseUrl = "https://www.jobbird.com/nl/vacature";
        const params = new URLSearchParams({
          query: criteria.services?.join(" ") || "zorg",
          location: criteria.location
        });
        return `${baseUrl}?${params.toString()}`;
      }
      async close() {
        console.log("[Crawlee-Jobbird] Scraper closed");
      }
    };
  }
});

// server/services/platformScraper.ts
var platformScraper_exports = {};
__export(platformScraper_exports, {
  PlatformScraperFactory: () => PlatformScraperFactory
});
function getScraperRequestLimit() {
  const configuredLimit = Number(process.env.SCRAPER_MAX_REQUESTS || 30);
  return Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 30;
}
var BaseScraper, IndeedScraper, NationaleHulpgidsScraper2, PGBVacaturesScraper, ZorgbanenScraper, JobbirdScraper, PlatformScraperFactory;
var init_platformScraper = __esm({
  "server/services/platformScraper.ts"() {
    "use strict";
    BaseScraper = class {
      platformName;
      baseUrl;
      credentials;
      constructor(platformName, baseUrl, credentials) {
        this.platformName = platformName;
        this.baseUrl = baseUrl;
        this.credentials = credentials;
      }
      unsupportedPlatformSend() {
        throw new Error(
          `${this.platformName} platform sending is not implemented. Use the approved manual send flow and record delivery evidence with messages.recordSendAttempt.`
        );
      }
      /**
       * Rate limiting helper
       */
      async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
      /**
       * Parse location from text
       */
      parseLocation(text2) {
        const locationMatch = text2.match(
          /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+)?)/
        );
        return locationMatch ? locationMatch[1] : "";
      }
      /**
       * Parse hourly rate from text
       */
      parseHourlyRate(text2) {
        const rateMatch = text2.match(
          /€\s*(\d+(?:-\d+)?)\s*(?:\/|per)\s*(?:uur|hour)/i
        );
        return rateMatch ? `\u20AC${rateMatch[1]}/hour` : "";
      }
      /**
       * Extract email from text
       */
      extractEmail(text2) {
        const emailMatch = text2.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        return emailMatch ? emailMatch[0] : void 0;
      }
      /**
       * Extract phone from text
       */
      extractPhone(text2) {
        const phoneMatch = text2.match(/(?:\+31|0)[0-9]{9,10}/);
        return phoneMatch ? phoneMatch[0] : void 0;
      }
    };
    IndeedScraper = class extends BaseScraper {
      constructor(credentials) {
        super("Indeed", "https://www.indeed.com", credentials);
      }
      async authenticate() {
        console.warn(
          "[Indeed] Authenticated automation is not implemented; public search remains available"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        const { createIndeedScraper: createIndeedScraper2 } = await Promise.resolve().then(() => (init_crawleeIndeed(), crawleeIndeed_exports));
        const crawleeScraper = createIndeedScraper2({
          email: this.credentials?.email || "",
          password: this.credentials?.password || "",
          maxRequestsPerCrawl: getScraperRequestLimit()
        });
        const results = await crawleeScraper.searchCandidates({
          location: criteria.location || "Amsterdam",
          services: criteria.services?.split(",").map((s) => s.trim())
        }, options);
        await crawleeScraper.close();
        return results.map((r) => ({
          ...r,
          services: r.services?.join(", "),
          hourlyRate: r.hourlyRate ? `\u20AC${r.hourlyRate}/hour` : void 0,
          skills: [],
          languages: ["Nederlands", "Engels"],
          certifications: []
        }));
      }
      async getCandidateDetails(profileUrl) {
        console.log(`[Indeed] Fetching details for:`, profileUrl);
        await this.delay(500);
        return null;
      }
      async sendMessage(candidateId, message) {
        this.unsupportedPlatformSend();
      }
    };
    NationaleHulpgidsScraper2 = class extends BaseScraper {
      constructor(credentials) {
        super(
          "Nationale Hulpgids",
          "https://www.nationalehulpgids.nl",
          credentials
        );
      }
      async authenticate() {
        if (!this.credentials)
          return false;
        const { NationaleHulpgidsScraper: EnhancedScraper } = await Promise.resolve().then(() => (init_nationaleHulpgids(), nationaleHulpgids_exports));
        const enhancedScraper = new EnhancedScraper(this.credentials);
        return enhancedScraper.authenticate();
      }
      async searchCandidates(criteria, options = {}) {
        const { NationaleHulpgidsScraper: EnhancedScraper } = await Promise.resolve().then(() => (init_nationaleHulpgids(), nationaleHulpgids_exports));
        const enhancedScraper = new EnhancedScraper(this.credentials);
        return enhancedScraper.searchCandidates(criteria, options);
      }
      async getCandidateDetails(profileUrl) {
        console.log(`[Nationale Hulpgids] Fetching details for:`, profileUrl);
        await this.delay(500);
        return null;
      }
      async sendMessage(candidateId, message) {
        this.unsupportedPlatformSend();
      }
    };
    PGBVacaturesScraper = class extends BaseScraper {
      constructor(credentials) {
        super("PGBvacatures", "https://www.pgbvacatures.nl", credentials);
      }
      async authenticate() {
        console.warn(
          "[PGBvacatures] Authenticated automation is not implemented; public search remains available"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        const { createPGBvacaturesScraper: createPGBvacaturesScraper2 } = await Promise.resolve().then(() => (init_crawleePGBvacatures(), crawleePGBvacatures_exports));
        const crawleeScraper = createPGBvacaturesScraper2({
          email: this.credentials?.email || "",
          password: this.credentials?.password || "",
          maxRequestsPerCrawl: getScraperRequestLimit()
        });
        const results = await crawleeScraper.searchCandidates({
          location: criteria.location || "Utrecht",
          services: criteria.services?.split(",").map((s) => s.trim())
        }, options);
        await crawleeScraper.close();
        return results.map((r) => ({
          ...r,
          services: r.services?.join(", "),
          hourlyRate: r.hourlyRate ? `\u20AC${r.hourlyRate}/hour` : void 0,
          skills: [],
          languages: ["Nederlands"]
        }));
      }
      async getCandidateDetails(profileUrl) {
        console.log(`[PGBvacatures] Fetching details for:`, profileUrl);
        await this.delay(500);
        return null;
      }
      async sendMessage(candidateId, message) {
        this.unsupportedPlatformSend();
      }
    };
    ZorgbanenScraper = class extends BaseScraper {
      constructor(credentials) {
        super("Zorgbanen", "https://www.zorgbanen.nl", credentials);
      }
      async authenticate() {
        console.warn(
          "[Zorgbanen] Authenticated automation is not implemented; public search remains available"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        const { createZorgbanenScraper: createZorgbanenScraper2 } = await Promise.resolve().then(() => (init_crawleeZorgbanen(), crawleeZorgbanen_exports));
        const crawleeScraper = createZorgbanenScraper2({
          email: this.credentials?.email || "",
          password: this.credentials?.password || "",
          maxRequestsPerCrawl: getScraperRequestLimit()
        });
        const results = await crawleeScraper.searchCandidates({
          location: criteria.location || "Den Haag",
          services: criteria.services?.split(",").map((s) => s.trim())
        }, options);
        await crawleeScraper.close();
        return results.map((r) => ({
          ...r,
          services: r.services?.join(", "),
          hourlyRate: r.hourlyRate ? `\u20AC${r.hourlyRate}/hour` : void 0,
          skills: [],
          languages: ["Nederlands"],
          certifications: []
        }));
      }
      async getCandidateDetails(profileUrl) {
        console.log(`[Zorgbanen] Fetching details for:`, profileUrl);
        await this.delay(500);
        return null;
      }
      async sendMessage(candidateId, message) {
        this.unsupportedPlatformSend();
      }
    };
    JobbirdScraper = class extends BaseScraper {
      constructor(credentials) {
        super("Jobbird", "https://www.jobbird.com", credentials);
      }
      async authenticate() {
        console.warn(
          "[Jobbird] Authenticated automation is not implemented; public search remains available"
        );
        return false;
      }
      async searchCandidates(criteria, options = {}) {
        const { createJobbirdScraper: createJobbirdScraper2 } = await Promise.resolve().then(() => (init_crawleeJobbird(), crawleeJobbird_exports));
        const crawleeScraper = createJobbirdScraper2({
          email: this.credentials?.email || "",
          password: this.credentials?.password || "",
          maxRequestsPerCrawl: getScraperRequestLimit()
        });
        const results = await crawleeScraper.searchCandidates({
          location: criteria.location || "Eindhoven",
          services: criteria.services?.split(",").map((s) => s.trim())
        }, options);
        await crawleeScraper.close();
        return results.map((r) => ({
          ...r,
          services: r.services?.join(", "),
          hourlyRate: r.hourlyRate ? `\u20AC${r.hourlyRate}/hour` : void 0,
          skills: [],
          languages: ["Nederlands"]
        }));
      }
      async getCandidateDetails(profileUrl) {
        console.log(`[Jobbird] Fetching details for:`, profileUrl);
        await this.delay(500);
        return null;
      }
      async sendMessage(candidateId, message) {
        this.unsupportedPlatformSend();
      }
    };
    PlatformScraperFactory = class {
      static createScraper(platformName, credentials) {
        switch (platformName.toLowerCase()) {
          case "indeed":
          case "indeed.com":
            return new IndeedScraper(credentials);
          case "nationale hulpgids":
          case "nationalehulpgids":
            return new NationaleHulpgidsScraper2(credentials);
          case "pgbvacatures":
          case "pgbvacatures.nl":
            return new PGBVacaturesScraper(credentials);
          case "zorgbanen":
          case "zorgbanen.nl":
            return new ZorgbanenScraper(credentials);
          case "jobbird":
          case "jobbird.com":
            return new JobbirdScraper(credentials);
          default:
            throw new Error(`Unknown platform: ${platformName}`);
        }
      }
      /**
       * Search across multiple platforms in parallel
       */
      static async searchMultiplePlatforms(platformNames, criteria, credentials, options = {}) {
        const results = /* @__PURE__ */ new Map();
        const searchPromises = platformNames.map(async (platformName) => {
          try {
            const creds = credentials?.get(platformName);
            const scraper = this.createScraper(platformName, creds);
            if (creds) {
              await scraper.authenticate();
            }
            const candidates2 = await scraper.searchCandidates(criteria, options);
            results.set(platformName, candidates2);
          } catch (error) {
            console.error(`Error scraping ${platformName}:`, error);
            results.set(platformName, []);
          }
        });
        await Promise.all(searchPromises);
        return results;
      }
    };
  }
});

// server/services/inMemoryQueue.ts
var inMemoryQueue_exports = {};
__export(inMemoryQueue_exports, {
  addDiscoveryToQueue: () => addDiscoveryToQueue,
  addMessageToQueue: () => addMessageToQueue,
  closeQueues: () => closeQueues,
  discoveryQueue: () => discoveryQueue,
  getQueueStats: () => getQueueStats,
  messageQueue: () => messageQueue
});
import { EventEmitter } from "events";
function normalizeDiscoverySearchCriteria(value) {
  return {
    location: typeof value?.location === "string" && value.location.trim() ? value.location.trim() : void 0,
    experience: typeof value?.experience === "string" ? value.experience.trim() : void 0,
    services: splitList(value?.services).join(", "),
    minBudget: typeof value?.minBudget === "string" ? value.minBudget.trim() : void 0,
    maxBudget: typeof value?.maxBudget === "string" ? value.maxBudget.trim() : void 0,
    keywords: typeof value?.keywords === "string" ? value.keywords.trim() : void 0
  };
}
function normalizeDiscoveryMatchingCriteria(criteria) {
  return {
    location: criteria.location || "",
    services: splitList(criteria.services),
    experience: criteria.experience,
    budget: {
      min: parseHourlyRateCents(criteria.minBudget) ?? void 0,
      max: parseHourlyRateCents(criteria.maxBudget) ?? void 0
    }
  };
}
function splitList(value) {
  if (Array.isArray(value))
    return value.filter((entry) => typeof entry === "string");
  if (typeof value !== "string")
    return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}
function normalizeServicesForStorage(value) {
  const services = splitList(value);
  return services.length > 0 ? services.join(", ") : void 0;
}
function parseHourlyRateCents(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value * 100);
  if (typeof value !== "string")
    return null;
  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match)
    return null;
  return Math.round(Number(match[1]) * 100);
}
function findExistingCandidate(existingCandidates, campaignId, platformId, scrapedCandidate) {
  const profileUrl = scrapedCandidate.profileUrl?.trim().toLowerCase();
  const email = scrapedCandidate.email?.trim().toLowerCase();
  return existingCandidates.find((candidate) => {
    if (candidate.campaignId !== campaignId || candidate.platformId !== platformId)
      return false;
    const candidateProfileUrl = candidate.profileUrl?.trim().toLowerCase();
    const candidateEmail = candidate.email?.trim().toLowerCase();
    return profileUrl && candidateProfileUrl === profileUrl || email && candidateEmail === email;
  });
}
async function addMessageToQueue(data) {
  const queueJobRecordId = await recordDurableQueueJob({
    userId: data.userId,
    campaignId: data.campaignId,
    queueName: "messages",
    jobType: "send-message",
    status: data.delay ? "delayed" : "waiting",
    payload: serializeDurableQueuePayload("messages", data)
  });
  const jobData = queueJobRecordId ? { ...data, queueJobRecordId } : data;
  const job = await messageQueue.add("send-message", jobData, {
    priority: data.priority || 1,
    delay: data.delay || 0,
    attempts: 3,
    backoff: { type: "exponential", delay: 2e3 }
  });
  if (queueJobRecordId) {
    await updateDurableQueuePayload(
      queueJobRecordId,
      serializeDurableQueuePayload("messages", jobData, job.id)
    );
  }
  return job.id;
}
async function addDiscoveryToQueue(data) {
  await assertDiscoveryReadiness({
    campaignId: data.campaignId,
    userId: data.userId,
    source: "queue.discovery.enqueue",
    payload: data
  });
  const queueJobRecordId = await recordDurableQueueJob({
    userId: data.userId,
    campaignId: data.campaignId,
    queueName: "discovery",
    jobType: "discover-candidates",
    status: "waiting",
    payload: serializeDurableQueuePayload("discovery", data)
  });
  const jobData = queueJobRecordId ? { ...data, queueJobRecordId } : data;
  const job = await discoveryQueue.add("discover-candidates", jobData, {
    priority: data.priority || 1,
    attempts: 2,
    backoff: { type: "exponential", delay: 5e3 }
  });
  if (queueJobRecordId) {
    await updateDurableQueuePayload(
      queueJobRecordId,
      serializeDurableQueuePayload("discovery", jobData, job.id)
    );
  }
  return job.id;
}
async function recordDurableQueueJob(input) {
  try {
    const database = await Promise.resolve().then(() => (init_db(), db_exports));
    const campaign = await database.getCampaignById(input.campaignId);
    const userId = input.userId ?? campaign?.userId;
    if (!userId)
      return void 0;
    return await database.createQueueJobRecord({
      userId,
      campaignId: input.campaignId,
      queueName: input.queueName,
      jobType: input.jobType,
      status: input.status,
      payloadJson: serializeSafeJson(input.payload),
      errorMessage: truncateOperationalText(input.errorMessage)
    });
  } catch (error) {
    console.warn("[Queue] Failed to record durable queue job:", error);
    return void 0;
  }
}
async function updateDurableQueuePayload(queueJobRecordId, payload) {
  try {
    const database = await Promise.resolve().then(() => (init_db(), db_exports));
    await database.updateQueueJobRecord(queueJobRecordId, {
      payloadJson: serializeSafeJson(payload)
    });
  } catch (error) {
    console.warn("[Queue] Failed to update durable queue payload:", error);
  }
}
function toDurableQueueName(queueName) {
  return queueName === "outreach-messages" ? "messages" : "discovery";
}
function serializeDurableQueuePayload(queueName, data, queueJobId, result) {
  const base = {
    campaignId: data?.campaignId,
    userId: data?.userId,
    priority: data?.priority,
    queueJobId,
    queueJobRecordId: data?.queueJobRecordId
  };
  if (queueName === "messages") {
    return {
      ...base,
      candidateId: data?.candidateId,
      platform: data?.platform,
      platformId: data?.platformId,
      subject: data?.subject,
      generateMessage: data?.generateMessage,
      delay: data?.delay,
      messageContent: data?.messageContent ? "[redacted]" : void 0,
      result: result ? summarizeQueueResult(result) : void 0
    };
  }
  return {
    ...base,
    platformId: data?.platformId,
    searchCriteria: data?.searchCriteria,
    result: result ? summarizeQueueResult(result) : void 0
  };
}
function summarizeQueueResult(result) {
  if (!result || typeof result !== "object")
    return result;
  const record = result;
  return {
    success: record.success,
    messageId: record.messageId,
    candidateId: record.candidateId,
    candidatesFound: record.candidatesFound,
    candidatesSkippedAsDuplicates: record.candidatesSkippedAsDuplicates,
    platform: record.platform,
    timestamp: record.timestamp
  };
}
async function assertDiscoveryReadiness(input) {
  const [database, ledger] = await Promise.all([
    Promise.resolve().then(() => (init_db(), db_exports)),
    Promise.resolve().then(() => (init_outreachLedger(), outreachLedger_exports))
  ]);
  const campaign = await database.getCampaignById(input.campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${input.campaignId} not found`);
  }
  const userId = input.userId ?? campaign.userId;
  const readiness = await ledger.recordReadinessSnapshot(campaign, userId);
  if (readiness.status !== "blocked") {
    return { campaign, readiness, userId };
  }
  const errorMessage = `Campaign discovery is blocked by readiness checks: ${readiness.blockers.join("; ")}`;
  await database.createAuditEvent({
    userId,
    campaignId: campaign.id,
    entityType: "campaign",
    entityId: campaign.id,
    action: "campaign.discovery_blocked_readiness",
    actor: "system",
    source: input.source,
    riskLevel: "medium",
    afterState: JSON.stringify({
      blockers: readiness.blockers,
      status: readiness.status,
      queueJobId: input.queueJobId
    })
  });
  if (input.payload) {
    await recordDurableQueueJob({
      userId,
      campaignId: campaign.id,
      queueName: "discovery",
      jobType: "discover-candidates",
      status: "failed",
      payload: input.payload,
      errorMessage
    });
  }
  throw new Error(errorMessage);
}
async function getQueueStats(queueName) {
  const queue = queueName === "messages" ? messageQueue : discoveryQueue;
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}
async function closeQueues() {
  await messageQueue.close();
  await discoveryQueue.close();
}
var QueueJobCancelledError, InMemoryQueue, messageQueue, discoveryQueue;
var init_inMemoryQueue = __esm({
  "server/services/inMemoryQueue.ts"() {
    "use strict";
    init_rateLimiter();
    init_safeSerialization();
    QueueJobCancelledError = class extends Error {
      constructor() {
        super("Cancelled by user request");
        this.name = "QueueJobCancelledError";
      }
    };
    InMemoryQueue = class extends EventEmitter {
      constructor(name, options = {}) {
        super();
        this.name = name;
        this.concurrency = options.concurrency || 5;
        if (options.rateLimiter) {
          this.rateLimiter = {
            ...options.rateLimiter,
            tokens: options.rateLimiter.max,
            lastRefill: Date.now()
          };
        }
      }
      jobs = /* @__PURE__ */ new Map();
      waiting = [];
      active = [];
      completed = [];
      failed = [];
      delayed = [];
      cancellationRequests = /* @__PURE__ */ new Set();
      abortControllers = /* @__PURE__ */ new Map();
      processing = false;
      concurrency;
      rateLimiter;
      async add(name, data, opts = {}) {
        const job = {
          id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          data,
          opts,
          attempts: 0,
          maxAttempts: opts.attempts || 3,
          status: opts.delay ? "delayed" : "waiting",
          progress: 0,
          createdAt: /* @__PURE__ */ new Date()
        };
        this.jobs.set(job.id, job);
        if (opts.delay) {
          this.delayed.push(job);
          setTimeout(() => this.moveToWaiting(job.id), opts.delay);
        } else {
          this.waiting.push(job);
          this.waiting.sort(
            (a, b) => (b.opts.priority || 0) - (a.opts.priority || 0)
          );
        }
        this.emit("added", { jobId: job.id });
        this.processQueue();
        return { id: job.id };
      }
      moveToWaiting(jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
          return;
        job.status = "waiting";
        this.delayed = this.delayed.filter((j) => j.id !== jobId);
        this.waiting.push(job);
        this.waiting.sort(
          (a, b) => (b.opts.priority || 0) - (a.opts.priority || 0)
        );
        void this.updateDurableJob(job, "waiting");
        this.processQueue();
      }
      async processQueue() {
        if (this.processing)
          return;
        this.processing = true;
        while (this.waiting.length > 0 && this.active.length < this.concurrency) {
          if (this.rateLimiter) {
            this.refillTokens();
            if (this.rateLimiter.tokens <= 0) {
              setTimeout(() => this.processQueue(), 1e3);
              break;
            }
            this.rateLimiter.tokens--;
          }
          const job = this.waiting.shift();
          if (!job)
            break;
          job.status = "active";
          job.attempts++;
          job.processedAt = /* @__PURE__ */ new Date();
          this.active.push(job);
          this.emit("active", { jobId: job.id });
          void this.updateDurableJob(job, "active");
          this.processJob(job);
        }
        this.processing = false;
      }
      refillTokens() {
        if (!this.rateLimiter)
          return;
        const now = Date.now();
        const elapsed = now - this.rateLimiter.lastRefill;
        if (elapsed >= this.rateLimiter.duration) {
          this.rateLimiter.tokens = this.rateLimiter.max;
          this.rateLimiter.lastRefill = now;
        }
      }
      async processJob(job) {
        try {
          const queueJobRecordId = this.getDurableRecordId(job);
          const abortController = this.name === "candidate-discovery" && queueJobRecordId ? this.createAbortController(queueJobRecordId) : void 0;
          let result;
          if (this.name === "outreach-messages") {
            result = await this.processMessageJob(job);
          } else if (this.name === "candidate-discovery") {
            result = await this.processDiscoveryJob(job, abortController?.signal);
          } else {
            throw new Error(`Unknown queue: ${this.name}`);
          }
          job.status = "completed";
          job.result = result;
          job.progress = 100;
          this.active = this.active.filter((j) => j.id !== job.id);
          this.clearCancellationRequest(job);
          this.completed.push(job);
          if (this.completed.length > 100) {
            const removed = this.completed.shift();
            if (removed)
              this.jobs.delete(removed.id);
          }
          await this.updateDurableJob(job, "completed", {
            result,
            messageId: result && typeof result.messageId === "number" ? result.messageId : void 0
          });
          this.emit("completed", { jobId: job.id, returnvalue: result });
        } catch (error) {
          job.error = error.message;
          if (error instanceof QueueJobCancelledError) {
            job.status = "cancelled";
            this.active = this.active.filter((j) => j.id !== job.id);
            this.clearCancellationRequest(job);
            await this.updateDurableJob(job, "cancelled", {
              errorMessage: error.message
            });
            this.emit("cancelled", { jobId: job.id });
            this.clearAbortController(job);
            this.processQueue();
            return;
          }
          if (job.attempts < job.maxAttempts) {
            const delay = job.opts.backoff ? job.opts.backoff.delay * Math.pow(2, job.attempts - 1) : 2e3;
            job.status = "delayed";
            this.active = this.active.filter((j) => j.id !== job.id);
            this.delayed.push(job);
            setTimeout(() => this.moveToWaiting(job.id), delay);
            await this.updateDurableJob(job, "delayed", {
              errorMessage: error.message
            });
            this.emit("retrying", { jobId: job.id, attempt: job.attempts, delay });
          } else {
            job.status = "failed";
            this.active = this.active.filter((j) => j.id !== job.id);
            this.clearCancellationRequest(job);
            this.failed.push(job);
            if (this.failed.length > 500) {
              const removed = this.failed.shift();
              if (removed)
                this.jobs.delete(removed.id);
            }
            await this.updateDurableJob(job, "failed", {
              errorMessage: error.message
            });
            this.emit("failed", { jobId: job.id, failedReason: error.message });
          }
        }
        this.clearAbortController(job);
        this.processQueue();
      }
      async processMessageJob(job) {
        const { candidateId, campaignId, platform, generateMessage, platformId } = job.data;
        console.log(
          `[InMemoryQueue] Processing message job ${job.id} for candidate ${candidateId}`
        );
        const { resolvePlatformIdentity: resolvePlatformIdentity2 } = await Promise.resolve().then(() => (init_db(), db_exports));
        let platformRecord;
        try {
          platformRecord = await resolvePlatformIdentity2({
            platformId,
            platformName: platform
          });
        } catch (error) {
          throw new Error(
            error instanceof Error ? error.message : "Message queue platform mismatch"
          );
        }
        if (!platformRecord) {
          throw new Error(
            "Message queue job requires a valid platformId or known platform name"
          );
        }
        await consumeMessageLimit(platformRecord.name, 1);
        job.progress = 25;
        this.emit("progress", { jobId: job.id, data: 25 });
        let messageContent = job.data.messageContent;
        if (generateMessage) {
          const { getCandidateById: getCandidateById2, getCampaignById: getCampaignById2 } = await Promise.resolve().then(() => (init_db(), db_exports));
          const { generateOutreachMessage: generateOutreachMessage2 } = await Promise.resolve().then(() => (init_aiMatching(), aiMatching_exports));
          const candidate = await getCandidateById2(candidateId);
          const campaign = await getCampaignById2(campaignId);
          if (!candidate || !campaign) {
            throw new Error("Candidate or campaign not found");
          }
          const campaignDescription = campaign.description || campaign.title;
          const messageResult = await generateOutreachMessage2(
            candidate,
            campaignDescription,
            "nl"
          );
          messageContent = messageResult.content;
        }
        job.progress = 50;
        this.emit("progress", { jobId: job.id, data: 50 });
        const { createMessage: createMessage2 } = await Promise.resolve().then(() => (init_db(), db_exports));
        const messageId = await createMessage2({
          campaignId,
          candidateId,
          platformId: platformRecord.id,
          subject: `Opportunity: ${job.data.subject || "Care Professional Position"}`,
          content: messageContent,
          status: "queued"
        });
        job.progress = 100;
        this.emit("progress", { jobId: job.id, data: 100 });
        return {
          success: true,
          messageId,
          candidateId,
          timestamp: Date.now()
        };
      }
      async processDiscoveryJob(job, abortSignal) {
        const { campaignId, platformId, searchCriteria, userId } = job.data;
        console.log(
          `[InMemoryQueue] Processing discovery job ${job.id} for campaign ${campaignId}`
        );
        const readinessGate = await assertDiscoveryReadiness({
          campaignId,
          userId,
          source: "queue.discovery.worker",
          queueJobId: job.id
        });
        this.throwIfCancellationRequested(job);
        const campaign = readinessGate.campaign;
        const effectiveUserId = readinessGate.userId;
        const { getAllPlatforms: getAllPlatforms2 } = await Promise.resolve().then(() => (init_db(), db_exports));
        const platforms2 = await getAllPlatforms2();
        const platform = platforms2.find((p) => p.id === platformId);
        if (!platform) {
          throw new Error(`Platform ${platformId} not found`);
        }
        await consumeScraperLimit(platform.name, 1);
        this.throwIfCancellationRequested(job);
        job.progress = 25;
        this.emit("progress", { jobId: job.id, data: 25 });
        const normalizedSearchCriteria = normalizeDiscoverySearchCriteria(searchCriteria);
        const normalizedMatchingCriteria = normalizeDiscoveryMatchingCriteria(
          normalizedSearchCriteria
        );
        const [{ PlatformScraperFactory: PlatformScraperFactory2 }, { calculateCompatibility: calculateCompatibility2 }, database] = await Promise.all([
          Promise.resolve().then(() => (init_platformScraper(), platformScraper_exports)),
          Promise.resolve().then(() => (init_aiMatching(), aiMatching_exports)),
          Promise.resolve().then(() => (init_db(), db_exports))
        ]);
        let scrapedCandidates = [];
        try {
          const scraper = PlatformScraperFactory2.createScraper(platform.name);
          scrapedCandidates = await scraper.searchCandidates(
            normalizedSearchCriteria,
            { signal: abortSignal }
          );
          this.throwIfCancellationRequested(job);
        } catch (error) {
          if (error instanceof QueueJobCancelledError || this.isAbortError(error) && this.isCancellationRequested(job)) {
            throw new QueueJobCancelledError();
          }
          await database.createAuditEvent({
            userId: effectiveUserId,
            campaignId,
            entityType: "campaign",
            entityId: campaignId,
            action: "candidate.discovery_failed",
            actor: "system",
            source: platform.name,
            riskLevel: "medium",
            afterState: JSON.stringify({
              platformId,
              error: error instanceof Error ? error.message : String(error)
            })
          });
          throw error;
        }
        job.progress = 50;
        this.emit("progress", { jobId: job.id, data: 50 });
        const existingCandidates = await database.getUserCandidates(effectiveUserId);
        const savedCandidates = [];
        let duplicateCount = 0;
        for (const scrapedCandidate of scrapedCandidates) {
          this.throwIfCancellationRequested(job);
          const existingCandidate = findExistingCandidate(
            existingCandidates,
            campaignId,
            platformId,
            scrapedCandidate
          );
          if (existingCandidate) {
            duplicateCount++;
            continue;
          }
          const hourlyRate = parseHourlyRateCents(scrapedCandidate.hourlyRate);
          const matchResult = await calculateCompatibility2(
            {
              location: scrapedCandidate.location,
              experience: scrapedCandidate.experience,
              services: normalizeServicesForStorage(scrapedCandidate.services),
              hourlyRate
            },
            normalizedMatchingCriteria
          );
          const candidateId = await database.createCandidate({
            campaignId,
            platformId,
            name: scrapedCandidate.name,
            email: scrapedCandidate.email,
            phone: scrapedCandidate.phone,
            profileUrl: scrapedCandidate.profileUrl,
            location: scrapedCandidate.location,
            experience: scrapedCandidate.experience,
            services: normalizeServicesForStorage(scrapedCandidate.services),
            availability: scrapedCandidate.availability,
            hourlyRate,
            bio: scrapedCandidate.bio,
            profileData: JSON.stringify({
              source: "queue.discovery",
              platform: platform.name,
              discoveredAt: (/* @__PURE__ */ new Date()).toISOString(),
              profileUrl: scrapedCandidate.profileUrl
            }),
            compatibilityScore: matchResult.compatibilityScore,
            matchReasons: JSON.stringify(matchResult.matchReasons || []),
            status: matchResult.compatibilityScore >= 60 ? "matched" : "discovered"
          });
          const storedCandidate = await database.getCandidateById(candidateId);
          if (storedCandidate) {
            await database.getOrCreateCandidateIdentity(
              storedCandidate,
              effectiveUserId
            );
          }
          savedCandidates.push({
            ...scrapedCandidate,
            id: candidateId,
            compatibilityScore: matchResult.compatibilityScore
          });
        }
        this.throwIfCancellationRequested(job);
        job.progress = 75;
        this.emit("progress", { jobId: job.id, data: 75 });
        await database.createAuditEvent({
          userId: effectiveUserId,
          campaignId,
          entityType: "campaign",
          entityId: campaignId,
          action: "candidate.discovery_completed",
          actor: "system",
          source: platform.name,
          riskLevel: "low",
          afterState: JSON.stringify({
            platformId,
            scrapedCount: scrapedCandidates.length,
            savedCount: savedCandidates.length,
            duplicateCount
          })
        });
        const savedCount = savedCandidates.length;
        this.throwIfCancellationRequested(job);
        job.progress = 100;
        this.emit("progress", { jobId: job.id, data: 100 });
        return {
          success: true,
          candidatesFound: savedCount,
          candidatesSkippedAsDuplicates: duplicateCount,
          platform: platform.name,
          timestamp: Date.now()
        };
      }
      async getWaitingCount() {
        return this.waiting.length;
      }
      async getActiveCount() {
        return this.active.length;
      }
      async getCompletedCount() {
        return this.completed.length;
      }
      async getFailedCount() {
        return this.failed.length;
      }
      async getDelayedCount() {
        return this.delayed.length;
      }
      async cancelJobByDurableRecordId(durableJobRecordId) {
        const job = Array.from(this.jobs.values()).find(
          (entry) => Number(entry.data?.queueJobRecordId) === durableJobRecordId
        );
        if (!job)
          return { cancelled: false, reason: "not_found" };
        if (job.status === "active" && this.name === "candidate-discovery") {
          this.cancellationRequests.add(durableJobRecordId);
          this.abortControllers.get(durableJobRecordId)?.abort();
          await this.updateDurableJob(job, "active", {
            errorMessage: "Cancellation requested by user"
          });
          this.emit("cancel_requested", { jobId: job.id });
          return {
            cancelled: false,
            cancellationRequested: true,
            status: job.status,
            jobId: job.id
          };
        }
        if (job.status !== "waiting" && job.status !== "delayed") {
          return {
            cancelled: false,
            reason: "not_cancellable",
            status: job.status,
            jobId: job.id
          };
        }
        this.waiting = this.waiting.filter((entry) => entry.id !== job.id);
        this.delayed = this.delayed.filter((entry) => entry.id !== job.id);
        job.status = "cancelled";
        this.jobs.delete(job.id);
        await this.updateDurableJob(job, "cancelled", {
          errorMessage: "Cancelled by user"
        });
        this.emit("cancelled", { jobId: job.id });
        return { cancelled: true, status: "cancelled", jobId: job.id };
      }
      getDurableRecordId(job) {
        const queueJobRecordId = Number(job.data?.queueJobRecordId);
        return Number.isFinite(queueJobRecordId) && queueJobRecordId > 0 ? queueJobRecordId : void 0;
      }
      clearCancellationRequest(job) {
        const queueJobRecordId = this.getDurableRecordId(job);
        if (queueJobRecordId)
          this.cancellationRequests.delete(queueJobRecordId);
      }
      createAbortController(queueJobRecordId) {
        const abortController = new AbortController();
        if (this.cancellationRequests.has(queueJobRecordId)) {
          abortController.abort();
        }
        this.abortControllers.set(queueJobRecordId, abortController);
        return abortController;
      }
      clearAbortController(job) {
        const queueJobRecordId = this.getDurableRecordId(job);
        if (queueJobRecordId)
          this.abortControllers.delete(queueJobRecordId);
      }
      isCancellationRequested(job) {
        const queueJobRecordId = this.getDurableRecordId(job);
        return Boolean(
          queueJobRecordId && this.cancellationRequests.has(queueJobRecordId)
        );
      }
      isAbortError(error) {
        return error instanceof DOMException && error.name === "AbortError";
      }
      throwIfCancellationRequested(job) {
        if (this.isCancellationRequested(job)) {
          throw new QueueJobCancelledError();
        }
      }
      async getJobs(status, start = 0, end = -1) {
        let jobs = [];
        if (status) {
          switch (status) {
            case "waiting":
              jobs = [...this.waiting];
              break;
            case "active":
              jobs = [...this.active];
              break;
            case "completed":
              jobs = [...this.completed];
              break;
            case "failed":
              jobs = [...this.failed];
              break;
            case "delayed":
              jobs = [...this.delayed];
              break;
            case "cancelled":
              jobs = [];
              break;
          }
        } else {
          jobs = [
            ...this.active,
            ...this.waiting,
            ...this.delayed,
            ...this.completed,
            ...this.failed
          ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (end === -1) {
          return jobs.slice(start);
        }
        return jobs.slice(start, end + 1);
      }
      async close() {
        this.removeAllListeners();
        console.log(`[InMemoryQueue] Queue ${this.name} closed`);
      }
      async updateDurableJob(job, status, options = {}) {
        const queueJobRecordId = Number(job.data?.queueJobRecordId);
        if (!Number.isFinite(queueJobRecordId) || queueJobRecordId <= 0)
          return;
        try {
          const database = await Promise.resolve().then(() => (init_db(), db_exports));
          await database.updateQueueJobRecord(queueJobRecordId, {
            status,
            errorMessage: truncateOperationalText(options.errorMessage) ?? null,
            messageId: options.messageId,
            payloadJson: serializeSafeJson(
              serializeDurableQueuePayload(
                toDurableQueueName(this.name),
                job.data,
                job.id,
                options.result
              )
            )
          });
        } catch (error) {
          console.warn("[Queue] Failed to update durable queue job:", error);
        }
      }
    };
    messageQueue = new InMemoryQueue("outreach-messages", {
      concurrency: Number(process.env.MESSAGE_QUEUE_CONCURRENCY || 2),
      rateLimiter: { max: 50, duration: 6e4 }
      // 50 per minute
    });
    discoveryQueue = new InMemoryQueue("candidate-discovery", {
      concurrency: Number(process.env.DISCOVERY_QUEUE_CONCURRENCY || 1)
    });
    messageQueue.on("completed", ({ jobId, returnvalue }) => {
      console.log(`[MessageQueue] Job ${jobId} completed:`, returnvalue);
    });
    messageQueue.on("failed", ({ jobId, failedReason }) => {
      console.error(`[MessageQueue] Job ${jobId} failed:`, failedReason);
    });
    discoveryQueue.on("completed", ({ jobId, returnvalue }) => {
      console.log(`[DiscoveryQueue] Job ${jobId} completed:`, returnvalue);
    });
    discoveryQueue.on("failed", ({ jobId, failedReason }) => {
      console.error(`[DiscoveryQueue] Job ${jobId} failed:`, failedReason);
    });
    process.on("SIGTERM", async () => {
      console.log("[Queue] Received SIGTERM, closing queues...");
      await closeQueues();
      process.exit(0);
    });
    process.on("SIGINT", async () => {
      console.log("[Queue] Received SIGINT, closing queues...");
      await closeQueues();
      process.exit(0);
    });
  }
});

// server/services/scheduledCampaigns.ts
var scheduledCampaigns_exports = {};
__export(scheduledCampaigns_exports, {
  calculateNextExecution: () => calculateNextExecution,
  getOptimalTimeSuggestions: () => getOptimalTimeSuggestions,
  startCampaignScheduler: () => startCampaignScheduler,
  stopCampaignScheduler: () => stopCampaignScheduler
});
import { eq as eq2, and as and2, lte } from "drizzle-orm";
function startCampaignScheduler() {
  if (schedulerInterval) {
    console.log("[ScheduledCampaigns] Scheduler already running");
    return;
  }
  console.log("[ScheduledCampaigns] Starting campaign scheduler");
  checkScheduledCampaigns();
  schedulerInterval = setInterval(checkScheduledCampaigns, CHECK_INTERVAL);
}
function stopCampaignScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[ScheduledCampaigns] Scheduler stopped");
  }
}
async function checkScheduledCampaigns() {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[ScheduledCampaigns] Database not available");
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const scheduledCampaigns = await db.select().from(campaigns).where(
      and2(
        eq2(campaigns.status, "scheduled"),
        eq2(campaigns.isScheduled, 1),
        lte(campaigns.nextExecutionAt, now)
      )
    );
    if (scheduledCampaigns.length === 0) {
      return;
    }
    console.log(
      `[ScheduledCampaigns] Found ${scheduledCampaigns.length} campaigns to execute`
    );
    for (const campaign of scheduledCampaigns) {
      try {
        await executeCampaign(campaign);
      } catch (error) {
        console.error(
          `[ScheduledCampaigns] Error executing campaign ${campaign.id}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "[ScheduledCampaigns] Error checking scheduled campaigns:",
      error
    );
  }
}
async function executeCampaign(campaign) {
  const db = await getDb();
  if (!db)
    throw new Error("Database not available");
  console.log(
    `[ScheduledCampaigns] Executing campaign ${campaign.id}: ${campaign.title}`
  );
  const readiness = await recordReadinessSnapshot(campaign, campaign.userId);
  if (readiness.status === "blocked") {
    await createAuditEvent({
      userId: campaign.userId,
      campaignId: campaign.id,
      entityType: "campaign",
      entityId: campaign.id,
      action: "campaign.discovery_blocked_readiness",
      actor: "system",
      source: "scheduledCampaigns.executeCampaign",
      riskLevel: "medium",
      afterState: JSON.stringify({
        blockers: readiness.blockers,
        status: readiness.status
      })
    });
    throw new Error(
      `Scheduled campaign discovery is blocked by readiness checks: ${readiness.blockers.join("; ")}`
    );
  }
  const targetPlatforms = JSON.parse(campaign.targetPlatforms);
  const searchCriteria = parseCampaignSearchCriteria(campaign.searchCriteria);
  const scheduleDecision = getScheduledExecutionDecision(searchCriteria);
  if (scheduleDecision.quietHoursActive) {
    await db.update(campaigns).set({
      nextExecutionAt: scheduleDecision.nextAllowedExecutionAt,
      status: "scheduled"
    }).where(eq2(campaigns.id, campaign.id));
    await createAuditEvent({
      userId: campaign.userId,
      campaignId: campaign.id,
      entityType: "campaign",
      entityId: campaign.id,
      action: "campaign.discovery_deferred_quiet_hours",
      actor: "system",
      source: "scheduledCampaigns.executeCampaign",
      riskLevel: "low",
      afterState: JSON.stringify({
        quietHoursStart: scheduleDecision.safetyPolicy.quietHoursStart,
        quietHoursEnd: scheduleDecision.safetyPolicy.quietHoursEnd,
        nextAllowedExecutionAt: scheduleDecision.nextAllowedExecutionAt.toISOString()
      })
    });
    console.log(
      `[ScheduledCampaigns] Campaign ${campaign.id} deferred until ${scheduleDecision.nextAllowedExecutionAt.toISOString()} due to quiet hours`
    );
    return;
  }
  const { getAllPlatforms: getAllPlatforms2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const allPlatforms = await getAllPlatforms2();
  const platformIds = allPlatforms.filter(
    (p) => targetPlatforms.includes(p.id) || targetPlatforms.includes(p.name)
  ).map((p) => p.id);
  for (const platformId of platformIds) {
    await addDiscoveryToQueue({
      campaignId: campaign.id,
      platformId,
      searchCriteria,
      userId: campaign.userId
    });
  }
  const updates = {
    status: "active",
    lastExecutedAt: /* @__PURE__ */ new Date()
  };
  if (campaign.isRecurring === 1 && campaign.recurringPattern) {
    const nextExecution = calculateNextExecution(campaign.recurringPattern);
    updates.nextExecutionAt = nextExecution;
    updates.status = "scheduled";
    console.log(
      `[ScheduledCampaigns] Campaign ${campaign.id} will run again at ${nextExecution}`
    );
  } else {
    updates.nextExecutionAt = null;
    updates.status = "active";
  }
  await db.update(campaigns).set(updates).where(eq2(campaigns.id, campaign.id));
  console.log(
    `[ScheduledCampaigns] Campaign ${campaign.id} executed successfully`
  );
}
function calculateNextExecution(pattern) {
  const now = /* @__PURE__ */ new Date();
  switch (pattern) {
    case "daily":
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    case "weekly":
      const nextWeek = new Date(now);
      const daysUntilMonday = (8 - nextWeek.getDay()) % 7 || 7;
      nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
      nextWeek.setHours(9, 0, 0, 0);
      return nextWeek;
    case "monthly":
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(9, 0, 0, 0);
      return nextMonth;
    default:
      const defaultNext = new Date(now);
      defaultNext.setDate(defaultNext.getDate() + 1);
      defaultNext.setHours(9, 0, 0, 0);
      return defaultNext;
  }
}
function getOptimalTimeSuggestions() {
  const now = /* @__PURE__ */ new Date();
  const suggestions = [];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  suggestions.push({ label: "Tomorrow at 9:00 AM", date: tomorrow });
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  suggestions.push({ label: "Next Monday at 9:00 AM", date: nextMonday });
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);
  suggestions.push({ label: "Next week at 9:00 AM", date: nextWeek });
  return suggestions;
}
var CHECK_INTERVAL, schedulerInterval;
var init_scheduledCampaigns = __esm({
  "server/services/scheduledCampaigns.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_inMemoryQueue();
    init_outreachLedger();
    init_db();
    init_campaignSafety();
    CHECK_INTERVAL = 60 * 1e3;
    schedulerInterval = null;
    startCampaignScheduler();
    process.on("SIGINT", stopCampaignScheduler);
    process.on("SIGTERM", stopCampaignScheduler);
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/oauth.ts
init_db();

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https")
    return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto)
    return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
init_db();
init_env();
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/_core/secretPolicy.ts
var MIN_HOSTED_SECRET_LENGTH = 32;
function isLocalDesktopMode() {
  return process.env.LOCAL_DESKTOP_MODE === "1" || process.env.LOCAL_DESKTOP_MODE === "true";
}
function assertHostedProductionSecret(name, value, purpose) {
  if (process.env.NODE_ENV !== "production" || isLocalDesktopMode())
    return;
  if (!value) {
    throw new Error(`${name} must be configured for production ${purpose}`);
  }
  if (value.trim().length < MIN_HOSTED_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_HOSTED_SECRET_LENGTH} characters for production ${purpose}`
    );
  }
}

// server/_core/sdk.ts
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms2, fallback) {
    if (fallback && fallback.length > 0)
      return fallback;
    if (!Array.isArray(platforms2) || platforms2.length === 0)
      return null;
    const set = new Set(
      platforms2.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL"))
      return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE"))
      return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE"))
      return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB"))
      return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret && ENV.isProduction) {
      throw new Error("JWT_SECRET must be configured for production sessions");
    }
    assertHostedProductionSecret("JWT_SECRET", secret, "sessions");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
init_rateLimiter();
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  try {
    await consumeApiLimit(ctx.user.id, 1);
  } catch (error) {
    throw new TRPCError2({
      code: "TOO_MANY_REQUESTS",
      message: error instanceof Error ? error.message : "Rate limit exceeded. Please try again later."
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_db();
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/_core/crypto.ts
init_env();
import crypto from "node:crypto";
import fs2 from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
var VERSION_PREFIX = "v1";
var IV_LENGTH = 12;
var AUTH_TAG_LENGTH = 16;
var LOCAL_KEY_FILE = "credential-encryption.key";
function getLocalCredentialKeyPath() {
  const localDataDir = process.env.LOCAL_DATA_DIR || path2.join(process.env.APPDATA || os2.tmpdir(), "NationaleHulpgidsReachOut");
  return path2.join(localDataDir, LOCAL_KEY_FILE);
}
function getOrCreateLocalCredentialKey() {
  const keyPath = getLocalCredentialKeyPath();
  if (fs2.existsSync(keyPath)) {
    const existingKey = fs2.readFileSync(keyPath, "utf-8").trim();
    if (existingKey)
      return existingKey;
  }
  const key = crypto.randomBytes(32).toString("base64url");
  fs2.mkdirSync(path2.dirname(keyPath), { recursive: true });
  fs2.writeFileSync(keyPath, key, { encoding: "utf-8", mode: 384 });
  return key;
}
function getEncryptionKey() {
  const configuredSecret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || ENV.cookieSecret;
  const secret = configuredSecret || (isLocalDesktopMode() ? getOrCreateLocalCredentialKey() : "local-development-credential-key");
  if (!configuredSecret && !isLocalDesktopMode() && process.env.NODE_ENV === "production") {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY or JWT_SECRET must be configured before storing credentials."
    );
  }
  assertHostedProductionSecret(
    process.env.CREDENTIAL_ENCRYPTION_KEY ? "CREDENTIAL_ENCRYPTION_KEY" : "JWT_SECRET",
    configuredSecret,
    "credential encryption"
  );
  return crypto.createHash("sha256").update(secret).digest();
}
function encryptSecret(value) {
  if (!value)
    return void 0;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}
function decryptSecret(value) {
  if (!value)
    return void 0;
  if (!value.startsWith(`${VERSION_PREFIX}:`)) {
    try {
      return Buffer.from(value, "base64").toString("utf8");
    } catch {
      return void 0;
    }
  }
  const [, ivValue, authTagValue, encryptedValue] = value.split(":");
  if (!ivValue || !authTagValue || !encryptedValue)
    return void 0;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

// server/routers.ts
init_outreachLedger();
init_rateLimiter();
init_safeSerialization();
init_campaignSafety();

// server/services/campaignExport.ts
init_db();
init_outreachLedger();
var SENSITIVE_EXPORT_KEY_PATTERN = /password|passphrase|secret|token|cookie|session|api[-_]?key|authorization|credential|csrf|private[-_]?key|encryptedPassword|sessionData/i;
async function buildCampaignLedgerExport(campaign, userId) {
  const ledger = await getOperatingLedger(campaign, userId);
  return {
    schemaVersion: 1,
    exportType: "campaign_operating_ledger",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    personalDataIncluded: true,
    campaign: sanitizeRecord(ledger.campaign),
    readiness: ledger.readiness,
    summary: ledger.summary,
    quality: ledger.quality,
    nextActions: ledger.nextActions,
    candidates: ledger.candidates.map((candidate) => sanitizeRecord(candidate)),
    messages: ledger.messages.map((message) => sanitizeRecord(message)),
    approvals: ledger.approvals.map((approval) => sanitizeRecord(approval)),
    sendAttempts: ledger.sendAttempts.map((attempt) => sanitizeRecord(attempt)),
    responses: ledger.responses.map((response) => sanitizeRecord(response)),
    qualificationDecisions: ledger.qualificationDecisions.map(
      (decision) => sanitizeRecord(decision)
    ),
    latestQualificationDecisions: ledger.latestQualificationDecisions.map(
      (decision) => sanitizeRecord(decision)
    ),
    rateLimitEvents: ledger.rateLimitEvents.map((event) => sanitizeRecord(event)),
    auditEvents: ledger.auditEvents.map((event) => ({
      ...sanitizeRecord(event),
      beforeState: sanitizeSerializedState(event.beforeState),
      afterState: sanitizeSerializedState(event.afterState)
    })),
    counts: {
      candidates: ledger.candidates.length,
      messages: ledger.messages.length,
      approvals: ledger.approvals.length,
      sendAttempts: ledger.sendAttempts.length,
      responses: ledger.responses.length,
      qualificationDecisions: ledger.qualificationDecisions.length,
      latestQualificationDecisions: ledger.latestQualificationDecisions.length,
      rateLimitEvents: ledger.rateLimitEvents.length,
      auditEvents: ledger.auditEvents.length
    }
  };
}
function sanitizeSerializedState(value) {
  if (typeof value !== "string")
    return sanitizeValue(value);
  try {
    return sanitizeValue(JSON.parse(value));
  } catch {
    return value;
  }
}
function sanitizeRecord(value) {
  return sanitizeValue(value);
}
function sanitizeValue(value) {
  if (value == null)
    return value;
  if (value instanceof Date)
    return value.toISOString();
  if (Array.isArray(value))
    return value.map((entry) => sanitizeValue(entry));
  if (typeof value === "bigint")
    return value.toString();
  if (typeof value !== "object")
    return value;
  const result = {};
  for (const [key, entryValue] of Object.entries(
    value
  )) {
    if (SENSITIVE_EXPORT_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitizeValue(entryValue);
  }
  return result;
}
async function recordCampaignLedgerExportAudit(input) {
  return createAuditEvent({
    userId: input.userId,
    campaignId: input.campaignId,
    entityType: "campaign",
    entityId: input.campaignId,
    action: "campaign.ledger_exported",
    actor: "user",
    source: "campaigns.exportLedger",
    riskLevel: "high",
    afterState: JSON.stringify({
      exportType: "campaign_operating_ledger",
      personalDataAcknowledged: true,
      counts: input.counts
    })
  });
}

// server/routers.ts
init_inMemoryQueue();
var credentialSecretSchema = z2.string().min(1, "Credential value is required").max(4096, "Credential value is too large").refine((value) => value.trim().length > 0, "Credential value is required");
var credentialEmailSchema = z2.string().trim().toLowerCase().email("A valid email address is required").max(320, "Email address is too large");
var platformCredentialSaveSchema = z2.object({
  platformId: z2.number().int().positive(),
  email: credentialEmailSchema,
  password: credentialSecretSchema.optional(),
  apiKey: credentialSecretSchema.optional()
}).refine((input) => input.password || input.apiKey, {
  message: "A password or API key is required",
  path: ["password"]
});
var platformCredentialTestSchema = z2.object({
  platformId: z2.number().int().positive(),
  email: credentialEmailSchema,
  password: credentialSecretSchema
});
var responseClassificationSchema = z2.enum([
  "interested",
  "not_interested",
  "more_info",
  "unavailable",
  "no_response",
  "unknown"
]);
var deliveryConfirmationTextSchema = z2.string().trim().min(
  20,
  "Confirmation text must describe the platform evidence in at least 20 characters"
).max(2e3, "Confirmation text is too large").optional();
var externalMessageEvidenceSchema = z2.string().trim().min(6, "External message id or URL is too short").max(255, "External message id or URL is too large").optional();
var sendFailureReasonSchema = z2.string().trim().min(8, "Failure reason must describe what happened").max(1e3, "Failure reason is too large").optional();
var rateLimitStateSchema = z2.string().trim().max(2e3, "Rate-limit state is too large").optional();
var messageSnippetTitleSchema = z2.string().trim().min(1, "Snippet title is required").max(120, "Snippet title is too large");
var messageSnippetBodySchema = z2.string().trim().min(1, "Snippet body is required").max(280, "Snippet body is too large");
var messageSnippetLanguageSchema = z2.enum(["nl", "en"]);
var messageSnippetToneSchema = z2.enum(["careful", "warm", "concise"]);
var candidateQualificationDecisionSchema = z2.enum([
  "qualified",
  "not_qualified",
  "needs_review"
]);
var candidateQualificationReasonSchema = z2.string().trim().min(8, "Qualification reason must describe the campaign evidence").max(1e3, "Qualification reason is too large");
var duplicatePairSelectionSchema = z2.object({
  targetCandidateId: z2.number().int().positive(),
  sourceCandidateId: z2.number().int().positive()
});
var optionalTrimmedText = (max) => z2.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
  z2.string().trim().max(max).optional()
);
var optionalImportedEmailSchema = z2.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
  z2.string().trim().toLowerCase().email().max(320).optional()
);
var optionalImportedUrlSchema = z2.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
  z2.string().trim().url().max(2e3).optional()
);
var candidateImportRowSchema = z2.object({
  name: z2.string().trim().min(1).max(255),
  email: optionalImportedEmailSchema,
  phone: optionalTrimmedText(50),
  profileUrl: optionalImportedUrlSchema,
  location: optionalTrimmedText(255),
  services: optionalTrimmedText(1e3),
  experience: optionalTrimmedText(1e3),
  availability: optionalTrimmedText(1e3),
  bio: optionalTrimmedText(2e3),
  platformName: optionalTrimmedText(100)
});
var terminalNegativeResponseClassifications = /* @__PURE__ */ new Set([
  "not_interested",
  "unavailable"
]);
var BULK_APPROVAL_REVIEW_THRESHOLD = 10;
var BATCH_DUPLICATE_RESOLUTION_LIMIT = 10;
var sensitiveMessagePattern = /\b(bsn|medicatie|diagnose|ziekte|psychisch|trauma|verslaving|persoonlijke verzorging|intiem|toilet|dementie|autisme|adhd|ptss|depressie|angst|beperking|behandeling|therapie)\b/i;
var duplicateBlockingMessageStatuses = /* @__PURE__ */ new Set([
  "draft",
  "queued",
  "approved",
  "sent",
  "delivered",
  "replied",
  "responded",
  "failed"
]);
function getReasonAuditMetadata(reason) {
  const trimmedReason = reason?.trim();
  return {
    reasonProvided: !!trimmedReason,
    reasonLength: trimmedReason?.length ?? 0
  };
}
function getEmailAuditMetadata(email) {
  const trimmedEmail = email?.trim();
  const domain = trimmedEmail?.includes("@") ? trimmedEmail.split("@").pop() : void 0;
  return {
    emailProvided: !!trimmedEmail,
    emailDomain: domain,
    emailLength: trimmedEmail?.length ?? 0
  };
}
function summarizeIdentityContextForAudit(context) {
  const identity = context?.identity;
  const sources = Array.isArray(context?.sources) ? context.sources : [];
  return {
    identityId: identity?.id ?? null,
    sourceId: context?.source?.id ?? null,
    sourceCount: sources.length,
    candidateIds: sources.map((source) => source.candidateId).filter((candidateId) => typeof candidateId === "number"),
    platformIds: Array.from(
      new Set(
        sources.map((source) => source.platformId).filter((platformId) => typeof platformId === "number")
      )
    ),
    hasCanonicalEmail: !!identity?.canonicalEmail,
    hasCanonicalPhone: !!identity?.canonicalPhone,
    hasLocation: !!identity?.location,
    sourceProfileUrlCount: sources.filter((source) => source.profileUrl).length,
    sourceExternalIdCount: sources.filter((source) => source.externalId).length
  };
}
function isTerminalNegativeResponseClassification(classification) {
  return terminalNegativeResponseClassifications.has(classification);
}
function getSensitiveMessageWarnings(message) {
  const text2 = `${message.subject ?? ""}
${message.content ?? ""}`;
  return sensitiveMessagePattern.test(text2) ? ["Message may contain sensitive care, health, or personal context"] : [];
}
function parsePositiveInteger(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
function candidateDuplicatePairKey2(candidateAId, candidateBId) {
  const [firstId, secondId] = [candidateAId, candidateBId].sort(
    (a, b) => a - b
  );
  return `${firstId}:${secondId}`;
}
function splitList2(value) {
  if (Array.isArray(value))
    return value.filter((entry) => typeof entry === "string");
  if (typeof value !== "string")
    return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}
function parseHourlyRateCents2(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value * 100);
  if (typeof value !== "string")
    return null;
  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match)
    return null;
  return Math.round(Number(match[1]) * 100);
}
function parseCampaignTargetPlatforms(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed))
      return [];
    return parsed.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0);
  } catch {
    return [];
  }
}
async function resolveImportPlatform(input) {
  if (input.platformName) {
    const platform = await resolvePlatformIdentity({
      platformName: input.platformName
    });
    if (!platform) {
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: `Unknown import platform: ${input.platformName}`
      });
    }
    return platform;
  }
  const [firstCampaignPlatformId] = parseCampaignTargetPlatforms(
    input.campaign.targetPlatforms
  );
  if (firstCampaignPlatformId) {
    const platform = await getPlatformById(firstCampaignPlatformId);
    if (platform)
      return platform;
  }
  const fallbackPlatform = await getPlatformByName("Nationale Hulpgids");
  if (fallbackPlatform)
    return fallbackPlatform;
  throw new TRPCError3({
    code: "BAD_REQUEST",
    message: "No platform is available for candidate import."
  });
}
async function getOwnedMessageOrThrow(userId, messageId) {
  const message = (await getAllMessages(userId)).find(
    (entry) => entry.id === messageId
  );
  if (!message) {
    throw new TRPCError3({ code: "NOT_FOUND", message: "Message not found" });
  }
  return message;
}
async function getCandidateOutreachScopeCandidateIds(candidateId) {
  const context = await getCandidateIdentityContext(candidateId);
  const candidateIds = /* @__PURE__ */ new Set([candidateId]);
  for (const source of context.sources ?? []) {
    if (typeof source.candidateId === "number") {
      candidateIds.add(source.candidateId);
    }
  }
  return Array.from(candidateIds);
}
async function getLatestTerminalNegativeResponse(candidateId) {
  const candidateIds = await getCandidateOutreachScopeCandidateIds(candidateId);
  const responses = (await Promise.all(
    candidateIds.map(
      (scopeCandidateId) => getCandidateResponsesByCandidateId(scopeCandidateId)
    )
  )).flat().sort((a, b) => {
    const bTime = new Date(b.createdAt ?? b.receivedAt).getTime();
    const aTime = new Date(a.createdAt ?? a.receivedAt).getTime();
    return bTime - aTime;
  });
  const latestResponse = responses[0];
  if (latestResponse && isTerminalNegativeResponseClassification(latestResponse.classification)) {
    return latestResponse;
  }
  return void 0;
}
async function blockMessageActionForTerminalResponse(input) {
  const terminalResponse = await getLatestTerminalNegativeResponse(
    input.message.candidateId
  );
  if (!terminalResponse)
    return;
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.message.campaignId,
    entityType: "message",
    entityId: input.message.id,
    action: input.action,
    actor: input.actor,
    source: input.source,
    riskLevel: input.riskLevel ?? "high",
    afterState: JSON.stringify({
      responseId: terminalResponse.id,
      responseCandidateId: terminalResponse.candidateId,
      messageCandidateId: input.message.candidateId,
      classification: terminalResponse.classification
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "Message action is blocked because the latest candidate response says to stop or pause outreach."
  });
}
async function getBlockingQualificationDecision(candidateId) {
  const latestDecision = (await getCandidateQualificationDecisionsByCandidateId(candidateId))[0];
  if (latestDecision && latestDecision.decision !== "qualified") {
    return latestDecision;
  }
  return void 0;
}
async function blockOutreachForCandidateQualification(input) {
  const blockingDecision = await getBlockingQualificationDecision(
    input.candidateId
  );
  if (!blockingDecision)
    return;
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.campaignId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actor: input.actor ?? "system",
    source: input.source,
    riskLevel: input.riskLevel ?? "high",
    afterState: JSON.stringify({
      candidateId: input.candidateId,
      qualificationDecisionId: blockingDecision.id,
      decision: blockingDecision.decision,
      reasonLength: blockingDecision.reason.length
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "Outreach is blocked until this candidate is marked qualified."
  });
}
async function blockApprovalForDryRunCampaign(input) {
  const campaign = await getCampaignById(input.message.campaignId);
  if (!campaign || !isDryRunSearchCriteria(campaign.searchCriteria))
    return;
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.message.campaignId,
    entityType: "message",
    entityId: input.message.id,
    action: input.action,
    actor: "system",
    source: input.source,
    riskLevel: "medium",
    afterState: JSON.stringify({
      operationMode: "dry_run",
      status: input.message.status
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "This campaign is in dry-run mode. Drafts can be reviewed and edited, but approvals are blocked until the campaign is switched to reviewed outreach mode."
  });
}
async function blockSendForDryRunCampaign(input) {
  const campaign = await getCampaignById(input.message.campaignId);
  if (!campaign || !isDryRunSearchCriteria(campaign.searchCriteria))
    return;
  const attemptId = await createMessageSendAttempt({
    messageId: input.message.id,
    campaignId: input.message.campaignId,
    candidateId: input.message.candidateId,
    platformId: input.message.platformId,
    status: "blocked",
    errorMessage: "Message send blocked because the campaign is in dry-run mode.",
    confirmationText: input.confirmationText,
    externalMessageId: input.externalMessageId,
    rateLimitState: input.rateLimitState,
    finishedAt: /* @__PURE__ */ new Date()
  });
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.message.campaignId,
    entityType: "message",
    entityId: input.message.id,
    action: "message.send_blocked_dry_run",
    actor: "system",
    source: input.source,
    riskLevel: "high",
    afterState: JSON.stringify({
      attemptId,
      operationMode: "dry_run"
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "This campaign is in dry-run mode. External send attempts are blocked until the campaign is switched to reviewed outreach mode."
  });
}
async function blockSendForCandidateQualification(input) {
  const blockingDecision = await getBlockingQualificationDecision(
    input.message.candidateId
  );
  if (!blockingDecision)
    return;
  const attemptId = await createMessageSendAttempt({
    messageId: input.message.id,
    campaignId: input.message.campaignId,
    candidateId: input.message.candidateId,
    platformId: input.message.platformId,
    status: "blocked",
    errorMessage: "Message send blocked because the candidate is not currently marked qualified.",
    confirmationText: input.confirmationText,
    externalMessageId: input.externalMessageId,
    rateLimitState: input.rateLimitState,
    finishedAt: /* @__PURE__ */ new Date()
  });
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.message.campaignId,
    entityType: "message",
    entityId: input.message.id,
    action: "message.send_blocked_candidate_qualification",
    actor: "system",
    source: input.source,
    riskLevel: "high",
    afterState: JSON.stringify({
      attemptId,
      candidateId: input.message.candidateId,
      qualificationDecisionId: blockingDecision.id,
      decision: blockingDecision.decision,
      reasonLength: blockingDecision.reason.length
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "Message send is blocked until this candidate is marked qualified."
  });
}
async function blockArchivedCampaignAction(input) {
  if (input.campaign.status !== "archived")
    return;
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.campaign.id,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actor: "system",
    source: input.source,
    riskLevel: input.riskLevel ?? "medium",
    afterState: JSON.stringify({
      campaignStatus: "archived",
      ...input.afterState
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "This campaign is archived. Outreach actions are blocked, but the preserved ledger remains available for review."
  });
}
async function blockMessageActionForArchivedCampaign(input) {
  const campaign = await getCampaignById(input.message.campaignId);
  if (!campaign)
    return;
  await blockArchivedCampaignAction({
    userId: input.userId,
    campaign,
    entityType: "message",
    entityId: input.message.id,
    action: input.action,
    source: input.source,
    riskLevel: input.riskLevel,
    afterState: { messageStatus: input.message.status }
  });
}
async function blockSendForArchivedCampaign(input) {
  const campaign = await getCampaignById(input.message.campaignId);
  if (!campaign || campaign.status !== "archived")
    return;
  const attemptId = await createMessageSendAttempt({
    messageId: input.message.id,
    campaignId: input.message.campaignId,
    candidateId: input.message.candidateId,
    platformId: input.message.platformId,
    status: "blocked",
    errorMessage: "Message send blocked because the campaign is archived.",
    confirmationText: input.confirmationText,
    externalMessageId: input.externalMessageId,
    rateLimitState: input.rateLimitState,
    finishedAt: /* @__PURE__ */ new Date()
  });
  await createAuditEvent({
    userId: input.userId,
    campaignId: input.message.campaignId,
    entityType: "message",
    entityId: input.message.id,
    action: "message.send_blocked_archived_campaign",
    actor: "system",
    source: input.source,
    riskLevel: "high",
    afterState: JSON.stringify({
      attemptId,
      campaignStatus: "archived"
    })
  });
  throw new TRPCError3({
    code: "CONFLICT",
    message: "This campaign is archived. External send attempts are blocked, but the preserved ledger remains available for review."
  });
}
async function cancelScheduledFollowUpsForTerminalResponse(input) {
  if (!isTerminalNegativeResponseClassification(input.classification)) {
    return [];
  }
  const candidateIds = await getCandidateOutreachScopeCandidateIds(
    input.candidateId
  );
  const scheduledFollowUps = (await Promise.all(candidateIds.map(getFollowUpsForCandidate))).flat().filter((followUp) => followUp.status === "scheduled");
  const cancelledFollowUpIds = [];
  for (const followUp of scheduledFollowUps) {
    await updateFollowUpStatus(followUp.id, "cancelled");
    cancelledFollowUpIds.push(followUp.id);
    if (followUp.messageId) {
      await updateMessageStatus(followUp.messageId, "rejected");
    }
    await createAuditEvent({
      userId: input.userId,
      campaignId: followUp.campaignId,
      entityType: "followUp",
      entityId: followUp.id,
      action: "follow_up.cancelled_by_response",
      actor: "system",
      source: input.source,
      riskLevel: "medium",
      beforeState: JSON.stringify({
        status: "scheduled",
        messageId: followUp.messageId
      }),
      afterState: JSON.stringify({
        status: "cancelled",
        responseId: input.responseId,
        responseCandidateId: input.candidateId,
        followUpCandidateId: followUp.candidateId,
        identityCandidateCount: candidateIds.length,
        classification: input.classification
      })
    });
  }
  return cancelledFollowUpIds;
}
function buildCandidateNextActions(input) {
  const actions = [];
  const queued = input.messages.filter(
    (message) => message.status === "queued"
  ).length;
  const approved = input.messages.filter(
    (message) => message.status === "approved"
  ).length;
  const failed = input.sendAttempts.filter(
    (attempt) => ["failed", "blocked"].includes(attempt.status)
  ).length;
  if (input.outreachLock) {
    actions.push({
      priority: "high",
      label: "Outreach stopped",
      detail: input.outreachLock.candidateId === input.candidate.id ? `Latest response is ${input.outreachLock.classification}; reopen only with a clear audit reason.` : `Linked source profile #${input.outreachLock.candidateId} has a ${input.outreachLock.classification} response; outreach is stopped for this identity.`
    });
  }
  if (input.sourceCount > 1) {
    actions.push({
      priority: "medium",
      label: "Review duplicate identity",
      detail: `This identity has ${input.sourceCount} source profiles.`
    });
  }
  if ((input.duplicateCount ?? 0) > 0) {
    actions.push({
      priority: "medium",
      label: "Merge possible duplicate",
      detail: `${input.duplicateCount} likely duplicate profile${input.duplicateCount === 1 ? "" : "s"} need review before merging.`
    });
  }
  if (!input.latestQualificationDecision) {
    actions.push({
      priority: "medium",
      label: "Record qualification decision",
      detail: "Decide whether this candidate is qualified, not qualified, or needs review."
    });
  } else if (input.latestQualificationDecision.decision === "qualified") {
    actions.push({
      priority: "low",
      label: "Qualified candidate",
      detail: "Candidate is marked qualified; continue with approved outreach or response tracking."
    });
  } else if (input.latestQualificationDecision.decision === "not_qualified") {
    actions.push({
      priority: "medium",
      label: "Avoid new outreach",
      detail: "Candidate is marked not qualified; change the decision before starting new outreach."
    });
  }
  if (queued > 0) {
    actions.push({
      priority: "medium",
      label: "Review draft",
      detail: `${queued} queued message${queued === 1 ? "" : "s"} need approval or rejection.`
    });
  }
  if (approved > 0) {
    actions.push({
      priority: "high",
      label: "Ready for controlled sending",
      detail: `${approved} approved message${approved === 1 ? "" : "s"} require send evidence before being marked sent.`
    });
  }
  if (failed > 0) {
    actions.push({
      priority: "high",
      label: "Resolve send issue",
      detail: `${failed} send attempt${failed === 1 ? "" : "s"} failed or were blocked.`
    });
  }
  if (input.responses.some((response) => response.classification === "unknown")) {
    actions.push({
      priority: "low",
      label: "Classify response",
      detail: "At least one response needs manual classification review."
    });
  }
  if (actions.length === 0) {
    actions.push({
      priority: "low",
      label: "No immediate action",
      detail: "Candidate ledger has no current blockers."
    });
  }
  return actions;
}
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  // Queue management router
  queue: router({
    getStats: protectedProcedure.input(z2.object({ queueName: z2.enum(["messages", "discovery"]) })).query(async ({ input }) => {
      return await getQueueStats(input.queueName);
    }),
    getJobs: protectedProcedure.input(
      z2.object({
        queueName: z2.enum(["messages", "discovery"]),
        status: z2.enum(["waiting", "active", "completed", "failed", "delayed"]).optional(),
        start: z2.number().default(0),
        end: z2.number().default(49)
        // Default to 50 jobs
      })
    ).query(async ({ input }) => {
      const { messageQueue: messageQueue2, discoveryQueue: discoveryQueue2 } = await Promise.resolve().then(() => (init_inMemoryQueue(), inMemoryQueue_exports));
      const queue = input.queueName === "messages" ? messageQueue2 : discoveryQueue2;
      return await queue.getJobs(input.status, input.start, input.end);
    }),
    getDurableJobs: protectedProcedure.input(
      z2.object({
        queueName: z2.enum(["messages", "discovery"]).optional(),
        status: z2.enum([
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed",
          "cancelled"
        ]).optional(),
        limit: z2.number().int().min(1).max(200).default(50),
        offset: z2.number().int().min(0).default(0)
      })
    ).query(async ({ input, ctx }) => {
      return getQueueJobRecords(
        ctx.user.id,
        input.queueName,
        input.status,
        { limit: input.limit, offset: input.offset }
      );
    }),
    getHealth: protectedProcedure.input(
      z2.object({
        limit: z2.number().int().min(1).max(500).default(200)
      }).optional()
    ).query(async ({ input, ctx }) => {
      const [messageStats, discoveryStats, durable] = await Promise.all([
        getQueueStats("messages"),
        getQueueStats("discovery"),
        getQueueHealthSummary(ctx.user.id, {
          limit: input?.limit
        })
      ]);
      const liveByQueue = {
        messages: messageStats,
        discovery: discoveryStats
      };
      return {
        ...durable,
        queues: durable.queues.map((queue) => ({
          ...queue,
          live: liveByQueue[queue.queueName]
        })),
        totals: {
          live: {
            waiting: messageStats.waiting + discoveryStats.waiting,
            active: messageStats.active + discoveryStats.active,
            completed: messageStats.completed + discoveryStats.completed,
            failed: messageStats.failed + discoveryStats.failed,
            delayed: messageStats.delayed + discoveryStats.delayed,
            total: messageStats.total + discoveryStats.total
          },
          durable: durable.queues.reduce(
            (totals, queue) => {
              totals.recentRecords += queue.durable.recentRecords;
              totals.failed += queue.durable.failed;
              totals.failedLast24h += queue.failedLast24h;
              return totals;
            },
            { recentRecords: 0, failed: 0, failedLast24h: 0 }
          )
        }
      };
    }),
    recordJob: protectedProcedure.input(
      z2.object({
        queueName: z2.enum(["messages", "discovery"]),
        jobType: z2.string().min(1).max(100),
        status: z2.enum([
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed",
          "cancelled"
        ]).optional(),
        campaignId: z2.number().optional(),
        messageId: z2.number().optional(),
        payload: z2.record(z2.string(), z2.unknown()).optional(),
        errorMessage: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (input.campaignId) {
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError3({
            code: "NOT_FOUND",
            message: "Campaign not found"
          });
        }
      }
      const id = await createQueueJobRecord({
        userId: ctx.user.id,
        campaignId: input.campaignId,
        messageId: input.messageId,
        queueName: input.queueName,
        jobType: input.jobType,
        status: input.status ?? "waiting",
        payloadJson: input.payload ? serializeSafeJson(input.payload) : void 0,
        errorMessage: truncateOperationalText(input.errorMessage)
      });
      return { success: true, id };
    }),
    cancelJob: protectedProcedure.input(
      z2.object({
        id: z2.number().int().positive(),
        reason: z2.string().trim().max(300).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const job = await getQueueJobRecordForUser(input.id, ctx.user.id);
      if (!job) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Queue job not found"
        });
      }
      const canCancelQueued = job.status === "waiting" || job.status === "delayed";
      const canRequestActiveDiscoveryCancel = job.status === "active" && job.queueName === "discovery";
      if (!canCancelQueued && !canRequestActiveDiscoveryCancel) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Only waiting/delayed jobs can be cancelled immediately; active discovery jobs can request cooperative cancellation."
        });
      }
      const { messageQueue: messageQueue2, discoveryQueue: discoveryQueue2 } = await Promise.resolve().then(() => (init_inMemoryQueue(), inMemoryQueue_exports));
      const queue = job.queueName === "messages" ? messageQueue2 : discoveryQueue2;
      const liveCancellation = await queue.cancelJobByDurableRecordId(job.id);
      if (canRequestActiveDiscoveryCancel && liveCancellation.reason === "not_found") {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "This active discovery job is not attached to a live worker and cannot receive a cooperative cancellation request."
        });
      }
      if (liveCancellation.reason === "not_cancellable") {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "This queue job is already active and cannot be interrupted safely."
        });
      }
      if (liveCancellation.cancellationRequested) {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: job.campaignId ?? void 0,
          entityType: "queueJob",
          entityId: job.id,
          action: "queue.job_cancel_requested",
          actor: "user",
          source: "queue.cancelJob",
          riskLevel: "medium",
          afterState: serializeSafeJson({
            queueName: job.queueName,
            jobType: job.jobType,
            status: job.status,
            cancellationRequested: true,
            liveJobId: liveCancellation.jobId,
            reasonLength: input.reason?.length ?? 0
          })
        });
        return {
          success: true,
          cancellationRequested: true,
          job,
          liveJobId: liveCancellation.jobId
        };
      }
      const cancellation = await cancelQueueJobRecord({
        id: job.id,
        userId: ctx.user.id,
        reason: input.reason
      });
      if (!cancellation.cancelled) {
        throw new TRPCError3({
          code: cancellation.reason === "not_found" ? "NOT_FOUND" : "CONFLICT",
          message: cancellation.reason === "not_found" ? "Queue job not found" : "Only waiting or delayed queue jobs can be cancelled safely."
        });
      }
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: job.campaignId ?? void 0,
        entityType: "queueJob",
        entityId: job.id,
        action: "queue.job_cancelled",
        actor: "user",
        source: "queue.cancelJob",
        riskLevel: "medium",
        afterState: serializeSafeJson({
          queueName: job.queueName,
          jobType: job.jobType,
          previousStatus: job.status,
          status: "cancelled",
          liveJobId: liveCancellation.jobId,
          reasonLength: input.reason?.length ?? 0
        })
      });
      return {
        success: true,
        job: cancellation.job,
        liveJobId: liveCancellation.jobId
      };
    })
  }),
  // Multi-platform reach-out tool routers
  messageSnippets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getActiveMessageSnippets(ctx.user.id);
    }),
    create: protectedProcedure.input(
      z2.object({
        title: messageSnippetTitleSchema,
        body: messageSnippetBodySchema,
        language: messageSnippetLanguageSchema.default("nl"),
        tonePreset: messageSnippetToneSchema.default("careful")
      })
    ).mutation(async ({ input, ctx }) => {
      const snippetId = await createMessageSnippet({
        userId: ctx.user.id,
        title: input.title,
        body: input.body,
        language: input.language,
        tonePreset: input.tonePreset
      });
      await createAuditEvent({
        userId: ctx.user.id,
        entityType: "message_snippet",
        entityId: snippetId,
        action: "message_snippet.created",
        actor: "user",
        source: "messageSnippets.create",
        riskLevel: "medium",
        afterState: JSON.stringify({
          titleLength: input.title.length,
          bodyLength: input.body.length,
          language: input.language,
          tonePreset: input.tonePreset
        })
      });
      const snippet = await getMessageSnippetById(snippetId);
      return { success: true, snippet };
    }),
    archive: protectedProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const snippet = await archiveMessageSnippet(input.id, ctx.user.id);
      await createAuditEvent({
        userId: ctx.user.id,
        entityType: "message_snippet",
        entityId: snippet.id,
        action: "message_snippet.archived",
        actor: "user",
        source: "messageSnippets.archive",
        riskLevel: "low",
        afterState: JSON.stringify({
          titleLength: snippet.title.length,
          bodyLength: snippet.body.length,
          language: snippet.language,
          tonePreset: snippet.tonePreset
        })
      });
      return { success: true };
    })
  }),
  platforms: router({
    list: publicProcedure.query(async () => {
      const { getAllPlatforms: getAllPlatforms2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      return getAllPlatforms2();
    })
  }),
  candidates: router({
    discover: protectedProcedure.input(
      z2.object({
        campaignId: z2.number(),
        platforms: z2.array(z2.string()),
        searchCriteria: z2.object({
          location: z2.string().optional(),
          experience: z2.string().optional(),
          services: z2.string().optional(),
          minBudget: z2.string().optional(),
          maxBudget: z2.string().optional(),
          keywords: z2.string().optional()
        })
      })
    ).mutation(async ({ input, ctx }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      if (campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "You do not have access to this campaign"
        });
      }
      await blockArchivedCampaignAction({
        userId: ctx.user.id,
        campaign,
        entityType: "campaign",
        entityId: campaign.id,
        action: "campaign.discovery_blocked_archived",
        source: "candidates.discover",
        riskLevel: "medium"
      });
      const readiness = await recordReadinessSnapshot(campaign, ctx.user.id);
      if (readiness.status === "blocked") {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "campaign",
          entityId: campaign.id,
          action: "campaign.discovery_blocked_readiness",
          actor: "system",
          source: "candidates.discover",
          riskLevel: "medium",
          afterState: JSON.stringify({
            blockers: readiness.blockers,
            status: readiness.status
          })
        });
        throw new TRPCError3({
          code: "CONFLICT",
          message: `Campaign discovery is blocked by readiness checks: ${readiness.blockers.join("; ")}`
        });
      }
      const { PlatformScraperFactory: PlatformScraperFactory2 } = await Promise.resolve().then(() => (init_platformScraper(), platformScraper_exports));
      const { calculateCompatibility: calculateCompatibility2 } = await Promise.resolve().then(() => (init_aiMatching(), aiMatching_exports));
      const credentialsMap = /* @__PURE__ */ new Map();
      const userCredentials = await getUserPlatformCredentials(
        ctx.user.id
      );
      const allPlatforms = await getAllPlatforms();
      userCredentials.forEach((cred) => {
        const platform = allPlatforms.find(
          (entry) => entry.id === cred.platformId
        );
        if (!platform)
          return;
        credentialsMap.set(platform.name, {
          email: cred.email || "",
          password: decryptSecret(cred.encryptedPassword) || "",
          sessionData: cred.sessionData
        });
      });
      const campaignCriteria = JSON.parse(campaign.searchCriteria || "{}");
      const normalizedCampaignCriteria = {
        ...campaignCriteria,
        services: splitList2(campaignCriteria.services),
        budget: {
          min: parseHourlyRateCents2(campaignCriteria.minBudget),
          max: parseHourlyRateCents2(campaignCriteria.maxBudget)
        }
      };
      const results = await PlatformScraperFactory2.searchMultiplePlatforms(
        input.platforms,
        input.searchCriteria,
        credentialsMap
      );
      const allCandidates = [];
      for (const [platform, candidates2] of Array.from(results.entries())) {
        for (const candidate of candidates2) {
          const matchResult = await calculateCompatibility2(
            {
              location: candidate.location,
              experience: candidate.experience,
              hourlyRate: parseHourlyRateCents2(candidate.hourlyRate)
            },
            normalizedCampaignCriteria
          );
          const compatibilityScore = matchResult.compatibilityScore;
          const platformRecord = await resolvePlatformIdentity({
            platformName: platform
          });
          if (!platformRecord) {
            throw new TRPCError3({
              code: "BAD_REQUEST",
              message: `Unknown platform returned discovery results: ${platform}`
            });
          }
          const platformId = platformRecord.id;
          const candidateId = await createCandidate({
            campaignId: input.campaignId,
            platformId,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            profileUrl: candidate.profileUrl,
            location: candidate.location,
            experience: candidate.experience,
            services: candidate.services,
            availability: candidate.availability,
            hourlyRate: parseHourlyRateCents2(candidate.hourlyRate),
            bio: candidate.bio,
            compatibilityScore,
            matchReasons: JSON.stringify(matchResult.matchReasons || []),
            status: "discovered"
          });
          const storedCandidate = await getCandidateById(candidateId);
          if (storedCandidate) {
            await getOrCreateCandidateIdentity(
              storedCandidate,
              ctx.user.id
            );
            await createAuditEvent({
              userId: ctx.user.id,
              campaignId: input.campaignId,
              entityType: "candidate",
              entityId: candidateId,
              action: "candidate.discovered",
              actor: "system",
              source: platform,
              riskLevel: "low",
              afterState: JSON.stringify({
                platformId,
                compatibilityScore,
                profileUrl: candidate.profileUrl
              })
            });
          }
          allCandidates.push({
            ...candidate,
            id: candidateId,
            compatibilityScore
          });
        }
      }
      return {
        success: true,
        candidatesFound: allCandidates.length,
        candidates: allCandidates
      };
    }),
    importManual: protectedProcedure.input(
      z2.object({
        campaignId: z2.number().int().positive(),
        personalDataAcknowledged: z2.boolean(),
        sourceLabel: z2.string().trim().max(120).optional(),
        candidates: z2.array(candidateImportRowSchema).min(1).max(25)
      })
    ).mutation(async ({ input, ctx }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      await blockArchivedCampaignAction({
        userId: ctx.user.id,
        campaign,
        entityType: "campaign",
        entityId: campaign.id,
        action: "candidate.import_blocked_archived_campaign",
        source: "candidates.importManual",
        riskLevel: "medium"
      });
      if (!input.personalDataAcknowledged) {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "campaign",
          entityId: campaign.id,
          action: "candidate.import_blocked_missing_acknowledgement",
          actor: "user",
          source: "candidates.importManual",
          riskLevel: "medium",
          afterState: JSON.stringify({
            candidateRows: input.candidates.length
          })
        });
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Confirm the personal-data acknowledgement before importing candidates."
        });
      }
      const sourceLabel = input.sourceLabel?.trim() || "manual_import";
      const importedAt = /* @__PURE__ */ new Date();
      const imported = [];
      let duplicateWarningCount = 0;
      for (const row of input.candidates) {
        const platform = await resolveImportPlatform({
          campaign,
          platformName: row.platformName
        });
        const candidateId = await createCandidate({
          campaignId: campaign.id,
          platformId: platform.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          profileUrl: row.profileUrl,
          location: row.location,
          experience: row.experience,
          services: row.services,
          availability: row.availability,
          bio: row.bio,
          compatibilityScore: 0,
          matchReasons: JSON.stringify([
            "Manually imported; run discovery or review before scoring."
          ]),
          profileData: JSON.stringify({
            importSource: sourceLabel,
            importedAt: importedAt.toISOString(),
            platformName: platform.name
          }),
          status: "discovered"
        });
        const storedCandidate = await getCandidateById(candidateId);
        if (!storedCandidate) {
          throw new TRPCError3({
            code: "INTERNAL_SERVER_ERROR",
            message: "Imported candidate could not be read back."
          });
        }
        const duplicateCandidates = await getCandidatePotentialDuplicates(
          candidateId,
          ctx.user.id
        );
        await getOrCreateCandidateIdentity(storedCandidate, ctx.user.id);
        duplicateWarningCount += duplicateCandidates.length;
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "candidate",
          entityId: candidateId,
          action: "candidate.imported",
          actor: "user",
          source: "candidates.importManual",
          riskLevel: duplicateCandidates.length > 0 ? "medium" : "low",
          afterState: JSON.stringify({
            platformId: platform.id,
            sourceLabel,
            hasEmail: Boolean(row.email),
            hasPhone: Boolean(row.phone),
            hasProfileUrl: Boolean(row.profileUrl),
            duplicateWarningCount: duplicateCandidates.length,
            duplicateCandidates: duplicateCandidates.slice(0, 5).map((duplicate) => ({
              candidateId: duplicate.candidate.id,
              confidence: duplicate.confidence,
              reasons: duplicate.reasons
            }))
          })
        });
        imported.push({
          id: candidateId,
          name: storedCandidate.name,
          platformName: platform.name,
          duplicateWarningCount: duplicateCandidates.length,
          duplicateWarnings: duplicateCandidates.slice(0, 5).map((duplicate) => ({
            candidateId: duplicate.candidate.id,
            candidateName: duplicate.candidate.name,
            confidence: duplicate.confidence,
            reasons: duplicate.reasons
          }))
        });
      }
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: campaign.id,
        entityType: "campaign",
        entityId: campaign.id,
        action: "candidate.import_batch_completed",
        actor: "user",
        source: "candidates.importManual",
        riskLevel: duplicateWarningCount > 0 ? "medium" : "low",
        afterState: JSON.stringify({
          importedCount: imported.length,
          duplicateWarningCount,
          sourceLabel,
          personalDataAcknowledged: true
        })
      });
      return {
        success: true,
        importedCount: imported.length,
        duplicateWarningCount,
        imported
      };
    }),
    list: protectedProcedure.input(
      z2.object({
        campaignId: z2.number().optional(),
        platform: z2.string().optional(),
        minScore: z2.number().optional()
      })
    ).query(async ({ input, ctx }) => {
      if (input.campaignId) {
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError3({
            code: "NOT_FOUND",
            message: "Campaign not found"
          });
        }
      }
      const candidates2 = input.campaignId ? await getCampaignCandidates(input.campaignId) : await getUserCandidates(ctx.user.id);
      return candidates2.filter((candidate) => {
        const platformName = candidate.platform?.name || candidate.platform || candidate.platformName;
        if (input.platform && platformName !== input.platform)
          return false;
        if (input.minScore && candidate.compatibilityScore < input.minScore)
          return false;
        return true;
      });
    }),
    getDuplicates: protectedProcedure.query(async ({ ctx }) => {
      return getCandidateDuplicateGroups(ctx.user.id);
    }),
    getDuplicateReviewQueue: protectedProcedure.input(
      z2.object({
        limit: z2.number().int().min(1).max(50).default(10)
      })
    ).query(async ({ input, ctx }) => {
      return getCandidateDuplicateReviewQueue(ctx.user.id, input);
    }),
    searchForPicker: protectedProcedure.input(
      z2.object({
        search: z2.string().trim().max(120).optional(),
        campaignId: z2.number().int().positive().optional(),
        limit: z2.number().int().min(1).max(50).default(25)
      })
    ).query(async ({ input, ctx }) => {
      return searchUserCandidatePickerOptions(ctx.user.id, input);
    }),
    recordQualification: protectedProcedure.input(
      z2.object({
        candidateId: z2.number().int().positive(),
        decision: candidateQualificationDecisionSchema,
        reason: candidateQualificationReasonSchema,
        sensitiveAssumptionsAcknowledged: z2.boolean().default(false)
      })
    ).mutation(async ({ input, ctx }) => {
      const candidate = await getCandidateById(input.candidateId);
      if (!candidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const campaign = await getCampaignById(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      if (campaign.status === "archived") {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "candidate",
          entityId: candidate.id,
          action: "candidate.qualification_blocked_archived_campaign",
          actor: "user",
          source: "candidates.recordQualification",
          riskLevel: "medium",
          afterState: JSON.stringify({
            decision: input.decision,
            reasonLength: input.reason.length
          })
        });
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Archived campaigns cannot be changed."
        });
      }
      if (input.decision === "qualified" && !input.sensitiveAssumptionsAcknowledged) {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "candidate",
          entityId: candidate.id,
          action: "candidate.qualification_blocked_missing_acknowledgement",
          actor: "user",
          source: "candidates.recordQualification",
          riskLevel: "high",
          afterState: JSON.stringify({
            decision: input.decision,
            reasonLength: input.reason.length
          })
        });
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Confirm the qualification decision is based on relevant campaign evidence."
        });
      }
      const decisionId = await createCandidateQualificationDecision({
        candidateId: candidate.id,
        campaignId: campaign.id,
        userId: ctx.user.id,
        decision: input.decision,
        reason: input.reason,
        sensitiveAssumptionsAcknowledged: input.sensitiveAssumptionsAcknowledged ? 1 : 0
      });
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: campaign.id,
        entityType: "candidate",
        entityId: candidate.id,
        action: "candidate.qualification_recorded",
        actor: "user",
        source: "candidates.recordQualification",
        riskLevel: input.decision === "qualified" ? "high" : "medium",
        afterState: JSON.stringify({
          qualificationDecisionId: decisionId,
          decision: input.decision,
          reasonLength: input.reason.length,
          sensitiveAssumptionsAcknowledged: input.sensitiveAssumptionsAcknowledged
        })
      });
      return { success: true, id: decisionId };
    }),
    mergeDuplicate: protectedProcedure.input(
      z2.object({
        targetCandidateId: z2.number(),
        sourceCandidateId: z2.number(),
        reason: z2.string().min(1).max(500)
      })
    ).mutation(async ({ input, ctx }) => {
      if (input.targetCandidateId === input.sourceCandidateId) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Choose two different candidate profiles to merge."
        });
      }
      const [targetCandidate, sourceCandidate] = await Promise.all([
        getCandidateById(input.targetCandidateId),
        getCandidateById(input.sourceCandidateId)
      ]);
      if (!targetCandidate || !sourceCandidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const [targetCampaign, sourceCampaign] = await Promise.all([
        getCampaignById(targetCandidate.campaignId),
        getCampaignById(sourceCandidate.campaignId)
      ]);
      if (!targetCampaign || targetCampaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      if (!sourceCampaign || sourceCampaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const beforeState = {
        targetCandidateId: targetCandidate.id,
        sourceCandidateId: sourceCandidate.id,
        targetIdentity: summarizeIdentityContextForAudit(
          await getCandidateIdentityContext(targetCandidate.id)
        ),
        sourceIdentity: summarizeIdentityContextForAudit(
          await getCandidateIdentityContext(sourceCandidate.id)
        )
      };
      const merge = await mergeCandidateIdentitySources({
        userId: ctx.user.id,
        targetCandidateId: targetCandidate.id,
        sourceCandidateId: sourceCandidate.id
      });
      const resolutionId = await createCandidateDuplicateResolution({
        userId: ctx.user.id,
        targetCandidateId: targetCandidate.id,
        sourceCandidateId: sourceCandidate.id,
        decision: "merged",
        reason: input.reason
      });
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: targetCandidate.campaignId,
        entityType: "candidateIdentity",
        entityId: merge.targetIdentityId,
        action: "candidate_identity.merged",
        actor: "user",
        source: "candidates.mergeDuplicate",
        riskLevel: "medium",
        beforeState: serializeSafeJson(beforeState),
        afterState: serializeSafeJson({
          ...merge,
          resolutionId,
          ...getReasonAuditMetadata(input.reason),
          targetCandidateId: targetCandidate.id,
          sourceCandidateId: sourceCandidate.id
        })
      });
      return { success: true, ...merge };
    }),
    resolveDuplicatePair: protectedProcedure.input(
      z2.object({
        targetCandidateId: z2.number().int().positive(),
        sourceCandidateId: z2.number().int().positive(),
        decision: z2.literal("not_duplicate"),
        reason: z2.string().trim().min(8).max(500),
        confidence: z2.number().int().min(0).max(100).optional(),
        reasons: z2.array(z2.string().trim().min(1).max(80)).max(8).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (input.targetCandidateId === input.sourceCandidateId) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Choose two different candidate profiles to resolve."
        });
      }
      const [targetCandidate, sourceCandidate] = await Promise.all([
        getCandidateById(input.targetCandidateId),
        getCandidateById(input.sourceCandidateId)
      ]);
      if (!targetCandidate || !sourceCandidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const [targetCampaign, sourceCampaign] = await Promise.all([
        getCampaignById(targetCandidate.campaignId),
        getCampaignById(sourceCandidate.campaignId)
      ]);
      if (!targetCampaign || targetCampaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      if (!sourceCampaign || sourceCampaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const resolutionId = await createCandidateDuplicateResolution({
        userId: ctx.user.id,
        targetCandidateId: targetCandidate.id,
        sourceCandidateId: sourceCandidate.id,
        decision: input.decision,
        reason: input.reason,
        confidence: input.confidence,
        reasons: input.reasons
      });
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: targetCandidate.campaignId,
        entityType: "candidateDuplicateResolution",
        entityId: resolutionId,
        action: "candidate_duplicate.not_duplicate",
        actor: "user",
        source: "candidates.resolveDuplicatePair",
        riskLevel: "medium",
        afterState: JSON.stringify({
          targetCandidateId: targetCandidate.id,
          sourceCandidateId: sourceCandidate.id,
          decision: input.decision,
          confidence: input.confidence ?? 0,
          reasons: input.reasons ?? [],
          reasonLength: input.reason.length
        })
      });
      return { success: true, resolutionId };
    }),
    resolveDuplicatePairsBatch: protectedProcedure.input(
      z2.object({
        pairs: z2.array(duplicatePairSelectionSchema).min(1).max(BATCH_DUPLICATE_RESOLUTION_LIMIT),
        decision: z2.literal("not_duplicate"),
        reason: z2.string().trim().min(12).max(500),
        reviewedCurrentQueueAcknowledged: z2.boolean().default(false)
      })
    ).mutation(async ({ input, ctx }) => {
      if (!input.reviewedCurrentQueueAcknowledged) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Confirm that the selected pairs were reviewed in the current duplicate queue before batch dismissal."
        });
      }
      const selectedKeys = /* @__PURE__ */ new Set();
      for (const pair of input.pairs) {
        if (pair.targetCandidateId === pair.sourceCandidateId) {
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Each duplicate pair must contain two different profiles."
          });
        }
        const pairKey = candidateDuplicatePairKey2(
          pair.targetCandidateId,
          pair.sourceCandidateId
        );
        if (selectedKeys.has(pairKey)) {
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Duplicate pair selections must be unique."
          });
        }
        selectedKeys.add(pairKey);
      }
      const currentQueue = await getCandidateDuplicateReviewQueue(
        ctx.user.id,
        { limit: 50 }
      );
      const currentPairsByKey = new Map(
        currentQueue.map((pair) => [
          candidateDuplicatePairKey2(
            pair.targetCandidate.id,
            pair.sourceCandidate.id
          ),
          pair
        ])
      );
      const selectedPairs = Array.from(selectedKeys).map((pairKey) => {
        const pair = currentPairsByKey.get(pairKey);
        if (!pair) {
          throw new TRPCError3({
            code: "CONFLICT",
            message: "One or more selected duplicate pairs are no longer in the current review queue."
          });
        }
        return pair;
      });
      const resolutionIds = [];
      for (const pair of selectedPairs) {
        const resolutionId = await createCandidateDuplicateResolution({
          userId: ctx.user.id,
          targetCandidateId: pair.targetCandidate.id,
          sourceCandidateId: pair.sourceCandidate.id,
          decision: input.decision,
          reason: input.reason,
          confidence: pair.confidence,
          reasons: pair.reasons
        });
        resolutionIds.push(resolutionId);
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: pair.targetCandidate.campaignId,
          entityType: "candidateDuplicateResolution",
          entityId: resolutionId,
          action: "candidate_duplicate.not_duplicate",
          actor: "user",
          source: "candidates.resolveDuplicatePairsBatch",
          riskLevel: "medium",
          afterState: JSON.stringify({
            decision: input.decision,
            confidence: pair.confidence,
            reasons: pair.reasons,
            reasonLength: input.reason.length,
            batchSize: selectedPairs.length
          })
        });
      }
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: selectedPairs[0]?.targetCandidate.campaignId,
        entityType: "candidateDuplicateResolution",
        entityId: resolutionIds[0],
        action: "candidate_duplicate.batch_not_duplicate",
        actor: "user",
        source: "candidates.resolveDuplicatePairsBatch",
        riskLevel: "medium",
        afterState: JSON.stringify({
          decision: input.decision,
          count: resolutionIds.length,
          maxAllowed: BATCH_DUPLICATE_RESOLUTION_LIMIT,
          reasonLength: input.reason.length,
          reviewedCurrentQueueAcknowledged: input.reviewedCurrentQueueAcknowledged
        })
      });
      return {
        success: true,
        resolvedCount: resolutionIds.length,
        resolutionIds
      };
    }),
    getLedger: protectedProcedure.input(z2.object({ candidateId: z2.number() })).query(async ({ input, ctx }) => {
      const candidate = await getCandidateById(input.candidateId);
      if (!candidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const campaign = await getCampaignById(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const [
        platform,
        messages2,
        matchFactors2,
        identityContext,
        sendAttempts,
        responses,
        qualificationDecisions,
        followUps2,
        auditEvents2,
        duplicateCandidates
      ] = await Promise.all([
        getPlatformById(candidate.platformId),
        getCandidateMessages(candidate.id),
        getCandidateMatchFactors(candidate.id),
        getCandidateIdentityContext(candidate.id),
        getMessageSendAttemptsForCandidate(candidate.id),
        getCandidateResponsesByCandidateId(candidate.id),
        getCandidateQualificationDecisionsByCandidateId(candidate.id),
        getFollowUpsForCandidate(candidate.id),
        getAuditEventsForEntity(ctx.user.id, "candidate", candidate.id),
        getCandidatePotentialDuplicates(candidate.id, ctx.user.id)
      ]);
      const outreachLock = await getLatestTerminalNegativeResponse(
        candidate.id
      );
      return {
        candidate,
        campaign,
        platform,
        messages: messages2,
        matchFactors: matchFactors2,
        identity: identityContext.identity,
        source: identityContext.source,
        sources: identityContext.sources,
        sendAttempts,
        responses,
        qualificationDecisions,
        latestQualificationDecision: qualificationDecisions[0] ?? null,
        outreachLock,
        followUps: followUps2,
        auditEvents: auditEvents2,
        duplicateCandidates,
        nextActions: buildCandidateNextActions({
          candidate,
          messages: messages2,
          sendAttempts,
          responses,
          followUps: followUps2,
          sourceCount: identityContext.sources.length,
          duplicateCount: duplicateCandidates.length,
          latestQualificationDecision: qualificationDecisions[0] ?? null,
          outreachLock
        })
      };
    })
  }),
  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserCampaigns: getUserCampaigns2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      return getUserCampaigns2(ctx.user.id);
    }),
    get: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
        return { id: val.id };
      }
      throw new Error("Invalid input: expected object with numeric id");
    }).query(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const campaign = await getCampaignById2(input.id);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return campaign;
    }),
    create: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "title" in val && typeof val.title === "string" && "targetPlatforms" in val && typeof val.targetPlatforms === "string" && "searchCriteria" in val && typeof val.searchCriteria === "string") {
        return val;
      }
      throw new Error("Invalid campaign input");
    }).mutation(async ({ ctx, input }) => {
      const { createCampaign: createCampaign2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      let searchCriteria;
      try {
        searchCriteria = parseCampaignSearchCriteria(input.searchCriteria);
      } catch (error) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid campaign safety policy."
        });
      }
      const campaignId = await createCampaign2({
        userId: ctx.user.id,
        title: input.title,
        description: input.description,
        targetPlatforms: input.targetPlatforms,
        searchCriteria: JSON.stringify(searchCriteria),
        status: input.status || "draft",
        isScheduled: input.isScheduled || 0,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        isRecurring: input.isRecurring || 0,
        recurringPattern: input.recurringPattern || null,
        nextExecutionAt: input.nextExecutionAt ? new Date(input.nextExecutionAt) : null
      });
      return { id: campaignId };
    }),
    pause: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
        return { id: val.id };
      }
      throw new Error("Invalid input: expected object with numeric id");
    }).mutation(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2, updateCampaign: updateCampaign2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const campaign = await getCampaignById2(input.id);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      if (campaign.status === "archived") {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Archived campaigns cannot be paused."
        });
      }
      await updateCampaign2(input.id, {
        status: "paused",
        nextExecutionAt: null
      });
      return { success: true };
    }),
    resume: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
        return { id: val.id };
      }
      throw new Error("Invalid input: expected object with numeric id");
    }).mutation(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2, updateCampaign: updateCampaign2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const campaign = await getCampaignById2(input.id);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      if (campaign.status === "archived") {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Archived campaigns cannot be resumed."
        });
      }
      let nextExecutionAt = campaign.scheduledFor;
      if (campaign.isRecurring === 1 && campaign.recurringPattern) {
        const { calculateNextExecution: calculateNextExecution2 } = await Promise.resolve().then(() => (init_scheduledCampaigns(), scheduledCampaigns_exports));
        nextExecutionAt = calculateNextExecution2(campaign.recurringPattern);
      }
      await updateCampaign2(input.id, {
        status: "scheduled",
        nextExecutionAt
      });
      return { success: true };
    }),
    delete: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
        return { id: val.id };
      }
      throw new Error("Invalid input: expected object with numeric id");
    }).mutation(async ({ input, ctx }) => {
      const { archiveCampaign: archiveCampaign2, createAuditEvent: createAuditEvent2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      try {
        const before = await archiveCampaign2(input.id, ctx.user.id);
        await createAuditEvent2({
          userId: ctx.user.id,
          entityType: "campaign",
          entityId: input.id,
          campaignId: input.id,
          action: "campaign.archived",
          actor: "user",
          source: "campaigns.delete",
          beforeState: JSON.stringify({
            status: before.status,
            isScheduled: before.isScheduled,
            nextExecutionAt: before.nextExecutionAt
          }),
          afterState: JSON.stringify({
            status: "archived",
            isScheduled: 0,
            nextExecutionAt: null,
            ledgerPreserved: true
          }),
          riskLevel: "high"
        });
      } catch {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "You don't have permission to archive this campaign"
        });
      }
      return { success: true };
    }),
    stats: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
        return { id: val.id };
      }
      throw new Error("Invalid input: expected object with numeric id");
    }).query(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2, getCampaignStats: getCampaignStats2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const campaign = await getCampaignById2(input.id);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return getCampaignStats2(input.id);
    }),
    getEngagementMetrics: protectedProcedure.input(z2.object({ campaignId: z2.number() })).query(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2, getEngagementMetrics: getEngagementMetrics2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const campaign = await getCampaignById2(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return getEngagementMetrics2(input.campaignId);
    }),
    getReadiness: protectedProcedure.input(
      z2.object({
        campaignId: z2.number(),
        persistSnapshot: z2.boolean().optional()
      })
    ).query(async ({ input, ctx }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return input.persistSnapshot ? recordReadinessSnapshot(campaign, ctx.user.id) : getCampaignReadiness(campaign, ctx.user.id);
    }),
    getOperatingLedger: protectedProcedure.input(z2.object({ campaignId: z2.number() })).query(async ({ input, ctx }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return getOperatingLedger(campaign, ctx.user.id);
    }),
    exportLedger: protectedProcedure.input(
      z2.object({
        campaignId: z2.number(),
        personalDataAcknowledged: z2.boolean()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!input.personalDataAcknowledged) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Campaign ledger export includes candidate personal data. Review and acknowledge this before exporting."
        });
      }
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      const exportedLedger = await buildCampaignLedgerExport(
        campaign,
        ctx.user.id
      );
      await recordCampaignLedgerExportAudit({
        userId: ctx.user.id,
        campaignId: campaign.id,
        counts: exportedLedger.counts
      });
      return exportedLedger;
    }),
    getNextActions: protectedProcedure.input(z2.object({ campaignId: z2.number() })).query(async ({ input, ctx }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      const ledger = await getOperatingLedger(campaign, ctx.user.id);
      return ledger.nextActions;
    }),
    listOperatingSummaries: protectedProcedure.query(async ({ ctx }) => {
      const campaigns2 = await getUserCampaigns(ctx.user.id);
      return Promise.all(
        campaigns2.map(async (campaign) => {
          const ledger = await getOperatingLedger(campaign, ctx.user.id);
          return {
            campaignId: campaign.id,
            readiness: ledger.readiness,
            summary: ledger.summary,
            nextActions: ledger.nextActions.slice(0, 3)
          };
        })
      );
    })
  }),
  messages: router({
    list: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "campaignId" in val && typeof val.campaignId === "number") {
        return { campaignId: val.campaignId };
      }
      throw new Error(
        "Invalid input: expected object with numeric campaignId"
      );
    }).query(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2, getCampaignMessages: getCampaignMessages2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const campaign = await getCampaignById2(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return getCampaignMessages2(input.campaignId);
    }),
    generate: protectedProcedure.input((val) => {
      if (typeof val === "object" && val !== null && "candidateId" in val && typeof val.candidateId === "number" && "campaignDescription" in val && typeof val.campaignDescription === "string") {
        return val;
      }
      throw new Error("Invalid input");
    }).mutation(async ({ input, ctx }) => {
      const { getCampaignById: getCampaignById2, getCandidateById: getCandidateById2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { generateOutreachMessage: generateOutreachMessage2 } = await Promise.resolve().then(() => (init_aiMatching(), aiMatching_exports));
      const candidate = await getCandidateById2(input.candidateId);
      if (!candidate)
        throw new Error("Candidate not found");
      const campaign = await getCampaignById2(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      return generateOutreachMessage2(
        candidate,
        input.campaignDescription,
        input.language || "nl"
      );
    }),
    bulkOutreach: protectedProcedure.input(
      z2.object({
        campaignId: z2.number(),
        language: z2.enum(["nl", "en"]).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const {
        getCampaignById: getCampaignById2,
        getCampaignCandidates: getCampaignCandidates2,
        getCampaignMessages: getCampaignMessages2,
        createMessage: createMessage2
      } = await Promise.resolve().then(() => (init_db(), db_exports));
      const { generateOutreachMessage: generateOutreachMessage2, normalizeOutreachDraftingOptions: normalizeOutreachDraftingOptions2 } = await Promise.resolve().then(() => (init_aiMatching(), aiMatching_exports));
      const campaign = await getCampaignById2(input.campaignId);
      if (!campaign) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      if (campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "You do not have access to this campaign"
        });
      }
      await blockArchivedCampaignAction({
        userId: ctx.user.id,
        campaign,
        entityType: "campaign",
        entityId: campaign.id,
        action: "message.bulk_outreach_blocked_archived",
        source: "messages.bulkOutreach",
        riskLevel: "medium"
      });
      const searchCriteria = JSON.parse(campaign.searchCriteria || "{}");
      const messageDrafting = normalizeOutreachDraftingOptions2(
        searchCriteria.messageDrafting
      );
      const compatibilityThreshold = searchCriteria.compatibilityThreshold || 70;
      const maxCandidateLimit = parsePositiveInteger(
        searchCriteria.maxCandidates
      );
      const allCandidates = await getCampaignCandidates2(input.campaignId);
      const qualifiedCandidates = allCandidates.filter(
        (c) => c.compatibilityScore >= compatibilityThreshold
      );
      const candidatesWithinLimit = maxCandidateLimit ? qualifiedCandidates.slice(0, maxCandidateLimit) : qualifiedCandidates;
      const existingMessages = await getCampaignMessages2(input.campaignId);
      const candidateIdsWithExistingOutreach = new Set(
        existingMessages.filter(
          (message) => duplicateBlockingMessageStatuses.has(message.status)
        ).map((message) => message.candidateId)
      );
      console.log(
        `[Bulk Outreach] Processing ${candidatesWithinLimit.length} candidates for campaign ${input.campaignId}`
      );
      const results = {
        success: 0,
        failed: 0,
        skippedExistingOutreach: 0,
        skippedStoppedOutreach: 0,
        skippedQualificationReview: 0,
        skippedByLimit: Math.max(
          0,
          qualifiedCandidates.length - candidatesWithinLimit.length
        ),
        messages: []
      };
      for (const candidate of candidatesWithinLimit) {
        try {
          if (candidateIdsWithExistingOutreach.has(candidate.id)) {
            results.skippedExistingOutreach++;
            continue;
          }
          const blockingQualificationDecision = await getBlockingQualificationDecision(candidate.id);
          if (blockingQualificationDecision) {
            results.skippedQualificationReview++;
            continue;
          }
          const latestTerminalResponse = await getLatestTerminalNegativeResponse(candidate.id);
          if (latestTerminalResponse) {
            results.skippedStoppedOutreach++;
            continue;
          }
          const { subject, content } = await generateOutreachMessage2(
            candidate,
            campaign.description || "",
            input.language || "nl",
            messageDrafting
          );
          const messageId = await createMessage2({
            campaignId: input.campaignId,
            candidateId: candidate.id,
            platformId: candidate.platformId,
            subject,
            content,
            language: input.language || "nl",
            status: "queued"
            // Messages are queued for sending
          });
          results.success++;
          results.messages.push({
            id: messageId,
            candidateId: candidate.id,
            candidateName: candidate.name,
            subject
          });
        } catch (error) {
          console.error(
            `[Bulk Outreach] Failed to generate message for candidate ${candidate.id}:`,
            error
          );
          results.failed++;
        }
      }
      console.log(
        `[Bulk Outreach] Complete: ${results.success} messages queued, ${results.failed} failed, ${results.skippedExistingOutreach} skipped as existing outreach`
      );
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: input.campaignId,
        entityType: "campaign",
        entityId: input.campaignId,
        action: "message.bulk_outreach_drafted",
        actor: "user",
        source: "messages.bulkOutreach",
        riskLevel: "medium",
        afterState: JSON.stringify({
          totalQualifiedCandidates: qualifiedCandidates.length,
          consideredCandidates: candidatesWithinLimit.length,
          messagesQueued: results.success,
          messagesFailed: results.failed,
          skippedExistingOutreach: results.skippedExistingOutreach,
          skippedStoppedOutreach: results.skippedStoppedOutreach,
          skippedQualificationReview: results.skippedQualificationReview,
          skippedByLimit: results.skippedByLimit,
          maxCandidateLimit,
          messageTonePreset: messageDrafting.tonePreset,
          templateSnippetProvided: Boolean(messageDrafting.templateSnippet)
        })
      });
      return {
        success: true,
        totalCandidates: qualifiedCandidates.length,
        messagesQueued: results.success,
        messagesFailed: results.failed,
        messagesSkippedExistingOutreach: results.skippedExistingOutreach,
        messagesSkippedStoppedOutreach: results.skippedStoppedOutreach,
        messagesSkippedQualificationReview: results.skippedQualificationReview,
        messagesSkippedByLimit: results.skippedByLimit,
        messages: results.messages
      };
    }),
    listAll: protectedProcedure.input(
      z2.object({
        status: z2.string().optional(),
        campaignId: z2.number().optional()
      })
    ).query(async ({ ctx, input }) => {
      const { getAllMessages: getAllMessages2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      return getAllMessages2(ctx.user.id, input.status, input.campaignId);
    }),
    approve: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        reason: z2.string().optional(),
        sensitiveContentAcknowledged: z2.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        input.messageId
      );
      await blockMessageActionForArchivedCampaign({
        userId: ctx.user.id,
        message,
        source: "messages.approve",
        action: "message.approval_blocked_archived_campaign"
      });
      await blockMessageActionForTerminalResponse({
        userId: ctx.user.id,
        message,
        source: "messages.approve",
        action: "message.approval_blocked_by_response",
        actor: "user",
        riskLevel: "medium"
      });
      await blockOutreachForCandidateQualification({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        entityType: "message",
        entityId: message.id,
        action: "message.approval_blocked_candidate_qualification",
        source: "messages.approve",
        actor: "user",
        riskLevel: "medium"
      });
      await blockApprovalForDryRunCampaign({
        userId: ctx.user.id,
        message,
        source: "messages.approve",
        action: "message.approval_blocked_dry_run"
      });
      const sensitiveWarnings = getSensitiveMessageWarnings(message);
      if (sensitiveWarnings.length > 0 && !input.sensitiveContentAcknowledged) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Message includes sensitive care or personal context. Review and acknowledge those warnings before approval."
        });
      }
      const approvalId = await createMessageApproval({
        messageId: message.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        userId: ctx.user.id,
        decision: "approved",
        decisionReason: input.reason,
        approvedSubjectSnapshot: message.subject,
        approvedContentSnapshot: message.content,
        decidedAt: /* @__PURE__ */ new Date()
      });
      await updateMessageStatus(message.id, "approved");
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "message",
        entityId: message.id,
        action: "message.approved",
        actor: "user",
        source: "messages.approve",
        riskLevel: "medium",
        approvalId,
        beforeState: JSON.stringify({ status: message.status }),
        afterState: JSON.stringify({
          status: "approved",
          sensitiveContentAcknowledged: !!input.sensitiveContentAcknowledged,
          sensitiveWarningCount: sensitiveWarnings.length
        })
      });
      return { success: true, approvalId };
    }),
    reject: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        reason: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        input.messageId
      );
      await blockMessageActionForArchivedCampaign({
        userId: ctx.user.id,
        message,
        source: "messages.reject",
        action: "message.rejection_blocked_archived_campaign",
        riskLevel: "low"
      });
      const approvalId = await createMessageApproval({
        messageId: message.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        userId: ctx.user.id,
        decision: "rejected",
        decisionReason: input.reason,
        decidedAt: /* @__PURE__ */ new Date()
      });
      await updateMessageStatus(message.id, "rejected");
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "message",
        entityId: message.id,
        action: "message.rejected",
        actor: "user",
        source: "messages.reject",
        riskLevel: "medium",
        approvalId,
        beforeState: JSON.stringify({ status: message.status }),
        afterState: JSON.stringify({ status: "rejected" })
      });
      return { success: true, approvalId };
    }),
    recordSendAttempt: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        status: z2.enum(["blocked", "started", "succeeded", "failed"]),
        errorMessage: sendFailureReasonSchema,
        externalMessageId: externalMessageEvidenceSchema,
        confirmationText: deliveryConfirmationTextSchema,
        rateLimitState: rateLimitStateSchema
      })
    ).mutation(async ({ input, ctx }) => {
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        input.messageId
      );
      await blockSendForArchivedCampaign({
        userId: ctx.user.id,
        message,
        source: "messages.recordSendAttempt",
        confirmationText: input.confirmationText,
        externalMessageId: input.externalMessageId,
        rateLimitState: input.rateLimitState
      });
      await blockSendForDryRunCampaign({
        userId: ctx.user.id,
        message,
        source: "messages.recordSendAttempt",
        confirmationText: input.confirmationText,
        externalMessageId: input.externalMessageId,
        rateLimitState: input.rateLimitState
      });
      const approvals = await getMessageApprovalsByMessageId(message.id);
      const hasApproval = approvals.some(
        (approval) => approval.decision === "approved"
      );
      const hasEvidence = !!input.externalMessageId || !!input.confirmationText;
      if (!hasApproval) {
        const attemptId2 = await createMessageSendAttempt({
          messageId: message.id,
          campaignId: message.campaignId,
          candidateId: message.candidateId,
          platformId: message.platformId,
          status: "blocked",
          errorMessage: "Message send blocked because no explicit approval exists.",
          finishedAt: /* @__PURE__ */ new Date()
        });
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: message.campaignId,
          entityType: "message",
          entityId: message.id,
          action: "message.send_blocked_unapproved",
          actor: "system",
          source: "messages.recordSendAttempt",
          riskLevel: "high",
          afterState: JSON.stringify({ attemptId: attemptId2 })
        });
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Message must be explicitly approved before sending."
        });
      }
      if (["started", "succeeded"].includes(input.status)) {
        await blockSendForCandidateQualification({
          userId: ctx.user.id,
          message,
          source: "messages.recordSendAttempt",
          confirmationText: input.confirmationText,
          externalMessageId: input.externalMessageId,
          rateLimitState: input.rateLimitState
        });
        const terminalResponse = await getLatestTerminalNegativeResponse(
          message.candidateId
        );
        if (terminalResponse) {
          const attemptId2 = await createMessageSendAttempt({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            platformId: message.platformId,
            status: "blocked",
            errorMessage: "Message send blocked because the latest candidate response says to stop or pause outreach.",
            confirmationText: input.confirmationText,
            externalMessageId: input.externalMessageId,
            rateLimitState: input.rateLimitState,
            finishedAt: /* @__PURE__ */ new Date()
          });
          await createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.send_blocked_by_response",
            actor: "system",
            source: "messages.recordSendAttempt",
            riskLevel: "high",
            afterState: JSON.stringify({
              attemptId: attemptId2,
              responseId: terminalResponse.id,
              responseCandidateId: terminalResponse.candidateId,
              messageCandidateId: message.candidateId,
              classification: terminalResponse.classification
            })
          });
          throw new TRPCError3({
            code: "CONFLICT",
            message: "Message send is blocked because the latest candidate response says to stop or pause outreach."
          });
        }
      }
      if (input.status === "succeeded" && !hasEvidence) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Successful send attempts require meaningful externalMessageId or confirmationText evidence."
        });
      }
      if (["failed", "blocked"].includes(input.status) && !input.errorMessage) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Failed or blocked send attempts require a failure reason."
        });
      }
      if (input.status === "succeeded") {
        const duplicateCandidates = await getCandidatePotentialDuplicates(
          message.candidateId,
          ctx.user.id
        );
        if (duplicateCandidates.length > 0) {
          const attemptId2 = await createMessageSendAttempt({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            platformId: message.platformId,
            status: "blocked",
            errorMessage: "Message send blocked because this candidate has unresolved possible duplicates.",
            confirmationText: input.confirmationText,
            externalMessageId: input.externalMessageId,
            rateLimitState: input.rateLimitState,
            finishedAt: /* @__PURE__ */ new Date()
          });
          await createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.send_blocked_duplicate_candidate",
            actor: "system",
            source: "messages.recordSendAttempt",
            riskLevel: "high",
            afterState: JSON.stringify({
              attemptId: attemptId2,
              duplicateCandidateIds: duplicateCandidates.map(
                (duplicate) => duplicate.candidate.id
              )
            })
          });
          throw new TRPCError3({
            code: "CONFLICT",
            message: "Resolve possible duplicate candidate profiles before recording a successful send."
          });
        }
        const campaign = await getCampaignById(message.campaignId);
        if (!campaign) {
          throw new TRPCError3({
            code: "NOT_FOUND",
            message: "Campaign not found"
          });
        }
        const searchCriteria = parseCampaignSearchCriteria(
          campaign.searchCriteria || "{}"
        );
        const todaySuccessfulSends = countSuccessfulSendsToday(
          await getMessageSendAttemptsForCampaign(message.campaignId)
        );
        if (todaySuccessfulSends >= searchCriteria.safetyPolicy.dailySendLimit) {
          const attemptId2 = await createMessageSendAttempt({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            platformId: message.platformId,
            status: "blocked",
            errorMessage: "Message send blocked because the campaign daily send limit has been reached.",
            confirmationText: input.confirmationText,
            externalMessageId: input.externalMessageId,
            rateLimitState: input.rateLimitState || JSON.stringify({
              blockedAt: (/* @__PURE__ */ new Date()).toISOString(),
              reason: "campaign-daily-send-limit",
              dailySendLimit: searchCriteria.safetyPolicy.dailySendLimit,
              successfulSendsToday: todaySuccessfulSends
            }),
            finishedAt: /* @__PURE__ */ new Date()
          });
          await createRateLimitEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            platformId: message.platformId,
            eventType: "message_send_blocked",
            severity: "blocked",
            detailJson: JSON.stringify({
              messageId: message.id,
              candidateId: message.candidateId,
              attemptId: attemptId2,
              reason: "campaign-daily-send-limit",
              dailySendLimit: searchCriteria.safetyPolicy.dailySendLimit,
              successfulSendsToday: todaySuccessfulSends
            })
          });
          await createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.send_blocked_daily_campaign_limit",
            actor: "system",
            source: "messages.recordSendAttempt",
            riskLevel: "high",
            afterState: JSON.stringify({
              attemptId: attemptId2,
              dailySendLimit: searchCriteria.safetyPolicy.dailySendLimit,
              successfulSendsToday: todaySuccessfulSends
            })
          });
          throw new TRPCError3({
            code: "TOO_MANY_REQUESTS",
            message: "Campaign daily send limit reached. Wait until tomorrow or lower risk by reviewing the campaign settings."
          });
        }
        const platforms2 = await getAllPlatforms();
        const platform = platforms2.find(
          (entry) => entry.id === message.platformId
        );
        if (!platform) {
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Message platform could not be resolved."
          });
        }
        try {
          await consumeMessageLimit(platform.name, 1);
        } catch (error) {
          const errorMessage = error?.message || `Message rate limit exceeded for ${platform.name}.`;
          const attemptId2 = await createMessageSendAttempt({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            platformId: message.platformId,
            status: "blocked",
            errorMessage,
            confirmationText: input.confirmationText,
            externalMessageId: input.externalMessageId,
            rateLimitState: input.rateLimitState || JSON.stringify({
              platform: platform.name,
              blockedAt: (/* @__PURE__ */ new Date()).toISOString(),
              reason: "message-rate-limit"
            }),
            finishedAt: /* @__PURE__ */ new Date()
          });
          await createRateLimitEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            platformId: message.platformId,
            eventType: "message_send_blocked",
            severity: "blocked",
            detailJson: JSON.stringify({
              messageId: message.id,
              candidateId: message.candidateId,
              attemptId: attemptId2,
              platform: platform.name,
              errorMessage
            })
          });
          await createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.send_blocked_rate_limit",
            actor: "system",
            source: "messages.recordSendAttempt",
            riskLevel: "high",
            afterState: JSON.stringify({
              attemptId: attemptId2,
              platform: platform.name
            })
          });
          throw new TRPCError3({
            code: "TOO_MANY_REQUESTS",
            message: "Platform message rate limit reached. Wait before recording another successful send."
          });
        }
      }
      const attemptId = await createMessageSendAttempt({
        messageId: message.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        platformId: message.platformId,
        status: input.status,
        errorMessage: input.errorMessage,
        externalMessageId: input.externalMessageId,
        confirmationText: input.confirmationText,
        rateLimitState: input.rateLimitState,
        finishedAt: input.status === "started" ? null : /* @__PURE__ */ new Date()
      });
      if (input.status === "succeeded") {
        await updateMessageStatus(message.id, "sent");
      } else if (input.status === "failed" || input.status === "blocked") {
        await updateMessageStatus(message.id, "failed");
      }
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "message",
        entityId: message.id,
        action: `message.send_attempt_${input.status}`,
        actor: "user",
        source: "messages.recordSendAttempt",
        riskLevel: input.status === "succeeded" ? "high" : "medium",
        afterState: JSON.stringify({ attemptId, status: input.status })
      });
      return { success: true, attemptId };
    }),
    recordResponse: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        rawContent: z2.string().min(1),
        classification: responseClassificationSchema.optional(),
        confidence: z2.number().min(0).max(100).optional(),
        source: z2.enum(["manual", "platform", "import"]).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        input.messageId
      );
      const automaticClassification = classifyResponse(input.rawContent);
      const classification = input.classification ?? automaticClassification.classification;
      const confidence = input.confidence ?? automaticClassification.confidence;
      const normalizedContent = input.rawContent.trim();
      const responseId = await createCandidateResponse({
        candidateId: message.candidateId,
        messageId: message.id,
        platformId: message.platformId,
        rawContent: input.rawContent,
        normalizedContent,
        classification,
        confidence,
        source: input.source ?? "manual",
        receivedAt: /* @__PURE__ */ new Date()
      });
      await updateMessageResponse(message.id, normalizedContent);
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "candidateResponse",
        entityId: responseId,
        action: "candidate.response_recorded",
        actor: "user",
        source: "messages.recordResponse",
        riskLevel: "medium",
        afterState: JSON.stringify({ classification, confidence })
      });
      const cancelledFollowUpIds = await cancelScheduledFollowUpsForTerminalResponse({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        responseId,
        classification,
        source: "messages.recordResponse"
      });
      return {
        success: true,
        responseId,
        classification,
        confidence,
        cancelledFollowUpIds
      };
    }),
    reopenOutreach: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        reason: z2.string().trim().min(8, "Explain why outreach can safely be reopened.").max(500, "Reopen reason is too long.")
      })
    ).mutation(async ({ input, ctx }) => {
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        input.messageId
      );
      const terminalResponse = await getLatestTerminalNegativeResponse(
        message.candidateId
      );
      if (!terminalResponse) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Outreach is not locked for this candidate. No reopen action is required."
        });
      }
      const normalizedReason = input.reason.trim();
      const responseId = await createCandidateResponse({
        candidateId: message.candidateId,
        messageId: null,
        platformId: message.platformId,
        rawContent: normalizedReason,
        normalizedContent: normalizedReason,
        classification: "unknown",
        confidence: 100,
        source: "manual",
        receivedAt: /* @__PURE__ */ new Date()
      });
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "candidate",
        entityId: message.candidateId,
        action: "candidate.outreach_reopened",
        actor: "user",
        source: "messages.reopenOutreach",
        riskLevel: "high",
        beforeState: JSON.stringify({
          responseId: terminalResponse.id,
          responseCandidateId: terminalResponse.candidateId,
          messageCandidateId: message.candidateId,
          classification: terminalResponse.classification
        }),
        afterState: serializeSafeJson({
          responseId,
          classification: "unknown",
          ...getReasonAuditMetadata(normalizedReason),
          messageId: message.id
        })
      });
      return {
        success: true,
        responseId,
        previousResponseId: terminalResponse.id
      };
    }),
    updateStatus: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        status: z2.enum(["queued", "approved", "sent", "rejected", "replied"])
      })
    ).mutation(async ({ input, ctx }) => {
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        input.messageId
      );
      await blockMessageActionForArchivedCampaign({
        userId: ctx.user.id,
        message,
        source: "messages.updateStatus",
        action: "message.status_blocked_archived_campaign",
        riskLevel: input.status === "approved" ? "medium" : "low"
      });
      if (input.status === "sent") {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Use messages.recordSendAttempt with delivery evidence to mark a message as sent."
        });
      }
      if (input.status === "approved" || input.status === "rejected") {
        if (input.status === "approved") {
          await blockMessageActionForTerminalResponse({
            userId: ctx.user.id,
            message,
            source: "messages.updateStatus",
            action: "message.approval_blocked_by_response",
            actor: "user",
            riskLevel: "medium"
          });
          await blockApprovalForDryRunCampaign({
            userId: ctx.user.id,
            message,
            source: "messages.updateStatus",
            action: "message.approval_blocked_dry_run"
          });
        }
        await createMessageApproval({
          messageId: message.id,
          campaignId: message.campaignId,
          candidateId: message.candidateId,
          userId: ctx.user.id,
          decision: input.status,
          approvedSubjectSnapshot: input.status === "approved" ? message.subject : void 0,
          approvedContentSnapshot: input.status === "approved" ? message.content : void 0,
          decidedAt: /* @__PURE__ */ new Date()
        });
      }
      await updateMessageStatus(input.messageId, input.status);
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "message",
        entityId: message.id,
        action: `message.status_${input.status}`,
        actor: "user",
        source: "messages.updateStatus",
        riskLevel: input.status === "approved" ? "medium" : "low",
        beforeState: JSON.stringify({ status: message.status }),
        afterState: JSON.stringify({ status: input.status })
      });
      return { success: true };
    }),
    update: protectedProcedure.input(
      z2.object({
        messageId: z2.number(),
        subject: z2.string(),
        content: z2.string()
      })
    ).mutation(async ({ input, ctx }) => {
      const { getAllMessages: getAllMessages2, updateMessage: updateMessage2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const message = (await getAllMessages2(ctx.user.id)).find(
        (entry) => entry.id === input.messageId
      );
      if (!message) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Message not found"
        });
      }
      await updateMessage2(input.messageId, input.subject, input.content);
      return { success: true };
    }),
    bulkUpdateStatus: protectedProcedure.input(
      z2.object({
        messageIds: z2.array(z2.number()).min(1).max(100),
        status: z2.enum(["queued", "approved", "sent", "rejected", "replied"]),
        complianceAcknowledged: z2.boolean().optional(),
        safetyAcknowledged: z2.boolean().optional(),
        sensitiveContentAcknowledged: z2.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (input.status === "sent") {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Use messages.recordSendAttempt with delivery evidence to mark messages as sent."
        });
      }
      const ownedMessages = await getAllMessages(ctx.user.id);
      const messageById = new Map(
        ownedMessages.map((entry) => [entry.id, entry])
      );
      if (input.messageIds.some((messageId) => !messageById.has(messageId))) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "One or more messages are not accessible"
        });
      }
      const targetMessages = input.messageIds.map(
        (messageId) => messageById.get(messageId)
      );
      for (const message of targetMessages) {
        await blockMessageActionForArchivedCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.bulkUpdateStatus",
          action: "message.bulk_status_blocked_archived_campaign",
          riskLevel: input.status === "approved" ? "medium" : "low"
        });
      }
      if (input.status === "approved") {
        if (!input.complianceAcknowledged) {
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Bulk approval requires consent and platform-compliance acknowledgement."
          });
        }
        if (targetMessages.length > BULK_APPROVAL_REVIEW_THRESHOLD && !input.safetyAcknowledged) {
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: `Bulk approval of more than ${BULK_APPROVAL_REVIEW_THRESHOLD} messages requires explicit safety acknowledgement.`
          });
        }
        const sensitiveMessages = targetMessages.filter(
          (message) => getSensitiveMessageWarnings(message).length > 0
        );
        if (sensitiveMessages.length > 0 && !input.sensitiveContentAcknowledged) {
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Bulk approval includes messages with sensitive care or personal context. Review and acknowledge those warnings before approval."
          });
        }
      }
      if (input.status === "approved" || input.status === "rejected") {
        for (const message of targetMessages) {
          if (input.status === "approved") {
            await blockMessageActionForTerminalResponse({
              userId: ctx.user.id,
              message,
              source: "messages.bulkUpdateStatus",
              action: "message.approval_blocked_by_response",
              actor: "user",
              riskLevel: "medium"
            });
            await blockOutreachForCandidateQualification({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              candidateId: message.candidateId,
              entityType: "message",
              entityId: message.id,
              action: "message.approval_blocked_candidate_qualification",
              source: "messages.bulkUpdateStatus",
              actor: "user",
              riskLevel: "medium"
            });
            await blockApprovalForDryRunCampaign({
              userId: ctx.user.id,
              message,
              source: "messages.bulkUpdateStatus",
              action: "message.approval_blocked_dry_run"
            });
          }
          await createMessageApproval({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            userId: ctx.user.id,
            decision: input.status,
            approvedSubjectSnapshot: input.status === "approved" ? message.subject : void 0,
            approvedContentSnapshot: input.status === "approved" ? message.content : void 0,
            decidedAt: /* @__PURE__ */ new Date()
          });
          await createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: `message.bulk_status_${input.status}`,
            actor: "user",
            source: "messages.bulkUpdateStatus",
            riskLevel: input.status === "approved" ? "medium" : "low",
            beforeState: JSON.stringify({ status: message.status }),
            afterState: JSON.stringify({
              status: input.status,
              bulkCount: targetMessages.length,
              complianceAcknowledged: !!input.complianceAcknowledged,
              safetyAcknowledged: !!input.safetyAcknowledged,
              sensitiveContentAcknowledged: !!input.sensitiveContentAcknowledged,
              sensitiveWarningCount: input.status === "approved" ? getSensitiveMessageWarnings(message).length : 0
            })
          });
        }
      }
      const updated = await bulkUpdateMessageStatus(
        input.messageIds,
        input.status
      );
      return { success: true, updated };
    })
  }),
  responses: router({
    list: protectedProcedure.input(
      z2.object({
        classification: responseClassificationSchema.optional(),
        campaignId: z2.number().int().positive().optional(),
        limit: z2.number().int().min(1).max(100).default(50)
      }).optional()
    ).query(async ({ input, ctx }) => {
      return getCandidateResponsesForUser(ctx.user.id, {
        classification: input?.classification,
        campaignId: input?.campaignId,
        limit: input?.limit ?? 50
      });
    }),
    recordCandidateResponse: protectedProcedure.input(
      z2.object({
        candidateId: z2.number().int().positive(),
        rawContent: z2.string().trim().min(1).max(5e3),
        classification: responseClassificationSchema.optional(),
        confidence: z2.number().min(0).max(100).optional(),
        source: z2.enum(["manual", "platform", "import"]).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const candidate = await getCandidateById(input.candidateId);
      if (!candidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const campaign = await getCampaignById(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const normalizedContent = input.rawContent.trim();
      const automaticClassification = classifyResponse(normalizedContent);
      const classification = input.classification ?? automaticClassification.classification;
      const confidence = input.confidence ?? automaticClassification.confidence;
      const responseId = await createCandidateResponse({
        candidateId: candidate.id,
        messageId: null,
        platformId: candidate.platformId,
        rawContent: normalizedContent,
        normalizedContent,
        classification,
        confidence,
        source: input.source ?? "manual",
        receivedAt: /* @__PURE__ */ new Date()
      });
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: campaign.id,
        entityType: "candidateResponse",
        entityId: responseId,
        action: "candidate.response_recorded",
        actor: "user",
        source: "responses.recordCandidateResponse",
        riskLevel: "medium",
        afterState: JSON.stringify({
          candidateId: candidate.id,
          classification,
          confidence,
          source: input.source ?? "manual",
          contentLength: normalizedContent.length
        })
      });
      const cancelledFollowUpIds = await cancelScheduledFollowUpsForTerminalResponse({
        userId: ctx.user.id,
        campaignId: campaign.id,
        candidateId: candidate.id,
        responseId,
        classification,
        source: "responses.recordCandidateResponse"
      });
      return {
        success: true,
        responseId,
        classification,
        confidence,
        cancelledFollowUpIds
      };
    }),
    updateClassification: protectedProcedure.input(
      z2.object({
        responseId: z2.number(),
        classification: responseClassificationSchema,
        reason: z2.string().trim().max(500).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const response = await getCandidateResponseById(input.responseId);
      if (!response) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Response not found"
        });
      }
      const candidate = await getCandidateById(response.candidateId);
      if (!candidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Response not found"
        });
      }
      const campaign = await getCampaignById(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Response not found"
        });
      }
      const beforeClassification = response.classification;
      const confidence = input.classification === "unknown" ? 50 : 100;
      await updateCandidateResponseClassification(
        response.id,
        input.classification,
        confidence
      );
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: campaign.id,
        entityType: "candidateResponse",
        entityId: response.id,
        action: "candidate.response_reclassified",
        actor: "user",
        source: "responses.updateClassification",
        riskLevel: "medium",
        beforeState: JSON.stringify({
          classification: beforeClassification,
          confidence: response.confidence
        }),
        afterState: serializeSafeJson({
          classification: input.classification,
          confidence,
          ...getReasonAuditMetadata(input.reason)
        })
      });
      const cancelledFollowUpIds = await cancelScheduledFollowUpsForTerminalResponse({
        userId: ctx.user.id,
        campaignId: campaign.id,
        candidateId: candidate.id,
        responseId: response.id,
        classification: input.classification,
        source: "responses.updateClassification"
      });
      return {
        success: true,
        responseId: response.id,
        classification: input.classification,
        confidence,
        cancelledFollowUpIds
      };
    })
  }),
  followUps: router({
    getDue: protectedProcedure.query(async ({ ctx }) => {
      return getDueFollowUps(ctx.user.id);
    }),
    getSuggestions: protectedProcedure.input(
      z2.object({
        minDaysSinceContact: z2.number().int().min(1).max(30).default(5),
        limit: z2.number().int().min(1).max(50).default(10)
      }).optional()
    ).query(async ({ input, ctx }) => {
      return getFollowUpSuggestions(ctx.user.id, input);
    }),
    prepare: protectedProcedure.input(
      z2.object({
        candidateId: z2.number(),
        subject: z2.string().min(1).max(500),
        content: z2.string().min(1),
        scheduledAt: z2.string().optional(),
        sequence: z2.number().int().min(1).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const candidate = await getCandidateById(input.candidateId);
      if (!candidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const campaign = await getCampaignById(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      await blockArchivedCampaignAction({
        userId: ctx.user.id,
        campaign,
        entityType: "followUp",
        entityId: candidate.id,
        action: "follow_up.prepare_blocked_archived_campaign",
        source: "followUps.prepare",
        riskLevel: "medium",
        afterState: { candidateId: candidate.id }
      });
      await blockOutreachForCandidateQualification({
        userId: ctx.user.id,
        campaignId: campaign.id,
        candidateId: candidate.id,
        entityType: "followUp",
        entityId: candidate.id,
        action: "follow_up.prepare_blocked_candidate_qualification",
        source: "followUps.prepare",
        actor: "user",
        riskLevel: "medium"
      });
      const sequence = input.sequence ?? 1;
      const latestResponse = await getLatestTerminalNegativeResponse(
        candidate.id
      );
      if (latestResponse) {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "followUp",
          entityId: candidate.id,
          action: "follow_up.prepare_blocked_by_response",
          actor: "user",
          source: "followUps.prepare",
          riskLevel: "medium",
          afterState: JSON.stringify({
            candidateId: candidate.id,
            sequence,
            responseId: latestResponse.id,
            responseCandidateId: latestResponse.candidateId,
            classification: latestResponse.classification
          })
        });
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Follow-up preparation is blocked because the latest candidate response says to stop or pause outreach."
        });
      }
      const existingFollowUp = await getActiveFollowUpDraftForCandidate(
        candidate.id,
        sequence
      );
      if (existingFollowUp) {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "followUp",
          entityId: existingFollowUp.id,
          action: "follow_up.prepare_duplicate_blocked",
          actor: "user",
          source: "followUps.prepare",
          riskLevel: "medium",
          afterState: JSON.stringify({
            candidateId: candidate.id,
            sequence,
            existingFollowUpId: existingFollowUp.id,
            messageId: existingFollowUp.messageId
          })
        });
        throw new TRPCError3({
          code: "CONFLICT",
          message: "An active follow-up draft already exists for this candidate and sequence. Review it in the follow-up queue before preparing another."
        });
      }
      const messageId = await createMessage({
        campaignId: campaign.id,
        candidateId: candidate.id,
        platformId: candidate.platformId,
        subject: input.subject,
        content: input.content,
        language: "nl",
        status: "queued"
      });
      const followUpId = await createFollowUp({
        campaignId: campaign.id,
        candidateId: candidate.id,
        sequence,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : /* @__PURE__ */ new Date(),
        status: "scheduled",
        messageId
      });
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: campaign.id,
        entityType: "followUp",
        entityId: followUpId,
        action: "follow_up.prepared",
        actor: "user",
        source: "followUps.prepare",
        riskLevel: "medium",
        afterState: JSON.stringify({ messageId, status: "scheduled" })
      });
      return { success: true, followUpId, messageId };
    }),
    approve: protectedProcedure.input(
      z2.object({
        followUpId: z2.number(),
        reason: z2.string().optional(),
        sensitiveContentAcknowledged: z2.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const followUp = await getFollowUpById(input.followUpId);
      if (!followUp) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Follow-up not found"
        });
      }
      const campaign = await getCampaignById(followUp.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Follow-up not found"
        });
      }
      await blockArchivedCampaignAction({
        userId: ctx.user.id,
        campaign,
        entityType: "followUp",
        entityId: followUp.id,
        action: "follow_up.approval_blocked_archived_campaign",
        source: "followUps.approve",
        riskLevel: "medium",
        afterState: { followUpStatus: followUp.status }
      });
      if (followUp.status !== "scheduled") {
        await createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "followUp",
          entityId: followUp.id,
          action: "follow_up.approval_blocked_inactive",
          actor: "user",
          source: "followUps.approve",
          riskLevel: "medium",
          afterState: JSON.stringify({ status: followUp.status })
        });
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Only scheduled follow-ups can be approved. This follow-up is no longer active."
        });
      }
      if (!followUp.messageId) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Follow-up has no linked message draft to approve."
        });
      }
      const message = await getOwnedMessageOrThrow(
        ctx.user.id,
        followUp.messageId
      );
      await blockMessageActionForTerminalResponse({
        userId: ctx.user.id,
        message,
        source: "followUps.approve",
        action: "message.approval_blocked_by_response",
        actor: "user",
        riskLevel: "medium"
      });
      await blockOutreachForCandidateQualification({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        entityType: "followUp",
        entityId: followUp.id,
        action: "follow_up.approval_blocked_candidate_qualification",
        source: "followUps.approve",
        actor: "user",
        riskLevel: "medium"
      });
      await blockApprovalForDryRunCampaign({
        userId: ctx.user.id,
        message,
        source: "followUps.approve",
        action: "follow_up.approval_blocked_dry_run"
      });
      const sensitiveWarnings = getSensitiveMessageWarnings(message);
      if (sensitiveWarnings.length > 0 && !input.sensitiveContentAcknowledged) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Follow-up draft includes sensitive care or personal context. Review and acknowledge those warnings before approval."
        });
      }
      const approvalId = await createMessageApproval({
        messageId: message.id,
        campaignId: message.campaignId,
        candidateId: message.candidateId,
        userId: ctx.user.id,
        decision: "approved",
        decisionReason: input.reason ?? "Follow-up approved",
        approvedSubjectSnapshot: message.subject,
        approvedContentSnapshot: message.content,
        decidedAt: /* @__PURE__ */ new Date()
      });
      await updateMessageStatus(message.id, "approved");
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: message.campaignId,
        entityType: "followUp",
        entityId: followUp.id,
        action: "follow_up.approved",
        actor: "user",
        source: "followUps.approve",
        riskLevel: "medium",
        approvalId,
        afterState: JSON.stringify({
          messageId: message.id,
          status: "approved",
          sensitiveContentAcknowledged: !!input.sensitiveContentAcknowledged,
          sensitiveWarningCount: sensitiveWarnings.length
        })
      });
      return { success: true, approvalId };
    }),
    skip: protectedProcedure.input(
      z2.object({ followUpId: z2.number(), reason: z2.string().optional() })
    ).mutation(async ({ input, ctx }) => {
      const followUp = await getFollowUpById(input.followUpId);
      if (!followUp) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Follow-up not found"
        });
      }
      const campaign = await getCampaignById(followUp.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Follow-up not found"
        });
      }
      await updateFollowUpStatus(followUp.id, "skipped");
      await createAuditEvent({
        userId: ctx.user.id,
        campaignId: campaign.id,
        entityType: "followUp",
        entityId: followUp.id,
        action: "follow_up.skipped",
        actor: "user",
        source: "followUps.skip",
        riskLevel: "medium",
        afterState: serializeSafeJson({
          status: "skipped",
          ...getReasonAuditMetadata(input.reason)
        })
      });
      return { success: true };
    })
  }),
  platformCredentials: router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      return getCredentialStatus(ctx.user.id);
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserPlatformCredentials: getUserPlatformCredentials2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const credentials = await getUserPlatformCredentials2(ctx.user.id);
      return credentials.map(
        ({
          encryptedPassword: _password,
          apiKey: _apiKey,
          sessionData: _sessionData,
          ...credential
        }) => credential
      );
    }),
    save: protectedProcedure.input(platformCredentialSaveSchema).mutation(async ({ ctx, input }) => {
      const { upsertPlatformCredential: upsertPlatformCredential2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const id = await upsertPlatformCredential2({
        userId: ctx.user.id,
        platformId: input.platformId,
        email: input.email,
        encryptedPassword: encryptSecret(input.password),
        apiKey: encryptSecret(input.apiKey),
        isConnected: 0,
        lastSyncAt: null,
        lastError: null
      });
      await recordCredentialEvent({
        userId: ctx.user.id,
        platformId: input.platformId,
        eventType: "saved",
        status: "warning",
        message: "Credential saved without exposing secret values. Connection test required before campaign launch."
      });
      await createAuditEvent({
        userId: ctx.user.id,
        entityType: "platformCredential",
        entityId: id,
        action: "credential.saved",
        actor: "user",
        source: "platformCredentials.save",
        riskLevel: "high",
        afterState: serializeSafeJson({
          platformId: input.platformId,
          ...getEmailAuditMetadata(input.email),
          verified: false
        })
      });
      return { id };
    }),
    testConnection: protectedProcedure.input(platformCredentialTestSchema).mutation(async ({ input, ctx }) => {
      const { getAllPlatforms: getAllPlatforms2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const platforms2 = await getAllPlatforms2();
      const platform = platforms2.find((p) => p.id === input.platformId);
      if (!platform) {
        return {
          success: false,
          message: "Platform not found"
        };
      }
      if (platform.name === "Nationale Hulpgids") {
        try {
          const { NationaleHulpgidsScraper: NationaleHulpgidsScraper3 } = await Promise.resolve().then(() => (init_nationaleHulpgids(), nationaleHulpgids_exports));
          const scraper = new NationaleHulpgidsScraper3({
            email: input.email,
            password: input.password
          });
          const success = await scraper.authenticate();
          if (success) {
            const { upsertPlatformCredential: upsertPlatformCredential2 } = await Promise.resolve().then(() => (init_db(), db_exports));
            const credentialId = await upsertPlatformCredential2({
              userId: ctx.user.id,
              platformId: input.platformId,
              email: input.email,
              encryptedPassword: encryptSecret(input.password),
              isConnected: 1,
              lastSyncAt: /* @__PURE__ */ new Date(),
              lastError: null
            });
            await recordCredentialEvent({
              userId: ctx.user.id,
              platformId: input.platformId,
              eventType: "tested",
              status: "ok",
              message: "Connection test succeeded."
            });
            await createAuditEvent({
              userId: ctx.user.id,
              entityType: "platformCredential",
              entityId: credentialId,
              action: "credential.verified",
              actor: "user",
              source: "platformCredentials.testConnection",
              riskLevel: "high",
              afterState: serializeSafeJson({
                platformId: input.platformId,
                ...getEmailAuditMetadata(input.email),
                verified: true
              })
            });
            return {
              success: true,
              message: "Successfully authenticated with Nationale Hulpgids"
            };
          } else {
            await recordCredentialEvent({
              userId: ctx.user.id,
              platformId: input.platformId,
              eventType: "failed",
              status: "error",
              message: "Authentication failed."
            });
            return {
              success: false,
              message: "Authentication failed. Please check your credentials."
            };
          }
        } catch (error) {
          console.error("[Test Connection] Error:", {
            platformId: input.platformId,
            message: error?.message || "Unknown error"
          });
          await recordCredentialEvent({
            userId: ctx.user.id,
            platformId: input.platformId,
            eventType: "failed",
            status: "error",
            message: "Connection test failed."
          });
          return {
            success: false,
            message: "Connection test failed. Please check the credentials and platform availability."
          };
        }
      }
      await recordCredentialEvent({
        userId: ctx.user.id,
        platformId: input.platformId,
        eventType: "tested",
        status: "warning",
        message: `${platform.name} supports public discovery only; authenticated connection testing is unavailable.`
      });
      return {
        success: false,
        message: `${platform.name} currently supports public discovery only. Authenticated connection testing is unavailable, so credentials are not marked connected.`
      };
    })
  }),
  audit: router({
    getForCampaign: protectedProcedure.input(z2.object({ campaignId: z2.number() })).query(async ({ input, ctx }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Campaign not found"
        });
      }
      return getAuditEventsForCampaign(ctx.user.id, input.campaignId);
    }),
    getForCandidate: protectedProcedure.input(z2.object({ candidateId: z2.number() })).query(async ({ input, ctx }) => {
      const candidate = await getCandidateById(input.candidateId);
      if (!candidate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      const campaign = await getCampaignById(candidate.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Candidate not found"
        });
      }
      return getAuditEventsForEntity(
        ctx.user.id,
        "candidate",
        input.candidateId
      );
    }),
    getForMessage: protectedProcedure.input(z2.object({ messageId: z2.number() })).query(async ({ input, ctx }) => {
      await getOwnedMessageOrThrow(ctx.user.id, input.messageId);
      return getAuditEventsForEntity(
        ctx.user.id,
        "message",
        input.messageId
      );
    })
  })
});

// server/_core/context.ts
init_db();
async function createContext(opts) {
  let user = null;
  if (process.env.LOCAL_DESKTOP_MODE === "1" || process.env.LOCAL_DESKTOP_MODE === "true") {
    const openId = "local-desktop-user";
    await upsertUser({
      openId,
      name: "Local User",
      email: "local@nationalehulpgids.local",
      loginMethod: "desktop",
      lastSignedIn: /* @__PURE__ */ new Date()
    });
    user = await getUserByOpenId(openId) ?? null;
  }
  try {
    user = user ?? await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = user ?? null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/deploymentConfig.ts
function isEnabled(value) {
  return value === "1" || value === "true";
}
function requireEnv(name, purpose) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured for ${purpose}.`);
  }
  return value;
}
function requireHttpsUrl(name, purpose) {
  const value = requireEnv(name, purpose);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL for ${purpose}.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS for ${purpose}.`);
  }
  return value;
}
function validateDeploymentConfig() {
  if (process.env.NODE_ENV !== "production" || isLocalDesktopMode()) {
    return { status: "local-or-development" };
  }
  assertHostedProductionSecret(
    "JWT_SECRET",
    process.env.JWT_SECRET,
    "sessions"
  );
  requireEnv("VITE_APP_ID", "hosted OAuth sessions");
  requireHttpsUrl("OAUTH_SERVER_URL", "hosted OAuth sessions");
  const ngrokEnabled = isEnabled(process.env.NGROK_ENABLED);
  if (ngrokEnabled) {
    requireEnv("NGROK_AUTHTOKEN", "ngrok tunnel startup");
  }
  return { status: "hosted-production", ngrokEnabled };
}

// server/_core/runtimeHealth.ts
function getRuntimeHealth() {
  return {
    ok: true,
    mode: getRuntimeMode(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function getRuntimeMode() {
  if (process.env.LOCAL_DESKTOP_MODE === "1" || process.env.LOCAL_DESKTOP_MODE === "true") {
    return "local-desktop";
  }
  if (process.env.NGROK_ENABLED === "1" || process.env.NGROK_ENABLED === "true") {
    return "ngrok";
  }
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

// server/_core/ngrok.ts
function isNgrokEnabled() {
  return process.env.NGROK_ENABLED === "1" || process.env.NGROK_ENABLED === "true";
}
async function startNgrokTunnel(port) {
  if (!isNgrokEnabled())
    return { status: "disabled" };
  if (process.env.LOCAL_DESKTOP_MODE === "1" || process.env.LOCAL_DESKTOP_MODE === "true") {
    console.warn(
      "[ngrok] Refusing to expose local desktop mode. Disable LOCAL_DESKTOP_MODE before enabling ngrok."
    );
    return { status: "blocked-desktop" };
  }
  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    console.warn(
      "[ngrok] NGROK_ENABLED is set, but NGROK_AUTHTOKEN is missing. Skipping public tunnel."
    );
    return { status: "missing-token" };
  }
  try {
    const ngrok = await import("@ngrok/ngrok");
    const listener = await ngrok.forward({
      addr: port,
      authtoken,
      domain: process.env.NGROK_DOMAIN || void 0
    });
    const url = listener.url();
    if (!url) {
      throw new Error("ngrok listener did not return a public URL.");
    }
    console.log(`[ngrok] Public URL: ${url}`);
    return { status: "started", url };
  } catch (error) {
    console.error("[ngrok] Failed to start tunnel:", error);
    return { status: "failed", error };
  }
}

// server/_core/vite.ts
import express from "express";
import fs3 from "fs";
import path4 from "path";
async function setupVite(app, server) {
  const viteConfigUrl = new URL("../../vite.config.ts", import.meta.url).href;
  const [{ createServer: createViteServer }, { default: viteConfig }, { nanoid }] = await Promise.all([
    import("vite"),
    import(viteConfigUrl),
    import("nanoid")
  ]);
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs3.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.PUBLIC_DIR || (process.env.NODE_ENV === "development" ? path4.resolve(import.meta.dirname, "../..", "dist", "public") : path4.resolve(import.meta.dirname, "public"));
  if (!fs3.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
    app.use("*", (_req, res) => {
      res.status(503).send("The application has not been built yet. Run the build command first.");
    });
    return;
  }
  app.use(express.static(distPath, {
    etag: true,
    immutable: true,
    maxAge: "1h"
  }));
  app.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
async function listenOnAvailablePort(server, host, startPort) {
  for (let port = startPort; port < startPort + 20; port++) {
    const result = await new Promise((resolve) => {
      const onError = (error) => {
        server.off("listening", onListening);
        resolve(error.code === "EADDRINUSE" ? "busy" : error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve("listening");
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
    if (result === "listening")
      return port;
    if (result !== "busy")
      throw result;
    console.log(`Port ${port} is busy, trying ${port + 1}`);
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  validateDeploymentConfig();
  const app = express2();
  const server = createServer(app);
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || "5mb";
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(express2.json({ limit: bodyLimit }));
  app.use(express2.urlencoded({ limit: bodyLimit, extended: true }));
  app.get("/api/health", (_req, res) => {
    res.json(getRuntimeHealth());
  });
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development" && process.env.USE_VITE_DEV_SERVER === "true") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const host = process.env.HOST || "127.0.0.1";
  const port = await listenOnAvailablePort(server, host, preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  console.log(`Server running on http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
  void startNgrokTunnel(port);
}
startServer().catch(console.error);
