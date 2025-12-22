import { BookmarkFilters } from './api';

/**
 * Type-safe API route builders
 *
 * Benefits:
 * - Compile-time validation of route paths
 * - Autocomplete for all endpoints in IDE
 * - Single source of truth for API routes
 * - Prevents typos that would cause runtime 404s
 *
 * Usage:
 * ```ts
 * // Before:
 * fetch(`/api/bookmarks/${id}`)
 *
 * // After:
 * fetch(apiRoutes.bookmarks.detail(id))
 * ```
 */

/**
 * Helper to build query string from filter parameters
 */
function buildQueryString(filters?: BookmarkFilters): string {
  if (!filters) return '';

  const params = new URLSearchParams();

  if (filters.searchQuery) {
    params.append('q', filters.searchQuery);
  }

  if (filters.types && filters.types.length > 0) {
    // For multiple types, send the first one for now
    // Can be enhanced to support multiple types in the future
    params.append('type', filters.types[0]);
  }

  if (filters.sources && filters.sources.length > 0) {
    // For multiple sources, send the first one for now
    params.append('source', filters.sources[0]);
  }

  if (filters.dateFrom) {
    params.append('dateFrom', filters.dateFrom.toISOString());
  }

  if (filters.dateTo) {
    params.append('dateTo', filters.dateTo.toISOString());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Type-safe route definitions for the Smart Bookmarks API
 */
export const apiRoutes = {
  /**
   * Bookmark-related endpoints
   */
  bookmarks: {
    /**
     * GET /api/bookmarks - List all bookmarks with optional filters
     */
    list: (filters?: BookmarkFilters) =>
      `/api/bookmarks${buildQueryString(filters)}` as const,

    /**
     * GET /api/bookmarks/:id - Get a single bookmark by ID
     */
    detail: (id: string) => `/api/bookmarks/${id}` as const,

    /**
     * POST /api/bookmarks - Create a new bookmark
     */
    create: () => '/api/bookmarks' as const,

    /**
     * PATCH /api/bookmarks/:id - Update an existing bookmark
     */
    update: (id: string) => `/api/bookmarks/${id}` as const,

    /**
     * DELETE /api/bookmarks/:id - Delete a bookmark
     */
    delete: (id: string) => `/api/bookmarks/${id}` as const,

    /**
     * POST /api/bookmarks/:id/enrich - Queue AI enrichment for a bookmark
     */
    enrich: (id: string) => `/api/bookmarks/${id}/enrich` as const,
  },

  /**
   * Enrichment job status endpoints
   */
  enrich: {
    /**
     * GET /api/enrich/:jobId - Poll enrichment job status
     */
    status: (jobId: string) => `/api/enrich/${jobId}` as const,

    /**
     * GET /api/enrich/:jobId/stream - Server-Sent Events for enrichment status
     * (To be implemented in future)
     */
    stream: (jobId: string) => `/api/enrich/${jobId}/stream` as const,
  },

  /**
   * Search endpoints
   */
  search: {
    /**
     * GET http://localhost:3002/search - Hybrid search (keyword + semantic)
     * Note: This goes directly to backend, not through Next.js API routes
     */
    hybrid: (query: string, mode?: 'keyword' | 'semantic' | 'hybrid', limit?: number) => {
      const params = new URLSearchParams({
        q: query,
        mode: mode || 'hybrid',
        limit: String(limit || 50),
      });
      return `http://localhost:3002/search?${params}` as const;
    },
  },
} as const;

/**
 * Type helper to extract route string from a route builder function
 *
 * @example
 * type DetailRoute = RouteString<typeof apiRoutes.bookmarks.detail>;
 * // Result: `/api/bookmarks/${string}`
 */
export type RouteString<T extends (...args: any[]) => string> = ReturnType<T>;
