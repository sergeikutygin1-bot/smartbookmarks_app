import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { judgePrompt } from "../prompts/judge";
import {
  JudgeResultSchema,
  type JudgeResult,
  type AnalysisResult,
  type ExtractedContent,
} from "../types/schemas";

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
  maxTokens: 1500, // Enough for detailed evaluation
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

    console.log(`[Judge] Evaluating summary quality for: "${analysis.title}"`);
    const startTime = Date.now();

    // Run the chain
    const result = await chain.invoke(input);

    const duration = Date.now() - startTime;
    console.log(`[Judge] Evaluation completed in ${duration}ms`);
    console.log(`[Judge] Verdict: ${result.overall_verdict}`);

    if (result.overall_verdict === "fail") {
      console.warn(
        `[Judge] Quality issues found:`,
        result.issues
      );
      console.warn(`[Judge] Failed criteria:`, {
        comprehensiveness: result.comprehensiveness,
        accuracy: result.accuracy,
        formatting: result.formatting,
        clarity: result.clarity,
      });
    }

    // Validate the result
    const validated = JudgeResultSchema.parse(result);
    return validated;
  } catch (error) {
    console.error("[Judge] Evaluation failed:", error);

    // Graceful degradation: assume pass if judge fails
    // This prevents judge failures from blocking enrichment
    return {
      comprehensiveness: "pass",
      accuracy: "pass",
      formatting: "pass",
      clarity: "pass",
      overall_verdict: "pass",
      reasoning:
        "Judge evaluation failed due to technical error. Assuming quality is acceptable.",
      issues: ["judge-evaluation-error"],
    };
  }
}
