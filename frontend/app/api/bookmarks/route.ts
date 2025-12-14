import { NextRequest, NextResponse } from 'next/server';
import { loadBookmarksServer, saveBookmarksServer } from '@/lib/server-storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookmarks
 * List all bookmarks with optional filtering
 * Query params: q (search), type (contentType), source (domain), dateFrom, dateTo
 */
export async function GET(request: NextRequest) {
  try {
    const bookmarks = loadBookmarksServer();
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const searchQuery = searchParams.get('q')?.toLowerCase().trim();
    const typeFilter = searchParams.get('type');
    const sourceFilter = searchParams.get('source')?.toLowerCase();
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Filter bookmarks
    let filteredBookmarks = bookmarks;

    // Search filter (word similarity in title and tags)
    if (searchQuery) {
      const searchWords = searchQuery.split(/\s+/).filter(word => word.length > 0);
      filteredBookmarks = filteredBookmarks.filter(bookmark => {
        const titleLower = bookmark.title.toLowerCase();
        const tagsLower = bookmark.tags.map(tag => tag.toLowerCase());

        // Check if any search word matches title or any tag
        return searchWords.some(word =>
          titleLower.includes(word) ||
          tagsLower.some(tag => tag.includes(word))
        );
      });
    }

    // Content type filter
    if (typeFilter) {
      filteredBookmarks = filteredBookmarks.filter(
        bookmark => bookmark.contentType === typeFilter
      );
    }

    // Source/domain filter
    if (sourceFilter) {
      filteredBookmarks = filteredBookmarks.filter(
        bookmark => bookmark.domain.toLowerCase().includes(sourceFilter)
      );
    }

    // Date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (!isNaN(fromDate.getTime())) {
        filteredBookmarks = filteredBookmarks.filter(
          bookmark => bookmark.createdAt >= fromDate
        );
      }
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      if (!isNaN(toDate.getTime())) {
        // Set to end of day
        toDate.setHours(23, 59, 59, 999);
        filteredBookmarks = filteredBookmarks.filter(
          bookmark => bookmark.createdAt <= toDate
        );
      }
    }

    // Sort by updatedAt desc (most recently edited first)
    const sortedBookmarks = filteredBookmarks.sort((a, b) =>
      b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    return NextResponse.json({
      data: sortedBookmarks,
      total: sortedBookmarks.length,
    });
  } catch (error) {
    console.error('GET /api/bookmarks error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmarks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bookmarks
 * Create a new bookmark
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, title } = body;

    // Extract domain from URL if provided
    let domain = '';
    if (url) {
      try {
        const parsedUrl = new URL(url);
        domain = parsedUrl.hostname.replace('www.', '');
      } catch {
        // Invalid URL format - allow it but set domain to empty
        domain = '';
      }
    }

    // Create new bookmark
    const newBookmark = {
      id: Date.now().toString(),
      url: url || '',
      title: title || (url ? url : 'Untitled bookmark'),
      domain,
      contentType: 'other' as const,
      tags: [],
      summary: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null,
    };

    // Load existing bookmarks
    const bookmarks = loadBookmarksServer();

    // Add new bookmark at the beginning
    const updatedBookmarks = [newBookmark, ...bookmarks];

    // Save to server storage (async with write queue)
    await saveBookmarksServer(updatedBookmarks);

    return NextResponse.json(
      { data: newBookmark },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/bookmarks error:', error);
    return NextResponse.json(
      { error: 'Failed to create bookmark' },
      { status: 500 }
    );
  }
}
