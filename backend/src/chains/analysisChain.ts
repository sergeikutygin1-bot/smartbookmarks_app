import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { analysisPrompt } from "../prompts";
import {
  AnalysisResultSchema,
  type AnalysisResult,
  type ExtractedContent,
} from "../types/schemas";
import { zodToJsonSchema } from "zod-to-json-schema";
import { calculateCost, type TokenUsage } from "../utils/costCalculator";

export interface AnalysisTrace {
  model: string;
  temperature: number;
  maxTokens: number;
  promptText: string;
  response: AnalysisResult;
  tokenUsage: TokenUsage;
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
  duration: number;
  timestamp: Date;
}

/**
 * Analysis Chain - Comprehensive content analysis with user context integration
 *
 * Uses LangChain's structured output with Zod schema validation to ensure
 * the LLM returns data in the expected format.
 *
 * Features:
 * - Comprehensive 300-500 word summaries with Chain of Density technique
 * - Intelligent merging of user-provided context
 * - Title improvement and tag generation
 * - Automatic retry on failure (6x with exponential backoff)
 * - Structured output parsing via Zod
 */

interface AnalysisChainConfig {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
}

interface UserContext {
  userTitle?: string;
  userSummary?: string;
  userTags?: string[];
}

const DEFAULT_CONFIG: Required<AnalysisChainConfig> = {
  modelName: process.env.AI_MODEL || "gpt-4o-mini-2024-07-18",
  temperature: 0.6, // OPTIMIZED: Reduced from 0.7 for more focused, less rambling output
  maxTokens: 3500, // OPTIMIZED: Reduced from 4000 to save costs without impacting quality
  verbose: false,
};

/**
 * Creates the analysis chain
 */
export function createAnalysisChain(config: AnalysisChainConfig = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Initialize ChatOpenAI with gpt-4o-mini
  const llm = new ChatOpenAI({
    modelName: opts.modelName,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    verbose: opts.verbose,
    // Retry configuration (built-in exponential backoff)
    maxRetries: 6,
  });

  // Use structured output with Zod schema (simpler approach)
  const llmWithStructuredOutput = llm.withStructuredOutput(AnalysisResultSchema);

  // Define the chain: prompt -> LLM with structured output
  const chain = RunnableSequence.from([
    analysisPrompt,
    llmWithStructuredOutput,
  ]);

  return chain;
}

/**
 * Analyzes extracted content with optional user context to generate comprehensive analysis
 *
 * @param content - The extracted content to analyze
 * @param userContext - Optional user-provided title, summary, and tags
 * @param config - Optional chain configuration
 * @returns Analysis result with improved title, comprehensive summary, and tags
 */
export async function analyzeContent(
  content: ExtractedContent,
  userContext: UserContext = {},
  config: AnalysisChainConfig = {}
): Promise<AnalysisResult> {
  const chain = createAnalysisChain(config);

  try {
    // Prepare input for the prompt with all 6 variables
    const input = {
      extractedTitle: content.title,
      content: content.cleanText.substring(0, 15000), // Limit to ~4K tokens
      contentType: content.contentType,
      userTitle: userContext.userTitle || "",
      userSummary: userContext.userSummary || "",
      userTags: userContext.userTags?.join(", ") || "",
    };

    const startTime = Date.now();

    // Run the chain
    const result = await chain.invoke(input);

    const duration = Date.now() - startTime;

    // Validate the result
    const validated = AnalysisResultSchema.parse(result);
    return validated;
  } catch (error) {
    console.error("[Analysis] Failed:", error);

    // Return fallback analysis on error (graceful degradation)
    return {
      title: userContext.userTitle || content.title || "Untitled Bookmark",
      summary: userContext.userSummary || `Failed to analyze content from ${content.domain}. The content appears to be about: ${content.title}. Manual review recommended.`,
      tags: userContext.userTags || [content.contentType, content.domain, "needs-review"],
    };
  }
}

