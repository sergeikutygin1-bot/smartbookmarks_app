import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfilePanelState {
  isOpen: boolean;
  activeSection: 'personal' | 'analytics' | 'tariff';

  open: () => void;
  close: () => void;
  toggle: () => void;
  setActiveSection: (section: 'personal' | 'analytics' | 'tariff') => void;
}

export const useProfilePanelStore = create<ProfilePanelState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeSection: 'personal',

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setActiveSection: (section) => set({ activeSection: section }),
    }),
    {
      name: 'profile-panel-storage',
      partialize: (state) => ({ activeSection: state.activeSection }),
    }
  )
);
