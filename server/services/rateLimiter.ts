import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

/**
 * Rate Limiter Service
 *
 * Provides rate limiting for:
 * - API endpoints (per user)
 * - Platform scrapers (per platform)
 * - Message sending (per platform)
 *
 * Uses in-memory storage for now, can be upgraded to Redis for distributed systems
 */

// API Rate Limiter - protects tRPC endpoints
export const apiLimiter = new RateLimiterMemory({
  keyPrefix: "api",
  points: 100, // 100 requests
  duration: 60, // per 60 seconds
  blockDuration: 60 * 10, // Block for 10 minutes if exceeded
});

// Scraper Rate Limiters - per platform to prevent IP bans
export const scraperLimiters = {
  "Nationale Hulpgids": new RateLimiterMemory({
    keyPrefix: "scraper:nationale-hulpgids",
    points: 10, // 10 requests
    duration: 60, // per minute
    blockDuration: 60 * 5, // Block for 5 minutes
  }),

  Indeed: new RateLimiterMemory({
    keyPrefix: "scraper:indeed",
    points: 20, // 20 requests
    duration: 60, // per minute
    blockDuration: 60 * 5,
  }),

  PGBvacatures: new RateLimiterMemory({
    keyPrefix: "scraper:pgbvacatures",
    points: 15, // 15 requests
    duration: 60, // per minute
    blockDuration: 60 * 5,
  }),

  Zorgbanen: new RateLimiterMemory({
    keyPrefix: "scraper:zorgbanen",
    points: 15, // 15 requests
    duration: 60, // per minute
    blockDuration: 60 * 5,
  }),

  Jobbird: new RateLimiterMemory({
    keyPrefix: "scraper:jobbird",
    points: 20, // 20 requests
    duration: 60, // per minute
    blockDuration: 60 * 5,
  }),
};

// Message Sending Rate Limiter - per platform
const messageLimitConfigs: Record<string, number> = {
  "Nationale Hulpgids": 5,
  Indeed: 10,
  PGBvacatures: 8,
  Zorgbanen: 8,
  Jobbird: 10,
};

export const messageLimiters = {
  "Nationale Hulpgids": new RateLimiterMemory({
    keyPrefix: "message:nationale-hulpgids",
    points: 5, // 5 messages
    duration: 60, // per minute
    blockDuration: 60 * 10, // Block for 10 minutes
  }),

  Indeed: new RateLimiterMemory({
    keyPrefix: "message:indeed",
    points: 10, // 10 messages
    duration: 60, // per minute
    blockDuration: 60 * 10,
  }),

  PGBvacatures: new RateLimiterMemory({
    keyPrefix: "message:pgbvacatures",
    points: 8, // 8 messages
    duration: 60, // per minute
    blockDuration: 60 * 10,
  }),

  Zorgbanen: new RateLimiterMemory({
    keyPrefix: "message:zorgbanen",
    points: 8, // 8 messages
    duration: 60, // per minute
    blockDuration: 60 * 10,
  }),

  Jobbird: new RateLimiterMemory({
    keyPrefix: "message:jobbird",
    points: 10, // 10 messages
    duration: 60, // per minute
    blockDuration: 60 * 10,
  }),
};

// Authentication Rate Limiter - prevent brute force
export const authLimiter = new RateLimiterMemory({
  keyPrefix: "auth",
  points: 5, // 5 attempts
  duration: 60 * 15, // per 15 minutes
  blockDuration: 60 * 60, // Block for 1 hour
});

/**
 * Consume points from API rate limiter
 * @param userId User ID to rate limit
 * @param points Number of points to consume (default: 1)
 * @returns Rate limiter response
 * @throws Error if rate limit exceeded
 */
export async function consumeApiLimit(
  userId: number,
  points: number = 1
): Promise<RateLimiterRes> {
  try {
    return await apiLimiter.consume(userId.toString(), points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      throw new Error(`Rate limit exceeded. Try again in ${secs} seconds.`);
    }
    throw rejRes;
  }
}

/**
 * Consume points from scraper rate limiter
 * @param platform Platform name
 * @param points Number of points to consume (default: 1)
 * @returns Rate limiter response
 * @throws Error if rate limit exceeded
 */
export async function consumeScraperLimit(
  platform: string,
  points: number = 1
): Promise<RateLimiterRes> {
  const limiter = scraperLimiters[platform as keyof typeof scraperLimiters];

  if (!limiter) {
    console.warn(
      `[RateLimiter] No rate limiter configured for platform: ${platform}`
    );
    return {} as RateLimiterRes; // No rate limiting
  }

  try {
    return await limiter.consume(platform, points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      throw new Error(
        `Scraper rate limit exceeded for ${platform}. Try again in ${secs} seconds.`
      );
    }
    throw rejRes;
  }
}

