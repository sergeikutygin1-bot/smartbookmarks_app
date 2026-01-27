import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import BulkImportModal from '../BulkImportModal';
import { authenticatedFetch } from '@/lib/api';

// Mock authenticatedFetch
jest.mock('@/lib/api', () => ({
  authenticatedFetch: jest.fn(),
}));

const mockAuthenticatedFetch = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

describe('BulkImportModal', () => {
  const mockOnClose = jest.fn();
  const mockOnImportComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders textarea and import button when open', () => {
      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      expect(screen.getByPlaceholderText(/paste urls/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /import all/i })).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(
        <BulkImportModal
          isOpen={false}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      expect(screen.queryByPlaceholderText(/paste urls/i)).not.toBeInTheDocument();
    });
  });

  describe('URL Validation', () => {
    it('validates URLs correctly and shows counters', async () => {
      const user = userEvent.setup();
      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);

      // Paste mixed valid and invalid URLs
      await user.type(textarea, 'https://example.com\nhttp://test.org\ninvalid-url\nftp://not-supported.com');

      // Wait for validation to update
      await waitFor(() => {
        const counters = screen.getAllByText('2');
        expect(counters).toHaveLength(2); // Both valid and invalid have 2
        expect(screen.getByText('valid urls')).toBeInTheDocument();
        expect(screen.getByText('invalid urls')).toBeInTheDocument();
      });
    });

    it('handles empty textarea', () => {
      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      expect(screen.getByText('valid urls')).toBeInTheDocument();
      expect(screen.getByText('invalid urls')).toBeInTheDocument();
    });

    it('validates only http and https protocols', async () => {
      const user = userEvent.setup();
      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);

      await user.type(textarea, 'https://example.com\nftp://example.com\nhttp://test.com');

      await waitFor(() => {
        expect(screen.getByText('valid urls')).toBeInTheDocument();
        expect(screen.getByText('invalid url')).toBeInTheDocument();
      });
    });
  });

  describe('Import Button State', () => {
    it('disables button when no valid URLs', () => {
      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const importButton = screen.getByRole('button', { name: /import all/i });
      expect(importButton).toBeDisabled();
    });

    it('enables button when there are valid URLs', async () => {
      const user = userEvent.setup();
      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com');

      await waitFor(() => {
        const importButton = screen.getByRole('button', { name: /import all/i });
        expect(importButton).not.toBeDisabled();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading state during import', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null }); // Disable user-event delay for fake timers

      // Mock API to return a promise that doesn't resolve immediately
      mockAuthenticatedFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ created: 1, bookmarks: [] })
        } as Response), 100))
      );

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      // Check loading state
      expect(screen.getByText(/importing/i)).toBeInTheDocument();
      expect(textarea).toBeDisabled();
      expect(importButton).toBeDisabled();

      // Advance timers to resolve the mock API call
      await jest.advanceTimersByTimeAsync(100);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/1 bookmark imported successfully/i)).toBeInTheDocument();
      });

      // Advance timers to auto-close
      await jest.advanceTimersByTimeAsync(3000);

      // Wait for completion
      await waitFor(() => {
        expect(mockOnImportComplete).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });
  });

  describe('Success State', () => {
    it('shows success message after successful import', async () => {
      const user = userEvent.setup();

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ created: 3, bookmarks: [] })
      } as Response);

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com\nhttp://test.org\nhttps://demo.com');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText(/3 bookmarks imported successfully/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('auto-closes after 3 seconds on success', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null }); // Disable user-event delay for fake timers

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ created: 1, bookmarks: [] })
      } as Response);

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText(/1 bookmark imported successfully/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Fast-forward time
      jest.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
        expect(mockOnImportComplete).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });
  });

  describe('Error State', () => {
    it('shows error message on failure', async () => {
      const user = userEvent.setup();

      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Server error' })
      } as Response);

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to import/i)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      const user = userEvent.setup();

      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Server error' })
      } as Response);

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('can retry after error', async () => {
      const user = userEvent.setup();

      // First call fails, second succeeds
      mockAuthenticatedFetch
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Server error' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ created: 1, bookmarks: [] })
        } as Response);

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      // Wait for error
      const retryButton = await screen.findByRole('button', { name: /retry/i });

      // Click retry
      await user.click(retryButton);

      // Should succeed - wait for success message
      await waitFor(() => {
        expect(screen.getByText(/1 bookmark imported successfully/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('API Integration', () => {
    it('calls authenticatedFetch with correct parameters', async () => {
      const user = userEvent.setup();

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ created: 2, bookmarks: [] })
      } as Response);

      render(
        <BulkImportModal
          isOpen={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      );

      const textarea = screen.getByPlaceholderText(/paste urls/i);
      await user.type(textarea, 'https://example.com\nhttp://test.org');

      const importButton = screen.getByRole('button', { name: /import all/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
          '/api/bookmarks/bulk',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              urls: ['https://example.com', 'http://test.org']
            })
          })
        );
      });
    });
  });
});
