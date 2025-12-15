import { NextRequest, NextResponse } from 'next/server';
import { loadBookmarksServer, saveBookmarksServer } from '@/lib/server-storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookmarks/:id/enrich
 * Queue a bookmark for AI enrichment (returns immediately)
 *
 * Returns jobId for client-side polling
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

    // Get all unique tags from user's bookmarks for consistency
    const existingTags = Array.from(
      new Set(bookmarks.flatMap((b) => b.tags))
    );

    // Queue the enrichment job with backend (returns immediately)
    const queueResponse = await fetch('http://localhost:3002/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: bookmark.url,
        existingTags,
        userTitle: bookmark.title,
        userSummary: bookmark.summary,
        userTags: bookmark.tags,
      }),
    });

    if (!queueResponse.ok) {
      const errorData = await queueResponse.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || 'Failed to queue enrichment';
      throw new Error(errorMessage);
    }

    const queueData = await queueResponse.json();
    const jobId = queueData.jobId;

    if (!jobId) {
      throw new Error('No job ID returned from enrichment service');
    }

    console.log(`[Enrich Route] Job queued: ${jobId} for bookmark: ${id}`);

    // Return jobId immediately for client-side polling
    return NextResponse.json({
      jobId,
      bookmarkId: id,
      status: 'queued',
    });
  } catch (error) {
    console.error('POST /api/bookmarks/:id/enrich error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to enrich bookmark';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bookmarks/:id/enrich
 * Save enrichment results to bookmark (called by frontend after polling completes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const enrichmentData = await request.json();

    // CRITICAL: Reload bookmarks to get FRESH state before saving
    const latestBookmarks = loadBookmarksServer();
    const latestIndex = latestBookmarks.findIndex((b) => b.id === id);

    if (latestIndex === -1) {
      return NextResponse.json(
        { error: 'Bookmark was deleted during enrichment' },
        { status: 404 }
      );
    }

    const currentBookmark = latestBookmarks[latestIndex];
    const enhancedSummary = enrichmentData.analysis?.summary || currentBookmark.summary;

    // Update bookmark with enriched data, merging with current state
    const updatedBookmark = {
      ...currentBookmark,
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

    latestBookmarks[latestIndex] = updatedBookmark;
    await saveBookmarksServer(latestBookmarks);

    console.log(`[Enrich Route] Saved enrichment results for bookmark: ${id}`);
    return NextResponse.json({ data: updatedBookmark });
  } catch (error) {
    console.error('PATCH /api/bookmarks/:id/enrich error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save enrichment';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
