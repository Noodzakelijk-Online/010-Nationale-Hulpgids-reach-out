import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  InsertUser,
  User,
  users,
  platforms,
  campaigns,
  candidates,
  messages,
  platformCredentials,
  matchFactors,
  followUps,
  candidateIdentities,
  candidateSources,
  campaignReadinessChecks,
  messageApprovals,
  messageSendAttempts,
  candidateResponses,
  candidateQualificationDecisions,
  candidateDuplicateResolutions,
  queueJobRecords,
  rateLimitEvents,
  credentialEvents,
  auditEvents,
  messageSnippets,
  Platform,
  Campaign,
  Candidate,
  Message,
  PlatformCredential,
  MatchFactor,
  FollowUp,
  CandidateIdentity,
  CandidateSource,
  CampaignReadinessCheck,
  MessageApproval,
  MessageSendAttempt,
  CandidateResponse,
  CandidateQualificationDecision,
  CandidateDuplicateResolution,
  QueueJobRecord,
  RateLimitEvent,
  CredentialEvent,
  AuditEvent,
  MessageSnippet,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getPlatformCapability } from "./services/platformCapabilities";
import {
  redactSecretLikeText,
  serializeSafeJson,
  truncateOperationalText,
} from "./services/safeSerialization";

let _db: ReturnType<typeof drizzle> | null = null;
const RECENT_CREDENTIAL_EVENT_LIMIT = 3;
const credentialEventSecretPattern =
  /\b(password|passphrase|api[-_\s]?key|token|session|cookie|authorization)\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]+/i;

type CandidateQualificationDecisionSummary = {
  id: number;
  candidateId: number;
  campaignId: number;
  userId: number;
  decision: CandidateQualificationDecision["decision"];
  sensitiveAssumptionsAcknowledged: boolean;
  createdAt: Date;
};

type CandidateDuplicateListSummary = {
  unresolvedCount: number;
  highestConfidence: number;
  reasons: string[];
  candidateIds: number[];
};

type CandidateDuplicateReviewExplanation = {
  summary: string;
  recommendedAction: "merge_if_same_person" | "manual_review";
  riskLevel: "high" | "medium" | "low";
  whyShown: string[];
  reviewChecklist: string[];
  falsePositiveSignals: string[];
};

type CandidateDuplicateReviewCandidate = {
  id: number;
  name: string;
  campaignId: number;
  compatibilityScore: number;
  status: string;
  location: string | null;
  campaign: {
    id: number;
    title: string;
    status: string;
  } | null;
  platform: {
    id: number;
    name: string;
  } | null;
};

const DEFAULT_PLATFORMS: Platform[] = [
  {
    id: 1,
    name: "Indeed",
    baseUrl: "https://www.indeed.com",
    authType: "credentials",
    isActive: 1,
    createdAt: new Date(0),
  },
  {
    id: 2,
    name: "Nationale Hulpgids",
    baseUrl: "https://www.nationalehulpgids.nl",
    authType: "credentials",
    isActive: 1,
    createdAt: new Date(0),
  },
  {
    id: 3,
    name: "PGBvacatures",
    baseUrl: "https://www.pgbvacatures.nl",
    authType: "credentials",
    isActive: 1,
    createdAt: new Date(0),
  },
  {
    id: 4,
    name: "Zorgbanen",
    baseUrl: "https://www.zorgbanen.nl",
    authType: "credentials",
    isActive: 1,
    createdAt: new Date(0),
  },
  {
    id: 5,
    name: "Jobbird",
    baseUrl: "https://www.jobbird.com",
    authType: "credentials",
    isActive: 1,
    createdAt: new Date(0),
  },
];

const DEFAULT_PLATFORM_INSERTS = DEFAULT_PLATFORMS.map(
  ({ id: _id, createdAt: _createdAt, ...platform }) => platform
);

type LocalStore = {
  users: User[];
  platforms: Platform[];
  campaigns: Campaign[];
  candidates: Candidate[];
  messages: Message[];
  platformCredentials: PlatformCredential[];
  matchFactors: MatchFactor[];
  followUps: FollowUp[];
  candidateIdentities: CandidateIdentity[];
  candidateSources: CandidateSource[];
  campaignReadinessChecks: CampaignReadinessCheck[];
  messageApprovals: MessageApproval[];
  messageSendAttempts: MessageSendAttempt[];
  candidateResponses: CandidateResponse[];
  candidateQualificationDecisions: CandidateQualificationDecision[];
  candidateDuplicateResolutions: CandidateDuplicateResolution[];
  queueJobRecords: QueueJobRecord[];
  rateLimitEvents: RateLimitEvent[];
  credentialEvents: CredentialEvent[];
  auditEvents: AuditEvent[];
  messageSnippets: MessageSnippet[];
  nextIds: {
    user: number;
    campaign: number;
    candidate: number;
    message: number;
    platformCredential: number;
    matchFactor: number;
    followUp: number;
    candidateIdentity: number;
    candidateSource: number;
    campaignReadinessCheck: number;
    messageApproval: number;
    messageSendAttempt: number;
    candidateResponse: number;
    candidateQualificationDecision: number;
    candidateDuplicateResolution: number;
    queueJobRecord: number;
    rateLimitEvent: number;
    credentialEvent: number;
    auditEvent: number;
    messageSnippet: number;
  };
};

const dateFields = new Set([
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
  "resolvedAt",
]);

let localStore: LocalStore | null = null;

function getLocalStorePath() {
  const localDataDir =
    process.env.LOCAL_DATA_DIR ||
    (process.env.NODE_ENV === "test" || process.env.VITEST
      ? path.resolve(process.cwd(), ".test-local-data")
      : path.join(
          process.env.APPDATA || os.tmpdir(),
          "NationaleHulpgidsReachOut"
        ));
  return path.join(localDataDir, "local-store.json");
}

function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(entry => reviveDates(entry)) as T;
  }
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  for (const [key, fieldValue] of Object.entries(record)) {
    if (fieldValue && typeof fieldValue === "object") {
      record[key] = reviveDates(fieldValue);
    } else if (dateFields.has(key) && typeof fieldValue === "string") {
      record[key] = new Date(fieldValue);
    }
  }
  return value;
}

function createEmptyLocalStore(): LocalStore {
  return {
    users: [],
    platforms: DEFAULT_PLATFORMS.map(platform => ({ ...platform })),
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
      messageSnippet: 1,
    },
  };
}

