"use client";

import { useBookmarksStore } from "@/store/bookmarksStore";
import { useBookmarks, useHybridSearch } from "@/hooks/useBookmarks";
import { useFilterStore } from "@/store/filterStore";
import { BookmarkListItem } from "./BookmarkListItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import { groupBookmarksByDate } from "@/lib/date-grouping";
import { Skeleton } from "@/components/ui/skeleton";

export function BookmarkList() {
  const { selectedBookmarkId, selectBookmark } = useBookmarksStore();
  const {
    searchQuery,
    selectedTypes,
    selectedSources,
    dateRange,
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

  if (!bookmarks || bookmarks.length === 0) {
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
    const filteredBookmarks = bookmarks.filter((bookmark) => bookmark.id);

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
                Search Results ({filteredBookmarks.length})
              </h2>

              {/* Flat list of search results */}
              <div className="space-y-0.5">
                {filteredBookmarks.map((bookmark, index) => (
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
    bookmarks.filter((bookmark) => bookmark.id)
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
