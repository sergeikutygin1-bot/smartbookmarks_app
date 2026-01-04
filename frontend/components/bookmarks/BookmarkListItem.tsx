"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark } from "@/store/bookmarksStore";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { useDeleteBookmark, bookmarksKeys } from "@/hooks/useBookmarks";
import { bookmarksApi } from "@/lib/api";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { useBookmarkMetadata } from "@/hooks/useBookmarkMetadata";
import { ConceptBadge } from "./ConceptBadge";
import { EntityBadge } from "./EntityBadge";
import { useFilterStore } from "@/store/filterStore";
import { toast } from "sonner";

interface BookmarkListItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

export function BookmarkListItem({ bookmark, isSelected, onClick }: BookmarkListItemProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteBookmark();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch concepts and entities for this bookmark
  const { data: metadata, isLoading: isMetadataLoading, error: metadataError } = useBookmarkMetadata(bookmark.id);

  const { selectedConcepts, selectedEntities, setConcepts, setEntities } = useFilterStore();

  // Check if this is an empty bookmark (no URL filled in yet)
  const isEmpty = !bookmark.url || bookmark.url === '' || bookmark.title === 'Untitled bookmark';

  // Prefetch bookmark details and metadata on hover - data ready before click
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: bookmarksKeys.detail(bookmark.id),
      queryFn: () => bookmarksApi.getById(bookmark.id),
      staleTime: 1000 * 60 * 5, // Don't refetch if recent
    });

    // Prefetch metadata as well
    queryClient.prefetchQuery({
      queryKey: ['bookmark-metadata-v3', bookmark.id],
      staleTime: 1000 * 60 * 5,
    });
  };

  // Click handlers for filtering
  const handleConceptClick = (concept: { id: string; name: string }) => {
    setConcepts([concept.id]);
    toast.success(`Filtering by concept: ${concept.name}`);
  };

  const handleEntityClick = (entity: { id: string; name: string }) => {
    setEntities([entity.id]);
    toast.success(`Filtering by entity: ${entity.name}`);
  };

  // Show max 5 badges total (concepts + entities)
  const MAX_BADGES = 5;
  const concepts = metadata?.concepts || [];
  const entities = metadata?.entities || [];
  const totalBadges = concepts.length + entities.length;
  const visibleConcepts = concepts.slice(0, Math.min(concepts.length, MAX_BADGES));
  const remainingAfterConcepts = MAX_BADGES - visibleConcepts.length;
  const visibleEntities = entities.slice(0, remainingAfterConcepts);
  const hiddenCount = Math.max(0, totalBadges - MAX_BADGES);

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

      {/* Concepts & Entities */}
      {(concepts.length > 0 || entities.length > 0) && (
        <div className="flex gap-1.5 overflow-hidden flex-wrap">
          {visibleConcepts.map((concept) => (
            <ConceptBadge
              key={concept.id}
              concept={concept}
              weight={concept.weight}
              onClick={handleConceptClick}
              size="compact"
              isActive={selectedConcepts.includes(concept.id)}
            />
          ))}
          {visibleEntities.map((entity) => (
            <EntityBadge
              key={entity.id}
              entity={entity}
              weight={entity.weight}
              onClick={handleEntityClick}
              size="compact"
              isActive={selectedEntities.includes(entity.id)}
            />
          ))}
          {hiddenCount > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 h-5 bg-muted text-muted-foreground rounded-md flex-shrink-0">
              +{hiddenCount} more
            </Badge>
          )}
        </div>
      )}
      </button>

      {/* Delete button - appears on hover */}
      <button
        onClick={handleDeleteClick}
        className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-500/10 text-muted-foreground hover:text-red-600 z-10"
        aria-label="Delete bookmark"
      >
        <X className="h-4 w-4" />
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
