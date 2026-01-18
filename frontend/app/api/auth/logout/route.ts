import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthHeaders } from '../../auth-helper';

export const dynamic = 'force-dynamic';

const BACKEND_API = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/v1/auth/logout`
  : 'http://localhost:3002/api/v1/auth/logout';

/**
 * POST /api/auth/logout
 * Proxy to backend auth API and clear frontend cookies
 */
export async function POST(request: NextRequest) {
  try {
    const response = await fetch(BACKEND_API, {
      method: 'POST',
      headers: await getAuthHeaders(request),
    });

    // Clear frontend cookies regardless of backend response
    const cookieStore = await cookies();
    cookieStore.delete('accessToken');
    cookieStore.delete('refreshToken');

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Logout failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('POST /api/auth/logout error:', error);

    // Clear cookies even on error
    const cookieStore = await cookies();
    cookieStore.delete('accessToken');
    cookieStore.delete('refreshToken');

    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
