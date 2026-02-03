"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookmarkList } from "./BookmarkList";
import { FilterBar } from "./FilterBar";
import { Search, Plus, User, Upload } from "lucide-react";
import { useFilterStore } from "@/store/filterStore";
import { useCreateBookmark, useBookmarks } from "@/hooks/useBookmarks";
import { useBookmarksStore } from "@/store/bookmarksStore";
import { useProfilePanelStore } from "@/store/profilePanelStore";
import BulkImportModal from "./BulkImportModal";
import { useRefreshBookmarkMetadata } from "@/hooks/useBookmarkMetadata";
import { useEnrichmentStore } from "@/store/enrichmentStore";

export function Sidebar() {
  const { searchQuery, setSearchQuery } = useFilterStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const createMutation = useCreateBookmark();
  const { selectBookmark } = useBookmarksStore();
  const { open: openProfile } = useProfilePanelStore();
  const { refetch } = useBookmarks();
  const queryClient = useQueryClient();
  const refreshMetadata = useRefreshBookmarkMetadata();
  const { setProcessing } = useEnrichmentStore();

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

  // Handle bulk import completion with bookmark IDs
  const handleImportComplete = async (bookmarkIds: string[]) => {
    try {
      console.log(`[Sidebar] Bulk import complete: ${bookmarkIds.length} bookmarks`);

      // Mark all bookmarks as processing in enrichment store
      // This will show enrichment banners immediately
      bookmarkIds.forEach(id => {
        setProcessing(id);
      });

      // Refetch the bookmark list to show newly imported bookmarks
      await refetch();

      // Start polling for metadata for each bookmark
      // This replicates the same flow as single bookmark enrichment
      // The polling will wait for graph workers to finish (30-60 seconds)
      console.log(`[Sidebar] Starting metadata refresh for ${bookmarkIds.length} bookmarks...`);

      // Process all bookmarks in parallel
      await Promise.all(
        bookmarkIds.map(async (bookmarkId) => {
          try {
            await refreshMetadata(bookmarkId);
          } catch (error) {
            console.error(`[Sidebar] Failed to refresh metadata for ${bookmarkId}:`, error);
          }
        })
      );

      console.log(`[Sidebar] Metadata refresh complete for all bookmarks`);
    } catch (error) {
      console.error("Failed to handle bulk import completion:", error);
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={openProfile}
              className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
              variant="ghost"
              title="Profile Settings"
            >
              <User className="h-5 w-5" />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowBulkImport(true)}
              className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
              variant="ghost"
              title="Bulk Import"
            >
              <Upload className="h-5 w-5" />
            </Button>
            <Button
              size="sm"
              onClick={handleCreateBookmark}
              disabled={createMutation.isPending}
              className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
              variant="ghost"
              title="Add Bookmark"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
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

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
