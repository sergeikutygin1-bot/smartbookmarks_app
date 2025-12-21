import { Bookmark } from '@/store/bookmarksStore';
import { toast } from 'sonner';
import { apiRoutes } from './routes';

const API_BASE = '/api';

/**
 * Custom error for rate limiting (429 responses)
 */
export class RateLimitError extends Error {
  retryAfter: number;
  limit?: number;
  window?: string;

  constructor(message: string, retryAfter: number, limit?: number, window?: string) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.window = window;
  }
}

/**
 * Helper to handle API responses and extract errors
 */
async function handleResponse(response: Response): Promise<any> {
  // Handle rate limiting (429 Too Many Requests)
  if (response.status === 429) {
    const data = await response.json().catch(() => ({
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60,
    }));

    const retryAfter = data.retryAfter || parseInt(response.headers.get('Retry-After') || '60');
    const message = data.message || 'Too many requests. Please slow down.';
    const limit = data.limit;
    const window = data.window;

    // Show user-friendly toast notification
    const retryMinutes = Math.ceil(retryAfter / 60);
    const retrySeconds = retryAfter % 60;
    const timeMsg = retryMinutes > 0
      ? `${retryMinutes} minute${retryMinutes > 1 ? 's' : ''}`
      : `${retrySeconds} second${retrySeconds !== 1 ? 's' : ''}`;

    toast.error(`Rate limit exceeded`, {
      description: `Please try again in ${timeMsg}.`,
      duration: 5000,
    });

    throw new RateLimitError(message, retryAfter, limit, window);
  }

  // Handle other errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: `Request failed with status ${response.status}`,
    }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

/**
 * Transform backend bookmark data to frontend format
 * Converts nested tag objects to simple string array
 */
function transformBookmark(bookmark: any): any {
  return {
    ...bookmark,
    tags: bookmark.tags?.map((t: any) =>
      typeof t === 'string' ? t : t.tag?.name || t.name || String(t)
    ) || [],
    createdAt: new Date(bookmark.createdAt),
    updatedAt: new Date(bookmark.updatedAt),
    processedAt: bookmark.processedAt ? new Date(bookmark.processedAt) : null,
  };
}

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

      // Don't retry rate limit errors (user needs to wait)
      if (lastError instanceof RateLimitError) {
        console.log(`[Retry] Rate limit error, not retrying`);
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
    const response = await fetch(apiRoutes.bookmarks.list(filters), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const json = await handleResponse(response);

    // Transform bookmarks (handles dates and tag structure)
    return json.data.map(transformBookmark);
  },

  /**
   * Get a single bookmark by ID
   */
  async getById(id: string): Promise<Bookmark> {
    const response = await fetch(apiRoutes.bookmarks.detail(id), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const json = await handleResponse(response);

    return transformBookmark(json.data);
  },

  /**
   * Create a new bookmark
   */
  async create(data: { url: string; title?: string }): Promise<Bookmark> {
    const response = await fetch(apiRoutes.bookmarks.create(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await handleResponse(response);

    return transformBookmark(json.data);
  },

  /**
   * Update a bookmark
   */
  async update(id: string, data: Partial<Bookmark>): Promise<Bookmark> {
    const response = await fetch(apiRoutes.bookmarks.update(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await handleResponse(response);

    return transformBookmark(json.data);
  },

  /**
   * Delete a bookmark
   */
  async delete(id: string): Promise<void> {
    const response = await fetch(apiRoutes.bookmarks.delete(id), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    await handleResponse(response);
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

      const response = await fetch(apiRoutes.enrich.status(jobId), { signal });

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

      const queueResponse = await fetch(apiRoutes.bookmarks.enrich(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });

      const queueData = await handleResponse(queueResponse);
      const { jobId } = queueData;
      console.log(`[API] Job queued: ${jobId} for bookmark: ${id}`);

      // Step 2: Poll for job completion (CLIENT-SIDE polling in browser)
      const result = await this.pollJobStatus(jobId, signal);

      // Step 3: Fetch the updated bookmark from database
      // Note: Worker already saved all enrichment results (title, summary, tags, embedding)
      // So we just need to fetch the updated bookmark instead of PATCHing again
      console.log(`[API] Fetching updated bookmark: ${id}`);

      const fetchResponse = await fetch(apiRoutes.bookmarks.detail(id), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });

      const json = await handleResponse(fetchResponse);
      console.log(`[API] Enrichment completed successfully for: ${id}`);

      return transformBookmark(json.data);
    }, 3, 1000); // 3 retries with 1s initial delay (total: 4 attempts with 1s, 2s, 4s backoff)
  },

  /**
   * Search bookmarks using hybrid search (keyword + semantic)
   * This calls the backend search service which combines both approaches
   */
  async searchHybrid(
    query: string,
    options?: {
      limit?: number;
      mode?: 'keyword' | 'semantic' | 'hybrid';
    }
  ): Promise<Bookmark[]> {
    // If no query, return empty
    if (!query.trim()) {
      return [];
    }

    // Call backend search endpoint with GET request
    const response = await fetch(apiRoutes.search.hybrid(query, options?.mode, options?.limit));

    const json = await handleResponse(response);

    // Backend returns { data: [...], metadata: {...} }
    // Transform bookmarks (handles dates and tag structure)
    return (json.data || []).map(transformBookmark);
  },
};
