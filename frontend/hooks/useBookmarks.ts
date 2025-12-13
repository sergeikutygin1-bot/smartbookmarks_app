import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi, BookmarkFilters } from '@/lib/api';
import { Bookmark } from '@/store/bookmarksStore';
import { enrichmentQueue } from '@/lib/concurrency';
import { useEnrichmentStore } from '@/store/enrichmentStore';
import { enrichmentLogger } from '@/lib/enrichmentLogger';

/**
 * Query key factory for bookmarks
 */
export const bookmarksKeys = {
  all: ['bookmarks'] as const,
  lists: () => [...bookmarksKeys.all, 'list'] as const,
  list: (filters: BookmarkFilters) => [...bookmarksKeys.lists(), filters] as const,
  details: () => [...bookmarksKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookmarksKeys.details(), id] as const,
};

/**
 * Fetch all bookmarks with optional filters
 */
export function useBookmarks(filters?: BookmarkFilters) {
  return useQuery({
    queryKey: filters ? bookmarksKeys.list(filters) : bookmarksKeys.lists(),
    queryFn: () => bookmarksApi.getAll(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Fetch a single bookmark by ID
 */
export function useBookmark(id: string) {
  return useQuery({
    queryKey: bookmarksKeys.detail(id),
    queryFn: () => bookmarksApi.getById(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Create a new bookmark with optimistic updates
 */
export function useCreateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { url: string; title?: string }) => bookmarksApi.create(data),
    onMutate: async (newBookmarkData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });

      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());

      // Optimistically update with temporary ID
      const optimisticBookmark: Bookmark = {
        id: 'temp-' + Date.now(),
        url: newBookmarkData.url,
        title: newBookmarkData.title || newBookmarkData.url,
        domain: new URL(newBookmarkData.url).hostname.replace('www.', ''),
        contentType: 'other',
        tags: [],
        summary: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      queryClient.setQueryData<Bookmark[]>(
        bookmarksKeys.lists(),
        (old) => [optimisticBookmark, ...(old || [])]
      );

      return { previousBookmarks };
    },
    onError: (err, newBookmark, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
    },
  });
}

/**
 * Update a bookmark with optimistic updates
 */
export function useUpdateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Bookmark> }) =>
      bookmarksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.detail(id) });

      // Snapshot previous values
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());
      const previousBookmark = queryClient.getQueryData<Bookmark>(bookmarksKeys.detail(id));

      // Optimistically update lists
      queryClient.setQueryData<Bookmark[]>(bookmarksKeys.lists(), (old) =>
        old?.map((bookmark) =>
          bookmark.id === id
            ? { ...bookmark, ...data, updatedAt: new Date() }
            : bookmark
        )
      );

      // Optimistically update single bookmark
      if (previousBookmark) {
        queryClient.setQueryData<Bookmark>(bookmarksKeys.detail(id), {
          ...previousBookmark,
          ...data,
          updatedAt: new Date(),
        });
      }

      return { previousBookmarks, previousBookmark };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
      if (context?.previousBookmark) {
        queryClient.setQueryData(bookmarksKeys.detail(id), context.previousBookmark);
      }
    },
    onSuccess: (data, { id }) => {
      // Update cache with server response
      queryClient.setQueryData(bookmarksKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
    },
  });
}

/**
 * Delete a bookmark with optimistic updates
 */
export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  const { cancelEnrichment } = useEnrichmentStore();

  return useMutation({
    mutationFn: (id: string) => bookmarksApi.delete(id),
    onMutate: async (id) => {
      console.log(`[useDeleteBookmark] Deleting bookmark: ${id}`);

      // Cancel any ongoing enrichment for this bookmark
      cancelEnrichment(id);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });

      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());

      // Optimistically remove from list
      queryClient.setQueryData<Bookmark[]>(
        bookmarksKeys.lists(),
        (old) => old?.filter((bookmark) => bookmark.id !== id)
      );

      return { previousBookmarks };
    },
    onError: (err, id, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
    },
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
    },
  });
}

/**
 * Enrich a bookmark with AI-generated metadata
 * Uses concurrency limiting (max 5 parallel enrichments)
 */
