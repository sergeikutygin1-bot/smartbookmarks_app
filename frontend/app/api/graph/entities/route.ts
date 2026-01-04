import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_API = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/v1/graph/entities`
  : 'http://localhost:3002/api/v1/graph/entities';

/**
 * GET /api/graph/entities
 * Proxy to backend graph API to get all entities
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '100';
    const type = searchParams.get('type');

    let url = `${BACKEND_API}?limit=${limit}`;
    if (type) {
      url += `&type=${type}`;
    }

    const response = await fetch(url, {
      headers: {
        'X-Mock-User-Id': 'dev-user-id-12345', // Mock auth for development
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/graph/entities error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entities' },
      { status: 500 }
    );
  }
}
