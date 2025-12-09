import { extractContent } from "../tools/contentExtractor";

/**
 * Quick test of YouTube transcript extraction
 * Tests with a short educational video
 */
async function testYouTubeExtraction() {
  console.log("Testing YouTube extraction...\n");

  // Test with a TED talk that definitely has captions
  // "The power of vulnerability" by Brené Brown
  const testUrl = "https://www.youtube.com/watch?v=iCvmsMzlF7o";

  try {
    console.log(`Extracting: ${testUrl}`);
    const result = await extractContent(testUrl);

    console.log("\n✅ Extraction successful!");
    console.log("\nTitle:", result.title);
    console.log("Domain:", result.domain);
    console.log("Content Type:", result.contentType);
    console.log("Confidence:", result.extractionConfidence);
    console.log("\nMetadata:", JSON.stringify(result.metadata, null, 2));
    console.log("\nTranscript Preview (first 500 chars):");
    console.log(result.cleanText.substring(0, 500) + "...");
    console.log("\nFull transcript length:", result.cleanText.length, "characters");
  } catch (error) {
    console.error("\n❌ Extraction failed:");
    console.error(error instanceof Error ? error.message : error);
  }
}

testYouTubeExtraction();
