/**
 * Test Script for ContentTypeClassifierAgent
 *
 * Tests content-type classification with diverse URLs using both
 * heuristic and LLM fallback approaches.
 *
 * Usage:
 *   npx tsx src/tests/content-type-classification-test.ts
 *
 * Expected Outcomes:
 * - Heuristic classification accuracy > 90% for well-known domains
 * - LLM fallback triggers only for ambiguous content (confidence < 0.9)
 * - All classifications return valid schema
 */

import "dotenv/config";
import { ContentTypeClassifierAgent } from "../agents/ContentTypeClassifierAgent";
import type { ExtractedContent } from "../types/schemas";

// Test cases covering all 6 content types
const TEST_CASES = [
  // ARTICLE - Should classify with high confidence via heuristics
  {
    name: "News Article (BBC)",
    url: "https://www.bbc.com/news/technology-12345678",
    mockContent: {
      url: "https://www.bbc.com/news/technology-12345678",
      title: "Breaking: AI Breakthrough in Medical Diagnostics",
      domain: "bbc.com",
      contentType: "article" as const,
      rawText: "Scientists have made a breakthrough...",
      cleanText: "Scientists have made a breakthrough in using artificial intelligence for medical diagnostics. The new system can detect diseases with 95% accuracy, significantly improving early detection rates. Researchers at Stanford University developed the AI model using deep learning techniques trained on millions of medical images.",
      extractionConfidence: 0.95,
      extractedAt: new Date(),
    },
    expectedType: "article",
    expectedConfidenceMin: 0.85,
    shouldUseLLM: false,
  },

  // PAPER - Should classify via heuristics (arxiv.org domain)
  {
    name: "ArXiv Paper",
    url: "https://arxiv.org/abs/2301.12345",
    mockContent: {
      url: "https://arxiv.org/abs/2301.12345",
      title: "Attention Is All You Need: Transformer Architecture for NLP",
      domain: "arxiv.org",
      contentType: "article" as const,
      rawText: "Abstract: We propose a new neural network...",
      cleanText: "Abstract: We propose a new neural network architecture based solely on attention mechanisms. The Transformer model achieves state-of-the-art results on machine translation tasks while being more parallelizable than recurrent architectures. We demonstrate a 28% improvement in BLEU scores on the WMT 2014 English-to-German translation task.",
      extractionConfidence: 0.98,
      extractedAt: new Date(),
    },
    expectedType: "paper",
    expectedConfidenceMin: 0.90,
    shouldUseLLM: false,
  },

  // VIDEO - Should classify via heuristics (youtube.com domain)
  {
    name: "YouTube Tutorial",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    mockContent: {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "React Hooks Complete Guide - 2024 Tutorial",
      domain: "youtube.com",
      contentType: "video" as const,
      rawText: "[Video transcript]",
      cleanText: "In this comprehensive tutorial, we'll cover everything you need to know about React Hooks. Starting with useState, we'll demonstrate how to manage component state effectively. Around 3:45, we show the useEffect hook for handling side effects and data fetching. The key insight at 12:30 explains dependency arrays and how to avoid infinite loops.",
      metadata: {
        description: "Complete React Hooks tutorial covering useState, useEffect, and custom hooks",
      },
      extractionConfidence: 0.90,
      extractedAt: new Date(),
    },
    expectedType: "video",
    expectedConfidenceMin: 0.95,
    shouldUseLLM: false,
  },

  // SOCIAL - Should classify via heuristics (twitter.com domain)
  {
    name: "Twitter Thread",
    url: "https://twitter.com/username/status/1234567890",
    mockContent: {
      url: "https://twitter.com/username/status/1234567890",
      title: "Thread on React Server Components",
      domain: "twitter.com",
      contentType: "social" as const,
      rawText: "1/12 Let's talk about React Server Components...",
      cleanText: "1/12 Let's talk about React Server Components and why they're a game changer. RSC is NOT the same as SSR. Here's the key difference: SSR renders HTML on the server and hydrates on the client. RSC runs components once on the server and streams serialized JSX. 2/12 This means your component code never ships to the browser...",
      extractionConfidence: 0.92,
      extractedAt: new Date(),
    },
    expectedType: "social",
    expectedConfidenceMin: 0.90,
    shouldUseLLM: false,
  },

  // DOCUMENT - May use LLM fallback (URL pattern gives 0.80 confidence)
  {
    name: "Technical Documentation",
    url: "https://nextjs.org/docs/app/building-your-application/routing",
    mockContent: {
      url: "https://nextjs.org/docs/app/building-your-application/routing",
      title: "Next.js App Router - Routing Fundamentals",
      domain: "nextjs.org",
      contentType: "other" as const,
      rawText: "Routing in Next.js is based on file-system...",
      cleanText: "Routing in Next.js 13+ is based on the file-system using the app directory. Each folder represents a route segment that maps to a URL segment. To create a nested route, you can nest folders inside each other. The special file page.js is used to make route segments publicly accessible. Dynamic routes use square brackets: [id] creates a dynamic segment.",
      extractionConfidence: 0.88,
      extractedAt: new Date(),
    },
    expectedType: "document",
    expectedConfidenceMin: 0.75,
    shouldUseLLM: true, // URL pattern gives 0.80 confidence, below 0.9 threshold
  },

  // AMBIGUOUS - Should trigger LLM fallback (medium.com has medium confidence)
  {
    name: "Medium Blog Post (Ambiguous)",
    url: "https://medium.com/@author/some-post",
    mockContent: {
      url: "https://medium.com/@author/some-post",
      title: "Building Scalable APIs with Node.js",
      domain: "medium.com",
      contentType: "article" as const,
      rawText: "When building APIs...",
      cleanText: "When building APIs at scale, there are several architectural patterns to consider. RESTful design remains popular but GraphQL offers interesting alternatives for complex data requirements. In this article, we'll explore both approaches with practical examples from production systems handling millions of requests per day. We'll cover authentication strategies, rate limiting, caching patterns, and database optimization techniques.",
      extractionConfidence: 0.85,
      extractedAt: new Date(),
    },
    expectedType: "article",
    expectedConfidenceMin: 0.70,
    shouldUseLLM: true, // Medium.com has medium confidence (0.85), may trigger LLM
  },

  // ARTICLE - Unknown domain correctly classified by LLM
  {
    name: "Unknown Domain (LLM Classification)",
    url: "https://random-blog-site.xyz/post/12345",
    mockContent: {
      url: "https://random-blog-site.xyz/post/12345",
      title: "My Personal Thoughts on Technology",
      domain: "random-blog-site.xyz",
      contentType: "other" as const,
      rawText: "I've been thinking about...",
      cleanText: "I've been thinking about how technology shapes our lives. From smartphones to AI assistants, we're surrounded by innovation. This personal essay explores my journey as a developer and what I've learned about the intersection of technology and humanity over the past decade.",
      extractionConfidence: 0.75,
      extractedAt: new Date(),
    },
    expectedType: "article", // LLM correctly identifies this as an article/essay
    expectedConfidenceMin: 0.80,
    shouldUseLLM: true, // Unknown domain should trigger LLM
  },
];

