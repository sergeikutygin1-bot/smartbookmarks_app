"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark } from "@/store/bookmarksStore";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { useDeleteBookmark, bookmarksKeys } from "@/hooks/useBookmarks";
import { bookmarksApi } from "@/lib/api";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { useVisibleTags } from "@/hooks/useVisibleTags";

interface BookmarkListItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

export function BookmarkListItem({ bookmark, isSelected, onClick }: BookmarkListItemProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteBookmark();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const tagsContainerRef = useRef<HTMLDivElement>(null);

  // Calculate how many tags can fit dynamically
  const visibleTagCount = useVisibleTags({
    tags: bookmark.tags,
    containerRef: tagsContainerRef,
  });

  // Check if this is an empty bookmark (no URL filled in yet)
  const isEmpty = !bookmark.url || bookmark.url === '' || bookmark.title === 'Untitled bookmark';

  // Prefetch bookmark details on hover - data ready before click
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: bookmarksKeys.detail(bookmark.id),
      queryFn: () => bookmarksApi.getById(bookmark.id),
      staleTime: 1000 * 60 * 5, // Don't refetch if recent
    });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the bookmark when clicking delete
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate(bookmark.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={handleMouseEnter}
      className={`
        relative w-full group
        border-l-2 transition-all duration-200
        ${isSelected
          ? 'bg-primary/10 border-l-primary'
          : 'border-l-transparent'
        }
      `}
    >
      <button
        onClick={onClick}
        className="w-full px-3 py-3 pr-10 text-left transition-all duration-200 hover:bg-sidebar-accent"
      >
      {/* Title */}
      <h3 className={`
        font-display font-semibold text-sm mb-1 line-clamp-2 leading-snug
        ${isEmpty ? 'italic text-muted-foreground' : 'text-sidebar-foreground'}
      `}>
        {bookmark.title}
      </h3>

      {/* Domain and date */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className="truncate">{bookmark.domain || 'No URL'}</span>
        <span>•</span>
        <span className="whitespace-nowrap">
          {formatDistanceToNow(bookmark.updatedAt, { addSuffix: true })}
        </span>
      </div>

      {/* Tags */}
      {bookmark.tags.length > 0 && (
        <div ref={tagsContainerRef} className="flex gap-1.5 overflow-hidden">
          {bookmark.tags.slice(0, visibleTagCount).map((tag) => (
            <Badge
              key={tag}
              className="text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground rounded-md flex-shrink-0"
            >
              {tag}
            </Badge>
          ))}
          {bookmark.tags.length > visibleTagCount && (
            <Badge className="text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground rounded-md flex-shrink-0">
              +{bookmark.tags.length - visibleTagCount}
            </Badge>
          )}
        </div>
      )}
      </button>

      {/* Delete button - appears on hover */}
      <button
        onClick={handleDeleteClick}
        className="absolute top-3 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-100 text-muted-foreground hover:text-red-600"
        aria-label="Delete bookmark"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        bookmarkTitle={bookmark.title}
      />
    </motion.div>
  );
}