/**
 * Analyzes content with detailed trace collection for observability
 *
 * @param content - The extracted content to analyze
 * @param userContext - Optional user-provided title, summary, and tags
 * @param config - Optional chain configuration
 * @returns Analysis result and detailed execution trace
 */
export async function analyzeContentWithTrace(
  content: ExtractedContent,
  userContext: UserContext = {},
  config: AnalysisChainConfig = {}
): Promise<{ result: AnalysisResult; trace: AnalysisTrace }> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const timestamp = new Date();

  // Prepare input
  const input = {
    extractedTitle: content.title,
    content: content.cleanText.substring(0, 15000),
    contentType: content.contentType,
    userTitle: userContext.userTitle || "",
    userSummary: userContext.userSummary || "",
    userTags: userContext.userTags?.join(", ") || "",
  };

  // Format the prompt for tracing
  const promptText = await analysisPrompt.format(input);

  // Create LLM with callbacks to capture token usage
  const llm = new ChatOpenAI({
    modelName: opts.modelName,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    maxRetries: 6,
  });

  const llmWithStructuredOutput = llm.withStructuredOutput(AnalysisResultSchema);
  const chain = RunnableSequence.from([analysisPrompt, llmWithStructuredOutput]);

  try {
    // Run the chain
    const result = await chain.invoke(input);
    const duration = Date.now() - startTime;

    // Extract token usage from the response
    // LangChain stores this in the response metadata
    const tokenUsage: TokenUsage = {
      promptTokens: (result as any)?._response_metadata?.tokenUsage?.promptTokens || 0,
      completionTokens: (result as any)?._response_metadata?.tokenUsage?.completionTokens || 0,
      totalTokens: (result as any)?._response_metadata?.tokenUsage?.totalTokens || 0,
    };

    // If token usage not available, estimate it
    if (tokenUsage.totalTokens === 0) {
      tokenUsage.promptTokens = Math.ceil(promptText.length / 4);
      tokenUsage.completionTokens = Math.ceil(JSON.stringify(result).length / 4);
      tokenUsage.totalTokens = tokenUsage.promptTokens + tokenUsage.completionTokens;
    }

    // Calculate cost
    const costBreakdown = calculateCost(opts.modelName, tokenUsage);

    // Validate result
    const validated = AnalysisResultSchema.parse(result);

    // Build trace
    const trace: AnalysisTrace = {
      model: opts.modelName,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      promptText: promptText.substring(0, 5000), // Truncate for storage
      response: validated,
      tokenUsage,
      cost: {
        inputCost: costBreakdown.inputCost,
        outputCost: costBreakdown.outputCost,
        totalCost: costBreakdown.totalCost,
      },
      duration,
      timestamp,
    };

    return { result: validated, trace };
  } catch (error) {
    console.error("[Analysis] Failed:", error);

    // Return fallback with minimal trace
    const fallback: AnalysisResult = {
      title: userContext.userTitle || content.title || "Untitled Bookmark",
      summary: userContext.userSummary || `Failed to analyze content from ${content.domain}`,
      tags: userContext.userTags || [content.contentType, "needs-review"],
    };

    const trace: AnalysisTrace = {
      model: opts.modelName,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      promptText: promptText.substring(0, 5000),
      response: fallback,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
      duration: Date.now() - startTime,
      timestamp,
    };

    return { result: fallback, trace };
  }
}

/**
 * Batch analyze multiple pieces of content
 *
 * @param contents - Array of extracted content with optional user context
 * @param config - Optional chain configuration
 * @returns Array of analysis results
 */
export async function analyzeContentBatch(
  contents: Array<{ content: ExtractedContent; userContext?: UserContext }>,
  config: AnalysisChainConfig = {}
): Promise<AnalysisResult[]> {
  console.log(`[Analysis] Batch processing ${contents.length} items`);

  // Process sequentially to avoid rate limits
  // TODO: Add parallel processing with rate limiting
  const results: AnalysisResult[] = [];

  for (const item of contents) {
    const result = await analyzeContent(item.content, item.userContext, config);
    results.push(result);
  }

  return results;
}
