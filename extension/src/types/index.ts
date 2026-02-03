/**
 * Shared TypeScript types for Smart Bookmarks extension
 */

/**
 * Authentication state stored in chrome.storage
 */
export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

/**
 * Bookmark creation request
 */
export interface CreateBookmarkRequest {
  url: string;
  title?: string;
  notes?: string;
}

/**
 * Bookmark response from API
 */
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

/**
 * API error response
 */
export interface APIError {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * Stored authentication with expiry
 */
export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // timestamp
}

/**
 * Messages sent between extension components
 */
export type ExtensionMessage =
  | { type: 'SAVE_BOOKMARK'; payload: CreateBookmarkRequest }
  | { type: 'GET_AUTH_STATE' }
  | { type: 'LOGIN' }
  | { type: 'LOGOUT' }
  | { type: 'SMART_BOOKMARK_AUTH'; payload: { accessToken: string; refreshToken: string } };

/**
 * Response from extension message handlers
 */
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
