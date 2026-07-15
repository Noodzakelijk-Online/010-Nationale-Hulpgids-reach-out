import type {
  Campaign,
  Candidate,
  CandidateQualificationDecision,
  CandidateResponse,
  Message,
} from "../../drizzle/schema";
import * as db from "../db";
import {
  normalizeCampaignOperationMode,
  normalizeCampaignSafetyPolicy,
} from "./campaignSafety";
import { getPlatformCapability } from "./platformCapabilities";

const contactedMessageStatuses = new Set([
  "sent",
  "delivered",
  "responded",
  "replied",
]);
const responseClassifications = [
  "interested",
  "not_interested",
  "more_info",
  "unavailable",
  "no_response",
  "unknown",
] as const;
const qualificationDecisions = [
  "qualified",
  "not_qualified",
  "needs_review",
] as const;
const STALLED_SEND_ATTEMPT_MINUTES = 30;

type ReadinessItem = {
  key: string;
  label: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
};

export type CampaignReadiness = {
  campaignId: number;
  status: "ready" | "warning" | "blocked";
  checks: ReadinessItem[];
  blockers: string[];
  warnings: string[];
};

type CampaignReadinessInputs = {
  platforms: Awaited<ReturnType<typeof db.getAllPlatforms>>;
  credentials: Awaited<ReturnType<typeof db.getUserPlatformCredentials>>;
  candidates: Candidate[];
  messages: Message[];
  approvals: Awaited<ReturnType<typeof db.getMessageApprovalsForCampaign>>;
  attempts: Awaited<ReturnType<typeof db.getMessageSendAttemptsForCampaign>>;
  rateLimitEvents: Awaited<ReturnType<typeof db.getRateLimitEventsForCampaign>>;
};

export type CampaignReadinessSharedInputs = Pick<
  CampaignReadinessInputs,
  "platforms" | "credentials"
>;

export function classifyResponse(content: string) {
  const normalized = content.toLowerCase();

  if (
    /\b(ja|zeker|interesse|interessant|graag|beschikbaar|bel|afspraak)\b/i.test(
      normalized
    )
  ) {
    return { classification: "interested" as const, confidence: 80 };
  }

  if (
    /\b(niet geinteresseerd|geen interesse|nee|stop|afmelden|niet benader)\b/i.test(
      normalized
    )
  ) {
    return { classification: "not_interested" as const, confidence: 85 };
  }

  if (
    /\b(meer informatie|info|voorwaarden|tarief|uren|wanneer|wat houdt)\b/i.test(
      normalized
    )
  ) {
    return { classification: "more_info" as const, confidence: 75 };
  }

  if (/\b(niet beschikbaar|vol|geen tijd|vakantie|ziek)\b/i.test(normalized)) {
    return { classification: "unavailable" as const, confidence: 80 };
  }

  return { classification: "unknown" as const, confidence: 35 };
}

export async function getCampaignReadiness(campaign: Campaign, userId: number) {
  return buildCampaignReadiness(
    campaign,
    await getCampaignReadinessInputs(campaign.id, userId)
  );
}

export async function getCampaignReadinessSharedInputs(userId: number) {
  const [platforms, credentials] = await Promise.all([
    db.getAllPlatforms(),
    db.getUserPlatformCredentials(userId),
  ]);
  return { platforms, credentials };
}

async function getCampaignReadinessInputs(
  campaignId: number,
  userId: number,
  sharedInputs?: CampaignReadinessSharedInputs
) {
  const sharedInputsPromise =
    sharedInputs ?? getCampaignReadinessSharedInputs(userId);
  const [
    candidates,
    messages,
    approvals,
    attempts,
    rateLimitEvents,
  ] = await Promise.all([
    db.getCampaignCandidates(campaignId),
    db.getCampaignMessages(campaignId),
    db.getMessageApprovalsForCampaign(campaignId),
    db.getMessageSendAttemptsForCampaign(campaignId),
    db.getRateLimitEventsForCampaign(campaignId),
  ]);
  const resolvedSharedInputs = await sharedInputsPromise;
  return {
    platforms: resolvedSharedInputs.platforms,
    credentials: resolvedSharedInputs.credentials,
    candidates,
    messages,
    approvals,
    attempts,
    rateLimitEvents,
  };
}

