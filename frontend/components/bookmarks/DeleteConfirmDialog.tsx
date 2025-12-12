"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  bookmarkTitle: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  bookmarkTitle,
}: DeleteConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Delete Bookmark?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            Are you sure you want to delete "{bookmarkTitle}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-medium"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleConfirm}
            className="font-medium bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
