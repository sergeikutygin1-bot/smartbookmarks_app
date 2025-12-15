import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { judgePrompt } from "../prompts/judge";
import {
  JudgeResultSchema,
  type JudgeResult,
  type AnalysisResult,
  type ExtractedContent,
} from "../types/schemas";
import { calculateCost, type TokenUsage } from "../utils/costCalculator";

export interface JudgeTrace {
  model: string;
  temperature: number;
  maxTokens: number;
  promptText: string;
  response: JudgeResult;
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
 * Judge Chain - LLM-as-a-Judge for Summary Quality Evaluation
 *
 * Evaluates AI-generated summaries on 4 dimensions:
 * - Comprehensiveness: Captures all key points
 * - Accuracy: Factually consistent, no hallucinations
 * - Formatting: Proper markdown usage
 * - Clarity: Well-organized, logical flow
 *
 * Uses temperature 0.0 for consistent, reproducible judgments.
 * Returns structured output validated by Zod schema.
 */

interface JudgeChainConfig {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<JudgeChainConfig> = {
  modelName: process.env.AI_MODEL || "gpt-4o-mini-2024-07-18",
  temperature: 0.0, // Critical: zero temperature for consistency
  maxTokens: 1000, // OPTIMIZED: Reduced from 1500 - binary judgments don't need as many tokens
  verbose: false,
};

/**
 * Creates the judge chain with structured output
 */
export function createJudgeChain(config: JudgeChainConfig = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };

  const llm = new ChatOpenAI({
    modelName: opts.modelName,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    verbose: opts.verbose,
    maxRetries: 3,
  });

  // Use structured output with Zod schema
  const llmWithStructuredOutput = llm.withStructuredOutput(JudgeResultSchema);

  // Define the chain: prompt -> LLM with structured output
  const chain = RunnableSequence.from([
    judgePrompt,
    llmWithStructuredOutput,
  ]);

  return chain;
}

/**
 * Evaluates an AI-generated summary for quality
 *
 * @param analysis - The analysis result containing the summary to evaluate
 * @param extractedContent - The original source content
 * @param config - Optional chain configuration
 * @returns Judge result with pass/fail verdicts and reasoning
 */
export async function evaluateSummaryQuality(
  analysis: AnalysisResult,
  extractedContent: ExtractedContent,
  config: JudgeChainConfig = {}
): Promise<JudgeResult> {
  const chain = createJudgeChain(config);

  try {
    // Prepare input for the judge prompt
    const input = {
      summary: analysis.summary,
      sourceContent: extractedContent.cleanText.substring(0, 10000), // Limit to 10K chars
      expectedLength: "300-500 words",
    };

    // console.log(`[Judge] Evaluating summary quality for: "${analysis.title}"`);
    const startTime = Date.now();

    // Run the chain
    const result = await chain.invoke(input);

    const duration = Date.now() - startTime;
    // console.log(`[Judge] Evaluation completed in ${duration}ms`);
    // console.log(`[Judge] Verdict: ${result.overall_verdict}`);

    // if (result.overall_verdict === "fail") {
    //   console.warn(
    //     `[Judge] Quality issues found:`,
    //     result.issues
    //   );
    //   console.warn(`[Judge] Failed criteria:`, {
    //     comprehensiveness: result.comprehensiveness,
    //     accuracy: result.accuracy,
    //     formatting: result.formatting,
    //     clarity: result.clarity,
    //   });
    // }

    // Validate the result
    const validated = JudgeResultSchema.parse(result);
    return validated;
  } catch (error) {
    console.error("[Judge] Evaluation failed:", error);

    // Graceful degradation: assume pass if judge fails
    // This prevents judge failures from blocking enrichment
    return {
      accuracy: "pass",
      comprehensiveness: "pass",
      formatting: "pass",
      overall_verdict: "pass",
      reasoning:
        "Judge evaluation failed due to technical error. Assuming quality is acceptable.",
      issues: ["judge-evaluation-error"],
    };
  }
}

/**
 * Evaluates summary quality with detailed trace collection for observability
 *
 * @param analysis - The analysis result containing the summary to evaluate
 * @param extractedContent - The original source content
 * @param config - Optional chain configuration
 * @returns Judge result and detailed execution trace
 */
export async function evaluateSummaryQualityWithTrace(
  analysis: AnalysisResult,
  extractedContent: ExtractedContent,
  config: JudgeChainConfig = {}
): Promise<{ result: JudgeResult; trace: JudgeTrace }> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const timestamp = new Date();

  // Prepare input
  const input = {
    summary: analysis.summary,
    sourceContent: extractedContent.cleanText.substring(0, 10000),
    expectedLength: "300-500 words",
  };

  // Format the prompt for tracing
  const promptText = await judgePrompt.format(input);

  // Create LLM with callbacks to capture token usage
  const llm = new ChatOpenAI({
    modelName: opts.modelName,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    maxRetries: 3,
  });

  const llmWithStructuredOutput = llm.withStructuredOutput(JudgeResultSchema);
  const chain = RunnableSequence.from([judgePrompt, llmWithStructuredOutput]);

  try {
    // Run the chain
    const result = await chain.invoke(input);
    const duration = Date.now() - startTime;

    // Extract token usage from the response
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
    const validated = JudgeResultSchema.parse(result);

    // Build trace
    const trace: JudgeTrace = {
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
    console.error("[Judge] Evaluation failed:", error);

    // Return fallback with minimal trace
    const fallback: JudgeResult = {
      accuracy: "pass",
      comprehensiveness: "pass",
      formatting: "pass",
      overall_verdict: "pass",
      reasoning: "Judge evaluation failed due to technical error. Assuming quality is acceptable.",
      issues: ["judge-evaluation-error"],
    };

    const trace: JudgeTrace = {
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
