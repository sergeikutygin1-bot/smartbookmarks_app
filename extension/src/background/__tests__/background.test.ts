/**
 * Tests for background service worker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Chrome APIs
const mockStorageLocal = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

const mockRuntimeSendMessage = vi.fn();
const mockTabsCreate = vi.fn();

global.chrome = {
  storage: {
    local: mockStorageLocal,
  },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    create: mockTabsCreate,
  },
} as any;

// Mock fetch
global.fetch = vi.fn();

describe('Background Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Storage', () => {
    it('should store tokens on SMART_BOOKMARK_AUTH message', async () => {
      mockStorageLocal.set.mockResolvedValue(undefined);

      const { handleMessage } = await import('../background');

      const message = {
        type: 'SMART_BOOKMARK_AUTH' as const,
        payload: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
        },
      };

      const sendResponse = vi.fn();
      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        auth: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: expect.any(Number),
        },
      });

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { isAuthenticated: true },
      });
    });

    it('should return auth state on GET_AUTH_STATE', async () => {
      const mockAuthState = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 900000, // 15 min from now
      };

      mockStorageLocal.get.mockResolvedValue({ auth: mockAuthState });

      const { handleMessage } = await import('../background');

      const message = { type: 'GET_AUTH_STATE' as const };
      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockStorageLocal.get).toHaveBeenCalledWith('auth');
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          isAuthenticated: true,
        },
      });
    });

    it('should return unauthenticated state when no tokens stored', async () => {
      mockStorageLocal.get.mockResolvedValue({});

      const { handleMessage } = await import('../background');

      const message = { type: 'GET_AUTH_STATE' as const };
      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        },
      });
    });

    it('should return unauthenticated state when token is expired', async () => {
      const mockAuthState = {
        accessToken: 'expired-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      mockStorageLocal.get.mockResolvedValue({ auth: mockAuthState });

      const { handleMessage } = await import('../background');

      const message = { type: 'GET_AUTH_STATE' as const };
      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: {
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        },
      });
    });

    it('should clear tokens on LOGOUT', async () => {
      mockStorageLocal.remove.mockResolvedValue(undefined);

      const { handleMessage } = await import('../background');

      const message = { type: 'LOGOUT' as const };
      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockStorageLocal.remove).toHaveBeenCalledWith('auth');
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { isAuthenticated: false },
      });
    });
  });

  describe('Message Routing', () => {
    it('should open auth page on LOGIN', async () => {
      mockTabsCreate.mockResolvedValue({ id: 123 });

      const { handleMessage } = await import('../background');

      const message = { type: 'LOGIN' as const };
      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockTabsCreate).toHaveBeenCalledWith({
        url: 'http://localhost:3000/extension-auth',
      });

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Opening authentication page...' },
      });
    });

    it('should save bookmark via API', async () => {
      const mockAuthState = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 900000,
      };

      mockStorageLocal.get.mockResolvedValue({ auth: mockAuthState });

      const mockBookmark = {
        id: 'bookmark-123',
        url: 'https://example.com',
        title: 'Example',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockBookmark,
      });

      const { handleMessage } = await import('../background');

      const message = {
        type: 'SAVE_BOOKMARK' as const,
        payload: {
          url: 'https://example.com',
          title: 'Example',
          notes: 'Test notes',
        },
      };

      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3002/api/v1/bookmarks',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          },
          body: JSON.stringify({
            url: 'https://example.com',
            title: 'Example',
            notes: 'Test notes',
          }),
        }
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: mockBookmark,
      });
    });

    it('should handle bookmark save when not authenticated', async () => {
      mockStorageLocal.get.mockResolvedValue({});

      const { handleMessage } = await import('../background');

      const message = {
        type: 'SAVE_BOOKMARK' as const,
        payload: {
          url: 'https://example.com',
        },
      };

      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Not authenticated. Please login first.',
      });
    });

    it('should handle API errors gracefully', async () => {
      const mockAuthState = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 900000,
      };

      mockStorageLocal.get.mockResolvedValue({ auth: mockAuthState });

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid URL' }),
      });

      const { handleMessage } = await import('../background');

      const message = {
        type: 'SAVE_BOOKMARK' as const,
        payload: {
          url: 'invalid-url',
        },
      };

      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to save bookmark: Invalid URL',
      });
    });

    it('should handle unknown message types', async () => {
      const { handleMessage } = await import('../background');

      const message = { type: 'UNKNOWN_TYPE' as any };
      const sendResponse = vi.fn();

      handleMessage(message, {} as chrome.runtime.MessageSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown message type',
      });
    });
  });
});
