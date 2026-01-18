/**
 * Client-side Authentication Token Management
 *
 * @deprecated This file is kept for backward compatibility during migration.
 * Tokens are now stored in httpOnly cookies managed by the backend.
 * You can safely delete this file after migration is complete.
 *
 * New authentication uses:
 * - httpOnly cookies (XSS protection)
 * - SameSite=strict (CSRF protection)
 * - Automatic refresh with credentials: 'include'
 *
 * Tokens are stored in sessionStorage to persist across page reloads
 * while being cleared when the browser tab closes.
 *
 * Security considerations:
 * - sessionStorage is cleared when tab closes (prevents token leakage from forgotten sessions)
 * - Still vulnerable to XSS, but better than losing auth on page reload
 * - For maximum security, use httpOnly cookies (requires backend support)
 * - Consider implementing token rotation and shorter expiration times
 */

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

/**
 * Get storage object (works in browser and server contexts)
 */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch (e) {
    console.warn('[Auth] sessionStorage unavailable, tokens may not persist', e);
    return null;
  }
}

/**
 * Store authentication tokens in sessionStorage
 * @deprecated Tokens are now stored in httpOnly cookies managed by the backend.
 */
export const setTokens = (access: string, refresh: string): void => {
  console.warn('[Auth] setTokens is deprecated. Tokens are now in httpOnly cookies.');
  const storage = getStorage();
  if (storage) {
    storage.setItem(ACCESS_TOKEN_KEY, access);
    storage.setItem(REFRESH_TOKEN_KEY, refresh);
    console.log('[Auth] Tokens stored in sessionStorage (deprecated)');
  }
};

/**
 * Get the current access token from sessionStorage
 * @deprecated Tokens are now in httpOnly cookies. Use cookie-based auth.
 */
export const getAccessToken = (): string | null => {
  console.warn('[Auth] getAccessToken is deprecated. Use cookie-based auth.');
  const storage = getStorage();
  if (!storage) return null;

  const token = storage.getItem(ACCESS_TOKEN_KEY);
  return token;
};

/**
 * Get the current refresh token from sessionStorage
 * @deprecated Tokens are now in httpOnly cookies. Use cookie-based auth.
 */
export const getRefreshToken = (): string | null => {
  console.warn('[Auth] getRefreshToken is deprecated. Use cookie-based auth.');
  const storage = getStorage();
  if (!storage) return null;

  const token = storage.getItem(REFRESH_TOKEN_KEY);
  return token;
};

/**
 * Clear all tokens (logout)
 * @deprecated Tokens are now in httpOnly cookies. Use authApi.logout() instead.
 */
export const clearTokens = (): void => {
  console.warn('[Auth] clearTokens is deprecated. Use authApi.logout() instead.');
  const storage = getStorage();
  if (storage) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    console.log('[Auth] Tokens cleared from sessionStorage (deprecated)');
  }
};

/**
 * Check if user is authenticated (has access token)
 * @deprecated This checks sessionStorage. Use isAuthenticatedViaCookie() for cookie-based auth.
 */
export const isAuthenticated = (): boolean => {
  console.warn('[Auth] isAuthenticated is deprecated. Use isAuthenticatedViaCookie().');
  return getAccessToken() !== null;
};

/**
 * Check if user is authenticated via cookie
 * Makes a request to /api/v1/auth/me to verify cookie-based authentication
 */
export const isAuthenticatedViaCookie = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/me`, {
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
};
