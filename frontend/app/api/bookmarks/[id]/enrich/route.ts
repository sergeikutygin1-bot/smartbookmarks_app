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
      const enrichResponse = await fetch('http://localhost:3002/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: bookmark.url,
          existingTags,
        }),
      });

      if (!enrichResponse.ok) {
        const errorData = await enrichResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Enrichment service failed');
      }

      const enrichmentData = await enrichResponse.json();

      // Format summary with key points as markdown
      let formattedSummary = '';
      if (enrichmentData.analysis?.summary) {
        formattedSummary = enrichmentData.analysis.summary;

        // Add key points as bullet list if they exist
        if (enrichmentData.analysis?.keyPoints?.length > 0) {
          formattedSummary += '\n\n**Key Points:**\n';
          enrichmentData.analysis.keyPoints.forEach((point: string) => {
            formattedSummary += `- ${point}\n`;
          });
        }
      }

      // Update bookmark with enriched data (including embeddings)
      const updatedBookmark = {
        ...bookmark,
        title: enrichmentData.title || bookmark.title,
        domain: enrichmentData.domain || bookmark.domain,
        contentType: enrichmentData.contentType || bookmark.contentType,
        summary: formattedSummary || bookmark.summary,
        tags: enrichmentData.tagging?.tags || bookmark.tags,
        embedding: enrichmentData.embedding || bookmark.embedding,
        embeddedAt: enrichmentData.embeddedAt
          ? new Date(enrichmentData.embeddedAt)
          : bookmark.embeddedAt,
        updatedAt: new Date(),
        processedAt: new Date(),
      };

      // Update in array
      bookmarks[bookmarkIndex] = updatedBookmark;

      // Save to server storage
      saveBookmarksServer(bookmarks);

      return NextResponse.json({ data: updatedBookmark });
    } catch (enrichError) {
      console.error('Enrichment failed:', enrichError);

      // Return partial success - bookmark exists but enrichment failed
      return NextResponse.json(
        {
          error: 'AI enrichment failed',
          message: 'The bookmark was found but AI processing failed. Please try again.',
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
