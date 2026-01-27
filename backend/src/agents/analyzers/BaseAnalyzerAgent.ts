import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { calculateCost, type TokenUsage } from "../../utils/costCalculator";
import type {
  EnhancedAnalysisResult,
  AnalyzerContext,
  ExtractedContent,
} from "../../types/schemas";
import { EnhancedAnalysisResultSchema } from "../../types/schemas";

/**
 * Analysis Trace (Enhanced version for Phase 1 analyzers)
 * Compatible with existing AnalysisTrace but includes enhanced result
 */
export interface AnalysisTrace {
  model: string;
  temperature: number;
  maxTokens: number;
  promptText: string;
  response: EnhancedAnalysisResult;
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
 * BaseAnalyzerAgent (Phase 1)
 *
 * Abstract base class for all content-type specific analyzers.
 * Provides shared utilities, tracing logic, and standard output format.
 *
 * Concrete analyzers must implement:
 * - getSystemPrompt(): Content-type specific prompt
 * - analyze(): Main analysis logic
 *
 * Features:
 * - Shared LLM invocation with structured output
 * - Consistent tracing (compatible with existing AgentTrace system)
 * - Content metrics calculation (reading level, word count, read time)
 * - Graceful fallback on errors
 * - Reuses existing cost calculation utilities
 *
 * Cost: ~$0.0011/bookmark (varies by content length)
 */
export abstract class BaseAnalyzerAgent {
  protected modelName: string;
  protected temperature: number;
  protected maxTokens: number;