function getLocalStore(): LocalStore {
  if (localStore) return localStore;

  const storePath = getLocalStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const parsed = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      const loadedStore = reviveDates({
        ...createEmptyLocalStore(),
        ...parsed,
      }) as LocalStore;
      loadedStore.nextIds = {
        ...createEmptyLocalStore().nextIds,
        ...(parsed.nextIds ?? {}),
      };
      loadedStore.platforms = DEFAULT_PLATFORMS.map(platform => {
        return (
          loadedStore.platforms.find(stored => stored.name === platform.name) ??
          platform
        );
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

function nextLocalId(key: keyof LocalStore["nextIds"]) {
  const store = getLocalStore();
  const id = store.nextIds[key];
  store.nextIds[key] += 1;
  return id;
}

function createLocalUser(user: InsertUser): User {
  const now = new Date();
  return {
    id: nextLocalId("user"),
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
    lastSignedIn: user.lastSignedIn ?? now,
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const existing = store.users.find(
      storedUser => storedUser.openId === user.openId
    );
    if (existing) {
      Object.assign(existing, {
        name: user.name ?? existing.name,
        email: user.email ?? existing.email,
        loginMethod: user.loginMethod ?? existing.loginMethod,
        role: user.role ?? existing.role,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        updatedAt: new Date(),
      });
    } else {
      store.users.push(createLocalUser(user));
    }
    persistLocalStore();
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().users.find(user => user.openId === openId);
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Multi-platform reach-out tool database queries

// Platform queries
export async function getAllPlatforms() {
  const db = await getDb();
  if (!db)
    return getLocalStore().platforms.filter(
      platform => platform.isActive === 1
    );

  const configuredPlatforms = await db
    .select()
    .from(platforms)
    .where(eq(platforms.isActive, 1));
  if (configuredPlatforms.length > 0) return configuredPlatforms;

  try {
    for (const platform of DEFAULT_PLATFORM_INSERTS) {
      await db
        .insert(platforms)
        .values(platform)
        .onDuplicateKeyUpdate({
          set: {
            baseUrl: platform.baseUrl,
            authType: platform.authType,
            isActive: platform.isActive,
          },
        });
    }
    return db.select().from(platforms).where(eq(platforms.isActive, 1));
  } catch (error) {
    console.warn("[Database] Failed to seed default platforms:", error);
    return DEFAULT_PLATFORMS;
  }
}

export async function getPlatformById(id: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore().platforms.find(platform => platform.id === id);
  const result = await db
    .select()
    .from(platforms)
    .where(eq(platforms.id, id))
    .limit(1);
  return result[0];
}

export async function getPlatformByName(name: string) {
  const normalizedName = name.trim().toLowerCase();
  const allPlatforms = await getAllPlatforms();
  return allPlatforms.find(
    platform => platform.name.trim().toLowerCase() === normalizedName
  );
}

export async function resolvePlatformIdentity(input: {
  platformId?: number | null;
  platformName?: string | null;
}) {
  const platformById =
    input.platformId != null ? await getPlatformById(input.platformId) : null;
  const platformByName = input.platformName
    ? await getPlatformByName(input.platformName)
    : null;

  if (platformById && platformByName && platformById.id !== platformByName.id) {
    throw new Error(
      `Platform mismatch: platformId ${platformById.id} is ${platformById.name}, not ${platformByName.name}`
    );
  }

  return platformById ?? platformByName ?? null;
}

// Campaign queries
export async function getUserCampaigns(userId: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore()
      .campaigns.filter(campaign => campaign.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore().campaigns.find(campaign => campaign.id === id);
  const result = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  return result[0];
}

export async function createCampaign(campaign: typeof campaigns.$inferInsert) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localCampaign: Campaign = {
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
      updatedAt: campaign.updatedAt ?? now,
    };
    getLocalStore().campaigns.push(localCampaign);
    persistLocalStore();
    return localCampaign.id;
  }
  const result = await db.insert(campaigns).values(campaign);
  return Number(result[0].insertId);
}

export async function updateCampaign(id: number, updates: Partial<Campaign>) {
  const db = await getDb();
  if (!db) {
    const campaign = getLocalStore().campaigns.find(entry => entry.id === id);
    if (!campaign) throw new Error("Campaign not found");
    Object.assign(campaign, updates, { updatedAt: new Date() });
    persistLocalStore();
    return;
  }
  await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
}

export async function archiveCampaign(id: number, userId: number) {
  const campaign = await getCampaignById(id);
  if (!campaign || campaign.userId !== userId) {
    throw new Error("Campaign not found");
  }

  const db = await getDb();
  if (!db) {
    const now = new Date();
    getLocalStore()
      .followUps.filter(
        followUp =>
          followUp.campaignId === id && followUp.status === "scheduled"
      )
      .forEach(followUp => {
        followUp.status = "cancelled";
        followUp.updatedAt = now;
      });
  } else {
    await db
      .update(followUps)
      .set({ status: "cancelled" })
      .where(
        and(eq(followUps.campaignId, id), eq(followUps.status, "scheduled"))
      );
  }

  await updateCampaign(id, {
    status: "archived",
    isScheduled: 0,
    nextExecutionAt: null,
  });

  return campaign;
}

export async function deleteCampaign(id: number, userId: number) {
  const db = await getDb();
  const campaign = await getCampaignById(id);
  if (!campaign || campaign.userId !== userId) {
    throw new Error("Campaign not found");
  }

  if (!db) {
    const store = getLocalStore();
    const campaignCandidateIds = new Set(
      store.candidates
        .filter(candidate => candidate.campaignId === id)
        .map(candidate => candidate.id)
    );
    store.messages = store.messages.filter(
      message => message.campaignId !== id
    );
    store.candidateDuplicateResolutions =
      store.candidateDuplicateResolutions.filter(
        resolution =>
          !campaignCandidateIds.has(resolution.targetCandidateId) &&
          !campaignCandidateIds.has(resolution.sourceCandidateId)
      );
    store.candidates = store.candidates.filter(
      candidate => candidate.campaignId !== id
    );
    store.campaignReadinessChecks = store.campaignReadinessChecks.filter(
      check => check.campaignId !== id
    );
    store.followUps = store.followUps.filter(
      followUp => followUp.campaignId !== id
    );
    store.messageApprovals = store.messageApprovals.filter(
      approval => approval.campaignId !== id
    );
    store.messageSendAttempts = store.messageSendAttempts.filter(
      attempt => attempt.campaignId !== id
    );
    store.candidateQualificationDecisions =
      store.candidateQualificationDecisions.filter(
        decision => decision.campaignId !== id
      );
    store.queueJobRecords = store.queueJobRecords.filter(
      job => job.campaignId !== id
    );
    store.rateLimitEvents = store.rateLimitEvents.filter(
      event => event.campaignId !== id
    );
    store.auditEvents = store.auditEvents.filter(
      event => event.campaignId !== id
    );
    store.campaigns = store.campaigns.filter(
      entry => entry.id !== id || entry.userId !== userId
    );
    persistLocalStore();
    return;
  }

  await db.delete(auditEvents).where(eq(auditEvents.campaignId, id));
  await db.delete(rateLimitEvents).where(eq(rateLimitEvents.campaignId, id));
  await db.delete(queueJobRecords).where(eq(queueJobRecords.campaignId, id));
  await db
    .delete(messageSendAttempts)
    .where(eq(messageSendAttempts.campaignId, id));
  await db
    .delete(candidateQualificationDecisions)
    .where(eq(candidateQualificationDecisions.campaignId, id));
  await db.delete(messageApprovals).where(eq(messageApprovals.campaignId, id));
  await db
    .delete(campaignReadinessChecks)
    .where(eq(campaignReadinessChecks.campaignId, id));
  await db.delete(followUps).where(eq(followUps.campaignId, id));
  await db.delete(messages).where(eq(messages.campaignId, id));
  await db.delete(candidates).where(eq(candidates.campaignId, id));
  await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
}

// Candidate queries
export async function getCampaignCandidates(campaignId: number) {
  const db = await getDb();
  if (!db) {
    const campaignCandidates = getLocalStore()
      .candidates.filter(candidate => candidate.campaignId === campaignId)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    const qualificationSummaries =
      await getLatestCandidateQualificationSummariesByCandidateId(
        campaignCandidates.map(candidate => candidate.id)
      );
    return campaignCandidates.map(candidate => ({
      ...candidate,
      latestQualificationDecision:
        qualificationSummaries.get(candidate.id) ?? null,
    }));
  }
  const campaignCandidates = await db
    .select()
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId))
    .orderBy(desc(candidates.compatibilityScore));
  const qualificationSummaries =
    await getLatestCandidateQualificationSummariesByCandidateId(
      campaignCandidates.map(candidate => candidate.id)
    );
  return campaignCandidates.map(candidate => ({
    ...candidate,
    latestQualificationDecision:
      qualificationSummaries.get(candidate.id) ?? null,
  }));
}

export async function getCandidateById(id: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore().candidates.find(candidate => candidate.id === id);
  const result = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  return result[0];
}

function toCandidateQualificationDecisionSummary(
  decision: CandidateQualificationDecision
): CandidateQualificationDecisionSummary {
  return {
    id: decision.id,
    candidateId: decision.candidateId,
    campaignId: decision.campaignId,
    userId: decision.userId,
    decision: decision.decision,
    sensitiveAssumptionsAcknowledged: Boolean(
      decision.sensitiveAssumptionsAcknowledged
    ),
    createdAt: decision.createdAt,
  };
}

async function getLatestCandidateQualificationSummariesByCandidateId(
  candidateIds: number[]
) {
  const summariesByCandidateId = new Map<
    number,
    CandidateQualificationDecisionSummary
  >();
  const uniqueCandidateIds = Array.from(new Set(candidateIds));
  if (uniqueCandidateIds.length === 0) return summariesByCandidateId;

  const db = await getDb();
  const decisions = db
    ? await db
        .select()
        .from(candidateQualificationDecisions)
        .where(
          inArray(
            candidateQualificationDecisions.candidateId,
            uniqueCandidateIds
          )
        )
        .orderBy(desc(candidateQualificationDecisions.createdAt))
    : getLocalStore()
        .candidateQualificationDecisions.filter(decision =>
          uniqueCandidateIds.includes(decision.candidateId)
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const decision of decisions) {
    if (summariesByCandidateId.has(decision.candidateId)) continue;
    summariesByCandidateId.set(
      decision.candidateId,
      toCandidateQualificationDecisionSummary(decision)
    );
  }

  return summariesByCandidateId;
}

async function getCandidateIdentityIdsByCandidateId(
  candidateIds: number[],
  userId: number
) {
  const identityIdsByCandidateId = new Map<number, number>();
  const uniqueCandidateIds = Array.from(new Set(candidateIds));
  if (uniqueCandidateIds.length === 0) return identityIdsByCandidateId;

  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    for (const source of store.candidateSources) {
      if (!uniqueCandidateIds.includes(source.candidateId)) continue;
      const identity = store.candidateIdentities.find(
        entry => entry.id === source.candidateIdentityId
      );
      if (identity?.userId !== userId) continue;
      identityIdsByCandidateId.set(source.candidateId, identity.id);
    }
    return identityIdsByCandidateId;
  }

  const rows = await db
    .select({
      candidateId: candidateSources.candidateId,
      identityId: candidateSources.candidateIdentityId,
      userId: candidateIdentities.userId,
    })
    .from(candidateSources)
    .leftJoin(
      candidateIdentities,
      eq(candidateSources.candidateIdentityId, candidateIdentities.id)
    )
    .where(inArray(candidateSources.candidateId, uniqueCandidateIds));

  for (const row of rows) {
    if (row.userId !== userId) continue;
    identityIdsByCandidateId.set(row.candidateId, row.identityId);
  }

  return identityIdsByCandidateId;
}

async function getCandidateDuplicateListSummariesByCandidateId(
  userCandidates: Array<Candidate & Record<string, unknown>>,
  userId: number
) {
  const summariesByCandidateId = new Map<
    number,
    CandidateDuplicateListSummary
  >();
  for (const candidate of userCandidates) {
    summariesByCandidateId.set(candidate.id, {
      unresolvedCount: 0,
      highestConfidence: 0,
      reasons: [],
      candidateIds: [],
    });
  }
  if (userCandidates.length <= 1) return summariesByCandidateId;

  const identityIdsByCandidateId = await getCandidateIdentityIdsByCandidateId(
    userCandidates.map(candidate => candidate.id),
    userId
  );
  const resolvedPairKeys = await getResolvedCandidateDuplicatePairKeys(userId);
  const duplicateMatchesByCandidateId = new Map<
    number,
    Map<number, { confidence: number; reasons: Set<string> }>
  >();
  const signalBuckets = new Map<
    string,
    {
      confidence: number;
      reason: string;
      candidateIds: number[];
    }
  >();

  for (const candidate of userCandidates) {
    const normalized = normalizeDuplicateCandidate(candidate);
    const signals: Array<{
      key: string;
      confidence: number;
      reason: string;
    }> = [];
    if (normalized.email) {
      signals.push({
        key: `email:${normalized.email}`,
        confidence: 100,
        reason: "same email",
      });
    }
    if (normalized.phone) {
      signals.push({
        key: `phone:${normalized.phone}`,
        confidence: 95,
        reason: "same phone",
      });
    }
    if (normalized.profileUrl) {
      signals.push({
        key: `profile:${normalized.profileUrl}`,
        confidence: 90,
        reason: "same profile URL",
      });
    }
    if (normalized.name && normalized.location) {
      signals.push({
        key: `name-location:${normalized.name}|${normalized.location}`,
        confidence: 70,
        reason: "same name and location",
      });
    }

    for (const signal of signals) {
      const bucket = signalBuckets.get(signal.key) ?? {
        confidence: signal.confidence,
        reason: signal.reason,
        candidateIds: [],
      };
      bucket.candidateIds.push(candidate.id);
      signalBuckets.set(signal.key, bucket);
    }
  }

  const addMatch = (
    candidateId: number,
    otherCandidateId: number,
    confidence: number,
    reason: string
  ) => {
    const candidateIdentityId = identityIdsByCandidateId.get(candidateId);
    const otherIdentityId = identityIdsByCandidateId.get(otherCandidateId);
    if (
      candidateIdentityId &&
      otherIdentityId &&
      candidateIdentityId === otherIdentityId
    ) {
      return;
    }

    const candidateMatches =
      duplicateMatchesByCandidateId.get(candidateId) ?? new Map();
    if (resolvedPairKeys.has(candidateDuplicatePairKey(candidateId, otherCandidateId))) {
      return;
    }
    const match = candidateMatches.get(otherCandidateId) ?? {
      confidence: 0,
      reasons: new Set<string>(),
    };
    match.confidence = Math.max(match.confidence, confidence);
    match.reasons.add(reason);
    candidateMatches.set(otherCandidateId, match);
    duplicateMatchesByCandidateId.set(candidateId, candidateMatches);
  };

  for (const bucket of Array.from(signalBuckets.values())) {
    if (bucket.candidateIds.length <= 1) continue;
    for (const candidateId of bucket.candidateIds) {
      for (const otherCandidateId of bucket.candidateIds) {
        if (candidateId === otherCandidateId) continue;
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
    const reasons = new Set<string>();
    let highestConfidence = 0;
    for (const match of Array.from(matches.values())) {
      highestConfidence = Math.max(highestConfidence, match.confidence);
      Array.from(match.reasons).forEach((reason: string) =>
        reasons.add(reason)
      );
    }
    summariesByCandidateId.set(candidateId, {
      unresolvedCount: matches.size,
      highestConfidence,
      reasons: Array.from(reasons).sort(),
      candidateIds: Array.from(matches.keys()).sort(
        (a: number, b: number) => a - b
      ),
    });
  }

  return summariesByCandidateId;
}

export async function getUserCandidates(userId: number) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns
        .filter(campaign => campaign.userId === userId)
        .map(campaign => campaign.id)
    );
    const userCandidates = store.candidates
      .filter(candidate => campaignIds.has(candidate.campaignId))
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    const qualificationSummaries =
      await getLatestCandidateQualificationSummariesByCandidateId(
        userCandidates.map(candidate => candidate.id)
      );
    const duplicateSummaries =
      await getCandidateDuplicateListSummariesByCandidateId(
        userCandidates,
        userId
      );
    return userCandidates.map(candidate => ({
      ...candidate,
      campaign:
        store.campaigns.find(
          campaign => campaign.id === candidate.campaignId
        ) ?? null,
      platform:
        store.platforms.find(
          platform => platform.id === candidate.platformId
        ) ?? null,
      latestQualificationDecision:
        qualificationSummaries.get(candidate.id) ?? null,
      duplicateSummary: duplicateSummaries.get(candidate.id) ?? {
        unresolvedCount: 0,
        highestConfidence: 0,
        reasons: [],
        candidateIds: [],
      },
    }));
  }

  const userCandidates = await db
    .select({
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
        status: campaigns.status,
      },
      platform: {
        id: platforms.id,
        name: platforms.name,
      },
    })
    .from(candidates)
    .leftJoin(campaigns, eq(candidates.campaignId, campaigns.id))
    .leftJoin(platforms, eq(candidates.platformId, platforms.id))
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(candidates.compatibilityScore));
  const qualificationSummaries =
    await getLatestCandidateQualificationSummariesByCandidateId(
      userCandidates.map(candidate => candidate.id)
    );
  const duplicateSummaries =
    await getCandidateDuplicateListSummariesByCandidateId(
      userCandidates as Array<Candidate & Record<string, unknown>>,
      userId
    );
  return userCandidates.map(candidate => ({
    ...candidate,
    latestQualificationDecision:
      qualificationSummaries.get(candidate.id) ?? null,
    duplicateSummary: duplicateSummaries.get(candidate.id) ?? {
      unresolvedCount: 0,
      highestConfidence: 0,
      reasons: [],
      candidateIds: [],
    },
  }));
}

