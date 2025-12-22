import { Queue, QueueOptions } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import type { EnrichmentOptions, EnrichmentResult } from '../types/schemas';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Job data structure for enrichment queue
 */
export interface EnrichmentJobData extends EnrichmentOptions {
  /**
   * Optional user ID for tracking and permissions
   */
  userId?: string;

  /**
   * Optional bookmark ID to save results directly to database
   */
  bookmarkId?: string;

  /**
   * Timestamp when the job was created
   */
  createdAt?: Date;

  /**
   * Priority level (higher = more important)
   */
  priority?: number;
}

/**
 * Job result structure (what the worker returns)
 */
export type EnrichmentJobResult = EnrichmentResult;

/**
 * Queue configuration for enrichment jobs
 */
const queueOptions: QueueOptions = {
  connection: createRedisConnection(),
  defaultJobOptions: {
    // Automatic retry configuration
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },

    // Job retention
    removeOnComplete: parseInt(process.env.BULLMQ_REMOVE_ON_COMPLETE || '100'),
    removeOnFail: parseInt(process.env.BULLMQ_REMOVE_ON_FAIL || '1000'),

    // Timeout (10 minutes max)
    timeout: 600000,
  },
};

/**
 * Enrichment Queue Singleton
 *
 * Manages bookmark enrichment jobs with:
 * - Automatic retries (3 attempts with exponential backoff)
 * - Job prioritization (user-initiated > batch)
 * - Progress tracking
 * - Persistent job storage in Redis
 *
 * Usage:
 * ```typescript
 * import { enrichmentQueue } from './queues/enrichmentQueue';
 *
 * // Add job to queue
 * const job = await enrichmentQueue.add('enrich-url', {
 *   url: 'https://example.com',
 *   existingTags: ['tag1', 'tag2']
 * });
 *
 * // Get job status
 * const jobData = await enrichmentQueue.getJob(job.id);
 * const status = await jobData.getState();
 *
 * // Wait for completion
 * const result = await job.waitUntilFinished(queueEvents);
 * ```
 */
class EnrichmentQueueManager {
  private queue: Queue<EnrichmentJobData, EnrichmentJobResult>;

  constructor() {
    this.queue = new Queue<EnrichmentJobData, EnrichmentJobResult>(
      'enrichment',
      queueOptions
    );

    // Event listeners for monitoring
    this.queue.on('error', (err) => {
      console.error('[EnrichmentQueue] Queue error:', err);
    });

    console.log('✓ Enrichment queue initialized');
  }

  /**
   * Add a new enrichment job to the queue
   *
   * @param jobData - Enrichment options with optional metadata
   * @param priority - Optional priority (0-100, higher = more important)
   * @returns Job object with id and methods
   */
  async addJob(jobData: EnrichmentJobData, priority: number = 50) {
    const job = await this.queue.add(
      'enrich-url', // Job name
      {
        ...jobData,
        createdAt: new Date(),
        priority,
      },
      {
        priority,
        // Job ID based on URL hash for deduplication
        jobId: this.generateJobId(jobData.url),
      }
    );

    console.log(`[EnrichmentQueue] Added job ${job.id} for URL: ${jobData.url}`);
    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }

  /**
   * Get job state (waiting, active, completed, failed, delayed)
   */
  async getJobState(jobId: string): Promise<string | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    return await job.getState();
  }

  /**
   * Get job result (returns null if not completed)
   */
  async getJobResult(jobId: string): Promise<EnrichmentJobResult | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    if (state !== 'completed') return null;

    return job.returnvalue;
  }

  /**
   * Get job progress data
   */
  async getJobProgress(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
      timestamp: job.timestamp,
    };
  }

  /**
   * Get queue metrics for monitoring
   */
  async getMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Get failed jobs for manual retry
   */
  async getFailedJobs(start = 0, end = 10) {
    return this.queue.getFailed(start, end);
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new Error(`Job ${jobId} is not in failed state (current: ${state})`);
    }

    await job.retry();
    console.log(`[EnrichmentQueue] Retrying job ${jobId}`);
  }

  /**
   * Clean old completed jobs
   *
   * @param olderThanMs - Remove jobs older than this (default: 7 days)
   */
  async cleanOldJobs(olderThanMs: number = 7 * 24 * 60 * 60 * 1000) {
    const cleaned = await this.queue.clean(olderThanMs, 1000, 'completed');
    console.log(`[EnrichmentQueue] Cleaned ${cleaned.length} old completed jobs`);
    return cleaned;
  }

  /**
   * Pause the queue (stop processing new jobs)
   */
  async pause() {
    await this.queue.pause();
    console.log('[EnrichmentQueue] Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume() {
    await this.queue.resume();
    console.log('[EnrichmentQueue] Queue resumed');
  }

  /**
   * Close the queue connection
   */
  async close() {
    await this.queue.close();
    console.log('[EnrichmentQueue] Queue closed');
  }

  /**
   * Generate a unique job ID based on URL and timestamp
   * Each enrichment attempt gets a unique ID to avoid cache issues
   */
  private generateJobId(url: string): string {
    const crypto = require('crypto');
    const timestamp = Date.now().toString();
    const hash = crypto.createHash('sha256').update(url + timestamp).digest('hex');
    return `enrich-${hash.substring(0, 16)}`;
  }

  /**
   * Get the underlying BullMQ queue instance
   * (for advanced use cases)
   */
  getQueue() {
    return this.queue;
  }
}

// Export singleton instance
export const enrichmentQueue = new EnrichmentQueueManager();

// Export the class for testing
export { EnrichmentQueueManager };
