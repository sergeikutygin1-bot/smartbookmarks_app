import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ExtractedContent, ContentType } from "../types/schemas";
import { extractYouTubeContent, extractVideoId } from "./youtubeExtractor";
import {
  extractSocialContent,
  isTwitterUrl,
  isInstagramUrl,
  isLinkedInUrl,
} from "./socialExtractor";

/**
 * Content Extractor Tool
 *
 * Fetches and parses content from URLs using:
 * - axios for HTTP requests
 * - Readability for article content extraction (same as Firefox Reader View)
 * - jsdom for HTML parsing
 *
 * Features:
 * - Auto-detects content type from URL patterns and headers
 * - Graceful error handling with partial data return
 * - Timeout protection
 * - User-agent spoofing to avoid blocks
 */

interface ExtractionOptions {
  timeout?: number;
  userAgent?: string;
  maxRetries?: number;
}

const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  timeout: 10000, // 10 seconds
  userAgent:
    "Mozilla/5.0 (compatible; SmartBookmarkBot/1.0; +https://smartbookmark.app)",
  maxRetries: 3,
};

/**
 * Detects content type from URL patterns
 */
function detectContentTypeFromUrl(url: string): ContentType {
  const urlLower = url.toLowerCase();

  // Video platforms
  if (
    urlLower.includes("youtube.com") ||
    urlLower.includes("youtu.be") ||
    urlLower.includes("vimeo.com") ||
    urlLower.includes("tiktok.com")
  ) {
    return "video";
  }

  // Social media
  if (
    urlLower.includes("twitter.com") ||
    urlLower.includes("x.com") ||
    urlLower.includes("instagram.com") ||
    urlLower.includes("linkedin.com")
  ) {
    return "social";
  }

  // PDF
  if (urlLower.endsWith(".pdf")) {
    return "pdf";
  }

  // Images
  if (
    urlLower.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i)
  ) {
    return "image";
  }

  // Podcast
  if (
    urlLower.includes("spotify.com/episode") ||
    urlLower.includes("podcasts.apple.com")
  ) {
    return "podcast";
  }

  // Default to article
  return "article";
}

/**
 * Extracts domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Extracts content from HTML using Readability
 */
function extractWithReadability(html: string, url: string) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  return article;
}

/**
 * Extracts images from HTML
 */
function extractImages(html: string, baseUrl: string): string[] {
  try {
    const dom = new JSDOM(html, { url: baseUrl });
    const images = Array.from(dom.window.document.querySelectorAll("img"))
      .map((img) => img.src)
      .filter((src) => src && src.startsWith("http"))
      .slice(0, 10); // Limit to 10 images

    return images;
  } catch {
    return [];
  }
}

/**
 * Main extraction function
 *
 * @param url - The URL to extract content from
 * @param options - Extraction options
 * @returns Extracted content with metadata
 */
export async function extractContent(
  url: string,
  options: ExtractionOptions = {}
): Promise<ExtractedContent> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  try {
    const contentType = detectContentTypeFromUrl(url);

    // For YouTube videos, use specialized extractor
    if (contentType === "video" && extractVideoId(url)) {
      return await extractYouTubeContent(url);
    }

    // For social media posts, use specialized extractors
    if (
      contentType === "social" &&
      (isTwitterUrl(url) || isInstagramUrl(url) || isLinkedInUrl(url))
    ) {
      return await extractSocialContent(url);
    }

    // Fetch the URL for other content types
    const response = await axios.get(url, {
      timeout: opts.timeout,
      headers: {
        "User-Agent": opts.userAgent,
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });

    const html = response.data;

    // For articles, use Readability
    if (contentType === "article") {
      const article = extractWithReadability(html, url);

      if (!article) {
        // Readability failed, return basic extraction
        return {
          url,
          title: "Untitled",
          domain: extractDomain(url),
          contentType,
          rawText: "",
          cleanText: "",
          extractionConfidence: 0.3,
          extractedAt: new Date(),
        };
      }

      const images = extractImages(html, url);

      return {
        url,
        title: article.title || "Untitled",
        domain: extractDomain(url),
        contentType,
        rawText: article.textContent || "",
        cleanText: article.textContent || "",
        images: images.length > 0 ? images : undefined,
        metadata: {
          author: article.byline || undefined,
          description: article.excerpt || undefined,
        },
        extractionConfidence: article.textContent ? 0.9 : 0.5,
        extractedAt: new Date(),
      };
    }

    // For other content types, return basic extraction
    // TODO: Add specialized extractors for video, social, pdf, etc.
    return {
      url,
      title: "Content from " + extractDomain(url),
      domain: extractDomain(url),
      contentType,
      rawText: html.substring(0, 5000), // First 5000 chars as fallback
      cleanText: html.substring(0, 5000),
      extractionConfidence: 0.5,
      extractedAt: new Date(),
    };
  } catch (error) {
    console.error("Content extraction failed:", error);

    // Return minimal data on error (graceful degradation)
    return {
      url,
      title: "Failed to extract: " + url,
      domain: extractDomain(url),
      contentType: "other",
      rawText: "",
      cleanText: "",
      extractionConfidence: 0,
      extractedAt: new Date(),
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Validates if a URL is accessible
 */
export async function validateUrl(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 5,
      headers: {
        'User-Agent': DEFAULT_OPTIONS.userAgent,
      },
    });
    return response.status < 400;
  } catch {
    // If HEAD fails, try GET (some servers don't support HEAD)
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        maxRedirects: 5,
        headers: {
          'User-Agent': DEFAULT_OPTIONS.userAgent,
        },
        // Only fetch headers, not the full content
        responseType: 'stream',
        maxContentLength: 1024, // Just 1KB to check if accessible
      });
      return response.status < 400;
    } catch {
      return false;
    }
  }
}
