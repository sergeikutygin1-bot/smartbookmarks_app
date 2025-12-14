import { NextRequest, NextResponse } from 'next/server';
import { loadBookmarksServer, saveBookmarksServer } from '@/lib/server-storage';

export const dynamic = 'force-dynamic';

// This would typically timeout for long AI processing, so we increase it
export const maxDuration = 60; // 60 seconds

/**
 * POST /api/bookmarks/:id/enrich
 * Enrich a bookmark with AI-generated metadata
 *
 * This endpoint calls the enrichment agent to:
 * 1. Extract content from the URL
 * 2. Generate AI summary and key points
 * 3. Suggest relevant tags
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bookmarks = loadBookmarksServer();
    const bookmarkIndex = bookmarks.findIndex((b) => b.id === id);

    if (bookmarkIndex === -1) {
      return NextResponse.json(
        { error: 'Bookmark not found' },
        { status: 404 }
      );
    }

    const bookmark = bookmarks[bookmarkIndex];

    // Call enrichment agent service
    try {
      // Get all unique tags from user's bookmarks for consistency
      const existingTags = Array.from(
        new Set(bookmarks.flatMap((b) => b.tags))
      );

      // Call enrichment agent via HTTP (running on port 3002)
      // Pass user context for merge & enhance strategy
      const enrichResponse = await fetch('http://localhost:3002/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: bookmark.url,
          existingTags,
          // User context - AI will merge/enhance these if present
          userTitle: bookmark.title,
          userSummary: bookmark.summary,
          userTags: bookmark.tags,
        }),
      });

      if (!enrichResponse.ok) {
        const errorData = await enrichResponse.json().catch(() => ({}));
        // Pass through the specific error message from the backend
        const errorMessage = errorData.error || errorData.message || 'Enrichment service failed';
        throw new Error(errorMessage);
      }

      const enrichmentData = await enrichResponse.json();

      // Analysis now returns { title, summary, tags } (no keyPoints)
      // Summary is already comprehensive (300-500 words)
      const enhancedSummary = enrichmentData.analysis?.summary || bookmark.summary;

      // CRITICAL: Reload bookmarks to get FRESH state before saving
      // This prevents race conditions where concurrent enrichments overwrite each other
      // Each request now merges its enrichment into the CURRENT state, not stale t=0 state
      const latestBookmarks = loadBookmarksServer();
      const latestIndex = latestBookmarks.findIndex((b) => b.id === id);

      if (latestIndex === -1) {
        // Bookmark was deleted while processing - rare edge case
        throw new Error('Bookmark was deleted during enrichment');
      }

      // Get the CURRENT state of this bookmark (may have been updated by user edits)
      const currentBookmark = latestBookmarks[latestIndex];

      // Update bookmark with enriched data, merging with current state
      // Uses improved title and comprehensive summary from AI analysis
      const updatedBookmark = {
        ...currentBookmark, // Start with CURRENT state, not initial state
        title: enrichmentData.analysis?.title || enrichmentData.title || currentBookmark.title,
        domain: enrichmentData.domain || currentBookmark.domain,
        contentType: enrichmentData.contentType || currentBookmark.contentType,
        summary: enhancedSummary,
        tags: enrichmentData.tagging?.tags || currentBookmark.tags,
        embedding: enrichmentData.embedding || currentBookmark.embedding,
        embeddedAt: enrichmentData.embeddedAt
          ? new Date(enrichmentData.embeddedAt)
          : currentBookmark.embeddedAt,
        updatedAt: new Date(),
        processedAt: new Date(),
      };

      // Update in the FRESH array
      latestBookmarks[latestIndex] = updatedBookmark;

      // Save to server storage (now async with write queue)
      await saveBookmarksServer(latestBookmarks);

      return NextResponse.json({ data: updatedBookmark });
    } catch (enrichError) {
      console.error('Enrichment failed:', enrichError);

      // Extract the actual error message from the backend
      const errorMessage = enrichError instanceof Error
        ? enrichError.message
        : 'The bookmark was found but AI processing failed. Please try again.';

      // Return partial success - bookmark exists but enrichment failed
      return NextResponse.json(
        {
          error: errorMessage, // Pass through the actual error message
          message: errorMessage,
          data: bookmark,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('POST /api/bookmarks/:id/enrich error:', error);
    return NextResponse.json(
      { error: 'Failed to enrich bookmark' },
      { status: 500 }
    );
  }
}
