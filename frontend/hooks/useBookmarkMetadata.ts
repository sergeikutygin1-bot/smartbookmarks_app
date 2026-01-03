import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export interface BookmarkMetadata {
  concepts: Array<{
    id: string;
    name: string;
    weight: number;
  }>;
  entities: Array<{
    id: string;
    name: string;
    entityType: 'person' | 'company' | 'technology' | 'product' | 'location';
    weight: number;
  }>;
}

/**
 * Poll the metadata endpoint until we get real data
 * This addresses the race condition where graph workers haven't finished yet
 *
 * The flow is:
 * 1. Enrichment completes → API returns
 * 2. Frontend invalidates metadata cache
 * 3. Frontend attempts to refetch
 * 4. But graph workers (entity, concept extraction) still running
 * 5. Database queries return empty relationships
 * 6. Frontend caches empty result for 5 minutes
 *
 * Solution: Keep polling until we get actual results (concepts/entities)
 * or timeout after 30 seconds
 */
async function pollMetadataUntilReady(
  bookmarkId: string,
  maxAttempts: number = 30,
  delayMs: number = 1000
): Promise<BookmarkMetadata> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `/api/graph/bookmarks/${bookmarkId}/related`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch bookmark metadata');
      }

      const result = await response.json();

      const metadata: BookmarkMetadata = {
        concepts: result.data?.concepts?.map((c: any) => ({
          id: c.concept.id,
          name: c.concept.name,
          weight: c.weight,
        })) || [],
        entities: result.data?.entities?.map((e: any) => ({
          id: e.entity.id,
          name: e.entity.name,
          entityType: e.entity.entityType,
          weight: e.weight,
        })) || [],
      };

      // If we got any metadata, return it immediately
      // This means graph workers have processed the bookmark
      if (metadata.concepts.length > 0 || metadata.entities.length > 0) {
        console.log(
          `[useBookmarkMetadata] Got metadata for ${bookmarkId} after ${attempt + 1} poll(s):`,
          metadata
        );
        return metadata;
      }

      // Empty result on first attempt - likely graph jobs haven't processed yet
      if (attempt === 0) {
        console.log(
          `[useBookmarkMetadata] Initial fetch returned empty metadata for ${bookmarkId}, polling...`
        );
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[useBookmarkMetadata] Poll attempt ${attempt + 1}/${maxAttempts} failed:`,
        lastError.message
      );
    }

    // Wait before next poll (except on last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // After 30 attempts (30 seconds), return empty result
  // Graph workers likely failed or bookmark has no entities/concepts
  console.warn(
    `[useBookmarkMetadata] Polling timeout for ${bookmarkId}, returning empty metadata`
  );
  return { concepts: [], entities: [] };
}

/**
 * Fetch concepts and entities for a specific bookmark
 * Includes automatic polling to wait for graph worker completion
 *
 * Uses React Query for caching (5min stale time)
 *
 * @param bookmarkId - The ID of the bookmark to fetch metadata for
 * @param forceRefresh - If true, bypass cache and poll for new data
 * @returns Query result with concepts and entities
 */
export function useBookmarkMetadata(
  bookmarkId: string | null,
  forceRefresh?: boolean
) {
  const queryClient = useQueryClient();
  const pollingAttemptRef = useRef<number>(0);

  const query = useQuery({
    queryKey: ['bookmark-metadata-v2', bookmarkId],
    queryFn: async (): Promise<BookmarkMetadata> => {
      // Don't fetch for null or temporary IDs (temp-*)
      if (!bookmarkId || bookmarkId.startsWith('temp-')) {
        return { concepts: [], entities: [] };
      }

      // If forceRefresh is true, poll until we get results
      // This is triggered after enrichment completes
      if (forceRefresh) {
        console.log(`[useBookmarkMetadata] Force refresh with polling for ${bookmarkId}`);
        pollingAttemptRef.current++;
        return pollMetadataUntilReady(bookmarkId);
      }

      // Normal query - single fetch attempt
      const response = await fetch(
        `/api/graph/bookmarks/${bookmarkId}/related`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch bookmark metadata');
      }

      const result = await response.json();

      return {
        concepts: result.data?.concepts?.map((c: any) => ({
          id: c.concept.id,
          name: c.concept.name,
          weight: c.weight,
        })) || [],
        entities: result.data?.entities?.map((e: any) => ({
          id: e.entity.id,
          name: e.entity.name,
          entityType: e.entity.entityType,
          weight: e.weight,
        })) || [],
      };
    },
    enabled: !!bookmarkId,
    staleTime: 1000 * 60 * 5, // 5 minutes - concepts/entities don't change frequently
  });

  return query;
}

/**
 * Trigger a refresh of bookmark metadata after enrichment
 * This function should be called from useEnrichBookmark's onSuccess handler
 *
 * It will poll the metadata endpoint until real data arrives
 * (accounting for graph worker processing delays)
 */
export function useRefreshBookmarkMetadata() {
  const queryClient = useQueryClient();

  return (bookmarkId: string) => {
    console.log(`[useRefreshBookmarkMetadata] Refreshing metadata for ${bookmarkId}`);

    // Invalidate the query to trigger a refetch
    // The refetch will use polling logic to wait for graph workers
    queryClient.invalidateQueries({
      queryKey: ['bookmark-metadata-v2', bookmarkId],
    });

    // Also manually trigger a refetch with polling
    // This ensures we don't get stuck with empty cached data
    queryClient.fetchQuery({
      queryKey: ['bookmark-metadata-v2', bookmarkId],
      queryFn: async (): Promise<BookmarkMetadata> => {
        console.log(`[useRefreshBookmarkMetadata] Polling for ${bookmarkId}`);
        return pollMetadataUntilReady(bookmarkId);
      },
    });
  };
}
