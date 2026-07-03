import type { Campaign } from "../../drizzle/schema";
import * as db from "../db";
import { getOperatingLedger } from "./outreachLedger";
import { redactSecretLikeText } from "./safeSerialization";

const SENSITIVE_EXPORT_KEY_PATTERN =
  /password|passphrase|secret|token|cookie|session|api[-_]?key|authorization|credential|csrf|private[-_]?key|encryptedPassword|sessionData/i;

export async function buildCampaignLedgerExport(
  campaign: Campaign,
  userId: number,
  options: { includePersonalData?: boolean } = {}
) {
  const ledger = await getOperatingLedger(campaign, userId);
  const includePersonalData = options.includePersonalData ?? true;

  return {
    schemaVersion: 1,
    exportType: "campaign_operating_ledger",
    exportedAt: new Date().toISOString(),
    personalDataIncluded: includePersonalData,
    redaction: includePersonalData
      ? { mode: "full_acknowledged_export" }
      : {
          mode: "redacted_operational_export",
          fieldsRedacted: [
            "candidate identifiers",
            "candidate contact details",
            "profile URLs",
            "profile biography/details",
            "message bodies",
            "response bodies",
            "approval snapshots",
            "send evidence text",
            "free-text qualification reasons",
          ],
        },
    campaign: includePersonalData
      ? sanitizeRecord(ledger.campaign)
      : redactCampaignRecord(ledger.campaign),
    readiness: ledger.readiness,
    summary: ledger.summary,
    quality: ledger.quality,
    nextActions: ledger.nextActions,
    candidates: ledger.candidates.map(candidate =>
      includePersonalData
        ? sanitizeRecord(candidate)
        : redactCandidateRecord(candidate)
    ),
    messages: ledger.messages.map(message =>
      includePersonalData ? sanitizeRecord(message) : redactMessageRecord(message)
    ),
    approvals: ledger.approvals.map(approval =>
      includePersonalData
        ? sanitizeRecord(approval)
        : redactApprovalRecord(approval)
    ),
    sendAttempts: ledger.sendAttempts.map(attempt =>
      includePersonalData
        ? sanitizeRecord(attempt)
        : redactSendAttemptRecord(attempt)
    ),
    responses: ledger.responses.map(response =>
      includePersonalData
        ? sanitizeRecord(response)
        : redactResponseRecord(response)
    ),
    qualificationDecisions: ledger.qualificationDecisions.map(decision =>
      includePersonalData
        ? sanitizeRecord(decision)
        : redactQualificationDecisionRecord(decision)
    ),
    latestQualificationDecisions: ledger.latestQualificationDecisions.map(
      decision =>
        includePersonalData
          ? sanitizeRecord(decision)
          : redactQualificationDecisionRecord(decision)
    ),
    rateLimitEvents: ledger.rateLimitEvents.map(event => sanitizeRecord(event)),
    auditEvents: ledger.auditEvents.map(event => ({
      ...sanitizeRecord(event),
      beforeState: sanitizeSerializedState(event.beforeState),
      afterState: sanitizeSerializedState(event.afterState),
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
      auditEvents: ledger.auditEvents.length,
    },
  };
}

function sanitizeSerializedState(value: unknown) {
  if (typeof value !== "string") return sanitizeValue(value);
  try {
    return sanitizeValue(JSON.parse(value));
  } catch {
    return redactSecretLikeText(value);
  }
}

function sanitizeRecord<T extends Record<string, unknown>>(value: T) {
  return sanitizeValue(value) as T;
}

function redactCampaignRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    title: "[redacted]",
    description: "[redacted]",
    searchCriteria: "[redacted]",
  });
}

function redactCandidateRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    externalId: "[redacted]",
    name: "[redacted]",
    email: "[redacted]",
    phone: "[redacted]",
    profileUrl: "[redacted]",
    location: "[redacted]",
    experience: "[redacted]",
    services: "[redacted]",
    availability: "[redacted]",
    bio: "[redacted]",
    profileData: "[redacted]",
    matchReasons: "[redacted]",
  });
}

function redactMessageRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    subject: "[redacted]",
    content: "[redacted]",
    externalMessageId: "[redacted]",
    responseContent: "[redacted]",
    errorMessage: "[redacted]",
  });
}

function redactApprovalRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    decisionReason: "[redacted]",
    approvedContentSnapshot: "[redacted]",
    approvedSubjectSnapshot: "[redacted]",
  });
}

function redactSendAttemptRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    errorMessage: "[redacted]",
    externalMessageId: "[redacted]",
    confirmationText: "[redacted]",
    rateLimitState: "[redacted]",
  });
}

function redactResponseRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    rawContent: "[redacted]",
    normalizedContent: "[redacted]",
  });
}

function redactQualificationDecisionRecord(value: Record<string, unknown>) {
  return sanitizeValue({
    ...value,
    reason: "[redacted]",
  });
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactSecretLikeText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(entry => sanitizeValue(entry));
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (SENSITIVE_EXPORT_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitizeValue(entryValue);
  }
  return result;
}

export async function recordCampaignLedgerExportAudit(input: {
  userId: number;
  campaignId: number;
  counts: Record<string, number>;
  personalDataIncluded: boolean;
}) {
  return db.createAuditEvent({
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
      personalDataIncluded: input.personalDataIncluded,
      personalDataAcknowledged: input.personalDataIncluded,
      counts: input.counts,
    }),
  });
}