export function useEnrichBookmark() {
  const queryClient = useQueryClient();
  const {
    startEnrichment,
    setProcessing,
    setSuccess,
    setError,
    removeEnrichment,
    updateQueueStats
  } = useEnrichmentStore();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log(`[useEnrichBookmark] Starting enrichment mutation for: ${id}`);
      enrichmentLogger.log(id, 'started', 'Enrichment mutation initiated');

      // Mark as queued in store
      startEnrichment(id);
      enrichmentLogger.log(id, 'queued', 'Added to enrichment queue');

      // Run through concurrency queue (max 5 parallel)
      const result = await enrichmentQueue.run(id, async (signal) => {
        // Mark as processing when it starts
        console.log(`[useEnrichBookmark] Marking as processing: ${id}`);
        setProcessing(id);
        enrichmentLogger.log(id, 'processing', 'Enrichment started processing', {
          queueStats: enrichmentQueue.getStatus(),
        });

        // Update queue stats
        updateQueueStats(enrichmentQueue.getStatus());

        // Perform the actual enrichment with abort signal
        return bookmarksApi.enrich(id, signal);
      });

      // Update queue stats after completion
      updateQueueStats(enrichmentQueue.getStatus());

      console.log(`[useEnrichBookmark] Enrichment completed for: ${id}`);
      return result;
    },
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.detail(id) });

      // Snapshot previous values
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());
      const previousBookmark = queryClient.getQueryData<Bookmark>(bookmarksKeys.detail(id));

      return { previousBookmarks, previousBookmark };
    },
    onError: (err, id, context) => {
      // Check if this was an abort (cancellation)
      const isAborted = err instanceof Error && err.name === 'AbortError';

      if (isAborted) {
        console.log(`[useEnrichBookmark] Enrichment aborted for: ${id}`);
        enrichmentLogger.logAbort(id, 'Request aborted (bookmark likely deleted)');

        // Don't mark as error for aborted requests - they're intentionally cancelled
        removeEnrichment(id);
        // Update queue stats
        updateQueueStats(enrichmentQueue.getStatus());
        // Don't touch the cache - the delete mutation will handle it
        return;
      }

      console.error(`[useEnrichBookmark] Enrichment failed for: ${id}`, err);

      // Mark as error in store
      const errorMessage = err instanceof Error ? err.message : 'Enrichment failed';
      setError(id, errorMessage);
      enrichmentLogger.log(id, 'failed', errorMessage, {
        error: err instanceof Error ? err.stack : String(err),
      });

      // Update queue stats
      updateQueueStats(enrichmentQueue.getStatus());

      // Rollback cache on real errors
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
      if (context?.previousBookmark) {
        queryClient.setQueryData(bookmarksKeys.detail(id), context.previousBookmark);
      }
    },
    onSuccess: (data, id) => {
      console.log(`[useEnrichBookmark] onSuccess called for: ${id}`);

      // Check if bookmark still exists in cache (might have been deleted during enrichment)
      const bookmarkStillExists = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists())
        ?.some(b => b.id === id);

      if (!bookmarkStillExists) {
        console.log(`[useEnrichBookmark] Bookmark ${id} was deleted during enrichment, skipping update`);
        enrichmentLogger.log(id, 'cancelled', 'Bookmark deleted before enrichment completed', {
          cancelledAfterCompletion: true,
        });

        // Remove from enrichment tracking
        removeEnrichment(id);
        updateQueueStats(enrichmentQueue.getStatus());
        return;
      }

      console.log(`[useEnrichBookmark] Marking enrichment as successful: ${id}`);
      // Mark as success in store
      setSuccess(id);
      enrichmentLogger.log(id, 'completed', 'Enrichment completed successfully', {
        hasTitle: !!data.title,
        hasSummary: !!data.summary,
        tagCount: data.tags.length,
      });

      // Update queue stats
      updateQueueStats(enrichmentQueue.getStatus());

      // Update cache with enriched data
      queryClient.setQueryData(bookmarksKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });

      console.log(`[useEnrichBookmark] Cache updated for: ${id}`);
    },
  });
}

/**
 * Hybrid search (keyword + semantic) for bookmarks
 * Automatically combines traditional search with AI-powered semantic search
 */
export function useHybridSearch(query: string, filters?: Omit<BookmarkFilters, 'searchQuery'>) {
  // First, fetch ALL bookmarks (no filters - we'll filter in the search)
  // This ensures we use the same cached query as the main bookmark list
  const { data: allBookmarks, isLoading: isLoadingBookmarks, error: bookmarksError } = useBookmarks(undefined);

  // Then, perform hybrid search if we have a query and bookmarks
  const searchResult = useQuery({
    queryKey: ['hybrid-search', query, filters],
    queryFn: async () => {
      if (!allBookmarks || allBookmarks.length === 0) {
        return [];
      }

      // Apply non-search filters before sending to backend
      let filteredBookmarks = allBookmarks;

      if (filters?.types && filters.types.length > 0) {
        filteredBookmarks = filteredBookmarks.filter(b => filters.types!.includes(b.contentType));
      }

      if (filters?.sources && filters.sources.length > 0) {
        filteredBookmarks = filteredBookmarks.filter(b =>
          filters.sources!.some(source => b.domain.toLowerCase().includes(source.toLowerCase()))
        );
      }

      if (filters?.dateFrom) {
        filteredBookmarks = filteredBookmarks.filter(b => b.createdAt >= filters.dateFrom!);
      }

      if (filters?.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setHours(23, 59, 59, 999);
        filteredBookmarks = filteredBookmarks.filter(b => b.createdAt <= dateTo);
      }

      const result = await bookmarksApi.searchHybrid(query, filteredBookmarks, {
        topK: 50, // Return top 50 results
        semanticWeight: 0.6, // 60% semantic, 40% keyword
        minScore: 0.3, // Minimum relevance threshold (30% relevant or higher)
      });

      return result.bookmarks;
    },
    enabled: !!query && !!allBookmarks && allBookmarks.length > 0,
    staleTime: 1000 * 60, // 1 minute (hybrid search is more expensive)
  });

  // If we're still loading bookmarks, return loading state
  if (isLoadingBookmarks) {
    return { ...searchResult, isLoading: true };
  }

  return searchResult;
}
