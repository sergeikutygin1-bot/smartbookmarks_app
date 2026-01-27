import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { enrichmentQueue } from '@/lib/concurrency';
import { enrichmentLogger } from '@/lib/enrichmentLogger';

/**
 * Enrichment Status for individual bookmarks
 */
export type EnrichmentStatus = 'idle' | 'queued' | 'processing' | 'processing-metadata' | 'success' | 'error';

export interface EnrichmentState {
  id: string;
  status: EnrichmentStatus;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface EnrichmentStore {
  // Map of bookmark ID to enrichment state (stored as object for persistence)
  enrichments: Record<string, EnrichmentState>;

  // Queue statistics
  queueStats: {
    running: number;
    queued: number;
    total: number;
  };

  // Actions
  startEnrichment: (id: string) => void;
  setQueued: (id: string) => void;
  setProcessing: (id: string) => void;
  setProcessingMetadata: (id: string) => void;
  setSuccess: (id: string) => void;
  setError: (id: string, error: string) => void;
  removeEnrichment: (id: string) => void;
  cancelEnrichment: (id: string) => void;
  updateQueueStats: (stats: { running: number; queued: number; total: number }) => void;
  getEnrichmentStatus: (id: string) => EnrichmentStatus;
  isEnriching: (id: string) => boolean;
  clearStaleEnrichments: () => void;
}

/**
 * Global enrichment queue store
 * Tracks enrichment status for all bookmarks
 * Persists to localStorage to survive page refreshes
 */
export const useEnrichmentStore = create<EnrichmentStore>()(
  persist(
    (set, get) => ({
      enrichments: {},
      queueStats: {
        running: 0,
        queued: 0,
        total: 0,
      },

      startEnrichment: (id: string) => {
        set((state) => ({
          enrichments: {
            ...state.enrichments,
            [id]: {
              id,
              status: 'queued',
              startedAt: new Date(),
            },
          },
        }));
      },

      setQueued: (id: string) => {
        set((state) => ({
          enrichments: {
            ...state.enrichments,
            [id]: {
              ...(state.enrichments[id] || {}),
              id,
              status: 'queued',
            },
          },
        }));
      },

      setProcessing: (id: string) => {
        set((state) => ({
          enrichments: {
            ...state.enrichments,
            [id]: {
              ...(state.enrichments[id] || {}),
              id,
              status: 'processing',
              startedAt: new Date(),
            },
          },
        }));
      },

      setProcessingMetadata: (id: string) => {
        set((state) => ({
          enrichments: {
            ...state.enrichments,
            [id]: {
              ...(state.enrichments[id] || {}),
              id,
              status: 'processing-metadata',
            },
          },
        }));
      },

      setSuccess: (id: string) => {
        set((state) => ({
          enrichments: {
            ...state.enrichments,
            [id]: {
              ...(state.enrichments[id] || {}),
              id,
              status: 'success',
              completedAt: new Date(),
            },
          },
        }));

        // REMOVED: Auto-removal timeout
        // Caller (useEnrichBookmark onSuccess) handles cleanup after metadata polling completes
      },

      setError: (id: string, error: string) => {
        set((state) => ({
          enrichments: {
            ...state.enrichments,
            [id]: {
              ...(state.enrichments[id] || {}),
              id,
              status: 'error',
              error,
              completedAt: new Date(),
            },
          },
        }));

        // Auto-remove error after 5 seconds
        setTimeout(() => {
          get().removeEnrichment(id);
        }, 5000);
      },

      removeEnrichment: (id: string) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.enrichments;
          return { enrichments: rest };
        });
      },

      cancelEnrichment: (id: string) => {
        console.log(`[EnrichmentStore] Cancelling enrichment: ${id}`);

        // Actually cancel the HTTP request in the queue
        const wasCancelled = enrichmentQueue.cancel(id);

        if (wasCancelled) {
          console.log(`[EnrichmentStore] Enrichment cancelled: ${id}`);
          enrichmentLogger.logCancellation(id, 'User deleted bookmark during enrichment');
        } else {
          console.log(`[EnrichmentStore] Enrichment not in queue (may have already completed): ${id}`);
          enrichmentLogger.log(id, 'cancelled', 'Cancellation attempted but enrichment not in queue', {
            attemptedCancellation: true,
            inQueue: false,
          });
        }

        set((state) => {
          const current = state.enrichments[id];

          // If it exists, mark as error (cancelled)
          if (current) {
            return {
              enrichments: {
                ...state.enrichments,
                [id]: {
                  ...current,
                  status: 'error',
                  error: 'Cancelled (bookmark deleted)',
                  completedAt: new Date(),
                },
              },
            };
          }

          return state;
        });

        // Auto-remove after 1 second
        setTimeout(() => {
          get().removeEnrichment(id);
        }, 1000);
      },

      updateQueueStats: (stats) => {
        set({ queueStats: stats });
      },

      getEnrichmentStatus: (id: string): EnrichmentStatus => {
        return get().enrichments[id]?.status || 'idle';
      },

      isEnriching: (id: string): boolean => {
        const status = get().enrichments[id]?.status;
        return status === 'queued' || status === 'processing' || status === 'processing-metadata';
      },

      clearStaleEnrichments: () => {
        const now = Date.now();
        const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes

        set((state) => {
          const enrichments = { ...state.enrichments };
          let changed = false;

          Object.entries(enrichments).forEach(([id, enrichment]) => {
            const startTime = enrichment.startedAt ? new Date(enrichment.startedAt).getTime() : now;
            const isStale = now - startTime > STALE_THRESHOLD;

            if (isStale && (enrichment.status === 'queued' || enrichment.status === 'processing' || enrichment.status === 'processing-metadata')) {
              delete enrichments[id];
              changed = true;
              console.log(`[EnrichmentStore] Cleared stale enrichment: ${id}`);
            }
          });

          return changed ? { enrichments } : state;
        });
      },
    }),
    {
      name: 'enrichment-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enrichments: state.enrichments,
        // Don't persist queueStats as they should be real-time
      }),
    }
  )
);
