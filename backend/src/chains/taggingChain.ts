import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { taggingPrompt } from "../prompts";
import {
  TaggingResultSchema,
  type TaggingResult,
  type ExtractedContent,
  type AnalysisResult,
} from "../types/schemas";

/**
 * Tagging Chain - Suggests relevant tags for content organization
 *
 * Uses LangChain's structured output with Zod schema validation.
 * Considers existing user tags to maintain consistency.
 *
 * Features:
 * - Automatic retry on failure (6x with exponential backoff)
 * - Structured output parsing via Zod
 * - Reuses existing tags when relevant
 * - Lower temperature for more consistent tagging
 */

interface TaggingChainConfig {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<TaggingChainConfig> = {
  modelName: process.env.AI_MODEL || "gpt-4o-mini-2024-07-18",
  temperature: 0.3, // Lower temperature for more consistent tags
  maxTokens: 500, // Tags don't need many tokens
  verbose: false,
};

/**
 * Creates the tagging chain
 */
export function createTaggingChain(config: TaggingChainConfig = {}) {
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
  const llmWithStructuredOutput = llm.withStructuredOutput(TaggingResultSchema);

  // Define the chain: prompt -> LLM with structured output
  const chain = RunnableSequence.from([
    taggingPrompt,
    llmWithStructuredOutput,
  ]);

  return chain;
}

/**
 * Suggests tags for content based on analysis
 *
 * @param content - The extracted content
 * @param analysis - The analysis result (summary + key points)
 * @param existingTags - User's existing tag vocabulary (for consistency)
 * @param config - Optional chain configuration
 * @returns Tagging result with suggested tags
 */
export async function suggestTags(
  content: ExtractedContent,
  analysis: AnalysisResult,
  existingTags: string[] = [],
  config: TaggingChainConfig = {}
): Promise<TaggingResult> {
  const chain = createTaggingChain(config);

  try {
    // Prepare input for the prompt
    const input = {
      title: content.title,
      summary: analysis.summary,
      contentType: content.contentType,
      existingTags:
        existingTags.length > 0
          ? existingTags.join(", ")
          : "No existing tags yet",
    };

    // console.log(`[Tagging] Suggesting tags for: "${content.title}"`);
    const startTime = Date.now();

    // Run the chain
    const result = await chain.invoke(input);

    const duration = Date.now() - startTime;
    // console.log(
    //   `[Tagging] Completed in ${duration}ms - ${result.tags.length} tags suggested`
    // );

    // Validate and normalize tags
    const validated = TaggingResultSchema.parse(result);

    // Normalize tags (lowercase, trim, deduplicate)
    const normalizedTags = [...new Set(
      validated.tags
        .map((tag) => tag.toLowerCase().trim())
        .filter((tag) => tag.length > 0)
    )];

    return {
      tags: normalizedTags,
    };
  } catch (error) {
    console.error("[Tagging] Failed:", error);

    // Return fallback tags on error (graceful degradation)
    return {
      tags: [content.contentType, content.domain],
    };
  }
}

/**
 * Batch suggest tags for multiple pieces of content
 *
 * @param items - Array of { content, analysis } pairs
 * @param existingTags - User's existing tag vocabulary
 * @param config - Optional chain configuration
 * @returns Array of tagging results
 */
export async function suggestTagsBatch(
  items: Array<{ content: ExtractedContent; analysis: AnalysisResult }>,
  existingTags: string[] = [],
  config: TaggingChainConfig = {}
): Promise<TaggingResult[]> {
  console.log(`[Tagging] Batch processing ${items.length} items`);

  // Process sequentially to avoid rate limits
  // TODO: Add parallel processing with rate limiting
  const results: TaggingResult[] = [];

  for (const { content, analysis } of items) {
    const result = await suggestTags(content, analysis, existingTags, config);
    results.push(result);
  }

  return results;
}