export async function searchUserCandidatePickerOptions(
  userId: number,
  options?: {
    search?: string;
    campaignId?: number;
    limit?: number;
  }
) {
  const normalizedSearch = options?.search?.trim().toLowerCase();
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const db = await getDb();

  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns
        .filter(campaign => campaign.userId === userId)
        .filter(
          campaign => !options?.campaignId || campaign.id === options.campaignId
        )
        .map(campaign => campaign.id)
    );
    return store.candidates
      .filter(candidate => campaignIds.has(candidate.campaignId))
      .filter(candidate => {
        if (!normalizedSearch) return true;
        const haystack = [
          candidate.name,
          candidate.email,
          candidate.location,
          candidate.profileUrl,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        campaignId: candidate.campaignId,
        compatibilityScore: candidate.compatibilityScore,
        status: candidate.status,
        campaign:
          store.campaigns.find(
            campaign => campaign.id === candidate.campaignId
          ) ?? null,
        platform:
          store.platforms.find(
            platform => platform.id === candidate.platformId
          ) ?? null,
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

  return db
    .select({
      id: candidates.id,
      name: candidates.name,
      campaignId: candidates.campaignId,
      compatibilityScore: candidates.compatibilityScore,
      status: candidates.status,
      campaign: {
        id: campaigns.id,
        title: campaigns.title,
        status: campaigns.status,
      },
      platform: {
        id: platforms.id,
        name: platforms.name,
      },
    })
    .from(candidates)
    .leftJoin(campaigns, eq(candidates.campaignId, campaigns.id))
    .leftJoin(platforms, eq(candidates.platformId, platforms.id))
    .where(and(...conditions))
    .orderBy(desc(candidates.updatedAt))
    .limit(limit);
}

export async function getCandidateDuplicateReviewQueue(
  userId: number,
  options?: { limit?: number }
) {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const db = await getDb();
  let userCandidates: Array<
    Candidate & {
      campaign: CandidateDuplicateReviewCandidate["campaign"];
      platform: CandidateDuplicateReviewCandidate["platform"];
    }
  >;

  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns
        .filter(campaign => campaign.userId === userId)
        .map(campaign => campaign.id)
    );
    userCandidates = store.candidates
      .filter(candidate => campaignIds.has(candidate.campaignId))
      .map(candidate => ({
        ...candidate,
        campaign:
          store.campaigns.find(
            campaign => campaign.id === candidate.campaignId
          ) ?? null,
        platform:
          store.platforms.find(
            platform => platform.id === candidate.platformId
          ) ?? null,
      }));
  } else {
    userCandidates = (await db
      .select({
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
          status: campaigns.status,
        },
        platform: {
          id: platforms.id,
          name: platforms.name,
        },
      })
      .from(candidates)
      .leftJoin(campaigns, eq(candidates.campaignId, campaigns.id))
      .leftJoin(platforms, eq(candidates.platformId, platforms.id))
      .where(eq(campaigns.userId, userId))) as Array<
      Candidate & {
        campaign: CandidateDuplicateReviewCandidate["campaign"];
        platform: CandidateDuplicateReviewCandidate["platform"];
      }
    >;
  }

  const identityIdsByCandidateId = await getCandidateIdentityIdsByCandidateId(
    userCandidates.map(candidate => candidate.id),
    userId
  );
  const resolvedPairKeys = await getResolvedCandidateDuplicatePairKeys(userId);
  const candidatesById = new Map(
    userCandidates.map(candidate => [candidate.id, candidate])
  );
  const pairMatches = new Map<
    string,
    {
      candidateAId: number;
      candidateBId: number;
      confidence: number;
      reasons: Set<string>;
    }
  >();
  const signalBuckets = new Map<
    string,
    {
      confidence: number;
      reason: string;
      candidateIds: number[];
    }
  >();

  for (const candidate of userCandidates) {
    const normalized = normalizeDuplicateCandidate(candidate);
    const signals: Array<{
      key: string;
      confidence: number;
      reason: string;
    }> = [];
    if (normalized.email) {
      signals.push({
        key: `email:${normalized.email}`,
        confidence: 100,
        reason: "same email",
      });
    }
    if (normalized.phone) {
      signals.push({
        key: `phone:${normalized.phone}`,
        confidence: 95,
        reason: "same phone",
      });
    }
    if (normalized.profileUrl) {
      signals.push({
        key: `profile:${normalized.profileUrl}`,
        confidence: 90,
        reason: "same profile URL",
      });
    }
    if (normalized.name && normalized.location) {
      signals.push({
        key: `name-location:${normalized.name}|${normalized.location}`,
        confidence: 70,
        reason: "same name and location",
      });
    }

    for (const signal of signals) {
      const bucket = signalBuckets.get(signal.key) ?? {
        confidence: signal.confidence,
        reason: signal.reason,
        candidateIds: [],
      };
      bucket.candidateIds.push(candidate.id);
      signalBuckets.set(signal.key, bucket);
    }
  }

  const addPair = (
    candidateAId: number,
    candidateBId: number,
    confidence: number,
    reason: string
  ) => {
    const candidateAIdentityId = identityIdsByCandidateId.get(candidateAId);
    const candidateBIdentityId = identityIdsByCandidateId.get(candidateBId);
    if (
      candidateAIdentityId &&
      candidateBIdentityId &&
      candidateAIdentityId === candidateBIdentityId
    ) {
      return;
    }

    const pairKey = candidateDuplicatePairKey(candidateAId, candidateBId);
    if (resolvedPairKeys.has(pairKey)) return;
    const orderedIds = pairKey.split(":").map(value => Number(value));
    const pair = pairMatches.get(pairKey) ?? {
      candidateAId: orderedIds[0],
      candidateBId: orderedIds[1],
      confidence: 0,
      reasons: new Set<string>(),
    };
    pair.confidence = Math.max(pair.confidence, confidence);
    pair.reasons.add(reason);
    pairMatches.set(pairKey, pair);
  };

  for (const bucket of Array.from(signalBuckets.values())) {
    const uniqueCandidateIds = Array.from(new Set(bucket.candidateIds));
    if (uniqueCandidateIds.length <= 1) continue;
    for (let index = 0; index < uniqueCandidateIds.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < uniqueCandidateIds.length;
        otherIndex += 1
      ) {
        addPair(
          uniqueCandidateIds[index],
          uniqueCandidateIds[otherIndex],
          bucket.confidence,
          bucket.reason
        );
      }
    }
  }

  const toReviewCandidate = (
    candidate: (typeof userCandidates)[number]
  ): CandidateDuplicateReviewCandidate => ({
    id: candidate.id,
    name: candidate.name,
    campaignId: candidate.campaignId,
    compatibilityScore: candidate.compatibilityScore,
    status: candidate.status,
    location: candidate.location,
    campaign: candidate.campaign,
    platform: candidate.platform,
  });

  const buildDuplicateReviewExplanation = (
    pair: {
      confidence: number;
      reasons: Set<string>;
    },
    targetCandidate: (typeof userCandidates)[number],
    sourceCandidate: (typeof userCandidates)[number]
  ): CandidateDuplicateReviewExplanation => {
    const reasons = Array.from(pair.reasons).sort();
    const hasStrongIdentifier = reasons.some(reason =>
      ["same email", "same phone", "same profile URL"].includes(reason)
    );
    const onlyWeakProfileSignal =
      reasons.length > 0 &&
      reasons.every(reason => reason === "same name and location");
    const samePlatform =
      targetCandidate.platformId === sourceCandidate.platformId;
    const sameCampaign =
      targetCandidate.campaignId === sourceCandidate.campaignId;
    const targetLocation = targetCandidate.location?.trim().toLowerCase();
    const sourceLocation = sourceCandidate.location?.trim().toLowerCase();
    const hasDifferentKnownLocations =
      !!targetLocation && !!sourceLocation && targetLocation !== sourceLocation;
    const falsePositiveSignals: string[] = [];

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

    const riskLevel =
      pair.confidence >= 95 && hasStrongIdentifier
        ? "high"
        : pair.confidence >= 80
          ? "medium"
          : "low";
    const recommendedAction =
      riskLevel === "high" && falsePositiveSignals.length === 0
        ? "merge_if_same_person"
        : "manual_review";

    return {
      summary:
        recommendedAction === "merge_if_same_person"
          ? "Strong redacted identity signals matched. Open both ledgers and merge only after confirming they describe the same person."
          : "Review manually before deciding. The duplicate signal is useful, but it is not enough for an automatic identity merge.",
      recommendedAction,
      riskLevel,
      whyShown: reasons.map(reason => {
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
        "Use Not duplicate when visible profile context points to different people.",
      ],
      falsePositiveSignals,
    };
  };

  return Array.from(pairMatches.values())
    .map(pair => {
      const candidateA = candidatesById.get(pair.candidateAId);
      const candidateB = candidatesById.get(pair.candidateBId);
      if (!candidateA || !candidateB) return null;
      const targetCandidate =
        candidateA.compatibilityScore > candidateB.compatibilityScore ||
        (candidateA.compatibilityScore === candidateB.compatibilityScore &&
          candidateA.id < candidateB.id)
          ? candidateA
          : candidateB;
      const sourceCandidate =
        targetCandidate.id === candidateA.id ? candidateB : candidateA;
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
        sourceCandidate: toReviewCandidate(sourceCandidate),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.confidence !== b!.confidence) {
        return b!.confidence - a!.confidence;
      }
      return a!.pairKey.localeCompare(b!.pairKey);
    })
    .slice(0, limit);
}

export async function createCandidate(
  candidate: typeof candidates.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localCandidate: Candidate = {
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
      updatedAt: candidate.updatedAt ?? now,
    };
    getLocalStore().candidates.push(localCandidate);
    persistLocalStore();
    return localCandidate.id;
  }
  const result = await db.insert(candidates).values(candidate);
  return Number(result[0].insertId);
}

