/**
 * Smart Bookmark - Enrichment Agent
 *
 * AI-powered bookmark enrichment using LangChain and GPT-4o-mini
 *
 * @example
 * ```typescript
 * import { enrichUrl } from '@smart-bookmark/agents';
 *
 * const result = await enrichUrl('https://example.com/article');
 * console.log(result.analysis.summary);
 * console.log(result.tagging.tags);
 * ```
 */

import "dotenv/config";

// Main agent
export { EnrichmentAgent, enrichUrl } from "./enrichmentAgent";

// Individual components (for advanced usage)
export { extractContent, validateUrl } from "./tools/contentExtractor";
export { analyzeContent, analyzeContentBatch } from "./chains/analysisChain";
export { suggestTags, suggestTagsBatch } from "./chains/taggingChain";

// Types and schemas
export type {
  ContentType,
  ExtractedContent,
  AnalysisResult,
  TaggingResult,
  EnrichmentResult,
  EnrichmentOptions,
  EnrichmentError,
} from "./types/schemas";

export {
  ContentType as ContentTypeSchema,
  ExtractedContentSchema,
  AnalysisResultSchema,
  TaggingResultSchema,
  EnrichmentResultSchema,
  EnrichmentOptionsSchema,
  EnrichmentErrorSchema,
} from "./types/schemas";

// Prompts (for customization)
export { analysisPrompt, taggingPrompt } from "./prompts";
