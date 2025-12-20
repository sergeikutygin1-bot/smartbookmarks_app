/**
 * Rate Limiting Middleware
 *
 * Implements multi-layer rate limiting to prevent abuse and control costs:
 *
 * 1. AI Enrichment: Redis-based (10/hour, 50/day per user)
 * 2. Auth Endpoints: Express-based (10/min per IP)
 * 3. General API: Express-based (60/min per user, 100/min per IP)
 */

import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createRedisConnection } from '../config/redis';

// Redis client for rate limiting
const redis = createRedisConnection();

// ============================================================================
// Redis-Based Rate Limiters (Distributed, Persistent)
// ============================================================================

/**
 * AI Enrichment Rate Limiter (CRITICAL - Prevents Cost Abuse)
 *
 * Limits:
 * - 10 enrichments per hour per user
 * - 50 enrichments per day per user
 *
 * Why strict: Each enrichment costs $0.01-0.05 in OpenAI API calls
 */
const enrichmentHourlyLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:enrich:hourly',
  points: 10,           // 10 requests
  duration: 3600,       // per hour
  blockDuration: 600,   // block for 10 minutes if exceeded
});

const enrichmentDailyLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:enrich:daily',
  points: 50,           // 50 requests
  duration: 86400,      // per day (24 hours)
  blockDuration: 3600,  // block for 1 hour if exceeded
});

/**
 * Helper: Get rate limit key from request
 * Uses user ID if authenticated, otherwise IP address
 */
function getRateLimitKey(req: Request): string {
  const userId = req.user?.id;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return userId ? `user:${userId}` : `ip:${ip}`;
}

/**
 * Helper: Set rate limit headers on response
 */
function setRateLimitHeaders(
  res: Response,
  limiterRes: RateLimiterRes,
  points: number,
  windowName: string
) {
  res.set({
    'X-RateLimit-Limit': points.toString(),
    'X-RateLimit-Remaining': Math.max(0, limiterRes.remainingPoints).toString(),
    'X-RateLimit-Reset': new Date(Date.now() + limiterRes.msBeforeNext).toISOString(),
    'X-RateLimit-Window': windowName,
  });
}

/**
 * AI Enrichment Rate Limiter Middleware
 *
 * Enforces both hourly and daily limits on enrichment endpoint.
 * If either limit is exceeded, returns 429 Too Many Requests.
 *
 * Usage:
 * ```
 * app.post('/enrich', enrichmentRateLimit, async (req, res) => { ... });
 * ```
 */
export async function enrichmentRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = getRateLimitKey(req);

  try {
    // Check hourly limit first (stricter)
    const hourlyResult = await enrichmentHourlyLimiter.consume(key, 1);
    setRateLimitHeaders(res, hourlyResult, 10, 'hourly');

    // Check daily limit
    const dailyResult = await enrichmentDailyLimiter.consume(key, 1);
    setRateLimitHeaders(res, dailyResult, 50, 'daily');

    next();
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(error.msBeforeNext / 1000);
      const isHourly = error.msBeforeNext <= 3600000; // Less than 1 hour = hourly limit

      res.set({
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': isHourly ? '10' : '50',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Window': isHourly ? 'hourly' : 'daily',
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: isHourly
          ? `Enrichment limit exceeded. You can enrich 10 URLs per hour. Try again in ${Math.ceil(retryAfter / 60)} minutes.`
          : `Daily enrichment limit exceeded. You can enrich 50 URLs per day. Try again tomorrow.`,
        retryAfter,
        limit: isHourly ? 10 : 50,
        window: isHourly ? 'hourly' : 'daily',
      });
    } else {
      // Redis error - fail open (allow request, log error)
      console.error('[RateLimit] Redis error in enrichment rate limiter:', error);
      next();
    }
  }
}

// ============================================================================
// Express-Based Rate Limiters (Simple, In-Memory)
// ============================================================================

/**
 * Auth Endpoints Rate Limiter (Prevent Brute Force)
 *
 * Limits: 10 requests per minute per IP
 * Block duration: 5 minutes
 *
 * Applies to: /auth/login, /auth/register
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 10,                  // 10 requests per minute
  standardHeaders: true,    // Return rate limit info in headers
  legacyHeaders: false,     // Disable X-RateLimit-* headers (use standard)

  // Use default IP-based key generator (handles IPv6 correctly)
  // keyGenerator is omitted to use the default which handles IPv6

  // Custom handler for rate limit exceeded
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts. Please try again in 1 minute.',
      retryAfter: 60,
    });
  },
});

/**
 * General API Rate Limiter
 *
 * Limits:
 * - Authenticated users: 60 requests per minute
 * - Unauthenticated: 100 requests per minute (higher for public endpoints)
 *
 * Applies to: All API routes
 */
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,      // 1 minute

  // Dynamic max based on authentication
  max: (req: Request) => {
    return req.user ? 60 : 100;
  },

  standardHeaders: true,
  legacyHeaders: false,

  // Use default IP-based key generator for simplicity
  // For authenticated users, we rely on the enrichment rate limiter for stricter control

  handler: (req: Request, res: Response) => {
    const limit = req.user ? 60 : 100;
    res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. You can make ${limit} requests per minute.`,
      retryAfter: 60,
    });
  },

  // Skip health check and admin routes from rate limiting
  skip: (req: Request) => {
    const skipPaths = ['/health', '/admin/stats'];
    return skipPaths.includes(req.path);
  },
});

/**
 * Search Endpoint Rate Limiter
 *
 * Limits: 30 requests per minute per IP
 *
 * Search is more expensive than reads, so lower limit
 */
export const searchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Search rate limit exceeded. You can search 30 times per minute.',
      retryAfter: 60,
    });
  },
});

/**
 * Write Operations Rate Limiter
 *
 * Limits: 30 requests per minute per IP
 *
 * Applies to: POST, PATCH, DELETE on /api/bookmarks
 */
export const writeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Write rate limit exceeded. You can make 30 changes per minute.',
      retryAfter: 60,
    });
  },
});
