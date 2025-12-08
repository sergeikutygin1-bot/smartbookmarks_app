import { NextRequest, NextResponse } from 'next/server';
import { loadBookmarksServer, saveBookmarksServer } from '@/lib/server-storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookmarks
 * List all bookmarks with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const bookmarks = loadBookmarksServer();

    // TODO: Add filtering support (query params: q, type, tags, status)
    // For now, just return all bookmarks sorted by createdAt desc
    const sortedBookmarks = bookmarks.sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime()
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
    const body = await request.json();
    const { url, title } = body;

    // Validation
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Extract domain from URL
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace('www.', '');

    // Create new bookmark
    const newBookmark = {
      id: Date.now().toString(),
      url,
      title: title || url,
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

    // Save to server storage
    saveBookmarksServer(updatedBookmarks);

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
