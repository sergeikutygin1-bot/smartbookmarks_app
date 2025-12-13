import { create } from 'zustand';
import { enrichmentQueue } from '@/lib/concurrency';
import { enrichmentLogger } from '@/lib/enrichmentLogger';

/**
 * Enrichment Status for individual bookmarks
 */
export type EnrichmentStatus = 'idle' | 'queued' | 'processing' | 'success' | 'error';

export interface EnrichmentState {
  id: string;
  status: EnrichmentStatus;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface EnrichmentStore {
  // Map of bookmark ID to enrichment state
  enrichments: Map<string, EnrichmentState>;

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
  setSuccess: (id: string) => void;
  setError: (id: string, error: string) => void;
  removeEnrichment: (id: string) => void;
  cancelEnrichment: (id: string) => void;
  updateQueueStats: (stats: { running: number; queued: number; total: number }) => void;
  getEnrichmentStatus: (id: string) => EnrichmentStatus;
  isEnriching: (id: string) => boolean;
}

/**
 * Global enrichment queue store
 * Tracks enrichment status for all bookmarks
 */
export const useEnrichmentStore = create<EnrichmentStore>((set, get) => ({
  enrichments: new Map(),
  queueStats: {
    running: 0,
    queued: 0,
    total: 0,
  },

  startEnrichment: (id: string) => {
    set((state) => {
      const newEnrichments = new Map(state.enrichments);
      newEnrichments.set(id, {
        id,
        status: 'queued',
        startedAt: new Date(),
      });
      return { enrichments: newEnrichments };
    });
  },

  setQueued: (id: string) => {
    set((state) => {
      const newEnrichments = new Map(state.enrichments);
      const current = newEnrichments.get(id);
      newEnrichments.set(id, {
        ...current,
        id,
        status: 'queued',
      });
      return { enrichments: newEnrichments };
    });
  },

  setProcessing: (id: string) => {
    set((state) => {
      const newEnrichments = new Map(state.enrichments);
      const current = newEnrichments.get(id);
      newEnrichments.set(id, {
        ...current,
        id,
        status: 'processing',
        startedAt: new Date(),
      });
      return { enrichments: newEnrichments };
    });
  },

  setSuccess: (id: string) => {
    set((state) => {
      const newEnrichments = new Map(state.enrichments);
      const current = newEnrichments.get(id);
      newEnrichments.set(id, {
        ...current,
        id,
        status: 'success',
        completedAt: new Date(),
      });
      return { enrichments: newEnrichments };
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
      get().removeEnrichment(id);
    }, 3000);
  },

  setError: (id: string, error: string) => {
    set((state) => {
      const newEnrichments = new Map(state.enrichments);
      const current = newEnrichments.get(id);
      newEnrichments.set(id, {
        ...current,
        id,
        status: 'error',
        error,
        completedAt: new Date(),
      });
      return { enrichments: newEnrichments };
    });

    // Auto-remove error after 5 seconds
    setTimeout(() => {
      get().removeEnrichment(id);
    }, 5000);
  },

  removeEnrichment: (id: string) => {
    set((state) => {
      const newEnrichments = new Map(state.enrichments);
      newEnrichments.delete(id);
      return { enrichments: newEnrichments };
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
      const newEnrichments = new Map(state.enrichments);
      const current = newEnrichments.get(id);

      // If it exists, mark as error (cancelled)
      if (current) {
        newEnrichments.set(id, {
          ...current,
          status: 'error',
          error: 'Cancelled (bookmark deleted)',
          completedAt: new Date(),
        });
      }

      return { enrichments: newEnrichments };
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
    return get().enrichments.get(id)?.status || 'idle';
  },

  isEnriching: (id: string): boolean => {
    const status = get().enrichments.get(id)?.status;
    return status === 'queued' || status === 'processing';
  },
}));
