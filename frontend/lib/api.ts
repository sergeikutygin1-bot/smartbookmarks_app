import { Bookmark } from '@/store/bookmarksStore';

const API_BASE = '/api';

/**
 * Retry utility with exponential backoff
 * @param fn Function to retry
 * @param retries Number of retry attempts (default: 3)
 * @param delay Initial delay in ms (default: 1000)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if the request was aborted - just throw immediately
      if (lastError.name === 'AbortError') {
        console.log(`[Retry] Request was aborted, not retrying`);
        throw lastError;
      }

      // Don't retry on the last attempt
      if (attempt === retries) {
        break;
      }

      // Calculate exponential backoff delay: 1s, 2s, 4s
      const backoffDelay = delay * Math.pow(2, attempt);

      console.log(
        `[Retry] Attempt ${attempt + 1}/${retries + 1} failed. Retrying in ${backoffDelay}ms...`,
        lastError.message
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  // All retries exhausted, throw enriched error with attempt count
  const enrichedError = new Error(
    `Failed after ${retries + 1} attempts: ${lastError?.message || 'Unknown error'}`
  );
  throw enrichedError;
}

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
   * Automatically retries up to 3 times with exponential backoff (1s, 2s, 4s)
   */
  async enrich(id: string, signal?: AbortSignal): Promise<Bookmark> {
    console.log(`[API] Starting enrichment for bookmark: ${id}`);

    return retryWithBackoff(async () => {
      console.log(`[API] Sending enrichment request for: ${id}`);

      const response = await fetch(`${API_BASE}/bookmarks/${id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal, // Pass abort signal to fetch
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        // Create detailed error message based on response status
        let errorMessage = error.error || error.message || 'Failed to enrich bookmark';

        if (response.status === 500) {
          errorMessage = `Server error: ${errorMessage}`;
        } else if (response.status === 404) {
          errorMessage = 'Bookmark not found';
        } else if (response.status === 400) {
          errorMessage = `Invalid request: ${errorMessage}`;
        } else if (response.status === 504 || response.status === 502) {
          errorMessage = 'Request timeout - the AI service took too long to respond';
        }

        throw new Error(errorMessage);
      }

      const json = await response.json();

      console.log(`[API] Enrichment successful for bookmark: ${id}`);

      return {
        ...json.data,
        createdAt: new Date(json.data.createdAt),
        updatedAt: new Date(json.data.updatedAt),
        processedAt: json.data.processedAt ? new Date(json.data.processedAt) : null,
      };
    }, 3, 1000); // 3 retries with 1s initial delay (total: 4 attempts with 1s, 2s, 4s backoff)
  },

  /**
   * Search bookmarks using hybrid search (keyword + semantic)
   * This calls the backend search service which combines both approaches
   */
  async searchHybrid(
    query: string,
    bookmarks: Bookmark[],
    options?: {
      topK?: number;
      semanticWeight?: number;
      minScore?: number;
    }
  ): Promise<{ bookmarks: Bookmark[]; results: any[] }> {
    // If no query or no bookmarks, return empty
    if (!query.trim() || bookmarks.length === 0) {
      return { bookmarks: [], results: [] };
    }

    // Prepare searchable items (include only necessary fields for backend)
    const searchableItems = bookmarks.map((b) => ({
      id: b.id,
      title: b.title,
      tags: b.tags,
      summary: b.summary || '',
      embedding: b.embedding,
    }));

    // Call backend search endpoint
    const response = await fetch('http://localhost:3002/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        bookmarks: searchableItems,
        topK: options?.topK || 10,
        semanticWeight: options?.semanticWeight || 0.6,
        minScore: options?.minScore || 0.3,
      }),
    });

    if (!response.ok) {
      console.error('Hybrid search failed, falling back to keyword search');
      // Fallback to keyword-only filtering
      const filtered = bookmarks.filter((b) =>
        b.title.toLowerCase().includes(query.toLowerCase()) ||
        b.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
      );
      return {
        bookmarks: filtered,
        results: filtered.map((b) => ({
          id: b.id,
          hybridScore: 0.5,
          keywordScore: 0.5,
          semanticScore: 0,
        })),
      };
    }

    const json = await response.json();

    // Reorder bookmarks based on search results
    const bookmarkMap = new Map(bookmarks.map((b) => [b.id, b]));
    const rankedBookmarks = json.results
      .map((result: any) => bookmarkMap.get(result.id))
      .filter((b): b is Bookmark => b !== undefined);

    return {
      bookmarks: rankedBookmarks,
      results: json.results,
    };
  },
};
