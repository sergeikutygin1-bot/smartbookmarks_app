import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { analysisPrompt } from "../prompts";
import {
  AnalysisResultSchema,
  type AnalysisResult,
  type ExtractedContent,
} from "../types/schemas";
import { zodToJsonSchema } from "zod-to-json-schema";

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
  temperature: 0.7, // Balanced between creative and consistent
  maxTokens: 4000, // Increased for comprehensive summaries
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

    // console.log(`[Analysis] Analyzing content: "${content.title}"`);
    // if (userContext.userTitle || userContext.userSummary || userContext.userTags?.length) {
    //   console.log(`[Analysis] User context provided - will merge & enhance`);
    // }
    const startTime = Date.now();

    // Run the chain
    const result = await chain.invoke(input);

    const duration = Date.now() - startTime;
    // console.log(`[Analysis] Completed in ${duration}ms`);
    // console.log(`[Analysis] Generated ${result.summary?.length || 0} char summary, ${result.tags?.length || 0} tags`);

    // Validate the result
    const validated = AnalysisResultSchema.parse(result);
    return validated;
  } catch (error) {
    console.error("[Analysis] Failed:", error);

    // Return fallback analysis on error (graceful degradation)
    // Use user-provided content if available, otherwise use extracted content
    return {
      title: userContext.userTitle || content.title || "Untitled Bookmark",
      summary: userContext.userSummary || `Failed to analyze content from ${content.domain}. The content appears to be about: ${content.title}. Manual review recommended.`,
      tags: userContext.userTags || [content.contentType, content.domain, "needs-review"],
    };
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
