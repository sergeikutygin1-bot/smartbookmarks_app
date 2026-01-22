import { extractContent, validateUrl } from "../tools/contentExtractor";
import { analyzeContentWithTrace, type AnalysisTrace } from "../chains/analysisChain";
import { suggestTags } from "../chains/taggingChain";
import { evaluateSummaryQualityWithTrace, type JudgeTrace } from "../chains/judgeChain";
import { getEmbedderAgent } from "./embedderAgent";
import type {
  EnrichmentOptions,
  EnrichmentResult,
  EnrichmentError,
  DetectedContentType,
  ContentTypeClassification,
  AnalyzerContext,
} from "../types/schemas";
import type { AgentTrace } from "../services/jobStorage";

// PHASE 1: Content-Type Routing
import { ContentTypeClassifierAgent } from "./ContentTypeClassifierAgent";
import { BaseAnalyzerAgent } from "./analyzers/BaseAnalyzerAgent";
import { ArticleAnalyzerAgent } from "./analyzers/ArticleAnalyzerAgent";
import { PaperAnalyzerAgent } from "./analyzers/PaperAnalyzerAgent";
import { VideoAnalyzerAgent } from "./analyzers/VideoAnalyzerAgent";
import { SocialAnalyzerAgent } from "./analyzers/SocialAnalyzerAgent";
import { DocumentAnalyzerAgent } from "./analyzers/DocumentAnalyzerAgent";
import { GenericAnalyzerAgent } from "./analyzers/GenericAnalyzerAgent";

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
  step: "extraction" | "classification" | "analysis" | "tagging" | "embedding" | "completed";
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
    step: "extraction" | "classification" | "analysis" | "tagging" | "embedding",
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

    // PHASE 1: Step 2.5: Classify content type
    this.emitProgress("classification", "Classifying content type...");
    let contentTypeClassification: ContentTypeClassification;

    try {
      const classifier = new ContentTypeClassifierAgent();
      const classificationStartTime = new Date();

      contentTypeClassification = await classifier.classify(
        options.url,
        extractedContent
      );

      // Store classification trace
      this.agentTraces.push({
        agentName: "ContentTypeClassifier",
        startTime: classificationStartTime,
        endTime: new Date(),
        duration: Date.now() - classificationStartTime.getTime(),
        input: {
          url: options.url,
          domain: extractedContent.domain,
          contentLength: extractedContent.cleanText.length,
        },
        output: {
          type: contentTypeClassification.type,
          confidence: contentTypeClassification.confidence,
          method: contentTypeClassification.method,
        },
        metadata: {
          indicators: contentTypeClassification.indicators,
        },
      });

      console.log(
        `[EnrichmentAgent] Classified as '${contentTypeClassification.type}' ` +
          `(confidence: ${contentTypeClassification.confidence.toFixed(2)}, ` +
          `method: ${contentTypeClassification.method})`
      );
    } catch (error) {
      this.recordError("classification", error, true);
      // Graceful degradation: use 'other' type
      contentTypeClassification = {
        type: "other",
        confidence: 0.5,
        method: "heuristic",
      };
      console.warn(
        "[EnrichmentAgent] Classification failed, using fallback type 'other'"
      );
    }

    // Step 3: Analyze content with specialized analyzer + Quality Gates (3-layer system)
    this.emitProgress(
      "analysis",
      `Analyzing ${contentTypeClassification.type} content with AI...`
    );
    let analysis: EnhancedAnalysisResult;
    let qualityGateStatus: "passed" | "needs_review" = "passed";

    // Load retry configuration from environment
    const maxRetries = parseInt(process.env.ENRICHMENT_MAX_RETRIES || "2", 10);
    const retryDelayMs = parseInt(
      process.env.ENRICHMENT_RETRY_DELAY_MS || "2000",
      10
    );
    const enablePreValidation =
      process.env.ENRICHMENT_ENABLE_PRE_VALIDATION !== "false";
    const enableJudge = process.env.ENRICHMENT_ENABLE_JUDGE !== "false";

    console.log(
      `[EnrichmentAgent] Quality gates: pre-validation=${enablePreValidation}, judge=${enableJudge}, maxRetries=${maxRetries}`
    );

    // Retry loop for analysis + quality gates
    let retryCount = 0;
    let analysisSucceeded = false;

    while (retryCount <= maxRetries && !analysisSucceeded) {
      try {
        // Generate analysis (with or without LLM)
        if (options.skipAnalysis) {
          console.log("[EnrichmentAgent] Skipping analysis (option set)");
          analysis = {
            title: options.userTitle || extractedContent.title,
            summary:
              options.userSummary ||
              options.userNotes ||
              "No summary available",
            tags: options.userTags || [],
            keyPoints: [],
            tone: "unknown",
            contentMetrics: this.calculateBasicMetrics(
              extractedContent.cleanText
            ),
            confidence: 0.5,
            modelUsed: "skipped",
          };
          analysisSucceeded = true; // Skip quality gates if analysis is skipped
          break;
        } else {
          // PHASE 1: Select specialized analyzer based on content type
          const analyzer = this.selectAnalyzer(
            contentTypeClassification.type
          );

          const analyzerContext: AnalyzerContext = {
            extractedContent,
            contentTypeClassification,
            userContext: {
              userTitle: options.userTitle,
              userSummary: options.userSummary,
              userTags: options.userTags,
            },
          };

          const analysisStartTime = new Date();
          const { result: analysisResult, trace: analysisTrace } =
            await analyzer.analyze(analyzerContext);
          analysis = analysisResult;

          // Store analyzer trace
          this.agentTraces.push({
            agentName: `${this.getAnalyzerName(contentTypeClassification.type)}Analyzer`,
            startTime: analysisStartTime,
            endTime: new Date(),
            duration: analysisTrace.duration,
            input: {
              extractedTitle: extractedContent.title,
              contentLength: extractedContent.cleanText.length,
              contentType: extractedContent.contentType,
              detectedContentType: contentTypeClassification.type,
              userContext: analyzerContext.userContext,
            },
            output: {
              title: analysisResult.title,
              summaryLength: analysisResult.summary.length,
              tags: analysisResult.tags,
              keyPointsCount: analysisResult.keyPoints.length,
              tone: analysisResult.tone,
              confidence: analysisResult.confidence,
            },
            llmTrace: analysisTrace,
            metadata: retryCount > 0 ? { retryAttempt: retryCount } : undefined,
          });

          console.log(
            `[EnrichmentAgent] Generated ${contentTypeClassification.type} analysis (attempt ${retryCount + 1}/${maxRetries + 1}): ${analysis.title}`
          );
        }

        // LAYER 1: Pre-validation (fast, deterministic, $0 cost)
        if (enablePreValidation && !options.skipAnalysis) {
          const preValidation = this.validateEnrichmentQuality(
            analysis,
            extractedContent
          );

          if (!preValidation.valid) {
            this.recordError(
              "analysis",
              new Error(
                preValidation.reason || "Pre-validation failed"
              ),
              true
            );

            if (retryCount < maxRetries) {
              retryCount++;
              console.log(
                `[EnrichmentAgent] Pre-validation failed: ${preValidation.reason}. Retry ${retryCount}/${maxRetries}...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, retryDelayMs)
              );
              continue; // Retry analysis
            } else {
              // Max retries exceeded
              console.warn(
                `[EnrichmentAgent] Max retries exceeded after pre-validation failures`
              );
              qualityGateStatus = "needs_review";
              break; // Exit retry loop
            }
          } else {
            console.log(`[EnrichmentAgent] Pre-validation passed`);
          }
        }

        // LAYER 2: Conditional Judge (LLM-based quality evaluation)
        const shouldJudge =
          enableJudge &&
          !options.skipAnalysis &&
          (analysis.confidence <= 0.5 ||
            extractedContent.cleanText.length > 5000 ||
            contentTypeClassification.type === "pdf" ||
            contentTypeClassification.type === "video");

        if (shouldJudge) {
          this.emitProgress("analysis", "Evaluating summary quality...");

          try {
            const judgeStartTime = new Date();
            const { result: qualityCheck, trace: judgeTrace } =
              await evaluateSummaryQualityWithTrace(
                analysis,
                extractedContent
              );

            // Store judge trace
            this.agentTraces.push({
              agentName: "Judge",
              startTime: judgeStartTime,
              endTime: new Date(),
              duration: judgeTrace.duration,
              input: {
                summary: analysis.summary.substring(0, 200) + "...",
                sourceContentLength: extractedContent.cleanText.length,
              },
              output: {
                verdict: qualityCheck.overall_verdict,
                accuracy: qualityCheck.accuracy,
                comprehensiveness: qualityCheck.comprehensiveness,
                formatting: qualityCheck.formatting,
                completeness: qualityCheck.completeness,
                issues: qualityCheck.issues,
              },
              llmTrace: judgeTrace,
              metadata: retryCount > 0 ? { retryAttempt: retryCount } : undefined,
            });

            if (qualityCheck.overall_verdict === "fail") {
              this.recordError(
                "analysis",
                new Error(
                  `Judge rejected: ${qualityCheck.issues.join(", ")}`
                ),
                true
              );

              if (retryCount < maxRetries) {
                retryCount++;
                console.log(
                  `[EnrichmentAgent] Judge rejected (${qualityCheck.issues.join(", ")}). Retry ${retryCount}/${maxRetries}...`
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, retryDelayMs)
                );
                continue; // Retry analysis
              } else {
                // Max retries exceeded
                console.warn(
                  `[EnrichmentAgent] Max retries exceeded after judge rejections`
                );
                qualityGateStatus = "needs_review";
                break; // Exit retry loop
              }
            } else {
              console.log(
                `[EnrichmentAgent] Judge approved: ${qualityCheck.reasoning}`
              );
            }
          } catch (error) {
            this.recordError("analysis", error, true);
            console.warn(
              "[EnrichmentAgent] Judge evaluation failed, continuing with current analysis"
            );
          }
        } else {
          const reason = !enableJudge
            ? "judge disabled"
            : analysis.confidence > 0.5
            ? "high confidence"
            : "short content";
          console.log(`[EnrichmentAgent] Skipping judge: ${reason}`);
        }

        // All quality gates passed
        analysisSucceeded = true;
        console.log(
          `[EnrichmentAgent] All quality gates passed for analysis`
        );
      } catch (error) {
        this.recordError("analysis", error, true);
        console.error(
          `[EnrichmentAgent] Analysis error (attempt ${retryCount + 1}/${maxRetries + 1}):`,
          error
        );

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(
            `[EnrichmentAgent] Retrying analysis (${retryCount}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        } else {
          // Max retries exceeded - use graceful degradation
          console.warn(
            `[EnrichmentAgent] Max retries exceeded, using fallback analysis`
          );
          analysis = {
            title: options.userTitle || extractedContent.title || "Untitled",
            summary:
              options.userSummary ||
              `Content from ${extractedContent.domain}: ${extractedContent.title}. AI analysis failed - manual review needed.`,
            tags: options.userTags || [
              contentTypeClassification.type,
              "needs-review",
            ],
            keyPoints: ["Analysis failed - requires manual review"],
            tone: "unknown",
            contentMetrics: this.calculateBasicMetrics(
              extractedContent.cleanText
            ),
            confidence: 0.2,
            modelUsed: "fallback",
          };
          qualityGateStatus = "needs_review";
          break; // Exit retry loop
        }
      }
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

    // Step 5: Generate embeddings (multiple types)
    this.emitProgress("embedding", "Generating vector embeddings...");
    let embedding: number[] | undefined;
    let summaryEmbedding: number[] | undefined;
    let fullContent: { chunks?: number[][]; text?: string } | undefined;
    let embeddedAt: Date | undefined;

    try {
      if (options.skipEmbedding) {
        console.log("[EnrichmentAgent] Skipping embedding (option set)");
      } else {
        const embedder = getEmbedderAgent();

        // Generate multiple embeddings
        // Note: Tags are intentionally excluded from embeddings
        // Semantic relationships are now handled by concepts and entities in the graph pipeline
        const embeddings = await embedder.embedMulti({
          title: analysis.title,
          summary: analysis.summary,
          fullContent: extractedContent.cleanText.length > 10000
            ? extractedContent.cleanText
            : undefined,
          useCache: true,
        });

        embedding = embeddings.combined;
        summaryEmbedding = embeddings.summary;

        if (embeddings.chunks) {
          fullContent = {
            text: extractedContent.cleanText,
            chunks: embeddings.chunks,
          };
        }

        embeddedAt = new Date();

        console.log(
          `[EnrichmentAgent] Generated ${embeddings.chunks ? '3' : '2'} embedding types`
        );
      }
    } catch (error) {
      this.recordError("embedding", error, true);
      // Graceful degradation: bookmark is still usable without embedding
      console.warn(
        "[EnrichmentAgent] Failed to generate embeddings, continuing without them"
      );
    }

    // Step 6: Compile final result
    this.emitProgress("completed", "Enrichment complete!");
    const processingTime = Date.now() - startTime;

    const result: EnrichmentResult & { qualityGateStatus: "passed" | "needs_review" } = {
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
      summaryEmbedding,
      fullContent,
      embeddedAt,
      enrichedAt: new Date(),
      modelUsed: process.env.AI_MODEL || "gpt-4o-mini-2024-07-18",
      processingTimeMs: processingTime,
      qualityGateStatus, // Add quality gate status to result
    };

    console.log(
      `[EnrichmentAgent] Completed in ${processingTime}ms with status: ${qualityGateStatus}${this.errors.length > 0 ? ` (${this.errors.length} error(s))` : ""}`
    );

    return result;
  }

  // ========================================================================
  // PHASE 1: Analyzer Factory & Helper Methods
  // ========================================================================

  /**
   * Select specialized analyzer based on detected content type
   */
  private selectAnalyzer(type: DetectedContentType): BaseAnalyzerAgent {
    switch (type) {
      case "article":
        return new ArticleAnalyzerAgent();
      case "paper":
        return new PaperAnalyzerAgent();
      case "video":
        return new VideoAnalyzerAgent();
      case "social":
        return new SocialAnalyzerAgent();
      case "document":
        return new DocumentAnalyzerAgent();
      default:
        return new GenericAnalyzerAgent();
    }
  }

  /**
   * Get human-readable analyzer name for tracing
   */
  private getAnalyzerName(type: DetectedContentType): string {
    switch (type) {
      case "article":
        return "Article";
      case "paper":
        return "Paper";
      case "video":
        return "Video";
      case "social":
        return "Social";
      case "document":
        return "Document";
      default:
        return "Generic";
    }
  }

  /**
   * Calculate basic content metrics (used for fallback)
   */
  private calculateBasicMetrics(text: string): {
    readingLevel: number;
    wordCount: number;
    estimatedReadTime: number;
  } {
    const wordCount = text
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    return {
      readingLevel: 10.0, // Default grade level
      wordCount,
      estimatedReadTime: Math.max(1, Math.ceil(wordCount / 200)), // 200 words/min
    };
  }

  /**
   * Pre-validation: Fast, deterministic check for fallback content
   * Returns true if content should be rejected (needs retry/review)
   * Cost: $0 (no LLM calls)
   */
  private validateEnrichmentQuality(
    analysis: EnhancedAnalysisResult,
    extractedContent: ExtractedContent
  ): { valid: boolean; reason?: string } {
    // 1. Check for explicit fallback markers
    const fallbackPatterns = [
      /AI analysis failed/i,
      /manual review needed/i,
      /requires manual review/i,
      /analysis failed/i,
      /could not analyze/i,
      /failed to extract/i,
      /error extracting/i,
    ];

    for (const pattern of fallbackPatterns) {
      if (pattern.test(analysis.summary)) {
        return {
          valid: false,
          reason: `Fallback pattern detected in summary: ${pattern}`,
        };
      }
    }

    // 2. Check for suspiciously short summaries (< 50 chars)
    if (
      analysis.summary.length < 50 &&
      extractedContent.cleanText.length > 500
    ) {
      return {
        valid: false,
        reason: `Summary too short (${analysis.summary.length} chars) for content length (${extractedContent.cleanText.length} chars)`,
      };
    }

    // 3. Check for missing critical fields
    if (!analysis.title || analysis.title === "Untitled") {
      return {
        valid: false,
        reason: "Missing or default title",
      };
    }

    // 4. Check for low confidence with fallback model
    if (analysis.confidence <= 0.3 && analysis.modelUsed === "fallback") {
      return {
        valid: false,
        reason: "Low confidence with fallback model",
      };
    }

    // 5. Check for generic error tags
    const errorTags = ["needs-review", "error", "failed", "fallback"];
    const hasErrorTag = analysis.tags.some((tag) =>
      errorTags.includes(tag.toLowerCase())
    );
    if (hasErrorTag && analysis.confidence < 0.5) {
      return {
        valid: false,
        reason: `Error tag present with low confidence: ${analysis.tags.join(", ")}`,
      };
    }

    return { valid: true };
  }

  // ========================================================================

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
