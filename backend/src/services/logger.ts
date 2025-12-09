import { EventEmitter } from "events";

/**
 * Centralized Logger Service
 *
 * Features:
 * - Color-coded console output
 * - Circular buffer for recent logs (last 200)
 * - Event emitter for real-time streaming
 * - Structured log format with timestamps
 */

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogSource =
  | "server"
  | "extraction"
  | "analysis"
  | "tagging"
  | "enrichment"
  | "admin";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  source: LogSource;
  message: string;
  data?: any;
}

class Logger extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs = 200; // Keep last 200 logs
  private logIdCounter = 0;

  // ANSI color codes for console
  private colors = {
    info: "\x1b[36m", // Cyan
    warn: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
    debug: "\x1b[90m", // Gray
    reset: "\x1b[0m",
    bold: "\x1b[1m",
  };

  constructor() {
    super();
    this.log("info", "server", "Logger service initialized");
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    source: LogSource,
    message: string,
    data?: any
  ): void {
    const entry: LogEntry = {
      id: `log-${++this.logIdCounter}`,
      timestamp: new Date(),
      level,
      source,
      message,
      data,
    };

    // Add to circular buffer
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest
    }

    // Emit for real-time listeners
    this.emit("log", entry);

    // Console output with colors
    this.outputToConsole(entry);
  }

  /**
   * Output log to console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const color = this.colors[entry.level];
    const reset = this.colors.reset;
    const bold = this.colors.bold;

    const time = entry.timestamp.toLocaleTimeString();
    const levelTag = `[${entry.level.toUpperCase()}]`.padEnd(7);
    const sourceTag = `[${entry.source}]`.padEnd(13);

    console.log(
      `${color}${time} ${bold}${levelTag}${reset}${color} ${sourceTag}${reset} ${entry.message}`
    );

    if (entry.data) {
      console.log(`         ${JSON.stringify(entry.data, null, 2)}`);
    }
  }

  /**
   * Public logging methods
   */
  info(source: LogSource, message: string, data?: any): void {
    this.log("info", source, message, data);
  }

  warn(source: LogSource, message: string, data?: any): void {
    this.log("warn", source, message, data);
  }

  error(source: LogSource, message: string, data?: any): void {
    this.log("error", source, message, data);
  }

  debug(source: LogSource, message: string, data?: any): void {
    this.log("debug", source, message, data);
  }

  /**
   * Get recent logs for admin dashboard
   */
  getRecentLogs(limit = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs filtered by level or source
   */
  getFilteredLogs(options: {
    level?: LogLevel;
    source?: LogSource;
    limit?: number;
  }): LogEntry[] {
    let filtered = this.logs;

    if (options.level) {
      filtered = filtered.filter((log) => log.level === options.level);
    }

    if (options.source) {
      filtered = filtered.filter((log) => log.source === options.source);
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    this.info("admin", "Logs cleared");
  }

  /**
   * Get statistics
   */
  getStats() {
    const now = Date.now();
    const last5Minutes = this.logs.filter(
      (log) => now - log.timestamp.getTime() < 5 * 60 * 1000
    );

    return {
      totalLogs: this.logs.length,
      last5Minutes: last5Minutes.length,
      byLevel: {
        info: this.logs.filter((log) => log.level === "info").length,
        warn: this.logs.filter((log) => log.level === "warn").length,
        error: this.logs.filter((log) => log.level === "error").length,
        debug: this.logs.filter((log) => log.level === "debug").length,
      },
      bySource: {
        server: this.logs.filter((log) => log.source === "server").length,
        extraction: this.logs.filter((log) => log.source === "extraction")
          .length,
        analysis: this.logs.filter((log) => log.source === "analysis").length,
        tagging: this.logs.filter((log) => log.source === "tagging").length,
        enrichment: this.logs.filter((log) => log.source === "enrichment")
          .length,
      },
    };
  }
}

// Singleton instance
export const logger = new Logger();
