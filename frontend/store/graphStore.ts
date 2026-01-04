import { create } from 'zustand';

type NodeType = 'bookmarks' | 'concepts' | 'entities';

interface GraphFilters {
  nodeTypes: NodeType[];
  searchQuery: string;
}

interface HistoryEntry {
  type: 'position';
  nodeId: string;
  oldPosition: { x: number; y: number };
  newPosition: { x: number; y: number };
  timestamp: number;
}

interface GraphState {
  // UI State
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  highlightedNodeIds: string[];
  overlapNodeIds: string[]; // Nodes connected to multiple selected nodes
  filters: GraphFilters;

  // History State
  history: HistoryEntry[];
  historyIndex: number;

  // Actions
  setSelectedNode: (id: string | null) => void;
  setHoveredNode: (id: string | null) => void;
  setHighlightedNodes: (ids: string[]) => void;
  setOverlapNodes: (ids: string[]) => void;
  clearHighlights: () => void;
  setFilter: <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => void;
  resetFilters: () => void;

  // History Actions
  addHistoryEntry: (entry: HistoryEntry) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const defaultFilters: GraphFilters = {
  nodeTypes: ['bookmarks', 'concepts', 'entities'],
  searchQuery: '',
};

export const useGraphStore = create<GraphState>((set, get) => ({
  selectedNodeId: null,
  hoveredNodeId: null,
  highlightedNodeIds: [],
  overlapNodeIds: [],
  filters: defaultFilters,
  history: [],
  historyIndex: -1,

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  setHighlightedNodes: (ids) => set({ highlightedNodeIds: ids }),
  setOverlapNodes: (ids) => set({ overlapNodeIds: ids }),
  clearHighlights: () => set({ highlightedNodeIds: [], overlapNodeIds: [] }),
  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
      },
    })),
  resetFilters: () => set({ filters: defaultFilters }),

  // History management
  addHistoryEntry: (entry) =>
    set((state) => {
      // Remove any history after current index (if we're in middle of undo/redo stack)
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      // Add new entry
      newHistory.push(entry);
      // Limit history to last 50 entries
      const trimmedHistory = newHistory.slice(-50);
      return {
        history: trimmedHistory,
        historyIndex: trimmedHistory.length - 1,
      };
    }),

  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return null;

    const entry = state.history[state.historyIndex];
    set({ historyIndex: state.historyIndex - 1 });
    return entry;
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return null;

    const entry = state.history[state.historyIndex + 1];
    set({ historyIndex: state.historyIndex + 1 });
    return entry;
  },

  canUndo: () => {
    const state = get();
    return state.historyIndex >= 0;
  },

  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },
}));
