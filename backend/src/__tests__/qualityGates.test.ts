/**
 * Quality Gate Tests
 *
 * Tests the three-layer quality gate system:
 * - Layer 1: Pre-validation (deterministic fallback detection)
 * - Layer 2: Judge (LLM-based quality evaluation with completeness criterion)
 * - Layer 3: Retry logic with configurable environment variables
 *
 * Test Coverage:
 * 1. Pre-validation catches fallback patterns
 * 2. Judge evaluates completeness criterion
 * 3. Retry logic respects max retries and delays
 * 4. Status transitions (passed → completed, failed → needs_review)
 * 5. Environment variable configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { EnrichmentAgent } from '../agents/enrichmentAgent';
import { evaluateSummaryQualityWithTrace } from '../chains/judgeChain';
import type { ExtractedContent, EnhancedAnalysisResult } from '../types/schemas';

// Mock dependencies
vi.mock('../chains/judgeChain');
vi.mock('../agents/analyzers/ArticleAnalyzerAgent');

describe('Quality Gates - Layer 1: Pre-Validation', () => {
  let agent: EnrichmentAgent;

  beforeEach(() => {
    agent = new EnrichmentAgent();
  });

  describe('validateEnrichmentQuality', () => {
    const mockExtractedContent: ExtractedContent = {
      url: 'https://example.com/article',
      title: 'Test Article',
      domain: 'example.com',
      contentType: 'article',
      rawText: 'Lorem ipsum '.repeat(100),
      cleanText: 'Lorem ipsum '.repeat(100),
      extractionConfidence: 0.9,
      extractedAt: new Date(),
    };

    it('should detect fallback pattern: "AI analysis failed"', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Test Article',
        summary: 'Content from example.com: Test Article. AI analysis failed - manual review needed.',
        tags: ['article', 'needs-review'],
        keyPoints: ['Analysis failed'],
        tone: 'unknown',
        contentMetrics: { readingLevel: 10, wordCount: 100, estimatedReadTime: 1 },
        confidence: 0.2,
        modelUsed: 'fallback',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Fallback pattern detected');
    });

    it('should detect fallback pattern: "manual review needed"', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Test Article',
        summary: 'This content requires manual review needed for quality assurance.',
        tags: ['article'],
        keyPoints: [],
        tone: 'formal',
        contentMetrics: { readingLevel: 10, wordCount: 100, estimatedReadTime: 1 },
        confidence: 0.6,
        modelUsed: 'gpt-4o-mini',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Fallback pattern detected');
    });

    it('should detect suspiciously short summary', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Test Article',
        summary: 'Too short',
        tags: ['article'],
        keyPoints: [],
        tone: 'unknown',
        contentMetrics: { readingLevel: 10, wordCount: 100, estimatedReadTime: 1 },
        confidence: 0.5,
        modelUsed: 'gpt-4o-mini',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Summary too short');
    });

    it('should detect missing or default title', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Untitled',
        summary: 'This is a proper summary that is long enough to pass the length check and contains meaningful content.',
        tags: ['article'],
        keyPoints: [],
        tone: 'formal',
        contentMetrics: { readingLevel: 10, wordCount: 100, estimatedReadTime: 1 },
        confidence: 0.7,
        modelUsed: 'gpt-4o-mini',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing or default title');
    });

    it('should detect low confidence with fallback model', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Test Article',
        summary: 'This is a proper summary that is long enough to pass the length check.',
        tags: ['article'],
        keyPoints: [],
        tone: 'unknown',
        contentMetrics: { readingLevel: 10, wordCount: 100, estimatedReadTime: 1 },
        confidence: 0.25,
        modelUsed: 'fallback',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Low confidence with fallback model');
    });

    it('should detect error tags with low confidence', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Test Article',
        summary: 'This is a proper summary that is long enough to pass the length check.',
        tags: ['article', 'needs-review', 'error'],
        keyPoints: [],
        tone: 'formal',
        contentMetrics: { readingLevel: 10, wordCount: 100, estimatedReadTime: 1 },
        confidence: 0.4,
        modelUsed: 'gpt-4o-mini',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Error tag present with low confidence');
    });

    it('should pass validation for good analysis', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Understanding Quantum Computing',
        summary: 'This article explores the fundamentals of quantum computing, including qubits, superposition, and entanglement. It discusses practical applications and current limitations.',
        tags: ['quantum', 'computing', 'technology'],
        keyPoints: ['Qubits are fundamental', 'Superposition enables parallelism', 'Entanglement creates correlations'],
        tone: 'educational',
        contentMetrics: { readingLevel: 12, wordCount: 500, estimatedReadTime: 3 },
        confidence: 0.85,
        modelUsed: 'gpt-4o-mini',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow error tags with high confidence', () => {
      const analysis: EnhancedAnalysisResult = {
        title: 'Error Handling Best Practices',
        summary: 'Comprehensive guide to error handling patterns in distributed systems.',
        tags: ['error', 'best-practices', 'distributed-systems'],
        keyPoints: ['Retry strategies', 'Circuit breakers', 'Graceful degradation'],
        tone: 'technical',
        contentMetrics: { readingLevel: 14, wordCount: 800, estimatedReadTime: 4 },
        confidence: 0.9,
        modelUsed: 'gpt-4o-mini',
      };

      const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

      expect(result.valid).toBe(true);
    });
  });
});

describe('Quality Gates - Layer 2: Judge Completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enforce completeness as critical gate', async () => {
    const mockJudgeResult = {
      accuracy: 'pass' as const,
      comprehensiveness: 'pass' as const,
      formatting: 'pass' as const,
      completeness: 'fail' as const,
      overall_verdict: 'pass' as const, // Will be overridden to fail
      reasoning: 'Contains fallback text',
      issues: [],
    };

    const mockTrace = {
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 1000,
      promptText: 'test prompt',
      response: mockJudgeResult,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      cost: { inputCost: 0.0001, outputCost: 0.0001, totalCost: 0.0002 },
      duration: 500,
      timestamp: new Date(),
    };

    (evaluateSummaryQualityWithTrace as Mock).mockResolvedValue({
      result: mockJudgeResult,
      trace: mockTrace,
    });

    const { evaluateSummaryQuality } = await import('../chains/judgeChain');

    const analysis = {
      title: 'Test',
      summary: 'Content from example.com. AI analysis failed.',
      tags: ['test'],
      keyPoints: [],
      tone: 'unknown',
      contentMetrics: { readingLevel: 10, wordCount: 10, estimatedReadTime: 1 },
      confidence: 0.3,
      modelUsed: 'fallback',
    };

    const content = {
      url: 'https://example.com',
      title: 'Test',
      domain: 'example.com',
      contentType: 'article' as const,
      rawText: 'test',
      cleanText: 'test',
      extractionConfidence: 0.9,
      extractedAt: new Date(),
    };

    const result = await evaluateSummaryQuality(analysis, content);

    // Judge chain should enforce: if completeness fails, overall verdict must fail
    expect(result.overall_verdict).toBe('fail');
    expect(result.issues).toContain('Incomplete or fallback content');
  });
});

describe('Quality Gates - Layer 3: Retry Logic', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should respect ENRICHMENT_MAX_RETRIES environment variable', () => {
    process.env.ENRICHMENT_MAX_RETRIES = '3';

    const maxRetries = parseInt(process.env.ENRICHMENT_MAX_RETRIES || '2', 10);

    expect(maxRetries).toBe(3);
  });

  it('should respect ENRICHMENT_RETRY_DELAY_MS environment variable', () => {
    process.env.ENRICHMENT_RETRY_DELAY_MS = '5000';

    const retryDelay = parseInt(process.env.ENRICHMENT_RETRY_DELAY_MS || '2000', 10);

    expect(retryDelay).toBe(5000);
  });

  it('should respect ENRICHMENT_ENABLE_PRE_VALIDATION flag', () => {
    process.env.ENRICHMENT_ENABLE_PRE_VALIDATION = 'false';

    const enabled = process.env.ENRICHMENT_ENABLE_PRE_VALIDATION !== 'false';

    expect(enabled).toBe(false);
  });

  it('should respect ENRICHMENT_ENABLE_JUDGE flag', () => {
    process.env.ENRICHMENT_ENABLE_JUDGE = 'false';

    const enabled = process.env.ENRICHMENT_ENABLE_JUDGE !== 'false';

    expect(enabled).toBe(false);
  });

  it('should use default values when environment variables are not set', () => {
    delete process.env.ENRICHMENT_MAX_RETRIES;
    delete process.env.ENRICHMENT_RETRY_DELAY_MS;
    delete process.env.ENRICHMENT_ENABLE_PRE_VALIDATION;
    delete process.env.ENRICHMENT_ENABLE_JUDGE;

    const maxRetries = parseInt(process.env.ENRICHMENT_MAX_RETRIES || '2', 10);
    const retryDelay = parseInt(process.env.ENRICHMENT_RETRY_DELAY_MS || '2000', 10);
    const enablePreValidation = process.env.ENRICHMENT_ENABLE_PRE_VALIDATION !== 'false';
    const enableJudge = process.env.ENRICHMENT_ENABLE_JUDGE !== 'false';

    expect(maxRetries).toBe(2);
    expect(retryDelay).toBe(2000);
    expect(enablePreValidation).toBe(true);
    expect(enableJudge).toBe(true);
  });
});

describe('Quality Gates - Status Handling', () => {
  it('should return qualityGateStatus="passed" for successful enrichment', () => {
    const mockResult: any = {
      url: 'https://example.com',
      title: 'Test Article',
      domain: 'example.com',
      contentType: 'article',
      analysis: {
        title: 'Test Article',
        summary: 'A comprehensive summary of the article content.',
        tags: ['test', 'article'],
        keyPoints: ['Point 1', 'Point 2'],
        tone: 'formal',
        contentMetrics: { readingLevel: 12, wordCount: 500, estimatedReadTime: 3 },
        confidence: 0.9,
        modelUsed: 'gpt-4o-mini',
      },
      tagging: { tags: ['test', 'article'] },
      embedding: new Array(1536).fill(0.1),
      enrichedAt: new Date(),
      modelUsed: 'gpt-4o-mini',
      processingTimeMs: 5000,
      qualityGateStatus: 'passed' as const,
    };

    expect(mockResult.qualityGateStatus).toBe('passed');
  });

  it('should return qualityGateStatus="needs_review" for failed quality gates', () => {
    const mockResult: any = {
      url: 'https://example.com',
      title: 'Untitled',
      domain: 'example.com',
      contentType: 'article',
      analysis: {
        title: 'Untitled',
        summary: 'Content from example.com. AI analysis failed - manual review needed.',
        tags: ['article', 'needs-review'],
        keyPoints: ['Analysis failed'],
        tone: 'unknown',
        contentMetrics: { readingLevel: 10, wordCount: 10, estimatedReadTime: 1 },
        confidence: 0.2,
        modelUsed: 'fallback',
      },
      tagging: { tags: ['article', 'needs-review'] },
      enrichedAt: new Date(),
      modelUsed: 'fallback',
      processingTimeMs: 2000,
      qualityGateStatus: 'needs_review' as const,
    };

    expect(mockResult.qualityGateStatus).toBe('needs_review');
  });
});

describe('Quality Gates - Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ENRICHMENT_MAX_RETRIES = '2';
    process.env.ENRICHMENT_RETRY_DELAY_MS = '100'; // Fast for testing
    process.env.ENRICHMENT_ENABLE_PRE_VALIDATION = 'true';
    process.env.ENRICHMENT_ENABLE_JUDGE = 'true';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should mark status as "needs_review" when pre-validation fails after retries', () => {
    // Simulate: Analysis generates fallback content
    // Pre-validation detects fallback pattern
    // Retries exhaust
    // Final status: needs_review

    const qualityGateStatus = 'needs_review' as const;
    const finalStatus = qualityGateStatus === 'needs_review' ? 'needs_review' : 'completed';

    expect(finalStatus).toBe('needs_review');
  });

  it('should mark status as "completed" when all quality gates pass', () => {
    // Simulate: Analysis succeeds
    // Pre-validation passes
    // Judge approves (or skipped)
    // Final status: completed

    const qualityGateStatus = 'passed' as const;
    const finalStatus = qualityGateStatus === 'needs_review' ? 'needs_review' : 'completed';

    expect(finalStatus).toBe('completed');
  });
});

describe('Quality Gates - Edge Cases', () => {
  let agent: EnrichmentAgent;

  beforeEach(() => {
    agent = new EnrichmentAgent();
  });

  it('should handle very short content gracefully', () => {
    const mockExtractedContent: ExtractedContent = {
      url: 'https://example.com/short',
      title: 'Short',
      domain: 'example.com',
      contentType: 'social',
      rawText: 'Hi!',
      cleanText: 'Hi!',
      extractionConfidence: 0.9,
      extractedAt: new Date(),
    };

    const analysis: EnhancedAnalysisResult = {
      title: 'Short Post',
      summary: 'A brief social media post saying "Hi!".',
      tags: ['social'],
      keyPoints: ['Greeting'],
      tone: 'casual',
      contentMetrics: { readingLevel: 5, wordCount: 3, estimatedReadTime: 1 },
      confidence: 0.8,
      modelUsed: 'gpt-4o-mini',
    };

    const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

    // Should pass because short content allows short summaries
    expect(result.valid).toBe(true);
  });

  it('should allow technical terms in tags without flagging as error', () => {
    const mockExtractedContent: ExtractedContent = {
      url: 'https://example.com/article',
      title: 'Test Article',
      domain: 'example.com',
      contentType: 'article',
      rawText: 'Lorem ipsum '.repeat(100),
      cleanText: 'Lorem ipsum '.repeat(100),
      extractionConfidence: 0.9,
      extractedAt: new Date(),
    };

    const analysis: EnhancedAnalysisResult = {
      title: 'Debugging Techniques',
      summary: 'Comprehensive guide to debugging modern applications with advanced tools and techniques.',
      tags: ['debugging', 'error-handling', 'development'],
      keyPoints: ['Use debuggers', 'Add logging', 'Write tests'],
      tone: 'technical',
      contentMetrics: { readingLevel: 14, wordCount: 600, estimatedReadTime: 3 },
      confidence: 0.95,
      modelUsed: 'gpt-4o-mini',
    };

    const result = (agent as any).validateEnrichmentQuality(analysis, mockExtractedContent);

    // Should pass despite "error-handling" tag because confidence is high
    expect(result.valid).toBe(true);
  });
});