/**
 * Run classification tests
 */
async function runTests() {
  console.log("\n" + "=".repeat(80));
  console.log("CONTENT TYPE CLASSIFICATION TESTS");
  console.log("=".repeat(80));
  console.log(`\nTesting ${TEST_CASES.length} content samples\n`);

  const classifier = new ContentTypeClassifierAgent();
  let passedTests = 0;
  let failedTests = 0;
  const results: Array<{
    name: string;
    passed: boolean;
    actualType: string;
    expectedType: string;
    confidence: number;
    method: string;
    reason?: string;
  }> = [];

  for (const testCase of TEST_CASES) {
    const { name, url, mockContent, expectedType, expectedConfidenceMin, shouldUseLLM } = testCase;

    console.log(`\n📋 Test: ${name}`);
    console.log(`   URL: ${url}`);

    try {
      const startTime = Date.now();
      const classification = await classifier.classify(url, mockContent);
      const duration = Date.now() - startTime;

      console.log(`   Result: ${classification.type} (confidence: ${classification.confidence.toFixed(2)})`);
      console.log(`   Method: ${classification.method}`);
      console.log(`   Duration: ${duration}ms`);

      // Validation checks
      const checks = {
        typeMatch: classification.type === expectedType,
        confidenceSufficient: classification.confidence >= expectedConfidenceMin,
        methodCorrect: shouldUseLLM ? classification.method === "llm" : classification.method === "heuristic",
      };

      const allChecksPassed = Object.values(checks).every(Boolean);

      if (allChecksPassed) {
        console.log(`   ✅ PASSED`);
        passedTests++;
        results.push({
          name,
          passed: true,
          actualType: classification.type,
          expectedType,
          confidence: classification.confidence,
          method: classification.method,
        });
      } else {
        console.log(`   ❌ FAILED`);
        const reasons: string[] = [];
        if (!checks.typeMatch) {
          reasons.push(`type mismatch (expected: ${expectedType}, got: ${classification.type})`);
        }
        if (!checks.confidenceSufficient) {
          reasons.push(`low confidence (expected: >= ${expectedConfidenceMin}, got: ${classification.confidence.toFixed(2)})`);
        }
        if (!checks.methodCorrect) {
          reasons.push(`method incorrect (expected: ${shouldUseLLM ? "llm" : "heuristic"}, got: ${classification.method})`);
        }
        const reason = reasons.join(", ");
        console.log(`   Reason: ${reason}`);
        failedTests++;
        results.push({
          name,
          passed: false,
          actualType: classification.type,
          expectedType,
          confidence: classification.confidence,
          method: classification.method,
          reason,
        });
      }

      // Show classification indicators if available
      if (classification.indicators) {
        console.log(`   Indicators:`, JSON.stringify(classification.indicators, null, 2));
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failedTests++;
      results.push({
        name,
        passed: false,
        actualType: "error",
        expectedType,
        confidence: 0,
        method: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`\nTotal Tests: ${TEST_CASES.length}`);
  console.log(`Passed: ${passedTests} (${((passedTests / TEST_CASES.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failedTests} (${((failedTests / TEST_CASES.length) * 100).toFixed(1)}%)`);

  // Detailed results table
  console.log("\n" + "-".repeat(80));
  console.log("DETAILED RESULTS");
  console.log("-".repeat(80));
  results.forEach((result, i) => {
    const status = result.passed ? "✅" : "❌";
    console.log(`\n${i + 1}. ${status} ${result.name}`);
    console.log(`   Type: ${result.actualType} (expected: ${result.expectedType})`);
    console.log(`   Confidence: ${result.confidence.toFixed(2)}`);
    console.log(`   Method: ${result.method}`);
    if (result.reason) {
      console.log(`   Reason: ${result.reason}`);
    }
  });

  // Exit code
  const success = failedTests === 0;
  console.log("\n" + "=".repeat(80));
  if (success) {
    console.log("✅ ALL TESTS PASSED!");
  } else {
    console.log(`❌ ${failedTests} TEST(S) FAILED`);
  }
  console.log("=".repeat(80) + "\n");

  process.exit(success ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error("\n❌ Test runner failed:", error);
  process.exit(1);
});