export async function updateCandidate(id: number, updates: Partial<Candidate>) {
  const db = await getDb();
  if (!db) {
    const candidate = getLocalStore().candidates.find(entry => entry.id === id);
    if (!candidate) throw new Error("Candidate not found");
    Object.assign(candidate, updates, { updatedAt: new Date() });
    persistLocalStore();
    return;
  }
  await db.update(candidates).set(updates).where(eq(candidates.id, id));
}

// Message queries
export async function getCampaignMessages(campaignId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messages.filter(message => message.campaignId === campaignId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(messages)
    .where(eq(messages.campaignId, campaignId))
    .orderBy(desc(messages.createdAt));
}

export async function getCandidateMessages(candidateId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messages.filter(message => message.candidateId === candidateId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(messages)
    .where(eq(messages.candidateId, candidateId))
    .orderBy(desc(messages.createdAt));
}

export async function createMessage(message: typeof messages.$inferInsert) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localMessage: Message = {
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
      updatedAt: message.updatedAt ?? now,
    };
    getLocalStore().messages.push(localMessage);
    persistLocalStore();
    return localMessage.id;
  }
  const result = await db.insert(messages).values(message);
  return Number(result[0].insertId);
}

export async function updateMessage(
  id: number,
  subject: string,
  content: string
) {
  const db = await getDb();
  if (!db) {
    const message = getLocalStore().messages.find(entry => entry.id === id);
    if (!message) throw new Error("Message not found");
    Object.assign(message, { subject, content, updatedAt: new Date() });
    persistLocalStore();
    return;
  }
  await db
    .update(messages)
    .set({ subject, content })
    .where(eq(messages.id, id));
}

export async function getAllMessages(
  userId: number,
  status?: string,
  campaignId?: number
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const userCampaignIds = new Set(
      store.campaigns
        .filter(campaign => campaign.userId === userId)
        .map(campaign => campaign.id)
    );

    return store.messages
      .filter(message => userCampaignIds.has(message.campaignId))
      .filter(message => !status || message.status === status)
      .filter(message => !campaignId || message.campaignId === campaignId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(message => {
        const latestCandidateResponse =
          store.candidateResponses
            .filter(response => response.candidateId === message.candidateId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
          null;

        return {
          ...message,
          campaign:
            store.campaigns.find(
              campaign => campaign.id === message.campaignId
            ) ?? null,
          candidate:
            store.candidates.find(
              candidate => candidate.id === message.candidateId
            ) ?? null,
          platform:
            store.platforms.find(
              platform => platform.id === message.platformId
            ) ?? null,
          latestCandidateResponse,
        };
      });
  }

  // Build query with joins to get related data
  let query = db
    .select({
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
        compatibilityScore: candidates.compatibilityScore,
      },
      campaign: {
        id: campaigns.id,
        title: campaigns.title,
        status: campaigns.status,
        searchCriteria: campaigns.searchCriteria,
      },
      platform: {
        id: platforms.id,
        name: platforms.name,
      },
    })
    .from(messages)
    .leftJoin(candidates, eq(messages.candidateId, candidates.id))
    .leftJoin(platforms, eq(messages.platformId, platforms.id))
    .leftJoin(campaigns, eq(messages.campaignId, campaigns.id));

  // Apply filters
  const conditions: any[] = [eq(campaigns.userId, userId)];
  if (status) {
    conditions.push(eq(messages.status, status as any));
  }
  if (campaignId) {
    conditions.push(eq(messages.campaignId, campaignId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const rows = await query.orderBy(desc(messages.createdAt));
  const candidateIds = Array.from(
    new Set(rows.map(message => message.candidateId).filter(Boolean))
  );
  const responses =
    candidateIds.length > 0
      ? await db
          .select()
          .from(candidateResponses)
          .where(inArray(candidateResponses.candidateId, candidateIds))
          .orderBy(desc(candidateResponses.createdAt))
      : [];
  const latestResponseByCandidateId = new Map<number, CandidateResponse>();

  for (const response of responses) {
    if (!latestResponseByCandidateId.has(response.candidateId)) {
      latestResponseByCandidateId.set(response.candidateId, response);
    }
  }

  return rows.map(message => ({
    ...message,
    latestCandidateResponse:
      latestResponseByCandidateId.get(message.candidateId) ?? null,
  }));
}

export async function updateMessageStatus(messageId: number, status: string) {
  const db = await getDb();
  if (!db) {
    const message = getLocalStore().messages.find(
      entry => entry.id === messageId
    );
    if (!message) throw new Error("Message not found");
    message.status = status as Message["status"];
    if (status === "sent") message.sentAt = new Date();
    message.updatedAt = new Date();
    persistLocalStore();
    return;
  }

  const updates: any = { status };
  if (status === "sent") {
    updates.sentAt = new Date();
  }

  await db.update(messages).set(updates).where(eq(messages.id, messageId));
}

export async function updateMessageResponse(
  messageId: number,
  responseContent: string,
  respondedAt = new Date()
) {
  const db = await getDb();
  if (!db) {
    const message = getLocalStore().messages.find(
      entry => entry.id === messageId
    );
    if (!message) throw new Error("Message not found");
    Object.assign(message, {
      status: "replied" as const,
      responseContent,
      respondedAt,
      updatedAt: new Date(),
    });
    persistLocalStore();
    return;
  }

  await db
    .update(messages)
    .set({
      status: "replied",
      responseContent,
      respondedAt,
    })
    .where(eq(messages.id, messageId));
}

export async function bulkUpdateMessageStatus(
  messageIds: number[],
  status: string
) {
  const db = await getDb();
  if (!db) {
    for (const messageId of messageIds) {
      await updateMessageStatus(messageId, status);
    }
    return messageIds.length;
  }

  const updates: any = { status };
  if (status === "sent") {
    updates.sentAt = new Date();
  }

  for (const messageId of messageIds) {
    await db.update(messages).set(updates).where(eq(messages.id, messageId));
  }

  return messageIds.length;
}

export async function getEngagementMetrics(campaignId: number) {
  const db = await getDb();
  if (!db) {
    const allMessages = getLocalStore().messages.filter(
      message => message.campaignId === campaignId
    );
    const totalSent = allMessages.filter(message =>
      ["sent", "delivered", "replied", "responded"].includes(message.status)
    ).length;
    const totalReplied = allMessages.filter(message =>
      ["replied", "responded"].includes(message.status)
    ).length;
    const totalPending = allMessages.filter(message =>
      ["sent", "delivered"].includes(message.status)
    ).length;
    const responseRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;

    return {
      totalSent,
      totalReplied,
      totalPending,
      responseRate,
      avgResponseTime: undefined,
      trend:
        responseRate > 20
          ? ("up" as const)
          : responseRate < 10 && totalSent > 5
            ? ("down" as const)
            : ("stable" as const),
    };
  }

  // Get all messages for this campaign
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.campaignId, campaignId));

  const totalSent = allMessages.filter(
    m =>
      m.status === "sent" ||
      m.status === "delivered" ||
      m.status === "replied" ||
      m.status === "responded"
  ).length;

  const totalReplied = allMessages.filter(
    m => m.status === "replied" || m.status === "responded"
  ).length;

  const totalPending = allMessages.filter(
    m => m.status === "sent" || m.status === "delivered"
  ).length;

  const responseRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;

  // Calculate average response time
  let avgResponseTime: number | undefined = undefined;
  const repliedMessages = allMessages.filter(
    m =>
      (m.status === "replied" || m.status === "responded") &&
      m.sentAt &&
      m.respondedAt
  );

  if (repliedMessages.length > 0) {
    const totalResponseTime = repliedMessages.reduce((sum, m) => {
      if (m.sentAt && m.respondedAt) {
        const diff = m.respondedAt.getTime() - m.sentAt.getTime();
        return sum + diff;
      }
      return sum;
    }, 0);
    avgResponseTime =
      totalResponseTime / repliedMessages.length / (1000 * 60 * 60); // Convert to hours
  }

  // Determine trend (simplified - could be enhanced with historical data)
  let trend: "up" | "down" | "stable" = "stable";
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
    trend,
  };
}

// Platform credentials queries
export async function getUserPlatformCredentials(userId: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore().platformCredentials.filter(
      credential => credential.userId === userId
    );
  return db
    .select()
    .from(platformCredentials)
    .where(eq(platformCredentials.userId, userId));
}

export async function getPlatformCredential(
  userId: number,
  platformId: number
) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().platformCredentials.find(
      credential =>
        credential.userId === userId && credential.platformId === platformId
    );
  }
  const result = await db
    .select()
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.userId, userId),
        eq(platformCredentials.platformId, platformId)
      )
    )
    .limit(1);
  return result[0];
}

export async function upsertPlatformCredential(
  credential: typeof platformCredentials.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const existing = store.platformCredentials.find(
      entry =>
        entry.userId === credential.userId &&
        entry.platformId === credential.platformId
    );
    if (existing) {
      Object.assign(existing, credential, { updatedAt: new Date() });
      persistLocalStore();
      return existing.id;
    }

    const now = new Date();
    const localCredential: PlatformCredential = {
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
      updatedAt: credential.updatedAt ?? now,
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
    await db
      .update(platformCredentials)
      .set(credential)
      .where(
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

// Match factors queries
export async function getCandidateMatchFactors(candidateId: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore().matchFactors.filter(
      factor => factor.candidateId === candidateId
    );
  return db
    .select()
    .from(matchFactors)
    .where(eq(matchFactors.candidateId, candidateId));
}

export async function createMatchFactor(
  factor: typeof matchFactors.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const localFactor: MatchFactor = {
      id: nextLocalId("matchFactor"),
      candidateId: factor.candidateId,
      factor: factor.factor,
      score: factor.score,
      weight: factor.weight,
      reasoning: factor.reasoning ?? null,
      createdAt: factor.createdAt ?? new Date(),
    };
    getLocalStore().matchFactors.push(localFactor);
    persistLocalStore();
    return localFactor.id;
  }
  const result = await db.insert(matchFactors).values(factor);
  return Number(result[0].insertId);
}

export async function createAuditEvent(event: typeof auditEvents.$inferInsert) {
  const safeEvent = {
    ...event,
    beforeState: sanitizeAuditEventState(event.beforeState),
    afterState: sanitizeAuditEventState(event.afterState),
  };
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localEvent: AuditEvent = {
      id: nextLocalId("auditEvent"),
      userId: safeEvent.userId,
      entityType: safeEvent.entityType,
      entityId: safeEvent.entityId,
      campaignId: safeEvent.campaignId ?? null,
      action: safeEvent.action,
      actor: safeEvent.actor ?? "system",
      source: safeEvent.source ?? null,
      beforeState: safeEvent.beforeState ?? null,
      afterState: safeEvent.afterState ?? null,
      riskLevel: safeEvent.riskLevel ?? "low",
      approvalId: safeEvent.approvalId ?? null,
      createdAt: safeEvent.createdAt ?? now,
    };
    getLocalStore().auditEvents.push(localEvent);
    persistLocalStore();
    return localEvent.id;
  }
  const result = await db.insert(auditEvents).values(safeEvent);
  return Number(result[0].insertId);
}

function sanitizeAuditEventState(value: unknown) {
  if (value == null) return value;
  if (typeof value !== "string") return serializeSafeJson(value);

  try {
    return serializeSafeJson(JSON.parse(value));
  } catch {
    return redactSecretLikeText(value);
  }
}

export async function getAuditEventsForCampaign(
  userId: number,
  campaignId: number,
  options: {
    limit?: number;
    riskLevel?: "low" | "medium" | "high";
    search?: string;
  } = {}
) {
  const limit =
    typeof options.limit === "number"
      ? Math.max(1, Math.min(Math.trunc(options.limit), 500))
      : undefined;
  const search = options.search?.trim().toLowerCase();
  const db = await getDb();
  if (!db) {
    const filtered = getLocalStore()
      .auditEvents.filter(
        event => event.userId === userId && event.campaignId === campaignId
      )
      .filter(event =>
        options.riskLevel ? event.riskLevel === options.riskLevel : true
      )
      .filter(event => {
        if (!search) return true;
        return [
          event.action,
          event.actor,
          event.source,
          event.entityType,
          event.riskLevel,
          event.beforeState,
          event.afterState,
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(search));
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
  }

  const conditions = [
    eq(auditEvents.userId, userId),
    eq(auditEvents.campaignId, campaignId),
  ];
  if (options.riskLevel) {
    conditions.push(eq(auditEvents.riskLevel, options.riskLevel));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(sql`(
      lower(${auditEvents.action}) like ${pattern}
      or lower(${auditEvents.actor}) like ${pattern}
      or lower(${auditEvents.source}) like ${pattern}
      or lower(${auditEvents.entityType}) like ${pattern}
      or lower(${auditEvents.riskLevel}) like ${pattern}
      or lower(${auditEvents.beforeState}) like ${pattern}
      or lower(${auditEvents.afterState}) like ${pattern}
    )`);
  }

  const query = db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt));

  if (typeof limit === "number") {
    return query.limit(limit);
  }

  return db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt));
}

