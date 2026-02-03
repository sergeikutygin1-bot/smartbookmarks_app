/**
 * API client for Smart Bookmarks backend
 * Communicates with background service worker via chrome.runtime.sendMessage
 */

import type {
  AuthState,
  Bookmark,
  ExtensionMessage,
  MessageResponse,
} from '../types';

/**
 * Generic helper to send messages to background worker and return promises
 */
function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      // Check for chrome.runtime.lastError (extension errors)
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Check if response indicates failure
      if (!response.success) {
        reject(new Error(response.error || 'Unknown error'));
        return;
      }

      // Success - resolve with data
      resolve(response.data!);
    });
  });
}

/**
 * Get authentication state from background worker
 */
export async function getAuthState(): Promise<AuthState> {
  return sendMessage<AuthState>({ type: 'GET_AUTH_STATE' });
}

/**
 * Login to Smart Bookmarks - opens auth page in new tab
 */
export async function login(): Promise<void> {
  await sendMessage<{ message: string }>({ type: 'LOGIN' });
}

/**
 * Logout from Smart Bookmarks - clears stored tokens
 */
export async function logout(): Promise<void> {
  await sendMessage<{ isAuthenticated: boolean }>({ type: 'LOGOUT' });
}

/**
 * Create a new bookmark via background worker
 */
export async function createBookmark(url: string, title?: string): Promise<Bookmark> {
  const payload = title ? { url, title } : { url };
  return sendMessage<Bookmark>({
    type: 'SAVE_BOOKMARK',
    payload,
  });
}
