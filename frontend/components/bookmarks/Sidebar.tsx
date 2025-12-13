"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookmarkList } from "./BookmarkList";
import { FilterBar } from "./FilterBar";
import { Search, Plus } from "lucide-react";
import { useFilterStore } from "@/store/filterStore";
import { useCreateBookmark } from "@/hooks/useBookmarks";
import { useBookmarksStore } from "@/store/bookmarksStore";

export function Sidebar() {
  const { searchQuery, setSearchQuery } = useFilterStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const createMutation = useCreateBookmark();
  const { selectBookmark } = useBookmarksStore();

  // Debounce search query updates (500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery]);

  // Handle instant bookmark creation (Apple Notes style)
  const handleCreateBookmark = async () => {
    try {
      const bookmark = await createMutation.mutateAsync({});
      // Auto-select the newly created bookmark
      selectBookmark(bookmark.id);
    } catch (error) {
      console.error("Failed to create bookmark:", error);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 pb-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-display font-bold text-sidebar-foreground">
            Bookmarks
          </h1>
          <Button
            size="sm"
            onClick={handleCreateBookmark}
            disabled={createMutation.isPending}
            className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
            variant="ghost"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bookmarks..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="pl-9 h-9 bg-sidebar-accent border-sidebar-border"
          />
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar />

      {/* Bookmark List */}
      <div className="flex-1 min-h-0 h-0">
        <BookmarkList />
      </div>
    </div>
  );
}
