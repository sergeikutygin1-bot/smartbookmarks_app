import { Bookmark } from '../services/bookmarkStorage';

/**
 * Transform enrichment result to flat bookmark update format
 * Maps nested enrichment structure to iOS expectations
 */
export function transformEnrichmentToBookmark(enrichmentResult: any): Partial<Bookmark> {
  // Extract domain
  const domain = enrichmentResult.domain || extractDomainFromUrl(enrichmentResult.url);

  // Merge tags from analysis and tagging
  const analysisTags = enrichmentResult.analysis?.tags || [];
  const taggingTags = enrichmentResult.tagging?.tags || [];
  const allTags = [...new Set([...analysisTags, ...taggingTags])]; // Deduplicate

  return {
    title: enrichmentResult.analysis?.title || enrichmentResult.title || 'Untitled',
    domain,
    summary: enrichmentResult.analysis?.summary,
    contentType: enrichmentResult.contentType || 'other',
    tags: allTags,
    embedding: enrichmentResult.embedding,
    embeddedAt: enrichmentResult.embeddedAt ? new Date(enrichmentResult.embeddedAt) : undefined,
    processedAt: enrichmentResult.enrichedAt ? new Date(enrichmentResult.enrichedAt) : new Date(),
  };
}

/**
 * Extract domain from URL string
 */
function extractDomainFromUrl(url: string): string {
  try {
    if (!url) return 'example.com';
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'example.com';
  }
}

/**
 * Transform bookmark to API response format
 * Ensures dates are ISO strings for JSON serialization
 */
export function transformBookmarkForResponse(bookmark: Bookmark): any {
  return {
    ...bookmark,
    createdAt: bookmark.createdAt.toISOString(),
    updatedAt: bookmark.updatedAt.toISOString(),
    processedAt: bookmark.processedAt?.toISOString(),
    embeddedAt: bookmark.embeddedAt?.toISOString(),
  };
}
