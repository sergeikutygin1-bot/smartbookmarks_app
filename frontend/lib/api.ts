import { Bookmark } from '@/store/bookmarksStore';

const API_BASE = '/api';

/**
 * API client for bookmarks
 */
export const bookmarksApi = {
  /**
   * Fetch all bookmarks
   */
  async getAll(): Promise<Bookmark[]> {
    const response = await fetch(`${API_BASE}/bookmarks`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch bookmarks');
    }

    const json = await response.json();

    // Convert date strings back to Date objects
    return json.data.map((bookmark: any) => ({
      ...bookmark,
      createdAt: new Date(bookmark.createdAt),
      updatedAt: new Date(bookmark.updatedAt),
      processedAt: bookmark.processedAt ? new Date(bookmark.processedAt) : null,
    }));
  },

  /**
   * Get a single bookmark by ID
   */
  async getById(id: string): Promise<Bookmark> {
    const response = await fetch(`${API_BASE}/bookmarks/${id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch bookmark');
    }

    const json = await response.json();

    return {
      ...json.data,
      createdAt: new Date(json.data.createdAt),
      updatedAt: new Date(json.data.updatedAt),
      processedAt: json.data.processedAt ? new Date(json.data.processedAt) : null,
    };
  },

  /**
   * Create a new bookmark
   */
  async create(data: { url: string; title?: string }): Promise<Bookmark> {
    const response = await fetch(`${API_BASE}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create bookmark');
    }

    const json = await response.json();

    return {
      ...json.data,
      createdAt: new Date(json.data.createdAt),
      updatedAt: new Date(json.data.updatedAt),
      processedAt: json.data.processedAt ? new Date(json.data.processedAt) : null,
    };
  },

  /**
   * Update a bookmark
   */
  async update(id: string, data: Partial<Bookmark>): Promise<Bookmark> {
    const response = await fetch(`${API_BASE}/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to update bookmark');
    }

    const json = await response.json();

    return {
      ...json.data,
      createdAt: new Date(json.data.createdAt),
      updatedAt: new Date(json.data.updatedAt),
      processedAt: json.data.processedAt ? new Date(json.data.processedAt) : null,
    };
  },

  /**
   * Delete a bookmark
   */
  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/bookmarks/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to delete bookmark');
    }
  },
};
