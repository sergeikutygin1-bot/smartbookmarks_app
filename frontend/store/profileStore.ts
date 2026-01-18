import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ProfileSection = 'personal' | 'analytics' | 'tariff';

interface ProfileState {
  // UI State
  isEditMode: boolean;
  activeSection: ProfileSection;

  // Actions
  setEditMode: (isEdit: boolean) => void;
  setActiveSection: (section: ProfileSection) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      isEditMode: false,
      activeSection: 'personal',

      setEditMode: (isEdit) => set({ isEditMode: isEdit }),
      setActiveSection: (section) => set({ activeSection: section }),
    }),
    {
      name: 'profile-storage',
      partialize: (state) => ({ activeSection: state.activeSection }),
    }
  )
);
