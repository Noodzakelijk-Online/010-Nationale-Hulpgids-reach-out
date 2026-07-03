import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock context with admin user
const mockAdminContext: TrpcContext = {
  user: {
    id: 1,
    openId: "test-admin-openid",
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    loginMethod: null,
  },
};

const mockOtherUserContext: TrpcContext = {
  user: {
    id: 2,
    openId: "test-other-openid",
    name: "Other User",
    email: "other@test.com",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    loginMethod: null,
  },
};

let isolatedUserId = 10_000;
function createIsolatedContext(label: string): TrpcContext {
  isolatedUserId += 1;
  return {
    user: {
      id: isolatedUserId,
      openId: `test-${label}-${isolatedUserId}`,
      name: `Test ${label}`,
      email: `${label}-${isolatedUserId}@test.com`,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      loginMethod: null,
    },
  };
}

beforeEach(async () => {
  const { resetApiLimit } = await import("./services/rateLimiter");
  await resetApiLimit(mockAdminContext.user.id);
  await resetApiLimit(mockOtherUserContext.user.id);
});

async function getPlatformId(name: string) {
  const platform = await db.getPlatformByName(name);
  if (!platform) throw new Error(`Missing test platform: ${name}`);
  return platform.id;
}

describe("Message Snippets", () => {
  it("should create and list only user-owned reusable snippets", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const uniqueBody = `Noem rustige kennismaking ${Date.now()}`;

    const created = await caller.messageSnippets.create({
      title: "Rustige kennismaking",
      body: uniqueBody,
      language: "nl",
      tonePreset: "careful",
    });

    expect(created.success).toBe(true);
    expect(created.snippet?.id).toBeGreaterThan(0);
    expect(created.snippet?.body).toBe(uniqueBody);

    const snippets = await caller.messageSnippets.list();
    expect(snippets.some(snippet => snippet.id === created.snippet?.id)).toBe(
      true
    );

    const otherSnippets = await otherCaller.messageSnippets.list();
    expect(
      otherSnippets.some(snippet => snippet.id === created.snippet?.id)
    ).toBe(false);
  });

  it("should audit snippet changes without storing reusable body text", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const secretLikeBody = `Mention avondzorg ${Date.now()} token=abc123`;

    const created = await caller.messageSnippets.create({
      title: "Audit redaction check",
      body: secretLikeBody,
      language: "nl",
      tonePreset: "warm",
    });

    const auditEvents = await db.getAuditEventsForEntity(
      mockAdminContext.user.id,
      "message_snippet",
      created.snippet!.id
    );
    const createdAudit = auditEvents.find(
      event => event.action === "message_snippet.created"
    );

    expect(createdAudit).toBeDefined();
    expect(createdAudit?.afterState).toContain('"bodyLength"');
    expect(createdAudit?.afterState).toContain('"tonePreset":"warm"');
    expect(createdAudit?.afterState).not.toContain(secretLikeBody);
    expect(createdAudit?.afterState).not.toContain("token=abc123");
  });

  it("should archive snippets without exposing them to other users", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);

    const created = await caller.messageSnippets.create({
      title: "Archive me",
      body: "Vraag of een kort telefonisch overleg past.",
      language: "nl",
      tonePreset: "concise",
    });

    await expect(
      otherCaller.messageSnippets.archive({ id: created.snippet!.id })
    ).rejects.toThrow(/not found/i);

    await caller.messageSnippets.archive({ id: created.snippet!.id });
    const snippets = await caller.messageSnippets.list();

    expect(snippets.some(snippet => snippet.id === created.snippet?.id)).toBe(
      false
    );
  });
});

