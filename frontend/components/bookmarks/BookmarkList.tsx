"use client";

import { useBookmarksStore } from "@/store/bookmarksStore";
import { useBookmarks } from "@/hooks/useBookmarks";
import { BookmarkListItem } from "./BookmarkListItem";
import { ScrollArea } from "@/components/ui/scroll-area";

export function BookmarkList() {
  const { data: bookmarks, isLoading, error } = useBookmarks();
  const { selectedBookmarkId, selectBookmark } = useBookmarksStore();

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
          No bookmarks yet.<br />
          Create your first one to get started.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-0.5 pb-4">
        {bookmarks
          .filter((bookmark) => bookmark.id) // Filter out bookmarks without valid IDs
          .map((bookmark) => (
            <BookmarkListItem
              key={bookmark.id}
              bookmark={bookmark}
              isSelected={selectedBookmarkId === bookmark.id}
              onClick={() => selectBookmark(bookmark.id)}
            />
          ))}
      </div>
    </ScrollArea>
  );
}
