import { Innertube } from "youtubei.js";
import type { ExtractedContent } from "../types/schemas";

/**
 * YouTube Content Extractor
 *
 * Extracts video metadata and transcripts from YouTube URLs using YouTubei.js
 * - Supports various YouTube URL formats
 * - Fetches video transcripts (captions/subtitles)
 * - Extracts comprehensive metadata
 * - No API key required!
 */

/**
 * Extracts YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 */
export function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Format: youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes("youtube.com")) {
      const videoId = urlObj.searchParams.get("v");
      if (videoId) return videoId;

      // Format: youtube.com/embed/VIDEO_ID or youtube.com/v/VIDEO_ID
      const pathMatch = urlObj.pathname.match(/\/(embed|v)\/([^/?]+)/);
      if (pathMatch) return pathMatch[2];
    }

    // Format: youtu.be/VIDEO_ID
    if (urlObj.hostname === "youtu.be") {
      const videoId = urlObj.pathname.slice(1).split("?")[0];
      if (videoId) return videoId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts content from YouTube video URL
 */
export async function extractYouTubeContent(
  url: string
): Promise<ExtractedContent> {
  const videoId = extractVideoId(url);

  if (!videoId) {
    throw new Error("Invalid YouTube URL: Could not extract video ID");
  }

  try {
    console.log(`Fetching YouTube video: ${videoId}`);

    // Initialize YouTube API client
    const youtube = await Innertube.create();

    // Get video info
    const info = await youtube.getInfo(videoId);

    console.log(`Video title: ${info.basic_info.title}`);

    // Try to get transcript
    let transcriptText = "";
    let formattedTranscript = "";

    try {
      const transcriptData = await info.getTranscript();

      if (transcriptData && transcriptData.transcript) {
        const segments = transcriptData.transcript.content?.body?.initial_segments;

        if (segments && Array.isArray(segments)) {
          // Extract plain text
          transcriptText = segments
            .map((seg: any) => seg.snippet?.text?.toString() || "")
            .filter((text) => text.length > 0)
            .join(" ");

          // Format with timestamps
          formattedTranscript = segments
            .map((seg: any) => {
              const text = seg.snippet?.text?.toString() || "";
              const startMs = seg.start_ms || 0;
              const seconds = Math.floor(startMs / 1000);
              const minutes = Math.floor(seconds / 60);
              const secs = seconds % 60;
              return `[${minutes}:${secs.toString().padStart(2, "0")}] ${text}`;
            })
            .filter((line) => line.length > 15) // Filter out empty timestamps
            .join("\n");

          console.log(
            `Transcript extracted: ${transcriptText.length} characters`
          );
        }
      }
    } catch (transcriptError) {
      console.log("Transcript not available for this video");
    }

    // Extract metadata
    const basic = info.basic_info;
    const duration = basic.duration;
    const viewCount = info.view_count;
    const author = basic.author || "Unknown";

    return {
      url,
      title: basic.title || "YouTube Video",
      domain: "youtube.com",
      contentType: "video",
      rawText: formattedTranscript || basic.short_description || "",
      cleanText: transcriptText || basic.short_description || "",
      metadata: {
        videoId,
        author,
        description: basic.short_description,
        thumbnail: basic.thumbnail?.[0]?.url,
        duration: duration || undefined,
        viewCount: viewCount ? parseInt(viewCount, 10) : undefined,
        publishDate: basic.start_timestamp?.text,
      },
      extractionConfidence:
        transcriptText.length > 100
          ? 0.95
          : basic.short_description
          ? 0.6
          : 0.4,
      extractedAt: new Date(),
    };
  } catch (error) {
    console.error("YouTube extraction failed:", error);

    // Return minimal data on error
    return {
      url,
      title: "YouTube Video (Extraction Failed)",
      domain: "youtube.com",
      contentType: "video",
      rawText: "",
      cleanText: "",
      metadata: {
        videoId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      extractionConfidence: 0.1,
      extractedAt: new Date(),
    };
  }
}
