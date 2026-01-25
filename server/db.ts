import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  platforms,
  campaigns,
  candidates,
  messages,
  platformCredentials,
  matchFactors,
  followUps,
  Platform,
  Campaign,
  Candidate,
  Message,
  PlatformCredential,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

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
    console.warn("[Database] Cannot upsert user: database not available");
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
      values.role = 'admin';
      updateSet.role = 'admin';
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
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Multi-platform reach-out tool database queries

// Platform queries
export async function getAllPlatforms() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platforms).where(eq(platforms.isActive, 1));
}

export async function getPlatformById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(platforms).where(eq(platforms.id, id)).limit(1);
  return result[0];
}

// Campaign queries
export async function getUserCampaigns(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

export async function createCampaign(campaign: typeof campaigns.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(campaign);
  return Number(result[0].insertId);
}

export async function updateCampaign(id: number, updates: Partial<Campaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
}

// Candidate queries
export async function getCampaignCandidates(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId))
    .orderBy(desc(candidates.compatibilityScore));
}

export async function getCandidateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  return result[0];
}

export async function createCandidate(candidate: typeof candidates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(candidates).values(candidate);
  return Number(result[0].insertId);
}

export async function updateCandidate(id: number, updates: Partial<Candidate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(candidates).set(updates).where(eq(candidates.id, id));
}

// Message queries
export async function getCampaignMessages(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages).where(eq(messages.campaignId, campaignId)).orderBy(desc(messages.createdAt));
}

export async function getCandidateMessages(candidateId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messages).where(eq(messages.candidateId, candidateId)).orderBy(desc(messages.createdAt));
}

export async function createMessage(message: typeof messages.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(message);
  return Number(result[0].insertId);
}

export async function updateMessage(id: number, subject: string, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(messages).set({ subject, content }).where(eq(messages.id, id));
}

export async function getAllMessages(userId: number, status?: string, campaignId?: number) {
  const db = await getDb();
  if (!db) return [];
  
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
  
  return query.orderBy(desc(messages.createdAt));
}

export async function updateMessageStatus(messageId: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { status };
  if (status === "sent") {
    updates.sentAt = new Date();
  }
  
  await db.update(messages).set(updates).where(eq(messages.id, messageId));
}

export async function bulkUpdateMessageStatus(messageIds: number[], status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
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
    return {
      totalSent: 0,
      totalReplied: 0,
      totalPending: 0,
      responseRate: 0,
      avgResponseTime: undefined,
      trend: "stable" as const,
    };
  }
  
  // Get all messages for this campaign
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.campaignId, campaignId));
  
  const totalSent = allMessages.filter((m) => 
    m.status === "sent" || m.status === "delivered" || m.status === "replied" || m.status === "responded"
  ).length;
  
  const totalReplied = allMessages.filter((m) => 
    m.status === "replied" || m.status === "responded"
  ).length;
  
  const totalPending = allMessages.filter((m) => 
    m.status === "sent" || m.status === "delivered"
  ).length;
  
  const responseRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
  
  // Calculate average response time
  let avgResponseTime: number | undefined = undefined;
  const repliedMessages = allMessages.filter((m) => 
    (m.status === "replied" || m.status === "responded") && m.sentAt && m.respondedAt
  );
  
  if (repliedMessages.length > 0) {
    const totalResponseTime = repliedMessages.reduce((sum, m) => {
      if (m.sentAt && m.respondedAt) {
        const diff = m.respondedAt.getTime() - m.sentAt.getTime();
        return sum + diff;
      }
      return sum;
    }, 0);
    avgResponseTime = totalResponseTime / repliedMessages.length / (1000 * 60 * 60); // Convert to hours
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
  if (!db) return [];
  return db.select().from(platformCredentials).where(eq(platformCredentials.userId, userId));
}

export async function getPlatformCredential(userId: number, platformId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(platformCredentials)
    .where(and(eq(platformCredentials.userId, userId), eq(platformCredentials.platformId, platformId)))
    .limit(1);
  return result[0];
}

export async function upsertPlatformCredential(credential: typeof platformCredentials.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getPlatformCredential(credential.userId, credential.platformId);
  
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
  if (!db) return [];
  return db.select().from(matchFactors).where(eq(matchFactors.candidateId, candidateId));
}

export async function createMatchFactor(factor: typeof matchFactors.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(matchFactors).values(factor);
  return Number(result[0].insertId);
}

// Analytics queries
export async function getCampaignStats(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return null;
  
  const totalCandidates = await db
    .select({ count: sql<number>`count(*)` })
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));
  
  const messagesSent = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, "sent")));
  
  const responsesReceived = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, "responded")));
  
  return {
    ...campaign,
    totalCandidates: totalCandidates[0]?.count || 0,
    messagesSent: messagesSent[0]?.count || 0,
    responsesReceived: responsesReceived[0]?.count || 0,
  };
}
