"use client";

import { Bookmark } from "@/store/bookmarksStore";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

interface BookmarkListItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

export function BookmarkListItem({ bookmark, isSelected, onClick }: BookmarkListItemProps) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`
        w-full px-3 py-3 text-left transition-all duration-200
        border-l-2 hover:bg-sidebar-accent
        ${isSelected
          ? 'bg-primary/10 border-l-primary'
          : 'border-l-transparent'
        }
      `}
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
    </motion.button>
  );
}
