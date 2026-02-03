import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExtensionAuthPage from '../page';
import { authenticatedFetch } from '@/lib/api';

// Mock authenticatedFetch
jest.mock('@/lib/api', () => ({
  authenticatedFetch: jest.fn(),
}));

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockAuthenticatedFetch = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

describe('ExtensionAuthPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.postMessage
    window.postMessage = jest.fn();
  });

  describe('Loading State', () => {
    it('shows loading message while checking authentication', () => {
      // Mock pending fetch
      mockAuthenticatedFetch.mockImplementation(() => new Promise(() => {}));

      render(<ExtensionAuthPage />);

      expect(screen.getByText(/checking authentication/i)).toBeInTheDocument();
    });
  });

  describe('Authentication Check', () => {
    it('redirects to login if not authenticated', async () => {
      // Mock 401 response (not authenticated)
      mockAuthenticatedFetch.mockRejectedValueOnce(new Error('Unauthorized'));

      render(<ExtensionAuthPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login?returnUrl=%2Fextension-auth');
      });
    });

    it('does not call API if not authenticated', async () => {
      // Mock 401 response (not authenticated)
      mockAuthenticatedFetch.mockRejectedValueOnce(new Error('Unauthorized'));

      render(<ExtensionAuthPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      // Should only be called once (for checking auth, not for fetching tokens)
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authenticated User', () => {
    it('fetches tokens and sends postMessage if authenticated', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      // Mock successful auth check
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: '1', email: 'test@example.com' } })
      } as Response);

      // Mock successful token fetch
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokens
      } as Response);

      render(<ExtensionAuthPage />);

      await waitFor(() => {
        expect(window.postMessage).toHaveBeenCalledWith(
          {
            type: 'SMART_BOOKMARK_AUTH',
            accessToken: mockTokens.accessToken,
            refreshToken: mockTokens.refreshToken
          },
          window.location.origin
        );
      });
    });

    it('shows success message after sending tokens', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      // Mock successful auth check
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: '1', email: 'test@example.com' } })
      } as Response);

      // Mock successful token fetch
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokens
      } as Response);

      render(<ExtensionAuthPage />);

      await waitFor(() => {
        expect(screen.getByText(/extension connected/i)).toBeInTheDocument();
      });
    });

    it('handles token fetch error gracefully', async () => {
      // Mock successful auth check
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: '1', email: 'test@example.com' } })
      } as Response);

      // Mock failed token fetch
      mockAuthenticatedFetch.mockRejectedValueOnce(new Error('Failed to fetch tokens'));

      render(<ExtensionAuthPage />);

      await waitFor(() => {
        expect(screen.getByText(/failed to connect extension/i)).toBeInTheDocument();
      });

      // Should not call postMessage on error
      expect(window.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Message Security', () => {
    it('validates origin before posting message', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      // Mock successful auth check
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: '1', email: 'test@example.com' } })
      } as Response);

      // Mock successful token fetch
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokens
      } as Response);

      render(<ExtensionAuthPage />);

      await waitFor(() => {
        expect(window.postMessage).toHaveBeenCalled();
      });

      // Verify postMessage was called with window.location.origin (not '*')
      const postMessageCalls = (window.postMessage as jest.Mock).mock.calls;
      expect(postMessageCalls[0][1]).toBe(window.location.origin);
    });
  });
});
