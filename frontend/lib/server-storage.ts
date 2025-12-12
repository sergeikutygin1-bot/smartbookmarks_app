import { Bookmark } from '@/store/bookmarksStore';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'bookmarks.json');

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load bookmarks from server-side JSON file
 */
export function loadBookmarksServer(): Bookmark[] {
  try {
    ensureDataDir();

    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }

    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(data);

    // Convert date strings back to Date objects
    return parsed.bookmarks.map((bookmark: any) => ({
      ...bookmark,
      createdAt: new Date(bookmark.createdAt),
      updatedAt: new Date(bookmark.updatedAt),
      processedAt: bookmark.processedAt ? new Date(bookmark.processedAt) : null,
      embeddedAt: bookmark.embeddedAt ? new Date(bookmark.embeddedAt) : undefined,
      // embedding is already an array, no conversion needed
    }));
  } catch (error) {
    console.error('Failed to load bookmarks from server storage:', error);
    return [];
  }
}

/**
 * Save bookmarks to server-side JSON file
 */
export function saveBookmarksServer(bookmarks: Bookmark[]): void {
  try {
    ensureDataDir();

    const data = {
      bookmarks,
      version: 1,
      lastUpdated: new Date().toISOString(),
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save bookmarks to server storage:', error);
    throw error;
  }
}

/**
 * Clear all bookmarks from server storage
 */
export function clearBookmarksServer(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }
  } catch (error) {
    console.error('Failed to clear bookmarks from server storage:', error);
    throw error;
  }
}
