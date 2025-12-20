/**
 * OpenAI Cost Control Middleware
 *
 * Prevents runaway OpenAI API costs by enforcing daily spending limits.
 *
 * Features:
 * - Track daily OpenAI spending in Redis
 * - Block requests when daily budget exceeded
 * - Automatic reset at midnight UTC
 * - Cost estimation before expensive operations
 */

import { Request, Response, NextFunction } from 'express';
import { createRedisConnection } from '../config/redis';

const redis = createRedisConnection();

// OpenAI pricing per 1,000 tokens (as of Dec 2024)
const COST_PER_1K_TOKENS = {
  'gpt-4o-mini': {
    input: 0.00015,
    output: 0.0006,
  },
  'gpt-4o': {
    input: 0.0025,
    output: 0.01,
  },
  'gpt-4': {
    input: 0.03,
    output: 0.06,
  },
  'text-embedding-ada-002': {
    input: 0.0001,
    output: 0,
  },
  'text-embedding-3-small': {
    input: 0.00002,
    output: 0,
  },
  'text-embedding-3-large': {
    input: 0.00013,
    output: 0,
  },
} as const;

// Default daily budget from environment variable
const DAILY_BUDGET = parseFloat(process.env.OPENAI_DAILY_BUDGET || '10'); // $10/day default

// Redis key for daily cost tracking
function getDailyCostKey(): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `ai:cost:daily:${today}`;
}

// Get seconds until next midnight UTC
function getSecondsUntilMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
}

/**
 * Get current daily OpenAI spending
 */
export async function getDailySpending(): Promise<number> {
  const costKey = getDailyCostKey();
  const cost = await redis.get(costKey);
  return parseFloat(cost || '0');
}

/**
 * Track OpenAI API cost
 *
 * Call this after making an OpenAI API request to track spending.
 *
 * @param model - OpenAI model name
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Total cost in USD
 */
export async function trackAICost(
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): Promise<number> {
  const costKey = getDailyCostKey();

  // Get pricing for model (default to gpt-4o-mini if unknown)
  const pricing = COST_PER_1K_TOKENS[model as keyof typeof COST_PER_1K_TOKENS]
    || COST_PER_1K_TOKENS['gpt-4o-mini'];

  // Calculate cost
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  const totalCost = inputCost + outputCost;

  // Increment daily cost in Redis
  await redis.incrbyfloat(costKey, totalCost);

  // Set TTL to expire at midnight UTC (auto-reset daily)
  const ttl = getSecondsUntilMidnight();
  await redis.expire(costKey, ttl);

  console.log(`[CostControl] Tracked $${totalCost.toFixed(6)} for ${model} (${inputTokens} in, ${outputTokens} out)`);

  return totalCost;
}

/**
 * Estimate cost for an enrichment operation
 *
 * Used to check if operation would exceed budget BEFORE making API calls.
 *
 * Typical enrichment uses:
 * - Content extraction: 2,000 tokens (gpt-4o-mini)
 * - Analysis: 3,000 tokens (gpt-4o-mini)
 * - Tagging: 1,000 tokens (gpt-4o-mini)
 * - Embedding: 500 tokens (text-embedding-3-small)
 * Total: ~$0.01 per enrichment
 */
export function estimateEnrichmentCost(): number {
  // Conservative estimate using gpt-4o-mini pricing
  const extractionCost = (2000 / 1000) * COST_PER_1K_TOKENS['gpt-4o-mini'].input;
  const analysisCost = (3000 / 1000) * COST_PER_1K_TOKENS['gpt-4o-mini'].output;
  const taggingCost = (1000 / 1000) * COST_PER_1K_TOKENS['gpt-4o-mini'].output;
  const embeddingCost = (500 / 1000) * COST_PER_1K_TOKENS['text-embedding-3-small'].input;

  return extractionCost + analysisCost + taggingCost + embeddingCost;
}

/**
 * Check Daily Budget Middleware
 *
 * Blocks requests if daily OpenAI spending exceeds configured budget.
 * Returns 503 Service Unavailable with retry information.
 *
 * Usage:
 * ```
 * app.post('/enrich', checkDailyBudget, async (req, res) => { ... });
 * ```
 */
export async function checkDailyBudget(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const currentSpending = await getDailySpending();
    const estimatedCost = estimateEnrichmentCost();
    const projectedTotal = currentSpending + estimatedCost;

    // Check if this request would exceed budget
    if (projectedTotal > DAILY_BUDGET) {
      const resetTime = new Date();
      resetTime.setUTCDate(resetTime.getUTCDate() + 1);
      resetTime.setUTCHours(0, 0, 0, 0);

      const retryAfter = getSecondsUntilMidnight();

      console.log(
        `[CostControl] Daily budget exceeded. Current: $${currentSpending.toFixed(2)}, ` +
        `Budget: $${DAILY_BUDGET}, Estimated: $${estimatedCost.toFixed(4)}`
      );

      return res.status(503).json({
        error: 'Service Temporarily Unavailable',
        message: `AI enrichment is temporarily unavailable. Daily budget of $${DAILY_BUDGET} reached.`,
        details: {
          currentSpending: parseFloat(currentSpending.toFixed(4)),
          dailyBudget: DAILY_BUDGET,
          resetsAt: resetTime.toISOString(),
          retryAfter,
        },
        retryAfter,
      });
    }

    // Budget check passed
    console.log(
      `[CostControl] Budget check passed. Current: $${currentSpending.toFixed(4)}/$${DAILY_BUDGET}`
    );

    // Add budget info to response headers
    res.set({
      'X-AI-Budget-Limit': DAILY_BUDGET.toString(),
      'X-AI-Budget-Used': currentSpending.toFixed(4),
      'X-AI-Budget-Remaining': (DAILY_BUDGET - currentSpending).toFixed(4),
    });

    next();
  } catch (error) {
    // Redis error - fail open (allow request, log error)
    console.error('[CostControl] Error checking daily budget:', error);
    next();
  }
}

/**
 * Get daily budget statistics
 *
 * Used by admin dashboard to monitor spending
 */
export async function getBudgetStats() {
  const currentSpending = await getDailySpending();
  const resetTime = new Date();
  resetTime.setUTCDate(resetTime.getUTCDate() + 1);
  resetTime.setUTCHours(0, 0, 0, 0);

  return {
    dailyBudget: DAILY_BUDGET,
    currentSpending: parseFloat(currentSpending.toFixed(4)),
    remainingBudget: parseFloat((DAILY_BUDGET - currentSpending).toFixed(4)),
    percentageUsed: parseFloat(((currentSpending / DAILY_BUDGET) * 100).toFixed(2)),
    resetsAt: resetTime.toISOString(),
    resetsIn: getSecondsUntilMidnight(),
  };
}
