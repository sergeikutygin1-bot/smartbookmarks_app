import { Bookmark } from '@/store/bookmarksStore';

const API_BASE = '/api';

export interface BookmarkFilters {
  searchQuery?: string;
  types?: string[];
  sources?: string[];
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

/**
 * API client for bookmarks
 */
export const bookmarksApi = {
  /**
   * Fetch all bookmarks with optional filters
   */
  async getAll(filters?: BookmarkFilters): Promise<Bookmark[]> {
    // Build query string from filters
    const params = new URLSearchParams();

    if (filters?.searchQuery) {
      params.append('q', filters.searchQuery);
    }

    if (filters?.types && filters.types.length > 0) {
      // For multiple types, we'll send the first one for now
      // Can be enhanced to support multiple types in the future
      params.append('type', filters.types[0]);
    }

    if (filters?.sources && filters.sources.length > 0) {
      // For multiple sources, we'll send the first one for now
      params.append('source', filters.sources[0]);
    }

    if (filters?.dateFrom) {
      params.append('dateFrom', filters.dateFrom.toISOString());
    }

    if (filters?.dateTo) {
      params.append('dateTo', filters.dateTo.toISOString());
    }

    const queryString = params.toString();
    const url = queryString ? `${API_BASE}/bookmarks?${queryString}` : `${API_BASE}/bookmarks`;

    const response = await fetch(url, {
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

  /**
   * Enrich a bookmark with AI-generated metadata
   */
  async enrich(id: string): Promise<Bookmark> {
    const response = await fetch(`${API_BASE}/bookmarks/${id}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to enrich bookmark');
    }

    const json = await response.json();

    return {
      ...json.data,
      createdAt: new Date(json.data.createdAt),
      updatedAt: new Date(json.data.updatedAt),
      processedAt: json.data.processedAt ? new Date(json.data.processedAt) : null,
    };
  },
};
