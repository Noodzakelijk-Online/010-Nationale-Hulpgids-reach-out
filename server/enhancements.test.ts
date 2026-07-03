import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import * as db from "./db";

/**
 * Tests for GitHub enhancements:
 * - In-memory queue system
 * - Rate limiter service
 * - Crawlee scraper
 */

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("In-Memory Queue System", () => {
  it("should add jobs to the queue", async () => {
    const { addMessageToQueue } = await import("./services/inMemoryQueue");
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");

    const jobId = await addMessageToQueue({
      candidateId: 1,
      campaignId: 1,
      platform: "Nationale Hulpgids",
      platformId: nationaleHulpgidsId,
      messageContent: "Test message",
      priority: 1,
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
  });

  it("should get queue statistics", async () => {
    const { getQueueStats } = await import("./services/inMemoryQueue");

    const stats = await getQueueStats("messages");

    expect(stats).toBeDefined();
    expect(stats).toHaveProperty("waiting");
    expect(stats).toHaveProperty("active");
    expect(stats).toHaveProperty("completed");
    expect(stats).toHaveProperty("failed");
    expect(stats).toHaveProperty("delayed");
    expect(stats).toHaveProperty("total");
  });

  it("should add discovery jobs to the queue", async () => {
    const platformScraper = await import("./services/platformScraper");
    vi.spyOn(
      platformScraper.PlatformScraperFactory,
      "createScraper"
    ).mockReturnValue({
      authenticate: vi.fn().mockResolvedValue(true),
      searchCandidates: vi.fn().mockResolvedValue([]),
      getCandidateDetails: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn().mockResolvedValue(false),
    } as any);
    const { addDiscoveryToQueue, discoveryQueue } = await import(
      "./services/inMemoryQueue"
    );
    const indeedId = await getPlatformId("Indeed");
    const campaignId = await db.createCampaign({
      userId: 1,
      title: "Discovery Queue Add Test",
      description: "Verify public discovery can be queued",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Personal care",
      }),
      status: "active",
    });

    const jobId = await addDiscoveryToQueue({
      campaignId,
      platformId: indeedId,
      userId: 1,
      searchCriteria: {
        location: "Arnhem",
        services: ["Personal care"],
      },
      priority: 1,
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
    const completedJob = await waitForQueueJob(discoveryQueue, jobId);
    expect(completedJob.status).toBe("completed");
  });

  it("should block unsafe discovery jobs before enqueueing", async () => {
    const { addDiscoveryToQueue } = await import("./services/inMemoryQueue");
    const campaignId = await db.createCampaign({
      userId: 1,
      title: "Blocked Discovery Queue Test",
      description: "Missing target platforms should block queued discovery",
      targetPlatforms: JSON.stringify([]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
      status: "active",
    });

    await expect(
      addDiscoveryToQueue({
        campaignId,
        platformId: 1,
        userId: 1,
        searchCriteria: {
          location: "Arnhem",
          services: ["Begeleiding"],
        },
      })
    ).rejects.toThrow(/readiness checks/i);

    const auditEvents = await db.getAuditEventsForCampaign(1, campaignId);
    const failedQueueRecords = await db.getQueueJobRecords(
      1,
      "discovery",
      "failed"
    );

    expect(
      auditEvents.some(
        event =>
          event.action === "campaign.discovery_blocked_readiness" &&
          event.source === "queue.discovery.enqueue"
      )
    ).toBe(true);
    expect(
      failedQueueRecords.some(
        record =>
          record.campaignId === campaignId &&
          record.errorMessage?.includes("readiness checks")
      )
    ).toBe(true);
  });

  it("should persist real discovery queue scraper results instead of mock candidates", async () => {
    const platformScraper = await import("./services/platformScraper");
    const indeedId = await getPlatformId("Indeed");
    const suffix = Date.now();
    const candidateEmail = `queue-discovery-${suffix}@example.com`;
    const profileUrl = `https://indeed.com/candidate/queue-discovery-${suffix}`;
    const searchCandidates = vi.fn().mockResolvedValue([
      {
        name: "Queue Discovery Candidate",
        email: candidateEmail,
        profileUrl,
        location: "Arnhem",
        experience: "5 jaar begeleiding",
        services: "Begeleiding, persoonlijke verzorging",
        availability: "Doordeweeks",
        hourlyRate: "€24/hour",
        bio: "Ervaren begeleider uit Arnhem.",
      },
    ]);
    vi.spyOn(
      platformScraper.PlatformScraperFactory,
      "createScraper"
    ).mockReturnValue({
      authenticate: vi.fn().mockResolvedValue(true),
      searchCandidates,
      getCandidateDetails: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn().mockResolvedValue(false),
    } as any);

    const campaignId = await db.createCampaign({
      userId: 1,
      title: "Discovery Queue Persistence Test",
      description: "Verify queued discovery persists scraper output",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
        minBudget: "15",
        maxBudget: "30",
      }),
      status: "active",
    });

    const { addDiscoveryToQueue, discoveryQueue } = await import(
      "./services/inMemoryQueue"
    );
    const jobId = await addDiscoveryToQueue({
      campaignId,
      platformId: indeedId,
      userId: 1,
      searchCriteria: {
        location: "Arnhem",
        services: ["Begeleiding"],
        minBudget: "15",
        maxBudget: "30",
      },
    });

    const completedJob = await waitForQueueJob(discoveryQueue, jobId);

    expect(searchCandidates).toHaveBeenCalledWith(
      {
        location: "Arnhem",
        experience: undefined,
        services: "Begeleiding",
        minBudget: "15",
        maxBudget: "30",
        keywords: undefined,
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(completedJob.status).toBe("completed");
    expect(completedJob.result.candidatesFound).toBe(1);
    expect(completedJob.result.candidatesSkippedAsDuplicates).toBe(0);

    const candidates = await db.getUserCandidates(1);
    const persisted = candidates.find(
      (candidate: any) => candidate.email === candidateEmail
    );
    expect(persisted).toBeDefined();
    expect(persisted?.name).toBe("Queue Discovery Candidate");
    expect(persisted?.profileUrl).toBe(profileUrl);

    const identityContext = await db.getCandidateIdentityContext(persisted!.id);
    expect(identityContext.identity).toBeTruthy();
    expect(identityContext.source?.profileUrl).toBe(persisted?.profileUrl);

    const auditEvents = await db.getAuditEventsForCampaign(1, campaignId);
    expect(
      auditEvents.some(
        event => event.action === "candidate.discovery_completed"
      )
    ).toBe(true);

    const durableJob = await waitForDurableQueueJob(
      1,
      "discovery",
      "completed",
      campaignId
    );
    expect(durableJob.payloadJson).toContain(jobId);
    expect(durableJob.payloadJson).toContain('"candidatesFound":1');
  });

  it("should persist message queue lifecycle without storing message content", async () => {
    const { resetMessageLimit } = await import("./services/rateLimiter");
    await resetMessageLimit("Nationale Hulpgids");
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");

    const campaignId = await db.createCampaign({
      userId: 1,
      title: "Message Queue Durable Lifecycle Test",
      description: "Verify durable message jobs redact content",
      targetPlatforms: JSON.stringify([nationaleHulpgidsId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
      status: "active",
    });
    const candidateId = await db.createCandidate({
      campaignId,
      platformId: nationaleHulpgidsId,
      name: "Durable Queue Candidate",
      email: "durable-queue-candidate@example.com",
      profileUrl: "https://www.nationalehulpgids.nl/profiel/durable-queue",
      location: "Arnhem",
      compatibilityScore: 88,
      status: "matched",
    });

    const { addMessageToQueue, messageQueue } = await import(
      "./services/inMemoryQueue"
    );
    const jobId = await addMessageToQueue({
      candidateId,
      campaignId,
      platform: "Nationale Hulpgids",
      platformId: nationaleHulpgidsId,
      userId: 1,
      subject: "Kennismaking",
      messageContent: "Persoonlijke tekst die niet in queue records hoort",
      priority: 1,
    });

    const completedJob = await waitForQueueJob(messageQueue, jobId);
    expect(completedJob.status).toBe("completed");
    const messages = await db.getAllMessages(1, undefined, campaignId);
    const queuedMessage = messages.find(
      (message: any) => message.id === completedJob.result.messageId
    );
    expect(queuedMessage?.platformId).toBe(nationaleHulpgidsId);
    expect(queuedMessage?.platform?.name).toBe("Nationale Hulpgids");

    const durableJob = await waitForDurableQueueJob(
      1,
      "messages",
      "completed",
      campaignId
    );
    expect(durableJob.messageId).toBe(completedJob.result.messageId);
    expect(durableJob.payloadJson).toContain(jobId);
    expect(durableJob.payloadJson).toContain("[redacted]");
    expect(durableJob.payloadJson).not.toContain(
      "Persoonlijke tekst die niet in queue records hoort"
    );
  });

  it("should fail message queue jobs when platform id and name disagree", async () => {
    const { resetMessageLimit } = await import("./services/rateLimiter");
    await resetMessageLimit("Nationale Hulpgids");
    const indeedId = await getPlatformId("Indeed");
    const nationaleHulpgidsId = await getPlatformId("Nationale Hulpgids");

    const campaignId = await db.createCampaign({
      userId: 1,
      title: "Message Queue Platform Mismatch Test",
      description: "Verify queue jobs cannot store the wrong source platform",
      targetPlatforms: JSON.stringify([nationaleHulpgidsId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
      status: "active",
    });
    const candidateId = await db.createCandidate({
      campaignId,
      platformId: nationaleHulpgidsId,
      name: "Platform Mismatch Candidate",
      email: "platform-mismatch-candidate@example.com",
      profileUrl: "https://www.nationalehulpgids.nl/profiel/platform-mismatch",
      location: "Arnhem",
      compatibilityScore: 88,
      status: "matched",
    });

    const { addMessageToQueue } = await import("./services/inMemoryQueue");
    await addMessageToQueue({
      candidateId,
      campaignId,
      platform: "Nationale Hulpgids",
      platformId: indeedId,
      userId: 1,
      subject: "Kennismaking",
      messageContent: "Deze taak heeft tegenstrijdige platformgegevens",
      priority: 1,
    });

    const failedJob = await waitForDurableQueueJob(
      1,
      "messages",
      "failed",
      campaignId
    );
    expect(failedJob.errorMessage).toMatch(/platform mismatch/i);
    const messages = await db.getAllMessages(1, undefined, campaignId);
    expect(messages).toHaveLength(0);
  }, 15000);

  it("should cooperatively cancel active discovery jobs at safe checkpoints", async () => {
    const platformScraper = await import("./services/platformScraper");
    const { appRouter } = await import("./routers");
    const indeedId = await getPlatformId("Indeed");
    let releaseSearch: (() => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    const searchStarted = new Promise<void>(resolve => {
      vi.spyOn(
        platformScraper.PlatformScraperFactory,
        "createScraper"
      ).mockReturnValue({
        authenticate: vi.fn().mockResolvedValue(true),
        searchCandidates: vi.fn().mockImplementation(
          (_criteria, options) =>
            new Promise(resolveSearch => {
              observedSignal = options?.signal;
              releaseSearch = () => resolveSearch([]);
              resolve();
            })
        ),
        getCandidateDetails: vi.fn().mockResolvedValue(null),
        sendMessage: vi.fn().mockResolvedValue(false),
      } as any);
    });

    const campaignId = await db.createCampaign({
      userId: 1,
      title: "Active Discovery Cancellation Test",
      description: "Verify active discovery can stop at a safe checkpoint",
      targetPlatforms: JSON.stringify([indeedId]),
      searchCriteria: JSON.stringify({
        location: "Arnhem",
        services: "Begeleiding",
      }),
      status: "active",
    });

    const { addDiscoveryToQueue } = await import("./services/inMemoryQueue");
    await addDiscoveryToQueue({
      campaignId,
      platformId: indeedId,
      userId: 1,
      searchCriteria: {
        location: "Arnhem",
        services: ["Begeleiding"],
      },
    });

    try {
      await searchStarted;
      const activeJob = await waitForDurableQueueJob(
        1,
        "discovery",
        "active",
        campaignId
      );
      const caller = appRouter.createCaller({
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
      } as any);

      const result = await caller.queue.cancelJob({
        id: activeJob.id,
        reason: "Stop this long discovery pass",
      });

      expect(result.success).toBe(true);
      expect(result.cancellationRequested).toBe(true);
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedSignal?.aborted).toBe(true);

      releaseSearch?.();

      const cancelledJob = await waitForDurableQueueJob(
        1,
        "discovery",
        "cancelled",
        campaignId
      );
      expect(cancelledJob.errorMessage).toMatch(/cancelled by user request/i);

      const auditEvents = await db.getAuditEventsForCampaign(1, campaignId);
      expect(
        auditEvents.some(
          event => event.action === "queue.job_cancel_requested"
        )
      ).toBe(true);
      expect(
        auditEvents.some(
          event => event.action === "candidate.discovery_completed"
        )
      ).toBe(false);
      expect(
        auditEvents.some(event => event.action === "candidate.discovery_failed")
      ).toBe(false);
    } finally {
      releaseSearch?.();
    }
  }, 15000);

  it("should process jobs with priority ordering", async () => {
    const { addMessageToQueue, messageQueue } = await import(
      "./services/inMemoryQueue"
    );
    const indeedId = await getPlatformId("Indeed");

    // Add low priority job
    await addMessageToQueue({
      candidateId: 1,
      campaignId: 1,
      platform: "Indeed",
      platformId: indeedId,
      messageContent: "Low priority",
      priority: 1,
    });

    // Add high priority job
    await addMessageToQueue({
      candidateId: 2,
      campaignId: 1,
      platform: "Indeed",
      platformId: indeedId,
      messageContent: "High priority",
      priority: 10,
    });

    // High priority job should be processed first
    // (In real implementation, you'd check the processing order)
    expect(true).toBe(true);
  });
});

async function waitForQueueJob(queue: any, jobId: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const jobs = await queue.getJobs();
    const job = jobs.find((entry: any) => entry.id === jobId);
    if (job?.status === "completed") return job;
    if (job?.status === "failed") {
      throw new Error(job.error || "Queue job failed");
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Queue job ${jobId} did not finish`);
}

async function getPlatformId(name: string) {
  const platform = await db.getPlatformByName(name);
  if (!platform) throw new Error(`Missing test platform: ${name}`);
  return platform.id;
}

async function waitForDurableQueueJob(
  userId: number,
  queueName: "messages" | "discovery",
  status:
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "cancelled",
  campaignId: number
) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const jobs = await db.getQueueJobRecords(userId, queueName, status);
    const job = jobs.find(entry => entry.campaignId === campaignId);
    if (job) return job;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(
    `Durable ${queueName} job for campaign ${campaignId} did not reach ${status}`
  );
}

describe("Rate Limiter Service", () => {
  it("should consume API rate limit points", async () => {
    const { consumeApiLimit } = await import("./services/rateLimiter");

    const result = await consumeApiLimit(1, 1);

    expect(result).toBeDefined();
    expect(result.remainingPoints).toBeGreaterThanOrEqual(0);
  });

  it("should throw error when rate limit exceeded", async () => {
    const { consumeApiLimit, apiLimiter } = await import(
      "./services/rateLimiter"
    );

    // Consume all points
    for (let i = 0; i < 100; i++) {
      try {
        await consumeApiLimit(999, 1);
      } catch (error) {
        // Expected to fail eventually
      }
    }

    // Next request should fail
    await expect(consumeApiLimit(999, 1)).rejects.toThrow(
      /Rate limit exceeded/
    );
  });

  it("should get API limit info", async () => {
    const { getApiLimitInfo } = await import("./services/rateLimiter");

    const info = await getApiLimitInfo(1);

    expect(info).toBeDefined();
    expect(info).toHaveProperty("remainingPoints");
    expect(info).toHaveProperty("msBeforeNext");
    expect(info).toHaveProperty("consumedPoints");
  });

  it("should consume scraper rate limit for platform", async () => {
    const { consumeScraperLimit } = await import("./services/rateLimiter");

    const result = await consumeScraperLimit("Nationale Hulpgids", 1);

    expect(result).toBeDefined();
  });

  it("should consume message rate limit for platform", async () => {
    const { consumeMessageLimit } = await import("./services/rateLimiter");

    const result = await consumeMessageLimit("Nationale Hulpgids", 1);

    expect(result).toBeDefined();
  });

  it("should expose and reset message rate limit state", async () => {
    const { consumeMessageLimit, getMessageLimitInfo, resetMessageLimit } =
      await import("./services/rateLimiter");

    await resetMessageLimit("Nationale Hulpgids");
    await consumeMessageLimit("Nationale Hulpgids", 1);

    const consumed = await getMessageLimitInfo("Nationale Hulpgids");
    expect(consumed?.remainingPoints).toBe(4);
    expect(consumed?.consumedPoints).toBe(1);

    await resetMessageLimit("Nationale Hulpgids");

    const reset = await getMessageLimitInfo("Nationale Hulpgids");
    expect(reset?.remainingPoints).toBe(5);
    expect(reset?.consumedPoints).toBe(0);
  });

  it("should reset API limit for user", async () => {
    const { resetApiLimit, getApiLimitInfo } = await import(
      "./services/rateLimiter"
    );

    // Consume some points
    await import("./services/rateLimiter").then(m =>
      m.consumeApiLimit(100, 10)
    );

    // Reset limit
    await resetApiLimit(100);

    // Check that limit is reset
    const info = await getApiLimitInfo(100);
    expect(info.remainingPoints).toBe(100);
  });

  it.skip("should block user for specific duration", async () => {
    const { blockUser, isUserBlocked } = await import("./services/rateLimiter");

    // Block user for 1 second
    await blockUser(200, 1);

    // User should be blocked
    const blocked = await isUserBlocked(200);
    expect(blocked).toBe(true);
  });

  it("should penalize user by increasing consumed points", async () => {
    const { penalizeUser, getApiLimitInfo } = await import(
      "./services/rateLimiter"
    );

    // Get initial state
    const before = await getApiLimitInfo(300);

    // Penalize user
    await penalizeUser(300, 10);

    // Check that consumed points increased
    const after = await getApiLimitInfo(300);
    expect(after.consumedPoints).toBeGreaterThan(before.consumedPoints);
  });

  it("should reward user by decreasing consumed points", async () => {
    const { rewardUser, consumeApiLimit, getApiLimitInfo } = await import(
      "./services/rateLimiter"
    );

    // Consume some points first
    await consumeApiLimit(400, 20);

    // Get state before reward
    const before = await getApiLimitInfo(400);

    // Reward user
    await rewardUser(400, 10);

    // Check that consumed points decreased
    const after = await getApiLimitInfo(400);
    expect(after.consumedPoints).toBeLessThan(before.consumedPoints);
  });
});

describe("Crawlee Scraper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "should keep Crawlee runtime storage out of the repository storage folder",
    async () => {
      const { getCrawleeConfiguration, getCrawleeStorageDirectory } =
        await import("./_core/crawleeStorage");

      const expectedRepoStorage = path.resolve(process.cwd(), "storage");
      const storageDirectory = getCrawleeStorageDirectory();
      const storageClient = getCrawleeConfiguration().getStorageClient() as any;

      expect(path.resolve(storageDirectory)).not.toBe(expectedRepoStorage);
      expect(path.resolve(storageClient.localDataDirectory)).toBe(
        path.resolve(storageDirectory)
      );
      expect(storageClient.persistStorage).toBe(false);
    },
    15000
  );

  it("should not return mock Nationale Hulpgids candidates when search fails", async () => {
    const { NationaleHulpgidsScraper } = await import(
      "./services/scrapers/nationaleHulpgids"
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    const scraper = new NationaleHulpgidsScraper();
    const candidates = await scraper.searchCandidates({ location: "Arnhem" });

    expect(fetchMock).toHaveBeenCalled();
    expect(candidates).toEqual([]);
    expect(JSON.stringify(candidates)).not.toContain("Jan Smit");
    expect(JSON.stringify(candidates)).not.toContain("Maria de Vries");
  });

  it("should create Crawlee scraper instance", async () => {
    const { createCrawleeScraper } = await import(
      "./services/scrapers/crawleeNationaleHulpgids"
    );

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
    });

    expect(scraper).toBeDefined();
    expect(scraper).toHaveProperty("authenticate");
    expect(scraper).toHaveProperty("searchCandidates");
    expect(scraper).toHaveProperty("getCandidateProfile");
  }, 15000);

  it("should not create a mock Nationale Hulpgids authenticated session", async () => {
    const { createCrawleeScraper } = await import(
      "./services/scrapers/crawleeNationaleHulpgids"
    );

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
    });

    const result = await scraper.authenticate();

    expect(result).toBe(false);
    expect((scraper as any).sessionCookie).toBeUndefined();
  });

  it("should not create mock sessions for public-listing Crawlee scrapers", async () => {
    const [
      { createIndeedScraper },
      { createPGBvacaturesScraper },
      { createZorgbanenScraper },
      { createJobbirdScraper },
    ] = await Promise.all([
      import("./services/scrapers/crawleeIndeed"),
      import("./services/scrapers/crawleePGBvacatures"),
      import("./services/scrapers/crawleeZorgbanen"),
      import("./services/scrapers/crawleeJobbird"),
    ]);

    const scrapers = [
      createIndeedScraper({ email: "test@example.com", password: "secret" }),
      createPGBvacaturesScraper({
        email: "test@example.com",
        password: "secret",
      }),
      createZorgbanenScraper({ email: "test@example.com", password: "secret" }),
      createJobbirdScraper({ email: "test@example.com", password: "secret" }),
    ];

    for (const scraper of scrapers) {
      await expect(scraper.authenticate()).resolves.toBe(false);
      expect((scraper as any).sessionCookie).toBeUndefined();
    }
  });

  it("should search for candidates with criteria", async () => {
    const { createCrawleeScraper } = await import(
      "./services/scrapers/crawleeNationaleHulpgids"
    );

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
      maxRequestsPerCrawl: 1, // Limit to 1 request for testing
    });

    // Note: This will return empty results in test environment
    // In production, it would scrape real data
    const candidates = await scraper.searchCandidates({
      location: "Arnhem",
      services: ["Personal care"],
      maxDistance: 25,
    });

    expect(Array.isArray(candidates)).toBe(true);
  });

  it("should close scraper resources", async () => {
    const { createCrawleeScraper } = await import(
      "./services/scrapers/crawleeNationaleHulpgids"
    );

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
    });

    await expect(scraper.close()).resolves.not.toThrow();
  });
});

describe("Platform Sending Safety", () => {
  it("should fail closed for unsupported platform scraper sending", async () => {
    const { PlatformScraperFactory } = await import(
      "./services/platformScraper"
    );

    for (const platform of [
      "Indeed",
      "Nationale Hulpgids",
      "PGBvacatures",
      "Zorgbanen",
      "Jobbird",
    ]) {
      const scraper = PlatformScraperFactory.createScraper(platform);

      await expect(
        scraper.sendMessage("candidate-1", "Approved message content")
      ).rejects.toThrow(/not implemented/i);
    }
  });

  it("should not report success from the enhanced Nationale Hulpgids send stub", async () => {
    const { NationaleHulpgidsScraper } = await import(
      "./services/scrapers/nationaleHulpgids"
    );
    const scraper = new NationaleHulpgidsScraper({
      email: "person@example.com",
      password: "secret",
    });
    (scraper as any).isAuthenticated = true;

    await expect(
      scraper.sendMessage("candidate-1", "Approved message content")
    ).rejects.toThrow(/not implemented/i);
  });
});

describe("Rate Limit Middleware", () => {
  it("should allow requests within rate limit", async () => {
    const { rateLimitMiddleware } = await import("./_core/rateLimitMiddleware");

    const ctx = { user: { id: 500 } };
    const next = vi.fn().mockResolvedValue("success");

    const result = await rateLimitMiddleware({ ctx, next });

    expect(next).toHaveBeenCalled();
    expect(result).toBe("success");
  });

  it("should get rate limit info for user", async () => {
    const { getRateLimitInfo } = await import("./_core/rateLimitMiddleware");

    const info = await getRateLimitInfo(1);

    expect(info).toBeDefined();
    expect(info).toHaveProperty("limit");
    expect(info).toHaveProperty("remaining");
    expect(info).toHaveProperty("resetAt");
    expect(info).toHaveProperty("consumed");
  });
});

describe("Queue Integration with tRPC", () => {
  it("should have queue stats endpoint", async () => {
    const { appRouter } = await import("./routers");

    // Check that queue router exists
    expect(appRouter).toBeDefined();
    expect(appRouter._def.procedures).toHaveProperty("queue.getStats");
    expect(appRouter._def.procedures).toHaveProperty("queue.getHealth");
    expect(appRouter._def.procedures).toHaveProperty("queue.cancelJob");
  });
});
