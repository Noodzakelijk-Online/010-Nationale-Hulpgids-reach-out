import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { decryptSecret, encryptSecret } from "./_core/crypto";
import {
  classifyResponse,
  getCampaignReadiness,
  getCampaignReadinessSharedInputs,
  getOperatingLedger,
  getOperatingSummary,
  recordReadinessSnapshot,
} from "./services/outreachLedger";
import { consumeMessageLimit } from "./services/rateLimiter";
import {
  serializeSafeJson,
  truncateOperationalText,
} from "./services/safeSerialization";
import {
  countSuccessfulSendsToday,
  isDryRunSearchCriteria,
  parseCampaignSearchCriteria,
} from "./services/campaignSafety";
import {
  buildCampaignLedgerExport,
  recordCampaignLedgerExportAudit,
} from "./services/campaignExport";

// Import queue services (using in-memory queue for development)
import { getQueueStats } from "./services/inMemoryQueue";

const credentialSecretSchema = z
  .string()
  .min(1, "Credential value is required")
  .max(4096, "Credential value is too large")
  .refine(value => value.trim().length > 0, "Credential value is required");

const credentialEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("A valid email address is required")
  .max(320, "Email address is too large");

const platformCredentialSaveSchema = z
  .object({
    platformId: z.number().int().positive(),
    email: credentialEmailSchema,
    password: credentialSecretSchema.optional(),
    apiKey: credentialSecretSchema.optional(),
  })
  .refine(input => input.password || input.apiKey, {
    message: "A password or API key is required",
    path: ["password"],
  });

const platformCredentialTestSchema = z.object({
  platformId: z.number().int().positive(),
  email: credentialEmailSchema,
  password: credentialSecretSchema,
});

const responseClassificationSchema = z.enum([
  "interested",
  "not_interested",
  "more_info",
  "unavailable",
  "no_response",
  "unknown",
]);

const deliveryConfirmationTextSchema = z
  .string()
  .trim()
  .min(
    20,
    "Confirmation text must describe the platform evidence in at least 20 characters"
  )
  .max(2000, "Confirmation text is too large")
  .optional();

const externalMessageEvidenceSchema = z
  .string()
  .trim()
  .min(6, "External message id or URL is too short")
  .max(255, "External message id or URL is too large")
  .optional();

const OPERATING_SUMMARY_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

const sendFailureReasonSchema = z
  .string()
  .trim()
  .min(8, "Failure reason must describe what happened")
  .max(1000, "Failure reason is too large")
  .optional();

const rateLimitStateSchema = z
  .string()
  .trim()
  .max(2000, "Rate-limit state is too large")
  .optional();

const messageSnippetTitleSchema = z
  .string()
  .trim()
  .min(1, "Snippet title is required")
  .max(120, "Snippet title is too large");

const messageSnippetBodySchema = z
  .string()
  .trim()
  .min(1, "Snippet body is required")
  .max(280, "Snippet body is too large");

const messageSnippetLanguageSchema = z.enum(["nl", "en"]);
const messageSnippetToneSchema = z.enum(["careful", "warm", "concise"]);
const candidateQualificationDecisionSchema = z.enum([
  "qualified",
  "not_qualified",
  "needs_review",
]);
const candidateQualificationReasonSchema = z
  .string()
  .trim()
  .min(8, "Qualification reason must describe the campaign evidence")
  .max(1000, "Qualification reason is too large");
const duplicatePairSelectionSchema = z.object({
  targetCandidateId: z.number().int().positive(),
  sourceCandidateId: z.number().int().positive(),
});

const optionalTrimmedText = (max: number) =>
  z.preprocess(
    value =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional()
  );

const optionalImportedEmailSchema = z.preprocess(
  value =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().toLowerCase().email().max(320).optional()
);

const optionalImportedUrlSchema = z.preprocess(
  value =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().max(2000).optional()
);

const candidateImportRowSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: optionalImportedEmailSchema,
  phone: optionalTrimmedText(50),
  profileUrl: optionalImportedUrlSchema,
  location: optionalTrimmedText(255),
  services: optionalTrimmedText(1000),
  experience: optionalTrimmedText(1000),
  availability: optionalTrimmedText(1000),
  hourlyRate: optionalTrimmedText(100),
  bio: optionalTrimmedText(2000),
  platformName: optionalTrimmedText(100),
});

const terminalNegativeResponseClassifications = new Set([
  "not_interested",
  "unavailable",
]);

const BULK_APPROVAL_REVIEW_THRESHOLD = 10;
const BATCH_DUPLICATE_RESOLUTION_LIMIT = 10;
const sensitiveMessagePattern =
  /\b(bsn|medicatie|diagnose|ziekte|psychisch|trauma|verslaving|persoonlijke verzorging|intiem|toilet|dementie|autisme|adhd|ptss|depressie|angst|beperking|behandeling|therapie)\b/i;
const duplicateBlockingMessageStatuses = new Set([
  "draft",
  "queued",
  "approved",
  "sent",
  "delivered",
  "replied",
  "responded",
  "failed",
]);

function getReasonAuditMetadata(reason: string | null | undefined) {
  const trimmedReason = reason?.trim();
  return {
    reasonProvided: !!trimmedReason,
    reasonLength: trimmedReason?.length ?? 0,
  };
}

function getEmailAuditMetadata(email: string | null | undefined) {
  const trimmedEmail = email?.trim();
  const domain = trimmedEmail?.includes("@")
    ? trimmedEmail.split("@").pop()
    : undefined;
  return {
    emailProvided: !!trimmedEmail,
    emailDomain: domain,
    emailLength: trimmedEmail?.length ?? 0,
  };
}

function summarizeIdentityContextForAudit(context: any) {
  const identity = context?.identity;
  const sources = Array.isArray(context?.sources) ? context.sources : [];
  return {
    identityId: identity?.id ?? null,
    sourceId: context?.source?.id ?? null,
    sourceCount: sources.length,
    candidateIds: sources
      .map((source: any) => source.candidateId)
      .filter((candidateId: unknown) => typeof candidateId === "number"),
    platformIds: Array.from(
      new Set(
        sources
          .map((source: any) => source.platformId)
          .filter((platformId: unknown) => typeof platformId === "number")
      )
    ),
    hasCanonicalEmail: !!identity?.canonicalEmail,
    hasCanonicalPhone: !!identity?.canonicalPhone,
    hasLocation: !!identity?.location,
    sourceProfileUrlCount: sources.filter((source: any) => source.profileUrl)
      .length,
    sourceExternalIdCount: sources.filter((source: any) => source.externalId)
      .length,
  };
}

function isTerminalNegativeResponseClassification(classification: string) {
  return terminalNegativeResponseClassifications.has(classification);
}

function getSensitiveMessageWarnings(message: {
  subject?: string | null;
  content?: string | null;
}) {
  const text = `${message.subject ?? ""}\n${message.content ?? ""}`;
  return sensitiveMessagePattern.test(text)
    ? ["Message may contain sensitive care, health, or personal context"]
    : [];
}

function parsePositiveInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function candidateDuplicatePairKey(candidateAId: number, candidateBId: number) {
  const [firstId, secondId] = [candidateAId, candidateBId].sort(
    (a, b) => a - b
  );
  return `${firstId}:${secondId}`;
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
}

function parseHourlyRateCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value * 100);
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(Number(match[1]) * 100);
}

function buildMatchingCriteriaFromSearchCriteria(
  searchCriteria: Record<string, unknown>
) {
  const minBudget = parseHourlyRateCents(searchCriteria.minBudget);
  const maxBudget = parseHourlyRateCents(searchCriteria.maxBudget);
  const budget =
    minBudget !== null || maxBudget !== null
      ? {
          ...(minBudget !== null ? { min: minBudget } : {}),
          ...(maxBudget !== null ? { max: maxBudget } : {}),
        }
      : undefined;

  return {
    ...searchCriteria,
    location:
      typeof searchCriteria.location === "string"
        ? searchCriteria.location
        : "",
    services: splitList(searchCriteria.services),
    qualifications: splitList(searchCriteria.qualifications),
    specialNeeds: splitList(searchCriteria.specialNeeds),
    ...(budget ? { budget } : {}),
  };
}

function parseCampaignTargetPlatforms(value: string): number[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(entry => Number(entry))
      .filter(entry => Number.isInteger(entry) && entry > 0);
  } catch {
    return [];
  }
}