describe("Message Management Features", () => {
  let testCampaignId: number;
  let testCandidateId: number;
  let testMessageId: number;

  beforeAll(async () => {
    // Create a test campaign
    const campaignResult = await appRouter
      .createCaller(mockAdminContext)
      .campaigns.create({
        title: "Test Campaign for Messages",
        description: "Testing message management",
        targetPlatforms: JSON.stringify([1]),
        searchCriteria: JSON.stringify({ location: "Test City" }),
      });
    testCampaignId = campaignResult.id;

    testCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: "Ledger Test Candidate",
      email: "ledger-test@example.com",
      location: "Arnhem",
      compatibilityScore: 82,
      status: "matched",
    });

    testMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: testCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "queued",
    });
  });

  it("should list all messages with filters", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    // Test listing all messages
    const allMessages = await caller.messages.listAll({
      status: undefined,
      campaignId: undefined,
    });

    expect(Array.isArray(allMessages)).toBe(true);
  });

  it("should filter messages by status", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    // Test filtering by queued status
    const queuedMessages = await caller.messages.listAll({
      status: "queued",
      campaignId: undefined,
    });

    expect(Array.isArray(queuedMessages)).toBe(true);
    // All returned messages should have queued status
    queuedMessages.forEach((msg: any) => {
      if (msg.status) {
        expect(msg.status).toBe("queued");
      }
    });
  });

  it("should filter messages by campaign", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    // Test filtering by campaign
    const campaignMessages = await caller.messages.listAll({
      status: undefined,
      campaignId: testCampaignId,
    });

    expect(Array.isArray(campaignMessages)).toBe(true);
    // All returned messages should belong to the test campaign
    campaignMessages.forEach((msg: any) => {
      if (msg.campaignId) {
        expect(msg.campaignId).toBe(testCampaignId);
      }
    });
  });

  it("should get engagement metrics for a campaign", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const metrics = await caller.campaigns.getEngagementMetrics({
      campaignId: testCampaignId,
    });

    expect(metrics).toBeDefined();
    expect(typeof metrics.totalSent).toBe("number");
    expect(typeof metrics.totalReplied).toBe("number");
    expect(typeof metrics.totalPending).toBe("number");
    expect(typeof metrics.responseRate).toBe("number");
    expect(["up", "down", "stable"]).toContain(metrics.trend);

    // Response rate should be between 0 and 100
    expect(metrics.responseRate).toBeGreaterThanOrEqual(0);
    expect(metrics.responseRate).toBeLessThanOrEqual(100);
  });

  it("should calculate correct response rate", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const metrics = await caller.campaigns.getEngagementMetrics({
      campaignId: testCampaignId,
    });

    // If there are sent messages, verify the math
    if (metrics.totalSent > 0) {
      const expectedRate = (metrics.totalReplied / metrics.totalSent) * 100;
      expect(metrics.responseRate).toBeCloseTo(expectedRate, 2);
    } else {
      expect(metrics.responseRate).toBe(0);
    }
  });

  it("should calculate campaign readiness", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const readiness = await caller.campaigns.getReadiness({
      campaignId: testCampaignId,
    });

    expect(readiness.campaignId).toBe(testCampaignId);
    expect(["ready", "warning", "blocked"]).toContain(readiness.status);
    expect(readiness.checks.length).toBeGreaterThan(0);
  });

  it("should surface delivery evidence and stalled send-attempt gaps in readiness", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const platformId = await getPlatformId("Indeed");
    const campaign = await caller.campaigns.create({
      title: `Delivery Evidence Readiness ${Date.now()}`,
      description: "Readiness should show incomplete delivery records",
      targetPlatforms: JSON.stringify([platformId]),
      searchCriteria: JSON.stringify({ location: "Utrecht" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId,
      name: `Evidence Gap Candidate ${Date.now()}`,
      email: `evidence-gap-${Date.now()}@example.com`,
      location: "Utrecht",
      compatibilityScore: 82,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId,
      subject: "Delivery evidence check",
      content: "This record simulates legacy delivery state.",
      language: "nl",
      status: "approved",
    });

    await db.createMessageSendAttempt({
      campaignId: campaign.id,
      candidateId,
      messageId,
      platformId,
      status: "succeeded",
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 55 * 60 * 1000),
    });
    await db.createMessageSendAttempt({
      campaignId: campaign.id,
      candidateId,
      messageId,
      platformId,
      status: "started",
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const readiness = await caller.campaigns.getReadiness({
      campaignId: campaign.id,
    });
    const deliveryEvidenceCheck = readiness.checks.find(
      check => check.key === "delivery-evidence"
    );
    expect(deliveryEvidenceCheck?.status).toBe("blocked");
    expect(deliveryEvidenceCheck?.detail).toMatch(/lack deterministic/i);

    const ledger = await caller.campaigns.getOperatingLedger({
      campaignId: campaign.id,
    });
    expect(
      ledger.nextActions.some(
        (action: any) => action.label === "Review delivery evidence"
      )
    ).toBe(true);
    expect(
      ledger.nextActions.some(
        (action: any) => action.label === "Resolve started send attempts"
      )
    ).toBe(true);
  });

  it("should list compact operating summaries for dashboard views", async () => {
    const context = createIsolatedContext("compact-operating-summary");
    const caller = appRouter.createCaller(context);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Compact Summary ${suffix}`,
      description: "Dashboard list summaries should avoid full ledger payloads",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Compact Candidate ${suffix}`,
      email: `compact-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 91,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: 1,
      subject: "Compact summary",
      content: "Dit concept wacht op review.",
      language: "nl",
      status: "queued",
    });
    await db.createCandidateResponse({
      candidateId,
      messageId,
      platformId: 1,
      rawContent: "Graag meer informatie.",
      normalizedContent: "graag meer informatie",
      classification: "more_info",
      confidence: 80,
      source: "manual",
      receivedAt: new Date(),
    });

    const summaries = await caller.campaigns.listOperatingSummaries();
    const summary = summaries.find(item => item.campaignId === campaign.id);

    expect(summary).toBeDefined();
    expect(summary?.summary.candidatesDiscovered).toBe(1);
    expect(summary?.summary.messagesQueued).toBe(1);
    expect(summary?.summary.responsesReceived).toBe(1);
    expect(summary?.readiness.campaignId).toBe(campaign.id);
    expect(summary?.nextActions.length).toBeLessThanOrEqual(3);
    expect((summary as any).auditEvents).toBeUndefined();
    expect((summary as any).messages).toBeUndefined();
    expect((summary as any).candidates).toBeUndefined();
  });

  it("should archive campaigns without deleting ledger records", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const archivedCampaign = await caller.campaigns.create({
      title: `Archive Safety ${Date.now()}`,
      description: "Archive should preserve outreach ledger data",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: archivedCampaign.id,
      platformId: 1,
      name: "Archive Safety Candidate",
      email: "archive-safety@example.com",
      location: "Arnhem",
      compatibilityScore: 86,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: archivedCampaign.id,
      candidateId,
      platformId: 1,
      subject: "Archive safety",
      content: "Dit bericht moet bewaard blijven na archiveren.",
      language: "nl",
      status: "queued",
    });
    const followUpId = await db.createFollowUp({
      campaignId: archivedCampaign.id,
      candidateId,
      sequence: 1,
      scheduledAt: new Date(Date.now() - 60_000),
      status: "scheduled",
      messageId,
    });
    await db.createAuditEvent({
      userId: mockAdminContext.user.id,
      entityType: "message",
      entityId: messageId,
      campaignId: archivedCampaign.id,
      action: "message.queued",
      actor: "system",
      source: "test",
      riskLevel: "low",
    });

    await caller.campaigns.delete({ id: archivedCampaign.id });

    const campaign = await db.getCampaignById(archivedCampaign.id);
    const candidates = await db.getCampaignCandidates(archivedCampaign.id);
    const messages = await db.getCampaignMessages(archivedCampaign.id);
    const auditEvents = await db.getAuditEventsForCampaign(
      mockAdminContext.user.id,
      archivedCampaign.id
    );

    expect(campaign?.status).toBe("archived");
    expect(campaign?.isScheduled).toBe(0);
    expect(campaign?.nextExecutionAt).toBeNull();
    const followUps = await db.getFollowUpsForCandidate(candidateId);
    expect(followUps.find(followUp => followUp.id === followUpId)?.status).toBe(
      "cancelled"
    );
    const dueFollowUps = await caller.followUps.getDue();
    expect(
      dueFollowUps.some((followUp: any) => followUp.id === followUpId)
    ).toBe(false);
    expect(candidates.some(candidate => candidate.id === candidateId)).toBe(
      true
    );
    expect(messages.some(message => message.id === messageId)).toBe(true);
    expect(auditEvents.some(event => event.action === "message.queued")).toBe(
      true
    );
    expect(
      auditEvents.some(event => event.action === "campaign.archived")
    ).toBe(true);
  });

  it("should freeze outreach actions for archived campaigns", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Archived Freeze ${suffix}`,
      description:
        "Archived campaigns should keep their ledger but block outreach",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        operationMode: "reviewed_outreach",
      }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Archived Freeze Candidate ${suffix}`,
      email: `archived-freeze-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 91,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: 1,
      subject: "Archived freeze",
      content: "Dit bericht mag na archiveren niet verder worden verwerkt.",
      language: "nl",
      status: "queued",
    });
    const followUpId = await db.createFollowUp({
      campaignId: campaign.id,
      candidateId,
      sequence: 1,
      scheduledAt: new Date(Date.now() - 60_000),
      status: "scheduled",
      messageId,
    });

    await caller.campaigns.delete({ id: campaign.id });

    await expect(
      caller.candidates.discover({
        campaignId: campaign.id,
        platforms: ["Indeed"],
        searchCriteria: { location: "Arnhem" },
      })
    ).rejects.toThrow(/archived/i);
    await expect(
      caller.messages.bulkOutreach({ campaignId: campaign.id })
    ).rejects.toThrow(/archived/i);
    await expect(caller.messages.approve({ messageId })).rejects.toThrow(
      /archived/i
    );
    await expect(caller.messages.reject({ messageId })).rejects.toThrow(
      /archived/i
    );
    await expect(
      caller.messages.updateStatus({ messageId, status: "approved" })
    ).rejects.toThrow(/archived/i);
    await expect(
      caller.messages.bulkUpdateStatus({
        messageIds: [messageId],
        status: "approved",
        complianceAcknowledged: true,
      })
    ).rejects.toThrow(/archived/i);
    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        confirmationText:
          "Platform confirmation shows the message was submitted.",
      })
    ).rejects.toThrow(/archived/i);
    await expect(
      caller.followUps.prepare({
        candidateId,
        subject: "Archived follow-up",
        content: "Deze opvolging mag niet worden voorbereid.",
      })
    ).rejects.toThrow(/archived/i);
    await expect(caller.followUps.approve({ followUpId })).rejects.toThrow(
      /archived/i
    );

    const followUps = await db.getFollowUpsForCandidate(candidateId);
    expect(followUps.find(followUp => followUp.id === followUpId)?.status).toBe(
      "cancelled"
    );
    const attempts = await db.getMessageSendAttemptsForCampaign(campaign.id);
    expect(
      attempts.some(
        attempt =>
          attempt.status === "blocked" &&
          attempt.errorMessage?.includes("campaign is archived")
      )
    ).toBe(true);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });
    expect(
      auditEvents.some(
        (event: any) => event.action === "campaign.discovery_blocked_archived"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) =>
          event.action === "message.approval_blocked_archived_campaign"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) =>
          event.action === "message.send_blocked_archived_campaign"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) =>
          event.action === "follow_up.prepare_blocked_archived_campaign"
      )
    ).toBe(true);
  });

  it("should block cross-user campaign archiving", async () => {
    const adminCaller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const campaign = await adminCaller.campaigns.create({
      title: `Archive Ownership ${Date.now()}`,
      description: "Other users cannot archive this campaign",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });

    await expect(
      otherCaller.campaigns.delete({ id: campaign.id })
    ).rejects.toThrow(/permission|archive/i);

    const unchanged = await db.getCampaignById(campaign.id);
    expect(unchanged?.status).not.toBe("archived");
  });

  it("should export campaign ledger only with acknowledgement and audit", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Ledger Export ${suffix}`,
      description: "Export should include operating ledger data",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Ledger Export Candidate ${suffix}`,
      email: `ledger-export-${suffix}@example.com`,
      phone: "+31612345678",
      location: "Arnhem",
      compatibilityScore: 88,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: 1,
      subject: "Ledger export",
      content: "Dit bericht hoort in de geacknowledgde export.",
      language: "nl",
      status: "queued",
    });
    const qualificationDecisionId =
      await db.createCandidateQualificationDecision({
        campaignId: campaign.id,
        candidateId,
        userId: mockAdminContext.user.id,
        decision: "needs_review",
        reason: "Export should include candidate qualification state.",
        sensitiveAssumptionsAcknowledged: 0,
      });
    await db.createAuditEvent({
      userId: mockAdminContext.user.id,
      campaignId: campaign.id,
      entityType: "platformCredential",
      entityId: 123,
      action: "test.secret_state",
      actor: "system",
      source: "test",
      riskLevel: "high",
      afterState: JSON.stringify({
        encryptedPassword: "do-not-export",
        sessionData: "do-not-export",
        apiKey: "do-not-export",
        email: "allowed-in-acknowledged-export@example.com",
      }),
    });

    await expect(
      caller.campaigns.exportLedger({
        campaignId: campaign.id,
        personalDataAcknowledged: false,
      })
    ).rejects.toThrow(/personal data/i);

    const exported = await caller.campaigns.exportLedger({
      campaignId: campaign.id,
      personalDataAcknowledged: true,
    });

    expect(exported.exportType).toBe("campaign_operating_ledger");
    expect(exported.personalDataIncluded).toBe(true);
    expect(exported.campaign.id).toBe(campaign.id);
    expect(
      exported.candidates.some((entry: any) => entry.id === candidateId)
    ).toBe(true);
    expect(exported.messages.some((entry: any) => entry.id === messageId)).toBe(
      true
    );
    expect(
      exported.qualificationDecisions.some(
        (entry: any) => entry.id === qualificationDecisionId
      )
    ).toBe(true);
    expect(
      exported.latestQualificationDecisions.some(
        (entry: any) => entry.id === qualificationDecisionId
      )
    ).toBe(true);
    expect(exported.counts.candidates).toBeGreaterThanOrEqual(1);
    expect(exported.counts.messages).toBeGreaterThanOrEqual(1);
    expect(exported.counts.qualificationDecisions).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("do-not-export");
    expect(serialized).toContain("[redacted]");

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });
    expect(
      auditEvents.some(
        (event: any) => event.action === "campaign.ledger_exported"
      )
    ).toBe(true);
  });

  it("should export a redacted campaign ledger without candidate personal data", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateName = `Redacted Export Candidate ${suffix}`;
    const candidateEmail = `redacted-export-${suffix}@example.com`;
    const candidatePhone = `+316${String(suffix).slice(-8)}`;
    const messageContent =
      "Dit volledige bericht mag niet in de geredigeerde export staan.";
    const responseContent =
      "Deze persoonlijke reactie mag niet in de geredigeerde export staan.";
    const qualificationReason =
      "Relevant campaign evidence contains personal scheduling context.";
    const sendEvidence =
      "Platform confirmation includes a private profile conversation marker.";
    const campaign = await caller.campaigns.create({
      title: `Redacted Ledger Export ${suffix}`,
      description: "Redacted export should minimize personal data",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: candidateName,
      email: candidateEmail,
      phone: candidatePhone,
      profileUrl: `https://example.test/private/${suffix}`,
      location: "Arnhem",
      bio: "Private profile biography",
      compatibilityScore: 88,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: 1,
      subject: "Private outreach subject",
      content: messageContent,
      language: "nl",
      status: "approved",
    });
    await db.createMessageApproval({
      campaignId: campaign.id,
      candidateId,
      messageId,
      userId: mockAdminContext.user.id,
      decision: "approved",
      decisionReason: "Approved after private profile review",
      approvedSubjectSnapshot: "Private outreach subject",
      approvedContentSnapshot: messageContent,
      decidedAt: new Date(),
    });
    await db.createMessageSendAttempt({
      campaignId: campaign.id,
      candidateId,
      messageId,
      platformId: 1,
      status: "succeeded",
      confirmationText: sendEvidence,
      externalMessageId: `private-message-${suffix}`,
      finishedAt: new Date(),
    });
    await db.createCandidateResponse({
      candidateId,
      messageId,
      platformId: 1,
      rawContent: responseContent,
      normalizedContent: responseContent,
      classification: "more_info",
      confidence: 80,
      source: "manual",
      receivedAt: new Date(),
    });
    await db.createCandidateQualificationDecision({
      campaignId: campaign.id,
      candidateId,
      userId: mockAdminContext.user.id,
      decision: "qualified",
      reason: qualificationReason,
      sensitiveAssumptionsAcknowledged: 1,
    });

    const exported = await caller.campaigns.exportLedger({
      campaignId: campaign.id,
      includePersonalData: false,
    });

    expect(exported.personalDataIncluded).toBe(false);
    expect(exported.redaction.mode).toBe("redacted_operational_export");
    expect(exported.candidates.some((entry: any) => entry.id === candidateId))
      .toBe(true);
    expect(exported.messages.some((entry: any) => entry.id === messageId)).toBe(
      true
    );
    expect(
      exported.responses.some(
        (entry: any) => entry.classification === "more_info"
      )
    ).toBe(true);

    const serialized = JSON.stringify(exported);
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain(candidateName);
    expect(serialized).not.toContain(candidateEmail);
    expect(serialized).not.toContain(candidatePhone);
    expect(serialized).not.toContain(messageContent);
    expect(serialized).not.toContain(responseContent);
    expect(serialized).not.toContain(qualificationReason);
    expect(serialized).not.toContain(sendEvidence);
    expect(serialized).not.toContain(`private-message-${suffix}`);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });
    const exportAudit = auditEvents.find(
      (event: any) => event.action === "campaign.ledger_exported"
    );
    expect(exportAudit?.afterState).toContain('"personalDataIncluded":false');
  });

  it("should centrally redact secret-like audit state before persistence and export", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Central Audit Redaction ${suffix}`,
      description: "Audit state should be sanitized even when callers forget",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const rawSecret = `central-secret-${suffix}`;

    await db.createAuditEvent({
      userId: mockAdminContext.user.id,
      campaignId: campaign.id,
      entityType: "campaign",
      entityId: campaign.id,
      action: "test.unsanitized_audit_state",
      actor: "system",
      source: "test",
      riskLevel: "high",
      beforeState: `operator note bearer ${rawSecret}`,
      afterState: JSON.stringify({
        visible: "keep this operational note",
        nested: {
          token: rawSecret,
          note: `manual note password=${rawSecret}`,
          url: `https://example.test/callback?token=${rawSecret}&next=ok`,
        },
      }),
    });

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });
    const audit = auditEvents.find(
      (event: any) => event.action === "test.unsanitized_audit_state"
    );
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).toContain("keep this operational note");
    expect(JSON.stringify(audit)).toContain("[redacted]");
    expect(JSON.stringify(audit)).not.toContain(rawSecret);

    const exported = await caller.campaigns.exportLedger({
      campaignId: campaign.id,
      personalDataAcknowledged: true,
    });
    const serializedExport = JSON.stringify(exported);
    expect(serializedExport).toContain("keep this operational note");
    expect(serializedExport).toContain("[redacted]");
    expect(serializedExport).not.toContain(rawSecret);
  });

  it("should block cross-user campaign ledger export", async () => {
    const adminCaller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const campaign = await adminCaller.campaigns.create({
      title: `Ledger Export Ownership ${Date.now()}`,
      description: "Other users cannot export this campaign ledger",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });

    await expect(
      otherCaller.campaigns.exportLedger({
        campaignId: campaign.id,
        personalDataAcknowledged: true,
      })
    ).rejects.toThrow(/campaign not found/i);
  });

  it("should not warn for missing credentials on public-only discovery platforms", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const indeedId = await getPlatformId("Indeed");
    const publicOnlyCampaign = await caller.campaigns.create({
      title: "Public Only Discovery",
      description: "Indeed public listing discovery should not require login",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
    });

    const readiness = await caller.campaigns.getReadiness({
      campaignId: publicOnlyCampaign.id,
    });
    const credentialCheck = readiness.checks.find(
      check => check.key === "credentials"
    );

    expect(credentialCheck?.status).toBe("pass");
    expect(credentialCheck?.detail).toMatch(/public-only/i);
  });

  it("should block authenticated platform readiness when credentials are missing", async () => {
    const isolatedContext = createIsolatedContext("missing-credentials");
    const caller = appRouter.createCaller(isolatedContext);
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");
    const authenticatedCampaign = await caller.campaigns.create({
      title: "Authenticated Platform Readiness",
      description: "Nationale Hulpgids should require verified credentials",
      targetPlatforms: JSON.stringify([nationaleHulpgidsId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
    });

    const readiness = await caller.campaigns.getReadiness({
      campaignId: authenticatedCampaign.id,
    });
    const credentialCheck = readiness.checks.find(
      check => check.key === "credentials"
    );

    expect(readiness.status).toBe("blocked");
    expect(credentialCheck?.status).toBe("blocked");
    expect(credentialCheck?.detail).toMatch(/verified credentials/i);
  });

  it("should include campaign quality metrics in the operating ledger", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const indeedId = await getPlatformId("Indeed");
    const timestamp = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Quality Metrics Campaign ${timestamp}`,
      description: "Quality metrics test campaign",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
    });
    const [interestedCandidateId, pendingCandidateId, declinedCandidateId] =
      await Promise.all([
        db.createCandidate({
          campaignId: campaign.id,
          platformId: indeedId,
          name: `Interested Candidate ${timestamp}`,
          location: "Arnhem",
          compatibilityScore: 91,
          status: "matched",
        }),
        db.createCandidate({
          campaignId: campaign.id,
          platformId: indeedId,
          name: `Pending Candidate ${timestamp}`,
          location: "Arnhem",
          compatibilityScore: 86,
          status: "matched",
        }),
        db.createCandidate({
          campaignId: campaign.id,
          platformId: indeedId,
          name: `Declined Candidate ${timestamp}`,
          location: "Arnhem",
          compatibilityScore: 82,
          status: "matched",
        }),
      ]);
    const sentAt = new Date(timestamp - 48 * 60 * 60 * 1000);
    const deliveredAt = new Date(timestamp - 24 * 60 * 60 * 1000);
    const respondedAt = new Date(timestamp - 4 * 60 * 60 * 1000);
    await Promise.all([
      db.createCandidateQualificationDecision({
        campaignId: campaign.id,
        candidateId: interestedCandidateId,
        userId: mockAdminContext.user.id,
        decision: "needs_review",
        reason: "Older decision should not count as current.",
        sensitiveAssumptionsAcknowledged: 0,
        createdAt: new Date(timestamp - 3 * 60 * 60 * 1000),
      }),
      db.createCandidateQualificationDecision({
        campaignId: campaign.id,
        candidateId: interestedCandidateId,
        userId: mockAdminContext.user.id,
        decision: "qualified",
        reason: "Relevant campaign evidence supports qualification.",
        sensitiveAssumptionsAcknowledged: 1,
        createdAt: new Date(timestamp - 2 * 60 * 60 * 1000),
      }),
      db.createCandidateQualificationDecision({
        campaignId: campaign.id,
        candidateId: declinedCandidateId,
        userId: mockAdminContext.user.id,
        decision: "not_qualified",
        reason: "Candidate response indicates no interest.",
        sensitiveAssumptionsAcknowledged: 0,
        createdAt: new Date(timestamp - 60 * 60 * 1000),
      }),
    ]);
    const [interestedMessageId, pendingMessageId, declinedMessageId] =
      await Promise.all([
        db.createMessage({
          campaignId: campaign.id,
          candidateId: interestedCandidateId,
          platformId: indeedId,
          subject: "Kennismaking interesse",
          content: "Veilig goedgekeurd bericht.",
          language: "nl",
          status: "sent",
          sentAt,
        }),
        db.createMessage({
          campaignId: campaign.id,
          candidateId: pendingCandidateId,
          platformId: indeedId,
          subject: "Kennismaking wachtend",
          content: "Veilig goedgekeurd bericht.",
          language: "nl",
          status: "delivered",
          sentAt: deliveredAt,
        }),
        db.createMessage({
          campaignId: campaign.id,
          candidateId: declinedCandidateId,
          platformId: indeedId,
          subject: "Kennismaking reactie",
          content: "Veilig goedgekeurd bericht.",
          language: "nl",
          status: "responded",
          sentAt: respondedAt,
          respondedAt: new Date(timestamp - 60 * 60 * 1000),
        }),
      ]);

    await Promise.all([
      db.createCandidateResponse({
        candidateId: interestedCandidateId,
        messageId: interestedMessageId,
        platformId: indeedId,
        rawContent: "Ja, ik heb interesse.",
        normalizedContent: "Ja, ik heb interesse.",
        classification: "interested",
        confidence: 90,
        receivedAt: new Date(timestamp - 24 * 60 * 60 * 1000),
        source: "manual",
      }),
      db.createCandidateResponse({
        candidateId: declinedCandidateId,
        messageId: declinedMessageId,
        platformId: indeedId,
        rawContent: "Geen interesse.",
        normalizedContent: "Geen interesse.",
        classification: "not_interested",
        confidence: 88,
        receivedAt: new Date(timestamp - 60 * 60 * 1000),
        source: "manual",
      }),
      db.createMessageSendAttempt({
        campaignId: campaign.id,
        candidateId: interestedCandidateId,
        messageId: interestedMessageId,
        platformId: indeedId,
        status: "succeeded",
        externalMessageId: `external-${timestamp}`,
        confirmationText: "Manual evidence recorded after platform send.",
      }),
      db.createMessageSendAttempt({
        campaignId: campaign.id,
        candidateId: pendingCandidateId,
        messageId: pendingMessageId,
        platformId: indeedId,
        status: "failed",
        errorMessage: "Manual delivery failed.",
      }),
    ]);

    const ledger = await caller.campaigns.getOperatingLedger({
      campaignId: campaign.id,
    });

    expect(ledger.quality.contacted).toBe(3);
    expect(ledger.quality.responsesReceived).toBe(2);
    expect(ledger.quality.responseRate).toBe(66.7);
    expect(ledger.quality.interested).toBe(1);
    expect(ledger.quality.acceptanceRate).toBe(50);
    expect(ledger.quality.pendingResponses).toBe(1);
    expect(ledger.quality.classificationBreakdown.interested).toBe(1);
    expect(ledger.quality.classificationBreakdown.not_interested).toBe(1);
    expect(ledger.quality.rejectionBreakdown.notInterested).toBe(1);
    expect(ledger.quality.totalRejections).toBe(1);
    expect(ledger.quality.sendFailureCount).toBe(1);
    expect(ledger.quality.deliveryEvidenceRate).toBe(100);
    expect(ledger.quality.averageResponseTimeHours).toBe(13.5);
    expect(ledger.summary.candidatesQualified).toBe(1);
    expect(ledger.summary.candidatesNotQualified).toBe(1);
    expect(ledger.summary.candidatesNeedsReview).toBe(0);
    expect(ledger.summary.candidatesAwaitingQualification).toBe(1);
    expect(ledger.quality.qualificationBreakdown.qualified).toBe(1);
    expect(ledger.quality.qualificationBreakdown.not_qualified).toBe(1);
    expect(ledger.quality.qualificationBreakdown.needs_review).toBe(0);
    expect(ledger.quality.qualificationBreakdown.awaiting_decision).toBe(1);
    expect(ledger.quality.qualifiedCandidates).toBe(1);
    expect(ledger.quality.candidatesNeedingQualificationReview).toBe(1);
    expect(ledger.qualificationDecisions).toHaveLength(3);
    expect(ledger.latestQualificationDecisions).toHaveLength(2);
    expect(
      ledger.nextActions.some(
        (action: any) => action.label === "Review candidate qualification"
      )
    ).toBe(true);
  });

  it("should block discovery when campaign readiness has blockers", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const blockedCampaign = await caller.campaigns.create({
      title: "Blocked Discovery Campaign",
      description: "Missing target platforms should block discovery",
      targetPlatforms: JSON.stringify([]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
    });

    await expect(
      caller.candidates.discover({
        campaignId: blockedCampaign.id,
        platforms: ["Indeed"],
        searchCriteria: {
          location: "Arnhem",
          services: "Begeleiding",
        },
      })
    ).rejects.toThrow(/readiness checks/i);

    const readiness = await caller.campaigns.getReadiness({
      campaignId: blockedCampaign.id,
    });
    const auditEvents = await caller.audit.getForCampaign({
      campaignId: blockedCampaign.id,
    });

    expect(readiness.status).toBe("blocked");
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === blockedCampaign.id &&
          event.action === "campaign.discovery_blocked_readiness"
      )
    ).toBe(true);
  });

  it("should reject discovery results from an unknown platform instead of falling back to platform id 1", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const platformScraper = await import("./services/platformScraper");
    const indeedId = await getPlatformId("Indeed");
    const searchMultiplePlatforms = vi
      .spyOn(platformScraper.PlatformScraperFactory, "searchMultiplePlatforms")
      .mockResolvedValue(
        new Map([
          [
            "GhostPlatform",
            [
              {
                name: "Unknown Platform Candidate",
                email: "unknown-platform@example.com",
                profileUrl: "https://example.invalid/profile/unknown-platform",
                location: "Arnhem",
                experience: "5 jaar begeleiding",
                services: "Begeleiding",
                availability: "Doordeweeks",
                hourlyRate: "24",
                bio: "Mag niet stilzwijgend aan een ander platform hangen.",
              },
            ],
          ],
        ]) as any
      );
    const campaign = await caller.campaigns.create({
      title: "Unknown Platform Discovery",
      description: "Discovery provenance should fail closed",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
    });

    await expect(
      caller.candidates.discover({
        campaignId: campaign.id,
        platforms: ["GhostPlatform"],
        searchCriteria: {
          location: "Arnhem",
          services: "Begeleiding",
        },
      })
    ).rejects.toThrow(/unknown platform/i);

    searchMultiplePlatforms.mockRestore();
  });

  it("should list user candidates without requiring a campaign filter", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const candidates = await caller.candidates.list({});

    expect(
      candidates.some((candidate: any) => candidate.id === testCandidateId)
    ).toBe(true);
  });

  it("should include latest qualification state in candidate lists without exposing reason text", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const reason = `Needs review because profile evidence needs manual confirmation token=${suffix}`;
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Qualification List Candidate ${suffix}`,
      email: `qualification-list-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 79,
      status: "matched",
    });

    const recorded = await caller.candidates.recordQualification({
      candidateId,
      decision: "needs_review",
      reason,
    });

    const candidates = await caller.candidates.list({});
    const listed = candidates.find(
      (candidate: any) => candidate.id === candidateId
    );

    expect(listed?.latestQualificationDecision?.id).toBe(recorded.id);
    expect(listed?.latestQualificationDecision?.decision).toBe("needs_review");
    expect(listed?.latestQualificationDecision).not.toHaveProperty("reason");
    expect(JSON.stringify(listed?.latestQualificationDecision)).not.toContain(
      reason
    );
  });

  it("should include unresolved duplicate summaries in candidate lists and clear them after merge", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const duplicateEmail = `candidate-list-duplicate-${suffix}@example.com`;
    const targetCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Candidate List Duplicate Target ${suffix}`,
      email: duplicateEmail,
      location: "Arnhem",
      compatibilityScore: 83,
      status: "matched",
    });
    const sourceCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 2,
      name: `Candidate List Duplicate Source ${suffix}`,
      email: duplicateEmail,
      location: "Arnhem",
      compatibilityScore: 82,
      status: "matched",
    });

    const candidatesBeforeMerge = await caller.candidates.list({});
    const targetBeforeMerge = candidatesBeforeMerge.find(
      (candidate: any) => candidate.id === targetCandidateId
    );
    const sourceBeforeMerge = candidatesBeforeMerge.find(
      (candidate: any) => candidate.id === sourceCandidateId
    );

    expect(targetBeforeMerge?.duplicateSummary?.unresolvedCount).toBe(1);
    expect(targetBeforeMerge?.duplicateSummary?.highestConfidence).toBe(100);
    expect(targetBeforeMerge?.duplicateSummary?.candidateIds).toContain(
      sourceCandidateId
    );
    expect(targetBeforeMerge?.duplicateSummary?.reasons).toContain(
      "same email"
    );
    expect(sourceBeforeMerge?.duplicateSummary?.unresolvedCount).toBe(1);
    expect(JSON.stringify(targetBeforeMerge?.duplicateSummary)).not.toContain(
      duplicateEmail
    );

    await caller.candidates.mergeDuplicate({
      targetCandidateId,
      sourceCandidateId,
      reason: "Confirmed same email during candidate list duplicate triage.",
    });

    const candidatesAfterMerge = await caller.candidates.list({});
    const targetAfterMerge = candidatesAfterMerge.find(
      (candidate: any) => candidate.id === targetCandidateId
    );
    const sourceAfterMerge = candidatesAfterMerge.find(
      (candidate: any) => candidate.id === sourceCandidateId
    );

    expect(targetAfterMerge?.duplicateSummary?.unresolvedCount).toBe(0);
    expect(sourceAfterMerge?.duplicateSummary?.unresolvedCount).toBe(0);
  });

  it("should return a bounded redacted duplicate review queue and clear pairs after merge", async () => {
    const ownerContext = createIsolatedContext("duplicate-review-owner");
    const otherContext = createIsolatedContext("duplicate-review-other");
    const caller = appRouter.createCaller(ownerContext);
    const otherCaller = appRouter.createCaller(otherContext);
    const suffix = Date.now();
    const duplicateEmail = `duplicate-review-${suffix}@example.com`;
    const duplicatePhone = `+31 6 ${suffix.toString().slice(-8)}`;
    const campaignId = await db.createCampaign({
      userId: ownerContext.user.id,
      title: `Duplicate Review Campaign ${suffix}`,
      description: "Isolated duplicate review test campaign",
      targetPlatforms: JSON.stringify([1, 2]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
      status: "active",
    });
    const targetCandidateId = await db.createCandidate({
      campaignId,
      platformId: 1,
      name: `Duplicate Review Target ${suffix}`,
      email: duplicateEmail,
      phone: duplicatePhone,
      location: "Arnhem",
      compatibilityScore: 91,
      status: "matched",
    });
    const sourceCandidateId = await db.createCandidate({
      campaignId,
      platformId: 2,
      name: `Duplicate Review Source ${suffix}`,
      email: duplicateEmail,
      phone: duplicatePhone,
      location: "Arnhem",
      compatibilityScore: 78,
      status: "matched",
    });

    const otherCampaign = await otherCaller.campaigns.create({
      title: `Other Duplicate Review Campaign ${suffix}`,
      description: "Other user duplicate review isolation",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    await db.createCandidate({
      campaignId: otherCampaign.id,
      platformId: 1,
      name: `Other Duplicate Review Candidate ${suffix}`,
      email: duplicateEmail,
      phone: duplicatePhone,
      location: "Arnhem",
      compatibilityScore: 88,
      status: "matched",
    });

    const boundedQueue = await caller.candidates.getDuplicateReviewQueue({
      limit: 5,
    });
    const queue = await caller.candidates.getDuplicateReviewQueue({
      limit: 50,
    });
    const pair = queue.find(
      (entry: any) =>
        entry.pairKey === `${targetCandidateId}:${sourceCandidateId}` ||
        entry.pairKey === `${sourceCandidateId}:${targetCandidateId}`
    );

    expect(boundedQueue.length).toBeLessThanOrEqual(5);
    expect(pair?.confidence).toBe(100);
    expect(pair?.reasons).toContain("same email");
    expect(pair?.reasons).toContain("same phone");
    expect(pair?.targetCandidate.id).toBe(targetCandidateId);
    expect(pair?.sourceCandidate.id).toBe(sourceCandidateId);
    expect(pair?.explanation.riskLevel).toBe("high");
    expect(pair?.explanation.whyShown).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/email values matched/i),
        expect.stringMatching(/phone values matched/i),
      ])
    );
    expect(pair?.explanation.reviewChecklist).toEqual(
      expect.arrayContaining([expect.stringMatching(/Open both ledgers/i)])
    );
    expect(pair?.explanation.falsePositiveSignals).toEqual(
      expect.arrayContaining([expect.stringMatching(/different platforms/i)])
    );
    expect(JSON.stringify(pair)).not.toContain(duplicateEmail);
    expect(JSON.stringify(pair)).not.toContain(duplicatePhone);
    expect(JSON.stringify(queue)).not.toContain("Other Duplicate Review");

    const otherQueue = await otherCaller.candidates.getDuplicateReviewQueue({
      limit: 5,
    });
    expect(JSON.stringify(otherQueue)).not.toContain(
      `Duplicate Review Target ${suffix}`
    );

    await caller.candidates.mergeDuplicate({
      targetCandidateId,
      sourceCandidateId,
      reason: "Confirmed from guided duplicate review queue.",
    });

    const queueAfterMerge = await caller.candidates.getDuplicateReviewQueue({
      limit: 20,
    });
    expect(
      queueAfterMerge.some(
        (entry: any) =>
          entry.pairKey === `${targetCandidateId}:${sourceCandidateId}` ||
          entry.pairKey === `${sourceCandidateId}:${targetCandidateId}`
      )
    ).toBe(false);
  });

  it("should persist not-duplicate decisions and suppress resolved duplicate pairs", async () => {
    const ownerContext = createIsolatedContext("not-duplicate-owner");
    const otherContext = createIsolatedContext("not-duplicate-other");
    const caller = appRouter.createCaller(ownerContext);
    const otherCaller = appRouter.createCaller(otherContext);
    const suffix = Date.now();
    const duplicateEmail = `not-duplicate-${suffix}@example.com`;
    const campaignId = await db.createCampaign({
      userId: ownerContext.user.id,
      title: `Not Duplicate Campaign ${suffix}`,
      description: "Isolated not-duplicate test campaign",
      targetPlatforms: JSON.stringify([1, 2]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
      status: "active",
    });
    const targetCandidateId = await db.createCandidate({
      campaignId,
      platformId: 1,
      name: `Not Duplicate Target ${suffix}`,
      email: duplicateEmail,
      location: "Arnhem",
      compatibilityScore: 89,
      status: "matched",
    });
    const sourceCandidateId = await db.createCandidate({
      campaignId,
      platformId: 2,
      name: `Not Duplicate Source ${suffix}`,
      email: duplicateEmail,
      location: "Arnhem",
      compatibilityScore: 72,
      status: "matched",
    });

    const queueBefore = await caller.candidates.getDuplicateReviewQueue({
      limit: 50,
    });
    expect(
      queueBefore.some(
        (entry: any) =>
          entry.pairKey === `${targetCandidateId}:${sourceCandidateId}` ||
          entry.pairKey === `${sourceCandidateId}:${targetCandidateId}`
      )
    ).toBe(true);

    await expect(
      otherCaller.candidates.resolveDuplicatePair({
        targetCandidateId,
        sourceCandidateId,
        decision: "not_duplicate",
        reason: "Other users cannot resolve this duplicate pair.",
      })
    ).rejects.toThrow(/not found/i);

    const resolution = await caller.candidates.resolveDuplicatePair({
      targetCandidateId,
      sourceCandidateId,
      decision: "not_duplicate",
      confidence: 100,
      reasons: ["same email"],
      reason: "Reviewed source profiles and confirmed these are different people.",
    });
    expect(resolution.success).toBe(true);

    const queueAfter = await caller.candidates.getDuplicateReviewQueue({
      limit: 50,
    });
    expect(
      queueAfter.some(
        (entry: any) =>
          entry.pairKey === `${targetCandidateId}:${sourceCandidateId}` ||
          entry.pairKey === `${sourceCandidateId}:${targetCandidateId}`
      )
    ).toBe(false);

    const candidatesAfter = await caller.candidates.list({});
    const targetAfter = candidatesAfter.find(
      (candidate: any) => candidate.id === targetCandidateId
    );
    expect(targetAfter?.duplicateSummary?.candidateIds ?? []).not.toContain(
      sourceCandidateId
    );

    const ledgerAfter = await caller.candidates.getLedger({
      candidateId: targetCandidateId,
    });
    expect(
      ledgerAfter.duplicateCandidates.some(
        (entry: any) => entry.candidate.id === sourceCandidateId
      )
    ).toBe(false);

    const auditEvents = await db.getAuditEventsForEntity(
      ownerContext.user.id,
      "candidateDuplicateResolution",
      resolution.resolutionId
    );
    const auditText = JSON.stringify(auditEvents);
    expect(auditText).toContain("candidate_duplicate.not_duplicate");
    expect(auditText).not.toContain(duplicateEmail);
    expect(auditText).not.toContain(
      "Reviewed source profiles and confirmed these are different people."
    );
  });

  it("should batch-dismiss reviewed duplicate pairs with acknowledgement and redacted audit metadata", async () => {
    const ownerContext = createIsolatedContext("batch-duplicate-owner");
    const otherContext = createIsolatedContext("batch-duplicate-other");
    const caller = appRouter.createCaller(ownerContext);
    const otherCaller = appRouter.createCaller(otherContext);
    const suffix = Date.now();
    const firstDuplicateEmail = `batch-duplicate-a-${suffix}@example.com`;
    const secondDuplicateEmail = `batch-duplicate-b-${suffix}@example.com`;
    const campaignId = await db.createCampaign({
      userId: ownerContext.user.id,
      title: `Batch Duplicate Campaign ${suffix}`,
      description: "Isolated batch duplicate test campaign",
      targetPlatforms: JSON.stringify([1, 2, 3]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
      status: "active",
    });
    const firstTargetCandidateId = await db.createCandidate({
      campaignId,
      platformId: 1,
      name: `Batch Duplicate Target A ${suffix}`,
      email: firstDuplicateEmail,
      location: "Arnhem",
      compatibilityScore: 94,
      status: "matched",
    });
    const firstSourceCandidateId = await db.createCandidate({
      campaignId,
      platformId: 2,
      name: `Batch Duplicate Source A ${suffix}`,
      email: firstDuplicateEmail,
      location: "Arnhem",
      compatibilityScore: 80,
      status: "matched",
    });
    const secondTargetCandidateId = await db.createCandidate({
      campaignId,
      platformId: 1,
      name: `Batch Duplicate Target B ${suffix}`,
      email: secondDuplicateEmail,
      location: "Nijmegen",
      compatibilityScore: 92,
      status: "matched",
    });
    const secondSourceCandidateId = await db.createCandidate({
      campaignId,
      platformId: 3,
      name: `Batch Duplicate Source B ${suffix}`,
      email: secondDuplicateEmail,
      location: "Nijmegen",
      compatibilityScore: 81,
      status: "matched",
    });
    const pairs = [
      {
        targetCandidateId: firstTargetCandidateId,
        sourceCandidateId: firstSourceCandidateId,
      },
      {
        targetCandidateId: secondTargetCandidateId,
        sourceCandidateId: secondSourceCandidateId,
      },
    ];
    const decisionReason =
      "Reviewed selected duplicate queue pairs and confirmed they are different people.";

    await expect(
      caller.candidates.resolveDuplicatePairsBatch({
        pairs,
        decision: "not_duplicate",
        reason: decisionReason,
        reviewedCurrentQueueAcknowledged: false,
      })
    ).rejects.toThrow(/confirm/i);

    await expect(
      otherCaller.candidates.resolveDuplicatePairsBatch({
        pairs,
        decision: "not_duplicate",
        reason: decisionReason,
        reviewedCurrentQueueAcknowledged: true,
      })
    ).rejects.toThrow(/current review queue|conflict/i);

    const result = await caller.candidates.resolveDuplicatePairsBatch({
      pairs,
      decision: "not_duplicate",
      reason: decisionReason,
      reviewedCurrentQueueAcknowledged: true,
    });
    expect(result.success).toBe(true);
    expect(result.resolvedCount).toBe(2);
    expect(result.resolutionIds).toHaveLength(2);

    const queueAfter = await caller.candidates.getDuplicateReviewQueue({
      limit: 50,
    });
    for (const pair of pairs) {
      expect(
        queueAfter.some(
          (entry: any) =>
            entry.pairKey ===
              `${pair.targetCandidateId}:${pair.sourceCandidateId}` ||
            entry.pairKey ===
              `${pair.sourceCandidateId}:${pair.targetCandidateId}`
        )
      ).toBe(false);
    }

    const auditEvents = await db.getAuditEventsForEntity(
      ownerContext.user.id,
      "candidateDuplicateResolution",
      result.resolutionIds[0]
    );
    const auditText = JSON.stringify(auditEvents);
    expect(auditText).toContain("candidate_duplicate.not_duplicate");
    expect(auditText).toContain("candidate_duplicate.batch_not_duplicate");
    expect(auditText).not.toContain(firstDuplicateEmail);
    expect(auditText).not.toContain(secondDuplicateEmail);
    expect(auditText).not.toContain(decisionReason);
  });

  it("should return a candidate operating ledger", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const ledger = await caller.candidates.getLedger({
      candidateId: testCandidateId,
    });

    expect(ledger.candidate.id).toBe(testCandidateId);
    expect(ledger.campaign.id).toBe(testCampaignId);
    expect(Array.isArray(ledger.messages)).toBe(true);
    expect(Array.isArray(ledger.nextActions)).toBe(true);
  });

  it("should require acknowledgement before marking a candidate qualified", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    await expect(
      caller.candidates.recordQualification({
        candidateId: testCandidateId,
        decision: "qualified",
        reason: "Relevant campaign evidence supports qualification.",
        sensitiveAssumptionsAcknowledged: false,
      })
    ).rejects.toThrow(/confirm/i);
  });

  it("should record candidate qualification decisions without leaking reason text to audit", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const reason =
      "Relevant campaign evidence: avondzorg experience token=secret";

    const recorded = await caller.candidates.recordQualification({
      candidateId: testCandidateId,
      decision: "qualified",
      reason,
      sensitiveAssumptionsAcknowledged: true,
    });

    expect(recorded.success).toBe(true);
    expect(recorded.id).toBeGreaterThan(0);

    const ledger = await caller.candidates.getLedger({
      candidateId: testCandidateId,
    });
    expect(ledger.latestQualificationDecision?.id).toBe(recorded.id);
    expect(ledger.latestQualificationDecision?.decision).toBe("qualified");
    expect(ledger.qualificationDecisions.length).toBeGreaterThan(0);

    const auditEvents = await db.getAuditEventsForEntity(
      mockAdminContext.user.id,
      "candidate",
      testCandidateId
    );
    const qualificationAudit = auditEvents.find(
      event =>
        event.action === "candidate.qualification_recorded" &&
        event.afterState?.includes(`"qualificationDecisionId":${recorded.id}`)
    );

    expect(qualificationAudit).toBeDefined();
    expect(qualificationAudit?.afterState).toContain('"reasonLength"');
    expect(qualificationAudit?.afterState).toContain('"decision":"qualified"');
    expect(qualificationAudit?.afterState).not.toContain(reason);
    expect(qualificationAudit?.afterState).not.toContain("token=secret");
  });

  it("should prevent other users from recording candidate qualification decisions", async () => {
    const otherCaller = appRouter.createCaller(mockOtherUserContext);

    await expect(
      otherCaller.candidates.recordQualification({
        candidateId: testCandidateId,
        decision: "needs_review",
        reason: "Other user should not be able to change this ledger.",
      })
    ).rejects.toThrow(/not found/i);
  });

  it("should block message approval when the candidate is explicitly not qualified", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Not Qualified Approval Candidate ${suffix}`,
      email: `not-qualified-approval-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 84,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Qualification gate approval",
      content: "This draft should not be approved for a not-qualified person.",
      language: "nl",
      status: "queued",
    });
    await db.createCandidateQualificationDecision({
      campaignId: testCampaignId,
      candidateId,
      userId: mockAdminContext.user.id,
      decision: "not_qualified",
      reason: "Campaign evidence does not match the requested support.",
      sensitiveAssumptionsAcknowledged: 0,
    });

    await expect(
      caller.messages.approve({
        messageId,
        reason: "Trying to approve without changing qualification.",
      })
    ).rejects.toThrow(/marked qualified/i);

    const auditEvents = await db.getAuditEventsForEntity(
      mockAdminContext.user.id,
      "message",
      messageId
    );
    const blockedAudit = auditEvents.find(
      event =>
        event.action === "message.approval_blocked_candidate_qualification"
    );
    expect(blockedAudit).toBeDefined();
    expect(blockedAudit?.afterState).toContain('"decision":"not_qualified"');
    expect(blockedAudit?.afterState).toContain('"reasonLength"');
    expect(blockedAudit?.afterState).not.toContain(
      "does not match the requested support"
    );
  });

  it("should block successful send attempts when qualification needs review", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Needs Review Send Candidate ${suffix}`,
      email: `needs-review-send-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 85,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Qualification gate send",
      content: "This approved draft should still be blocked from sending.",
      language: "nl",
      status: "approved",
    });
    await db.createMessageApproval({
      campaignId: testCampaignId,
      candidateId,
      messageId,
      userId: mockAdminContext.user.id,
      decision: "approved",
      decisionReason: "Direct test setup approval.",
      approvedSubjectSnapshot: "Qualification gate send",
      approvedContentSnapshot:
        "This approved draft should still be blocked from sending.",
      decidedAt: new Date(),
    });
    await db.createCandidateQualificationDecision({
      campaignId: testCampaignId,
      candidateId,
      userId: mockAdminContext.user.id,
      decision: "needs_review",
      reason: "Operator still needs to review relevant campaign evidence.",
      sensitiveAssumptionsAcknowledged: 0,
    });

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        externalMessageId: `external-qualification-${suffix}`,
        confirmationText:
          "Platform showed a sent confirmation but qualification blocks it.",
      })
    ).rejects.toThrow(/marked qualified/i);

    const attempts = await db.getMessageSendAttemptsForCandidate(candidateId);
    expect(
      attempts.some(
        attempt =>
          attempt.status === "blocked" &&
          attempt.errorMessage?.includes("not currently marked qualified")
      )
    ).toBe(true);
  });

  it("should block follow-up preparation when qualification needs review", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Needs Review Follow-up Candidate ${suffix}`,
      email: `needs-review-follow-up-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 86,
      status: "matched",
    });
    await db.createCandidateQualificationDecision({
      campaignId: testCampaignId,
      candidateId,
      userId: mockAdminContext.user.id,
      decision: "needs_review",
      reason: "Follow-up should wait until candidate qualification is clear.",
      sensitiveAssumptionsAcknowledged: 0,
    });

    await expect(
      caller.followUps.prepare({
        candidateId,
        subject: "Follow-up after qualification review",
        content: "This should not be prepared yet.",
      })
    ).rejects.toThrow(/marked qualified/i);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.action === "follow_up.prepare_blocked_candidate_qualification"
      )
    ).toBe(true);
  });

  it("should detect and merge duplicate candidate identities with audit", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const duplicateEmail = `merge-duplicate-${suffix}@example.com`;
    const duplicatePhone = `+316${suffix.toString().slice(-8)}`;
    const duplicateProfileUrl = `https://example.test/helper/duplicate-ledger-candidate-${suffix}`;
    const mergeReason = `Same name and location; reviewed by operator token=${suffix}.`;
    const duplicateCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 2,
      name: "Ledger Test Candidate",
      email: duplicateEmail,
      phone: duplicatePhone,
      location: "Arnhem",
      profileUrl: duplicateProfileUrl,
      compatibilityScore: 79,
      status: "matched",
    });

    const ledgerBeforeMerge = await caller.candidates.getLedger({
      candidateId: testCandidateId,
    });

    expect(
      ledgerBeforeMerge.duplicateCandidates.some(
        (entry: any) => entry.candidate.id === duplicateCandidateId
      )
    ).toBe(true);

    const merged = await caller.candidates.mergeDuplicate({
      targetCandidateId: testCandidateId,
      sourceCandidateId: duplicateCandidateId,
      reason: mergeReason,
    });

    expect(merged.success).toBe(true);
    expect(merged.targetIdentityId).toBeGreaterThan(0);
    expect(merged.movedSourceCount).toBeGreaterThan(0);

    const ledgerAfterMerge = await caller.candidates.getLedger({
      candidateId: testCandidateId,
    });

    expect(
      ledgerAfterMerge.sources.some(
        (source: any) => source.candidateId === duplicateCandidateId
      )
    ).toBe(true);
    expect(
      ledgerAfterMerge.duplicateCandidates.some(
        (entry: any) => entry.candidate.id === duplicateCandidateId
      )
    ).toBe(false);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });

    const mergeAudit = auditEvents.find(
      (event: any) => event.action === "candidate_identity.merged"
    );
    expect(mergeAudit).toBeDefined();
    const mergeBeforeState = JSON.parse(mergeAudit!.beforeState || "{}");
    const mergeAfterState = JSON.parse(mergeAudit!.afterState || "{}");
    expect(mergeAfterState.reasonLength).toBe(mergeReason.length);
    expect(mergeBeforeState.targetIdentity).toHaveProperty("hasCanonicalEmail");
    expect(mergeBeforeState.sourceIdentity).toHaveProperty("hasCanonicalPhone");
    const mergeAuditText = JSON.stringify({
      beforeState: mergeBeforeState,
      afterState: mergeAfterState,
    });
    expect(mergeAuditText).not.toContain(mergeReason);
    expect(mergeAuditText).not.toContain("ledger-test@example.com");
    expect(mergeAuditText).not.toContain(duplicateEmail);
    expect(mergeAuditText).not.toContain(duplicatePhone);
    expect(mergeAuditText).not.toContain(duplicateProfileUrl);
  });

  it("should require acknowledgement before importing candidate personal data", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");
    const campaign = await caller.campaigns.create({
      title: "Candidate Import Acknowledgement Test",
      description: "Importing rows should require explicit acknowledgement",
      targetPlatforms: JSON.stringify([nationaleHulpgidsId]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });

    await expect(
      caller.candidates.importManual({
        campaignId: campaign.id,
        personalDataAcknowledged: false,
        candidates: [
          {
            name: "Import Ack Candidate",
            email: "import-ack@example.nl",
            location: "Arnhem",
          },
        ],
      })
    ).rejects.toThrow(/acknowledgement/i);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });

    expect(
      auditEvents.some(
        (event: any) =>
          event.action === "candidate.import_blocked_missing_acknowledgement"
      )
    ).toBe(true);
  });

  it("should import candidates with duplicate warnings and redacted audit", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Candidate Import Duplicate Test ${suffix}`,
      description: "Importing candidates should surface duplicate warnings",
      targetPlatforms: JSON.stringify([nationaleHulpgidsId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
        minBudget: "20",
        maxBudget: "30",
      }),
    });
    await db.createCandidate({
      campaignId: campaign.id,
      platformId: nationaleHulpgidsId,
      name: "Manual Import Duplicate",
      location: "Arnhem",
      profileUrl: `https://example.nl/profielen/existing-${suffix}`,
      compatibilityScore: 74,
      status: "matched",
    });

    await expect(
      otherCaller.candidates.importManual({
        campaignId: campaign.id,
        personalDataAcknowledged: true,
        candidates: [
          {
            name: "Not Owner Candidate",
            location: "Arnhem",
          },
        ],
      })
    ).rejects.toThrow(/not found/i);

    const result = await caller.candidates.importManual({
      campaignId: campaign.id,
      personalDataAcknowledged: true,
      sourceLabel: "test_import",
      candidates: [
        {
          name: "Manual Import Duplicate",
          email: `manual-import-duplicate-${suffix}@example.nl`,
          location: "Arnhem",
          profileUrl: `https://example.nl/profielen/imported-${suffix}`,
          services: "Begeleiding",
          hourlyRate: "25",
          bio: "Kandidaat uit handmatige import.",
        },
        {
          name: "Manual Import Unique",
          location: "Nijmegen",
          services: "Gezelschap",
        },
      ],
    });

    expect(result.importedCount).toBe(2);
    expect(result.duplicateWarningCount).toBeGreaterThan(0);
    const importedDuplicate = result.imported.find(
      (entry: any) => entry.name === "Manual Import Duplicate"
    );
    expect(importedDuplicate?.duplicateWarnings.length).toBeGreaterThan(0);
    expect(importedDuplicate?.compatibilityScore).toBeGreaterThan(0);
    expect(importedDuplicate?.recommendation).toBeTruthy();
    expect(importedDuplicate?.matchReasons.length).toBeGreaterThan(0);

    const campaignCandidates = await caller.candidates.list({
      campaignId: campaign.id,
    });
    expect(
      campaignCandidates.some(
        (candidate: any) => candidate.name === "Manual Import Unique"
      )
    ).toBe(true);
    const importedLedger = await caller.candidates.getLedger({
      candidateId: importedDuplicate!.id,
    });
    expect(importedLedger.candidate.compatibilityScore).toBeGreaterThan(0);
    expect(importedLedger.matchFactors.length).toBeGreaterThan(0);
    expect(
      importedLedger.matchFactors.some(
        (factor: any) => factor.factor === "services"
      )
    ).toBe(true);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });
    const importAuditStates = auditEvents
      .filter((event: any) => event.action.startsWith("candidate.import"))
      .map((event: any) => event.afterState || "")
      .join("\n");

    expect(importAuditStates).toContain("duplicateWarningCount");
    expect(importAuditStates).toContain("compatibilityScore");
    expect(importAuditStates).toContain("matchFactorCount");
    expect(importAuditStates).not.toContain(
      `manual-import-duplicate-${suffix}@example.nl`
    );
    expect(importAuditStates).not.toContain("Manual Import Duplicate");
    expect(importAuditStates).not.toContain("Kandidaat uit handmatige import");
  });

  it("should persist explicit message approval", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const result = await caller.messages.approve({
      messageId: testMessageId,
      reason: "Looks appropriate",
    });

    expect(result.success).toBe(true);
    expect(result.approvalId).toBeGreaterThan(0);
  });

  it("should block approvals and send attempts for dry-run campaigns", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const indeedId = await getPlatformId("Indeed");
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Dry Run Campaign ${suffix}`,
      description: "Dry-run campaigns can discover and draft only",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
        operationMode: "dry_run",
      }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: indeedId,
      name: `Dry Run Candidate ${suffix}`,
      location: "Arnhem",
      compatibilityScore: 88,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: indeedId,
      subject: "Dry-run concept",
      content: "Dit concept mag niet worden goedgekeurd of verzonden.",
      language: "nl",
      status: "queued",
    });
    const readiness = await caller.campaigns.getReadiness({
      campaignId: campaign.id,
    });
    expect(
      readiness.checks.some(
        check =>
          check.key === "operation-mode" &&
          check.status === "pass" &&
          check.detail.includes("Dry-run mode")
      )
    ).toBe(true);

    await expect(
      caller.messages.approve({
        messageId,
        reason: "Dry run should block approval",
      })
    ).rejects.toThrow(/dry-run mode/i);

    await expect(
      caller.messages.updateStatus({
        messageId,
        status: "approved",
      })
    ).rejects.toThrow(/dry-run mode/i);

    await expect(
      caller.messages.bulkUpdateStatus({
        messageIds: [messageId],
        status: "approved",
        complianceAcknowledged: true,
      })
    ).rejects.toThrow(/dry-run mode/i);

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        confirmationText:
          "Manual confirmation text should still be blocked in dry-run mode.",
      })
    ).rejects.toThrow(/dry-run mode/i);

    const approvals = await db.getMessageApprovalsByMessageId(messageId);
    const attempts = await db.getMessageSendAttemptsForCampaign(campaign.id);
    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });

    expect(approvals).toHaveLength(0);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe("blocked");
    expect(attempts[0].errorMessage).toMatch(/dry-run mode/i);
    expect(
      auditEvents.some(
        (event: any) => event.action === "message.approval_blocked_dry_run"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) => event.action === "message.send_blocked_dry_run"
      )
    ).toBe(true);
  });

  it("should block message approval after a candidate declines outreach", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Declined Approval Candidate ${suffix}`,
      email: `declined-approval-${suffix}@example.com`,
      location: "Zwolle",
      compatibilityScore: 75,
      status: "matched",
    });
    const originalMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });
    const followOnMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Nieuw bericht",
      content: "Dit bericht mag niet worden goedgekeurd na een afwijzing.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.recordResponse({
      messageId: originalMessageId,
      rawContent: "Dank u, maar ik heb geen interesse.",
      classification: "not_interested",
      confidence: 95,
    });

    await expect(
      caller.messages.approve({
        messageId: followOnMessageId,
        reason: "Should be blocked",
      })
    ).rejects.toThrow(/stop or pause outreach/i);

    const approvals =
      await db.getMessageApprovalsByMessageId(followOnMessageId);
    expect(approvals).toHaveLength(0);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === followOnMessageId &&
          event.action === "message.approval_blocked_by_response"
      )
    ).toBe(true);
  });

  it("should block approval when another source in the same candidate identity declined", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const sharedEmail = `identity-decline-approval-${suffix}@example.com`;
    const declinedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Identity Declined Candidate ${suffix}`,
      email: sharedEmail,
      location: "Zwolle",
      compatibilityScore: 86,
      status: "matched",
    });
    const followOnCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 2,
      name: `Identity Follow-on Candidate ${suffix}`,
      email: sharedEmail,
      location: "Zwolle",
      compatibilityScore: 84,
      status: "matched",
    });
    await db.getOrCreateCandidateIdentity(
      (await db.getCandidateById(declinedCandidateId))!,
      mockAdminContext.user.id
    );
    await db.getOrCreateCandidateIdentity(
      (await db.getCandidateById(followOnCandidateId))!,
      mockAdminContext.user.id
    );
    const declinedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: declinedCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });
    const followOnMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: followOnCandidateId,
      platformId: 2,
      subject: "Nieuw bericht",
      content: "Dit bericht mag niet worden goedgekeurd na een identity stop.",
      language: "nl",
      status: "queued",
    });

    const response = await caller.messages.recordResponse({
      messageId: declinedMessageId,
      rawContent: "Dank u, maar ik heb geen interesse.",
      classification: "not_interested",
      confidence: 95,
    });

    await expect(
      caller.messages.approve({
        messageId: followOnMessageId,
        reason: "Should be blocked by identity-level stop",
      })
    ).rejects.toThrow(/stop or pause outreach/i);

    const approvals =
      await db.getMessageApprovalsByMessageId(followOnMessageId);
    expect(approvals).toHaveLength(0);
    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    const blockedAudit = auditEvents.find(
      (event: any) =>
        event.entityId === followOnMessageId &&
        event.action === "message.approval_blocked_by_response"
    );
    expect(blockedAudit).toBeDefined();
    expect(blockedAudit?.afterState).toContain(
      `"responseId":${response.responseId}`
    );
    expect(blockedAudit?.afterState).toContain(
      `"responseCandidateId":${declinedCandidateId}`
    );
    expect(blockedAudit?.afterState).toContain(
      `"messageCandidateId":${followOnCandidateId}`
    );

    const linkedLedger = await caller.candidates.getLedger({
      candidateId: followOnCandidateId,
    });
    expect(linkedLedger.outreachLock?.id).toBe(response.responseId);
    expect(linkedLedger.outreachLock?.candidateId).toBe(declinedCandidateId);
    expect(
      linkedLedger.nextActions.some(
        (action: any) =>
          action.priority === "high" && action.label === "Outreach stopped"
      )
    ).toBe(true);
  });

  it("should reopen locked candidate outreach with an audit trail", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Reopen Candidate ${suffix}`,
      email: `reopen-${suffix}@example.com`,
      location: "Delft",
      compatibilityScore: 84,
      status: "matched",
    });
    const originalMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });
    const followOnMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Voorzichtig vervolg",
      content: "Dit bericht mag pas na heropening worden goedgekeurd.",
      language: "nl",
      status: "queued",
    });

    const response = await caller.messages.recordResponse({
      messageId: originalMessageId,
      rawContent: "Ik ben voorlopig niet beschikbaar.",
      classification: "unavailable",
      confidence: 90,
    });

    await expect(
      caller.messages.approve({
        messageId: followOnMessageId,
        reason: "Blocked before reopen",
      })
    ).rejects.toThrow(/stop or pause outreach/i);

    const reopened = await caller.messages.reopenOutreach({
      messageId: followOnMessageId,
      reason:
        "Candidate later confirmed availability and consented to a careful follow-up.",
    });

    expect(reopened.success).toBe(true);
    expect(reopened.previousResponseId).toBe(response.responseId);
    expect(reopened.responseId).toBeGreaterThan(response.responseId);

    const messages = await caller.messages.listAll({
      campaignId: testCampaignId,
    });
    expect(
      messages.some(
        (message: any) =>
          message.id === followOnMessageId &&
          message.latestCandidateResponse?.classification === "unknown"
      )
    ).toBe(true);

    await expect(
      caller.messages.approve({
        messageId: followOnMessageId,
        reason: "Approved after audited reopen",
      })
    ).resolves.toMatchObject({ success: true });

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === candidateId &&
          event.action === "candidate.outreach_reopened" &&
          event.riskLevel === "high"
      )
    ).toBe(true);
  });

  it("should block successful send attempts without prior approval", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const unapprovedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: testCandidateId,
      platformId: 1,
      subject: "Nog een bericht",
      content: "Dit bericht is nog niet goedgekeurd.",
      language: "nl",
      status: "queued",
    });

    await expect(
      caller.messages.recordSendAttempt({
        messageId: unapprovedMessageId,
        status: "succeeded",
        confirmationText: "Manual confirmation from platform screen",
      })
    ).rejects.toThrow(/approved/i);
  });

  it("should reset edited approved messages to review before any send attempt", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Edited Approval Candidate ${suffix}`,
      email: `edited-approval-${suffix}@example.com`,
      location: "Zwolle",
      compatibilityScore: 84,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Origineel goedgekeurd",
      content: "Dit bericht wordt eerst goedgekeurd.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId,
      reason: "Approved before edit",
    });

    await caller.messages.update({
      messageId,
      subject: "Aangepast bericht",
      content: "Deze aangepaste tekst moet opnieuw worden beoordeeld.",
    });

    const messages = await caller.messages.listAll({
      campaignId: testCampaignId,
    });
    expect(
      messages.some(
        (message: any) => message.id === messageId && message.status === "queued"
      )
    ).toBe(true);

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        confirmationText: "Manual confirmation from platform screen",
      })
    ).rejects.toThrow(/currently be approved/i);

    await caller.messages.approve({
      messageId,
      reason: "Re-approved after edit",
    });
    const result = await caller.messages.recordSendAttempt({
      messageId,
      status: "succeeded",
      confirmationText: "Manual confirmation from platform screen",
    });

    expect(result.success).toBe(true);
    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === messageId &&
          event.action === "message.updated_review_reset"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === messageId &&
          event.action === "message.send_blocked_not_currently_approved"
      )
    ).toBe(true);
  });

  it("should block editing messages after contact has been recorded", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Contacted Edit Candidate ${suffix}`,
      email: `contacted-edit-${suffix}@example.com`,
      location: "Groningen",
      compatibilityScore: 80,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Al verzonden",
      content: "Dit bericht is al als verzonden geregistreerd.",
      language: "nl",
      status: "queued",
    });
    await db.updateMessageStatus(messageId, "sent");

    await expect(
      caller.messages.update({
        messageId,
        subject: "Mag niet wijzigen",
        content: "Een verzonden bericht mag niet worden aangepast.",
      })
    ).rejects.toThrow(/cannot be edited/i);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === messageId &&
          event.action === "message.update_blocked_after_contact"
      )
    ).toBe(true);
  });

  it("should require acknowledgement before approving a sensitive message", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const sensitiveCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Sensitive Approval Candidate ${suffix}`,
      email: `sensitive-approval-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 81,
      status: "matched",
    });
    const sensitiveMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: sensitiveCandidateId,
      platformId: 1,
      subject: "Hulpvraag met medicatie",
      content:
        "Dit bericht noemt medicatie en persoonlijke verzorging, dus expliciete controle is nodig.",
      language: "nl",
      status: "queued",
    });

    await expect(
      caller.messages.approve({
        messageId: sensitiveMessageId,
        reason: "Reviewed content",
      })
    ).rejects.toThrow(/sensitive care or personal context/i);

    const result = await caller.messages.approve({
      messageId: sensitiveMessageId,
      reason: "Sensitive context reviewed",
      sensitiveContentAcknowledged: true,
    });

    expect(result.success).toBe(true);
    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === sensitiveMessageId &&
          event.action === "message.approved" &&
          event.afterState?.includes('"sensitiveContentAcknowledged":true')
      )
    ).toBe(true);
  });

  it("should require send evidence for successful attempts", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    await expect(
      caller.messages.recordSendAttempt({
        messageId: testMessageId,
        status: "succeeded",
      })
    ).rejects.toThrow(/evidence/i);
  });

  it("should record a successful send attempt with evidence", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const uniqueCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Unique Send Candidate ${Date.now()}`,
      email: `unique-send-${Date.now()}@example.com`,
      location: "Nijmegen",
      compatibilityScore: 78,
      status: "matched",
    });
    const approvedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: uniqueCandidateId,
      platformId: 1,
      subject: "Goedgekeurd bericht",
      content: "Dit bericht is expliciet goedgekeurd.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId: approvedMessageId,
      reason: "Ready for evidence-backed send",
    });

    const result = await caller.messages.recordSendAttempt({
      messageId: approvedMessageId,
      status: "succeeded",
      confirmationText: "Manual confirmation from platform screen",
    });

    expect(result.success).toBe(true);
    expect(result.attemptId).toBeGreaterThan(0);
  });

  it("should reject weak or missing send evidence", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Weak Evidence Candidate ${suffix}`,
      email: `weak-evidence-${suffix}@example.com`,
      location: "Nijmegen",
      compatibilityScore: 78,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Evidence check",
      content: "Dit bericht is goedgekeurd maar vereist degelijk bewijs.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId,
      reason: "Ready for evidence-backed send",
    });

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        confirmationText: "ok",
      })
    ).rejects.toThrow(/confirmation text/i);

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        externalMessageId: "x",
      })
    ).rejects.toThrow(/external message id/i);

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "failed",
      })
    ).rejects.toThrow(/failure reason/i);
  });

  it("should record failed send attempts and expose failed messages", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const failedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Failed Send Candidate ${suffix}`,
      email: `failed-send-${suffix}@example.com`,
      location: "Leiden",
      compatibilityScore: 76,
      status: "matched",
    });
    const failedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: failedCandidateId,
      platformId: 1,
      subject: "Te proberen bericht",
      content: "Dit bericht is goedgekeurd maar verzending mislukt.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId: failedMessageId,
      reason: "Approved before manual send attempt",
    });

    const result = await caller.messages.recordSendAttempt({
      messageId: failedMessageId,
      status: "failed",
      errorMessage: "Platform profile was unavailable during manual send.",
    });

    const failedMessages = await caller.messages.listAll({
      status: "failed",
      campaignId: testCampaignId,
    });

    expect(result.success).toBe(true);
    expect(result.attemptId).toBeGreaterThan(0);
    expect(
      failedMessages.some((message: any) => message.id === failedMessageId)
    ).toBe(true);
  });

  it("should block successful send attempts when candidate duplicates remain unresolved", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const duplicateTargetId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Duplicate Send Candidate ${suffix}`,
      email: `duplicate-send-${suffix}@example.com`,
      location: "Utrecht",
      compatibilityScore: 80,
      status: "matched",
    });
    await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Duplicate Send Candidate ${suffix}`,
      email: `duplicate-send-${suffix}@example.com`,
      location: "Utrecht",
      compatibilityScore: 79,
      status: "matched",
    });
    const duplicateMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: duplicateTargetId,
      platformId: 1,
      subject: "Niet dubbel sturen",
      content:
        "Dit bericht mag niet worden verzonden zolang er duplicaten zijn.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId: duplicateMessageId,
      reason: "Approved content, but duplicate review still required",
    });

    await expect(
      caller.messages.recordSendAttempt({
        messageId: duplicateMessageId,
        status: "succeeded",
        confirmationText: "Manual confirmation from platform screen",
      })
    ).rejects.toThrow(/duplicate/i);

    const attempts =
      await db.getMessageSendAttemptsForCandidate(duplicateTargetId);
    expect(
      attempts.some(
        attempt =>
          attempt.status === "blocked" &&
          attempt.errorMessage?.includes("unresolved possible duplicates")
      )
    ).toBe(true);
  });

  it("should block approved message sends after a later candidate decline", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Declined Send Candidate ${suffix}`,
      email: `declined-send-${suffix}@example.com`,
      location: "Amersfoort",
      compatibilityScore: 81,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Goedgekeurd voor later",
      content: "Dit bericht wordt eerst goedgekeurd.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId,
      reason: "Approved before response arrived",
    });

    await caller.messages.recordResponse({
      messageId,
      rawContent: "Ik ben helaas niet beschikbaar.",
      classification: "unavailable",
      confidence: 90,
    });

    await expect(
      caller.messages.recordSendAttempt({
        messageId,
        status: "succeeded",
        confirmationText: "Manual confirmation should be ignored",
      })
    ).rejects.toThrow(/stop or pause outreach/i);

    const attempts = await db.getMessageSendAttemptsForCandidate(candidateId);
    expect(
      attempts.some(
        attempt =>
          attempt.status === "blocked" &&
          attempt.errorMessage?.includes("stop or pause outreach")
      )
    ).toBe(true);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === messageId &&
          event.action === "message.send_blocked_by_response"
      )
    ).toBe(true);
  });

  it("should block approved sends when another source in the same identity declined", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const sharedEmail = `identity-decline-send-${suffix}@example.com`;
    const declinedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Identity Declined Send Candidate ${suffix}`,
      email: sharedEmail,
      location: "Amersfoort",
      compatibilityScore: 86,
      status: "matched",
    });
    const sendCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 2,
      name: `Identity Send Candidate ${suffix}`,
      email: sharedEmail,
      location: "Amersfoort",
      compatibilityScore: 84,
      status: "matched",
    });
    await db.getOrCreateCandidateIdentity(
      (await db.getCandidateById(declinedCandidateId))!,
      mockAdminContext.user.id
    );
    await db.getOrCreateCandidateIdentity(
      (await db.getCandidateById(sendCandidateId))!,
      mockAdminContext.user.id
    );
    const declinedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: declinedCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });
    const sendMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: sendCandidateId,
      platformId: 2,
      subject: "Goedgekeurd voor later",
      content: "Dit bericht is al goedgekeurd.",
      language: "nl",
      status: "approved",
    });
    await db.createMessageApproval({
      messageId: sendMessageId,
      campaignId: testCampaignId,
      candidateId: sendCandidateId,
      userId: mockAdminContext.user.id,
      decision: "approved",
      decisionReason: "Approved before identity-level stop response.",
      approvedSubjectSnapshot: "Goedgekeurd voor later",
      approvedContentSnapshot: "Dit bericht is al goedgekeurd.",
      decidedAt: new Date(),
    });
    await caller.messages.recordResponse({
      messageId: declinedMessageId,
      rawContent: "Ik ben helaas niet beschikbaar.",
      classification: "unavailable",
      confidence: 90,
    });

    await expect(
      caller.messages.recordSendAttempt({
        messageId: sendMessageId,
        status: "succeeded",
        confirmationText:
          "Manual platform confirmation should be blocked by identity stop.",
      })
    ).rejects.toThrow(/stop or pause outreach/i);

    const attempts = await db.getMessageSendAttemptsForCandidate(
      sendCandidateId
    );
    expect(
      attempts.some(
        attempt =>
          attempt.status === "blocked" &&
          attempt.errorMessage?.includes("stop or pause outreach")
      )
    ).toBe(true);
  });

  it("should block successful send attempts when platform message rate limit is reached", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const { consumeMessageLimit, resetMessageLimit } = await import(
      "./services/rateLimiter"
    );
    await resetMessageLimit("Nationale Hulpgids");

    const suffix = Date.now();
    const limitedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 2,
      name: `Rate Limited Candidate ${suffix}`,
      email: `rate-limited-${suffix}@example.com`,
      location: "Den Haag",
      compatibilityScore: 81,
      status: "matched",
    });
    const limitedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: limitedCandidateId,
      platformId: 2,
      subject: "Rate limit test",
      content: "Dit bericht mag alleen binnen het platformlimiet.",
      language: "nl",
      status: "queued",
    });

    await caller.messages.approve({
      messageId: limitedMessageId,
      reason: "Approved content, but platform limiter must still apply",
    });

    for (let i = 0; i < 5; i++) {
      await consumeMessageLimit("Nationale Hulpgids", 1);
    }

    await expect(
      caller.messages.recordSendAttempt({
        messageId: limitedMessageId,
        status: "succeeded",
        confirmationText: "Manual confirmation from platform screen",
      })
    ).rejects.toThrow(/rate limit/i);

    const attempts =
      await db.getMessageSendAttemptsForCandidate(limitedCandidateId);
    expect(
      attempts.some(
        attempt =>
          attempt.status === "blocked" &&
          attempt.errorMessage?.includes("Message rate limit exceeded")
      )
    ).toBe(true);

    const ledger = await caller.campaigns.getOperatingLedger({
      campaignId: testCampaignId,
    });
    expect(
      ledger.rateLimitEvents.some(
        (event: any) =>
          event.eventType === "message_send_blocked" &&
          event.severity === "blocked"
      )
    ).toBe(true);
    expect(
      ledger.readiness.checks.some(
        (check: any) =>
          check.key === "rate-limit-safety" && check.status === "blocked"
      )
    ).toBe(true);

    await resetMessageLimit("Nationale Hulpgids");
  });

  it("should record and classify candidate responses", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const result = await caller.messages.recordResponse({
      messageId: testMessageId,
      rawContent: "Ja, ik heb interesse. Kunt u meer informatie sturen?",
    });

    const repliedMessages = await caller.messages.listAll({
      status: "replied",
      campaignId: testCampaignId,
    });
    const responses = await caller.responses.list();

    expect(result.success).toBe(true);
    expect(["interested", "more_info"]).toContain(result.classification);
    expect(result.confidence).toBeGreaterThan(0);
    expect(
      repliedMessages.some((message: any) => message.id === testMessageId)
    ).toBe(true);
    expect(
      repliedMessages.some(
        (message: any) =>
          message.id === testMessageId &&
          message.latestCandidateResponse?.classification ===
            result.classification
      )
    ).toBe(true);
    expect(
      responses.some(
        (response: any) =>
          response.messageId === testMessageId &&
          response.classification === result.classification
      )
    ).toBe(true);
  });

  it("should list recorded responses in the response inbox", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const responses = await caller.responses.list();

    expect(Array.isArray(responses)).toBe(true);
    expect(
      responses.some((response: any) => response.messageId === testMessageId)
    ).toBe(true);
  });

  it("should filter and cap response inbox results", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Response Filter Campaign ${suffix}`,
      description: "Response filters should keep the inbox bounded",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const interestedCandidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Interested Response Candidate ${suffix}`,
      email: `interested-response-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 87,
      status: "matched",
    });
    const moreInfoCandidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `More Info Response Candidate ${suffix}`,
      email: `more-info-response-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 82,
      status: "matched",
    });
    const interestedMessageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId: interestedCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });
    const moreInfoMessageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId: moreInfoCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });

    const interested = await caller.messages.recordResponse({
      messageId: interestedMessageId,
      rawContent: "Ik heb interesse en hoor graag meer.",
      classification: "interested",
      confidence: 95,
    });
    await caller.messages.recordResponse({
      messageId: moreInfoMessageId,
      rawContent: "Kunt u eerst meer informatie sturen?",
      classification: "more_info",
      confidence: 88,
    });

    const filtered = await caller.responses.list({
      campaignId: campaign.id,
      classification: "interested",
      limit: 1,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(interested.responseId);
    expect(filtered[0].classification).toBe("interested");
    expect(filtered[0].campaign?.id).toBe(campaign.id);
  });

  it("should search bounded user-owned candidate picker options", async () => {
    const ownerCaller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const suffix = Date.now();
    const campaign = await ownerCaller.campaigns.create({
      title: `Candidate Picker ${suffix}`,
      description: "Candidate picker should be lean and searchable",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
    });
    const uniqueCandidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Picker Search Unique ${suffix}`,
      email: `picker-unique-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 92,
      status: "matched",
    });
    await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Picker Search Other ${suffix}`,
      email: `picker-other-${suffix}@example.com`,
      location: "Delft",
      compatibilityScore: 71,
      status: "matched",
    });

    const matches = await ownerCaller.candidates.searchForPicker({
      search: `unique ${suffix}`,
      campaignId: campaign.id,
      limit: 1,
    });
    const otherMatches = await otherCaller.candidates.searchForPicker({
      search: `unique ${suffix}`,
      limit: 10,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(uniqueCandidateId);
    expect(matches[0].campaign?.id).toBe(campaign.id);
    expect(matches[0]).not.toHaveProperty("email");
    expect(matches[0]).not.toHaveProperty("phone");
    expect(otherMatches).toHaveLength(0);
  });

  it("should record candidate-scoped responses without a linked message", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Direct Reply Candidate ${suffix}`,
      email: `direct-reply-${suffix}@example.com`,
      location: "Amersfoort",
      compatibilityScore: 86,
      status: "matched",
    });
    const prepared = await caller.followUps.prepare({
      candidateId,
      subject: "Korte opvolging",
      content: "Beste kandidaat, ik volg graag kort op.",
    });

    const rawContent =
      "Dank voor uw bericht, maar ik ben voorlopig niet beschikbaar.";
    const recorded = await caller.responses.recordCandidateResponse({
      candidateId,
      rawContent,
      classification: "unavailable",
      confidence: 92,
      source: "platform",
    });

    expect(recorded.success).toBe(true);
    expect(recorded.classification).toBe("unavailable");
    expect(recorded.cancelledFollowUpIds).toContain(prepared.followUpId);

    const responses = await caller.responses.list();
    const inboxResponse = responses.find(
      (response: any) => response.id === recorded.responseId
    );
    expect(inboxResponse?.candidateId).toBe(candidateId);
    expect(inboxResponse?.messageId).toBeNull();
    expect(inboxResponse?.classification).toBe("unavailable");
    expect(inboxResponse?.source).toBe("platform");

    const followUps = await db.getFollowUpsForCandidate(candidateId);
    expect(
      followUps.find(followUp => followUp.id === prepared.followUpId)?.status
    ).toBe("cancelled");

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    const responseAudit = auditEvents.find(
      (event: any) =>
        event.entityType === "candidateResponse" &&
        event.entityId === recorded.responseId &&
        event.action === "candidate.response_recorded"
    );
    expect(responseAudit?.afterState).toContain('"contentLength"');
    expect(responseAudit?.afterState).not.toContain(rawContent);
  });

  it("should block cross-user access to response, follow-up, and audit surfaces", async () => {
    const ownerCaller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Cross User Candidate ${suffix}`,
      email: `cross-user-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 83,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });

    const response = await ownerCaller.messages.recordResponse({
      messageId,
      rawContent: "Dank voor uw bericht, ik wil graag meer informatie.",
      classification: "more_info",
      confidence: 90,
    });
    const prepared = await ownerCaller.followUps.prepare({
      candidateId,
      subject: "Korte opvolging",
      content: "Beste kandidaat, ik stuur graag meer informatie.",
    });

    await expect(
      otherCaller.messages.recordResponse({
        messageId,
        rawContent: "Unauthorized response update",
      })
    ).rejects.toThrow(/message not found/i);
    await expect(
      otherCaller.responses.recordCandidateResponse({
        candidateId,
        rawContent: "Unauthorized candidate response",
      })
    ).rejects.toThrow(/candidate not found/i);
    await expect(
      otherCaller.responses.updateClassification({
        responseId: response.responseId,
        classification: "interested",
      })
    ).rejects.toThrow(/response not found/i);
    await expect(
      otherCaller.followUps.prepare({
        candidateId,
        subject: "Unauthorized follow-up",
        content: "This should not be created.",
      })
    ).rejects.toThrow(/candidate not found/i);
    await expect(
      otherCaller.followUps.approve({ followUpId: prepared.followUpId })
    ).rejects.toThrow(/follow-up not found/i);
    await expect(
      otherCaller.audit.getForCampaign({ campaignId: testCampaignId })
    ).rejects.toThrow(/campaign not found/i);
    await expect(
      otherCaller.audit.getForCandidate({ candidateId })
    ).rejects.toThrow(/candidate not found/i);
    await expect(
      otherCaller.audit.getForMessage({ messageId })
    ).rejects.toThrow(/message not found/i);

    const otherResponses = await otherCaller.responses.list();
    const otherDueFollowUps = await otherCaller.followUps.getDue();

    expect(
      otherResponses.some((entry: any) => entry.id === response.responseId)
    ).toBe(false);
    expect(
      otherDueFollowUps.some(
        (followUp: any) => followUp.id === prepared.followUpId
      )
    ).toBe(false);
  });

  it("should filter and limit campaign audit events server-side", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = `audit-filter-${Date.now()}`;
    const baseTime = Date.now();
    await db.createAuditEvent({
      userId: mockAdminContext.user.id,
      campaignId: testCampaignId,
      entityType: "campaign",
      entityId: testCampaignId,
      action: "audit_filter.low",
      actor: "user",
      source: "test",
      riskLevel: "low",
      afterState: JSON.stringify({ marker: suffix, sequence: 1 }),
      createdAt: new Date(baseTime - 30_000),
    });
    await db.createAuditEvent({
      userId: mockAdminContext.user.id,
      campaignId: testCampaignId,
      entityType: "campaign",
      entityId: testCampaignId,
      action: "audit_filter.medium",
      actor: "user",
      source: "test",
      riskLevel: "medium",
      afterState: JSON.stringify({ marker: suffix, sequence: 2 }),
      createdAt: new Date(baseTime - 20_000),
    });
    await db.createAuditEvent({
      userId: mockAdminContext.user.id,
      campaignId: testCampaignId,
      entityType: "campaign",
      entityId: testCampaignId,
      action: "audit_filter.high",
      actor: "user",
      source: "test",
      riskLevel: "high",
      afterState: JSON.stringify({ marker: suffix, sequence: 3 }),
      createdAt: new Date(baseTime - 10_000),
    });

    const latestTwo = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
      search: suffix,
      limit: 2,
    });
    expect(latestTwo).toHaveLength(2);
    expect(latestTwo.map((event: any) => event.riskLevel)).toEqual([
      "high",
      "medium",
    ]);
    expect(JSON.stringify(latestTwo)).toContain(suffix);

    const highOnly = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
      search: suffix,
      riskLevel: "high",
      limit: 10,
    });
    expect(highOnly).toHaveLength(1);
    expect(highOnly[0].action).toBe("audit_filter.high");
  });

  it("should manually reclassify a response and cancel unsafe follow-ups", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Manual Classification Candidate ${suffix}`,
      email: `manual-classification-${suffix}@example.com`,
      location: "Zwolle",
      compatibilityScore: 81,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });

    const response = await caller.messages.recordResponse({
      messageId,
      rawContent: "Dank voor uw bericht.",
      classification: "unknown",
      confidence: 40,
    });
    const prepared = await caller.followUps.prepare({
      candidateId,
      subject: "Korte opvolging",
      content: "Beste kandidaat, ik volg mijn eerdere bericht kort op.",
    });

    const reclassificationReason =
      "Candidate reply was manually reviewed as a decline with private context.";
    const reclassified = await caller.responses.updateClassification({
      responseId: response.responseId,
      classification: "not_interested",
      reason: reclassificationReason,
    });

    expect(reclassified.success).toBe(true);
    expect(reclassified.classification).toBe("not_interested");
    expect(reclassified.cancelledFollowUpIds).toContain(prepared.followUpId);

    const responses = await caller.responses.list();
    expect(
      responses.some(
        (entry: any) =>
          entry.id === response.responseId &&
          entry.classification === "not_interested" &&
          entry.confidence === 100
      )
    ).toBe(true);

    const followUps = await db.getFollowUpsForCandidate(candidateId);
    expect(
      followUps.find(followUp => followUp.id === prepared.followUpId)?.status
    ).toBe("cancelled");

    const messages = await db.getAllMessages(mockAdminContext.user.id);
    expect(
      messages.find((message: any) => message.id === prepared.messageId)?.status
    ).toBe("rejected");

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    const reclassifiedAudit = auditEvents.find(
      (event: any) =>
        event.entityId === response.responseId &&
        event.action === "candidate.response_reclassified"
    );
    expect(reclassifiedAudit).toBeDefined();
    expect(reclassifiedAudit?.afterState).toContain('"reasonLength"');
    expect(reclassifiedAudit?.afterState).not.toContain(
      reclassificationReason
    );
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === prepared.followUpId &&
          event.action === "follow_up.cancelled_by_response" &&
          event.source === "responses.updateClassification"
      )
    ).toBe(true);
  });

  it("should prepare and approve a follow-up draft without sending it", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const prepared = await caller.followUps.prepare({
      candidateId: testCandidateId,
      subject: "Vervolgvraag",
      content: "Beste kandidaat, heeft u mijn eerdere bericht kunnen bekijken?",
    });

    expect(prepared.success).toBe(true);
    expect(prepared.followUpId).toBeGreaterThan(0);
    expect(prepared.messageId).toBeGreaterThan(0);

    const approved = await caller.followUps.approve({
      followUpId: prepared.followUpId,
    });

    expect(approved.success).toBe(true);
    expect(approved.approvalId).toBeGreaterThan(0);
  });

  it("should audit skipped follow-ups without leaking the free-text reason", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaignId = await db.createCampaign({
      userId: mockAdminContext.user.id,
      title: `Follow-up Skip Redaction ${suffix}`,
      description: "Follow-up skip reason should not be copied into audit",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Arnhem" }),
      status: "active",
    });
    const candidateId = await db.createCandidate({
      campaignId,
      platformId: 1,
      name: `Follow-up Skip Candidate ${suffix}`,
      email: `follow-up-skip-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 82,
      status: "matched",
    });
    const prepared = await caller.followUps.prepare({
      candidateId,
      subject: "Korte opvolging",
      content: "Beste kandidaat, ik volg mijn eerdere bericht kort op.",
    });
    const skipReason = `Manual skip because of private scheduling context token=${suffix}`;

    const skipped = await caller.followUps.skip({
      followUpId: prepared.followUpId,
      reason: skipReason,
    });

    expect(skipped.success).toBe(true);
    const auditEvents = await caller.audit.getForCampaign({ campaignId });
    const skipAudit = auditEvents.find(
      (event: any) =>
        event.entityId === prepared.followUpId &&
        event.action === "follow_up.skipped"
    );
    expect(skipAudit).toBeDefined();
    expect(skipAudit?.afterState).toContain('"reasonLength"');
    expect(skipAudit?.afterState).not.toContain(skipReason);
    expect(skipAudit?.afterState).not.toContain(`token=${suffix}`);
  });

  it("should block follow-up approval for dry-run campaigns", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const indeedId = await getPlatformId("Indeed");
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Dry Run Follow-up Campaign ${suffix}`,
      description: "Follow-up approval should be blocked in dry-run mode",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
        operationMode: "dry_run",
      }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: indeedId,
      name: `Dry Run Follow-up Candidate ${suffix}`,
      location: "Arnhem",
      compatibilityScore: 84,
      status: "matched",
    });
    const prepared = await caller.followUps.prepare({
      candidateId,
      subject: "Dry-run opvolging",
      content: "Dit opvolgingsconcept mag in dry-run niet worden goedgekeurd.",
    });

    await expect(
      caller.followUps.approve({
        followUpId: prepared.followUpId,
        reason: "Dry run should block follow-up approval",
      })
    ).rejects.toThrow(/dry-run mode/i);

    const approvals = await db.getMessageApprovalsByMessageId(
      prepared.messageId
    );
    const auditEvents = await caller.audit.getForCampaign({
      campaignId: campaign.id,
    });

    expect(approvals).toHaveLength(0);
    expect(
      auditEvents.some(
        (event: any) => event.action === "follow_up.approval_blocked_dry_run"
      )
    ).toBe(true);
  });

  it("should require acknowledgement before approving a sensitive follow-up draft", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Sensitive Follow-up Candidate ${suffix}`,
      email: `sensitive-follow-up-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 82,
      status: "matched",
    });

    const prepared = await caller.followUps.prepare({
      candidateId,
      subject: "Opvolging persoonlijke verzorging",
      content:
        "Beste kandidaat, ik volg mijn eerdere bericht op over medicatie en persoonlijke verzorging.",
    });

    await expect(
      caller.followUps.approve({ followUpId: prepared.followUpId })
    ).rejects.toThrow(/sensitive care or personal context/i);

    const approved = await caller.followUps.approve({
      followUpId: prepared.followUpId,
      sensitiveContentAcknowledged: true,
      reason: "Sensitive follow-up content reviewed",
    });

    expect(approved.success).toBe(true);
    expect(approved.approvalId).toBeGreaterThan(0);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === prepared.followUpId &&
          event.action === "follow_up.approved" &&
          event.afterState?.includes('"sensitiveContentAcknowledged":true')
      )
    ).toBe(true);
  });

  it("should block duplicate active follow-up drafts for the same candidate sequence", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const followUpCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Follow-up Duplicate Candidate ${suffix}`,
      email: `follow-up-duplicate-${suffix}@example.com`,
      location: "Nijmegen",
      compatibilityScore: 84,
      status: "matched",
    });

    const prepared = await caller.followUps.prepare({
      candidateId: followUpCandidateId,
      subject: "Eerste opvolging",
      content: "Beste kandidaat, ik volg mijn eerdere bericht kort op.",
      sequence: 1,
    });

    expect(prepared.success).toBe(true);

    await expect(
      caller.followUps.prepare({
        candidateId: followUpCandidateId,
        subject: "Tweede opvolging",
        content: "Beste kandidaat, nogmaals een opvolging.",
        sequence: 1,
      })
    ).rejects.toThrow(/active follow-up draft already exists/i);

    const followUps = await db.getFollowUpsForCandidate(followUpCandidateId);
    expect(followUps.filter(followUp => followUp.sequence === 1)).toHaveLength(
      1
    );

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === prepared.followUpId &&
          event.action === "follow_up.prepare_duplicate_blocked"
      )
    ).toBe(true);
  });

  it("should suggest stale no-response follow-ups and suppress suggestions after drafting", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const oldContactAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const staleCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Stale Follow-up Candidate ${suffix}`,
      email: `stale-follow-up-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 84,
      status: "contacted",
    });
    const staleMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: staleCandidateId,
      platformId: 1,
      subject: "Eerste bericht",
      content: "Eerste gecontroleerde outreach.",
      language: "nl",
      status: "sent",
      sentAt: oldContactAt,
      deliveredAt: oldContactAt,
    });
    const respondedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Responded Follow-up Candidate ${suffix}`,
      email: `responded-follow-up-${suffix}@example.com`,
      location: "Arnhem",
      compatibilityScore: 81,
      status: "responded",
    });
    await db.createMessage({
      campaignId: testCampaignId,
      candidateId: respondedCandidateId,
      platformId: 1,
      subject: "Eerste bericht",
      content: "Eerste gecontroleerde outreach.",
      language: "nl",
      status: "sent",
      sentAt: oldContactAt,
      deliveredAt: oldContactAt,
    });
    await db.createCandidateResponse({
      candidateId: respondedCandidateId,
      messageId: null,
      platformId: 1,
      rawContent: "Bedankt, ik kom erop terug.",
      normalizedContent: "Bedankt, ik kom erop terug.",
      classification: "more_info",
      confidence: 80,
      source: "manual",
      receivedAt: new Date(),
    });

    const suggestions = await caller.followUps.getSuggestions({
      minDaysSinceContact: 5,
      limit: 25,
    });
    const staleSuggestion = suggestions.find(
      (suggestion: any) => suggestion.candidateId === staleCandidateId
    );

    expect(staleSuggestion).toBeTruthy();
    expect(staleSuggestion?.messageId).toBe(staleMessageId);
    expect(staleSuggestion?.daysSinceContact).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(staleSuggestion)).not.toContain(
      `stale-follow-up-${suffix}@example.com`
    );
    expect(
      suggestions.some(
        (suggestion: any) => suggestion.candidateId === respondedCandidateId
      )
    ).toBe(false);

    const prepared = await caller.followUps.prepare({
      candidateId: staleCandidateId,
      subject: "Vriendelijke opvolging",
      content: "Beste kandidaat, ik volg mijn eerdere bericht kort op.",
      sequence: staleSuggestion!.sequence,
    });
    expect(prepared.success).toBe(true);

    const suggestionsAfterPrepare = await caller.followUps.getSuggestions({
      minDaysSinceContact: 5,
      limit: 25,
    });
    expect(
      suggestionsAfterPrepare.some(
        (suggestion: any) => suggestion.candidateId === staleCandidateId
      )
    ).toBe(false);

    const dueFollowUps = await caller.followUps.getDue();
    expect(
      dueFollowUps.some((followUp: any) => followUp.id === prepared.followUpId)
    ).toBe(true);
  });

  it("should block follow-up drafts after a candidate declines outreach", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const decliningCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Declining Follow-up Candidate ${suffix}`,
      email: `declining-follow-up-${suffix}@example.com`,
      location: "Eindhoven",
      compatibilityScore: 76,
      status: "matched",
    });
    const decliningMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: decliningCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });

    await caller.messages.recordResponse({
      messageId: decliningMessageId,
      rawContent: "Dank u, maar ik heb geen interesse.",
      classification: "not_interested",
      confidence: 95,
    });

    await expect(
      caller.followUps.prepare({
        candidateId: decliningCandidateId,
        subject: "Toch nog een opvolging",
        content: "Beste kandidaat, ik volg toch nog even op.",
      })
    ).rejects.toThrow(/blocked because the latest candidate response/i);

    const followUps = await db.getFollowUpsForCandidate(decliningCandidateId);
    expect(followUps).toHaveLength(0);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === decliningCandidateId &&
          event.action === "follow_up.prepare_blocked_by_response"
      )
    ).toBe(true);
  });

  it("should block and cancel follow-ups across candidate identity sources after a decline", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const sharedEmail = `identity-follow-up-stop-${suffix}@example.com`;
    const declinedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Identity Follow-up Declined Candidate ${suffix}`,
      email: sharedEmail,
      location: "Eindhoven",
      compatibilityScore: 86,
      status: "matched",
    });
    const linkedCandidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 2,
      name: `Identity Follow-up Linked Candidate ${suffix}`,
      email: sharedEmail,
      location: "Eindhoven",
      compatibilityScore: 84,
      status: "matched",
    });
    await db.getOrCreateCandidateIdentity(
      (await db.getCandidateById(declinedCandidateId))!,
      mockAdminContext.user.id
    );
    await db.getOrCreateCandidateIdentity(
      (await db.getCandidateById(linkedCandidateId))!,
      mockAdminContext.user.id
    );
    const linkedFollowUp = await caller.followUps.prepare({
      candidateId: linkedCandidateId,
      subject: "Korte opvolging",
      content: "Beste kandidaat, ik volg mijn eerdere bericht kort op.",
    });
    const declinedMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId: declinedCandidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });

    const response = await caller.messages.recordResponse({
      messageId: declinedMessageId,
      rawContent: "Dank u, maar ik heb geen interesse.",
      classification: "not_interested",
      confidence: 95,
    });

    const linkedFollowUps = await db.getFollowUpsForCandidate(linkedCandidateId);
    expect(
      linkedFollowUps.find(followUp => followUp.id === linkedFollowUp.followUpId)
        ?.status
    ).toBe("cancelled");

    await expect(
      caller.followUps.prepare({
        candidateId: linkedCandidateId,
        subject: "Toch nog een opvolging",
        content: "Beste kandidaat, ik volg toch nog even op.",
      })
    ).rejects.toThrow(/blocked because the latest candidate response/i);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === linkedFollowUp.followUpId &&
          event.action === "follow_up.cancelled_by_response" &&
          event.afterState?.includes(`"responseId":${response.responseId}`) &&
          event.afterState?.includes(
            `"followUpCandidateId":${linkedCandidateId}`
          )
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === linkedCandidateId &&
          event.action === "follow_up.prepare_blocked_by_response"
      )
    ).toBe(true);
  });

  it("should cancel scheduled follow-ups when a candidate declines after drafting", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const candidateId = await db.createCandidate({
      campaignId: testCampaignId,
      platformId: 1,
      name: `Late Decline Follow-up Candidate ${suffix}`,
      email: `late-decline-follow-up-${suffix}@example.com`,
      location: "Tilburg",
      compatibilityScore: 79,
      status: "matched",
    });
    const originalMessageId = await db.createMessage({
      campaignId: testCampaignId,
      candidateId,
      platformId: 1,
      subject: "Kennismaking",
      content: "Beste kandidaat, we maken graag kennis.",
      language: "nl",
      status: "sent",
    });

    const prepared = await caller.followUps.prepare({
      candidateId,
      subject: "Opvolging",
      content: "Beste kandidaat, ik volg mijn eerdere bericht kort op.",
    });

    const response = await caller.messages.recordResponse({
      messageId: originalMessageId,
      rawContent: "Dank voor uw bericht, maar ik ben niet beschikbaar.",
      classification: "unavailable",
      confidence: 92,
    });

    expect(response.cancelledFollowUpIds).toContain(prepared.followUpId);

    const followUps = await db.getFollowUpsForCandidate(candidateId);
    const cancelledFollowUp = followUps.find(
      followUp => followUp.id === prepared.followUpId
    );
    expect(cancelledFollowUp?.status).toBe("cancelled");

    const messages = await db.getAllMessages(mockAdminContext.user.id);
    const rejectedDraft = messages.find(
      (message: any) => message.id === prepared.messageId
    );
    expect(rejectedDraft?.status).toBe("rejected");

    await expect(
      caller.followUps.approve({ followUpId: prepared.followUpId })
    ).rejects.toThrow(/no longer active/i);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === prepared.followUpId &&
          event.action === "follow_up.cancelled_by_response"
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event: any) =>
          event.entityId === prepared.followUpId &&
          event.action === "follow_up.approval_blocked_inactive"
      )
    ).toBe(true);
  });

  it("should record and list durable queue job records", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const recorded = await caller.queue.recordJob({
      queueName: "messages",
      jobType: "test-ledger-job",
      status: "waiting",
      campaignId: testCampaignId,
      messageId: testMessageId,
      payload: { test: true },
    });

    expect(recorded.success).toBe(true);

    const jobs = await caller.queue.getDurableJobs({
      queueName: "messages",
    });

    expect(jobs.some((job: any) => job.id === recorded.id)).toBe(true);

    const limitedJobs = await caller.queue.getDurableJobs({
      queueName: "messages",
      limit: 1,
    });

    expect(limitedJobs.length).toBeLessThanOrEqual(1);
  });

  it("should redact sensitive durable queue payload fields and truncate oversized text", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const secretValue = "top-secret-queue-token";
    const recorded = await caller.queue.recordJob({
      queueName: "messages",
      jobType: "sensitive-payload-job",
      status: "failed",
      campaignId: testCampaignId,
      payload: {
        password: secretValue,
        apiKey: secretValue,
        sessionData: { cookie: secretValue },
        messageContent: secretValue,
        safeField: "visible operational value",
        large: "x".repeat(15000),
      },
      errorMessage: "e".repeat(5000),
    });

    const jobs = await caller.queue.getDurableJobs({
      queueName: "messages",
      status: "failed",
      limit: 10,
    });
    const persisted = jobs.find((job: any) => job.id === recorded.id);

    expect(persisted).toBeDefined();
    expect(persisted.payloadJson).toContain("[redacted]");
    expect(persisted.payloadJson).toContain("visible operational value");
    expect(persisted.payloadJson).not.toContain(secretValue);
    expect(persisted.payloadJson.length).toBeLessThanOrEqual(12200);
    expect(persisted.errorMessage).toContain("[truncated]");
    expect(persisted.errorMessage.length).toBeLessThanOrEqual(2014);
  });

  it("should summarize owner-scoped queue health without leaking sensitive errors", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const secretValue = `queue-health-secret-${Date.now()}`;

    const recorded = await caller.queue.recordJob({
      queueName: "discovery",
      jobType: "health-discovery-failure",
      status: "failed",
      campaignId: testCampaignId,
      errorMessage: `Discovery failed token=${secretValue}`,
    });
    const otherRecorded = await otherCaller.queue.recordJob({
      queueName: "discovery",
      jobType: "other-user-failure",
      status: "failed",
      errorMessage: "Other user's queue failure",
    });

    const health = await caller.queue.getHealth({ limit: 50 });
    const discoveryHealth = health.queues.find(
      (queue: any) => queue.queueName === "discovery"
    );

    expect(discoveryHealth).toBeDefined();
    expect(discoveryHealth?.live).toHaveProperty("waiting");
    expect(discoveryHealth?.durable.failed).toBeGreaterThanOrEqual(1);
    expect(discoveryHealth?.failedLast24h).toBeGreaterThanOrEqual(1);
    expect(discoveryHealth?.lastFailedAt).toBeTruthy();
    expect(
      discoveryHealth?.recentErrors.some(
        (error: any) => error.id === recorded.id
      )
    ).toBe(true);
    expect(JSON.stringify(discoveryHealth)).toContain("token=[redacted]");
    expect(JSON.stringify(discoveryHealth)).not.toContain(secretValue);
    expect(otherRecorded.success).toBe(true);
    expect(JSON.stringify(health)).not.toContain("Other user's queue failure");
  });

  it("should cancel owner-scoped waiting queue jobs with audit and redacted notes", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const otherCaller = appRouter.createCaller(mockOtherUserContext);
    const secretValue = `cancel-secret-${Date.now()}`;

    const recorded = await caller.queue.recordJob({
      queueName: "discovery",
      jobType: "manual-review-discovery",
      status: "waiting",
      campaignId: testCampaignId,
      payload: { platformId: 1 },
    });

    await expect(
      otherCaller.queue.cancelJob({ id: recorded.id })
    ).rejects.toThrow(/not found/i);

    const cancelled = await caller.queue.cancelJob({
      id: recorded.id,
      reason: `Operator paused job token=${secretValue}`,
    });

    expect(cancelled.success).toBe(true);

    const jobs = await caller.queue.getDurableJobs({
      queueName: "discovery",
      status: "cancelled",
      limit: 20,
    });
    const cancelledJob = jobs.find((job: any) => job.id === recorded.id);

    expect(cancelledJob).toBeDefined();
    expect(cancelledJob?.errorMessage).toContain("token=[redacted]");
    expect(cancelledJob?.errorMessage).not.toContain(secretValue);

    const auditEvents = await caller.audit.getForCampaign({
      campaignId: testCampaignId,
    });
    const cancelAudit = auditEvents.find(
      (event: any) =>
        event.action === "queue.job_cancelled" &&
        event.entityId === recorded.id
    );

    expect(cancelAudit).toBeDefined();
    expect(cancelAudit?.afterState).toContain('"status":"cancelled"');
    expect(cancelAudit?.afterState).toContain('"reasonLength"');
    expect(cancelAudit?.afterState).not.toContain(secretValue);
  });

  it("should reject cancellation for active durable queue jobs", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const recorded = await caller.queue.recordJob({
      queueName: "messages",
      jobType: "active-send",
      status: "active",
      campaignId: testCampaignId,
      messageId: testMessageId,
    });

    await expect(caller.queue.cancelJob({ id: recorded.id })).rejects.toThrow(
      /waiting\/delayed/i
    );

    const activeJobs = await caller.queue.getDurableJobs({
      queueName: "messages",
      status: "active",
      limit: 20,
    });

    expect(activeJobs.some((job: any) => job.id === recorded.id)).toBe(true);
  });
});

