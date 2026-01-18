import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Helper to extract auth from cookies and create headers for backend
 */
export async function getAuthHeaders(request: NextRequest, additionalHeaders: HeadersInit = {}): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value;
  const refreshToken = cookieStore.get('refreshToken')?.value;

  console.log('[Auth Helper] Cookies found:', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
  });

  const headers: HeadersInit = { ...additionalHeaders };

  // Forward cookies to backend
  if (accessToken || refreshToken) {
    const cookieHeader = [
      accessToken ? `accessToken=${accessToken}` : '',
      refreshToken ? `refreshToken=${refreshToken}` : '',
    ]
      .filter(Boolean)
      .join('; ');

    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
      console.log('[Auth Helper] Forwarding cookies to backend');
    }
  } else {
    console.log('[Auth Helper] No cookies to forward - user not authenticated');
  }

  // Also check for Authorization header (backward compatibility)
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  return headers;
}
