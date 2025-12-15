/**
 * Cost Calculator for LLM Operations
 *
 * Calculates costs based on OpenAI pricing (as of December 2024)
 * Reference: https://openai.com/api/pricing/
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * OpenAI Model Pricing (per 1M tokens)
 * Updated December 2024
 */
const MODEL_PRICING = {
  // GPT-4o models
  "gpt-4o": {
    input: 2.50,      // $2.50 per 1M input tokens
    output: 10.00,    // $10.00 per 1M output tokens
  },
  "gpt-4o-mini": {
    input: 0.150,     // $0.150 per 1M input tokens
    output: 0.600,    // $0.600 per 1M output tokens
  },
  "gpt-4o-mini-2024-07-18": {
    input: 0.150,
    output: 0.600,
  },

  // GPT-4 Turbo models
  "gpt-4-turbo": {
    input: 10.00,
    output: 30.00,
  },
  "gpt-4-turbo-preview": {
    input: 10.00,
    output: 30.00,
  },

  // GPT-3.5 models
  "gpt-3.5-turbo": {
    input: 0.50,
    output: 1.50,
  },

  // Embedding models
  "text-embedding-3-small": {
    input: 0.020,     // $0.020 per 1M tokens
    output: 0.000,    // No output tokens for embeddings
  },
  "text-embedding-3-large": {
    input: 0.130,
    output: 0.000,
  },
  "text-embedding-ada-002": {
    input: 0.100,
    output: 0.000,
  },
} as const;

type ModelName = keyof typeof MODEL_PRICING;

/**
 * Calculate cost for a given model and token usage
 */
export function calculateCost(
  model: string,
  tokenUsage: TokenUsage
): CostBreakdown {
  // Normalize model name
  const normalizedModel = normalizeModelName(model);

  // Get pricing for model (default to gpt-4o-mini if unknown)
  const pricing = MODEL_PRICING[normalizedModel as ModelName] || MODEL_PRICING["gpt-4o-mini"];

  // Calculate costs (pricing is per 1M tokens)
  const inputCost = (tokenUsage.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.completionTokens / 1_000_000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    inputTokens: tokenUsage.promptTokens,
    outputTokens: tokenUsage.completionTokens,
  };
}

/**
 * Normalize model name to match pricing keys
 */
function normalizeModelName(model: string): string {
  // Remove any version suffixes or prefixes
  const normalized = model.toLowerCase().trim();

  // Direct match
  if (normalized in MODEL_PRICING) {
    return normalized;
  }

  // Partial matches
  if (normalized.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (normalized.includes("gpt-4o")) return "gpt-4o";
  if (normalized.includes("gpt-4-turbo")) return "gpt-4-turbo";
  if (normalized.includes("gpt-3.5-turbo")) return "gpt-3.5-turbo";
  if (normalized.includes("text-embedding-3-small")) return "text-embedding-3-small";
  if (normalized.includes("text-embedding-3-large")) return "text-embedding-3-large";
  if (normalized.includes("text-embedding-ada")) return "text-embedding-ada-002";

  // Default fallback
  return "gpt-4o-mini";
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    // Show in microdollars for very small amounts
    return `$${(cost * 1000).toFixed(4)}m`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Calculate total cost for multiple operations
 */
export function calculateTotalCost(operations: Array<{
  model: string;
  tokenUsage: TokenUsage;
}>): CostBreakdown {
  const total = operations.reduce(
    (acc, op) => {
      const cost = calculateCost(op.model, op.tokenUsage);
      return {
        inputCost: acc.inputCost + cost.inputCost,
        outputCost: acc.outputCost + cost.outputCost,
        totalCost: acc.totalCost + cost.totalCost,
        inputTokens: acc.inputTokens + cost.inputTokens,
        outputTokens: acc.outputTokens + cost.outputTokens,
      };
    },
    {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
    }
  );

  return total;
}

/**
 * Estimate tokens from text (rough approximation)
 * OpenAI uses ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
