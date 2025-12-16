import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Bookmark interface matching iOS expectations
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
  processedAt?: Date;
  embedding?: number[];
  embeddedAt?: Date;
}

// Storage file path
const STORAGE_DIR = path.join(__dirname, '../../.data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'bookmarks.json');

// In-memory cache for faster reads
let bookmarksCache: Bookmark[] | null = null;

/**
 * Ensure storage directory and file exist
 */
async function ensureStorage(): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });

    try {
      await fs.access(STORAGE_FILE);
    } catch {
      // File doesn't exist, create it with empty array
      await fs.writeFile(STORAGE_FILE, JSON.stringify([], null, 2));
    }
  } catch (error) {
    console.error('Failed to ensure storage:', error);
    throw error;
  }
}

/**
 * Load bookmarks from file
 */
async function loadBookmarks(): Promise<Bookmark[]> {
  if (bookmarksCache) {
    return bookmarksCache;
  }

  await ensureStorage();

  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    const bookmarks = JSON.parse(data);

    // Convert date strings back to Date objects
    bookmarksCache = bookmarks.map((b: any) => ({
      ...b,
      createdAt: new Date(b.createdAt),
      updatedAt: new Date(b.updatedAt),
      processedAt: b.processedAt ? new Date(b.processedAt) : undefined,
      embeddedAt: b.embeddedAt ? new Date(b.embeddedAt) : undefined,
    }));

    return bookmarksCache;
  } catch (error) {
    console.error('Failed to load bookmarks:', error);
    return [];
  }
}

/**
 * Save bookmarks to file
 */
async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  bookmarksCache = bookmarks;

  try {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(bookmarks, null, 2));
  } catch (error) {
    console.error('Failed to save bookmarks:', error);
    throw error;
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    if (!url) return 'example.com';
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'example.com';
  }
}

/**
 * Get all bookmarks with optional filtering
 */
export async function getBookmarks(filters?: {
  query?: string;
  type?: string;
  source?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<Bookmark[]> {
  let bookmarks = await loadBookmarks();

  // Apply filters
  if (filters?.query) {
    const q = filters.query.toLowerCase();
    bookmarks = bookmarks.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.domain.toLowerCase().includes(q) ||
      b.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }

  if (filters?.type) {
    bookmarks = bookmarks.filter(b => b.contentType === filters.type);
  }

  if (filters?.dateFrom) {
    bookmarks = bookmarks.filter(b => new Date(b.createdAt) >= filters.dateFrom!);
  }

  if (filters?.dateTo) {
    bookmarks = bookmarks.filter(b => new Date(b.createdAt) <= filters.dateTo!);
  }

  // Sort by updatedAt descending (most recent first)
  return bookmarks.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Get bookmark by ID
 */
export async function getBookmarkById(id: string): Promise<Bookmark | null> {
  const bookmarks = await loadBookmarks();
  return bookmarks.find(b => b.id === id) || null;
}

/**
 * Create a new bookmark
 */
export async function createBookmark(data: {
  url: string;
  title?: string;
}): Promise<Bookmark> {
  const bookmarks = await loadBookmarks();

  const domain = extractDomain(data.url);
  const now = new Date();

  const bookmark: Bookmark = {
    id: uuidv4(),
    url: data.url || '',
    title: data.title || domain || 'New Bookmark',
    domain,
    summary: undefined,
    contentType: 'other',
    tags: [],
    createdAt: now,
    updatedAt: now,
    processedAt: undefined,
    embedding: undefined,
    embeddedAt: undefined,
  };

  bookmarks.push(bookmark);
  await saveBookmarks(bookmarks);

  return bookmark;
}

/**
 * Update an existing bookmark
 */
export async function updateBookmark(id: string, updates: Partial<Bookmark>): Promise<Bookmark | null> {
  const bookmarks = await loadBookmarks();
  const index = bookmarks.findIndex(b => b.id === id);

  if (index === -1) {
    return null;
  }

  // Update bookmark
  const updated: Bookmark = {
    ...bookmarks[index],
    ...updates,
    id: bookmarks[index].id, // Preserve original ID
    createdAt: bookmarks[index].createdAt, // Preserve creation date
    updatedAt: new Date(), // Update timestamp
  };

  bookmarks[index] = updated;
  await saveBookmarks(bookmarks);

  return updated;
}

/**
 * Delete a bookmark
 */
export async function deleteBookmark(id: string): Promise<boolean> {
  const bookmarks = await loadBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);

  if (filtered.length === bookmarks.length) {
    return false; // Bookmark not found
  }

  await saveBookmarks(filtered);
  return true;
}

/**
 * Clear cache (useful for testing)
 */
export function clearCache(): void {
  bookmarksCache = null;
}
