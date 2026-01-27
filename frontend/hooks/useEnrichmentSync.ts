import { useEffect } from 'react';
import { useEnrichmentStore } from '@/store/enrichmentStore';
import { useBookmarks } from './useBookmarks';

/**
 * Syncs enrichment store with actual bookmark status from database
 * Cleans up stale enrichments and updates processing state on page load
 */
export function useEnrichmentSync() {
  const { bookmarks } = useBookmarks();
  const { enrichments, clearStaleEnrichments, setProcessing, setSuccess, removeEnrichment } =
    useEnrichmentStore();

  useEffect(() => {
    // Clear stale enrichments (older than 10 minutes)
    clearStaleEnrichments();

    // Sync with database
    if (bookmarks) {
      Object.keys(enrichments).forEach((bookmarkId) => {
        const enrichment = enrichments[bookmarkId];
        const bookmark = bookmarks.find((b) => b.id === bookmarkId);

        if (!bookmark) {
          // Bookmark doesn't exist anymore, remove from store
          removeEnrichment(bookmarkId);
          return;
        }

        // Check bookmark status from database
        if (bookmark.status === 'pending' && enrichment.status !== 'processing') {
          // Database shows pending but store doesn't know -> restore processing state
          setProcessing(bookmarkId);
        } else if (bookmark.status === 'completed' && enrichment.status === 'processing') {
          // Database shows completed but store still shows processing -> mark as success
          setSuccess(bookmarkId);
        }
      });

      // Check for pending bookmarks not in store (user refreshed during processing)
      bookmarks
        .filter((b) => b.status === 'pending' && !enrichments[b.id])
        .forEach((bookmark) => {
          // Restore processing state for bookmarks that are still pending
          setProcessing(bookmark.id);
        });
    }
  }, [bookmarks]);
}
