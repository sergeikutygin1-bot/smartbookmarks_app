import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { authenticatedFetch } from '@/lib/api';

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
  maxAttempts: number = 40,
  delayMs: number = 1000
): Promise<BookmarkMetadata> {
  let lastError: Error | null = null;
  const minPollsBeforePartial = 30; // Wait at least 30 seconds for complete data (graph workers need time)

  let lastConceptCount = 0;
  let lastEntityCount = 0;
  let stableCount = 0;
  const stabilityThreshold = 3; // Need 3 consecutive polls with same count

  console.log(`🔍 Waiting for graph workers to complete (min ${minPollsBeforePartial}s, max ${maxAttempts}s)...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await authenticatedFetch(
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

      const conceptCount = metadata.concepts.length;
      const entityCount = metadata.entities.length;
      const hasAnyMetadata = conceptCount > 0 || entityCount > 0;

      // Check if counts are stable (not changing between polls)
      if (conceptCount === lastConceptCount && entityCount === lastEntityCount) {
        stableCount++;
      } else {
        stableCount = 0; // Reset if counts changed
        // Log when counts change (graph workers still processing)
        if (attempt > 0 && hasAnyMetadata) {
          console.log(
            `⏳ Graph workers processing... ${conceptCount} concepts, ${entityCount} entities (poll ${attempt + 1})`
          );
        }
      }

      lastConceptCount = conceptCount;
      lastEntityCount = entityCount;

      // Accept results ONLY if:
      // 1. We've waited at least the minimum time (30 seconds)
      // 2. AND counts have been stable for 3 consecutive polls
      // 3. AND we have at least some data
      // This prevents accepting partial results while graph workers are still processing
      if (attempt >= minPollsBeforePartial && stableCount >= stabilityThreshold && hasAnyMetadata) {
        console.log(
          `✅ Metadata ready: ${conceptCount} concepts, ${entityCount} entities (after ${attempt + 1} polls)`
        );
        return metadata;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Poll attempt ${attempt + 1}/${maxAttempts} failed:`,
        lastError.message
      );
    }

    // Wait before next poll (except on last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // After max attempts, return what we have (might be empty)
  console.warn(
    `⚠️ Polling timeout, returning: ${lastConceptCount} concepts, ${lastEntityCount} entities`
  );
  return {
    concepts: [],
    entities: []
  };
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
    queryKey: ['bookmark-metadata-v5', bookmarkId], // v5: Force cache invalidation
    queryFn: async (): Promise<BookmarkMetadata> => {
      // Don't fetch for null or temporary IDs (temp-*)
      if (!bookmarkId || bookmarkId.startsWith('temp-')) {
        return { concepts: [], entities: [] };
      }

      // If forceRefresh is true, poll until we get results
      // This is triggered after enrichment completes
      if (forceRefresh) {
        pollingAttemptRef.current++;
        return pollMetadataUntilReady(bookmarkId);
      }

      // Normal query - single fetch attempt
      const response = await authenticatedFetch(
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
    enabled: !!bookmarkId && !bookmarkId.startsWith('temp-'), // Skip temporary bookmarks
    staleTime: 1000 * 60 * 5, // 5 minutes - concepts/entities don't change frequently
    refetchOnWindowFocus: false, // Don't refetch when switching tabs - metadata is stable after enrichment
    refetchOnMount: false, // Don't refetch when component mounts - use cached data
    refetchOnReconnect: false, // Don't refetch on network reconnect - metadata doesn't change
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

  return async (bookmarkId: string) => {
    // Poll until metadata is available
    const metadata = await pollMetadataUntilReady(bookmarkId);

    // CRITICAL: Set the polled data in the cache
    // This ensures all components using this query get the fresh data
    // React Query will notify all subscribers of this cache key
    const cacheKey = ['bookmark-metadata-v5', bookmarkId];

    queryClient.setQueryData(cacheKey, metadata);

    // Verify the cache was actually set
    const cachedData = queryClient.getQueryData(cacheKey);

    if (!cachedData) {
      console.error(`❌ Cache update failed`);
    }
  };
}
