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

  // Concept filter (AI-generated concepts)
  selectedConcepts: string[];

  // Entity filter (AI-generated entities)
  selectedEntities: string[];

  // Actions
  setSearchQuery: (query: string) => void;
  toggleType: (type: Bookmark['contentType']) => void;
  setTypes: (types: Bookmark['contentType'][]) => void;
  toggleSource: (source: string) => void;
  setSources: (sources: string[]) => void;
  setDateRange: (from: Date | null, to: Date | null) => void;
  toggleConcept: (conceptId: string) => void;
  setConcepts: (conceptIds: string[]) => void;
  toggleEntity: (entityId: string) => void;
  setEntities: (entityIds: string[]) => void;
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
  selectedConcepts: [] as string[],
  selectedEntities: [] as string[],
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

  toggleConcept: (conceptId: string) =>
    set((state) => ({
      selectedConcepts: state.selectedConcepts.includes(conceptId)
        ? state.selectedConcepts.filter(id => id !== conceptId)
        : [...state.selectedConcepts, conceptId],
    })),

  setConcepts: (conceptIds: string[]) => set({ selectedConcepts: conceptIds }),

  toggleEntity: (entityId: string) =>
    set((state) => ({
      selectedEntities: state.selectedEntities.includes(entityId)
        ? state.selectedEntities.filter(id => id !== entityId)
        : [...state.selectedEntities, entityId],
    })),

  setEntities: (entityIds: string[]) => set({ selectedEntities: entityIds }),

  clearFilters: () => set(initialState),

  hasActiveFilters: () => {
    const state = get();
    return !!(
      state.searchQuery ||
      state.selectedTypes.length > 0 ||
      state.selectedSources.length > 0 ||
      state.selectedConcepts.length > 0 ||
      state.selectedEntities.length > 0 ||
      state.dateRange.from ||
      state.dateRange.to
    );
  },
}));