describe("Platform Credentials Testing", () => {
  it.skip("should test connection with invalid credentials", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    // Test with obviously invalid credentials
    const result = await caller.platformCredentials.testConnection({
      platformId: 2, // Nationale Hulpgids
      email: "invalid@test.com",
      password: "wrongpassword",
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");

    // Invalid credentials should fail
    expect(result.success).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  }, 10000); // Increase timeout to 10 seconds for network operations

  it("should report public-only mode for platforms without authenticated connection testing", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const indeedId = await getPlatformId("Indeed");

    const result = await caller.platformCredentials.testConnection({
      platformId: indeedId,
      email: "test@test.com",
      password: "testpass",
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.message).toContain("public discovery only");
    expect(result.message).toContain("not marked connected");
  });

  it("should use scraper-based connection checks and avoid platform-specific branching", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const { PlatformScraperFactory } = await import("./services/platformScraper");
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");

    const testConnectionSpy = vi
      .spyOn(PlatformScraperFactory, "testConnection")
      .mockResolvedValue({
        success: true,
        supportsAuthenticatedAutomation: true,
        message: "Successfully authenticated with Nationale Hulpgids (mock)",
      });

    const result = await caller.platformCredentials.testConnection({
      platformId: nationaleHulpgidsId,
      email: "test@test.com",
      password: "testpass",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Nationale Hulpgids");
    expect(testConnectionSpy).toHaveBeenCalledTimes(1);
    expect(testConnectionSpy).toHaveBeenCalledWith("Nationale Hulpgids", {
      email: "test@test.com",
      password: "testpass",
    });
    const status = await caller.platformCredentials.getStatus();
    const nationaleStatus = status.find(
      entry => entry.platform.id === nationaleHulpgidsId
    );
    expect(nationaleStatus?.status).toBe("connected");
    expect(nationaleStatus?.latestEvent?.message).toContain("Nationale Hulpgids (mock)");
  });

  it("should validate and redact saved platform credentials", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    await expect(
      caller.platformCredentials.save({
        platformId: 1,
        email: "invalid-email",
        password: "valid-secret",
      })
    ).rejects.toThrow();

    await expect(
      caller.platformCredentials.save({
        platformId: 1,
        email: "person@example.com",
        password: "   ",
      })
    ).rejects.toThrow();

    const saved = await caller.platformCredentials.save({
      platformId: 1,
      email: "  PERSON@example.COM ",
      password: "top-secret-password",
    });

    expect(saved.id).toBeGreaterThan(0);

    const credentials = await caller.platformCredentials.list();
    const savedCredential = credentials.find(
      credential => credential.platformId === 1
    );

    expect(savedCredential?.email).toBe("person@example.com");
    expect(savedCredential?.isConnected).toBe(0);
    expect(JSON.stringify(savedCredential)).not.toContain(
      "top-secret-password"
    );
    expect(savedCredential).not.toHaveProperty("encryptedPassword");
    expect(savedCredential).not.toHaveProperty("apiKey");
    expect(savedCredential).not.toHaveProperty("sessionData");

    const status = await caller.platformCredentials.getStatus();
    const savedStatus = status.find(
      entry => entry.platform.id === savedCredential?.platformId
    );

    expect(savedStatus?.status).toBe("public_only_saved");
    expect(savedStatus?.capability.mode).toBe("public_only");
    expect(savedStatus?.capability.publicDiscoveryAvailable).toBe(true);
    expect(savedStatus?.capability.supportsAuthenticatedAutomation).toBe(false);

    const auditEvents = await db.getAuditEventsForEntity(
      mockAdminContext.user.id,
      "platformCredential",
      saved.id
    );
    const savedAudit = auditEvents.find(
      event => event.action === "credential.saved"
    );
    expect(savedAudit?.afterState).toContain('"emailDomain":"example.com"');
    expect(savedAudit?.afterState).toContain('"emailLength"');
    expect(savedAudit?.afterState).not.toContain("person@example.com");
  });

  it("should expose credential status without secrets", async () => {
    const caller = appRouter.createCaller(mockAdminContext);

    const status = await caller.platformCredentials.getStatus();

    expect(Array.isArray(status)).toBe(true);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("encryptedPassword");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("sessionData");
  });

  it("should expose bounded recent credential history without secret-like event messages", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const platformId = await getPlatformId("Indeed");
    const timestampBase = Date.now() + 60_000;

    await db.recordCredentialEvent({
      userId: mockAdminContext.user.id,
      platformId,
      eventType: "saved",
      status: "warning",
      message: "Older saved event",
      createdAt: new Date(timestampBase),
    });
    await db.recordCredentialEvent({
      userId: mockAdminContext.user.id,
      platformId,
      eventType: "tested",
      status: "warning",
      message: "Public discovery test event",
      createdAt: new Date(timestampBase + 1_000),
    });
    await db.recordCredentialEvent({
      userId: mockAdminContext.user.id,
      platformId,
      eventType: "failed",
      status: "error",
      message: "Connection failed password=swordfish",
      createdAt: new Date(timestampBase + 2_000),
    });
    await db.recordCredentialEvent({
      userId: mockAdminContext.user.id,
      platformId,
      eventType: "tested",
      status: "ok",
      message: "Newest connection test event",
      createdAt: new Date(timestampBase + 3_000),
    });

    const status = await caller.platformCredentials.getStatus();
    const savedStatus = status.find(entry => entry.platform.id === platformId);

    expect(savedStatus?.recentEvents).toHaveLength(3);
    expect(savedStatus?.latestEvent?.message).toBe(
      "Newest connection test event"
    );
    expect(savedStatus?.recentEvents.map(event => event.message)).toEqual([
      "Newest connection test event",
      "[redacted]",
      "Public discovery test event",
    ]);

    const serialized = JSON.stringify(savedStatus);
    expect(serialized).not.toContain("swordfish");
    expect(serialized).not.toContain("password=swordfish");
    expect(serialized).not.toContain("Older saved event");
  });
});