export async function getAuditEventsForEntity(
  userId: number,
  entityType: string,
  entityId: number
) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .auditEvents.filter(
        event =>
          event.userId === userId &&
          event.entityType === entityType &&
          event.entityId === entityId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        eq(auditEvents.entityType, entityType),
        eq(auditEvents.entityId, entityId)
      )
    )
    .orderBy(desc(auditEvents.createdAt));
}

export async function getMessageSnippetById(id: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().messageSnippets.find(snippet => snippet.id === id);
  }
  const result = await db
    .select()
    .from(messageSnippets)
    .where(eq(messageSnippets.id, id))
    .limit(1);
  return result[0];
}

export async function getActiveMessageSnippets(userId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messageSnippets.filter(
        snippet => snippet.userId === userId && snippet.isActive === 1
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return db
    .select()
    .from(messageSnippets)
    .where(
      and(eq(messageSnippets.userId, userId), eq(messageSnippets.isActive, 1))
    )
    .orderBy(desc(messageSnippets.updatedAt));
}

export async function createMessageSnippet(
  snippet: typeof messageSnippets.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localSnippet: MessageSnippet = {
      id: nextLocalId("messageSnippet"),
      userId: snippet.userId,
      title: snippet.title,
      body: snippet.body,
      language: snippet.language ?? "nl",
      tonePreset: snippet.tonePreset ?? "careful",
      isActive: snippet.isActive ?? 1,
      createdAt: snippet.createdAt ?? now,
      updatedAt: snippet.updatedAt ?? now,
    };
    getLocalStore().messageSnippets.push(localSnippet);
    persistLocalStore();
    return localSnippet.id;
  }
  const result = await db.insert(messageSnippets).values(snippet);
  return Number(result[0].insertId);
}

export async function archiveMessageSnippet(id: number, userId: number) {
  const existing = await getMessageSnippetById(id);
  if (!existing || existing.userId !== userId || existing.isActive !== 1) {
    throw new Error("Message snippet not found");
  }

  const db = await getDb();
  if (!db) {
    existing.isActive = 0;
    existing.updatedAt = new Date();
    persistLocalStore();
    return existing;
  }
  await db
    .update(messageSnippets)
    .set({ isActive: 0 })
    .where(and(eq(messageSnippets.id, id), eq(messageSnippets.userId, userId)));
  return existing;
}

export async function createMessageApproval(
  approval: typeof messageApprovals.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localApproval: MessageApproval = {
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
      createdAt: approval.createdAt ?? now,
    };
    getLocalStore().messageApprovals.push(localApproval);
    persistLocalStore();
    return localApproval.id;
  }
  const result = await db.insert(messageApprovals).values(approval);
  return Number(result[0].insertId);
}

export async function getMessageApprovalsForCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messageApprovals.filter(approval => approval.campaignId === campaignId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(messageApprovals)
    .where(eq(messageApprovals.campaignId, campaignId))
    .orderBy(desc(messageApprovals.createdAt));
}

export async function getMessageApprovalsByMessageId(messageId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messageApprovals.filter(approval => approval.messageId === messageId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(messageApprovals)
    .where(eq(messageApprovals.messageId, messageId))
    .orderBy(desc(messageApprovals.createdAt));
}

export async function createMessageSendAttempt(
  attempt: typeof messageSendAttempts.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localAttempt: MessageSendAttempt = {
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
      createdAt: attempt.createdAt ?? now,
    };
    getLocalStore().messageSendAttempts.push(localAttempt);
    persistLocalStore();
    return localAttempt.id;
  }
  const result = await db.insert(messageSendAttempts).values(attempt);
  return Number(result[0].insertId);
}

export async function getMessageSendAttemptsForCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messageSendAttempts.filter(attempt => attempt.campaignId === campaignId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(messageSendAttempts)
    .where(eq(messageSendAttempts.campaignId, campaignId))
    .orderBy(desc(messageSendAttempts.createdAt));
}

export async function getMessageSendAttemptsForCandidate(candidateId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .messageSendAttempts.filter(
        attempt => attempt.candidateId === candidateId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(messageSendAttempts)
    .where(eq(messageSendAttempts.candidateId, candidateId))
    .orderBy(desc(messageSendAttempts.createdAt));
}

export async function createCandidateResponse(
  response: typeof candidateResponses.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localResponse: CandidateResponse = {
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
      createdAt: response.createdAt ?? now,
    };
    getLocalStore().candidateResponses.push(localResponse);
    persistLocalStore();
    return localResponse.id;
  }
  const result = await db.insert(candidateResponses).values(response);
  return Number(result[0].insertId);
}

export async function getCandidateResponseById(id: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().candidateResponses.find(
      response => response.id === id
    );
  }
  const result = await db
    .select()
    .from(candidateResponses)
    .where(eq(candidateResponses.id, id))
    .limit(1);
  return result[0];
}

export async function updateCandidateResponseClassification(
  id: number,
  classification: CandidateResponse["classification"],
  confidence: number
) {
  const db = await getDb();
  if (!db) {
    const response = getLocalStore().candidateResponses.find(
      entry => entry.id === id
    );
    if (!response) throw new Error("Candidate response not found");
    response.classification = classification;
    response.confidence = confidence;
    persistLocalStore();
    return;
  }

  await db
    .update(candidateResponses)
    .set({ classification, confidence })
    .where(eq(candidateResponses.id, id));
}

export async function getCandidateResponsesForCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) {
    const candidateIds = new Set(
      getLocalStore()
        .candidates.filter(candidate => candidate.campaignId === campaignId)
        .map(candidate => candidate.id)
    );
    return getLocalStore()
      .candidateResponses.filter(response =>
        candidateIds.has(response.candidateId)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select({
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
    })
    .from(candidateResponses)
    .leftJoin(candidates, eq(candidateResponses.candidateId, candidates.id))
    .where(eq(candidates.campaignId, campaignId))
    .orderBy(desc(candidateResponses.createdAt));
}

export async function getCandidateResponsesByCandidateId(candidateId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .candidateResponses.filter(
        response => response.candidateId === candidateId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(candidateResponses)
    .where(eq(candidateResponses.candidateId, candidateId))
    .orderBy(desc(candidateResponses.createdAt));
}

export async function createCandidateQualificationDecision(
  decision: typeof candidateQualificationDecisions.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localDecision: CandidateQualificationDecision = {
      id: nextLocalId("candidateQualificationDecision"),
      candidateId: decision.candidateId,
      campaignId: decision.campaignId,
      userId: decision.userId,
      decision: decision.decision,
      reason: decision.reason,
      sensitiveAssumptionsAcknowledged:
        decision.sensitiveAssumptionsAcknowledged ?? 0,
      createdAt: decision.createdAt ?? now,
    };
    getLocalStore().candidateQualificationDecisions.push(localDecision);
    persistLocalStore();
    return localDecision.id;
  }
  const result = await db
    .insert(candidateQualificationDecisions)
    .values(decision);
  return Number(result[0].insertId);
}

export async function getCandidateQualificationDecisionsByCandidateId(
  candidateId: number
) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .candidateQualificationDecisions.filter(
        decision => decision.candidateId === candidateId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(candidateQualificationDecisions)
    .where(eq(candidateQualificationDecisions.candidateId, candidateId))
    .orderBy(desc(candidateQualificationDecisions.createdAt));
}

export async function getCandidateQualificationDecisionsForCampaign(
  campaignId: number
) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .candidateQualificationDecisions.filter(
        decision => decision.campaignId === campaignId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(candidateQualificationDecisions)
    .where(eq(candidateQualificationDecisions.campaignId, campaignId))
    .orderBy(desc(candidateQualificationDecisions.createdAt));
}

export async function getCandidateResponsesForUser(
  userId: number,
  options?: {
    classification?: CandidateResponse["classification"];
    campaignId?: number;
    limit?: number;
  }
) {
  const db = await getDb();
  const limit = options?.limit;
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns
        .filter(
          campaign =>
            campaign.userId === userId && campaign.status !== "archived"
        )
        .filter(
          campaign => !options?.campaignId || campaign.id === options.campaignId
        )
        .map(campaign => campaign.id)
    );
    const candidateIds = new Set(
      store.candidates
        .filter(candidate => campaignIds.has(candidate.campaignId))
        .map(candidate => candidate.id)
    );
    const responses = store.candidateResponses
      .filter(response => candidateIds.has(response.candidateId))
      .filter(
        response =>
          !options?.classification ||
          response.classification === options.classification
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(response => {
        const candidate =
          store.candidates.find(entry => entry.id === response.candidateId) ??
          null;
        const campaign = candidate
          ? (store.campaigns.find(entry => entry.id === candidate.campaignId) ??
            null)
          : null;
        const message = response.messageId
          ? (store.messages.find(entry => entry.id === response.messageId) ??
            null)
          : null;
        const platform =
          store.platforms.find(entry => entry.id === response.platformId) ??
          null;
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

  const query = db
    .select({
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
        compatibilityScore: candidates.compatibilityScore,
      },
      campaign: {
        id: campaigns.id,
        title: campaigns.title,
        status: campaigns.status,
      },
      message: {
        id: messages.id,
        subject: messages.subject,
        status: messages.status,
      },
      platform: {
        id: platforms.id,
        name: platforms.name,
      },
    })
    .from(candidateResponses)
    .leftJoin(candidates, eq(candidateResponses.candidateId, candidates.id))
    .leftJoin(campaigns, eq(candidates.campaignId, campaigns.id))
    .leftJoin(messages, eq(candidateResponses.messageId, messages.id))
    .leftJoin(platforms, eq(candidateResponses.platformId, platforms.id))
    .where(and(...conditions))
    .orderBy(desc(candidateResponses.createdAt));
  return typeof limit === "number" ? query.limit(limit) : query;
}

export async function recordCampaignReadinessCheck(
  check: typeof campaignReadinessChecks.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const localCheck: CampaignReadinessCheck = {
      id: nextLocalId("campaignReadinessCheck"),
      campaignId: check.campaignId,
      userId: check.userId,
      status: check.status,
      checksJson: check.checksJson,
      blockersJson: check.blockersJson ?? null,
      warningsJson: check.warningsJson ?? null,
      createdAt: check.createdAt ?? new Date(),
    };
    getLocalStore().campaignReadinessChecks.push(localCheck);
    persistLocalStore();
    return localCheck.id;
  }
  const result = await db.insert(campaignReadinessChecks).values(check);
  return Number(result[0].insertId);
}

export async function getLatestCampaignReadinessCheck(campaignId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .campaignReadinessChecks.filter(check => check.campaignId === campaignId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }
  const result = await db
    .select()
    .from(campaignReadinessChecks)
    .where(eq(campaignReadinessChecks.campaignId, campaignId))
    .orderBy(desc(campaignReadinessChecks.createdAt))
    .limit(1);
  return result[0];
}

export async function recordCredentialEvent(
  event: typeof credentialEvents.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const localEvent: CredentialEvent = {
      id: nextLocalId("credentialEvent"),
      userId: event.userId,
      platformId: event.platformId,
      eventType: event.eventType,
      status: event.status ?? "ok",
      message: event.message ?? null,
      createdAt: event.createdAt ?? new Date(),
    };
    getLocalStore().credentialEvents.push(localEvent);
    persistLocalStore();
    return localEvent.id;
  }
  const result = await db.insert(credentialEvents).values(event);
  return Number(result[0].insertId);
}

