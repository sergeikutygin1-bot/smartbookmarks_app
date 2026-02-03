import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders } from '../../auth-helper';

export const dynamic = 'force-dynamic';

const BACKEND_API = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/v1/bookmarks/bulk`
  : 'http://localhost:3002/api/v1/bookmarks/bulk';

/**
 * POST /api/bookmarks/bulk
 * Proxy to backend API to create multiple bookmarks at once
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (process.env.NODE_ENV === 'development') {
      console.log('[Frontend POST /api/bookmarks/bulk] Request body:', body);
    }

    const response = await fetch(BACKEND_API, {
      method: 'POST',
      headers: await getAuthHeaders(request, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('[Frontend POST /api/bookmarks/bulk] Response status:', response.status);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (process.env.NODE_ENV === 'development') {
        console.error('[Frontend POST /api/bookmarks/bulk] Error:', errorData);
      }
      return NextResponse.json(
        { error: errorData.error || errorData.message || 'Failed to import bookmarks' },
        { status: response.status }
      );
    }

    const data = await response.json();
    if (process.env.NODE_ENV === 'development') {
      console.log('[Frontend POST /api/bookmarks/bulk] Success:', data);
    }
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/bookmarks/bulk error:', error);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import bookmarks' },
      { status: 500 }
    );
  }
}