function buildCampaignReadiness(
  campaign: Campaign,
  {
    platforms,
    credentials,
    candidates,
    messages,
    approvals,
    attempts,
    rateLimitEvents,
  }: CampaignReadinessInputs
) {

  const targetPlatformIds = parseTargetPlatformIds(campaign.targetPlatforms);
  const criteria = parseJson<Record<string, unknown>>(
    campaign.searchCriteria,
    {}
  );
  const credentialByPlatformId = new Map(
    credentials.map(credential => [credential.platformId, credential])
  );

  const checks: ReadinessItem[] = [];

  checks.push({
    key: "platforms",
    label: "Target platforms",
    status: targetPlatformIds.length > 0 ? "pass" : "blocked",
    detail:
      targetPlatformIds.length > 0
        ? `${targetPlatformIds.length} platform${targetPlatformIds.length === 1 ? "" : "s"} selected`
        : "Select at least one platform before running discovery",
  });

  checks.push({
    key: "criteria",
    label: "Search criteria",
    status: hasUsefulCriteria(criteria) ? "pass" : "warning",
    detail: hasUsefulCriteria(criteria)
      ? "Campaign has usable location/service/search criteria"
      : "Add location, services, or experience criteria to reduce noisy results",
  });

  try {
    const operationMode = normalizeCampaignOperationMode(
      criteria.operationMode
    );
    checks.push({
      key: "operation-mode",
      label: "Operation mode",
      status: "pass",
      detail:
        operationMode === "dry_run"
          ? "Dry-run mode: discovery and draft generation are allowed, but approvals and external send attempts are blocked."
          : "Reviewed outreach mode: sends remain approval-gated and require delivery evidence.",
    });
  } catch (error) {
    checks.push({
      key: "operation-mode",
      label: "Operation mode",
      status: "blocked",
      detail:
        error instanceof Error
          ? error.message
          : "Campaign operation mode is invalid",
    });
  }

  try {
    const safetyPolicy = normalizeCampaignSafetyPolicy(criteria.safetyPolicy);
    checks.push({
      key: "campaign-safety-policy",
      label: "Campaign safety policy",
      status: "pass",
      detail: `Daily send cap ${safetyPolicy.dailySendLimit}; quiet hours ${safetyPolicy.quietHoursStart}-${safetyPolicy.quietHoursEnd}`,
    });
  } catch (error) {
    checks.push({
      key: "campaign-safety-policy",
      label: "Campaign safety policy",
      status: "blocked",
      detail:
        error instanceof Error
          ? error.message
          : "Campaign safety policy is invalid",
    });
  }

  const missingCredentials = targetPlatformIds
    .map(id => platforms.find(platform => platform.id === id))
    .filter(Boolean)
    .filter(platform => {
      if (
        !getPlatformCapability(platform!.name).supportsAuthenticatedAutomation
      )
        return false;
      const credential = credentialByPlatformId.get(platform!.id);
      return (
        !credential || credential.isConnected !== 1 || !!credential.lastError
      );
    });

  const publicOnlyPlatforms = targetPlatformIds
    .map(id => platforms.find(platform => platform.id === id))
    .filter(Boolean)
    .filter(
      platform =>
        !getPlatformCapability(platform!.name).supportsAuthenticatedAutomation
    );

  checks.push({
    key: "credentials",
    label: "Platform credentials",
    status: missingCredentials.length === 0 ? "pass" : "blocked",
    detail:
      missingCredentials.length === 0
        ? publicOnlyPlatforms.length > 0
          ? "Authenticated platforms are verified; public-only platforms can run discovery without credentials"
          : "Selected platforms have verified credentials"
        : `${missingCredentials.map(platform => platform!.name).join(", ")} need verified credentials before authenticated automation can run`,
  });

  const queuedMessages = messages.filter(
    message => message.status === "queued"
  );
  const approvedMessages = messages.filter(
    message => message.status === "approved"
  );
  const approvalIds = new Set(
    approvals
      .filter(approval => approval.decision === "approved")
      .map(approval => approval.messageId)
  );
  const approvedWithoutRecord = approvedMessages.filter(
    message => !approvalIds.has(message.id)
  );

  checks.push({
    key: "approval-gate",
    label: "Approval gate",
    status: approvedWithoutRecord.length === 0 ? "pass" : "warning",
    detail:
      queuedMessages.length > 0
        ? `${queuedMessages.length} message${queuedMessages.length === 1 ? "" : "s"} still require review`
        : approvedMessages.length > 0
          ? `${approvedMessages.length} approved message${approvedMessages.length === 1 ? "" : "s"} ready`
          : "No queued or approved messages yet",
  });

  const failedAttempts = attempts.filter(
    attempt => attempt.status === "failed" || attempt.status === "blocked"
  );
  const successfulAttemptsMissingEvidence =
    getSuccessfulAttemptsMissingEvidence(attempts);
  const stalledStartedAttempts = getStalledSendAttempts(attempts);
  checks.push({
    key: "send-attempts",
    label: "Send attempt health",
    status: failedAttempts.length === 0 ? "pass" : "warning",
    detail:
      failedAttempts.length === 0
        ? "No failed or blocked send attempts recorded"
        : `${failedAttempts.length} send attempt${failedAttempts.length === 1 ? "" : "s"} need review`,
  });
  checks.push({
    key: "delivery-evidence",
    label: "Delivery evidence",
    status:
      successfulAttemptsMissingEvidence.length > 0
        ? "blocked"
        : stalledStartedAttempts.length > 0
          ? "warning"
          : "pass",
    detail:
      successfulAttemptsMissingEvidence.length > 0
        ? `${successfulAttemptsMissingEvidence.length} successful send attempt${successfulAttemptsMissingEvidence.length === 1 ? "" : "s"} lack deterministic delivery evidence. Review before continuing outreach.`
        : stalledStartedAttempts.length > 0
          ? `${stalledStartedAttempts.length} send attempt${stalledStartedAttempts.length === 1 ? "" : "s"} have been started for more than ${STALLED_SEND_ATTEMPT_MINUTES} minutes without completion. Confirm, fail, or retry manually.`
          : "Successful sends have delivery evidence and no started attempts are stalled",
  });

  const recentRateLimitEvents = rateLimitEvents.filter(event => {
    return Date.now() - new Date(event.createdAt).getTime() < 60 * 60 * 1000;
  });
  const recentBlockedRateLimits = recentRateLimitEvents.filter(
    event => event.severity === "blocked"
  );

  checks.push({
    key: "rate-limit-safety",
    label: "Platform rate limits",
    status:
      recentBlockedRateLimits.length > 0
        ? "blocked"
        : recentRateLimitEvents.length > 0
          ? "warning"
          : "pass",
    detail:
      recentBlockedRateLimits.length > 0
        ? `${recentBlockedRateLimits.length} platform rate-limit block${recentBlockedRateLimits.length === 1 ? "" : "s"} in the last hour. Pause sending until the platform window resets.`
        : recentRateLimitEvents.length > 0
          ? `${recentRateLimitEvents.length} platform rate-limit warning${recentRateLimitEvents.length === 1 ? "" : "s"} in the last hour`
          : "No recent platform rate-limit blocks recorded",
  });

  const blockers = checks
    .filter(check => check.status === "blocked")
    .map(check => check.detail);
  const warnings = checks
    .filter(check => check.status === "warning")
    .map(check => check.detail);
  const status =
    blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    campaignId: campaign.id,
    status,
    checks,
    blockers,
    warnings,
  } satisfies CampaignReadiness;
}

