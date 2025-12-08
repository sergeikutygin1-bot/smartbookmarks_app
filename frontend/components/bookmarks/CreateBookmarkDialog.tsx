"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBookmarksStore } from "@/store/bookmarksStore";
import { useCreateBookmark } from "@/hooks/useBookmarks";
import { Sparkles } from "lucide-react";

interface CreateBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBookmarkDialog({ open, onOpenChange }: CreateBookmarkDialogProps) {
  const { selectBookmark } = useBookmarksStore();
  const createMutation = useCreateBookmark();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const handleCreate = async () => {
    if (!url) return;

    try {
      const bookmark = await createMutation.mutateAsync({ url, title: title || undefined });

      // Select the newly created bookmark
      selectBookmark(bookmark.id);

      // Reset form
      setUrl("");
      setTitle("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create bookmark:", error);
      // Error is handled by React Query, could show a toast here
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create Bookmark</DialogTitle>
          <DialogDescription>
            Paste a URL to save it to your collection. You can add details later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL Input */}
          <div className="space-y-2">
            <label htmlFor="url" className="text-sm font-medium">
              URL
            </label>
            <Input
              id="url"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="focus-visible:ring-2 focus-visible:ring-primary"
              autoFocus
            />
          </div>

          {/* Title Input (Optional) */}
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium text-muted-foreground">
              Title <span className="font-normal">(optional)</span>
            </label>
            <Input
              id="title"
              placeholder="Leave blank to auto-generate"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleCreate}
            disabled={!url || createMutation.isPending}
            className="flex-1"
          >
            {createMutation.isPending ? "Creating..." : "Create Bookmark"}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!url || createMutation.isPending}
            variant="outline"
            className="gap-2 border-2 hover:border-accent hover:text-accent hover:bg-accent/5 transition-colors group"
          >
            <Sparkles className="h-4 w-4 group-hover:text-accent transition-colors" />
            Enrich
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
