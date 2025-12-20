import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_API = 'http://localhost:3002/api/bookmarks';
const ENRICHMENT_API = 'http://localhost:3002/enrich';

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

    // Get bookmark from backend
    const bookmarkResponse = await fetch(`${BACKEND_API}/${id}`);

    if (!bookmarkResponse.ok) {
      if (bookmarkResponse.status === 404) {
        return NextResponse.json(
          { error: 'Bookmark not found' },
          { status: 404 }
        );
      }
      throw new Error(`Backend returned ${bookmarkResponse.status}`);
    }

    const bookmarkData = await bookmarkResponse.json();
    const bookmark = bookmarkData.data;

    // Get all bookmarks to extract existing tags
    const allBookmarksResponse = await fetch(BACKEND_API);
    if (!allBookmarksResponse.ok) {
      throw new Error('Failed to fetch bookmarks for tag consistency');
    }
    const allBookmarksData = await allBookmarksResponse.json();
    const allBookmarks = allBookmarksData.data || [];

    const existingTags = Array.from(
      new Set(allBookmarks.flatMap((b: any) => b.tags || []))
    );

    // Queue the enrichment job with backend (returns immediately)
    const queueResponse = await fetch(ENRICHMENT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mock-User-Id': 'dev-user-id-12345', // Mock auth for development
      },
      body: JSON.stringify({
        url: bookmark.url,
        existingTags,
        userTitle: bookmark.title,
        userSummary: bookmark.summary,
        userTags: bookmark.tags,
        bookmarkId: id, // Add bookmarkId so worker can save results
        userId: 'dev-user-id-12345', // Add userId for database operations
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

    // Get current bookmark state from backend
    const bookmarkResponse = await fetch(`${BACKEND_API}/${id}`);

    if (!bookmarkResponse.ok) {
      if (bookmarkResponse.status === 404) {
        return NextResponse.json(
          { error: 'Bookmark was deleted during enrichment' },
          { status: 404 }
        );
      }
      throw new Error(`Backend returned ${bookmarkResponse.status}`);
    }

    const bookmarkData = await bookmarkResponse.json();
    const currentBookmark = bookmarkData.data;

    const enhancedSummary = enrichmentData.analysis?.summary || currentBookmark.summary;

    // Prepare update payload with enriched data
    // Note: Worker already saved tags to database via proper many-to-many relations
    // So we exclude tags from this update to avoid Prisma validation errors
    const updatePayload = {
      title: enrichmentData.analysis?.title || enrichmentData.title || currentBookmark.title,
      url: currentBookmark.url,
      domain: enrichmentData.domain || currentBookmark.domain,
      contentType: enrichmentData.contentType || currentBookmark.contentType,
      summary: enhancedSummary,
      // tags: excluded - already saved by worker with proper relations
      embedding: enrichmentData.embedding || currentBookmark.embedding,
      embeddedAt: enrichmentData.embeddedAt
        ? new Date(enrichmentData.embeddedAt).toISOString()
        : currentBookmark.embeddedAt,
      processedAt: new Date().toISOString(),
      status: 'completed',
    };

    // Update bookmark via backend API
    const updateResponse = await fetch(`${BACKEND_API}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Mock-User-Id': 'dev-user-id-12345', // Mock auth for development
      },
      body: JSON.stringify(updatePayload),
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update bookmark: ${updateResponse.status}`);
    }

    const updatedData = await updateResponse.json();

    console.log(`[Enrich Route] Saved enrichment results for bookmark: ${id}`);
    return NextResponse.json(updatedData);
  } catch (error) {
    console.error('PATCH /api/bookmarks/:id/enrich error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save enrichment';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