export async function recordReadinessSnapshot(
  campaign: Campaign,
  userId: number
) {
  const readiness = await getCampaignReadiness(campaign, userId);
  await db.recordCampaignReadinessCheck({
    campaignId: campaign.id,
    userId,
    status: readiness.status,
    checksJson: JSON.stringify(readiness.checks),
    blockersJson: JSON.stringify(readiness.blockers),
    warningsJson: JSON.stringify(readiness.warnings),
  });
  return readiness;
}

export async function getOperatingLedger(campaign: Campaign, userId: number) {
  const [
    platforms,
    credentials,
    candidates,
    messages,
    approvals,
    attempts,
    responses,
    qualificationDecisionRecords,
    auditEvents,
    rateLimitEvents,
  ] = await Promise.all([
    db.getAllPlatforms(),
    db.getUserPlatformCredentials(userId),
    db.getCampaignCandidates(campaign.id),
    db.getCampaignMessages(campaign.id),
    db.getMessageApprovalsForCampaign(campaign.id),
    db.getMessageSendAttemptsForCampaign(campaign.id),
    db.getCandidateResponsesForCampaign(campaign.id),
    db.getCandidateQualificationDecisionsForCampaign(campaign.id),
    db.getAuditEventsForCampaign(userId, campaign.id),
    db.getRateLimitEventsForCampaign(campaign.id),
  ]);
  const latestQualificationDecisions =
    getLatestQualificationDecisionsByCandidate(qualificationDecisionRecords);
  const readiness = buildCampaignReadiness(campaign, {
    platforms,
    credentials,
    candidates,
    messages,
    approvals,
    attempts,
    rateLimitEvents,
  });

  return {
    campaign,
    readiness,
    summary: summarizeLedger(
      candidates,
      messages,
      approvals,
      attempts,
      responses,
      latestQualificationDecisions
    ),
    quality: summarizeQuality(
      candidates,
      messages,
      attempts,
      responses,
      latestQualificationDecisions
    ),
    candidates,
    messages,
    approvals,
    sendAttempts: attempts,
    responses,
    qualificationDecisions: qualificationDecisionRecords,
    latestQualificationDecisions: Array.from(
      latestQualificationDecisions.values()
    ),
    auditEvents,
    rateLimitEvents,
    nextActions: buildNextActions(
      readiness,
      candidates,
      messages,
      attempts,
      responses,
      latestQualificationDecisions
    ),
  };
}

