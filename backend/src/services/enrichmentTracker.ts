import { EventEmitter } from "events";
import { logger } from "./logger";

/**
 * Enrichment Tracker Service
 *
 * Tracks all enrichment attempts for monitoring and analytics:
 * - Status tracking (pending, processing, completed, failed)
 * - Duration measurement
 * - Error tracking
 * - Success rate calculation
 * - Recent history storage
 */

export type EnrichmentStatus =
  | "pending"
  | "extracting"
  | "analyzing"
  | "tagging"
  | "completed"
  | "failed";

export interface EnrichmentRecord {
  id: string;
  url: string;
  status: EnrichmentStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // milliseconds
  error?: string;
  steps: {
    extraction?: { success: boolean; duration: number };
    analysis?: { success: boolean; duration: number };
    tagging?: { success: boolean; duration: number };
  };
}

class EnrichmentTracker extends EventEmitter {
  private enrichments: Map<string, EnrichmentRecord> = new Map();
  private history: EnrichmentRecord[] = [];
  private maxHistory = 50; // Keep last 50 enrichments
  private enrichmentIdCounter = 0;

  constructor() {
    super();
    logger.info("enrichment", "EnrichmentTracker service initialized");
  }

  /**
   * Start tracking a new enrichment
   */
  startEnrichment(url: string): string {
    const id = `enrich-${++this.enrichmentIdCounter}`;

    const record: EnrichmentRecord = {
      id,
      url,
      status: "pending",
      startedAt: new Date(),
      steps: {},
    };

    this.enrichments.set(id, record);
    this.emit("started", record);

    logger.info("enrichment", `Started enrichment ${id}`, { url });

    return id;
  }

  /**
   * Update enrichment status
   */
  updateStatus(id: string, status: EnrichmentStatus): void {
    const record = this.enrichments.get(id);
    if (!record) return;

    record.status = status;
    this.emit("status-changed", record);

    logger.debug("enrichment", `Status changed to ${status}`, { id });
  }

  /**
   * Record a step completion
   */
  recordStep(
    id: string,
    step: "extraction" | "analysis" | "tagging",
    success: boolean,
    duration: number
  ): void {
    const record = this.enrichments.get(id);
    if (!record) return;

    record.steps[step] = { success, duration };
    this.emit("step-completed", { record, step });

    logger.debug("enrichment", `Step ${step} completed`, {
      id,
      success,
      duration: `${duration}ms`,
    });
  }

  /**
   * Complete an enrichment successfully
   */
  completeEnrichment(id: string): void {
    const record = this.enrichments.get(id);
    if (!record) return;

    record.status = "completed";
    record.completedAt = new Date();
    record.duration = record.completedAt.getTime() - record.startedAt.getTime();

    // Move to history
    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift(); // Remove oldest
    }

    this.enrichments.delete(id);
    this.emit("completed", record);

    logger.info("enrichment", `Enrichment completed ${id}`, {
      duration: `${record.duration}ms`,
      url: record.url,
    });
  }

  /**
   * Mark enrichment as failed
   */
  failEnrichment(id: string, error: string): void {
    const record = this.enrichments.get(id);
    if (!record) return;

    record.status = "failed";
    record.completedAt = new Date();
    record.duration = record.completedAt.getTime() - record.startedAt.getTime();
    record.error = error;

    // Move to history
    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.enrichments.delete(id);
    this.emit("failed", record);

    logger.error("enrichment", `Enrichment failed ${id}`, {
      error,
      duration: `${record.duration}ms`,
      url: record.url,
    });
  }

  /**
   * Get current active enrichments
   */
  getActiveEnrichments(): EnrichmentRecord[] {
    return Array.from(this.enrichments.values());
  }

  /**
   * Get enrichment history
   */
  getHistory(limit = 20): EnrichmentRecord[] {
    return this.history.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get a specific enrichment
   */
  getEnrichment(id: string): EnrichmentRecord | undefined {
    return this.enrichments.get(id) || this.history.find((r) => r.id === id);
  }

  /**
   * Get statistics
   */
  getStats() {
    const completed = this.history.filter((r) => r.status === "completed");
    const failed = this.history.filter((r) => r.status === "failed");
    const total = this.history.length;

    const avgDuration =
      completed.length > 0
        ? completed.reduce((sum, r) => sum + (r.duration || 0), 0) /
          completed.length
        : 0;

    // Last hour stats
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const lastHour = this.history.filter(
      (r) => r.startedAt.getTime() > oneHourAgo
    );

    return {
      total,
      completed: completed.length,
      failed: failed.length,
      successRate:
        total > 0 ? ((completed.length / total) * 100).toFixed(1) : "0",
      avgDuration: Math.round(avgDuration),
      active: this.enrichments.size,
      lastHour: {
        total: lastHour.length,
        completed: lastHour.filter((r) => r.status === "completed").length,
        failed: lastHour.filter((r) => r.status === "failed").length,
      },
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
    logger.info("enrichment", "Enrichment history cleared");
  }
}

// Singleton instance
export const enrichmentTracker = new EnrichmentTracker();