async function resolveImportPlatform(input: {
  campaign: any;
  platformName?: string;
}) {
  if (input.platformName) {
    const platform = await db.resolvePlatformIdentity({
      platformName: input.platformName,
    });
    if (!platform) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown import platform: ${input.platformName}`,
      });
    }
    return platform;
  }

  const [firstCampaignPlatformId] = parseCampaignTargetPlatforms(
    input.campaign.targetPlatforms
  );
  if (firstCampaignPlatformId) {
    const platform = await db.getPlatformById(firstCampaignPlatformId);
    if (platform) return platform;
  }

  const fallbackPlatform = await db.getPlatformByName("Nationale Hulpgids");
  if (fallbackPlatform) return fallbackPlatform;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "No platform is available for candidate import.",
  });
}

async function getOwnedMessageOrThrow(userId: number, messageId: number) {
  const message = (await db.getAllMessages(userId)).find(
    (entry: any) => entry.id === messageId
  );
  if (!message) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  }
  return message;
}

async function getCandidateOutreachScopeCandidateIds(candidateId: number) {
  const context = await db.getCandidateIdentityContext(candidateId);
  const candidateIds = new Set<number>([candidateId]);
  for (const source of context.sources ?? []) {
    if (typeof source.candidateId === "number") {
      candidateIds.add(source.candidateId);
    }
  }
  return Array.from(candidateIds);
}

async function getLatestTerminalNegativeResponse(candidateId: number) {
  const candidateIds = await getCandidateOutreachScopeCandidateIds(candidateId);
  const responses = (
    await Promise.all(
      candidateIds.map(scopeCandidateId =>
        db.getCandidateResponsesByCandidateId(scopeCandidateId)
      )
    )
  )
    .flat()
    .sort((a, b) => {
      const bTime = new Date(b.createdAt ?? b.receivedAt).getTime();
      const aTime = new Date(a.createdAt ?? a.receivedAt).getTime();
      return bTime - aTime;
    });
  const latestResponse = responses[0];
  if (
    latestResponse &&
    isTerminalNegativeResponseClassification(latestResponse.classification)
  ) {
    return latestResponse;
  }
  return undefined;
}

async function blockMessageActionForTerminalResponse(input: {
  userId: number;
  message: any;
  source: string;
  action: string;
  actor: "user" | "system";
  riskLevel?: "low" | "medium" | "high";
}) {
  const terminalResponse = await getLatestTerminalNegativeResponse(
    input.message.candidateId
  );
  if (!terminalResponse) return;

  await db.createAuditEvent({
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
      classification: terminalResponse.classification,
    }),
  });
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "Message action is blocked because the latest candidate response says to stop or pause outreach.",
  });
}

async function getBlockingQualificationDecision(candidateId: number) {
  const latestDecision = (
    await db.getCandidateQualificationDecisionsByCandidateId(candidateId)
  )[0];
  if (latestDecision && latestDecision.decision !== "qualified") {
    return latestDecision;
  }
  return undefined;
}

async function blockOutreachForCandidateQualification(input: {
  userId: number;
  campaignId: number;
  candidateId: number;
  entityType: string;
  entityId: number;
  action: string;
  source: string;
  actor?: "user" | "system";
  riskLevel?: "low" | "medium" | "high";
}) {
  const blockingDecision = await getBlockingQualificationDecision(
    input.candidateId
  );
  if (!blockingDecision) return;

  await db.createAuditEvent({
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
      reasonLength: blockingDecision.reason.length,
    }),
  });

  throw new TRPCError({
    code: "CONFLICT",
    message: "Outreach is blocked until this candidate is marked qualified.",
  });
}

async function blockApprovalForDryRunCampaign(input: {
  userId: number;
  message: any;
  source: string;
  action: string;
}) {
  const campaign = await db.getCampaignById(input.message.campaignId);
  if (!campaign || !isDryRunSearchCriteria(campaign.searchCriteria)) return;

  await db.createAuditEvent({
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
      status: input.message.status,
    }),
  });
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "This campaign is in dry-run mode. Drafts can be reviewed and edited, but approvals are blocked until the campaign is switched to reviewed outreach mode.",
  });
}

async function blockSendForDryRunCampaign(input: {
  userId: number;
  message: any;
  source: string;
  confirmationText?: string;
  externalMessageId?: string;
  rateLimitState?: string;
}) {
  const campaign = await db.getCampaignById(input.message.campaignId);
  if (!campaign || !isDryRunSearchCriteria(campaign.searchCriteria)) return;

  const attemptId = await db.createMessageSendAttempt({
    messageId: input.message.id,
    campaignId: input.message.campaignId,
    candidateId: input.message.candidateId,
    platformId: input.message.platformId,
    status: "blocked",
    errorMessage:
      "Message send blocked because the campaign is in dry-run mode.",
    confirmationText: input.confirmationText,
    externalMessageId: input.externalMessageId,
    rateLimitState: input.rateLimitState,
    finishedAt: new Date(),
  });
  await db.createAuditEvent({
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
      operationMode: "dry_run",
    }),
  });
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "This campaign is in dry-run mode. External send attempts are blocked until the campaign is switched to reviewed outreach mode.",
  });
}

async function blockSendForCandidateQualification(input: {
  userId: number;
  message: any;
  source: string;
  confirmationText?: string;
  externalMessageId?: string;
  rateLimitState?: string;
}) {
  const blockingDecision = await getBlockingQualificationDecision(
    input.message.candidateId
  );
  if (!blockingDecision) return;

  const attemptId = await db.createMessageSendAttempt({
    messageId: input.message.id,
    campaignId: input.message.campaignId,
    candidateId: input.message.candidateId,
    platformId: input.message.platformId,
    status: "blocked",
    errorMessage:
      "Message send blocked because the candidate is not currently marked qualified.",
    confirmationText: input.confirmationText,
    externalMessageId: input.externalMessageId,
    rateLimitState: input.rateLimitState,
    finishedAt: new Date(),
  });

  await db.createAuditEvent({
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
      reasonLength: blockingDecision.reason.length,
    }),
  });

  throw new TRPCError({
    code: "CONFLICT",
    message:
      "Message send is blocked until this candidate is marked qualified.",
  });
}

async function blockArchivedCampaignAction(input: {
  userId: number;
  campaign: any;
  entityType: string;
  entityId: number;
  action: string;
  source: string;
  riskLevel?: "low" | "medium" | "high";
  afterState?: Record<string, unknown>;
}) {
  if (input.campaign.status !== "archived") return;

  await db.createAuditEvent({
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
      ...input.afterState,
    }),
  });
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "This campaign is archived. Outreach actions are blocked, but the preserved ledger remains available for review.",
  });
}

async function blockMessageActionForArchivedCampaign(input: {
  userId: number;
  message: any;
  source: string;
  action: string;
  riskLevel?: "low" | "medium" | "high";
}) {
  const campaign = await db.getCampaignById(input.message.campaignId);
  if (!campaign) return;
  await blockArchivedCampaignAction({
    userId: input.userId,
    campaign,
    entityType: "message",
    entityId: input.message.id,
    action: input.action,
    source: input.source,
    riskLevel: input.riskLevel,
    afterState: { messageStatus: input.message.status },
  });
}

async function blockSendForArchivedCampaign(input: {
  userId: number;
  message: any;
  source: string;
  confirmationText?: string;
  externalMessageId?: string;
  rateLimitState?: string;
}) {
  const campaign = await db.getCampaignById(input.message.campaignId);
  if (!campaign || campaign.status !== "archived") return;

  const attemptId = await db.createMessageSendAttempt({
    messageId: input.message.id,
    campaignId: input.message.campaignId,
    candidateId: input.message.candidateId,
    platformId: input.message.platformId,
    status: "blocked",
    errorMessage: "Message send blocked because the campaign is archived.",
    confirmationText: input.confirmationText,
    externalMessageId: input.externalMessageId,
    rateLimitState: input.rateLimitState,
    finishedAt: new Date(),
  });
  await db.createAuditEvent({
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
      campaignStatus: "archived",
    }),
  });
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "This campaign is archived. External send attempts are blocked, but the preserved ledger remains available for review.",
  });
}

async function cancelScheduledFollowUpsForTerminalResponse(input: {
  userId: number;
  campaignId: number;
  candidateId: number;
  responseId: number;
  classification: string;
  source: string;
}) {
  if (!isTerminalNegativeResponseClassification(input.classification)) {
    return [];
  }

  const candidateIds = await getCandidateOutreachScopeCandidateIds(
    input.candidateId
  );
  const scheduledFollowUps = (
    await Promise.all(candidateIds.map(db.getFollowUpsForCandidate))
  )
    .flat()
    .filter(followUp => followUp.status === "scheduled");
  const cancelledFollowUpIds: number[] = [];

  for (const followUp of scheduledFollowUps) {
    await db.updateFollowUpStatus(followUp.id, "cancelled");
    cancelledFollowUpIds.push(followUp.id);

    if (followUp.messageId) {
      await db.updateMessageStatus(followUp.messageId, "rejected");
    }

    await db.createAuditEvent({
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
        messageId: followUp.messageId,
      }),
      afterState: JSON.stringify({
        status: "cancelled",
        responseId: input.responseId,
        responseCandidateId: input.candidateId,
        followUpCandidateId: followUp.candidateId,
        identityCandidateCount: candidateIds.length,
        classification: input.classification,
      }),
    });
  }

  return cancelledFollowUpIds;
}

function buildCandidateNextActions(input: {
  candidate: any;
  messages: any[];
  sendAttempts: any[];
  responses: any[];
  followUps: any[];
  sourceCount: number;
  duplicateCount?: number;
  latestQualificationDecision?: any | null;
  outreachLock?: any | null;
}) {
  const actions: Array<{
    priority: "high" | "medium" | "low";
    label: string;
    detail: string;
  }> = [];
  const queued = input.messages.filter(
    message => message.status === "queued"
  ).length;
  const approved = input.messages.filter(
    message => message.status === "approved"
  ).length;
  const failed = input.sendAttempts.filter(attempt =>
    ["failed", "blocked"].includes(attempt.status)
  ).length;

  if (input.outreachLock) {
    actions.push({
      priority: "high",
      label: "Outreach stopped",
      detail:
        input.outreachLock.candidateId === input.candidate.id
          ? `Latest response is ${input.outreachLock.classification}; reopen only with a clear audit reason.`
          : `Linked source profile #${input.outreachLock.candidateId} has a ${input.outreachLock.classification} response; outreach is stopped for this identity.`,
    });
  }

  if (input.sourceCount > 1) {
    actions.push({
      priority: "medium",
      label: "Review duplicate identity",
      detail: `This identity has ${input.sourceCount} source profiles.`,
    });
  }
  if ((input.duplicateCount ?? 0) > 0) {
    actions.push({
      priority: "medium",
      label: "Merge possible duplicate",
      detail: `${input.duplicateCount} likely duplicate profile${input.duplicateCount === 1 ? "" : "s"} need review before merging.`,
    });
  }
  if (!input.latestQualificationDecision) {
    actions.push({
      priority: "medium",
      label: "Record qualification decision",
      detail:
        "Decide whether this candidate is qualified, not qualified, or needs review.",
    });
  } else if (input.latestQualificationDecision.decision === "qualified") {
    actions.push({
      priority: "low",
      label: "Qualified candidate",
      detail:
        "Candidate is marked qualified; continue with approved outreach or response tracking.",
    });
  } else if (input.latestQualificationDecision.decision === "not_qualified") {
    actions.push({
      priority: "medium",
      label: "Avoid new outreach",
      detail:
        "Candidate is marked not qualified; change the decision before starting new outreach.",
    });
  }
  if (queued > 0) {
    actions.push({
      priority: "medium",
      label: "Review draft",
      detail: `${queued} queued message${queued === 1 ? "" : "s"} need approval or rejection.`,
    });
  }
  if (approved > 0) {
    actions.push({
      priority: "high",
      label: "Ready for controlled sending",
      detail: `${approved} approved message${approved === 1 ? "" : "s"} require send evidence before being marked sent.`,
    });
  }
  if (failed > 0) {
    actions.push({
      priority: "high",
      label: "Resolve send issue",
      detail: `${failed} send attempt${failed === 1 ? "" : "s"} failed or were blocked.`,
    });
  }
  if (input.responses.some(response => response.classification === "unknown")) {
    actions.push({
      priority: "low",
      label: "Classify response",
      detail: "At least one response needs manual classification review.",
    });
  }
  if (actions.length === 0) {
    actions.push({
      priority: "low",
      label: "No immediate action",
      detail: "Candidate ledger has no current blockers.",
    });
  }
  return actions;
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Queue management router
  queue: router({
    getStats: protectedProcedure
      .input(z.object({ queueName: z.enum(["messages", "discovery"]) }))
      .query(async ({ input }) => {
        return await getQueueStats(input.queueName);
      }),

    getJobs: protectedProcedure
      .input(
        z.object({
          queueName: z.enum(["messages", "discovery"]),
          status: z
            .enum(["waiting", "active", "completed", "failed", "delayed"])
            .optional(),
          start: z.number().default(0),
          end: z.number().default(49), // Default to 50 jobs
        })
      )
      .query(async ({ input }) => {
        const { messageQueue, discoveryQueue } = await import(
          "./services/inMemoryQueue"
        );
        const queue =
          input.queueName === "messages" ? messageQueue : discoveryQueue;
        return await queue.getJobs(input.status, input.start, input.end);
      }),

    getDurableJobs: protectedProcedure
      .input(
        z.object({
          queueName: z.enum(["messages", "discovery"]).optional(),
          status: z
            .enum([
              "waiting",
              "active",
              "completed",
              "failed",
              "delayed",
              "cancelled",
            ])
            .optional(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getQueueJobRecords(
          ctx.user.id,
          input.queueName,
          input.status,
          { limit: input.limit, offset: input.offset }
        );
      }),

    getHealth: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).default(200),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const [messageStats, discoveryStats, durable] = await Promise.all([
          getQueueStats("messages"),
          getQueueStats("discovery"),
          db.getQueueHealthSummary(ctx.user.id, {
            limit: input?.limit,
          }),
        ]);
        const liveByQueue = {
          messages: messageStats,
          discovery: discoveryStats,
        };

        return {
          ...durable,
          queues: durable.queues.map(queue => ({
            ...queue,
            live: liveByQueue[queue.queueName],
          })),
          totals: {
            live: {
              waiting: messageStats.waiting + discoveryStats.waiting,
              active: messageStats.active + discoveryStats.active,
              completed: messageStats.completed + discoveryStats.completed,
              failed: messageStats.failed + discoveryStats.failed,
              delayed: messageStats.delayed + discoveryStats.delayed,
              total: messageStats.total + discoveryStats.total,
            },
            durable: durable.queues.reduce(
              (totals, queue) => {
                totals.recentRecords += queue.durable.recentRecords;
                totals.failed += queue.durable.failed;
                totals.failedLast24h += queue.failedLast24h;
                return totals;
              },
              { recentRecords: 0, failed: 0, failedLast24h: 0 }
            ),
          },
        };
      }),

    recordJob: protectedProcedure
      .input(
        z.object({
          queueName: z.enum(["messages", "discovery"]),
          jobType: z.string().min(1).max(100),
          status: z
            .enum([
              "waiting",
              "active",
              "completed",
              "failed",
              "delayed",
              "cancelled",
            ])
            .optional(),
          campaignId: z.number().optional(),
          messageId: z.number().optional(),
          payload: z.record(z.string(), z.unknown()).optional(),
          errorMessage: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.campaignId) {
          const campaign = await db.getCampaignById(input.campaignId);
          if (!campaign || campaign.userId !== ctx.user.id) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Campaign not found",
            });
          }
        }
        const id = await db.createQueueJobRecord({
          userId: ctx.user.id,
          campaignId: input.campaignId,
          messageId: input.messageId,
          queueName: input.queueName,
          jobType: input.jobType,
          status: input.status ?? "waiting",
          payloadJson: input.payload
            ? serializeSafeJson(input.payload)
            : undefined,
          errorMessage: truncateOperationalText(input.errorMessage),
        });
        return { success: true, id };
      }),

    cancelJob: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().max(300).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const job = await db.getQueueJobRecordForUser(input.id, ctx.user.id);
        if (!job) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue job not found",
          });
        }
        const canCancelQueued =
          job.status === "waiting" || job.status === "delayed";
        const canRequestActiveDiscoveryCancel =
          job.status === "active" && job.queueName === "discovery";

        if (!canCancelQueued && !canRequestActiveDiscoveryCancel) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Only waiting/delayed jobs can be cancelled immediately; active discovery jobs can request cooperative cancellation.",
          });
        }

        const { messageQueue, discoveryQueue } = await import(
          "./services/inMemoryQueue"
        );
        const queue = job.queueName === "messages" ? messageQueue : discoveryQueue;
        const liveCancellation = await queue.cancelJobByDurableRecordId(job.id);
        if (
          canRequestActiveDiscoveryCancel &&
          liveCancellation.reason === "not_found"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This active discovery job is not attached to a live worker and cannot receive a cooperative cancellation request.",
          });
        }
        if (liveCancellation.reason === "not_cancellable") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This queue job is already active and cannot be interrupted safely.",
          });
        }

        if (liveCancellation.cancellationRequested) {
          await db.createAuditEvent({
            userId: ctx.user.id,
            campaignId: job.campaignId ?? undefined,
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
              reasonLength: input.reason?.length ?? 0,
            }),
          });

          return {
            success: true,
            cancellationRequested: true,
            job,
            liveJobId: liveCancellation.jobId,
          };
        }

        const cancellation = await db.cancelQueueJobRecord({
          id: job.id,
          userId: ctx.user.id,
          reason: input.reason,
        });
        if (!cancellation.cancelled) {
          throw new TRPCError({
            code:
              cancellation.reason === "not_found" ? "NOT_FOUND" : "CONFLICT",
            message:
              cancellation.reason === "not_found"
                ? "Queue job not found"
                : "Only waiting or delayed queue jobs can be cancelled safely.",
          });
        }

        await db.createAuditEvent({
          userId: ctx.user.id,
          campaignId: job.campaignId ?? undefined,
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
            reasonLength: input.reason?.length ?? 0,
          }),
        });

        return {
          success: true,
          job: cancellation.job,
          liveJobId: liveCancellation.jobId,
        };
      }),
  }),

  // Multi-platform reach-out tool routers
  messageSnippets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getActiveMessageSnippets(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          title: messageSnippetTitleSchema,
          body: messageSnippetBodySchema,
          language: messageSnippetLanguageSchema.default("nl"),
          tonePreset: messageSnippetToneSchema.default("careful"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const snippetId = await db.createMessageSnippet({
          userId: ctx.user.id,
          title: input.title,
          body: input.body,
          language: input.language,
          tonePreset: input.tonePreset,
        });

        await db.createAuditEvent({
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
            tonePreset: input.tonePreset,
          }),
        });

        const snippet = await db.getMessageSnippetById(snippetId);
        return { success: true, snippet };
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const snippet = await db.archiveMessageSnippet(input.id, ctx.user.id);

        await db.createAuditEvent({
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
            tonePreset: snippet.tonePreset,
          }),
        });

        return { success: true };
      }),
  }),

  platforms: router({
    list: publicProcedure.query(async () => {
      const { getAllPlatforms } = await import("./db");
      return getAllPlatforms();
    }),
  }),

  candidates: router({
    discover: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          platforms: z.array(z.string()),
          searchCriteria: z.object({
            location: z.string().optional(),
            experience: z.string().optional(),
            services: z.string().optional(),
            minBudget: z.string().optional(),
            maxBudget: z.string().optional(),
            keywords: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        if (campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this campaign",
          });
        }
        await blockArchivedCampaignAction({
          userId: ctx.user.id,
          campaign,
          entityType: "campaign",
          entityId: campaign.id,
          action: "campaign.discovery_blocked_archived",
          source: "candidates.discover",
          riskLevel: "medium",
        });

        const readiness = await recordReadinessSnapshot(campaign, ctx.user.id);
        if (readiness.status === "blocked") {
          await db.createAuditEvent({
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
              status: readiness.status,
            }),
          });
          throw new TRPCError({
            code: "CONFLICT",
            message: `Campaign discovery is blocked by readiness checks: ${readiness.blockers.join("; ")}`,
          });
        }

        const { PlatformScraperFactory } = await import(
          "./services/platformScraper"
        );
        const { calculateCompatibility, saveMatchFactors } = await import(
          "./services/aiMatching"
        );

        // Get platform credentials for authenticated scraping
        const credentialsMap = new Map();
        const userCredentials = await db.getUserPlatformCredentials(
          ctx.user.id
        );
        const allPlatforms = await db.getAllPlatforms();
        userCredentials.forEach((cred: any) => {
          const platform = allPlatforms.find(
            (entry: any) => entry.id === cred.platformId
          );
          if (!platform) return;
          credentialsMap.set(platform.name, {
            email: cred.email || "",
            password: decryptSecret(cred.encryptedPassword) || "",
            sessionData: cred.sessionData,
          });
        });

        const campaignCriteria = JSON.parse(campaign.searchCriteria || "{}");
        const normalizedCampaignCriteria =
          buildMatchingCriteriaFromSearchCriteria(campaignCriteria);

        // Search across all selected platforms only after ownership and
        // readiness checks pass.
        const results = await PlatformScraperFactory.searchMultiplePlatforms(
          input.platforms,
          input.searchCriteria,
          credentialsMap
        );

        // Process and store candidates
        const allCandidates = [];
        for (const [platform, candidates] of Array.from(results.entries())) {
          for (const candidate of candidates) {
            // Calculate compatibility score
            const matchResult = await calculateCompatibility(
              {
                location: candidate.location,
                experience: candidate.experience,
                services: candidate.services,
                availability: candidate.availability,
                hourlyRate: parseHourlyRateCents(candidate.hourlyRate),
                bio: candidate.bio,
              },
              normalizedCampaignCriteria
            );
            const compatibilityScore = matchResult.compatibilityScore;

            // Store candidate in database
            // Find platformId from platform name
            const platformRecord = await db.resolvePlatformIdentity({
              platformName: platform,
            });
            if (!platformRecord) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Unknown platform returned discovery results: ${platform}`,
              });
            }
            const platformId = platformRecord.id;

            const candidateId = await db.createCandidate({
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
              hourlyRate: parseHourlyRateCents(candidate.hourlyRate),
              bio: candidate.bio,
              compatibilityScore,
              matchReasons: JSON.stringify(matchResult.matchReasons || []),
              status: "discovered",
            });

            const storedCandidate = await db.getCandidateById(candidateId);
            if (storedCandidate) {
              await saveMatchFactors(candidateId, matchResult.factors);
              await db.getOrCreateCandidateIdentity(
                storedCandidate,
                ctx.user.id
              );
              await db.createAuditEvent({
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
                  matchFactorCount: matchResult.factors.length,
                  recommendation: matchResult.recommendation,
                  profileUrl: candidate.profileUrl,
                }),
              });
            }

            allCandidates.push({
              ...candidate,
              id: candidateId,
              compatibilityScore,
            });
          }
        }

        return {
          success: true,
          candidatesFound: allCandidates.length,
          candidates: allCandidates,
        };
      }),

    importManual: protectedProcedure
      .input(
        z.object({
          campaignId: z.number().int().positive(),
          personalDataAcknowledged: z.boolean(),
          sourceLabel: z.string().trim().max(120).optional(),
          candidates: z.array(candidateImportRowSchema).min(1).max(25),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }

        await blockArchivedCampaignAction({
          userId: ctx.user.id,
          campaign,
          entityType: "campaign",
          entityId: campaign.id,
          action: "candidate.import_blocked_archived_campaign",
          source: "candidates.importManual",
          riskLevel: "medium",
        });

        if (!input.personalDataAcknowledged) {
          await db.createAuditEvent({
            userId: ctx.user.id,
            campaignId: campaign.id,
            entityType: "campaign",
            entityId: campaign.id,
            action: "candidate.import_blocked_missing_acknowledgement",
            actor: "user",
            source: "candidates.importManual",
            riskLevel: "medium",
            afterState: JSON.stringify({
              candidateRows: input.candidates.length,
            }),
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Confirm the personal-data acknowledgement before importing candidates.",
          });
        }

        const sourceLabel = input.sourceLabel?.trim() || "manual_import";
        const importedAt = new Date();
        const campaignCriteria = JSON.parse(campaign.searchCriteria || "{}");
        const normalizedCampaignCriteria =
          buildMatchingCriteriaFromSearchCriteria(campaignCriteria);
        const { calculateCompatibility, saveMatchFactors } = await import(
          "./services/aiMatching"
        );
        const imported = [];
        let duplicateWarningCount = 0;

        for (const row of input.candidates) {
          const platform = await resolveImportPlatform({
            campaign,
            platformName: row.platformName,
          });
          const hourlyRate = parseHourlyRateCents(row.hourlyRate);
          const matchResult = await calculateCompatibility(
            {
              location: row.location,
              experience: row.experience,
              services: row.services,
              availability: row.availability,
              hourlyRate,
              bio: row.bio,
            },
            normalizedCampaignCriteria
          );
          const compatibilityScore = matchResult.compatibilityScore;
          const candidateId = await db.createCandidate({
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
            hourlyRate,
            bio: row.bio,
            compatibilityScore,
            matchReasons: JSON.stringify(
              matchResult.matchReasons.length > 0
                ? matchResult.matchReasons
                : [
                    "Manually imported; no strong campaign match factors were found yet.",
                  ]
            ),
            profileData: JSON.stringify({
              importSource: sourceLabel,
              importedAt: importedAt.toISOString(),
              platformName: platform.name,
              matchRecommendation: matchResult.recommendation,
            }),
            status: "discovered",
          });

          const storedCandidate = await db.getCandidateById(candidateId);
          if (!storedCandidate) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Imported candidate could not be read back.",
            });
          }

          await saveMatchFactors(candidateId, matchResult.factors);
          const duplicateCandidates = await db.getCandidatePotentialDuplicates(
            candidateId,
            ctx.user.id
          );
          await db.getOrCreateCandidateIdentity(storedCandidate, ctx.user.id);
          duplicateWarningCount += duplicateCandidates.length;

          await db.createAuditEvent({
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
              compatibilityScore,
              matchFactorCount: matchResult.factors.length,
              recommendation: matchResult.recommendation,
              duplicateWarningCount: duplicateCandidates.length,
              duplicateCandidates: duplicateCandidates
                .slice(0, 5)
                .map((duplicate: any) => ({
                  candidateId: duplicate.candidate.id,
                  confidence: duplicate.confidence,
                  reasons: duplicate.reasons,
                })),
            }),
          });

          imported.push({
            id: candidateId,
            name: storedCandidate.name,
            platformName: platform.name,
            compatibilityScore,
            recommendation: matchResult.recommendation,
            matchReasons: matchResult.matchReasons,
            duplicateWarningCount: duplicateCandidates.length,
            duplicateWarnings: duplicateCandidates
              .slice(0, 5)
              .map((duplicate: any) => ({
                candidateId: duplicate.candidate.id,
                candidateName: duplicate.candidate.name,
                confidence: duplicate.confidence,
                reasons: duplicate.reasons,
              })),
          });
        }

        await db.createAuditEvent({
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
            personalDataAcknowledged: true,
          }),
        });

        return {
          success: true,
          importedCount: imported.length,
          duplicateWarningCount,
          imported,
        };
      }),

    list: protectedProcedure
      .input(
        z.object({
          campaignId: z.number().optional(),
          platform: z.string().optional(),
          minScore: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        if (input.campaignId) {
          const campaign = await db.getCampaignById(input.campaignId);
          if (!campaign || campaign.userId !== ctx.user.id) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Campaign not found",
            });
          }
        }
        const candidates = input.campaignId
          ? await db.getCampaignCandidates(input.campaignId)
          : await db.getUserCandidates(ctx.user.id);
        return candidates.filter((candidate: any) => {
          const platformName =
            candidate.platform?.name ||
            candidate.platform ||
            candidate.platformName;
          if (input.platform && platformName !== input.platform) return false;
          if (input.minScore && candidate.compatibilityScore < input.minScore)
            return false;
          return true;
        });
        /*return db.getCandidates({
          userId: ctx.user.id,
          campaignId: input.campaignId,
          platform: input.platform,
          minScore: input.minScore,
        });*/
      }),

    getDuplicates: protectedProcedure.query(async ({ ctx }) => {
      return db.getCandidateDuplicateGroups(ctx.user.id);
    }),

    getDuplicateReviewQueue: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(50).default(10),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getCandidateDuplicateReviewQueue(ctx.user.id, input);
      }),

    searchForPicker: protectedProcedure
      .input(
        z.object({
          search: z.string().trim().max(120).optional(),
          campaignId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(50).default(25),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.searchUserCandidatePickerOptions(ctx.user.id, input);
      }),

    recordQualification: protectedProcedure
      .input(
        z.object({
          candidateId: z.number().int().positive(),
          decision: candidateQualificationDecisionSchema,
          reason: candidateQualificationReasonSchema,
          sensitiveAssumptionsAcknowledged: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const candidate = await db.getCandidateById(input.candidateId);
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const campaign = await db.getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        if (campaign.status === "archived") {
          await db.createAuditEvent({
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
              reasonLength: input.reason.length,
            }),
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Archived campaigns cannot be changed.",
          });
        }

        if (
          input.decision === "qualified" &&
          !input.sensitiveAssumptionsAcknowledged
        ) {
          await db.createAuditEvent({
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
              reasonLength: input.reason.length,
            }),
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Confirm the qualification decision is based on relevant campaign evidence.",
          });
        }

        const decisionId = await db.createCandidateQualificationDecision({
          candidateId: candidate.id,
          campaignId: campaign.id,
          userId: ctx.user.id,
          decision: input.decision,
          reason: input.reason,
          sensitiveAssumptionsAcknowledged:
            input.sensitiveAssumptionsAcknowledged ? 1 : 0,
        });

        await db.createAuditEvent({
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
            sensitiveAssumptionsAcknowledged:
              input.sensitiveAssumptionsAcknowledged,
          }),
        });

        return { success: true, id: decisionId };
      }),

    mergeDuplicate: protectedProcedure
      .input(
        z.object({
          targetCandidateId: z.number(),
          sourceCandidateId: z.number(),
          reason: z.string().min(1).max(500),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.targetCandidateId === input.sourceCandidateId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose two different candidate profiles to merge.",
          });
        }

        const [targetCandidate, sourceCandidate] = await Promise.all([
          db.getCandidateById(input.targetCandidateId),
          db.getCandidateById(input.sourceCandidateId),
        ]);
        if (!targetCandidate || !sourceCandidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const [targetCampaign, sourceCampaign] = await Promise.all([
          db.getCampaignById(targetCandidate.campaignId),
          db.getCampaignById(sourceCandidate.campaignId),
        ]);
        if (!targetCampaign || targetCampaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }
        if (!sourceCampaign || sourceCampaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const beforeState = {
          targetCandidateId: targetCandidate.id,
          sourceCandidateId: sourceCandidate.id,
          targetIdentity: summarizeIdentityContextForAudit(
            await db.getCandidateIdentityContext(targetCandidate.id)
          ),
          sourceIdentity: summarizeIdentityContextForAudit(
            await db.getCandidateIdentityContext(sourceCandidate.id)
          ),
        };
        const merge = await db.mergeCandidateIdentitySources({
          userId: ctx.user.id,
          targetCandidateId: targetCandidate.id,
          sourceCandidateId: sourceCandidate.id,
        });
        const resolutionId = await db.createCandidateDuplicateResolution({
          userId: ctx.user.id,
          targetCandidateId: targetCandidate.id,
          sourceCandidateId: sourceCandidate.id,
          decision: "merged",
          reason: input.reason,
        });

        await db.createAuditEvent({
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
            sourceCandidateId: sourceCandidate.id,
          }),
        });

        return { success: true, ...merge };
      }),

    resolveDuplicatePair: protectedProcedure
      .input(
        z.object({
          targetCandidateId: z.number().int().positive(),
          sourceCandidateId: z.number().int().positive(),
          decision: z.literal("not_duplicate"),
          reason: z.string().trim().min(8).max(500),
          confidence: z.number().int().min(0).max(100).optional(),
          reasons: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.targetCandidateId === input.sourceCandidateId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose two different candidate profiles to resolve.",
          });
        }

        const [targetCandidate, sourceCandidate] = await Promise.all([
          db.getCandidateById(input.targetCandidateId),
          db.getCandidateById(input.sourceCandidateId),
        ]);
        if (!targetCandidate || !sourceCandidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const [targetCampaign, sourceCampaign] = await Promise.all([
          db.getCampaignById(targetCandidate.campaignId),
          db.getCampaignById(sourceCandidate.campaignId),
        ]);
        if (!targetCampaign || targetCampaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }
        if (!sourceCampaign || sourceCampaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const resolutionId = await db.createCandidateDuplicateResolution({
          userId: ctx.user.id,
          targetCandidateId: targetCandidate.id,
          sourceCandidateId: sourceCandidate.id,
          decision: input.decision,
          reason: input.reason,
          confidence: input.confidence,
          reasons: input.reasons,
        });

        await db.createAuditEvent({
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
            reasonLength: input.reason.length,
          }),
        });

        return { success: true, resolutionId };
      }),

    resolveDuplicatePairsBatch: protectedProcedure
      .input(
        z.object({
          pairs: z
            .array(duplicatePairSelectionSchema)
            .min(1)
            .max(BATCH_DUPLICATE_RESOLUTION_LIMIT),
          decision: z.literal("not_duplicate"),
          reason: z.string().trim().min(12).max(500),
          reviewedCurrentQueueAcknowledged: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!input.reviewedCurrentQueueAcknowledged) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Confirm that the selected pairs were reviewed in the current duplicate queue before batch dismissal.",
          });
        }

        const selectedKeys = new Set<string>();
        for (const pair of input.pairs) {
          if (pair.targetCandidateId === pair.sourceCandidateId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Each duplicate pair must contain two different profiles.",
            });
          }
          const pairKey = candidateDuplicatePairKey(
            pair.targetCandidateId,
            pair.sourceCandidateId
          );
          if (selectedKeys.has(pairKey)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Duplicate pair selections must be unique.",
            });
          }
          selectedKeys.add(pairKey);
        }

        const currentQueue = await db.getCandidateDuplicateReviewQueue(
          ctx.user.id,
          { limit: 50 }
        );
        const currentPairsByKey = new Map(
          currentQueue.map((pair: any) => [
            candidateDuplicatePairKey(
              pair.targetCandidate.id,
              pair.sourceCandidate.id
            ),
            pair,
          ])
        );
        const selectedPairs = Array.from(selectedKeys).map(pairKey => {
          const pair = currentPairsByKey.get(pairKey);
          if (!pair) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "One or more selected duplicate pairs are no longer in the current review queue.",
            });
          }
          return pair;
        });

        const resolutionIds: number[] = [];
        for (const pair of selectedPairs) {
          const resolutionId = await db.createCandidateDuplicateResolution({
            userId: ctx.user.id,
            targetCandidateId: pair.targetCandidate.id,
            sourceCandidateId: pair.sourceCandidate.id,
            decision: input.decision,
            reason: input.reason,
            confidence: pair.confidence,
            reasons: pair.reasons,
          });
          resolutionIds.push(resolutionId);

          await db.createAuditEvent({
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
              batchSize: selectedPairs.length,
            }),
          });
        }

        await db.createAuditEvent({
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
            reviewedCurrentQueueAcknowledged:
              input.reviewedCurrentQueueAcknowledged,
          }),
        });

        return {
          success: true,
          resolvedCount: resolutionIds.length,
          resolutionIds,
        };
      }),

    getLedger: protectedProcedure
      .input(z.object({ candidateId: z.number() }))
      .query(async ({ input, ctx }) => {
        const candidate = await db.getCandidateById(input.candidateId);
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }
        const campaign = await db.getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const [
          platform,
          messages,
          matchFactors,
          identityContext,
          sendAttempts,
          responses,
          qualificationDecisions,
          followUps,
          auditEvents,
          duplicateCandidates,
        ] = await Promise.all([
          db.getPlatformById(candidate.platformId),
          db.getCandidateMessages(candidate.id),
          db.getCandidateMatchFactors(candidate.id),
          db.getCandidateIdentityContext(candidate.id),
          db.getMessageSendAttemptsForCandidate(candidate.id),
          db.getCandidateResponsesByCandidateId(candidate.id),
          db.getCandidateQualificationDecisionsByCandidateId(candidate.id),
          db.getFollowUpsForCandidate(candidate.id),
          db.getAuditEventsForEntity(ctx.user.id, "candidate", candidate.id),
          db.getCandidatePotentialDuplicates(candidate.id, ctx.user.id),
        ]);
        const outreachLock = await getLatestTerminalNegativeResponse(
          candidate.id
        );

        return {
          candidate,
          campaign,
          platform,
          messages,
          matchFactors,
          identity: identityContext.identity,
          source: identityContext.source,
          sources: identityContext.sources,
          sendAttempts,
          responses,
          qualificationDecisions,
          latestQualificationDecision: qualificationDecisions[0] ?? null,
          outreachLock,
          followUps,
          auditEvents,
          duplicateCandidates,
          nextActions: buildCandidateNextActions({
            candidate,
            messages,
            sendAttempts,
            responses,
            followUps,
            sourceCount: identityContext.sources.length,
            duplicateCount: duplicateCandidates.length,
            latestQualificationDecision: qualificationDecisions[0] ?? null,
            outreachLock,
          }),
        };
      }),
  }),

  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserCampaigns } = await import("./db");
      return getUserCampaigns(ctx.user.id);
    }),

    get: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "id" in val &&
          typeof val.id === "number"
        ) {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .query(async ({ input, ctx }) => {
        const { getCampaignById } = await import("./db");
        const campaign = await getCampaignById(input.id);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return campaign;
      }),

    create: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "title" in val &&
          typeof val.title === "string" &&
          "targetPlatforms" in val &&
          typeof val.targetPlatforms === "string" &&
          "searchCriteria" in val &&
          typeof val.searchCriteria === "string"
        ) {
          return val as {
            title: string;
            description?: string;
            targetPlatforms: string;
            searchCriteria: string;
            status?: string;
            isScheduled?: number;
            scheduledFor?: string;
            isRecurring?: number;
            recurringPattern?: string | null;
            nextExecutionAt?: string;
          };
        }
        throw new Error("Invalid campaign input");
      })
      .mutation(async ({ ctx, input }) => {
        const { createCampaign } = await import("./db");
        let searchCriteria: Record<string, unknown>;
        try {
          searchCriteria = parseCampaignSearchCriteria(input.searchCriteria);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "Invalid campaign safety policy.",
          });
        }
        const campaignId = await createCampaign({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          targetPlatforms: input.targetPlatforms,
          searchCriteria: JSON.stringify(searchCriteria),
          status:
            (input.status as
              | "draft"
              | "active"
              | "paused"
              | "completed"
              | "scheduled"
              | "archived") || "draft",
          isScheduled: input.isScheduled || 0,
          scheduledFor: input.scheduledFor
            ? new Date(input.scheduledFor)
            : null,
          isRecurring: input.isRecurring || 0,
          recurringPattern: input.recurringPattern || null,
          nextExecutionAt: input.nextExecutionAt
            ? new Date(input.nextExecutionAt)
            : null,
        });
        return { id: campaignId };
      }),

    pause: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "id" in val &&
          typeof val.id === "number"
        ) {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .mutation(async ({ input, ctx }) => {
        const { getCampaignById, updateCampaign } = await import("./db");
        const campaign = await getCampaignById(input.id);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        if (campaign.status === "archived") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Archived campaigns cannot be paused.",
          });
        }

        await updateCampaign(input.id, {
          status: "paused",
          nextExecutionAt: null,
        });

        return { success: true };
      }),

    resume: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "id" in val &&
          typeof val.id === "number"
        ) {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .mutation(async ({ input, ctx }) => {
        const { getCampaignById, updateCampaign } = await import("./db");
        // Get campaign to recalculate next execution
        const campaign = await getCampaignById(input.id);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        if (campaign.status === "archived") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Archived campaigns cannot be resumed.",
          });
        }

        // Calculate next execution time
        let nextExecutionAt = campaign.scheduledFor;
        if (campaign.isRecurring === 1 && campaign.recurringPattern) {
          // For recurring campaigns, calculate next execution from now
          const { calculateNextExecution } = await import(
            "./services/scheduledCampaigns"
          );
          nextExecutionAt = calculateNextExecution(campaign.recurringPattern);
        }

        await updateCampaign(input.id, {
          status: "scheduled",
          nextExecutionAt,
        });

        return { success: true };
      }),

    delete: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "id" in val &&
          typeof val.id === "number"
        ) {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .mutation(async ({ input, ctx }) => {
        const { archiveCampaign, createAuditEvent } = await import("./db");

        try {
          const before = await archiveCampaign(input.id, ctx.user.id);
          await createAuditEvent({
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
              nextExecutionAt: before.nextExecutionAt,
            }),
            afterState: JSON.stringify({
              status: "archived",
              isScheduled: 0,
              nextExecutionAt: null,
              ledgerPreserved: true,
            }),
            riskLevel: "high",
          });
        } catch {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to archive this campaign",
          });
        }

        return { success: true };
      }),

    stats: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "id" in val &&
          typeof val.id === "number"
        ) {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .query(async ({ input, ctx }) => {
        const { getCampaignById, getCampaignStats } = await import("./db");
        const campaign = await getCampaignById(input.id);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return getCampaignStats(input.id);
      }),

    getEngagementMetrics: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCampaignById, getEngagementMetrics } = await import("./db");
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return getEngagementMetrics(input.campaignId);
      }),

    getReadiness: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          persistSnapshot: z.boolean().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return input.persistSnapshot
          ? recordReadinessSnapshot(campaign, ctx.user.id)
          : getCampaignReadiness(campaign, ctx.user.id);
      }),

    getOperatingLedger: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return getOperatingLedger(campaign, ctx.user.id);
      }),

    exportLedger: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          personalDataAcknowledged: z.boolean().optional(),
          includePersonalData: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const includePersonalData = input.includePersonalData ?? true;
        if (includePersonalData && !input.personalDataAcknowledged) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Campaign ledger export includes candidate personal data. Review and acknowledge this before exporting.",
          });
        }

        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }

        const exportedLedger = await buildCampaignLedgerExport(
          campaign,
          ctx.user.id,
          { includePersonalData }
        );
        await recordCampaignLedgerExportAudit({
          userId: ctx.user.id,
          campaignId: campaign.id,
          counts: exportedLedger.counts,
          personalDataIncluded: exportedLedger.personalDataIncluded,
        });

        return exportedLedger;
      }),

    getNextActions: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        const ledger = await getOperatingLedger(campaign, ctx.user.id);
        return ledger.nextActions;
      }),

    listOperatingSummaries: protectedProcedure.query(async ({ ctx }) => {
      const campaigns = await db.getUserCampaigns(ctx.user.id);
      const sharedReadinessInputs = await getCampaignReadinessSharedInputs(
        ctx.user.id
      );
      return mapWithConcurrency(
        campaigns,
        OPERATING_SUMMARY_CONCURRENCY,
        campaign =>
          getOperatingSummary(campaign, ctx.user.id, sharedReadinessInputs)
      );
    }),
  }),

  messages: router({
    list: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "campaignId" in val &&
          typeof val.campaignId === "number"
        ) {
          return { campaignId: val.campaignId };
        }
        throw new Error(
          "Invalid input: expected object with numeric campaignId"
        );
      })
      .query(async ({ input, ctx }) => {
        const { getCampaignById, getCampaignMessages } = await import("./db");
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return getCampaignMessages(input.campaignId);
      }),

    generate: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "candidateId" in val &&
          typeof val.candidateId === "number" &&
          "campaignDescription" in val &&
          typeof val.campaignDescription === "string"
        ) {
          return val as {
            candidateId: number;
            campaignDescription: string;
            language?: "nl" | "en";
          };
        }
        throw new Error("Invalid input");
      })
      .mutation(async ({ input, ctx }) => {
        const { getCampaignById, getCandidateById } = await import("./db");
        const { generateOutreachMessage } = await import(
          "./services/aiMatching"
        );

        const candidate = await getCandidateById(input.candidateId);
        if (!candidate) throw new Error("Candidate not found");
        const campaign = await getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        return generateOutreachMessage(
          candidate,
          input.campaignDescription,
          input.language || "nl"
        );
      }),

    bulkOutreach: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          language: z.enum(["nl", "en"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const {
          getCampaignById,
          getCampaignCandidates,
          getCampaignMessages,
          createMessage,
        } = await import("./db");
        const { generateOutreachMessage, normalizeOutreachDraftingOptions } =
          await import("./services/aiMatching");

        // Get campaign details
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        if (campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this campaign",
          });
        }
        await blockArchivedCampaignAction({
          userId: ctx.user.id,
          campaign,
          entityType: "campaign",
          entityId: campaign.id,
          action: "message.bulk_outreach_blocked_archived",
          source: "messages.bulkOutreach",
          riskLevel: "medium",
        });

        const searchCriteria = JSON.parse(campaign.searchCriteria || "{}");
        const messageDrafting = normalizeOutreachDraftingOptions(
          searchCriteria.messageDrafting
        );
        const compatibilityThreshold =
          searchCriteria.compatibilityThreshold || 70;
        const maxCandidateLimit = parsePositiveInteger(
          searchCriteria.maxCandidates
        );

        // Get all candidates above threshold
        const allCandidates = await getCampaignCandidates(input.campaignId);
        const qualifiedCandidates = allCandidates.filter(
          c => c.compatibilityScore >= compatibilityThreshold
        );
        const candidatesWithinLimit = maxCandidateLimit
          ? qualifiedCandidates.slice(0, maxCandidateLimit)
          : qualifiedCandidates;
        const existingMessages = await getCampaignMessages(input.campaignId);
        const candidateIdsWithExistingOutreach = new Set(
          existingMessages
            .filter(message =>
              duplicateBlockingMessageStatuses.has(message.status)
            )
            .map(message => message.candidateId)
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
          messages: [] as any[],
        };

        // Generate and store messages for each candidate
        for (const candidate of candidatesWithinLimit) {
          try {
            if (candidateIdsWithExistingOutreach.has(candidate.id)) {
              results.skippedExistingOutreach++;
              continue;
            }

            const blockingQualificationDecision =
              await getBlockingQualificationDecision(candidate.id);
            if (blockingQualificationDecision) {
              results.skippedQualificationReview++;
              continue;
            }

            const latestTerminalResponse =
              await getLatestTerminalNegativeResponse(candidate.id);
            if (latestTerminalResponse) {
              results.skippedStoppedOutreach++;
              continue;
            }

            // Generate personalized message
            const { subject, content } = await generateOutreachMessage(
              candidate,
              campaign.description || "",
              input.language || "nl",
              messageDrafting
            );

            // Store message in database
            const messageId = await createMessage({
              campaignId: input.campaignId,
              candidateId: candidate.id,
              platformId: candidate.platformId,
              subject,
              content,
              language: input.language || "nl",
              status: "queued", // Messages are queued for sending
            });

            results.success++;
            results.messages.push({
              id: messageId,
              candidateId: candidate.id,
              candidateName: candidate.name,
              subject,
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

        await db.createAuditEvent({
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
            templateSnippetProvided: Boolean(messageDrafting.templateSnippet),
          }),
        });

        return {
          success: true,
          totalCandidates: qualifiedCandidates.length,
          messagesQueued: results.success,
          messagesFailed: results.failed,
          messagesSkippedExistingOutreach: results.skippedExistingOutreach,
          messagesSkippedStoppedOutreach: results.skippedStoppedOutreach,
          messagesSkippedQualificationReview:
            results.skippedQualificationReview,
          messagesSkippedByLimit: results.skippedByLimit,
          messages: results.messages,
        };
      }),

    listAll: protectedProcedure
      .input(
        z.object({
          status: z.string().optional(),
          campaignId: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { getAllMessages } = await import("./db");
        return getAllMessages(ctx.user.id, input.status, input.campaignId);
      }),

    listPage: protectedProcedure
      .input(
        z.object({
          status: z.string().max(32).optional(),
          campaignId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        const { getMessageReviewPage } = await import("./db");
        return getMessageReviewPage(ctx.user.id, input);
      }),

    approve: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          reason: z.string().optional(),
          sensitiveContentAcknowledged: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const message = await getOwnedMessageOrThrow(
          ctx.user.id,
          input.messageId
        );
        await blockMessageActionForArchivedCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.approve",
          action: "message.approval_blocked_archived_campaign",
        });
        await blockMessageActionForTerminalResponse({
          userId: ctx.user.id,
          message,
          source: "messages.approve",
          action: "message.approval_blocked_by_response",
          actor: "user",
          riskLevel: "medium",
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
          riskLevel: "medium",
        });
        await blockApprovalForDryRunCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.approve",
          action: "message.approval_blocked_dry_run",
        });
        const sensitiveWarnings = getSensitiveMessageWarnings(message);
        if (
          sensitiveWarnings.length > 0 &&
          !input.sensitiveContentAcknowledged
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Message includes sensitive care or personal context. Review and acknowledge those warnings before approval.",
          });
        }
        const approvalId = await db.createMessageApproval({
          messageId: message.id,
          campaignId: message.campaignId,
          candidateId: message.candidateId,
          userId: ctx.user.id,
          decision: "approved",
          decisionReason: input.reason,
          approvedSubjectSnapshot: message.subject,
          approvedContentSnapshot: message.content,
          decidedAt: new Date(),
        });
        await db.updateMessageStatus(message.id, "approved");
        await db.createAuditEvent({
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
            sensitiveWarningCount: sensitiveWarnings.length,
          }),
        });
        return { success: true, approvalId };
      }),

    reject: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const message = await getOwnedMessageOrThrow(
          ctx.user.id,
          input.messageId
        );
        await blockMessageActionForArchivedCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.reject",
          action: "message.rejection_blocked_archived_campaign",
          riskLevel: "low",
        });
        const approvalId = await db.createMessageApproval({
          messageId: message.id,
          campaignId: message.campaignId,
          candidateId: message.candidateId,
          userId: ctx.user.id,
          decision: "rejected",
          decisionReason: input.reason,
          decidedAt: new Date(),
        });
        await db.updateMessageStatus(message.id, "rejected");
        await db.createAuditEvent({
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
          afterState: JSON.stringify({ status: "rejected" }),
        });
        return { success: true, approvalId };
      }),

    recordSendAttempt: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          status: z.enum(["blocked", "started", "succeeded", "failed"]),
          errorMessage: sendFailureReasonSchema,
          externalMessageId: externalMessageEvidenceSchema,
          confirmationText: deliveryConfirmationTextSchema,
          rateLimitState: rateLimitStateSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
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
          rateLimitState: input.rateLimitState,
        });
        await blockSendForDryRunCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.recordSendAttempt",
          confirmationText: input.confirmationText,
          externalMessageId: input.externalMessageId,
          rateLimitState: input.rateLimitState,
        });
        const approvals = await db.getMessageApprovalsByMessageId(message.id);
        const hasApproval = approvals.some(
          approval => approval.decision === "approved"
        );
        const hasEvidence =
          !!input.externalMessageId || !!input.confirmationText;

        if (!hasApproval) {
          const attemptId = await db.createMessageSendAttempt({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            platformId: message.platformId,
            status: "blocked",
            errorMessage:
              "Message send blocked because no explicit approval exists.",
            finishedAt: new Date(),
          });
          await db.createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.send_blocked_unapproved",
            actor: "system",
            source: "messages.recordSendAttempt",
            riskLevel: "high",
            afterState: JSON.stringify({ attemptId }),
          });
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Message must be explicitly approved before sending.",
          });
        }

        if (["started", "succeeded"].includes(input.status)) {
          await blockSendForCandidateQualification({
            userId: ctx.user.id,
            message,
            source: "messages.recordSendAttempt",
            confirmationText: input.confirmationText,
            externalMessageId: input.externalMessageId,
            rateLimitState: input.rateLimitState,
          });

          const terminalResponse = await getLatestTerminalNegativeResponse(
            message.candidateId
          );
          if (terminalResponse) {
            const attemptId = await db.createMessageSendAttempt({
              messageId: message.id,
              campaignId: message.campaignId,
              candidateId: message.candidateId,
              platformId: message.platformId,
              status: "blocked",
              errorMessage:
                "Message send blocked because the latest candidate response says to stop or pause outreach.",
              confirmationText: input.confirmationText,
              externalMessageId: input.externalMessageId,
              rateLimitState: input.rateLimitState,
              finishedAt: new Date(),
            });
            await db.createAuditEvent({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              entityType: "message",
              entityId: message.id,
              action: "message.send_blocked_by_response",
              actor: "system",
              source: "messages.recordSendAttempt",
              riskLevel: "high",
              afterState: JSON.stringify({
                attemptId,
                responseId: terminalResponse.id,
                responseCandidateId: terminalResponse.candidateId,
                messageCandidateId: message.candidateId,
                classification: terminalResponse.classification,
              }),
            });
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Message send is blocked because the latest candidate response says to stop or pause outreach.",
            });
          }
        }

        if (message.status !== "approved") {
          const attemptId = await db.createMessageSendAttempt({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            platformId: message.platformId,
            status: "blocked",
            errorMessage:
              "Message send blocked because the current message status is not approved.",
            confirmationText: input.confirmationText,
            externalMessageId: input.externalMessageId,
            rateLimitState: input.rateLimitState,
            finishedAt: new Date(),
          });
          await db.createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.send_blocked_not_currently_approved",
            actor: "system",
            source: "messages.recordSendAttempt",
            riskLevel: "high",
            afterState: JSON.stringify({
              attemptId,
              status: message.status,
            }),
          });
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Message must currently be approved before recording a send attempt.",
          });
        }

        if (input.status === "succeeded" && !hasEvidence) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Successful send attempts require meaningful externalMessageId or confirmationText evidence.",
          });
        }

        if (
          ["failed", "blocked"].includes(input.status) &&
          !input.errorMessage
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Failed or blocked send attempts require a failure reason.",
          });
        }

        if (input.status === "succeeded") {
          const duplicateCandidates = await db.getCandidatePotentialDuplicates(
            message.candidateId,
            ctx.user.id
          );
          if (duplicateCandidates.length > 0) {
            const attemptId = await db.createMessageSendAttempt({
              messageId: message.id,
              campaignId: message.campaignId,
              candidateId: message.candidateId,
              platformId: message.platformId,
              status: "blocked",
              errorMessage:
                "Message send blocked because this candidate has unresolved possible duplicates.",
              confirmationText: input.confirmationText,
              externalMessageId: input.externalMessageId,
              rateLimitState: input.rateLimitState,
              finishedAt: new Date(),
            });
            await db.createAuditEvent({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              entityType: "message",
              entityId: message.id,
              action: "message.send_blocked_duplicate_candidate",
              actor: "system",
              source: "messages.recordSendAttempt",
              riskLevel: "high",
              afterState: JSON.stringify({
                attemptId,
                duplicateCandidateIds: duplicateCandidates.map(
                  duplicate => duplicate.candidate.id
                ),
              }),
            });
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Resolve possible duplicate candidate profiles before recording a successful send.",
            });
          }

          const campaign = await db.getCampaignById(message.campaignId);
          if (!campaign) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Campaign not found",
            });
          }
          const searchCriteria = parseCampaignSearchCriteria(
            campaign.searchCriteria || "{}"
          );
          const todaySuccessfulSends = countSuccessfulSendsToday(
            await db.getMessageSendAttemptsForCampaign(message.campaignId)
          );
          if (
            todaySuccessfulSends >= searchCriteria.safetyPolicy.dailySendLimit
          ) {
            const attemptId = await db.createMessageSendAttempt({
              messageId: message.id,
              campaignId: message.campaignId,
              candidateId: message.candidateId,
              platformId: message.platformId,
              status: "blocked",
              errorMessage:
                "Message send blocked because the campaign daily send limit has been reached.",
              confirmationText: input.confirmationText,
              externalMessageId: input.externalMessageId,
              rateLimitState:
                input.rateLimitState ||
                JSON.stringify({
                  blockedAt: new Date().toISOString(),
                  reason: "campaign-daily-send-limit",
                  dailySendLimit: searchCriteria.safetyPolicy.dailySendLimit,
                  successfulSendsToday: todaySuccessfulSends,
                }),
              finishedAt: new Date(),
            });
            await db.createRateLimitEvent({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              platformId: message.platformId,
              eventType: "message_send_blocked",
              severity: "blocked",
              detailJson: JSON.stringify({
                messageId: message.id,
                candidateId: message.candidateId,
                attemptId,
                reason: "campaign-daily-send-limit",
                dailySendLimit: searchCriteria.safetyPolicy.dailySendLimit,
                successfulSendsToday: todaySuccessfulSends,
              }),
            });
            await db.createAuditEvent({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              entityType: "message",
              entityId: message.id,
              action: "message.send_blocked_daily_campaign_limit",
              actor: "system",
              source: "messages.recordSendAttempt",
              riskLevel: "high",
              afterState: JSON.stringify({
                attemptId,
                dailySendLimit: searchCriteria.safetyPolicy.dailySendLimit,
                successfulSendsToday: todaySuccessfulSends,
              }),
            });
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message:
                "Campaign daily send limit reached. Wait until tomorrow or lower risk by reviewing the campaign settings.",
            });
          }

          const platforms = await db.getAllPlatforms();
          const platform = platforms.find(
            entry => entry.id === message.platformId
          );
          if (!platform) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Message platform could not be resolved.",
            });
          }

          try {
            await consumeMessageLimit(platform.name, 1);
          } catch (error: any) {
            const errorMessage =
              error?.message ||
              `Message rate limit exceeded for ${platform.name}.`;
            const attemptId = await db.createMessageSendAttempt({
              messageId: message.id,
              campaignId: message.campaignId,
              candidateId: message.candidateId,
              platformId: message.platformId,
              status: "blocked",
              errorMessage,
              confirmationText: input.confirmationText,
              externalMessageId: input.externalMessageId,
              rateLimitState:
                input.rateLimitState ||
                JSON.stringify({
                  platform: platform.name,
                  blockedAt: new Date().toISOString(),
                  reason: "message-rate-limit",
                }),
              finishedAt: new Date(),
            });
            await db.createRateLimitEvent({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              platformId: message.platformId,
              eventType: "message_send_blocked",
              severity: "blocked",
              detailJson: JSON.stringify({
                messageId: message.id,
                candidateId: message.candidateId,
                attemptId,
                platform: platform.name,
                errorMessage,
              }),
            });
            await db.createAuditEvent({
              userId: ctx.user.id,
              campaignId: message.campaignId,
              entityType: "message",
              entityId: message.id,
              action: "message.send_blocked_rate_limit",
              actor: "system",
              source: "messages.recordSendAttempt",
              riskLevel: "high",
              afterState: JSON.stringify({
                attemptId,
                platform: platform.name,
              }),
            });
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message:
                "Platform message rate limit reached. Wait before recording another successful send.",
            });
          }
        }

        const attemptId = await db.createMessageSendAttempt({
          messageId: message.id,
          campaignId: message.campaignId,
          candidateId: message.candidateId,
          platformId: message.platformId,
          status: input.status,
          errorMessage: input.errorMessage,
          externalMessageId: input.externalMessageId,
          confirmationText: input.confirmationText,
          rateLimitState: input.rateLimitState,
          finishedAt: input.status === "started" ? null : new Date(),
        });

        if (input.status === "succeeded") {
          await db.updateMessageStatus(message.id, "sent");
        } else if (input.status === "failed" || input.status === "blocked") {
          await db.updateMessageStatus(message.id, "failed");
        }

        await db.createAuditEvent({
          userId: ctx.user.id,
          campaignId: message.campaignId,
          entityType: "message",
          entityId: message.id,
          action: `message.send_attempt_${input.status}`,
          actor: "user",
          source: "messages.recordSendAttempt",
          riskLevel: input.status === "succeeded" ? "high" : "medium",
          afterState: JSON.stringify({ attemptId, status: input.status }),
        });

        return { success: true, attemptId };
      }),

    recordResponse: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          rawContent: z.string().min(1),
          classification: responseClassificationSchema.optional(),
          confidence: z.number().min(0).max(100).optional(),
          source: z.enum(["manual", "platform", "import"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const message = await getOwnedMessageOrThrow(
          ctx.user.id,
          input.messageId
        );
        const automaticClassification = classifyResponse(input.rawContent);
        const classification =
          input.classification ?? automaticClassification.classification;
        const confidence =
          input.confidence ?? automaticClassification.confidence;
        const normalizedContent = input.rawContent.trim();

        const responseId = await db.createCandidateResponse({
          candidateId: message.candidateId,
          messageId: message.id,
          platformId: message.platformId,
          rawContent: input.rawContent,
          normalizedContent,
          classification,
          confidence,
          source: input.source ?? "manual",
          receivedAt: new Date(),
        });

        await db.updateMessageResponse(message.id, normalizedContent);
        await db.createAuditEvent({
          userId: ctx.user.id,
          campaignId: message.campaignId,
          entityType: "candidateResponse",
          entityId: responseId,
          action: "candidate.response_recorded",
          actor: "user",
          source: "messages.recordResponse",
          riskLevel: "medium",
          afterState: JSON.stringify({ classification, confidence }),
        });

        const cancelledFollowUpIds =
          await cancelScheduledFollowUpsForTerminalResponse({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            responseId,
            classification,
            source: "messages.recordResponse",
          });

        return {
          success: true,
          responseId,
          classification,
          confidence,
          cancelledFollowUpIds,
        };
      }),

    reopenOutreach: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          reason: z
            .string()
            .trim()
            .min(8, "Explain why outreach can safely be reopened.")
            .max(500, "Reopen reason is too long."),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const message = await getOwnedMessageOrThrow(
          ctx.user.id,
          input.messageId
        );
        const terminalResponse = await getLatestTerminalNegativeResponse(
          message.candidateId
        );

        if (!terminalResponse) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Outreach is not locked for this candidate. No reopen action is required.",
          });
        }

        const normalizedReason = input.reason.trim();
        const responseId = await db.createCandidateResponse({
          candidateId: message.candidateId,
          messageId: null,
          platformId: message.platformId,
          rawContent: normalizedReason,
          normalizedContent: normalizedReason,
          classification: "unknown",
          confidence: 100,
          source: "manual",
          receivedAt: new Date(),
        });

        await db.createAuditEvent({
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
            classification: terminalResponse.classification,
          }),
          afterState: serializeSafeJson({
            responseId,
            classification: "unknown",
            ...getReasonAuditMetadata(normalizedReason),
            messageId: message.id,
          }),
        });

        return {
          success: true,
          responseId,
          previousResponseId: terminalResponse.id,
        };
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          status: z.enum(["queued", "approved", "sent", "rejected", "replied"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const message = await getOwnedMessageOrThrow(
          ctx.user.id,
          input.messageId
        );
        await blockMessageActionForArchivedCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.updateStatus",
          action: "message.status_blocked_archived_campaign",
          riskLevel: input.status === "approved" ? "medium" : "low",
        });
        if (input.status === "sent") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Use messages.recordSendAttempt with delivery evidence to mark a message as sent.",
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
              riskLevel: "medium",
            });
            await blockApprovalForDryRunCampaign({
              userId: ctx.user.id,
              message,
              source: "messages.updateStatus",
              action: "message.approval_blocked_dry_run",
            });
          }
          await db.createMessageApproval({
            messageId: message.id,
            campaignId: message.campaignId,
            candidateId: message.candidateId,
            userId: ctx.user.id,
            decision: input.status,
            approvedSubjectSnapshot:
              input.status === "approved" ? message.subject : undefined,
            approvedContentSnapshot:
              input.status === "approved" ? message.content : undefined,
            decidedAt: new Date(),
          });
        }
        await db.updateMessageStatus(input.messageId, input.status);
        await db.createAuditEvent({
          userId: ctx.user.id,
          campaignId: message.campaignId,
          entityType: "message",
          entityId: message.id,
          action: `message.status_${input.status}`,
          actor: "user",
          source: "messages.updateStatus",
          riskLevel: input.status === "approved" ? "medium" : "low",
          beforeState: JSON.stringify({ status: message.status }),
          afterState: JSON.stringify({ status: input.status }),
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(
        z.object({
          messageId: z.number(),
          subject: z.string(),
          content: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getAllMessages, updateMessage } = await import("./db");
        const message = (await getAllMessages(ctx.user.id)).find(
          (entry: any) => entry.id === input.messageId
        );
        if (!message) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Message not found",
          });
        }
        await blockMessageActionForArchivedCampaign({
          userId: ctx.user.id,
          message,
          source: "messages.update",
          action: "message.update_blocked_archived_campaign",
          riskLevel: "low",
        });
        if (
          ["sent", "delivered", "responded", "replied"].includes(
            message.status
          )
        ) {
          await db.createAuditEvent({
            userId: ctx.user.id,
            campaignId: message.campaignId,
            entityType: "message",
            entityId: message.id,
            action: "message.update_blocked_after_contact",
            actor: "user",
            source: "messages.update",
            riskLevel: "medium",
            afterState: JSON.stringify({ status: message.status }),
          });
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Messages that have already been sent, delivered, or replied to cannot be edited. Create a follow-up draft instead.",
          });
        }

        const shouldResetForReview = ["approved", "rejected", "failed"].includes(
          message.status
        );
        await updateMessage(input.messageId, input.subject, input.content);
        if (shouldResetForReview) {
          await db.updateMessageStatus(input.messageId, "queued");
        }
        await db.createAuditEvent({
          userId: ctx.user.id,
          campaignId: message.campaignId,
          entityType: "message",
          entityId: message.id,
          action: shouldResetForReview
            ? "message.updated_review_reset"
            : "message.updated",
          actor: "user",
          source: "messages.update",
          riskLevel: shouldResetForReview ? "medium" : "low",
          beforeState: JSON.stringify({ status: message.status }),
          afterState: serializeSafeJson({
            status: shouldResetForReview ? "queued" : message.status,
            subjectLength: input.subject.length,
            contentLength: input.content.length,
          }),
        });
        return { success: true };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(
        z.object({
          messageIds: z.array(z.number()).min(1).max(100),
          status: z.enum(["queued", "approved", "sent", "rejected", "replied"]),
          complianceAcknowledged: z.boolean().optional(),
          safetyAcknowledged: z.boolean().optional(),
          sensitiveContentAcknowledged: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.status === "sent") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Use messages.recordSendAttempt with delivery evidence to mark messages as sent.",
          });
        }
        const ownedMessages = await db.getAllMessages(ctx.user.id);
        const messageById = new Map(
          ownedMessages.map((entry: any) => [entry.id, entry])
        );
        if (input.messageIds.some(messageId => !messageById.has(messageId))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "One or more messages are not accessible",
          });
        }
        const targetMessages = input.messageIds.map(
          messageId => messageById.get(messageId) as any
        );
        for (const message of targetMessages) {
          await blockMessageActionForArchivedCampaign({
            userId: ctx.user.id,
            message,
            source: "messages.bulkUpdateStatus",
            action: "message.bulk_status_blocked_archived_campaign",
            riskLevel: input.status === "approved" ? "medium" : "low",
          });
        }
        if (input.status === "approved") {
          if (!input.complianceAcknowledged) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Bulk approval requires consent and platform-compliance acknowledgement.",
            });
          }

          if (
            targetMessages.length > BULK_APPROVAL_REVIEW_THRESHOLD &&
            !input.safetyAcknowledged
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Bulk approval of more than ${BULK_APPROVAL_REVIEW_THRESHOLD} messages requires explicit safety acknowledgement.`,
            });
          }

          const sensitiveMessages = targetMessages.filter(
            message => getSensitiveMessageWarnings(message).length > 0
          );
          if (
            sensitiveMessages.length > 0 &&
            !input.sensitiveContentAcknowledged
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Bulk approval includes messages with sensitive care or personal context. Review and acknowledge those warnings before approval.",
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
                riskLevel: "medium",
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
                riskLevel: "medium",
              });
              await blockApprovalForDryRunCampaign({
                userId: ctx.user.id,
                message,
                source: "messages.bulkUpdateStatus",
                action: "message.approval_blocked_dry_run",
              });
            }
            await db.createMessageApproval({
              messageId: message.id,
              campaignId: message.campaignId,
              candidateId: message.candidateId,
              userId: ctx.user.id,
              decision: input.status,
              approvedSubjectSnapshot:
                input.status === "approved" ? message.subject : undefined,
              approvedContentSnapshot:
                input.status === "approved" ? message.content : undefined,
              decidedAt: new Date(),
            });
            await db.createAuditEvent({
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
                sensitiveContentAcknowledged:
                  !!input.sensitiveContentAcknowledged,
                sensitiveWarningCount:
                  input.status === "approved"
                    ? getSensitiveMessageWarnings(message).length
                    : 0,
              }),
            });
          }
        }
        const updated = await db.bulkUpdateMessageStatus(
          input.messageIds,
          input.status
        );
        return { success: true, updated };
      }),
  }),

  responses: router({
    list: protectedProcedure
      .input(
        z
          .object({
            classification: responseClassificationSchema.optional(),
            campaignId: z.number().int().positive().optional(),
            limit: z.number().int().min(1).max(100).default(50),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getCandidateResponsesForUser(ctx.user.id, {
          classification: input?.classification,
          campaignId: input?.campaignId,
          limit: input?.limit ?? 50,
        });
      }),

    recordCandidateResponse: protectedProcedure
      .input(
        z.object({
          candidateId: z.number().int().positive(),
          rawContent: z.string().trim().min(1).max(5000),
          classification: responseClassificationSchema.optional(),
          confidence: z.number().min(0).max(100).optional(),
          source: z.enum(["manual", "platform", "import"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const candidate = await db.getCandidateById(input.candidateId);
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const campaign = await db.getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }

        const normalizedContent = input.rawContent.trim();
        const automaticClassification = classifyResponse(normalizedContent);
        const classification =
          input.classification ?? automaticClassification.classification;
        const confidence =
          input.confidence ?? automaticClassification.confidence;

        const responseId = await db.createCandidateResponse({
          candidateId: candidate.id,
          messageId: null,
          platformId: candidate.platformId,
          rawContent: normalizedContent,
          normalizedContent,
          classification,
          confidence,
          source: input.source ?? "manual",
          receivedAt: new Date(),
        });

        await db.createAuditEvent({
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
            contentLength: normalizedContent.length,
          }),
        });

        const cancelledFollowUpIds =
          await cancelScheduledFollowUpsForTerminalResponse({
            userId: ctx.user.id,
            campaignId: campaign.id,
            candidateId: candidate.id,
            responseId,
            classification,
            source: "responses.recordCandidateResponse",
          });

        return {
          success: true,
          responseId,
          classification,
          confidence,
          cancelledFollowUpIds,
        };
      }),

    updateClassification: protectedProcedure
      .input(
        z.object({
          responseId: z.number(),
          classification: responseClassificationSchema,
          reason: z.string().trim().max(500).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const response = await db.getCandidateResponseById(input.responseId);
        if (!response) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }

        const candidate = await db.getCandidateById(response.candidateId);
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }
        const campaign = await db.getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }

        const beforeClassification = response.classification;
        const confidence = input.classification === "unknown" ? 50 : 100;
        await db.updateCandidateResponseClassification(
          response.id,
          input.classification,
          confidence
        );

        await db.createAuditEvent({
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
            confidence: response.confidence,
          }),
          afterState: serializeSafeJson({
            classification: input.classification,
            confidence,
            ...getReasonAuditMetadata(input.reason),
          }),
        });

        const cancelledFollowUpIds =
          await cancelScheduledFollowUpsForTerminalResponse({
            userId: ctx.user.id,
            campaignId: campaign.id,
            candidateId: candidate.id,
            responseId: response.id,
            classification: input.classification,
            source: "responses.updateClassification",
          });

        return {
          success: true,
          responseId: response.id,
          classification: input.classification,
          confidence,
          cancelledFollowUpIds,
        };
      }),
  }),

  followUps: router({
    getDue: protectedProcedure.query(async ({ ctx }) => {
      return db.getDueFollowUps(ctx.user.id);
    }),

    getSuggestions: protectedProcedure
      .input(
        z
          .object({
            minDaysSinceContact: z.number().int().min(1).max(30).default(5),
            limit: z.number().int().min(1).max(50).default(10),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getFollowUpSuggestions(ctx.user.id, input);
      }),

    prepare: protectedProcedure
      .input(
        z.object({
          candidateId: z.number(),
          subject: z.string().min(1).max(500),
          content: z.string().min(1),
          scheduledAt: z.string().optional(),
          sequence: z.number().int().min(1).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const candidate = await db.getCandidateById(input.candidateId);
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }
        const campaign = await db.getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
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
          afterState: { candidateId: candidate.id },
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
          riskLevel: "medium",
        });

        const sequence = input.sequence ?? 1;
        const latestResponse = await getLatestTerminalNegativeResponse(
          candidate.id
        );
        if (latestResponse) {
          await db.createAuditEvent({
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
              classification: latestResponse.classification,
            }),
          });
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Follow-up preparation is blocked because the latest candidate response says to stop or pause outreach.",
          });
        }

        const existingFollowUp = await db.getActiveFollowUpDraftForCandidate(
          candidate.id,
          sequence
        );

        if (existingFollowUp) {
          await db.createAuditEvent({
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
              messageId: existingFollowUp.messageId,
            }),
          });
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An active follow-up draft already exists for this candidate and sequence. Review it in the follow-up queue before preparing another.",
          });
        }

        const messageId = await db.createMessage({
          campaignId: campaign.id,
          candidateId: candidate.id,
          platformId: candidate.platformId,
          subject: input.subject,
          content: input.content,
          language: "nl",
          status: "queued",
        });
        const followUpId = await db.createFollowUp({
          campaignId: campaign.id,
          candidateId: candidate.id,
          sequence,
          scheduledAt: input.scheduledAt
            ? new Date(input.scheduledAt)
            : new Date(),
          status: "scheduled",
          messageId,
        });
        await db.createAuditEvent({
          userId: ctx.user.id,
          campaignId: campaign.id,
          entityType: "followUp",
          entityId: followUpId,
          action: "follow_up.prepared",
          actor: "user",
          source: "followUps.prepare",
          riskLevel: "medium",
          afterState: JSON.stringify({ messageId, status: "scheduled" }),
        });
        return { success: true, followUpId, messageId };
      }),

    approve: protectedProcedure
      .input(
        z.object({
          followUpId: z.number(),
          reason: z.string().optional(),
          sensitiveContentAcknowledged: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const followUp = await db.getFollowUpById(input.followUpId);
        if (!followUp) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Follow-up not found",
          });
        }
        const campaign = await db.getCampaignById(followUp.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Follow-up not found",
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
          afterState: { followUpStatus: followUp.status },
        });
        if (followUp.status !== "scheduled") {
          await db.createAuditEvent({
            userId: ctx.user.id,
            campaignId: campaign.id,
            entityType: "followUp",
            entityId: followUp.id,
            action: "follow_up.approval_blocked_inactive",
            actor: "user",
            source: "followUps.approve",
            riskLevel: "medium",
            afterState: JSON.stringify({ status: followUp.status }),
          });
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Only scheduled follow-ups can be approved. This follow-up is no longer active.",
          });
        }
        if (!followUp.messageId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Follow-up has no linked message draft to approve.",
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
          riskLevel: "medium",
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
          riskLevel: "medium",
        });
        await blockApprovalForDryRunCampaign({
          userId: ctx.user.id,
          message,
          source: "followUps.approve",
          action: "follow_up.approval_blocked_dry_run",
        });
        const sensitiveWarnings = getSensitiveMessageWarnings(message);
        if (
          sensitiveWarnings.length > 0 &&
          !input.sensitiveContentAcknowledged
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Follow-up draft includes sensitive care or personal context. Review and acknowledge those warnings before approval.",
          });
        }
        const approvalId = await db.createMessageApproval({
          messageId: message.id,
          campaignId: message.campaignId,
          candidateId: message.candidateId,
          userId: ctx.user.id,
          decision: "approved",
          decisionReason: input.reason ?? "Follow-up approved",
          approvedSubjectSnapshot: message.subject,
          approvedContentSnapshot: message.content,
          decidedAt: new Date(),
        });
        await db.updateMessageStatus(message.id, "approved");
        await db.createAuditEvent({
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
            sensitiveWarningCount: sensitiveWarnings.length,
          }),
        });
        return { success: true, approvalId };
      }),

    skip: protectedProcedure
      .input(
        z.object({ followUpId: z.number(), reason: z.string().optional() })
      )
      .mutation(async ({ input, ctx }) => {
        const followUp = await db.getFollowUpById(input.followUpId);
        if (!followUp) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Follow-up not found",
          });
        }
        const campaign = await db.getCampaignById(followUp.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Follow-up not found",
          });
        }
        await db.updateFollowUpStatus(followUp.id, "skipped");
        await db.createAuditEvent({
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
            ...getReasonAuditMetadata(input.reason),
          }),
        });
        return { success: true };
      }),
  }),

  platformCredentials: router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      return db.getCredentialStatus(ctx.user.id);
    }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserPlatformCredentials } = await import("./db");
      const credentials = await getUserPlatformCredentials(ctx.user.id);
      return credentials.map(
        ({
          encryptedPassword: _password,
          apiKey: _apiKey,
          sessionData: _sessionData,
          ...credential
        }) => credential
      );
    }),

    save: protectedProcedure
      .input(platformCredentialSaveSchema)
      .mutation(async ({ ctx, input }) => {
        const { upsertPlatformCredential } = await import("./db");

        const id = await upsertPlatformCredential({
          userId: ctx.user.id,
          platformId: input.platformId,
          email: input.email,
          encryptedPassword: encryptSecret(input.password),
          apiKey: encryptSecret(input.apiKey),
          isConnected: 0,
          lastSyncAt: null,
          lastError: null,
        });
        await db.recordCredentialEvent({
          userId: ctx.user.id,
          platformId: input.platformId,
          eventType: "saved",
          status: "warning",
          message:
            "Credential saved without exposing secret values. Connection test required before campaign launch.",
        });
        await db.createAuditEvent({
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
            verified: false,
          }),
        });

        return { id };
      }),

    testConnection: protectedProcedure
      .input(platformCredentialTestSchema)
      .mutation(async ({ input, ctx }) => {
        const { getAllPlatforms } = await import("./db");
        const { PlatformScraperFactory } = await import(
          "./services/platformScraper"
        );
        const { upsertPlatformCredential } = await import("./db");

        // Get platform details
        const platforms = await getAllPlatforms();
        const platform = platforms.find((p: any) => p.id === input.platformId);

        if (!platform) {
          return { success: false, message: "Platform not found" };
        }

        const connectionResult = await PlatformScraperFactory.testConnection(
          platform.name,
          {
            email: input.email,
            password: input.password,
          }
        );

        const hasAuthFlow = connectionResult.supportsAuthenticatedAutomation;
        const credentialId = await upsertPlatformCredential({
          userId: ctx.user.id,
          platformId: input.platformId,
          email: input.email,
          encryptedPassword: encryptSecret(input.password),
          isConnected: connectionResult.success ? 1 : 0,
          lastSyncAt: connectionResult.success ? new Date() : null,
          lastError: connectionResult.success ? null : connectionResult.message,
        });
        await db.recordCredentialEvent({
          userId: ctx.user.id,
          platformId: input.platformId,
          eventType: "tested",
          status: connectionResult.success
            ? "ok"
            : hasAuthFlow
              ? "error"
              : "warning",
          message: connectionResult.message,
        });

        await db.createAuditEvent({
          userId: ctx.user.id,
          entityType: "platformCredential",
          entityId: credentialId,
          action: connectionResult.success
            ? "credential.verified"
            : "credential.test_failed",
          actor: "user",
          source: "platformCredentials.testConnection",
          riskLevel: "high",
          afterState: serializeSafeJson({
            platformId: input.platformId,
            ...getEmailAuditMetadata(input.email),
            supportsAuthenticatedAutomation: hasAuthFlow,
            verified: connectionResult.success,
            status: connectionResult.success ? "connected" : "not_connected",
          }),
        });

        if (connectionResult.supportsAuthenticatedAutomation) {
          return {
            success: connectionResult.success,
            message: connectionResult.message,
          };
        }

        return {
          success: false,
          message: `${platform.name} currently supports public discovery only. Authenticated connection testing is unavailable, so credentials are not marked connected.`,
        };
      }),
  }),

  audit: router({
    getForCampaign: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          limit: z.number().int().min(1).max(500).optional(),
          riskLevel: z.enum(["low", "medium", "high"]).optional(),
          search: z.string().trim().max(200).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found",
          });
        }
        return db.getAuditEventsForCampaign(ctx.user.id, input.campaignId, {
          limit: input.limit,
          riskLevel: input.riskLevel,
          search: input.search,
        });
      }),

    getForCandidate: protectedProcedure
      .input(z.object({ candidateId: z.number() }))
      .query(async ({ input, ctx }) => {
        const candidate = await db.getCandidateById(input.candidateId);
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }
        const campaign = await db.getCampaignById(candidate.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Candidate not found",
          });
        }
        return db.getAuditEventsForEntity(
          ctx.user.id,
          "candidate",
          input.candidateId
        );
      }),

    getForMessage: protectedProcedure
      .input(z.object({ messageId: z.number() }))
      .query(async ({ input, ctx }) => {
        await getOwnedMessageOrThrow(ctx.user.id, input.messageId);
        return db.getAuditEventsForEntity(
          ctx.user.id,
          "message",
          input.messageId
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;
