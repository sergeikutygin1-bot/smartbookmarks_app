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

      // Don't retry URL validation errors (retrying won't help if URL doesn't exist)
      if (lastError.name === 'URLValidationError') {
        console.log(`[Retry] URL validation error, not retrying`);
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

  // All retries exhausted, throw error with attempt count
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
   * Poll job status until completion
   * CLIENT-SIDE polling - runs in the browser, not on the server
   */
  async pollJobStatus(jobId: string, signal?: AbortSignal, maxAttempts: number = 60): Promise<any> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if aborted
      if (signal?.aborted) {
        throw new Error('Enrichment cancelled');
      }

      const response = await fetch(`${API_BASE}/enrich/${jobId}`, { signal });

      if (!response.ok) {
        throw new Error('Failed to get job status');
      }

      const statusData = await response.json();
      console.log(`[API] Poll ${attempt + 1}/${maxAttempts}: status=${statusData.status}`);

      if (statusData.status === 'completed' && statusData.result) {
        console.log(`[API] Job ${jobId} completed after ${attempt + 1} polls`);
        return statusData.result;
      }

      if (statusData.status === 'failed') {
        const errorMessage = statusData.error || 'Enrichment job failed';

        // Check if URL validation error (don't retry these)
        const isUrlError = errorMessage.includes('URL could not be accessed') ||
                          errorMessage.includes('not accessible') ||
                          errorMessage.includes('Could not connect');

        if (isUrlError) {
          const error = new Error(errorMessage);
          error.name = 'URLValidationError';
          throw error;
        }

        throw new Error(errorMessage);
      }

      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Enrichment timed out after 2 minutes');
  },

  /**
   * Enrich a bookmark with AI-generated metadata
   * Uses CLIENT-SIDE polling for job status (browser polls, not server)
   * Automatically retries up to 3 times with exponential backoff (1s, 2s, 4s)
   */
  async enrich(id: string, signal?: AbortSignal): Promise<Bookmark> {
    console.log(`[API] Starting enrichment for bookmark: ${id}`);

    return retryWithBackoff(async () => {
      // Step 1: Queue the enrichment job (returns immediately)
      console.log(`[API] Queueing enrichment job for: ${id}`);

      const queueResponse = await fetch(`${API_BASE}/bookmarks/${id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });

      if (!queueResponse.ok) {
        const error = await queueResponse.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to queue enrichment');
      }

      const { jobId } = await queueResponse.json();
      console.log(`[API] Job queued: ${jobId} for bookmark: ${id}`);

      // Step 2: Poll for job completion (CLIENT-SIDE polling in browser)
      const result = await this.pollJobStatus(jobId, signal);

      // Step 3: Save enrichment results to bookmark
      console.log(`[API] Saving enrichment results for: ${id}`);

      const saveResponse = await fetch(`${API_BASE}/bookmarks/${id}/enrich`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
        signal,
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save enrichment results');
      }

      const json = await saveResponse.json();
      console.log(`[API] Enrichment completed successfully for: ${id}`);

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
