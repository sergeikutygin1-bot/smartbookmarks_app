"use client";

import { useBookmarksStore } from "@/store/bookmarksStore";
import { useBookmarks } from "@/hooks/useBookmarks";
import { BookmarkNote } from "./BookmarkNote";
import { BookmarkPlus } from "lucide-react";

export function NoteEditor() {
  const { selectedBookmarkId } = useBookmarksStore();
  const { data: bookmarks } = useBookmarks();
  const selectedBookmark = bookmarks?.find((b) => b.id === selectedBookmarkId);

  // Don't render if no bookmark is selected or if bookmark ID is invalid
  if (!selectedBookmark || !selectedBookmark.id) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-4">
              <BookmarkPlus className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg mb-2">
              No bookmark selected
            </h3>
            <p className="text-sm text-muted-foreground">
              Select a bookmark from the list or create a new one to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // CRITICAL FIX: Force component remount when bookmark ID changes
  // This prevents stale state from persisting across bookmark selections
  return <BookmarkNote key={selectedBookmark.id} bookmark={selectedBookmark} />;
}
