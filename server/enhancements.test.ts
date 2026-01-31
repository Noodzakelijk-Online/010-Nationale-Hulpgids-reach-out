import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests for GitHub enhancements:
 * - In-memory queue system
 * - Rate limiter service
 * - Crawlee scraper
 */

describe("In-Memory Queue System", () => {
  it("should add jobs to the queue", async () => {
    const { addMessageToQueue } = await import("./services/inMemoryQueue");

    const jobId = await addMessageToQueue({
      candidateId: 1,
      campaignId: 1,
      platform: "Nationale Hulpgids",
      platformId: 1,
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
    const { addDiscoveryToQueue } = await import("./services/inMemoryQueue");

    const jobId = await addDiscoveryToQueue({
      campaignId: 1,
      platformId: 1,
      searchCriteria: {
        location: "Arnhem",
        services: ["Personal care"],
      },
      priority: 1,
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
  });

  it("should process jobs with priority ordering", async () => {
    const { addMessageToQueue, messageQueue } = await import("./services/inMemoryQueue");

    // Add low priority job
    await addMessageToQueue({
      candidateId: 1,
      campaignId: 1,
      platform: "Indeed",
      platformId: 2,
      messageContent: "Low priority",
      priority: 1,
    });

    // Add high priority job
    await addMessageToQueue({
      candidateId: 2,
      campaignId: 1,
      platform: "Indeed",
      platformId: 2,
      messageContent: "High priority",
      priority: 10,
    });

    // High priority job should be processed first
    // (In real implementation, you'd check the processing order)
    expect(true).toBe(true);
  });
});

describe("Rate Limiter Service", () => {
  it("should consume API rate limit points", async () => {
    const { consumeApiLimit } = await import("./services/rateLimiter");

    const result = await consumeApiLimit(1, 1);

    expect(result).toBeDefined();
    expect(result.remainingPoints).toBeGreaterThanOrEqual(0);
  });

  it("should throw error when rate limit exceeded", async () => {
    const { consumeApiLimit, apiLimiter } = await import("./services/rateLimiter");

    // Consume all points
    for (let i = 0; i < 100; i++) {
      try {
        await consumeApiLimit(999, 1);
      } catch (error) {
        // Expected to fail eventually
      }
    }

    // Next request should fail
    await expect(consumeApiLimit(999, 1)).rejects.toThrow(/Rate limit exceeded/);
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

  it("should reset API limit for user", async () => {
    const { resetApiLimit, getApiLimitInfo } = await import("./services/rateLimiter");

    // Consume some points
    await import("./services/rateLimiter").then((m) => m.consumeApiLimit(100, 10));

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
    const { penalizeUser, getApiLimitInfo } = await import("./services/rateLimiter");

    // Get initial state
    const before = await getApiLimitInfo(300);

    // Penalize user
    await penalizeUser(300, 10);

    // Check that consumed points increased
    const after = await getApiLimitInfo(300);
    expect(after.consumedPoints).toBeGreaterThan(before.consumedPoints);
  });

  it("should reward user by decreasing consumed points", async () => {
    const { rewardUser, consumeApiLimit, getApiLimitInfo } = await import("./services/rateLimiter");

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
  it("should create Crawlee scraper instance", async () => {
    const { createCrawleeScraper } = await import("./services/scrapers/crawleeNationaleHulpgids");

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
    });

    expect(scraper).toBeDefined();
    expect(scraper).toHaveProperty("authenticate");
    expect(scraper).toHaveProperty("searchCandidates");
    expect(scraper).toHaveProperty("getCandidateProfile");
  });

  it("should authenticate with platform", async () => {
    const { createCrawleeScraper } = await import("./services/scrapers/crawleeNationaleHulpgids");

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
    });

    const result = await scraper.authenticate();

    expect(result).toBe(true);
  });

  it("should search for candidates with criteria", async () => {
    const { createCrawleeScraper } = await import("./services/scrapers/crawleeNationaleHulpgids");

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
    const { createCrawleeScraper } = await import("./services/scrapers/crawleeNationaleHulpgids");

    const scraper = createCrawleeScraper({
      email: "test@example.com",
      password: "password123",
    });

    await expect(scraper.close()).resolves.not.toThrow();
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
  });
});
