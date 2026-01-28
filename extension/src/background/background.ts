/**
 * Background service worker for Smart Bookmarks extension
 * Handles authentication state and message routing
 */

import type { ExtensionMessage, MessageResponse } from '../types';

console.log('Smart Bookmarks background service worker loaded');

// Message listener for communication with popup
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('Background received message:', message);

    // Handle different message types
    switch (message.type) {
      case 'SAVE_BOOKMARK':
        // TODO: Implement bookmark saving logic
        sendResponse({ success: false, error: 'Not implemented' });
        break;

      case 'GET_AUTH_STATE':
        // TODO: Implement auth state retrieval
        sendResponse({ success: false, error: 'Not implemented' });
        break;

      case 'LOGIN':
        // TODO: Implement login logic
        sendResponse({ success: false, error: 'Not implemented' });
        break;

      case 'LOGOUT':
        // TODO: Implement logout logic
        sendResponse({ success: false, error: 'Not implemented' });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }

    // Return true to indicate async response
    return true;
  }
);
