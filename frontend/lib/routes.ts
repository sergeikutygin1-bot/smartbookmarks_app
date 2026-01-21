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
 * Backend URL for direct API calls
 * - Server-side (Next.js API routes): uses BACKEND_URL (Docker internal network)
 * - Client-side (browser): uses NEXT_PUBLIC_BACKEND_URL (localhost:3002)
 */
const BACKEND_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002')
  : (process.env.BACKEND_URL || 'http://localhost:3002');

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
 * Type-safe route definitions for the Smart Bookmarks API (v1)
 */
export const apiRoutes = {
  /**
   * Bookmark-related endpoints (direct to backend with credentials)
   */
  bookmarks: {
    /**
     * GET /api/v1/bookmarks - List all bookmarks with optional filters
     */
    list: (filters?: BookmarkFilters) =>
      `${BACKEND_URL}/api/v1/bookmarks${buildQueryString(filters)}` as const,

    /**
     * GET /api/v1/bookmarks/:id - Get a single bookmark by ID
     */
    detail: (id: string) => `${BACKEND_URL}/api/v1/bookmarks/${id}` as const,

    /**
     * POST /api/v1/bookmarks - Create a new bookmark
     */
    create: () => `${BACKEND_URL}/api/v1/bookmarks` as const,

    /**
     * PATCH /api/v1/bookmarks/:id - Update an existing bookmark
     */
    update: (id: string) => `${BACKEND_URL}/api/v1/bookmarks/${id}` as const,

    /**
     * DELETE /api/v1/bookmarks/:id - Delete a bookmark
     */
    delete: (id: string) => `${BACKEND_URL}/api/v1/bookmarks/${id}` as const,

    /**
     * POST /api/v1/bookmarks/:id/enrich - Queue AI enrichment for a bookmark
     */
    enrich: (id: string) => `${BACKEND_URL}/api/v1/bookmarks/${id}/enrich` as const,
  },

  /**
   * Enrichment job status endpoints (direct to backend)
   */
  enrich: {
    /**
     * GET /api/v1/enrich/:jobId - Poll enrichment job status
     */
    status: (jobId: string) => `${BACKEND_URL}/api/v1/enrich/${jobId}` as const,

    /**
     * GET /api/v1/enrich/:jobId/stream - Server-Sent Events for enrichment status
     */
    stream: (jobId: string) => `${BACKEND_URL}/api/v1/enrich/${jobId}/stream` as const,
  },

  /**
   * Search endpoints (direct to backend)
   */
  search: {
    /**
     * GET /api/v1/search - Hybrid search (keyword + semantic)
     */
    hybrid: (query: string, mode?: 'keyword' | 'semantic' | 'hybrid', limit?: number) => {
      const params = new URLSearchParams({
        q: query,
        mode: mode || 'hybrid',
        limit: String(limit || 50),
      });
      return `${BACKEND_URL}/api/v1/search?${params}` as const;
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
