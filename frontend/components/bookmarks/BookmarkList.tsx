"use client";

import { useBookmarksStore } from "@/store/bookmarksStore";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useFilterStore } from "@/store/filterStore";
import { BookmarkListItem } from "./BookmarkListItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";

export function BookmarkList() {
  const { selectedBookmarkId, selectBookmark } = useBookmarksStore();
  const {
    searchQuery,
    selectedTypes,
    selectedSources,
    dateRange,
    hasActiveFilters,
  } = useFilterStore();

  // Build filters object for the hook
  const filters = {
    searchQuery: searchQuery || undefined,
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    sources: selectedSources.length > 0 ? selectedSources : undefined,
    dateFrom: dateRange.from || undefined,
    dateTo: dateRange.to || undefined,
  };

  const { data: bookmarks, isLoading, error } = useBookmarks(
    // Only pass filters if at least one is active
    hasActiveFilters() ? filters : undefined
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">Loading bookmarks...</p>
      </div>
    );
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

  return (
    <ScrollArea className="h-full w-full">
      <motion.div
        className="space-y-0.5 pb-4"
        initial={false}
      >
        <AnimatePresence mode="popLayout">
          {bookmarks
            .filter((bookmark) => bookmark.id)
            .map((bookmark, index) => (
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
                    delay: index * 0.02, // Stagger effect
                    ease: "easeOut"
                  }
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                  y: -10,
                  transition: {
                    duration: 0.15,
                    ease: "easeIn"
                  }
                }}
              >
                <BookmarkListItem
                  bookmark={bookmark}
                  isSelected={selectedBookmarkId === bookmark.id}
                  onClick={() => selectBookmark(bookmark.id)}
                />
              </motion.div>
            ))}
        </AnimatePresence>
      </motion.div>
    </ScrollArea>
  );
}
