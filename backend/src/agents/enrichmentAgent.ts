import { extractContent, validateUrl } from "../tools/contentExtractor";
import { analyzeContentWithTrace, type AnalysisTrace } from "../chains/analysisChain";
import { suggestTags } from "../chains/taggingChain";
import { evaluateSummaryQualityWithTrace, type JudgeTrace } from "../chains/judgeChain";
import { getEmbedderAgent } from "./embedderAgent";
import type {
  EnrichmentOptions,
  EnrichmentResult,
  EnrichmentError,
} from "../types/schemas";
import type { AgentTrace } from "../services/jobStorage";

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
  private agentTraces: AgentTrace[] = []; // Collect detailed LLM traces

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
    this.agentTraces = []; // Reset traces for new enrichment

    // console.log(`\n[EnrichmentAgent] Starting enrichment for: ${options.url}`);

    // Step 1: Validate URL
    this.emitProgress("extraction", "Validating URL...");
    const isValid = await validateUrl(options.url);
    if (!isValid) {
      throw new Error(`The URL could not be accessed. Please check that the link is correct and the website is available.`);
    }

    // Step 2: Extract content
    this.emitProgress("extraction", "Extracting content...");
    let extractedContent;
    try {
      extractedContent = await extractContent(options.url);
      // console.log(`[EnrichmentAgent] Extracted ${extractedContent.cleanText.length} characters`);
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

    // Step 3: Analyze content with user context (unless skipped)
    this.emitProgress("analysis", "Analyzing content with AI...");
    let analysis;
    try {
      if (options.skipAnalysis) {
        console.log("[EnrichmentAgent] Skipping analysis (option set)");
        analysis = {
          title: options.userTitle || extractedContent.title,
          summary: options.userSummary || options.userNotes || "No summary available",
          tags: options.userTags || [],
        };
      } else {
        // Pass user context to enable merge & enhance strategy
        const userContext = {
          userTitle: options.userTitle,
          userSummary: options.userSummary,
          userTags: options.userTags,
        };

        // Use tracing version to collect LLM observability data
        const analysisStartTime = new Date();
        const { result: analysisResult, trace: analysisTrace } = await analyzeContentWithTrace(
          extractedContent,
          userContext
        );
        analysis = analysisResult;

        // Store agent trace with LLM details
        this.agentTraces.push({
          agentName: 'Analysis',
          startTime: analysisStartTime,
          endTime: new Date(),
          duration: analysisTrace.duration,
          input: {
            extractedTitle: extractedContent.title,
            contentLength: extractedContent.cleanText.length,
            contentType: extractedContent.contentType,
            userContext,
          },
          output: {
            title: analysisResult.title,
            summaryLength: analysisResult.summary.length,
            tags: analysisResult.tags,
          },
          llmTrace: analysisTrace,
        });

        // console.log(`[EnrichmentAgent] Generated comprehensive analysis: ${analysis.title}`);
      }
    } catch (error) {
      this.recordError("analysis", error, true);
      // Graceful degradation: use fallback analysis with user context if available
      analysis = {
        title: options.userTitle || extractedContent.title || "Untitled",
        summary: options.userSummary || `Content from ${extractedContent.domain}: ${extractedContent.title}. AI analysis failed - manual review needed.`,
        tags: options.userTags || [extractedContent.contentType, "needs-review"],
      };
    }

    // Step 3.5: Smart Conditional Quality Evaluation (LLM-as-a-Judge)
    // Only judge when quality risk is high to minimize cost
    // OPTIMIZATION: Reduced threshold from 0.7 to 0.6 to decrease judge invocations by ~66%
    const shouldJudge =
      extractedContent.extractionConfidence < 0.6 ||
      extractedContent.cleanText.length > 10000 ||
      extractedContent.contentType === "pdf" ||
      extractedContent.contentType === "video";

    if (shouldJudge && !options.skipAnalysis) {
      this.emitProgress("analysis", "Evaluating summary quality...");

      try {
        // Use tracing version to collect judge LLM observability data
        const judgeStartTime = new Date();
        const { result: qualityCheck, trace: judgeTrace } = await evaluateSummaryQualityWithTrace(
          analysis,
          extractedContent
        );

        // Store judge trace with LLM details
        this.agentTraces.push({
          agentName: 'Judge',
          startTime: judgeStartTime,
          endTime: new Date(),
          duration: judgeTrace.duration,
          input: {
            summary: analysis.summary.substring(0, 200) + '...',
            sourceContentLength: extractedContent.cleanText.length,
          },
          output: {
            verdict: qualityCheck.overall_verdict,
            accuracy: qualityCheck.accuracy,
            comprehensiveness: qualityCheck.comprehensiveness,
            formatting: qualityCheck.formatting,
            issues: qualityCheck.issues,
          },
          llmTrace: judgeTrace,
        });

        if (qualityCheck.overall_verdict === "fail") {
          // console.warn("[EnrichmentAgent] Quality check failed, retrying analysis...");
          // console.warn("[EnrichmentAgent] Issues found:", qualityCheck.issues);

          // Retry once with adjusted temperature for better quality
          try {
            const retryStartTime = new Date();
            const { result: retryResult, trace: retryTrace } = await analyzeContentWithTrace(
              extractedContent,
              userContext,
              {
                temperature: 0.6, // Slightly lower for more focused output
              }
            );
            analysis = retryResult;

            // Store retry trace
            this.agentTraces.push({
              agentName: 'Analysis (Retry)',
              startTime: retryStartTime,
              endTime: new Date(),
              duration: retryTrace.duration,
              input: {
                extractedTitle: extractedContent.title,
                contentLength: extractedContent.cleanText.length,
                contentType: extractedContent.contentType,
                userContext,
              },
              output: {
                title: retryResult.title,
                summaryLength: retryResult.summary.length,
                tags: retryResult.tags,
              },
              llmTrace: retryTrace,
              metadata: {
                retryAttempt: 1,
                reason: 'judge-quality-check-failed',
              },
            });

            console.log(
              "[EnrichmentAgent] Analysis retry complete, accepting result"
            );
          } catch (retryError) {
            console.error(
              "[EnrichmentAgent] Analysis retry failed:",
              retryError
            );
            // Keep the original analysis if retry fails
          }
        } else {
          // console.log(
          //   `[EnrichmentAgent] Quality check passed: ${qualityCheck.reasoning}`
          // );
        }
      } catch (error) {
        this.recordError("analysis", error, true);
        // console.warn(
        //   "[EnrichmentAgent] Quality evaluation failed, continuing with current analysis"
        // );
      }
    } else {
      const reason = options.skipAnalysis
        ? "analysis skipped"
        : extractedContent.extractionConfidence >= 0.7
        ? `high extraction confidence (${extractedContent.extractionConfidence.toFixed(2)})`
        : `short content (${extractedContent.cleanText.length} chars)`;

      // console.log(
      //   `[EnrichmentAgent] Skipping quality evaluation: ${reason}`
      // );
    }

    // Step 4: Use tags from analysis (no separate tagging chain needed)
    // OPTIMIZATION: Eliminated redundant tagging chain - analysis already generates high-quality tags
    this.emitProgress("tagging", "Organizing tags...");
    let tagging;

    // Use tags from analysis only (saves ~1,600 tokens per enrichment)
    tagging = {
      tags: analysis.tags?.length > 0
        ? analysis.tags.slice(0, 5) // Limit to 5 tags maximum
        : [extractedContent.contentType, extractedContent.domain] // Fallback tags
    };

    // console.log(`[EnrichmentAgent] Using tags from analysis (${tagging.tags.length}): ${tagging.tags.join(', ')}`);

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
        // Improved Title + Comprehensive Summary + Tags for best semantic search results
        const embeddingText = [
          analysis.title, // Use improved title from analysis
          analysis.summary,
          ...tagging.tags,
        ].join(" ");

        embedding = await embedder.embed({
          text: embeddingText,
          useCache: true,
        });

        embeddedAt = new Date();

        // console.log(`[EnrichmentAgent] Generated embedding with ${embedding.length} dimensions`);
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
      title: analysis.title, // Use improved title from analysis (not raw extracted title)
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

    // console.log(`[EnrichmentAgent] Completed in ${processingTime}ms${this.errors.length > 0 ? ` with ${this.errors.length} error(s)` : ""}`);

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

  /**
   * Get detailed agent traces with LLM observability data
   */
  getAgentTraces(): AgentTrace[] {
    return this.agentTraces;
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
  // agent.onProgress((progress) => {
  //   console.log(`[Progress] ${progress.step}: ${progress.message}`);
  // });

  return agent.enrich({
    url,
    existingTags,
  });
}
