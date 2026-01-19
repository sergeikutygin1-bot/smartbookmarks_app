import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders } from '../../../auth-helper';

export const dynamic = 'force-dynamic';

const BACKEND_API = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/v1/graph/bookmarks`
  : 'http://localhost:3002/api/v1/graph/bookmarks';

/**
 * GET /api/graph/bookmarks/:id/related
 * Catch-all route to handle bookmark graph endpoints
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await context.params;
    
    // Expected: ['id', 'related']
    if (slug.length !== 2 || slug[1] !== 'related') {
      return NextResponse.json(
        { error: 'Invalid endpoint. Use /api/graph/bookmarks/:id/related' },
        { status: 404 }
      );
    }

    const id = slug[0];
    const url = `${BACKEND_API}/${id}/related`;
    console.log(`[GraphAPI] Fetching metadata from backend: ${url}`);

    const response = await fetch(url, {
      headers: await getAuthHeaders(request),
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
    console.error('GET /api/graph/bookmarks/[...slug] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmark metadata' },
      { status: 500 }
    );
  }
}