export async function getOperatingSummary(
  campaign: Campaign,
  userId: number,
  sharedInputs?: CampaignReadinessSharedInputs
) {
  const sharedInputsPromise =
    sharedInputs ?? getCampaignReadinessSharedInputs(userId);
  const [
    candidates,
    messages,
    approvals,
    attempts,
    responses,
    qualificationDecisionRecords,
    rateLimitEvents,
  ] = await Promise.all([
    db.getCampaignCandidates(campaign.id),
    db.getCampaignMessages(campaign.id),
    db.getMessageApprovalsForCampaign(campaign.id),
    db.getMessageSendAttemptsForCampaign(campaign.id),
    db.getCandidateResponsesForCampaign(campaign.id),
    db.getCandidateQualificationDecisionsForCampaign(campaign.id),
    db.getRateLimitEventsForCampaign(campaign.id),
  ]);
  const latestQualificationDecisions =
    getLatestQualificationDecisionsByCandidate(qualificationDecisionRecords);
  const resolvedSharedInputs = await sharedInputsPromise;
  const readiness = buildCampaignReadiness(campaign, {
    platforms: resolvedSharedInputs.platforms,
    credentials: resolvedSharedInputs.credentials,
    candidates,
    messages,
    approvals,
    attempts,
    rateLimitEvents,
  });

  return {
    campaignId: campaign.id,
    readiness,
    summary: summarizeLedger(
      candidates,
      messages,
      approvals,
      attempts,
      responses,
      latestQualificationDecisions
    ),
    nextActions: buildNextActions(
      readiness,
      candidates,
      messages,
      attempts,
      responses,
      latestQualificationDecisions
    ).slice(0, 3),
  };
}

function summarizeQuality(
  candidates: Candidate[],
  messages: Message[],
  attempts: Awaited<ReturnType<typeof db.getMessageSendAttemptsForCampaign>>,
  responses: CandidateResponse[],
  latestQualificationDecisions: Map<number, CandidateQualificationDecision>
) {
  const contactedMessages = messages.filter(message =>
    contactedMessageStatuses.has(message.status)
  );
  const respondedMessageIds = new Set(
    responses
      .map(response => response.messageId)
      .filter((messageId): messageId is number => typeof messageId === "number")
  );
  const sentOrDeliveredMessages = messages.filter(message =>
    ["sent", "delivered"].includes(message.status)
  );
  const pendingResponses = sentOrDeliveredMessages.filter(
    message => !respondedMessageIds.has(message.id)
  ).length;
  const classificationBreakdown = Object.fromEntries(
    responseClassifications.map(classification => [
      classification,
      responses.filter(response => response.classification === classification)
        .length,
    ])
  ) as Record<(typeof responseClassifications)[number], number>;
  const rejectionBreakdown = {
    notInterested: classificationBreakdown.not_interested,
    unavailable: classificationBreakdown.unavailable,
    noResponse: classificationBreakdown.no_response,
  };
  const totalRejections =
    rejectionBreakdown.notInterested +
    rejectionBreakdown.unavailable +
    rejectionBreakdown.noResponse;
  const succeededAttempts = attempts.filter(
    attempt => attempt.status === "succeeded"
  );
  const attemptsWithEvidence = succeededAttempts.filter(
    attempt =>
      Boolean(attempt.externalMessageId) || Boolean(attempt.confirmationText)
  ).length;
  const responseTimesHours = responses
    .map(response => {
      if (!response.messageId) return null;
      const message = messages.find(entry => entry.id === response.messageId);
      if (!message?.sentAt || !response.receivedAt) return null;
      const diffMs =
        new Date(response.receivedAt).getTime() -
        new Date(message.sentAt).getTime();
      return diffMs >= 0 ? diffMs / (1000 * 60 * 60) : null;
    })
    .filter((value): value is number => typeof value === "number");
  const averageResponseTimeHours =
    responseTimesHours.length > 0
      ? roundToOneDecimal(
          responseTimesHours.reduce((total, value) => total + value, 0) /
            responseTimesHours.length
        )
      : null;
  const qualificationBreakdown = summarizeQualifications(
    candidates,
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
      attempt => attempt.status === "failed" || attempt.status === "blocked"
    ).length,
    deliveryEvidenceRate: percentage(
      attemptsWithEvidence,
      succeededAttempts.length
    ),
    averageResponseTimeHours,
    qualificationBreakdown,
    qualifiedCandidates: qualificationBreakdown.qualified,
    candidatesNeedingQualificationReview:
      qualificationBreakdown.needs_review +
      qualificationBreakdown.awaiting_decision,
  };
}

