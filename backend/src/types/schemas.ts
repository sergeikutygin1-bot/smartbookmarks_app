import { z } from "zod";

/**
 * Content Types supported by the enrichment agent
 */
export const ContentType = z.enum([
  "article",
  "video",
  "social",
  "pdf",
  "image",
  "podcast",
  "other",
]);
export type ContentType = z.infer<typeof ContentType>;

/**
 * Extracted Content Schema
 * Output from the content extraction tool
 */
export const ExtractedContentSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(500),
  domain: z.string(),
  contentType: ContentType,
  rawText: z.string(),
  cleanText: z.string(),
  images: z.array(z.string().url()).optional(),
  metadata: z
    .object({
      author: z.string().optional(),
      publishedDate: z.string().optional(),
      description: z.string().optional(),
      // Type-specific metadata can be added here
    })
    .optional(),
  extractionConfidence: z.number().min(0).max(1),
  extractedAt: z.date(),
});
export type ExtractedContent = z.infer<typeof ExtractedContentSchema>;

/**
 * Analysis Result Schema
 * Output from the analysis chain (LLM-generated)
 *
 * Enhanced schema that includes:
 * - title: Improved/clarified title (not just copy-paste from source)
 * - summary: Comprehensive 300-500 word structured summary
 * - tags: 5-10 relevant tags for categorization
 */
export const AnalysisResultSchema = z.object({
  title: z
    .string()
    .min(5)
    .max(150)
    .describe("Improved, clear, and descriptive title (not clickbait or vague)"),
  summary: z
    .string()
    .min(200)
    .max(3500)
    .describe("Comprehensive 300-500 word structured summary with detailed coverage of main arguments, evidence, examples, and key insights"),
  tags: z
    .array(z.string().min(1).max(50))
    .min(3)
    .max(5)
    .describe("3-5 focused, high-quality tags for categorization and discovery"),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * Tagging Result Schema
 * Output from the tagging chain (LLM-generated)
 */
export const TaggingResultSchema = z.object({
  tags: z
    .array(z.string().min(1).max(50))
    .min(1)
    .max(10)
    .describe("Suggested tags for the content"),
});
export type TaggingResult = z.infer<typeof TaggingResultSchema>;

/**
 * Complete Enrichment Result Schema
 * Final output combining all processing steps
 */
export const EnrichmentResultSchema = z.object({
  // Original content info
  url: z.string().url(),
  title: z.string(),
  domain: z.string(),
  contentType: ContentType,

  // Extracted data
  extractedContent: z.object({
    rawText: z.string(),
    cleanText: z.string(),
    images: z.array(z.string().url()).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),

  // AI-generated insights
  analysis: AnalysisResultSchema,
  tagging: TaggingResultSchema,

  // Vector embedding for semantic search (1536 dimensions)
  embedding: z
    .array(z.number())
    .length(1536)
    .optional()
    .describe("Vector embedding for semantic search"),
  embeddedAt: z.date().optional().describe("Timestamp when embedding was generated"),

  // Processing metadata
  enrichedAt: z.date(),
  modelUsed: z.string(),
  processingTimeMs: z.number().optional(),
});
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

/**
 * Enrichment Options Schema
 * Configuration for the enrichment agent
 *
 * Includes user-provided context to enable AI to merge/enhance existing content
 * rather than blindly overwriting it
 */
export const EnrichmentOptionsSchema = z.object({
  url: z.string().url(),

  // User-provided context for merge & enhance strategy
  userTitle: z.string().optional().describe("User's current title (if any)"),
  userSummary: z.string().optional().describe("User's current summary (if any)"),
  userTags: z.array(z.string()).optional().describe("User's current tags (if any)"),

  // Existing tags from other bookmarks (for consistency)
  existingTags: z.array(z.string()).optional().default([]),

  // Legacy field - kept for backward compatibility
  userNotes: z.string().optional(),

  // Processing flags
  skipAnalysis: z.boolean().optional().default(false),
  skipTagging: z.boolean().optional().default(false),
  skipEmbedding: z.boolean().optional().default(false),
});
export type EnrichmentOptions = z.infer<typeof EnrichmentOptionsSchema>;

/**
 * Judge Result Schema
 * Output from the LLM-as-a-Judge quality evaluation
 *
 * Evaluates AI-generated summaries on 4 key dimensions:
 * - Comprehensiveness: Captures all key points
 * - Accuracy: Factually consistent, no hallucinations
 * - Formatting: Proper markdown usage
 * - Clarity: Well-organized, logical flow
 */
export const JudgeResultSchema = z.object({
  comprehensiveness: z
    .enum(["pass", "fail"])
    .describe("Does the summary capture all key points and important details?"),
  accuracy: z
    .enum(["pass", "fail"])
    .describe("Is all information factually consistent with the source?"),
  formatting: z
    .enum(["pass", "fail"])
    .describe("Does it use proper markdown (bold, bullets, headings)?"),
  clarity: z
    .enum(["pass", "fail"])
    .describe("Is it well-organized with logical flow?"),
  overall_verdict: z
    .enum(["pass", "fail"])
    .describe("Overall quality verdict (pass only if all criteria pass)"),
  reasoning: z
    .string()
    .min(20)
    .max(500)
    .describe("Brief explanation of the judgment (2-3 sentences)"),
  issues: z
    .array(z.string())
    .describe("List of specific quality issues found (empty if pass)"),
});
export type JudgeResult = z.infer<typeof JudgeResultSchema>;

/**
 * Error Types for graceful degradation
 */
export const EnrichmentErrorSchema = z.object({
  step: z.enum(["extraction", "analysis", "tagging", "embedding"]),
  error: z.string(),
  timestamp: z.date(),
  recoverable: z.boolean(),
});
export type EnrichmentError = z.infer<typeof EnrichmentErrorSchema>;
