import { Bookmark } from '@/store/bookmarksStore';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'bookmarks.json');

// Write queue for serializing concurrent saves
let saveInProgress = false;
const saveQueue: (() => Promise<void>)[] = [];

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Process the write queue sequentially
 */
async function processQueue(): Promise<void> {
  if (saveInProgress || saveQueue.length === 0) {
    return;
  }

  saveInProgress = true;

  try {
    while (saveQueue.length > 0) {
      const operation = saveQueue.shift();
      if (operation) {
        await operation();
      }
    }
  } finally {
    saveInProgress = false;
    // Process any operations that were added while we were processing
    if (saveQueue.length > 0) {
      processQueue();
    }
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
 * Uses a write queue to serialize concurrent saves and prevent race conditions
 */
export async function saveBookmarksServer(bookmarks: Bookmark[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const saveOperation = async () => {
      try {
        ensureDataDir();

        const data = {
          bookmarks,
          version: 1,
          lastUpdated: new Date().toISOString(),
        };

        // Atomic write pattern: write to temp file, then rename
        // This prevents partial writes and ensures consistency
        const tempFile = DATA_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');

        // fs.renameSync is atomic on most filesystems
        fs.renameSync(tempFile, DATA_FILE);

        resolve();
      } catch (error) {
        console.error('Failed to save bookmarks to server storage:', error);
        reject(error);
      }
    };

    // Add to queue
    saveQueue.push(saveOperation);

    // Start processing if not already in progress
    if (!saveInProgress) {
      processQueue();
    }
  });
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
