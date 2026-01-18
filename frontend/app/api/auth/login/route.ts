import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const BACKEND_API = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/v1/auth/login`
  : 'http://localhost:3002/api/v1/auth/login';

/**
 * POST /api/auth/login
 * Proxy to backend auth API and forward cookies to frontend
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(BACKEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Login failed' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract cookies from backend response
    // NOTE: response.headers.getSetCookie() is the correct way to get multiple Set-Cookie headers
    const setCookieHeaders = response.headers.getSetCookie ?
      response.headers.getSetCookie() :
      (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);

    console.log('[Login Proxy] Set-Cookie headers received:', setCookieHeaders.length);

    if (setCookieHeaders.length > 0) {
      // Parse and set cookies on frontend domain
      const cookieStore = await cookies();

      for (const cookieString of setCookieHeaders) {
        const [nameValue, ...attrs] = cookieString.split(';');
        const [name, value] = nameValue.trim().split('=');

        if (name && value) {
          console.log('[Login Proxy] Setting cookie:', name);
          // Parse cookie attributes
          const isProduction = process.env.NODE_ENV === 'production';
          const maxAge = attrs.find(a => a.trim().startsWith('Max-Age='))
            ?.split('=')[1];

          cookieStore.set(name, value, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge: maxAge ? parseInt(maxAge) : undefined,
            path: '/',
          });
        }
      }
    } else {
      console.warn('[Login Proxy] No Set-Cookie headers received from backend!');
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
