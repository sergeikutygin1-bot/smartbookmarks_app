import { create } from 'zustand';
import { Bookmark } from './bookmarksStore';

export interface FilterState {
  // Search query
  searchQuery: string;

  // Type filter (contentType)
  selectedTypes: Bookmark['contentType'][];

  // Source/domain filter
  selectedSources: string[];

  // Date range filter
  dateRange: {
    from: Date | null;
    to: Date | null;
  };

  // Actions
  setSearchQuery: (query: string) => void;
  toggleType: (type: Bookmark['contentType']) => void;
  setTypes: (types: Bookmark['contentType'][]) => void;
  toggleSource: (source: string) => void;
  setSources: (sources: string[]) => void;
  setDateRange: (from: Date | null, to: Date | null) => void;
  clearFilters: () => void;

  // Helper to check if any filters are active
  hasActiveFilters: () => boolean;
}

const initialState = {
  searchQuery: '',
  selectedTypes: [] as Bookmark['contentType'][],
  selectedSources: [] as string[],
  dateRange: {
    from: null,
    to: null,
  },
};

export const useFilterStore = create<FilterState>((set, get) => ({
  ...initialState,

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  toggleType: (type: Bookmark['contentType']) =>
    set((state) => ({
      selectedTypes: state.selectedTypes.includes(type)
        ? state.selectedTypes.filter(t => t !== type)
        : [...state.selectedTypes, type],
    })),

  setTypes: (types: Bookmark['contentType'][]) => set({ selectedTypes: types }),

  toggleSource: (source: string) =>
    set((state) => ({
      selectedSources: state.selectedSources.includes(source)
        ? state.selectedSources.filter(s => s !== source)
        : [...state.selectedSources, source],
    })),

  setSources: (sources: string[]) => set({ selectedSources: sources }),

  setDateRange: (from: Date | null, to: Date | null) =>
    set({ dateRange: { from, to } }),

  clearFilters: () => set(initialState),

  hasActiveFilters: () => {
    const state = get();
    return !!(
      state.searchQuery ||
      state.selectedTypes.length > 0 ||
      state.selectedSources.length > 0 ||
      state.dateRange.from ||
      state.dateRange.to
    );
  },
}));
