import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

// In-memory cache for CSRF tokens (per session)
const csrfTokenCache = new Map<string, string>();

/**
 * Fetch CSRF token from backend for authenticated session
 */
async function fetchCsrfToken(accessToken: string): Promise<string | null> {
  try {
    // Use BACKEND_URL for server-side requests (Docker internal network)
    // Falls back to localhost for local development
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';
    const response = await fetch(`${backendUrl}/api/v1/auth/csrf-token`, {
      headers: {
        'Cookie': `accessToken=${accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.csrfToken;
    }
  } catch (error) {
    console.error('[Auth Helper] Failed to fetch CSRF token:', error);
  }
  return null;
}

/**
 * Get CSRF token for current session (cached)
 */
async function getCsrfToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;

  // Check cache
  if (csrfTokenCache.has(accessToken)) {
    return csrfTokenCache.get(accessToken)!;
  }

  // Fetch new token
  const token = await fetchCsrfToken(accessToken);
  if (token) {
    csrfTokenCache.set(accessToken, token);
  }
  return token;
}

/**
 * Clear CSRF token cache (call on logout)
 */
export function clearCsrfTokenCache(accessToken: string): void {
  csrfTokenCache.delete(accessToken);
}

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

  // Add CSRF token for state-changing requests
  const method = request.method.toUpperCase();
  const needsCsrf = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  if (needsCsrf && accessToken && !authHeader) {
    // Only add CSRF for cookie-based auth (not Bearer token)
    const csrfToken = await getCsrfToken(accessToken);
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
      console.log('[Auth Helper] Added CSRF token to request');
    }
  }

  return headers;
}
