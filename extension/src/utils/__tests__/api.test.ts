/**
 * Tests for API client that communicates with background worker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAuthState, login, logout, createBookmark } from '../api';
import type { AuthState, Bookmark, MessageResponse } from '../../types';

// Mock chrome.runtime
const mockSendMessage = vi.fn();
const mockLastError = { message: '' };

global.chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: undefined as { message: string } | undefined,
  },
} as any;

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
  });

  describe('getAuthState', () => {
    it('should send GET_AUTH_STATE message and return auth state', async () => {
      const mockAuthState: AuthState = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        isAuthenticated: true,
      };

      mockSendMessage.mockImplementation((message, callback) => {
        expect(message).toEqual({ type: 'GET_AUTH_STATE' });
        callback({ success: true, data: mockAuthState });
      });

      const result = await getAuthState();

      expect(result).toEqual(mockAuthState);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should return unauthenticated state when not logged in', async () => {
      const mockAuthState: AuthState = {
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      };

      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: true, data: mockAuthState });
      });

      const result = await getAuthState();

      expect(result.isAuthenticated).toBe(false);
      expect(result.accessToken).toBeNull();
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: 'Extension context invalidated' };
        callback({ success: true, data: {} });
      });

      await expect(getAuthState()).rejects.toThrow('Extension context invalidated');
    });

    it('should handle response errors', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false, error: 'Storage error' });
      });

      await expect(getAuthState()).rejects.toThrow('Storage error');
    });

    it('should handle response with no error message', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false });
      });

      await expect(getAuthState()).rejects.toThrow('Unknown error');
    });
  });

  describe('login', () => {
    it('should send LOGIN message to background worker', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        expect(message).toEqual({ type: 'LOGIN' });
        callback({ success: true, data: { message: 'Opening authentication page...' } });
      });

      await login();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: 'Tab creation failed' };
        callback({ success: true });
      });

      await expect(login()).rejects.toThrow('Tab creation failed');
    });

    it('should handle response errors', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false, error: 'Failed to open auth page' });
      });

      await expect(login()).rejects.toThrow('Failed to open auth page');
    });
  });

  describe('logout', () => {
    it('should send LOGOUT message to background worker', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        expect(message).toEqual({ type: 'LOGOUT' });
        callback({ success: true, data: { isAuthenticated: false } });
      });

      await logout();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: 'Storage clear failed' };
        callback({ success: true });
      });

      await expect(logout()).rejects.toThrow('Storage clear failed');
    });

    it('should handle response errors', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false, error: 'Failed to logout' });
      });

      await expect(logout()).rejects.toThrow('Failed to logout');
    });
  });

  describe('createBookmark', () => {
    it('should send SAVE_BOOKMARK message with url and title', async () => {
      const mockBookmark: Bookmark = {
        id: '123',
        url: 'https://example.com',
        title: 'Example Site',
        description: null,
        notes: null,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSendMessage.mockImplementation((message, callback) => {
        expect(message).toEqual({
          type: 'SAVE_BOOKMARK',
          payload: {
            url: 'https://example.com',
            title: 'Example Site',
          },
        });
        callback({ success: true, data: mockBookmark });
      });

      const result = await createBookmark('https://example.com', 'Example Site');

      expect(result).toEqual(mockBookmark);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle optional title parameter', async () => {
      const mockBookmark: Bookmark = {
        id: '123',
        url: 'https://example.com',
        title: 'Example Site',
        description: null,
        notes: null,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSendMessage.mockImplementation((message, callback) => {
        expect(message).toEqual({
          type: 'SAVE_BOOKMARK',
          payload: {
            url: 'https://example.com',
          },
        });
        callback({ success: true, data: mockBookmark });
      });

      const result = await createBookmark('https://example.com');

      expect(result).toEqual(mockBookmark);
    });

    it('should handle chrome.runtime.lastError', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: 'Message sending failed' };
        callback({ success: true });
      });

      await expect(createBookmark('https://example.com', 'Test')).rejects.toThrow(
        'Message sending failed'
      );
    });

    it('should handle response errors', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false, error: 'Not authenticated. Please login first.' });
      });

      await expect(createBookmark('https://example.com', 'Test')).rejects.toThrow(
        'Not authenticated. Please login first.'
      );
    });

    it('should handle API errors from background worker', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false, error: 'Failed to save bookmark: Invalid URL' });
      });

      await expect(createBookmark('invalid-url', 'Test')).rejects.toThrow(
        'Failed to save bookmark: Invalid URL'
      );
    });
  });

  describe('sendMessage helper', () => {
    it('should resolve promise on successful response', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: true, data: { test: 'value' } });
      });

      const result = await getAuthState();

      expect(result).toBeDefined();
    });

    it('should reject promise on chrome.runtime.lastError', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: 'Test error' };
        callback({ success: true });
      });

      await expect(getAuthState()).rejects.toThrow('Test error');
    });

    it('should reject promise on response.success === false', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false, error: 'Test error' });
      });

      await expect(getAuthState()).rejects.toThrow('Test error');
    });

    it('should reject with "Unknown error" when no error message provided', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: false });
      });

      await expect(getAuthState()).rejects.toThrow('Unknown error');
    });
  });
});
