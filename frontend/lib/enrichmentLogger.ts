/**
 * Enrichment Event Logger
 *
 * Tracks all enrichment lifecycle events including:
 * - Started
 * - Queued
 * - Processing
 * - Completed
 * - Failed
 * - Cancelled
 *
 * Logs are stored in localStorage and console for debugging
 */

export type EnrichmentEventType =
  | 'started'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'aborted';

export interface EnrichmentLogEntry {
  bookmarkId: string;
  eventType: EnrichmentEventType;
  timestamp: string;
  message?: string;
  error?: string;
  metadata?: Record<string, any>;
}

const LOG_KEY = 'enrichment_logs';
const MAX_LOGS = 1000; // Keep last 1000 entries

class EnrichmentLogger {
  private logs: EnrichmentLogEntry[] = [];

  constructor() {
    this.loadLogs();
  }

  /**
   * Log an enrichment event
   */
  log(
    bookmarkId: string,
    eventType: EnrichmentEventType,
    message?: string,
    metadata?: Record<string, any>
  ) {
    const entry: EnrichmentLogEntry = {
      bookmarkId,
      eventType,
      timestamp: new Date().toISOString(),
      message,
      metadata,
    };

    // Add to in-memory logs
    this.logs.push(entry);

    // Trim if too many
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }

    // Save to localStorage
    this.saveLogs();

    // Console log with color coding
    this.consoleLog(entry);
  }

  /**
   * Log a cancellation event
   */
  logCancellation(bookmarkId: string, reason: string) {
    this.log(bookmarkId, 'cancelled', reason, {
      reason,
      cancelledAt: new Date().toISOString(),
    });
  }

  /**
   * Log an abort event
   */
  logAbort(bookmarkId: string, reason: string) {
    this.log(bookmarkId, 'aborted', reason, {
      reason,
      abortedAt: new Date().toISOString(),
    });
  }

  /**
   * Get all logs for a specific bookmark
   */
  getLogsForBookmark(bookmarkId: string): EnrichmentLogEntry[] {
    return this.logs.filter(log => log.bookmarkId === bookmarkId);
  }

  /**
   * Get all cancellation/abort events
   */
  getCancellations(): EnrichmentLogEntry[] {
    return this.logs.filter(log =>
      log.eventType === 'cancelled' || log.eventType === 'aborted'
    );
  }

  /**
   * Get recent logs (last N entries)
   */
  getRecentLogs(count: number = 50): EnrichmentLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    this.saveLogs();
    console.log('[EnrichmentLogger] All logs cleared');
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Print summary statistics
   */
  printStats() {
    const stats = {
      total: this.logs.length,
      started: this.logs.filter(l => l.eventType === 'started').length,
      completed: this.logs.filter(l => l.eventType === 'completed').length,
      failed: this.logs.filter(l => l.eventType === 'failed').length,
      cancelled: this.logs.filter(l => l.eventType === 'cancelled').length,
      aborted: this.logs.filter(l => l.eventType === 'aborted').length,
    };

    console.table(stats);
    return stats;
  }

  /**
   * Load logs from localStorage
   */
  private loadLogs() {
    // Guard for server-side rendering
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(LOG_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[EnrichmentLogger] Failed to load logs:', error);
    }
  }

  /**
   * Save logs to localStorage
   */
  private saveLogs() {
    // Guard for server-side rendering
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('[EnrichmentLogger] Failed to save logs:', error);
    }
  }

  /**
   * Console log with color coding
   */
  private consoleLog(entry: EnrichmentLogEntry) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const colors: Record<EnrichmentEventType, string> = {
      started: '#3b82f6',    // blue
      queued: '#8b5cf6',     // purple
      processing: '#f59e0b', // amber
      completed: '#10b981',  // green
      failed: '#ef4444',     // red
      cancelled: '#f97316',  // orange
      aborted: '#dc2626',    // dark red
    };

    const color = colors[entry.eventType];
    const icon = entry.eventType === 'completed' ? '✅' :
                 entry.eventType === 'failed' ? '❌' :
                 entry.eventType === 'cancelled' ? '🚫' :
                 entry.eventType === 'aborted' ? '⛔' :
                 '📝';

    console.log(
      `%c${icon} [${time}] ${entry.eventType.toUpperCase()}`,
      `color: ${color}; font-weight: bold`,
      `Bookmark: ${entry.bookmarkId.substring(0, 8)}...`,
      entry.message || '',
      entry.metadata || ''
    );
  }
}

// Global singleton instance
export const enrichmentLogger = new EnrichmentLogger();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).enrichmentLogger = enrichmentLogger;
}
