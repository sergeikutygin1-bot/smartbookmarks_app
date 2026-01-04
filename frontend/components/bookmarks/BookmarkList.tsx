"use client";

import { useBookmarksStore } from "@/store/bookmarksStore";
import { useBookmarks, useHybridSearch } from "@/hooks/useBookmarks";
import { useFilterStore } from "@/store/filterStore";
import { BookmarkListItem } from "./BookmarkListItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import { groupBookmarksByDate } from "@/lib/date-grouping";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

export function BookmarkList() {
  const { selectedBookmarkId, selectBookmark } = useBookmarksStore();
  const {
    searchQuery,
    selectedTypes,
    selectedSources,
    dateRange,
    selectedConcepts,
    selectedEntities,
    hasActiveFilters,
  } = useFilterStore();

  // Build non-search filters for hybrid search
  const nonSearchFilters = {
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    sources: selectedSources.length > 0 ? selectedSources : undefined,
    dateFrom: dateRange.from || undefined,
    dateTo: dateRange.to || undefined,
  };

  // Build all filters for regular search
  const allFilters = {
    searchQuery: searchQuery || undefined,
    ...nonSearchFilters,
  };

  // Use hybrid search if there's a search query, otherwise use regular fetch
  const hybridSearchResult = useHybridSearch(
    searchQuery || '',
    nonSearchFilters
  );

  const regularResult = useBookmarks(
    hasActiveFilters() && !searchQuery ? allFilters : undefined
  );

  // Choose which result to use based on whether we're searching
  const { data: bookmarks, isLoading, error } = searchQuery
    ? hybridSearchResult
    : regularResult;

  // Fetch metadata for all bookmarks when concept/entity filters are active
  // IMPORTANT: Do NOT use useQueries with the 'bookmark-metadata-v3' key directly
  // because it will overwrite the cache with a different data structure (bookmarkId/conceptIds/entityIds)
  // instead of the standard {concepts, entities} structure used by BookmarkListItem and BookmarkNote
  // This causes cache pollution where components see the wrong data structure
  const hasConceptOrEntityFilters = selectedConcepts.length > 0 || selectedEntities.length > 0;

  const metadataQueries = useQueries({
    queries: (bookmarks || []).map((bookmark) => ({
      // Use a separate cache key to avoid overwriting the standard bookmark-metadata-v3
      // This prevents the filtering query from polluting the display queries
      queryKey: ['bookmark-metadata-for-filtering', bookmark.id],
      queryFn: async () => {
        const response = await fetch(
          `/api/graph/bookmarks/${bookmark.id}/related`
        );
        if (!response.ok) return { concepts: [], entities: [] };
        const result = await response.json();
        return {
          bookmarkId: bookmark.id,
          conceptIds: result.data.concepts?.map((c: any) => c.concept.id) || [],
          entityIds: result.data.entities?.map((e: any) => e.entity.id) || [],
        };
      },
      enabled: hasConceptOrEntityFilters && !!bookmarks,
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    })),
  });

  // Filter bookmarks by concepts/entities
  const filteredBookmarks = useMemo(() => {
    if (!bookmarks) return [];
    if (!hasConceptOrEntityFilters) return bookmarks;

    // Wait for metadata to load
    const allLoaded = metadataQueries.every(q => q.isSuccess);
    if (!allLoaded) return bookmarks; // Show all while loading

    return bookmarks.filter((bookmark) => {
      const metadata = metadataQueries.find(q => q.data?.bookmarkId === bookmark.id)?.data;
      if (!metadata) return false;

      // Filter by concepts
      if (selectedConcepts.length > 0) {
        const hasSelectedConcept = selectedConcepts.some(
          conceptId => metadata.conceptIds.includes(conceptId)
        );
        if (!hasSelectedConcept) return false;
      }

      // Filter by entities
      if (selectedEntities.length > 0) {
        const hasSelectedEntity = selectedEntities.some(
          entityId => metadata.entityIds.includes(entityId)
        );
        if (!hasSelectedEntity) return false;
      }

      return true;
    });
  }, [bookmarks, selectedConcepts, selectedEntities, metadataQueries, hasConceptOrEntityFilters]);

  if (isLoading) {
    return <BookmarkListSkeleton />;
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-destructive text-sm">Failed to load bookmarks</p>
      </div>
    );
  }

  if (!filteredBookmarks || filteredBookmarks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-muted-foreground text-sm text-center">
          {hasActiveFilters() ? (
            <>
              No bookmarks match your filters.<br />
              Try adjusting your search criteria.
            </>
          ) : (
            <>
              No bookmarks yet.<br />
              Create your first one to get started.
            </>
          )}
        </p>
      </div>
    );
  }

  // When searching, show flat list sorted by relevance
  // When browsing, group by date (Apple Notes style)
  const displayMode = searchQuery ? 'search' : 'grouped';

  if (displayMode === 'search') {
    // Search results - flat list sorted by relevance (most relevant first)
    const searchResults = filteredBookmarks.filter((bookmark) => bookmark.id);

    return (
      <ScrollArea className="h-full w-full">
        <div className="pb-4">
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              {/* Search Results Header */}
              <h2 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-sidebar z-10">
                Search Results ({searchResults.length})
              </h2>

              {/* Flat list of search results */}
              <div className="space-y-0.5">
                {searchResults.map((bookmark, index) => (
                  <motion.div
                    key={bookmark.id}
                    layout
                    initial={{ opacity: 0, height: 0, y: -20 }}
                    animate={{
                      opacity: 1,
                      height: "auto",
                      y: 0,
                      transition: {
                        duration: 0.2,
                        delay: index * 0.02,
                        ease: "easeOut",
                      },
                    }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      y: -10,
                      transition: {
                        duration: 0.15,
                        ease: "easeIn",
                      },
                    }}
                  >
                    <BookmarkListItem
                      bookmark={bookmark}
                      isSelected={selectedBookmarkId === bookmark.id}
                      onClick={() => selectBookmark(bookmark.id)}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>
    );
  }

  // Grouped view - Group bookmarks by date (Apple Notes style)
  const groupedBookmarks = groupBookmarksByDate(
    filteredBookmarks.filter((bookmark) => bookmark.id)
  );

  return (
    <ScrollArea className="h-full w-full">
      <div className="pb-4">
        <AnimatePresence mode="popLayout">
          {groupedBookmarks.map((group, groupIndex) => (
            <motion.div
              key={group.label}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              {/* Section Header */}
              <h2 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-sidebar z-10">
                {group.label}
              </h2>

              {/* Bookmarks in this group */}
              <div className="space-y-0.5">
                {group.bookmarks.map((bookmark, index) => (
                  <motion.div
                    key={bookmark.id}
                    layout
                    initial={{ opacity: 0, height: 0, y: -20 }}
                    animate={{
                      opacity: 1,
                      height: "auto",
                      y: 0,
                      transition: {
                        duration: 0.2,
                        delay: groupIndex * 0.1 + index * 0.02,
                        ease: "easeOut",
                      },
                    }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      y: -10,
                      transition: {
                        duration: 0.15,
                        ease: "easeIn",
                      },
                    }}
                  >
                    <BookmarkListItem
                      bookmark={bookmark}
                      isSelected={selectedBookmarkId === bookmark.id}
                      onClick={() => selectBookmark(bookmark.id)}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

/**
 * Skeleton loading state for BookmarkList
 * Matches the structure of actual bookmark list with date groups
 */
export function BookmarkListSkeleton() {
  return (
    <ScrollArea className="h-full w-full">
      <div className="pb-4">
        {/* Simulate 2 date groups */}
        {[1, 2].map((groupIndex) => (
          <div key={groupIndex} className="mb-6">
            {/* Section Header Skeleton */}
            <div className="px-3 py-2">
              <Skeleton className="h-3 w-20" />
            </div>

            {/* Bookmark Items Skeletons */}
            <div className="space-y-0.5">
              {[...Array(groupIndex === 1 ? 4 : 3)].map((_, itemIndex) => (
                <div
                  key={itemIndex}
                  className="px-3 py-3 space-y-2"
                >
                  {/* Title */}
                  <Skeleton className="h-4 w-3/4" />
                  {/* Domain + Type */}
                  <Skeleton className="h-3 w-1/2" />
                  {/* Tags */}
                  <div className="flex gap-2 mt-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