describe("Bulk Message Operations", () => {
  it("should skip duplicate or stopped candidates during bulk outreach drafting", async () => {
    const aiMatching = await import("./services/aiMatching");
    const generateSpy = vi
      .spyOn(aiMatching, "generateOutreachMessage")
      .mockResolvedValue({
        subject: "Veilige conceptboodschap",
        content: "Beste kandidaat, dit concept blijft in de reviewwachtrij.",
      });

    try {
      const caller = appRouter.createCaller(mockAdminContext);
      const suffix = Date.now();
      const campaign = await caller.campaigns.create({
        title: `Bulk Draft Guard Campaign ${suffix}`,
        description: "Bulk draft guard test campaign",
        targetPlatforms: JSON.stringify([1]),
        searchCriteria: JSON.stringify({
          location: "Amersfoort",
          compatibilityThreshold: 70,
          maxCandidates: 3,
          messageDrafting: {
            tonePreset: "warm",
            templateSnippet:
              "Mention evening availability, but keep the draft factual.",
          },
        }),
      });
      const [existingCandidateId, stoppedCandidateId, eligibleCandidateId] =
        await Promise.all([
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Existing Outreach Candidate ${suffix}`,
            email: `existing-outreach-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 95,
            status: "matched",
          }),
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Stopped Outreach Candidate ${suffix}`,
            email: `stopped-outreach-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 94,
            status: "matched",
          }),
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Eligible Outreach Candidate ${suffix}`,
            email: `eligible-outreach-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 93,
            status: "matched",
          }),
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Limit Skipped Candidate ${suffix}`,
            email: `limit-skipped-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 92,
            status: "matched",
          }),
        ]);

      await db.createMessage({
        campaignId: campaign.id,
        candidateId: existingCandidateId,
        platformId: 1,
        subject: "Bestaand concept",
        content: "Deze kandidaat heeft al een actief bericht.",
        language: "nl",
        status: "queued",
      });
      await db.createCandidateResponse({
        candidateId: stoppedCandidateId,
        platformId: 1,
        rawContent: "Geen interesse.",
        normalizedContent: "Geen interesse.",
        classification: "not_interested",
        confidence: 95,
        source: "manual",
        receivedAt: new Date(),
      });

      const result = await caller.messages.bulkOutreach({
        campaignId: campaign.id,
        language: "nl",
      });

      expect(result.success).toBe(true);
      expect(result.totalCandidates).toBe(4);
      expect(result.messagesQueued).toBe(1);
      expect(result.messagesFailed).toBe(0);
      expect(result.messagesSkippedExistingOutreach).toBe(1);
      expect(result.messagesSkippedStoppedOutreach).toBe(1);
      expect(result.messagesSkippedQualificationReview).toBe(0);
      expect(result.messagesSkippedByLimit).toBe(1);
      expect(result.messages[0].candidateId).toBe(eligibleCandidateId);
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: eligibleCandidateId }),
        "Bulk draft guard test campaign",
        "nl",
        {
          tonePreset: "warm",
          templateSnippet:
            "Mention evening availability, but keep the draft factual.",
        }
      );

      const campaignMessages = await db.getCampaignMessages(campaign.id);
      expect(
        campaignMessages.filter(
          message => message.candidateId === eligibleCandidateId
        )
      ).toHaveLength(1);

      const auditEvents = await caller.audit.getForCampaign({
        campaignId: campaign.id,
      });
      const bulkDraftAuditEvent = auditEvents.find(
        (event: any) => event.action === "message.bulk_outreach_drafted"
      );
      expect(bulkDraftAuditEvent?.afterState).toContain(
        '"skippedExistingOutreach":1'
      );
      expect(bulkDraftAuditEvent?.afterState).toContain(
        '"skippedStoppedOutreach":1'
      );
      expect(bulkDraftAuditEvent?.afterState).toContain(
        '"skippedQualificationReview":0'
      );
      expect(bulkDraftAuditEvent?.afterState).toContain('"skippedByLimit":1');
      expect(bulkDraftAuditEvent?.afterState).toContain(
        '"messageTonePreset":"warm"'
      );
      expect(bulkDraftAuditEvent?.afterState).toContain(
        '"templateSnippetProvided":true'
      );
      expect(bulkDraftAuditEvent?.afterState).not.toContain(
        "Mention evening availability"
      );
    } finally {
      generateSpy.mockRestore();
    }
  });

  it("should skip bulk outreach drafts for all sources in a stopped candidate identity", async () => {
    const aiMatching = await import("./services/aiMatching");
    const generateSpy = vi
      .spyOn(aiMatching, "generateOutreachMessage")
      .mockResolvedValue({
        subject: "Dit concept mag niet worden aangemaakt",
        content: "Een identity-level stop moet bulk drafting blokkeren.",
      });

    try {
      const caller = appRouter.createCaller(mockAdminContext);
      const suffix = Date.now();
      const sharedEmail = `bulk-identity-stop-${suffix}@example.com`;
      const campaign = await caller.campaigns.create({
        title: `Bulk Identity Stop Campaign ${suffix}`,
        description: "Bulk drafting should respect identity-level stop signals",
        targetPlatforms: JSON.stringify([1, 2]),
        searchCriteria: JSON.stringify({
          location: "Amersfoort",
          compatibilityThreshold: 70,
        }),
      });
      const stoppedCandidateId = await db.createCandidate({
        campaignId: campaign.id,
        platformId: 1,
        name: `Bulk Identity Stopped Candidate ${suffix}`,
        email: sharedEmail,
        location: "Amersfoort",
        compatibilityScore: 95,
        status: "matched",
      });
      const linkedCandidateId = await db.createCandidate({
        campaignId: campaign.id,
        platformId: 2,
        name: `Bulk Identity Linked Candidate ${suffix}`,
        email: sharedEmail,
        location: "Amersfoort",
        compatibilityScore: 94,
        status: "matched",
      });
      await db.getOrCreateCandidateIdentity(
        (await db.getCandidateById(stoppedCandidateId))!,
        mockAdminContext.user.id
      );
      await db.getOrCreateCandidateIdentity(
        (await db.getCandidateById(linkedCandidateId))!,
        mockAdminContext.user.id
      );
      await db.createCandidateResponse({
        candidateId: stoppedCandidateId,
        platformId: 1,
        rawContent: "Geen interesse.",
        normalizedContent: "Geen interesse.",
        classification: "not_interested",
        confidence: 95,
        source: "manual",
        receivedAt: new Date(),
      });

      const result = await caller.messages.bulkOutreach({
        campaignId: campaign.id,
        language: "nl",
      });

      expect(result.success).toBe(true);
      expect(result.totalCandidates).toBe(2);
      expect(result.messagesQueued).toBe(0);
      expect(result.messagesSkippedStoppedOutreach).toBe(2);
      expect(generateSpy).not.toHaveBeenCalled();

      const campaignMessages = await db.getCampaignMessages(campaign.id);
      expect(
        campaignMessages.some(
          message => message.candidateId === linkedCandidateId
        )
      ).toBe(false);
    } finally {
      generateSpy.mockRestore();
    }
  });

  it("should skip explicitly unqualified candidates during bulk outreach drafting", async () => {
    const aiMatching = await import("./services/aiMatching");
    const generateSpy = vi
      .spyOn(aiMatching, "generateOutreachMessage")
      .mockResolvedValue({
        subject: "Veilige conceptboodschap",
        content: "Alleen gekwalificeerde kandidaten krijgen een concept.",
      });

    try {
      const caller = appRouter.createCaller(mockAdminContext);
      const suffix = Date.now();
      const campaign = await caller.campaigns.create({
        title: `Bulk Qualification Gate Campaign ${suffix}`,
        description: "Bulk qualification gate test campaign",
        targetPlatforms: JSON.stringify([1]),
        searchCriteria: JSON.stringify({
          location: "Amersfoort",
          compatibilityThreshold: 70,
        }),
      });
      const [qualifiedCandidateId, notQualifiedCandidateId, reviewCandidateId] =
        await Promise.all([
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Bulk Qualified Candidate ${suffix}`,
            email: `bulk-qualified-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 95,
            status: "matched",
          }),
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Bulk Not Qualified Candidate ${suffix}`,
            email: `bulk-not-qualified-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 94,
            status: "matched",
          }),
          db.createCandidate({
            campaignId: campaign.id,
            platformId: 1,
            name: `Bulk Needs Review Candidate ${suffix}`,
            email: `bulk-needs-review-${suffix}@example.com`,
            location: "Amersfoort",
            compatibilityScore: 93,
            status: "matched",
          }),
        ]);

      await Promise.all([
        db.createCandidateQualificationDecision({
          campaignId: campaign.id,
          candidateId: qualifiedCandidateId,
          userId: mockAdminContext.user.id,
          decision: "qualified",
          reason: "Relevant campaign evidence supports outreach.",
          sensitiveAssumptionsAcknowledged: 1,
        }),
        db.createCandidateQualificationDecision({
          campaignId: campaign.id,
          candidateId: notQualifiedCandidateId,
          userId: mockAdminContext.user.id,
          decision: "not_qualified",
          reason: "Relevant campaign evidence does not support outreach.",
          sensitiveAssumptionsAcknowledged: 0,
        }),
        db.createCandidateQualificationDecision({
          campaignId: campaign.id,
          candidateId: reviewCandidateId,
          userId: mockAdminContext.user.id,
          decision: "needs_review",
          reason: "Relevant campaign evidence still needs review.",
          sensitiveAssumptionsAcknowledged: 0,
        }),
      ]);

      const result = await caller.messages.bulkOutreach({
        campaignId: campaign.id,
        language: "nl",
      });

      expect(result.success).toBe(true);
      expect(result.totalCandidates).toBe(3);
      expect(result.messagesQueued).toBe(1);
      expect(result.messagesSkippedQualificationReview).toBe(2);
      expect(result.messages[0].candidateId).toBe(qualifiedCandidateId);
      expect(generateSpy).toHaveBeenCalledTimes(1);

      const campaignMessages = await db.getCampaignMessages(campaign.id);
      expect(
        campaignMessages.some(
          message => message.candidateId === notQualifiedCandidateId
        )
      ).toBe(false);
      expect(
        campaignMessages.some(
          message => message.candidateId === reviewCandidateId
        )
      ).toBe(false);

      const auditEvents = await caller.audit.getForCampaign({
        campaignId: campaign.id,
      });
      const bulkDraftAuditEvent = auditEvents.find(
        (event: any) => event.action === "message.bulk_outreach_drafted"
      );
      expect(bulkDraftAuditEvent?.afterState).toContain(
        '"skippedQualificationReview":2'
      );
    } finally {
      generateSpy.mockRestore();
    }
  });

  it("should handle bulk status updates", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Bulk Approval Campaign ${suffix}`,
      description: "Bulk approval test campaign",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Deventer" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Bulk Approval Candidate ${suffix}`,
      email: `bulk-approval-${suffix}@example.com`,
      location: "Deventer",
      compatibilityScore: 80,
      status: "matched",
    });
    const messageIds = await Promise.all([
      db.createMessage({
        campaignId: campaign.id,
        candidateId,
        platformId: 1,
        subject: "Bulk bericht 1",
        content: "Dit is het eerste bulkbericht.",
        language: "nl",
        status: "queued",
      }),
      db.createMessage({
        campaignId: campaign.id,
        candidateId,
        platformId: 1,
        subject: "Bulk bericht 2",
        content: "Dit is het tweede bulkbericht.",
        language: "nl",
        status: "queued",
      }),
    ]);

    const result = await caller.messages.bulkUpdateStatus({
      messageIds,
      status: "approved",
      complianceAcknowledged: true,
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(messageIds.length);
  });

  it("should require compliance acknowledgement for every bulk approval", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Compliance Bulk Approval Campaign ${suffix}`,
      description: "Compliance bulk approval test campaign",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Leiden" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Compliance Bulk Candidate ${suffix}`,
      email: `compliance-bulk-${suffix}@example.com`,
      location: "Leiden",
      compatibilityScore: 81,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: 1,
      subject: "Bulk compliance bericht",
      content: "Dit bulkbericht vereist expliciete compliancecontrole.",
      language: "nl",
      status: "queued",
    });

    await expect(
      caller.messages.bulkUpdateStatus({
        messageIds: [messageId],
        status: "approved",
      })
    ).rejects.toThrow(/consent and platform-compliance acknowledgement/i);

    const result = await caller.messages.bulkUpdateStatus({
      messageIds: [messageId],
      status: "approved",
      complianceAcknowledged: true,
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
  });

  it("should require acknowledgement for sensitive bulk approvals", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Sensitive Bulk Approval Campaign ${suffix}`,
      description: "Sensitive bulk approval test campaign",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Breda" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Sensitive Bulk Candidate ${suffix}`,
      email: `sensitive-bulk-${suffix}@example.com`,
      location: "Breda",
      compatibilityScore: 82,
      status: "matched",
    });
    const messageId = await db.createMessage({
      campaignId: campaign.id,
      candidateId,
      platformId: 1,
      subject: "Hulpvraag met persoonlijke verzorging",
      content:
        "Dit bericht noemt persoonlijke verzorging en medicatie, dus bulkgoedkeuring vereist extra controle.",
      language: "nl",
      status: "queued",
    });

    await expect(
      caller.messages.bulkUpdateStatus({
        messageIds: [messageId],
        status: "approved",
        complianceAcknowledged: true,
      })
    ).rejects.toThrow(/sensitive care or personal context/i);

    const result = await caller.messages.bulkUpdateStatus({
      messageIds: [messageId],
      status: "approved",
      complianceAcknowledged: true,
      sensitiveContentAcknowledged: true,
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
  });

  it("should require safety acknowledgement for large bulk approvals", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    const suffix = Date.now();
    const campaign = await caller.campaigns.create({
      title: `Large Bulk Approval Campaign ${suffix}`,
      description: "Large bulk approval test campaign",
      targetPlatforms: JSON.stringify([1]),
      searchCriteria: JSON.stringify({ location: "Utrecht" }),
    });
    const candidateId = await db.createCandidate({
      campaignId: campaign.id,
      platformId: 1,
      name: `Large Bulk Candidate ${suffix}`,
      email: `large-bulk-${suffix}@example.com`,
      location: "Utrecht",
      compatibilityScore: 83,
      status: "matched",
    });
    const messageIds = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        db.createMessage({
          campaignId: campaign.id,
          candidateId,
          platformId: 1,
          subject: `Bulk bericht ${index + 1}`,
          content: `Dit is bulkbericht ${index + 1}.`,
          language: "nl",
          status: "queued",
        })
      )
    );

    await expect(
      caller.messages.bulkUpdateStatus({
        messageIds,
        status: "approved",
        complianceAcknowledged: true,
      })
    ).rejects.toThrow(/requires explicit safety acknowledgement/i);

    const result = await caller.messages.bulkUpdateStatus({
      messageIds,
      status: "approved",
      complianceAcknowledged: true,
      safetyAcknowledged: true,
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(messageIds.length);
  });
});
