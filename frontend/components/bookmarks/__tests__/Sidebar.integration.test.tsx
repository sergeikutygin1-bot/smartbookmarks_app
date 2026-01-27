import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock hooks
let mockRefetch = jest.fn();
let mockMutateAsync = jest.fn();

jest.mock('@/hooks/useBookmarks', () => ({
  useBookmarks: jest.fn(() => ({
    data: [],
    refetch: mockRefetch,
    isLoading: false,
    isError: false,
    error: null,
  })),
  useCreateBookmark: jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
}));

// Mock components and stores
jest.mock('../BookmarkList', () => ({
  BookmarkList: () => <div data-testid="bookmark-list">Bookmark List</div>,
}));

jest.mock('../FilterBar', () => ({
  FilterBar: () => <div data-testid="filter-bar">Filter Bar</div>,
}));

jest.mock('../BulkImportModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, onImportComplete }: any) => {
    const handleCompleteImport = () => {
      // Simulate the real modal's behavior: auto-close and call onImportComplete after 3 seconds
      setTimeout(() => {
        onClose();
        onImportComplete();
      }, 3000);
    };

    return isOpen ? (
      <div data-testid="bulk-import-modal">
        <button onClick={onClose}>Close Modal</button>
        <button onClick={handleCompleteImport}>Complete Import</button>
      </div>
    ) : null;
  },
}));

jest.mock('@/store/filterStore', () => ({
  useFilterStore: () => ({
    searchQuery: '',
    setSearchQuery: jest.fn(),
  }),
}));

jest.mock('@/store/bookmarksStore', () => ({
  useBookmarksStore: () => ({
    selectedBookmarkId: null,
    selectBookmark: jest.fn(),
  }),
}));

jest.mock('@/store/profilePanelStore', () => ({
  useProfilePanelStore: () => ({
    open: jest.fn(),
  }),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

describe('Sidebar - Bulk Import Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockRefetch = jest.fn();
    mockMutateAsync = jest.fn().mockResolvedValue({ id: 'new-id' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderSidebar = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Sidebar />
      </QueryClientProvider>
    );
  };

  it('renders bulk import button', () => {
    renderSidebar();

    const bulkImportButton = screen.getByTitle('Bulk Import');
    expect(bulkImportButton).toBeInTheDocument();
  });

  it('opens bulk import modal when button is clicked', () => {
    renderSidebar();

    const bulkImportButton = screen.getByTitle('Bulk Import');
    fireEvent.click(bulkImportButton);

    expect(screen.getByTestId('bulk-import-modal')).toBeInTheDocument();
  });

  it('closes modal when close is clicked', () => {
    renderSidebar();

    const bulkImportButton = screen.getByTitle('Bulk Import');
    fireEvent.click(bulkImportButton);

    expect(screen.getByTestId('bulk-import-modal')).toBeInTheDocument();

    const closeButton = screen.getByText('Close Modal');
    fireEvent.click(closeButton);

    expect(screen.queryByTestId('bulk-import-modal')).not.toBeInTheDocument();
  });

  it('calls refetch after successful import', async () => {
    jest.useFakeTimers();
    renderSidebar();

    const bulkImportButton = screen.getByTitle('Bulk Import');
    fireEvent.click(bulkImportButton);

    const completeButton = screen.getByText('Complete Import');
    fireEvent.click(completeButton);

    // Fast-forward time by 3 seconds to trigger the import completion
    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });

    jest.useRealTimers();
  });

  it('closes modal after successful import', async () => {
    jest.useFakeTimers();
    renderSidebar();

    const bulkImportButton = screen.getByTitle('Bulk Import');
    fireEvent.click(bulkImportButton);

    expect(screen.getByTestId('bulk-import-modal')).toBeInTheDocument();

    const completeButton = screen.getByText('Complete Import');
    fireEvent.click(completeButton);

    // Modal should still be visible initially
    expect(screen.getByTestId('bulk-import-modal')).toBeInTheDocument();

    // Fast-forward time by 3 seconds (the auto-close timeout)
    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(screen.queryByTestId('bulk-import-modal')).not.toBeInTheDocument();
    });

    jest.useRealTimers();
  });
});
