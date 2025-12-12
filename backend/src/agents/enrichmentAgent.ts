import { extractContent, validateUrl } from "../tools/contentExtractor";
import { analyzeContent } from "../chains/analysisChain";
import { suggestTags } from "../chains/taggingChain";
import { getEmbedderAgent } from "./embedderAgent";
import type {
  EnrichmentOptions,
  EnrichmentResult,
  EnrichmentError,
} from "../types/schemas";

/**
 * Enrichment Agent - Main orchestrator for bookmark enrichment
 *
 * Coordinates the complete enrichment pipeline:
 * 1. Extract content from URL (Readability + axios)
 * 2. Analyze content (LangChain + GPT-4o-mini)
 * 3. Suggest tags (LangChain + GPT-4o-mini)
 *
 * Features:
 * - Sequential processing with error tracking
 * - Graceful degradation (returns partial results on failure)
 * - Processing time tracking
 * - Detailed error reporting
 */

interface EnrichmentProgress {
  step: "extraction" | "analysis" | "tagging" | "embedding" | "completed";
  message: string;
  timestamp: Date;
}

export class EnrichmentAgent {
  private errors: EnrichmentError[] = [];
  private progressCallbacks: Array<(progress: EnrichmentProgress) => void> = [];

  /**
   * Register a callback to track enrichment progress
   */
  onProgress(callback: (progress: EnrichmentProgress) => void) {
    this.progressCallbacks.push(callback);
  }

  /**
   * Emit progress update
   */
  private emitProgress(step: EnrichmentProgress["step"], message: string) {
    const progress: EnrichmentProgress = {
      step,
      message,
      timestamp: new Date(),
    };

    this.progressCallbacks.forEach((callback) => callback(progress));
  }

  /**
   * Record an error with recovery status
   */
  private recordError(
    step: "extraction" | "analysis" | "tagging" | "embedding",
    error: unknown,
    recoverable: boolean = false
  ) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    this.errors.push({
      step,
      error: errorMessage,
      timestamp: new Date(),
      recoverable,
    });

    console.error(`[EnrichmentAgent] Error in ${step}:`, errorMessage);
  }

  /**
   * Enrich a bookmark from its URL
   *
   * @param options - Enrichment options including URL and existing tags
   * @returns Complete enrichment result with metadata
   */
  async enrich(options: EnrichmentOptions): Promise<EnrichmentResult> {
    const startTime = Date.now();
    this.errors = []; // Reset errors for new enrichment

    console.log(`\n[EnrichmentAgent] Starting enrichment for: ${options.url}`);

    // Step 1: Validate URL
    this.emitProgress("extraction", "Validating URL...");
    const isValid = await validateUrl(options.url);
    if (!isValid) {
      throw new Error(`URL is not accessible: ${options.url}`);
    }

    // Step 2: Extract content
    this.emitProgress("extraction", "Extracting content...");
    let extractedContent;
    try {
      extractedContent = await extractContent(options.url);
      console.log(
        `[EnrichmentAgent] Extracted ${extractedContent.cleanText.length} characters`
      );
    } catch (error) {
      this.recordError("extraction", error, false);
      throw new Error(`Failed to extract content: ${error}`);
    }

    // If extraction confidence is too low, warn but continue
    if (extractedContent.extractionConfidence < 0.5) {
      console.warn(
        "[EnrichmentAgent] Low extraction confidence:",
        extractedContent.extractionConfidence
      );
    }

    // Step 3: Analyze content (unless skipped)
    this.emitProgress("analysis", "Analyzing content with AI...");
    let analysis;
    try {
      if (options.skipAnalysis) {
        console.log("[EnrichmentAgent] Skipping analysis (option set)");
        analysis = {
          summary: options.userNotes || "No summary available",
          keyPoints: [],
        };
      } else {
        analysis = await analyzeContent(extractedContent);
        console.log(
          `[EnrichmentAgent] Generated summary: "${analysis.summary.substring(0, 100)}..."`
        );
      }
    } catch (error) {
      this.recordError("analysis", error, true);
      // Graceful degradation: use fallback analysis
      analysis = {
        summary: `Content from ${extractedContent.domain}: ${extractedContent.title}`,
        keyPoints: ["AI analysis failed", "Manual review needed"],
      };
    }

    // Step 4: Suggest tags (unless skipped)
    this.emitProgress("tagging", "Suggesting tags...");
    let tagging;
    try {
      if (options.skipTagging) {
        console.log("[EnrichmentAgent] Skipping tagging (option set)");
        tagging = { tags: [] };
      } else {
        tagging = await suggestTags(
          extractedContent,
          analysis,
          options.existingTags
        );
        console.log(
          `[EnrichmentAgent] Suggested ${tagging.tags.length} tags:`,
          tagging.tags
        );
      }
    } catch (error) {
      this.recordError("tagging", error, true);
      // Graceful degradation: use basic tags
      tagging = {
        tags: [extractedContent.contentType, extractedContent.domain],
      };
    }

    // Step 5: Generate embedding (unless skipped)
    this.emitProgress("embedding", "Generating vector embedding...");
    let embedding: number[] | undefined;
    let embeddedAt: Date | undefined;

    try {
      if (options.skipEmbedding) {
        console.log("[EnrichmentAgent] Skipping embedding (option set)");
      } else {
        const embedder = getEmbedderAgent();

        // Create embedding from combined content:
        // Title + Summary + Tags for best semantic search results
        const embeddingText = [
          extractedContent.title,
          analysis.summary,
          ...tagging.tags,
        ].join(" ");

        embedding = await embedder.embed({
          text: embeddingText,
          useCache: true,
        });

        embeddedAt = new Date();

        console.log(
          `[EnrichmentAgent] Generated embedding with ${embedding.length} dimensions`
        );
      }
    } catch (error) {
      this.recordError("embedding", error, true);
      // Graceful degradation: bookmark is still usable without embedding
      console.warn(
        "[EnrichmentAgent] Failed to generate embedding, continuing without it"
      );
    }

    // Step 6: Compile final result
    this.emitProgress("completed", "Enrichment complete!");
    const processingTime = Date.now() - startTime;

    const result: EnrichmentResult = {
      url: options.url,
      title: extractedContent.title,
      domain: extractedContent.domain,
      contentType: extractedContent.contentType,
      extractedContent: {
        rawText: extractedContent.rawText,
        cleanText: extractedContent.cleanText,
        images: extractedContent.images,
        metadata: extractedContent.metadata,
      },
      analysis,
      tagging,
      embedding,
      embeddedAt,
      enrichedAt: new Date(),
      modelUsed: process.env.AI_MODEL || "gpt-4o-mini-2024-07-18",
      processingTimeMs: processingTime,
    };

    console.log(
      `[EnrichmentAgent] Completed in ${processingTime}ms${this.errors.length > 0 ? ` with ${this.errors.length} error(s)` : ""}`
    );

    return result;
  }

  /**
   * Get errors that occurred during enrichment
   */
  getErrors(): EnrichmentError[] {
    return this.errors;
  }

  /**
   * Check if enrichment had any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Check if enrichment had non-recoverable errors
   */
  hasCriticalErrors(): boolean {
    return this.errors.some((error) => !error.recoverable);
  }
}

/**
 * Convenience function to enrich a single URL
 */
export async function enrichUrl(
  url: string,
  existingTags: string[] = []
): Promise<EnrichmentResult> {
  const agent = new EnrichmentAgent();

  // Optional: Log progress
  agent.onProgress((progress) => {
    console.log(`[Progress] ${progress.step}: ${progress.message}`);
  });

  return agent.enrich({
    url,
    existingTags,
  });
}
