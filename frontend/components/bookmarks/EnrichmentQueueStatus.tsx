"use client";

import { useEnrichmentStore } from "@/store/enrichmentStore";
import { Loader2, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

/**
 * Enrichment Queue Status Indicator - Floating Widget
 * Shows the number of bookmarks currently being enriched and queued
 * Displays in top-right corner only when there are active enrichments
 */
export function EnrichmentQueueStatus() {
  const queueStats = useEnrichmentStore((state) => state.queueStats);
  const hasActiveEnrichments = queueStats.total > 0;

  if (!hasActiveEnrichments) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: -20, x: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed top-4 right-4 z-50 bg-background/95 backdrop-blur-sm border border-primary/30 rounded-xl shadow-lg"
        style={{ maxWidth: '280px' }}
      >
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  AI Enrichment
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {queueStats.running > 0 && queueStats.queued > 0 && (
                  <span>
                    {queueStats.running} processing, {queueStats.queued} in queue
                  </span>
                )}
                {queueStats.running > 0 && queueStats.queued === 0 && (
                  <span>
                    {queueStats.running} processing
                  </span>
                )}
                {queueStats.running === 0 && queueStats.queued > 0 && (
                  <span>{queueStats.queued} in queue</span>
                )}
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${(queueStats.running / queueStats.total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            <div className="flex-shrink-0 ml-1">
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-primary">
                  {queueStats.total}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Total
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
