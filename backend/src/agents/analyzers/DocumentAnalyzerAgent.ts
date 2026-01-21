import { BaseAnalyzerAgent } from "./BaseAnalyzerAgent";
import type { AnalyzerContext, EnhancedAnalysisResult } from "../../types/schemas";
import type { AnalysisTrace } from "./BaseAnalyzerAgent";

/**
 * DocumentAnalyzerAgent
 *
 * Analyzes structured documents including PDFs, documentation sites, and technical guides.
 * Optimized for extracting hierarchical structure, code examples, and reference information.
 */
export class DocumentAnalyzerAgent extends BaseAnalyzerAgent {
  constructor() {
    super({
      modelName: 'gpt-4o-mini-2024-07-18',
      temperature: 0.4,
      maxTokens: 3500,
    });
  }

  async analyze(context: AnalyzerContext): Promise<{ result: EnhancedAnalysisResult; trace: AnalysisTrace }> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);
    return await this.invokeWithTrace(systemPrompt, userPrompt, context);
  }

  protected getSystemPrompt(): string {
    return `[PLACEHOLDER - Will be designed by prompt engineering agent]

You are an expert document analyzer. Analyze the content and return a comprehensive structured analysis.

This is a placeholder prompt that will be replaced with content-specific prompts in Phase 1.4.`;
  }
}
