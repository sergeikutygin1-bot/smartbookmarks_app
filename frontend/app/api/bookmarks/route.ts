import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_API = 'http://localhost:3002/api/bookmarks';

/**
 * GET /api/bookmarks
 * Proxy to backend API with optional filtering
 * Query params: q (search), type (contentType), source (domain), dateFrom, dateTo
 */
export async function GET(request: NextRequest) {
  try {
    // Forward query parameters to backend
    const searchParams = request.nextUrl.searchParams;
    const backendUrl = new URL(BACKEND_API);
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });

    const response = await fetch(backendUrl.toString());

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
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
 * Proxy to backend API to create a new bookmark
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const response = await fetch(BACKEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/bookmarks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create bookmark' },
      { status: 500 }
    );
  }
}
