import { ChatOpenAI } from "@langchain/openai";
import type {
  ContentTypeClassification,
  DetectedContentType,
  ExtractedContent,
} from "../types/schemas";
import { ContentTypeClassificationSchema } from "../types/schemas";

/**
 * ContentTypeClassifierAgent (Phase 1)
 *
 * Classifies content into specialized types for routing to appropriate analyzers.
 * Uses a two-phase approach:
 * 1. Fast heuristic classification (free, <10ms) - handles ~70% of cases
 * 2. LLM fallback (GPT-4o-mini, ~500ms, $0.0003) - handles ambiguous cases
 *
 * Classification Types:
 * - article: News, blog posts, essays
 * - paper: Scientific papers, academic research
 * - video: YouTube, Vimeo, video platforms
 * - social: Twitter, LinkedIn, short-form content
 * - document: Technical docs, API docs, guides
 * - other: Fallback for everything else
 *
 * Cost: ~$0.0001/bookmark (30% need LLM at ~$0.0003 each)
 */
export class ContentTypeClassifierAgent {
  private readonly CONFIDENCE_THRESHOLD = 0.9; // Use LLM if heuristic confidence < 0.9

  /**
   * Classify content using heuristics first, LLM fallback if needed
   */
  async classify(
    url: string,
    extractedContent: ExtractedContent
  ): Promise<ContentTypeClassification> {
    // Phase 1: Try heuristic classification (fast, free)
    const heuristicResult = this.classifyByHeuristics(url, extractedContent);

    // If high confidence, return immediately
    if (heuristicResult.confidence >= this.CONFIDENCE_THRESHOLD) {
      console.log(
        `[ContentTypeClassifier] Heuristic classification: ${heuristicResult.type} ` +
          `(confidence: ${heuristicResult.confidence.toFixed(2)})`
      );
      return heuristicResult;
    }

    // Phase 2: Use LLM for ambiguous cases
    console.log(
      `[ContentTypeClassifier] Low heuristic confidence (${heuristicResult.confidence.toFixed(2)}), ` +
        `using LLM fallback...`
    );
    return await this.classifyByLLM(extractedContent, heuristicResult);
  }

  /**
   * Phase 1: Fast heuristic classification
   * Analyzes URL patterns, domain, and content structure
   */
  private classifyByHeuristics(
    url: string,
    content: ExtractedContent
  ): ContentTypeClassification {
    const indicators: string[] = [];
    let type: DetectedContentType = "other";
    let confidence = 0.5; // Start with neutral confidence

    try {
      const domain = new URL(url).hostname.toLowerCase();
      const path = new URL(url).pathname.toLowerCase();

      // ==================================================================
      // DOMAIN PATTERNS (Highest Confidence: 0.90-0.98)
      // ==================================================================
      const domainPatterns: Record<
        string,
        { type: DetectedContentType; confidence: number }
      > = {
        // Video platforms
        "youtube.com": { type: "video", confidence: 0.98 },
        "youtu.be": { type: "video", confidence: 0.98 },
        "vimeo.com": { type: "video", confidence: 0.98 },

        // Academic/Research platforms
        "arxiv.org": { type: "paper", confidence: 0.95 },
        "nature.com": { type: "paper", confidence: 0.90 },
        "sciencedirect.com": { type: "paper", confidence: 0.90 },
        "springer.com": { type: "paper", confidence: 0.90 },
        "ieee.org": { type: "paper", confidence: 0.90 },
        "acm.org": { type: "paper", confidence: 0.90 },

        // Social platforms
        "twitter.com": { type: "social", confidence: 0.95 },
        "x.com": { type: "social", confidence: 0.95 },
        "linkedin.com": { type: "social", confidence: 0.90 },
        "instagram.com": { type: "social", confidence: 0.90 },
        "facebook.com": { type: "social", confidence: 0.85 },

        // News/Article platforms
        "medium.com": { type: "article", confidence: 0.85 },
        "dev.to": { type: "article", confidence: 0.85 },
        "substack.com": { type: "article", confidence: 0.85 },
        "techcrunch.com": { type: "article", confidence: 0.90 },
        "theverge.com": { type: "article", confidence: 0.90 },
        "nytimes.com": { type: "article", confidence: 0.90 },
        "reuters.com": { type: "article", confidence: 0.90 },
        "bbc.com": { type: "article", confidence: 0.90 },

        // Documentation platforms (prefix matching)
        "docs.": { type: "document", confidence: 0.85 }, // docs.google.com, docs.aws.com, etc.
      };

      // Check domain patterns
      for (const [pattern, result] of Object.entries(domainPatterns)) {
        if (domain.includes(pattern)) {
          type = result.type;
          confidence = result.confidence;
          indicators.push(`domain:${pattern}`);
          break;
        }
      }

      // ==================================================================
      // URL PATH PATTERNS (Medium Confidence: 0.75-0.85)
      // ==================================================================
      if (confidence < 0.85) {
        // Only check if not already high confidence
        if (path.includes("/watch") || path.includes("/video")) {
          type = "video";
          confidence = Math.max(confidence, 0.85);
          indicators.push("url:video-path");
        } else if (path.includes("/paper") || path.includes("/pdf")) {
          type = "paper";
          confidence = Math.max(confidence, 0.80);
          indicators.push("url:paper-path");
        } else if (
          path.includes("/status/") ||
          path.includes("/post/") ||
          path.includes("/posts/")
        ) {
          type = "social";
          confidence = Math.max(confidence, 0.80);
          indicators.push("url:social-path");
        } else if (
          path.includes("/docs") ||
          path.includes("/documentation") ||
          path.includes("/api")
        ) {
          type = "document";
          confidence = Math.max(confidence, 0.80);
          indicators.push("url:docs-path");
        } else if (
          path.includes("/blog") ||
          path.includes("/article") ||
          path.includes("/news")
        ) {
          type = "article";
          confidence = Math.max(confidence, 0.75);
          indicators.push("url:article-path");
        }
      }

      // ==================================================================
      // CONTENT STRUCTURE PATTERNS (Lower Confidence: 0.70-0.75)
      // ==================================================================
      if (confidence < 0.75) {
        // Only check if still ambiguous
        const text = content.cleanText.toLowerCase();

        // PDF content detection
        if (content.contentType === "pdf") {
          if (
            text.includes("abstract") &&
            (text.includes("introduction") || text.includes("methodology"))
          ) {
            type = "paper";
            confidence = Math.max(confidence, 0.75);
            indicators.push("content:pdf-paper-structure");
          } else {
            type = "document";
            confidence = Math.max(confidence, 0.75);
            indicators.push("content:pdf-document");
          }
        }

        // Word count heuristics
        const wordCount = content.cleanText.split(/\s+/).length;

        if (wordCount < 500) {
          // Short content → likely social
          type = type === "other" ? "social" : type;
          confidence = Math.max(confidence, 0.70);
          indicators.push("content:short-text");
        } else if (
          wordCount > 2000 &&
          content.metadata?.author &&
          !text.includes("abstract")
        ) {
          // Long content with author → likely article
          type = type === "other" ? "article" : type;
          confidence = Math.max(confidence, 0.70);
          indicators.push("content:long-article");
        }

        // Academic paper indicators
        if (
          text.includes("abstract") &&
          text.includes("references") &&
          (text.includes("methodology") ||
            text.includes("methods") ||
            text.includes("results"))
        ) {
          type = "paper";
          confidence = Math.max(confidence, 0.75);
          indicators.push("content:academic-structure");
        }

        // Documentation indicators
        if (
          (text.includes("api") ||
            text.includes("usage") ||
            text.includes("example")) &&
          text.includes("function")
        ) {
          type = "document";
          confidence = Math.max(confidence, 0.70);
          indicators.push("content:docs-indicators");
        }
      }

      return {
        type,
        confidence,
        method: "heuristic",
        indicators: {
          domain,
          urlPatterns: indicators.filter((i) => i.startsWith("url:")),
          htmlStructure: indicators.filter((i) => i.startsWith("content:")),
        },
      };
    } catch (error) {
      console.error(
        `[ContentTypeClassifier] Heuristic classification failed:`,
        error
      );
      // Fallback to neutral result
      return {
        type: "other",
        confidence: 0.5,
        method: "heuristic",
        indicators: {
          domain: "unknown",
        },
      };
    }
  }

