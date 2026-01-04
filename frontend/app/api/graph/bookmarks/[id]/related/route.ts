import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_API = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/v1/graph/bookmarks`
  : 'http://localhost:3002/api/v1/graph/bookmarks';

/**
 * GET /api/graph/bookmarks/:id/related
 * Proxy to backend graph API to get related bookmarks, concepts, and entities
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = `${BACKEND_API}/${id}/related`;
    console.log(`[GraphAPI] Fetching metadata from backend: ${url}`);

    const response = await fetch(url, {
      headers: {
        'X-Mock-User-Id': 'dev-user-id-12345', // Mock auth for development
      },
    });

    if (!response.ok) {
      console.error(`[GraphAPI] Backend returned status ${response.status} for bookmark ${id}`);
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Bookmark not found' },
          { status: 404 }
        );
      }
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    const conceptCount = data.data?.concepts?.length || 0;
    const entityCount = data.data?.entities?.length || 0;
    console.log(
      `[GraphAPI] Successfully fetched metadata for ${id}: ${conceptCount} concepts, ${entityCount} entities`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/graph/bookmarks/:id/related error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmark metadata' },
      { status: 500 }
    );
  }
}
