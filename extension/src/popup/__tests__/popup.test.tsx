/**
 * Tests for Popup component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Popup from '../popup';
import * as api from '../../utils/api';

// Mock the API functions
vi.mock('../../utils/api');

// Mock chrome.tabs API
const mockChromeTabsQuery = vi.fn();
global.chrome = {
  tabs: {
    query: mockChromeTabsQuery,
  },
  runtime: {},
} as any;

// Mock window.close
global.window.close = vi.fn();

describe('Popup Component', () => {
  const mockTab = {
    url: 'https://example.com/article',
    title: 'Example Article',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Loading State', () => {
    it('shows loading state initially', () => {
      // Mock API to delay response
      vi.mocked(api.getAuthState).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<Popup />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Not Authenticated State', () => {
    beforeEach(() => {
      vi.mocked(api.getAuthState).mockResolvedValue({
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
    });

    it('shows login button when not authenticated', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: /smart bookmarks/i })).toBeInTheDocument();
    });

    it('calls login() when login button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(api.login).mockResolvedValue(undefined);

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      });

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      expect(api.login).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authenticated + Idle State', () => {
    beforeEach(() => {
      vi.mocked(api.getAuthState).mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        isAuthenticated: true,
      });
      mockChromeTabsQuery.mockImplementation((query, callback) => {
        callback([mockTab]);
      });
    });

    it('shows current page info when authenticated', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText(mockTab.title)).toBeInTheDocument();
      });

      expect(screen.getByText(mockTab.url)).toBeInTheDocument();
    });

    it('shows enabled save bookmark button', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('Saving State', () => {
    beforeEach(() => {
      vi.mocked(api.getAuthState).mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        isAuthenticated: true,
      });
      mockChromeTabsQuery.mockImplementation((query, callback) => {
        callback([mockTab]);
      });
    });

    it('disables button and shows "Saving..." while saving', async () => {
      const user = userEvent.setup();
      // Mock createBookmark to delay response
      vi.mocked(api.createBookmark).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
      });

      const savingButton = screen.getByRole('button', { name: /saving/i });
      expect(savingButton).toBeDisabled();
    });
  });

  describe('Success State', () => {
    beforeEach(() => {
      vi.mocked(api.getAuthState).mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        isAuthenticated: true,
      });
      mockChromeTabsQuery.mockImplementation((query, callback) => {
        callback([mockTab]);
      });
    });

    it('shows success message after save', async () => {
      const user = userEvent.setup();
      vi.mocked(api.createBookmark).mockResolvedValue({
        id: 'bookmark-123',
        url: mockTab.url,
        title: mockTab.title,
        description: null,
        notes: null,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/saved!/i)).toBeInTheDocument();
      });
    });

    it('auto-closes popup after 2 seconds on success', async () => {
      const user = userEvent.setup();

      vi.mocked(api.createBookmark).mockResolvedValue({
        id: 'bookmark-123',
        url: mockTab.url,
        title: mockTab.title,
        description: null,
        notes: null,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });

      // Clear any previous calls to window.close before this test action
      (window.close as any).mockClear();

      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/saved!/i)).toBeInTheDocument();
      });

      // Wait for the setTimeout to be called (2 seconds + a little buffer)
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Verify window.close was called (may have been called by other tests too, so just check it was called)
      expect(window.close).toHaveBeenCalled();
    });
  });

  describe('Error State', () => {
    beforeEach(() => {
      vi.mocked(api.getAuthState).mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        isAuthenticated: true,
      });
      mockChromeTabsQuery.mockImplementation((query, callback) => {
        callback([mockTab]);
      });
    });

    it('shows error message on save failure', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Network error occurred';
      vi.mocked(api.createBookmark).mockRejectedValue(new Error(errorMessage));

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      const user = userEvent.setup();
      vi.mocked(api.createBookmark).mockRejectedValue(new Error('Failed to save'));

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retry button works correctly', async () => {
      const user = userEvent.setup();
      // First attempt fails, second succeeds
      vi.mocked(api.createBookmark)
        .mockRejectedValueOnce(new Error('Failed to save'))
        .mockResolvedValueOnce({
          id: 'bookmark-123',
          url: mockTab.url,
          title: mockTab.title,
          description: null,
          notes: null,
          status: 'pending',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save bookmark/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save bookmark/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText(/saved!/i)).toBeInTheDocument();
      });

      expect(api.createBookmark).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tab Info Retrieval', () => {
    beforeEach(() => {
      vi.mocked(api.getAuthState).mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        isAuthenticated: true,
      });
    });

    it('calls chrome.tabs.query with correct parameters', async () => {
      mockChromeTabsQuery.mockImplementation((query, callback) => {
        callback([mockTab]);
      });

      render(<Popup />);

      await waitFor(() => {
        expect(mockChromeTabsQuery).toHaveBeenCalledWith(
          { active: true, currentWindow: true },
          expect.any(Function)
        );
      });
    });

    it('handles missing tab info gracefully', async () => {
      mockChromeTabsQuery.mockImplementation((query, callback) => {
        callback([]);
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText(/could not get current page information/i)).toBeInTheDocument();
      });
    });
  });
});
