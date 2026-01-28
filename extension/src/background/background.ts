/**
 * Background service worker for Smart Bookmarks extension
 * Handles authentication state and message routing
 */

import type {
  ExtensionMessage,
  MessageResponse,
  StoredAuth,
  AuthState,
  CreateBookmarkRequest,
  Bookmark
} from '../types';

console.log('Smart Bookmarks background service worker loaded');

const API_BASE_URL = 'http://localhost:3002';
const FRONTEND_URL = 'http://localhost:3000';
const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes

// ============================================================================
// Token Storage Helpers
// ============================================================================

/**
 * Get authentication state from storage
 */
async function getAuthState(): Promise<AuthState> {
  try {
    const result = await chrome.storage.local.get('auth');
    const storedAuth = result.auth as StoredAuth | undefined;

    if (!storedAuth || !storedAuth.accessToken || !storedAuth.refreshToken) {
      return {
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      };
    }

    // Check if token is expired
    if (storedAuth.expiresAt < Date.now()) {
      // Token expired, clear it
      await clearAuthState();
      return {
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      };
    }

    return {
      accessToken: storedAuth.accessToken,
      refreshToken: storedAuth.refreshToken,
      isAuthenticated: true,
    };
  } catch (error) {
    console.error('[Background] Error getting auth state:', error);
    return {
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    };
  }
}

/**
 * Set authentication state in storage
 */
async function setAuthState(accessToken: string, refreshToken: string): Promise<void> {
  const storedAuth: StoredAuth = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + ACCESS_TOKEN_EXPIRY,
  };

  await chrome.storage.local.set({ auth: storedAuth });
  console.log('[Background] Auth state saved');
}

/**
 * Clear authentication state from storage
 */
async function clearAuthState(): Promise<void> {
  await chrome.storage.local.remove('auth');
  console.log('[Background] Auth state cleared');
}

// ============================================================================
// API Helpers
// ============================================================================

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
    ...options.headers,
  };

  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });
}

/**
 * Save bookmark to API
 */
async function saveBookmark(data: CreateBookmarkRequest): Promise<Bookmark> {
  const response = await fetchWithAuth('/api/v1/bookmarks', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save bookmark');
  }

  return response.json();
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle messages from popup and content scripts
 */
export function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
): boolean {
  console.log('[Background] Received message:', message);

  // Handle different message types
  switch (message.type) {
    case 'SMART_BOOKMARK_AUTH':
      // Receive tokens from web app auth page
      (async () => {
        try {
          await setAuthState(message.payload.accessToken, message.payload.refreshToken);
          sendResponse({
            success: true,
            data: { isAuthenticated: true },
          });
        } catch (error) {
          console.error('[Background] Error storing auth:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to store authentication',
          });
        }
      })();
      return true; // Async response

    case 'GET_AUTH_STATE':
      // Return current auth state
      (async () => {
        try {
          const authState = await getAuthState();
          sendResponse({
            success: true,
            data: authState,
          });
        } catch (error) {
          console.error('[Background] Error getting auth state:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get auth state',
          });
        }
      })();
      return true; // Async response

    case 'LOGIN':
      // Open extension auth page in new tab
      (async () => {
        try {
          await chrome.tabs.create({
            url: `${FRONTEND_URL}/extension-auth`,
          });
          sendResponse({
            success: true,
            data: { message: 'Opening authentication page...' },
          });
        } catch (error) {
          console.error('[Background] Error opening auth page:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to open auth page',
          });
        }
      })();
      return true; // Async response

    case 'LOGOUT':
      // Clear stored tokens
      (async () => {
        try {
          await clearAuthState();
          sendResponse({
            success: true,
            data: { isAuthenticated: false },
          });
        } catch (error) {
          console.error('[Background] Error logging out:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to logout',
          });
        }
      })();
      return true; // Async response

    case 'SAVE_BOOKMARK':
      // Save bookmark via API
      (async () => {
        try {
          // Check authentication first
          const authState = await getAuthState();
          if (!authState.isAuthenticated) {
            sendResponse({
              success: false,
              error: 'Not authenticated. Please login first.',
            });
            return;
          }

          // Save bookmark
          const bookmark = await saveBookmark(message.payload);
          sendResponse({
            success: true,
            data: bookmark,
          });
        } catch (error) {
          console.error('[Background] Error saving bookmark:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to save bookmark';
          sendResponse({
            success: false,
            error: `Failed to save bookmark: ${errorMessage.replace('Error: ', '')}`,
          });
        }
      })();
      return true; // Async response

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
}

// ============================================================================
// Message Listener Setup
// ============================================================================

// Message listener for communication with popup and content scripts
chrome.runtime.onMessage.addListener(handleMessage);