export async function getCredentialEvents(userId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .credentialEvents.filter(event => event.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(credentialEvents)
    .where(eq(credentialEvents.userId, userId))
    .orderBy(desc(credentialEvents.createdAt));
}

function toPublicCredentialEvent(event: CredentialEvent) {
  const message =
    event.message && credentialEventSecretPattern.test(event.message)
      ? "[redacted]"
      : event.message
        ? event.message.slice(0, 500)
        : null;

  return {
    id: event.id,
    platformId: event.platformId,
    eventType: event.eventType,
    status: event.status,
    message,
    createdAt: event.createdAt,
  };
}

export async function getCredentialStatus(userId: number) {
  const [credentials, platformsList, events] = await Promise.all([
    getUserPlatformCredentials(userId),
    getAllPlatforms(),
    getCredentialEvents(userId),
  ]);
  return platformsList.map(platform => {
    const capability = getPlatformCapability(platform.name);
    const credential =
      credentials.find(entry => entry.platformId === platform.id) ?? null;
    const recentEvents = events
      .filter(event => event.platformId === platform.id)
      .slice(0, RECENT_CREDENTIAL_EVENT_LIMIT)
      .map(toPublicCredentialEvent);
    const latestEvent = recentEvents[0] ?? null;
    return {
      platform,
      credential: credential
        ? {
            id: credential.id,
            platformId: credential.platformId,
            email: credential.email,
            isConnected: credential.isConnected,
            lastSyncAt: credential.lastSyncAt,
            lastError: credential.lastError,
            updatedAt: credential.updatedAt,
          }
        : null,
      latestEvent,
      recentEvents,
      capability,
      status: !credential
        ? capability.supportsAuthenticatedAutomation
          ? "missing"
          : "public_only"
        : !capability.supportsAuthenticatedAutomation
          ? "public_only_saved"
          : credential.lastError
            ? "error"
            : credential.isConnected === 1
              ? "connected"
              : "unverified",
    };
  });
}

export async function getRateLimitEventsForCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .rateLimitEvents.filter(event => event.campaignId === campaignId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(rateLimitEvents)
    .where(eq(rateLimitEvents.campaignId, campaignId))
    .orderBy(desc(rateLimitEvents.createdAt));
}

export async function createRateLimitEvent(
  event: typeof rateLimitEvents.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const localEvent: RateLimitEvent = {
      id: nextLocalId("rateLimitEvent"),
      userId: event.userId,
      platformId: event.platformId ?? null,
      campaignId: event.campaignId ?? null,
      eventType: event.eventType,
      severity: event.severity ?? "info",
      detailJson: event.detailJson ?? null,
      createdAt: event.createdAt ?? new Date(),
    };
    getLocalStore().rateLimitEvents.push(localEvent);
    persistLocalStore();
    return localEvent.id;
  }
  const result = await db.insert(rateLimitEvents).values(event);
  return Number(result[0].insertId);
}

export async function createQueueJobRecord(
  job: typeof queueJobRecords.$inferInsert
) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localJob: QueueJobRecord = {
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
      updatedAt: job.updatedAt ?? now,
    };
    getLocalStore().queueJobRecords.push(localJob);
    persistLocalStore();
    return localJob.id;
  }
  const result = await db.insert(queueJobRecords).values(job);
  return Number(result[0].insertId);
}

export async function updateQueueJobRecord(
  id: number,
  updates: Partial<
    Pick<
      QueueJobRecord,
      "status" | "payloadJson" | "errorMessage" | "messageId"
    >
  >
) {
  const db = await getDb();
  const normalizedUpdates = {
    ...updates,
    updatedAt: new Date(),
  };

  if (!db) {
    const job = getLocalStore().queueJobRecords.find(entry => entry.id === id);
    if (!job) return false;
    Object.assign(job, normalizedUpdates);
    persistLocalStore();
    return true;
  }

  await db
    .update(queueJobRecords)
    .set(normalizedUpdates)
    .where(eq(queueJobRecords.id, id));
  return true;
}

export async function getQueueJobRecords(
  userId: number,
  queueName?: "messages" | "discovery",
  status?:
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "cancelled",
  options: { limit?: number; offset?: number } = {}
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .queueJobRecords.filter(job => job.userId === userId)
      .filter(job => !queueName || job.queueName === queueName)
      .filter(job => !status || job.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  const conditions = [eq(queueJobRecords.userId, userId)];
  if (queueName) conditions.push(eq(queueJobRecords.queueName, queueName));
  if (status) conditions.push(eq(queueJobRecords.status, status));
  return db
    .select()
    .from(queueJobRecords)
    .where(and(...conditions))
    .orderBy(desc(queueJobRecords.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getQueueJobRecordForUser(id: number, userId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore().queueJobRecords.find(
      job => job.id === id && job.userId === userId
    );
  }

  const result = await db
    .select()
    .from(queueJobRecords)
    .where(and(eq(queueJobRecords.id, id), eq(queueJobRecords.userId, userId)))
    .limit(1);
  return result[0];
}

export async function cancelQueueJobRecord(input: {
  id: number;
  userId: number;
  reason?: string;
}) {
  const job = await getQueueJobRecordForUser(input.id, input.userId);
  if (!job) return { cancelled: false, reason: "not_found" } as const;
  if (job.status === "cancelled") {
    return { cancelled: true, alreadyCancelled: true, job } as const;
  }
  if (job.status !== "waiting" && job.status !== "delayed") {
    return {
      cancelled: false,
      reason: "not_cancellable",
      job,
    } as const;
  }

  const cancellationReason = redactOperationalError(
    truncateOperationalText(input.reason, 300) ?? "Cancelled by user"
  );
  await updateQueueJobRecord(job.id, {
    status: "cancelled",
    errorMessage: `Cancelled by user: ${cancellationReason}`,
  });

  const updatedJob = await getQueueJobRecordForUser(job.id, input.userId);
  return {
    cancelled: true,
    job: updatedJob ?? { ...job, status: "cancelled" as const },
  } as const;
}

export async function getQueueHealthSummary(
  userId: number,
  options: { limit?: number } = {}
) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const db = await getDb();
  const records = !db
    ? getLocalStore()
        .queueJobRecords.filter(job => job.userId === userId)
        .sort(
          (a, b) =>
            (b.updatedAt ?? b.createdAt).getTime() -
            (a.updatedAt ?? a.createdAt).getTime()
        )
        .slice(0, limit)
    : await db
        .select()
        .from(queueJobRecords)
        .where(eq(queueJobRecords.userId, userId))
        .orderBy(desc(queueJobRecords.updatedAt))
        .limit(limit);

  const queueNames = ["messages", "discovery"] as const;
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    generatedAt: now,
    recentRecordLimit: limit,
    queues: queueNames.map(queueName => {
      const queueRecords = records.filter(
        record => record.queueName === queueName
      );
      const countByStatus = {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        cancelled: 0,
      };
      for (const record of queueRecords) {
        countByStatus[record.status] += 1;
      }

      const lastActivityAt = latestDate(
        queueRecords.map(record => record.updatedAt ?? record.createdAt)
      );
      const lastCompletedAt = latestDate(
        queueRecords
          .filter(record => record.status === "completed")
          .map(record => record.updatedAt ?? record.createdAt)
      );
      const lastFailedAt = latestDate(
        queueRecords
          .filter(record => record.status === "failed")
          .map(record => record.updatedAt ?? record.createdAt)
      );
      const failedLast24h = queueRecords.filter(record => {
        const activityAt = record.updatedAt ?? record.createdAt;
        return record.status === "failed" && activityAt >= recentCutoff;
      }).length;

      return {
        queueName,
        durable: {
          recentRecords: queueRecords.length,
          ...countByStatus,
        },
        lastActivityAt,
        lastCompletedAt,
        lastFailedAt,
        recentErrors: queueRecords
          .filter(record => record.status === "failed" && record.errorMessage)
          .slice(0, 3)
          .map(record => ({
            id: record.id,
            jobType: record.jobType,
            campaignId: record.campaignId,
            failedAt: record.updatedAt ?? record.createdAt,
            errorMessage: redactOperationalError(record.errorMessage),
          })),
        failedLast24h,
      };
    }),
  };
}

function latestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map(value => value.getTime());
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function redactOperationalError(value: string | null) {
  if (!value) return null;
  return value
    .replace(
      /\b(password|passphrase|api[-_\s]?key|token|session|cookie|authorization|secret)\s*[:=]\s*\S+/gi,
      "$1=[redacted]"
    )
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]")
    .slice(0, 500);
}

export async function createFollowUp(followUp: typeof followUps.$inferInsert) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const localFollowUp: FollowUp = {
      id: nextLocalId("followUp"),
      campaignId: followUp.campaignId,
      candidateId: followUp.candidateId,
      sequence: followUp.sequence,
      scheduledAt: followUp.scheduledAt,
      status: followUp.status ?? "scheduled",
      messageId: followUp.messageId ?? null,
      createdAt: followUp.createdAt ?? now,
      updatedAt: followUp.updatedAt ?? now,
    };
    getLocalStore().followUps.push(localFollowUp);
    persistLocalStore();
    return localFollowUp.id;
  }
  const result = await db.insert(followUps).values(followUp);
  return Number(result[0].insertId);
}

export async function getFollowUpById(id: number) {
  const db = await getDb();
  if (!db)
    return getLocalStore().followUps.find(followUp => followUp.id === id);
  const result = await db
    .select()
    .from(followUps)
    .where(eq(followUps.id, id))
    .limit(1);
  return result[0];
}

