import { NextRequest, NextResponse } from 'next/server';
import { loadBookmarksServer, saveBookmarksServer } from '@/lib/server-storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookmarks/:id
 * Get a single bookmark by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bookmarks = loadBookmarksServer();
    const bookmark = bookmarks.find((b) => b.id === id);

    if (!bookmark) {
      return NextResponse.json(
        { error: 'Bookmark not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: bookmark });
  } catch (error) {
    console.error('GET /api/bookmarks/:id error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmark' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bookmarks/:id
 * Update a bookmark
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const bookmarks = loadBookmarksServer();
    const bookmarkIndex = bookmarks.findIndex((b) => b.id === id);

    if (bookmarkIndex === -1) {
      return NextResponse.json(
        { error: 'Bookmark not found' },
        { status: 404 }
      );
    }

    // Update bookmark with new data
    const updatedBookmark = {
      ...bookmarks[bookmarkIndex],
      ...body,
      id, // Prevent ID from being changed
      updatedAt: new Date(),
    };

    // Update in array
    bookmarks[bookmarkIndex] = updatedBookmark;

    // Save to server storage
    saveBookmarksServer(bookmarks);

    return NextResponse.json({ data: updatedBookmark });
  } catch (error) {
    console.error('PATCH /api/bookmarks/:id error:', error);
    return NextResponse.json(
      { error: 'Failed to update bookmark' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookmarks/:id
 * Delete a bookmark
 */
export async function DELETE(
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

    // Remove bookmark
    const updatedBookmarks = bookmarks.filter((b) => b.id !== id);

    // Save to server storage
    saveBookmarksServer(updatedBookmarks);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/bookmarks/:id error:', error);
    return NextResponse.json(
      { error: 'Failed to delete bookmark' },
      { status: 500 }
    );
  }
}
