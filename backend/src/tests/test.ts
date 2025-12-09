/**
 * Test Script for Enrichment Agent
 *
 * Tests the agent with various content types and URLs
 *
 * Usage:
 *   1. Copy .env.example to .env
 *   2. Add your OPENAI_API_KEY
 *   3. Run: npm test
 */

import "dotenv/config";
import { EnrichmentAgent } from "../agents/enrichmentAgent";
import type { EnrichmentResult } from "../types/schemas";

// Sample URLs to test different content types
const TEST_URLS = {
  article: "https://paulgraham.com/greatwork.html",
  techArticle: "https://martinfowler.com/articles/patterns-of-distributed-systems/",
  blog: "https://overreacted.io/a-complete-guide-to-useeffect/",
  // YouTube video (requires special handling in future)
  // video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

/**
 * Pretty print enrichment results
 */
function printResult(result: EnrichmentResult) {
  console.log("\n" + "=".repeat(80));
  console.log("ENRICHMENT RESULT");
  console.log("=".repeat(80));
  console.log(`\n📄 Title: ${result.title}`);
  console.log(`🌐 Domain: ${result.domain}`);
  console.log(`📦 Content Type: ${result.contentType}`);
  console.log(`⏱️  Processing Time: ${result.processingTimeMs}ms`);
  console.log(`🤖 Model: ${result.modelUsed}`);

  console.log(`\n📝 Summary:`);
  console.log(`   ${result.analysis.summary}`);

  console.log(`\n💡 Key Points:`);
  result.analysis.keyPoints.forEach((point, i) => {
    console.log(`   ${i + 1}. ${point}`);
  });

  console.log(`\n🏷️  Tags:`);
  console.log(`   ${result.tagging.tags.join(", ")}`);

  console.log(`\n📊 Content Stats:`);
  console.log(
    `   - Raw text length: ${result.extractedContent.rawText.length} chars`
  );
  console.log(
    `   - Clean text length: ${result.extractedContent.cleanText.length} chars`
  );
  if (result.extractedContent.images?.length) {
    console.log(`   - Images found: ${result.extractedContent.images.length}`);
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

/**
 * Test a single URL
 */
async function testUrl(url: string, description: string) {
  console.log(`\n\n🧪 Testing ${description}...`);
  console.log(`   URL: ${url}`);

  const agent = new EnrichmentAgent();

  // Track progress
  agent.onProgress((progress) => {
    console.log(`   [${progress.step.toUpperCase()}] ${progress.message}`);
  });

  try {
    const result = await agent.enrich({
      url,
      existingTags: [
        "programming",
        "web-development",
        "ai",
        "design",
        "business",
      ],
    });

    printResult(result);

    // Check for errors
    if (agent.hasErrors()) {
      console.log("⚠️  Errors occurred during enrichment:");
      agent.getErrors().forEach((error) => {
        console.log(
          `   - ${error.step}: ${error.error} (${error.recoverable ? "recoverable" : "critical"})`
        );
      });
    }

    return result;
  } catch (error) {
    console.error(`\n❌ Failed to enrich ${description}:`, error);
    throw error;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║        Smart Bookmark - Enrichment Agent Test Suite          ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "\n❌ Error: OPENAI_API_KEY not found in environment variables"
    );
    console.log(
      "\nPlease:\n  1. Copy .env.example to .env\n  2. Add your OpenAI API key\n  3. Run the test again\n"
    );
    process.exit(1);
  }

  const results: EnrichmentResult[] = [];
  const startTime = Date.now();

  try {
    // Test 1: Paul Graham essay (classic article)
    results.push(
      await testUrl(TEST_URLS.article, "Paul Graham Essay (Article)")
    );

    // Test 2: Technical article
    // results.push(
    //   await testUrl(
    //     TEST_URLS.techArticle,
    //     "Martin Fowler Article (Technical)"
    //   )
    // );

    // Test 3: Blog post
    // results.push(await testUrl(TEST_URLS.blog, "Dan Abramov Blog (React)"));

    // Summary
    const totalTime = Date.now() - startTime;
    console.log("\n" + "═".repeat(80));
    console.log("TEST SUMMARY");
    console.log("═".repeat(80));
    console.log(`\n✅ Successfully enriched ${results.length} URL(s)`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log(
      `📊 Average time per URL: ${Math.round(totalTime / results.length)}ms`
    );

    // Calculate average tags
    const avgTags =
      results.reduce((sum, r) => sum + r.tagging.tags.length, 0) /
      results.length;
    console.log(`🏷️  Average tags per URL: ${avgTags.toFixed(1)}`);

    // All unique tags
    const allTags = new Set(results.flatMap((r) => r.tagging.tags));
    console.log(`🏷️  Total unique tags: ${allTags.size}`);
    console.log(`🏷️  Tags: ${[...allTags].join(", ")}`);

    console.log("\n✨ All tests completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { runTests, testUrl };