  /**
   * Phase 2: LLM classification for ambiguous cases
   * Uses GPT-4o-mini with structured output
   */
  private async classifyByLLM(
    content: ExtractedContent,
    heuristicHint: ContentTypeClassification
  ): Promise<ContentTypeClassification> {
    const startTime = Date.now();

    try {
      const prompt = this.buildClassificationPrompt(content, heuristicHint);

      const llm = new ChatOpenAI({
        modelName: "gpt-4o-mini-2024-07-18",
        temperature: 0.0, // Deterministic classification
        maxTokens: 200,
        maxRetries: 3,
      });

      const llmWithStructuredOutput = llm.withStructuredOutput(
        ContentTypeClassificationSchema
      );

      const result = await llmWithStructuredOutput.invoke(prompt);

      const duration = Date.now() - startTime;
      console.log(
        `[ContentTypeClassifier] LLM classification: ${result.type} ` +
          `(confidence: ${result.confidence.toFixed(2)}, ${duration}ms)`
      );

      return {
        ...result,
        method: "llm",
      };
    } catch (error) {
      console.error(`[ContentTypeClassifier] LLM classification failed:`, error);
      // Fallback to heuristic result
      return heuristicHint;
    }
  }

  /**
   * Build classification prompt for LLM
   */
  private buildClassificationPrompt(
    content: ExtractedContent,
    heuristicHint: ContentTypeClassification
  ): string {
    // Take first 2000 chars for classification (sufficient for most content)
    const contentPreview = content.cleanText.substring(0, 2000);

    return `Classify this content into exactly ONE type: article, paper, video, social, document, or other.

**Title:** ${content.title}
**Domain:** ${content.domain}
**Content Type (extractor):** ${content.contentType}

**Content Preview (first 2000 chars):**
${contentPreview}

**Heuristic Guess:** ${heuristicHint.type} (confidence: ${heuristicHint.confidence.toFixed(2)})

**Classification Criteria:**
- **article**: News articles, blog posts, essays, opinion pieces, feature stories
- **paper**: Scientific papers, research articles, academic publications (contains Abstract, Methods, Results, References)
- **video**: YouTube videos, video content, video transcripts (mentions timestamps, speaker, video-specific content)
- **social**: Tweets, LinkedIn posts, social media content, short-form conversational content (<1000 words)
- **document**: Technical documentation, API docs, guides, manuals, tutorials (how-to structure, code examples, reference material)
- **other**: Fallback for content that doesn't clearly fit above categories

**Instructions:**
1. Analyze the content structure, tone, and purpose
2. Consider the heuristic guess but make your own determination
3. Return a confidence score between 0.0 and 1.0 (0.0 = very uncertain, 1.0 = very certain)
4. Return ONLY valid JSON matching the ContentTypeClassificationSchema

Return JSON: { "type": "...", "confidence": 0.0-1.0, "method": "llm" }`;
  }
}
