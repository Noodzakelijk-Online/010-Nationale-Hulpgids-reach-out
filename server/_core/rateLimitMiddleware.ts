import { TRPCError } from "@trpc/server";
import { consumeApiLimit, getApiLimitInfo } from "../services/rateLimiter";

/**
 * Rate limiting middleware for tRPC procedures
 * Protects API endpoints from abuse and ensures fair usage
 */
export async function rateLimitMiddleware(opts: {
  ctx: { user?: { id: number } };
  next: () => Promise<any>;
}) {
  const { ctx, next } = opts;

  // Skip rate limiting for unauthenticated requests (handled by auth middleware)
  if (!ctx.user) {
    return next();
  }

  try {
    // Consume 1 point from user's rate limit
    const rateLimiterRes = await consumeApiLimit(ctx.user.id, 1);

    // Add rate limit info to response headers (will be available in tRPC context)
    const limitInfo = {
      limit: 100,
      remaining: rateLimiterRes.remainingPoints,
      reset: Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000),
    };

    // Continue with the request
    return next();
  } catch (error: any) {
    // Rate limit exceeded
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: error.message || "Rate limit exceeded. Please try again later.",
    });
  }
}

/**
 * Get rate limit info for current user
 */
export async function getRateLimitInfo(userId: number) {
  const info = await getApiLimitInfo(userId);
  
  return {
    limit: 100,
    remaining: info.remainingPoints,
    resetAt: new Date(Date.now() + info.msBeforeNext),
    consumed: info.consumedPoints,
  };
}