  constructor(config?: {
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.modelName =
      config?.modelName ||
      process.env.AI_MODEL ||
      "gpt-4o-mini-2024-07-18";
    this.temperature = config?.temperature !== undefined ? config.temperature : 0.4; // Balanced creativity + consistency
    this.maxTokens = config?.maxTokens || 3500;
  }

  /**
   * Main analysis method - must be implemented by each analyzer
   */
  abstract analyze(
    context: AnalyzerContext
  ): Promise<{ result: EnhancedAnalysisResult; trace: AnalysisTrace }>;

  /**
   * Get the content-specific system prompt
   * Each analyzer implements its own prompt
   */
  protected abstract getSystemPrompt(): string;

  /**
   * Build user prompt with context
   * Shared across all analyzers
   */
  protected buildUserPrompt(context: AnalyzerContext): string {
    const { extractedContent, userContext, contentTypeClassification } = context;

    const userContextStr = userContext
      ? `**User Context (optional - merge/enhance if provided):**
- Title: ${userContext.userTitle || "(none)"}
- Summary: ${userContext.userSummary || "(none)"}
- Tags: ${userContext.userTags?.join(", ") || "(none)"}`
      : "";

    return `## INPUT

**Detected Content Type:** ${contentTypeClassification.type}
**Extracted Title:** ${extractedContent.title}
**Domain:** ${extractedContent.domain}
**Content Type (extractor):** ${extractedContent.contentType}

**Content to Analyze:**
${extractedContent.cleanText.substring(0, 15000)}

${userContextStr}

## OUTPUT

Return ONLY valid JSON matching the EnhancedAnalysisResultSchema:
- title: Improved/clarified title (5-150 chars)
- summary: Comprehensive structured summary (200-3500 chars)
- tags: 3-5 focused tags
- keyPoints: 3-10 bullet points of main ideas
- tone: Content tone (formal/casual/technical/persuasive/neutral/etc)
- contentMetrics: { readingLevel, wordCount, estimatedReadTime }
- confidence: Your confidence in this analysis (0.0-1.0)
- modelUsed: "${this.modelName}"`;
  }

  /**
   * Shared LLM invocation with tracing
   * Reuses pattern from analysisChain.ts
   */
  protected async invokeWithTrace(
    systemPrompt: string,
    userPrompt: string,
    context: AnalyzerContext
  ): Promise<{ result: EnhancedAnalysisResult; trace: AnalysisTrace }> {
    const startTime = Date.now();
    const timestamp = new Date();

    const llm = new ChatOpenAI({
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      maxRetries: 6, // Automatic exponential backoff
    });

    const llmWithStructuredOutput = llm.withStructuredOutput(
      EnhancedAnalysisResultSchema
    );

    // Combine system and user prompts
    const promptTemplate = PromptTemplate.fromTemplate(
      `${systemPrompt}\n\n${userPrompt}`
    );

    const chain = RunnableSequence.from([
      promptTemplate,
      llmWithStructuredOutput,
    ]);

    // Format prompt for tracing
    const promptText = await promptTemplate.format({});

    try {
      // Run the chain
      const result = await chain.invoke({});
      const duration = Date.now() - startTime;

      // Extract token usage (same pattern as analysisChain.ts)
      const tokenUsage: TokenUsage = {
        promptTokens:
          (result as any)?._response_metadata?.tokenUsage?.promptTokens || 0,
        completionTokens:
          (result as any)?._response_metadata?.tokenUsage?.completionTokens ||
          0,
        totalTokens:
          (result as any)?._response_metadata?.tokenUsage?.totalTokens || 0,
      };

      // Estimate if not available
      if (tokenUsage.totalTokens === 0) {
        tokenUsage.promptTokens = Math.ceil(promptText.length / 4);
        tokenUsage.completionTokens = Math.ceil(
          JSON.stringify(result).length / 4
        );
        tokenUsage.totalTokens =
          tokenUsage.promptTokens + tokenUsage.completionTokens;
      }

      // Calculate cost
      const costBreakdown = calculateCost(this.modelName, tokenUsage);

      // Validate result
      const validated = EnhancedAnalysisResultSchema.parse(result);

      // Build trace
      const trace: AnalysisTrace = {
        model: this.modelName,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
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
      console.error(
        `[${this.constructor.name}] Analysis failed:`,
        error instanceof Error ? error.message : String(error)
      );

      // Fallback with minimal trace
      const fallback = this.getFallbackResult(context);
      const trace: AnalysisTrace = {
        model: this.modelName,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
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
   * Shared utility: Calculate reading metrics
   * Used both in LLM response validation and fallback
   */
  protected calculateContentMetrics(text: string): {
    readingLevel: number;
    wordCount: number;
    estimatedReadTime: number;
  } {
    const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;
    const sentenceCount = Math.max(1, (text.match(/[.!?]+/g) || []).length);
    const syllableCount = this.estimateSyllables(text);

    // Flesch-Kincaid Grade Level
    // Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    const readingLevel = Math.max(
      0,
      0.39 * (wordCount / sentenceCount) +
        11.8 * (syllableCount / Math.max(wordCount, 1)) -
        15.59
    );

    // Average reading speed: 200 words/minute
    const estimatedReadTime = Math.ceil(wordCount / 200);

    return {
      readingLevel: Math.round(readingLevel * 10) / 10, // Round to 1 decimal
      wordCount,
      estimatedReadTime: Math.max(1, estimatedReadTime), // At least 1 minute
    };
  }

  /**
   * Estimate syllable count for Flesch-Kincaid calculation
   * Simple heuristic: count vowel groups
   */
  private estimateSyllables(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let syllables = 0;

    for (const word of words) {
      if (word.length === 0) continue;

      // Count vowel groups (consecutive vowels = 1 syllable)
      const vowelGroups = word.match(/[aeiouy]+/g) || [];
      syllables += Math.max(1, vowelGroups.length);

      // Adjust for silent 'e' at end
      if (word.endsWith("e") && word.length > 2) {
        syllables--;
      }
    }

    return Math.max(syllables, 1);
  }

  /**
   * Fallback result if analysis fails
   * Provides graceful degradation
   */
  protected getFallbackResult(
    context: AnalyzerContext
  ): EnhancedAnalysisResult {
    const { extractedContent, userContext, contentTypeClassification } = context;
    const metrics = this.calculateContentMetrics(extractedContent.cleanText);

    return {
      title:
        userContext?.userTitle ||
        extractedContent.title ||
        "Untitled Bookmark",
      summary:
        userContext?.userSummary ||
        `Failed to analyze ${contentTypeClassification.type} content from ${extractedContent.domain}. Manual review needed.`,
      tags: userContext?.userTags || [
        contentTypeClassification.type,
        extractedContent.domain,
        "needs-review",
      ],
      keyPoints: [
        "Analysis failed - requires manual review",
        `Content type: ${contentTypeClassification.type}`,
        `Domain: ${extractedContent.domain}`,
      ],
      tone: "unknown",
      contentMetrics: metrics,
      confidence: 0.2, // Low confidence for fallback
      modelUsed: this.modelName,
    };
  }
}
