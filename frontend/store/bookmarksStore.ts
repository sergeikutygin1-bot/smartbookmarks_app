import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Bookmark type definition
 * Note: Bookmark data is now managed by React Query, not Zustand
 */
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  domain: string;
  summary?: string;
  contentType: 'article' | 'video' | 'tweet' | 'pdf' | 'other';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date | null;
}

/**
 * UI State Store
 * Only manages UI state like selected bookmark ID
 * All bookmark data is managed by React Query
 */
interface UIState {
  selectedBookmarkId: string | null;
  selectBookmark: (id: string | null) => void;
}

/**
 * UI State Store with localStorage persistence
 * Manages only UI-related state (selected bookmark)
 * Persists selected bookmark ID across page refreshes
 * All bookmark data is managed by React Query + API
 */
export const useBookmarksStore = create<UIState>()(
  persist(
    (set) => ({
      selectedBookmarkId: null,
      selectBookmark: (id) => set({ selectedBookmarkId: id }),
    }),
    {
      name: 'bookmarks-ui-storage', // localStorage key
    }
  )
);