export async function updateFollowUpStatus(
  id: number,
  status: "scheduled" | "sent" | "skipped" | "cancelled"
) {
  const db = await getDb();
  if (!db) {
    const followUp = getLocalStore().followUps.find(entry => entry.id === id);
    if (!followUp) throw new Error("Follow-up not found");
    followUp.status = status;
    followUp.updatedAt = new Date();
    persistLocalStore();
    return;
  }
  await db.update(followUps).set({ status }).where(eq(followUps.id, id));
}

export async function getDueFollowUps(userId: number) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const store = getLocalStore();
    const campaignIds = new Set(
      store.campaigns
        .filter(campaign => campaign.userId === userId)
        .map(campaign => campaign.id)
    );
    return store.followUps
      .filter(followUp => campaignIds.has(followUp.campaignId))
      .filter(followUp => followUp.status === "scheduled")
      .filter(followUp => followUp.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .map(followUp => {
        const candidate =
          store.candidates.find(entry => entry.id === followUp.candidateId) ??
          null;
        const campaign =
          store.campaigns.find(entry => entry.id === followUp.campaignId) ??
          null;
        const message = followUp.messageId
          ? (store.messages.find(entry => entry.id === followUp.messageId) ??
            null)
          : null;
        return { ...followUp, candidate, campaign, message };
      });
  }

  return db
    .select({
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
        compatibilityScore: candidates.compatibilityScore,
      },
      campaign: {
        id: campaigns.id,
        title: campaigns.title,
      },
      message: {
        id: messages.id,
        subject: messages.subject,
        content: messages.content,
        status: messages.status,
      },
    })
    .from(followUps)
    .leftJoin(campaigns, eq(followUps.campaignId, campaigns.id))
    .leftJoin(candidates, eq(followUps.candidateId, candidates.id))
    .leftJoin(messages, eq(followUps.messageId, messages.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        sql`${campaigns.status} <> 'archived'`,
        eq(followUps.status, "scheduled"),
        sql`${followUps.scheduledAt} <= now()`
      )
    )
    .orderBy(followUps.scheduledAt);
}

export async function getFollowUpSuggestions(
  userId: number,
  options?: { minDaysSinceContact?: number; limit?: number }
) {
  const minDaysSinceContact = Math.min(
    Math.max(options?.minDaysSinceContact ?? 5, 1),
    30
  );
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - minDaysSinceContact * 24 * 60 * 60 * 1000
  );
  const activeFollowUpStatuses = new Set(["scheduled"]);
  const activeMessageStatuses = new Set(["draft", "queued", "approved"]);
  const contactedMessageStatuses = new Set(["sent", "delivered"]);
  const db = await getDb();

  if (!db) {
    const store = getLocalStore();
    const userCampaigns = store.campaigns.filter(
      campaign => campaign.userId === userId && campaign.status !== "archived"
    );
    const campaignIds = new Set(userCampaigns.map(campaign => campaign.id));
    const responsesByCandidateId = new Set(
      store.candidateResponses.map(response => response.candidateId)
    );

    return store.messages
      .filter(message => campaignIds.has(message.campaignId))
      .filter(message => contactedMessageStatuses.has(message.status))
      .filter(message => !message.respondedAt)
      .map(message => ({
        message,
        lastContactAt: message.deliveredAt ?? message.sentAt ?? message.updatedAt,
      }))
      .filter(entry => entry.lastContactAt <= cutoff)
      .filter(entry => !responsesByCandidateId.has(entry.message.candidateId))
      .filter(entry => {
        return !store.followUps
          .filter(followUp => followUp.candidateId === entry.message.candidateId)
          .filter(followUp => activeFollowUpStatuses.has(followUp.status))
          .some(followUp => {
            if (!followUp.messageId) return true;
            const followUpMessage = store.messages.find(
              message => message.id === followUp.messageId
            );
            return (
              !followUpMessage ||
              activeMessageStatuses.has(followUpMessage.status)
            );
          });
      })
      .sort((a, b) => a.lastContactAt.getTime() - b.lastContactAt.getTime())
      .slice(0, limit)
      .map(entry => {
        const candidate =
          store.candidates.find(
            candidate => candidate.id === entry.message.candidateId
          ) ?? null;
        const campaign =
          store.campaigns.find(
            campaign => campaign.id === entry.message.campaignId
          ) ?? null;
        const platform =
          store.platforms.find(
            platform => platform.id === entry.message.platformId
          ) ?? null;
        const daysSinceContact = Math.max(
          1,
          Math.floor(
            (now.getTime() - entry.lastContactAt.getTime()) /
              (24 * 60 * 60 * 1000)
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
          candidate: candidate
            ? {
                id: candidate.id,
                name: candidate.name,
                compatibilityScore: candidate.compatibilityScore,
              }
            : null,
          campaign: campaign
            ? { id: campaign.id, title: campaign.title, status: campaign.status }
            : null,
          platform: platform ? { id: platform.id, name: platform.name } : null,
          message: {
            id: entry.message.id,
            subject: entry.message.subject,
            status: entry.message.status,
          },
        };
      });
  }

  const contactedMessages = await db
    .select({
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
        compatibilityScore: candidates.compatibilityScore,
      },
      campaign: {
        id: campaigns.id,
        title: campaigns.title,
        status: campaigns.status,
      },
      platform: {
        id: platforms.id,
        name: platforms.name,
      },
    })
    .from(messages)
    .leftJoin(campaigns, eq(messages.campaignId, campaigns.id))
    .leftJoin(candidates, eq(messages.candidateId, candidates.id))
    .leftJoin(platforms, eq(messages.platformId, platforms.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        sql`${campaigns.status} <> 'archived'`,
        inArray(messages.status, ["sent", "delivered"])
      )
    );

  const staleMessages = contactedMessages
    .map(message => ({
      ...message,
      lastContactAt: message.deliveredAt ?? message.sentAt ?? message.updatedAt,
    }))
    .filter(message => !message.respondedAt)
    .filter(message => message.lastContactAt <= cutoff);
  const candidateIds = Array.from(
    new Set(staleMessages.map(message => message.candidateId))
  );
  if (candidateIds.length === 0) return [];

  const [responses, activeFollowUps] = await Promise.all([
    db
      .select({ candidateId: candidateResponses.candidateId })
      .from(candidateResponses)
      .where(inArray(candidateResponses.candidateId, candidateIds)),
    db
      .select({
        candidateId: followUps.candidateId,
        messageStatus: messages.status,
        messageId: followUps.messageId,
      })
      .from(followUps)
      .leftJoin(messages, eq(followUps.messageId, messages.id))
      .where(
        and(
          inArray(followUps.candidateId, candidateIds),
          eq(followUps.status, "scheduled")
        )
      ),
  ]);
  const responseCandidateIds = new Set(
    responses.map(response => response.candidateId)
  );
  const activeFollowUpCandidateIds = new Set(
    activeFollowUps
      .filter(
        followUp =>
          !followUp.messageId ||
          !followUp.messageStatus ||
          activeMessageStatuses.has(followUp.messageStatus)
      )
      .map(followUp => followUp.candidateId)
  );

  return staleMessages
    .filter(message => !responseCandidateIds.has(message.candidateId))
    .filter(message => !activeFollowUpCandidateIds.has(message.candidateId))
    .sort((a, b) => a.lastContactAt.getTime() - b.lastContactAt.getTime())
    .slice(0, limit)
    .map(message => {
      const daysSinceContact = Math.max(
        1,
        Math.floor(
          (now.getTime() - message.lastContactAt.getTime()) /
            (24 * 60 * 60 * 1000)
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
          status: message.status,
        },
      };
    });
}

export async function getFollowUpsForCandidate(candidateId: number) {
  const db = await getDb();
  if (!db) {
    return getLocalStore()
      .followUps.filter(followUp => followUp.candidateId === candidateId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(followUps)
    .where(eq(followUps.candidateId, candidateId))
    .orderBy(desc(followUps.createdAt));
}

export async function getActiveFollowUpDraftForCandidate(
  candidateId: number,
  sequence: number
) {
  const activeMessageStatuses = new Set(["draft", "queued", "approved"]);
  const db = await getDb();

  if (!db) {
    const store = getLocalStore();
    const followUp = store.followUps
      .filter(entry => entry.candidateId === candidateId)
      .filter(entry => entry.sequence === sequence)
      .filter(entry => entry.status === "scheduled")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .find(entry => {
        if (!entry.messageId) return true;
        const message = store.messages.find(
          candidateMessage => candidateMessage.id === entry.messageId
        );
        return !message || activeMessageStatuses.has(message.status);
      });

    if (!followUp) return undefined;

    return {
      ...followUp,
      message: followUp.messageId
        ? (store.messages.find(message => message.id === followUp.messageId) ??
          null)
        : null,
    };
  }

  const result = await db
    .select({
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
        subject: messages.subject,
      },
    })
    .from(followUps)
    .leftJoin(messages, eq(followUps.messageId, messages.id))
    .where(
      and(
        eq(followUps.candidateId, candidateId),
        eq(followUps.sequence, sequence),
        eq(followUps.status, "scheduled"),
        sql`(${followUps.messageId} is null or ${messages.status} in ('draft', 'queued', 'approved'))`
      )
    )
    .orderBy(desc(followUps.createdAt))
    .limit(1);

  return result[0];
}

export async function getOrCreateCandidateIdentity(
  candidate: Candidate,
  userId: number
) {
  const db = await getDb();
  const normalizedEmail = candidate.email?.toLowerCase() || null;
  const normalizedPhone = candidate.phone?.replace(/\D/g, "") || null;

  if (!db) {
    const store = getLocalStore();
    const existingIdentity = store.candidateIdentities.find(identity => {
      return (
        ((normalizedEmail &&
          identity.canonicalEmail?.toLowerCase() === normalizedEmail) ||
          (normalizedPhone &&
            identity.canonicalPhone?.replace(/\D/g, "") === normalizedPhone)) &&
        identity.userId === userId
      );
    });

    if (existingIdentity) {
      ensureLocalCandidateSource(existingIdentity.id, candidate);
      persistLocalStore();
      return existingIdentity;
    }

    const now = new Date();
    const identity: CandidateIdentity = {
      id: nextLocalId("candidateIdentity"),
      userId,
      canonicalName: candidate.name,
      canonicalEmail: normalizedEmail,
      canonicalPhone: normalizedPhone,
      location: candidate.location ?? null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    store.candidateIdentities.push(identity);
    ensureLocalCandidateSource(identity.id, candidate);
    persistLocalStore();
    return identity;
  }

  const existing = normalizedEmail
    ? await db
        .select()
        .from(candidateIdentities)
        .where(
          and(
            eq(candidateIdentities.userId, userId),
            eq(candidateIdentities.canonicalEmail, normalizedEmail)
          )
        )
        .limit(1)
    : [];
  if (existing[0]) {
    await ensureDbCandidateSource(existing[0].id, candidate);
    return existing[0];
  }

  const result = await db.insert(candidateIdentities).values({
    userId,
    canonicalName: candidate.name,
    canonicalEmail: normalizedEmail,
    canonicalPhone: normalizedPhone,
    location: candidate.location,
  });
  const identityId = Number(result[0].insertId);
  await db.insert(candidateSources).values({
    candidateIdentityId: identityId,
    candidateId: candidate.id,
    platformId: candidate.platformId,
    externalId: candidate.externalId,
    profileUrl: candidate.profileUrl,
    profileHash: createProfileHash(candidate),
  });
  const created = await db
    .select()
    .from(candidateIdentities)
    .where(eq(candidateIdentities.id, identityId))
    .limit(1);
  return created[0];
}

export async function getCandidateDuplicateGroups(userId: number) {
  const db = await getDb();
  if (db) {
    const identities = await db
      .select()
      .from(candidateIdentities)
      .where(eq(candidateIdentities.userId, userId));
    const sources = await db.select().from(candidateSources);
    return identities
      .map(identity => ({
        identity,
        sources: sources.filter(
          source => source.candidateIdentityId === identity.id
        ),
      }))
      .filter(group => group.sources.length > 1);
  }

  const store = getLocalStore();
  return store.candidateIdentities
    .filter(identity => identity.userId === userId)
    .map(identity => ({
      identity,
      sources: store.candidateSources.filter(
        source => source.candidateIdentityId === identity.id
      ),
    }))
    .filter(group => group.sources.length > 1);
}

export async function getCandidatePotentialDuplicates(
  candidateId: number,
  userId: number
) {
  const candidate = await getCandidateById(candidateId);
  if (!candidate) return [];

  const candidateContext = await getCandidateIdentityContext(candidate.id);
  const userCandidates = await getUserCandidates(userId);
  const normalizedCandidate = normalizeDuplicateCandidate(candidate);
  const resolvedPairKeys = await getResolvedCandidateDuplicatePairKeys(userId);

  const scored = [];
  for (const otherCandidate of userCandidates as Array<Candidate & any>) {
    if (otherCandidate.id === candidate.id) continue;
    if (
      resolvedPairKeys.has(
        candidateDuplicatePairKey(candidate.id, otherCandidate.id)
      )
    ) {
      continue;
    }

    const otherContext = await getCandidateIdentityContext(otherCandidate.id);
    if (
      candidateContext.identity &&
      otherContext.identity &&
      candidateContext.identity.id === otherContext.identity.id
    ) {
      continue;
    }

    const otherNormalized = normalizeDuplicateCandidate(otherCandidate);
    const reasons: string[] = [];
    let confidence = 0;

    if (
      normalizedCandidate.email &&
      normalizedCandidate.email === otherNormalized.email
    ) {
      reasons.push("same email");
      confidence = Math.max(confidence, 100);
    }
    if (
      normalizedCandidate.phone &&
      normalizedCandidate.phone === otherNormalized.phone
    ) {
      reasons.push("same phone");
      confidence = Math.max(confidence, 95);
    }
    if (
      normalizedCandidate.profileUrl &&
      normalizedCandidate.profileUrl === otherNormalized.profileUrl
    ) {
      reasons.push("same profile URL");
      confidence = Math.max(confidence, 90);
    }
    if (
      normalizedCandidate.name &&
      normalizedCandidate.location &&
      normalizedCandidate.name === otherNormalized.name &&
      normalizedCandidate.location === otherNormalized.location
    ) {
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
        reasons,
      });
    }
  }

  return scored.sort((a, b) => b.confidence - a.confidence);
}

