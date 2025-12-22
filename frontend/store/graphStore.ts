import { create } from 'zustand';

type ViewMode = 'graph' | 'clusters' | 'insights' | 'discovery';
type NodeType = 'bookmarks' | 'concepts' | 'entities';

interface GraphFilters {
  view: ViewMode;
  nodeTypes: NodeType[];
  searchQuery: string;
}

interface GraphState {
  // UI State
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  filters: GraphFilters;

  // Actions
  setSelectedNode: (id: string | null) => void;
  setHoveredNode: (id: string | null) => void;
  setFilter: <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => void;
  resetFilters: () => void;
}

const defaultFilters: GraphFilters = {
  view: 'graph',
  nodeTypes: ['bookmarks', 'concepts', 'entities'],
  searchQuery: '',
};

export const useGraphStore = create<GraphState>((set) => ({
  selectedNodeId: null,
  hoveredNodeId: null,
  filters: defaultFilters,

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
      },
    })),
  resetFilters: () => set({ filters: defaultFilters }),
}));