function summarizeLedger(
  candidates: Candidate[],
  messages: Message[],
  approvals: Awaited<ReturnType<typeof db.getMessageApprovalsForCampaign>>,
  attempts: Awaited<ReturnType<typeof db.getMessageSendAttemptsForCampaign>>,
  responses: Awaited<ReturnType<typeof db.getCandidateResponsesForCampaign>>,
  latestQualificationDecisions: Map<number, CandidateQualificationDecision>
) {
  const qualificationBreakdown = summarizeQualifications(
    candidates,
    latestQualificationDecisions
  );
  return {
    candidatesDiscovered: candidates.length,
    candidatesAboveThreshold: candidates.filter(
      candidate => candidate.compatibilityScore >= 70
    ).length,
    messagesDrafted: messages.length,
    messagesQueued: messages.filter(message => message.status === "queued")
      .length,
    messagesApproved: messages.filter(message => message.status === "approved")
      .length,
    messagesSent: messages.filter(message =>
      contactedMessageStatuses.has(message.status)
    ).length,
    approvalsApproved: approvals.filter(
      approval => approval.decision === "approved"
    ).length,
    approvalsRejected: approvals.filter(
      approval => approval.decision === "rejected"
    ).length,
    sendAttemptsFailed: attempts.filter(
      attempt => attempt.status === "failed" || attempt.status === "blocked"
    ).length,
    responsesReceived: responses.length,
    candidatesQualified: qualificationBreakdown.qualified,
    candidatesNotQualified: qualificationBreakdown.not_qualified,
    candidatesNeedsReview: qualificationBreakdown.needs_review,
    candidatesAwaitingQualification: qualificationBreakdown.awaiting_decision,
    followUpsDue: messages.filter(message => {
      if (!message.sentAt || ["responded", "replied"].includes(message.status))
        return false;
      return (
        Date.now() - new Date(message.sentAt).getTime() >
        5 * 24 * 60 * 60 * 1000
      );
    }).length,
  };
}

function getLatestQualificationDecisionsByCandidate(
  decisions: CandidateQualificationDecision[]
) {
  const latest = new Map<number, CandidateQualificationDecision>();
  for (const decision of decisions) {
    const existing = latest.get(decision.candidateId);
    if (
      !existing ||
      new Date(decision.createdAt).getTime() >
        new Date(existing.createdAt).getTime()
    ) {
      latest.set(decision.candidateId, decision);
    }
  }
  return latest;
}

function summarizeQualifications(
  candidates: Candidate[],
  latestQualificationDecisions: Map<number, CandidateQualificationDecision>
) {
  const breakdown = {
    qualified: 0,
    not_qualified: 0,
    needs_review: 0,
    awaiting_decision: 0,
  };

  candidates.forEach(candidate => {
    const latestDecision = latestQualificationDecisions.get(candidate.id);
    if (!latestDecision) {
      breakdown.awaiting_decision += 1;
      return;
    }
    breakdown[latestDecision.decision] += 1;
  });

  return breakdown;
}

