/**
 * API client for Smart Bookmarks backend
 * Handles authentication and bookmark operations
 */

import type { AuthState, CreateBookmarkRequest, Bookmark } from '../types';

const API_BASE_URL = 'http://localhost:3002';

/**
 * Get stored authentication tokens from chrome.storage
 */
export async function getAuthState(): Promise<AuthState> {
  // TODO: Implement chrome.storage.local.get
  return {
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false
  };
}

/**
 * Save authentication tokens to chrome.storage
 */
export async function saveAuthState(authState: AuthState): Promise<void> {
  // TODO: Implement chrome.storage.local.set
  console.log('Saving auth state:', authState);
}

/**
 * Login to Smart Bookmarks
 */
export async function login(email: string, password: string): Promise<AuthState> {
  // TODO: Implement API call to /api/v1/auth/login
  throw new Error('Not implemented');
}

/**
 * Logout from Smart Bookmarks
 */
export async function logout(): Promise<void> {
  // TODO: Implement token clearing
  console.log('Logging out');
}

/**
 * Create a new bookmark
 */
export async function createBookmark(data: CreateBookmarkRequest): Promise<Bookmark> {
  // TODO: Implement API call to /api/v1/bookmarks
  throw new Error('Not implemented');
}

/**
 * Make authenticated API request
 */
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const authState = await getAuthState();

  if (!authState.accessToken) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authState.accessToken}`,
    ...options.headers
  };

  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers
  });
}