export async function mergeCandidateIdentitySources(input: {
  userId: number;
  targetCandidateId: number;
  sourceCandidateId: number;
}) {
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
      alreadyMerged: true,
    };
  }

  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const movedSources = store.candidateSources.filter(
      source => source.candidateIdentityId === sourceContext.identity!.id
    );
    movedSources.forEach(source => {
      source.candidateIdentityId = targetContext.identity!.id;
      source.lastSeenAt = new Date();
    });
    const targetIdentity = store.candidateIdentities.find(
      identity => identity.id === targetContext.identity!.id
    );
    if (targetIdentity) {
      targetIdentity.canonicalEmail =
        targetIdentity.canonicalEmail ??
        sourceContext.identity.canonicalEmail ??
        null;
      targetIdentity.canonicalPhone =
        targetIdentity.canonicalPhone ??
        sourceContext.identity.canonicalPhone ??
        null;
      targetIdentity.location =
        targetIdentity.location ?? sourceContext.identity.location ?? null;
      targetIdentity.updatedAt = new Date();
    }
    store.candidateIdentities = store.candidateIdentities.filter(
      identity => identity.id !== sourceContext.identity!.id
    );
    persistLocalStore();
    return {
      targetIdentityId: targetContext.identity.id,
      sourceIdentityId: sourceContext.identity.id,
      movedSourceCount: movedSources.length,
      alreadyMerged: false,
    };
  }

  await db
    .update(candidateSources)
    .set({
      candidateIdentityId: targetContext.identity.id,
      lastSeenAt: new Date(),
    })
    .where(eq(candidateSources.candidateIdentityId, sourceContext.identity.id));
  await db
    .update(candidateIdentities)
    .set({
      canonicalEmail:
        targetContext.identity.canonicalEmail ??
        sourceContext.identity.canonicalEmail,
      canonicalPhone:
        targetContext.identity.canonicalPhone ??
        sourceContext.identity.canonicalPhone,
      location:
        targetContext.identity.location ?? sourceContext.identity.location,
      updatedAt: new Date(),
    })
    .where(eq(candidateIdentities.id, targetContext.identity.id));
  await db
    .delete(candidateIdentities)
    .where(eq(candidateIdentities.id, sourceContext.identity.id));

  return {
    targetIdentityId: targetContext.identity.id,
    sourceIdentityId: sourceContext.identity.id,
    movedSourceCount: sourceContext.sources.length,
    alreadyMerged: false,
  };
}

export async function getCandidateIdentityContext(candidateId: number) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const source = store.candidateSources.find(
      entry => entry.candidateId === candidateId
    );
    const identity = source
      ? (store.candidateIdentities.find(
          entry => entry.id === source.candidateIdentityId
        ) ?? null)
      : null;
    const sources = identity
      ? store.candidateSources.filter(
          entry => entry.candidateIdentityId === identity.id
        )
      : [];
    return { identity, source: source ?? null, sources };
  }

  const sourceResult = await db
    .select()
    .from(candidateSources)
    .where(eq(candidateSources.candidateId, candidateId))
    .limit(1);
  const source = sourceResult[0] ?? null;
  if (!source) return { identity: null, source: null, sources: [] };

  const identityResult = await db
    .select()
    .from(candidateIdentities)
    .where(eq(candidateIdentities.id, source.candidateIdentityId))
    .limit(1);
  const sources = await db
    .select()
    .from(candidateSources)
    .where(
      eq(candidateSources.candidateIdentityId, source.candidateIdentityId)
    );

  return { identity: identityResult[0] ?? null, source, sources };
}

function ensureLocalCandidateSource(
  candidateIdentityId: number,
  candidate: Candidate
) {
  const store = getLocalStore();
  const existing = store.candidateSources.find(
    source => source.candidateId === candidate.id
  );
  if (existing) {
    existing.lastSeenAt = new Date();
    return existing.id;
  }

  const now = new Date();
  const source: CandidateSource = {
    id: nextLocalId("candidateSource"),
    candidateIdentityId,
    candidateId: candidate.id,
    platformId: candidate.platformId,
    externalId: candidate.externalId ?? null,
    profileUrl: candidate.profileUrl ?? null,
    profileHash: createProfileHash(candidate),
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
  };
  store.candidateSources.push(source);
  return source.id;
}

async function ensureDbCandidateSource(
  candidateIdentityId: number,
  candidate: Candidate
) {
  const db = await getDb();
  if (!db) return ensureLocalCandidateSource(candidateIdentityId, candidate);

  const existing = await db
    .select()
    .from(candidateSources)
    .where(eq(candidateSources.candidateId, candidate.id))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const result = await db.insert(candidateSources).values({
    candidateIdentityId,
    candidateId: candidate.id,
    platformId: candidate.platformId,
    externalId: candidate.externalId,
    profileUrl: candidate.profileUrl,
    profileHash: createProfileHash(candidate),
  });
  return Number(result[0].insertId);
}

function createProfileHash(candidate: Candidate) {
  const normalized = [
    candidate.name?.toLowerCase(),
    candidate.email?.toLowerCase(),
    candidate.phone?.replace(/\D/g, ""),
    candidate.profileUrl?.toLowerCase(),
  ]
    .filter(Boolean)
    .join("|");
  return Buffer.from(normalized).toString("base64url").slice(0, 128);
}

function normalizeDuplicateCandidate(
  candidate: Pick<
    Candidate,
    "name" | "email" | "phone" | "profileUrl" | "location"
  >
) {
  return {
    name: candidate.name?.trim().toLowerCase() ?? "",
    email: candidate.email?.trim().toLowerCase() ?? "",
    phone: candidate.phone?.replace(/\D/g, "") ?? "",
    profileUrl: candidate.profileUrl?.trim().toLowerCase() ?? "",
    location: candidate.location?.trim().toLowerCase() ?? "",
  };
}

function candidateDuplicatePairKey(candidateAId: number, candidateBId: number) {
  const [firstId, secondId] = [candidateAId, candidateBId].sort(
    (a: number, b: number) => a - b
  );
  return `${firstId}:${secondId}`;
}

async function getResolvedCandidateDuplicatePairKeys(userId: number) {
  const db = await getDb();
  const resolutions = db
    ? await db
        .select()
        .from(candidateDuplicateResolutions)
        .where(eq(candidateDuplicateResolutions.userId, userId))
    : getLocalStore().candidateDuplicateResolutions.filter(
        resolution => resolution.userId === userId
      );

  return new Set(
    resolutions.map(resolution =>
      candidateDuplicatePairKey(
        resolution.targetCandidateId,
        resolution.sourceCandidateId
      )
    )
  );
}

export async function createCandidateDuplicateResolution(input: {
  userId: number;
  targetCandidateId: number;
  sourceCandidateId: number;
  decision: "merged" | "not_duplicate";
  reason: string;
  confidence?: number;
  reasons?: string[];
}) {
  const now = new Date();
  const db = await getDb();

  if (!db) {
    const resolution: CandidateDuplicateResolution = {
      id: nextLocalId("candidateDuplicateResolution"),
      userId: input.userId,
      targetCandidateId: input.targetCandidateId,
      sourceCandidateId: input.sourceCandidateId,
      decision: input.decision,
      confidence: input.confidence ?? 0,
      reasonsJson: input.reasons ? JSON.stringify(input.reasons) : null,
      decisionReason: input.reason,
      resolvedAt: now,
      createdAt: now,
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
    resolvedAt: now,
  });
  return Number(result[0].insertId);
}

// Analytics queries
export async function getCampaignStats(campaignId: number) {
  const db = await getDb();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return null;

  if (!db) {
    const store = getLocalStore();
    return {
      ...campaign,
      totalCandidates: store.candidates.filter(
        candidate => candidate.campaignId === campaignId
      ).length,
      messagesSent: store.messages.filter(
        message =>
          message.campaignId === campaignId && message.status === "sent"
      ).length,
      responsesReceived: store.messages.filter(
        message =>
          message.campaignId === campaignId && message.status === "responded"
      ).length,
    };
  }

  const totalCandidates = await db
    .select({ count: sql<number>`count(*)` })
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));

  const messagesSent = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(eq(messages.campaignId, campaignId), eq(messages.status, "sent"))
    );

  const responsesReceived = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(eq(messages.campaignId, campaignId), eq(messages.status, "responded"))
    );

  return {
    ...campaign,
    totalCandidates: totalCandidates[0]?.count || 0,
    messagesSent: messagesSent[0]?.count || 0,
    responsesReceived: responsesReceived[0]?.count || 0,
  };
}