/**
 * Consume points from message sending rate limiter
 * @param platform Platform name
 * @param points Number of points to consume (default: 1)
 * @returns Rate limiter response
 * @throws Error if rate limit exceeded
 */
export async function consumeMessageLimit(
  platform: string,
  points: number = 1
): Promise<RateLimiterRes> {
  const limiter = messageLimiters[platform as keyof typeof messageLimiters];

  if (!limiter) {
    console.warn(
      `[RateLimiter] No message rate limiter configured for platform: ${platform}`
    );
    return {} as RateLimiterRes; // No rate limiting
  }

  try {
    return await limiter.consume(platform, points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      throw new Error(
        `Message rate limit exceeded for ${platform}. Try again in ${secs} seconds.`
      );
    }
    throw rejRes;
  }
}

export async function getMessageLimitInfo(platform: string): Promise<{
  remainingPoints: number;
  msBeforeNext: number;
  consumedPoints: number;
} | null> {
  const limiter = messageLimiters[platform as keyof typeof messageLimiters];
  const configuredPoints = messageLimitConfigs[platform];

  if (!limiter || !configuredPoints) return null;

  const res = await limiter.get(platform);
  if (!res) {
    return {
      remainingPoints: configuredPoints,
      msBeforeNext: 0,
      consumedPoints: 0,
    };
  }

  return {
    remainingPoints: res.remainingPoints,
    msBeforeNext: res.msBeforeNext,
    consumedPoints: res.consumedPoints,
  };
}

export async function resetMessageLimit(platform: string): Promise<void> {
  const limiter = messageLimiters[platform as keyof typeof messageLimiters];
  if (limiter) await limiter.delete(platform);
}

/**
 * Consume points from authentication rate limiter
 * @param identifier Email or IP address
 * @param points Number of points to consume (default: 1)
 * @returns Rate limiter response
 * @throws Error if rate limit exceeded
 */
export async function consumeAuthLimit(
  identifier: string,
  points: number = 1
): Promise<RateLimiterRes> {
  try {
    return await authLimiter.consume(identifier, points);
  } catch (rejRes) {
    if (rejRes instanceof RateLimiterRes) {
      const mins = Math.round(rejRes.msBeforeNext / 1000 / 60) || 1;
      throw new Error(
        `Too many authentication attempts. Try again in ${mins} minutes.`
      );
    }
    throw rejRes;
  }
}

/**
 * Get remaining points for a user
 * @param userId User ID
 * @returns Remaining points and reset time
 */
export async function getApiLimitInfo(userId: number): Promise<{
  remainingPoints: number;
  msBeforeNext: number;
  consumedPoints: number;
}> {
  try {
    const res = await apiLimiter.get(userId.toString());

    if (!res) {
      return {
        remainingPoints: 100,
        msBeforeNext: 0,
        consumedPoints: 0,
      };
    }

    return {
      remainingPoints: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
      consumedPoints: res.consumedPoints,
    };
  } catch (error) {
    console.error("[RateLimiter] Error getting API limit info:", error);
    return {
      remainingPoints: 100,
      msBeforeNext: 0,
      consumedPoints: 0,
    };
  }
}

/**
 * Reset rate limit for a user (admin function)
 * @param userId User ID
 */
export async function resetApiLimit(userId: number): Promise<void> {
  await apiLimiter.delete(userId.toString());
}

/**
 * Penalty - increase consumed points (e.g., for suspicious activity)
 * @param userId User ID
 * @param points Number of points to penalize
 */
export async function penalizeUser(
  userId: number,
  points: number
): Promise<void> {
  await apiLimiter.penalty(userId.toString(), points);
}

/**
 * Reward - decrease consumed points (e.g., for good behavior)
 * @param userId User ID
 * @param points Number of points to reward
 */
export async function rewardUser(
  userId: number,
  points: number
): Promise<void> {
  await apiLimiter.reward(userId.toString(), points);
}

/**
 * Block a user for a specific duration
 * @param userId User ID
 * @param durationSeconds Block duration in seconds
 */
export async function blockUser(
  userId: number,
  durationSeconds: number
): Promise<void> {
  await apiLimiter.block(userId.toString(), durationSeconds);
}

/**
 * Check if a user is blocked
 * @param userId User ID
 * @returns True if blocked, false otherwise
 */
export async function isUserBlocked(userId: number): Promise<boolean> {
  try {
    await apiLimiter.get(userId.toString());
    return false;
  } catch (error) {
    return true;
  }
}

// Note: Rate limiter instances are already exported above
