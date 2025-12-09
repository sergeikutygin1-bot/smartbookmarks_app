import { extractContent } from "../tools/contentExtractor";

/**
 * Test social media content extraction
 * Tests X/Twitter and Instagram
 */
async function testSocialExtraction() {
  console.log("Testing Social Media Extraction...\n");

  // Test cases
  const tests = [
    {
      name: "X/Twitter Post",
      url: "https://twitter.com/sama/status/1866195081666154898",
      platform: "X/Twitter",
    },
    // Instagram test - may have limited results
    // {
    //   name: "Instagram Post",
    //   url: "https://www.instagram.com/p/EXAMPLE/",
    //   platform: "Instagram",
    // },
  ];

  for (const test of tests) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing ${test.platform}`);
    console.log(`${"=".repeat(60)}\n`);

    try {
      console.log(`URL: ${test.url}`);
      const result = await extractContent(test.url);

      console.log("\n✅ Extraction successful!");
      console.log("\nTitle:", result.title);
      console.log("Domain:", result.domain);
      console.log("Content Type:", result.contentType);
      console.log("Confidence:", result.extractionConfidence);
      console.log("\nMetadata:", JSON.stringify(result.metadata, null, 2));
      console.log("\nExtracted Content:");
      console.log(result.cleanText.substring(0, 500));
      console.log("\nContent Length:", result.cleanText.length, "characters");
    } catch (error) {
      console.error("\n❌ Extraction failed:");
      console.error(error instanceof Error ? error.message : error);
    }
  }
}

testSocialExtraction();
