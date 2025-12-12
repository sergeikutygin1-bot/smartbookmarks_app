"use client";

import { useState } from "react";
import { Bookmark } from "@/store/bookmarksStore";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { useDeleteBookmark } from "@/hooks/useBookmarks";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

interface BookmarkListItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

export function BookmarkListItem({ bookmark, isSelected, onClick }: BookmarkListItemProps) {
  const deleteMutation = useDeleteBookmark();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
        ${isSelected ? 'text-sidebar-foreground' : 'text-sidebar-foreground'}
      `}>
        {bookmark.title}
      </h3>

      {/* Domain and date */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className="truncate">{bookmark.domain}</span>
        <span>•</span>
        <span className="whitespace-nowrap">
          {formatDistanceToNow(bookmark.createdAt, { addSuffix: true })}
        </span>
      </div>

      {/* Tags */}
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {bookmark.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              className="text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground rounded-md"
            >
              {tag}
            </Badge>
          ))}
          {bookmark.tags.length > 3 && (
            <Badge className="text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground rounded-md">
              +{bookmark.tags.length - 3}
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
