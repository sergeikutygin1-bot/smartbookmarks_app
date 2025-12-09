import axios from "axios";
import { JSDOM } from "jsdom";
import type { ExtractedContent } from "../types/schemas";

/**
 * Social Media Content Extractor
 *
 * Extracts post content from social media platforms:
 * - X/Twitter: Uses oEmbed API (no auth required)
 * - Instagram: Uses meta tag scraping (oEmbed requires auth)
 * - LinkedIn: Uses meta tag scraping
 */

/**
 * Detects if URL is from X/Twitter
 */
export function isTwitterUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  return (
    urlLower.includes("twitter.com") ||
    urlLower.includes("x.com")
  );
}

/**
 * Detects if URL is from Instagram
 */
export function isInstagramUrl(url: string): boolean {
  return url.toLowerCase().includes("instagram.com");
}

/**
 * Detects if URL is from LinkedIn
 */
export function isLinkedInUrl(url: string): boolean {
  return url.toLowerCase().includes("linkedin.com");
}

/**
 * Extracts content from X/Twitter post using meta tags
 */
async function extractTwitterContent(url: string): Promise<ExtractedContent> {
  try {
    console.log(`Extracting Twitter/X post: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // Extract metadata from Open Graph and Twitter Card tags
    const getMetaContent = (property: string): string => {
      const meta = document.querySelector(
        `meta[property="${property}"], meta[name="${property}"]`
      );
      return meta?.getAttribute("content") || "";
    };

    const title = getMetaContent("og:title") || getMetaContent("twitter:title") || "X Post";
    const description =
      getMetaContent("og:description") ||
      getMetaContent("twitter:description") ||
      getMetaContent("description") ||
      "";
    const image = getMetaContent("og:image") || getMetaContent("twitter:image");
    const author = getMetaContent("twitter:creator") || "";

    console.log(`Twitter content extracted: ${description.length} characters`);

    return {
      url,
      title: title || `Post by ${author || "Unknown"}`,
      domain: "x.com",
      contentType: "social",
      rawText: description,
      cleanText: description,
      metadata: {
        author: author || undefined,
        platform: "twitter",
        image: image || undefined,
      },
      extractionConfidence: description.length > 10 ? 0.75 : 0.4,
      extractedAt: new Date(),
    };
  } catch (error) {
    console.error("Twitter extraction failed:", error);

    return {
      url,
      title: "Twitter/X Post",
      domain: "x.com",
      contentType: "social",
      rawText: "",
      cleanText: "",
      metadata: {
        platform: "twitter",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      extractionConfidence: 0.2,
      extractedAt: new Date(),
    };
  }
}

/**
 * Extracts content from Instagram post using meta tags
 */
async function extractInstagramContent(
  url: string
): Promise<ExtractedContent> {
  try {
    console.log(`Extracting Instagram post: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // Extract metadata from Open Graph tags
    const getMetaContent = (property: string): string => {
      const meta = document.querySelector(
        `meta[property="${property}"], meta[name="${property}"]`
      );
      return meta?.getAttribute("content") || "";
    };

    const title = getMetaContent("og:title") || "Instagram Post";
    const description =
      getMetaContent("og:description") || getMetaContent("description") || "";
    const image = getMetaContent("og:image");

    console.log(`Instagram content extracted: ${description.length} characters`);

    return {
      url,
      title,
      domain: "instagram.com",
      contentType: "social",
      rawText: description,
      cleanText: description,
      metadata: {
        platform: "instagram",
        image: image || undefined,
      },
      extractionConfidence: description.length > 10 ? 0.7 : 0.4,
      extractedAt: new Date(),
    };
  } catch (error) {
    console.error("Instagram extraction failed:", error);

    return {
      url,
      title: "Instagram Post",
      domain: "instagram.com",
      contentType: "social",
      rawText: "",
      cleanText: "",
      metadata: {
        platform: "instagram",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      extractionConfidence: 0.2,
      extractedAt: new Date(),
    };
  }
}

/**
 * Extracts content from LinkedIn post using meta tags
 */
async function extractLinkedInContent(url: string): Promise<ExtractedContent> {
  try {
    console.log(`Extracting LinkedIn post: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // Extract metadata from meta tags
    const getMetaContent = (property: string): string => {
      const meta = document.querySelector(
        `meta[property="${property}"], meta[name="${property}"]`
      );
      return meta?.getAttribute("content") || "";
    };

    const title = getMetaContent("og:title") || "LinkedIn Post";
    const description =
      getMetaContent("og:description") || getMetaContent("description") || "";
    const image = getMetaContent("og:image");

    console.log(`LinkedIn content extracted: ${description.length} characters`);

    return {
      url,
      title,
      domain: "linkedin.com",
      contentType: "social",
      rawText: description,
      cleanText: description,
      metadata: {
        platform: "linkedin",
        image: image || undefined,
      },
      extractionConfidence: description.length > 10 ? 0.7 : 0.4,
      extractedAt: new Date(),
    };
  } catch (error) {
    console.error("LinkedIn extraction failed:", error);

    return {
      url,
      title: "LinkedIn Post",
      domain: "linkedin.com",
      contentType: "social",
      rawText: "",
      cleanText: "",
      metadata: {
        platform: "linkedin",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      extractionConfidence: 0.2,
      extractedAt: new Date(),
    };
  }
}

/**
 * Main social media extraction function
 * Routes to appropriate extractor based on platform
 */
export async function extractSocialContent(
  url: string
): Promise<ExtractedContent> {
  if (isTwitterUrl(url)) {
    return extractTwitterContent(url);
  } else if (isInstagramUrl(url)) {
    return extractInstagramContent(url);
  } else if (isLinkedInUrl(url)) {
    return extractLinkedInContent(url);
  } else {
    throw new Error("Unsupported social media platform");
  }
}
