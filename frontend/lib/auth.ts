/**
 * Client-side Authentication Token Management
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
 */
export const setTokens = (access: string, refresh: string): void => {
  const storage = getStorage();
  if (storage) {
    storage.setItem(ACCESS_TOKEN_KEY, access);
    storage.setItem(REFRESH_TOKEN_KEY, refresh);
    console.log('[Auth] Tokens stored in sessionStorage');
  }
};

/**
 * Get the current access token from sessionStorage
 */
export const getAccessToken = (): string | null => {
  const storage = getStorage();
  if (!storage) return null;

  const token = storage.getItem(ACCESS_TOKEN_KEY);
  return token;
};

/**
 * Get the current refresh token from sessionStorage
 */
export const getRefreshToken = (): string | null => {
  const storage = getStorage();
  if (!storage) return null;

  const token = storage.getItem(REFRESH_TOKEN_KEY);
  return token;
};

/**
 * Clear all tokens (logout)
 */
export const clearTokens = (): void => {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    console.log('[Auth] Tokens cleared from sessionStorage');
  }
};

/**
 * Check if user is authenticated (has access token)
 */
export const isAuthenticated = (): boolean => {
  return getAccessToken() !== null;
};
