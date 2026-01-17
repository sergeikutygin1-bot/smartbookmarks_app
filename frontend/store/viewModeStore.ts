import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'note' | 'graph';

interface ViewModeState {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggleMode: () => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set, get) => ({
      mode: 'note', // Default to note mode
      setMode: (mode) => set({ mode }),
      toggleMode: () =>
        set((state) => ({
          mode: state.mode === 'note' ? 'graph' : 'note',
        })),
    }),
    {
      name: 'view-mode-storage', // Persist to localStorage
    }
  )
);
