import { Bookmark } from "@/store/bookmarksStore";

const STORAGE_KEY = "smart_bookmarks_data";

export interface StorageData {
  bookmarks: Bookmark[];
  version: number;
}

/**
 * Load bookmarks from localStorage
 */
export function loadBookmarks(): Bookmark[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const data: StorageData = JSON.parse(stored);

    // Convert date strings back to Date objects
    return data.bookmarks.map((bookmark) => ({
      ...bookmark,
      createdAt: new Date(bookmark.createdAt),
      updatedAt: new Date(bookmark.updatedAt),
      processedAt: bookmark.processedAt ? new Date(bookmark.processedAt) : null,
    }));
  } catch (error) {
    console.error("Failed to load bookmarks from localStorage:", error);
    return [];
  }
}

/**
 * Save bookmarks to localStorage
 */
export function saveBookmarks(bookmarks: Bookmark[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const data: StorageData = {
      bookmarks,
      version: 1,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save bookmarks to localStorage:", error);
  }
}

/**
 * Clear all bookmarks from localStorage
 */
export function clearBookmarks(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear bookmarks from localStorage:", error);
  }
}
