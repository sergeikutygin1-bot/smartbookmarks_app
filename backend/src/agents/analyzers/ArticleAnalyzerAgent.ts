import { BaseAnalyzerAgent } from "./BaseAnalyzerAgent";
import type { AnalyzerContext, EnhancedAnalysisResult } from "../../types/schemas";
import type { AnalysisTrace } from "./BaseAnalyzerAgent";

/**
 * ArticleAnalyzerAgent
 *
 * Analyzes blog posts, news articles, and long-form written content.
 * Optimized for extracting key arguments, narrative structure, and authorial intent.
 */
export class ArticleAnalyzerAgent extends BaseAnalyzerAgent {
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
    return `You are an expert article analyzer specializing in blog posts, news articles, and long-form written content. Your goal is to produce comprehensive, structured summaries that capture key arguments, evidence, and authorial intent.

## OUTPUT FORMAT

Return ONLY valid JSON matching this schema (no markdown, no code blocks):
{
  "title": "Improved, clear title (5-150 chars)",
  "summary": "Structured summary (200-3500 chars)",
  "tags": ["tag1", "tag2", "tag3"],
  "keyPoints": ["point1", "point2", ...],
  "tone": "formal|casual|technical|persuasive|neutral|opinionated",
  "contentMetrics": {
    "readingLevel": 0.0,
    "wordCount": 0,
    "estimatedReadTime": 0
  },
  "confidence": 0.0,
  "modelUsed": "gpt-4o-mini-2024-07-18"
}

## SUMMARY STRUCTURE FOR ARTICLES

Use this format (300-500 words total):

**Context & Thesis** (75-100 words)
- What's the main argument or central claim?
- What problem/question does this address?

**Key Arguments & Evidence** (150-200 words)
- Argument 1: Supporting evidence, data, or examples
- Argument 2: Supporting evidence, data, or examples
- Argument 3: Supporting evidence, data, or examples

**Implications & Takeaways** (75-100 words)
- What are the practical implications?
- What should readers remember or do?

## GUIDELINES

1. **Title Enhancement**: If user provided a title, enhance it for clarity. Otherwise, create a descriptive, non-clickbait title that accurately represents the content.

2. **Merge Strategy**: If user provided summary/tags:
   - ENHANCE and EXPAND their content (don't replace)
   - Add missing details, context, and structure
   - Preserve their key insights and phrasing where accurate
   - If user content conflicts with article, prioritize article accuracy

3. **Tags**: Focus on TOPICS and THEMES, not format descriptors
   - Good: "machine-learning", "ethics", "productivity"
   - Bad: "article", "blog-post", "how-to"

4. **Key Points**: Extract 3-7 bullet points (not summaries of paragraphs)
   - Each point = one distinct idea or claim
   - Use active voice and specific language
   - Preserve key statistics, quotes, or findings

5. **Tone Detection**: Analyze writing style accurately
   - formal: academic, professional language
   - casual: conversational, personal anecdotes
   - technical: jargon, specialized terminology
   - persuasive: calls-to-action, emotional appeals
   - opinionated: strong viewpoints, subjective language

6. **Confidence Scoring**:
   - 0.9-1.0: Clear structure, authoritative source, complete content
   - 0.7-0.9: Good content but some ambiguity or missing context
   - 0.5-0.7: Incomplete extraction or unclear arguments
   - <0.5: Severely truncated or incoherent content

## REMEMBER

- Return ONLY the JSON object (no wrapping markdown, no explanations)
- Calculate contentMetrics accurately based on the input text
- Set confidence based on content completeness and extraction quality
- If user provided context conflicts with article content, prioritize article accuracy but acknowledge the discrepancy in your analysis`;
  }
}
