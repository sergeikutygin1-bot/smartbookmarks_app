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
 */
export const AnalysisResultSchema = z.object({
  summary: z
    .string()
    .min(10)
    .max(1000)
    .describe("A concise 2-4 sentence summary of the content"),
  keyPoints: z
    .array(z.string().min(5).max(200))
    .min(3)
    .max(5)
    .describe("3-5 key takeaways or insights from the content"),
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

  // Processing metadata
  enrichedAt: z.date(),
  modelUsed: z.string(),
  processingTimeMs: z.number().optional(),
});
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

/**
 * Enrichment Options Schema
 * Configuration for the enrichment agent
 */
export const EnrichmentOptionsSchema = z.object({
  url: z.string().url(),
  existingTags: z.array(z.string()).optional().default([]),
  userNotes: z.string().optional(),
  skipAnalysis: z.boolean().optional().default(false),
  skipTagging: z.boolean().optional().default(false),
});
export type EnrichmentOptions = z.infer<typeof EnrichmentOptionsSchema>;

/**
 * Error Types for graceful degradation
 */
export const EnrichmentErrorSchema = z.object({
  step: z.enum(["extraction", "analysis", "tagging"]),
  error: z.string(),
  timestamp: z.date(),
  recoverable: z.boolean(),
});
export type EnrichmentError = z.infer<typeof EnrichmentErrorSchema>;