function percentage(part: number, total: number) {
  return total > 0 ? roundToOneDecimal((part / total) * 100) : 0;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function buildNextActions(
  readiness: CampaignReadiness,
  candidates: Candidate[],
  messages: Message[],
  attempts: Awaited<ReturnType<typeof db.getMessageSendAttemptsForCampaign>>,
  responses: Awaited<ReturnType<typeof db.getCandidateResponsesForCampaign>>,
  latestQualificationDecisions: Map<number, CandidateQualificationDecision>
) {
  const actions: Array<{
    priority: "high" | "medium" | "low";
    label: string;
    detail: string;
  }> = [];

  readiness.blockers.forEach(blocker => {
    actions.push({ priority: "high", label: "Fix blocker", detail: blocker });
  });

  const queued = messages.filter(message => message.status === "queued").length;
  if (queued > 0) {
    actions.push({
      priority: "medium",
      label: "Review messages",
      detail: `${queued} queued message${queued === 1 ? "" : "s"} need approval or rejection`,
    });
  }

  const qualificationBreakdown = summarizeQualifications(
    candidates,
    latestQualificationDecisions
  );
  const qualificationReviewCount =
    qualificationBreakdown.awaiting_decision +
    qualificationBreakdown.needs_review;
  if (qualificationReviewCount > 0) {
    actions.push({
      priority: "medium",
      label: "Review candidate qualification",
      detail: `${qualificationReviewCount} candidate${qualificationReviewCount === 1 ? "" : "s"} need a current qualification decision`,
    });
  }

  const failed = attempts.filter(
    attempt => attempt.status === "failed" || attempt.status === "blocked"
  ).length;
  if (failed > 0) {
    actions.push({
      priority: "medium",
      label: "Review send failures",
      detail: `${failed} send attempt${failed === 1 ? "" : "s"} failed or were blocked`,
    });
  }

  const missingEvidence = getSuccessfulAttemptsMissingEvidence(attempts).length;
  if (missingEvidence > 0) {
    actions.push({
      priority: "high",
      label: "Review delivery evidence",
      detail: `${missingEvidence} successful send attempt${missingEvidence === 1 ? "" : "s"} lack deterministic delivery evidence`,
    });
  }

  const stalledAttempts = getStalledSendAttempts(attempts).length;
  if (stalledAttempts > 0) {
    actions.push({
      priority: "medium",
      label: "Resolve started send attempts",
      detail: `${stalledAttempts} send attempt${stalledAttempts === 1 ? "" : "s"} have been open for more than ${STALLED_SEND_ATTEMPT_MINUTES} minutes`,
    });
  }

  if (
    readiness.checks.some(
      check => check.key === "rate-limit-safety" && check.status === "blocked"
    )
  ) {
    actions.push({
      priority: "high",
      label: "Pause sending",
      detail:
        "A platform rate-limit block was recorded recently. Wait for the platform window to reset before recording more sends.",
    });
  }

  const needsClassification = responses.filter(
    response => response.classification === "unknown"
  ).length;
  if (needsClassification > 0) {
    actions.push({
      priority: "low",
      label: "Classify responses",
      detail: `${needsClassification} response${needsClassification === 1 ? "" : "s"} need review`,
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: "low",
      label: "No immediate blockers",
      detail: "Campaign ledger is currently clear",
    });
  }

  return actions;
}

function getSuccessfulAttemptsMissingEvidence(
  attempts: Awaited<ReturnType<typeof db.getMessageSendAttemptsForCampaign>>
) {
  return attempts.filter(
    attempt => attempt.status === "succeeded" && !hasDeliveryEvidence(attempt)
  );
}

function getStalledSendAttempts(
  attempts: Awaited<ReturnType<typeof db.getMessageSendAttemptsForCampaign>>
) {
  const cutoff = Date.now() - STALLED_SEND_ATTEMPT_MINUTES * 60 * 1000;
  return attempts.filter(attempt => {
    if (attempt.status !== "started" || attempt.finishedAt) return false;
    return new Date(attempt.startedAt).getTime() < cutoff;
  });
}

function hasDeliveryEvidence(attempt: {
  externalMessageId?: string | null;
  confirmationText?: string | null;
}) {
  return Boolean(
    attempt.externalMessageId?.trim() || attempt.confirmationText?.trim()
  );
}

function parseTargetPlatformIds(value: string) {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((id): id is number => typeof id === "number")
    : [];
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hasUsefulCriteria(criteria: Record<string, unknown>) {
  return ["location", "services", "experience", "keywords"].some(key => {
    const value = criteria[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}
