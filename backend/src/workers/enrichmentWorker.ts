import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { EnrichmentAgent } from '../agents/enrichmentAgent';
import type { EnrichmentJobData, EnrichmentJobResult } from '../queues/enrichmentQueue';
import { getJobStorage, JobExecution } from '../services/jobStorage';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Enrichment Worker
 *
 * Background processor for bookmark enrichment jobs.
 * Runs independently from the API server and can be scaled horizontally.
 *
 * Features:
 * - Concurrent job processing (configurable via WORKER_CONCURRENCY)
 * - Automatic retries with exponential backoff (3 attempts)
 * - Progress tracking via job.updateProgress()
 * - Graceful shutdown on SIGTERM/SIGINT
 *
 * Usage:
 * ```bash
 * npm run worker
 * ```
 */

// Worker configuration
const WORKER_CONCURRENCY = parseInt(
  process.env.WORKER_CONCURRENCY || '5'
);

/**
 * Process a single enrichment job
 */
async function processEnrichmentJob(
  job: Job<EnrichmentJobData, EnrichmentJobResult>
): Promise<EnrichmentJobResult> {
  const { url, userTitle, userSummary, userTags, existingTags } = job.data;
  const jobStorage = getJobStorage();

  console.log(`[Worker] Processing ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1})`);

  // Initialize job execution record
  const jobExecution: JobExecution = {
    jobId: job.id!,
    url,
    status: 'processing',
    queuedAt: new Date(job.timestamp),
    startedAt: new Date(),
    agentTraces: [],
    userContext: {
      userTitle,
      userSummary,
      userTags,
    },
  };

  try {
    // Save initial job state
    await jobStorage.saveJob(jobExecution);

    // Create enrichment agent instance
    const agent = new EnrichmentAgent();

    // Track progress updates (reduced logging)
    agent.onProgress((progress) => {
      // Only log to Redis for client polling, skip console logs
      job.updateProgress({
        step: progress.step,
        message: progress.message,
        timestamp: progress.timestamp,
        percentage: getProgressPercentage(progress.step),
      });
    });

    // Start enrichment
    const startTime = Date.now();

    const result = await agent.enrich({
      url,
      userTitle,
      userSummary,
      userTags,
      existingTags,
    });

    const processingTime = Date.now() - startTime;

    console.log(`[Worker] ✓ ${job.id} completed in ${(processingTime / 1000).toFixed(1)}s - ${result.tagging?.tags?.length || 0} tags`);

    // Update job execution with final result
    jobExecution.status = 'completed';
    jobExecution.completedAt = new Date();
    jobExecution.totalDuration = processingTime;
    jobExecution.result = {
      title: result.title,
      summary: result.analysis.summary,
      tags: result.tagging.tags,
      domain: result.domain,
      contentType: result.contentType,
      embedding: result.embedding,
    };

    // Calculate quality metrics
    jobExecution.quality = {
      contentLength: result.extractedContent?.cleanText?.length || 0,
      summaryLength: result.analysis?.summary?.length || 0,
      tagCount: result.tagging?.tags?.length || 0,
    };

    await jobStorage.saveJob(jobExecution);

    // Return enrichment result
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error(`[Worker] ✗ Job ${job.id} failed:`, errorMessage);

    // Save error state
    jobExecution.status = 'failed';
    jobExecution.completedAt = new Date();
    jobExecution.error = {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    };

    try {
      await jobStorage.saveJob(jobExecution);
    } catch (saveError) {
      console.error(`[Worker] Failed to save error state for job ${job.id}:`, saveError);
    }

    // Check if this is a retryable error
    const isRetryable = isRetryableError(error);

    if (!isRetryable) {
      console.log(`[Worker] Job ${job.id} failed with non-retryable error, will not retry`);
    } else if (job.attemptsMade >= (job.opts.attempts || 1) - 1) {
      console.log(`[Worker] Job ${job.id} exhausted all retry attempts`);
    }

    // Re-throw to let BullMQ handle retry logic
    throw error;
  }
}

/**
 * Convert enrichment step to progress percentage
 */
function getProgressPercentage(
  step: 'extraction' | 'analysis' | 'tagging' | 'embedding' | 'completed'
): number {
  const percentages = {
    extraction: 20,
    analysis: 50,
    tagging: 75,
    embedding: 90,
    completed: 100,
  };

  return percentages[step] || 0;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();

  // Non-retryable errors
  const nonRetryablePatterns = [
    'invalid url',
    'url could not be accessed',
    '404',
    '403',
    'forbidden',
    'not found',
    'validation error',
  ];

  for (const pattern of nonRetryablePatterns) {
    if (errorMessage.includes(pattern)) {
      return false;
    }
  }

  // Retryable errors (network issues, rate limits, etc.)
  return true;
}

/**
 * Create and start the enrichment worker
 */
export function createEnrichmentWorker() {
  const worker = new Worker<EnrichmentJobData, EnrichmentJobResult>(
    'enrichment', // Queue name (must match queue)
    processEnrichmentJob, // Job processor function
    {
      connection: createRedisConnection(),
      concurrency: WORKER_CONCURRENCY,

      // Prevent stalling on long-running jobs
      lockDuration: 600000, // 10 minutes (max job time)
      lockRenewTime: 30000, // Renew lock every 30 seconds

      // Retry configuration (handled by queue default options)
      autorun: true, // Start processing immediately
    }
  );

  // Event listeners for monitoring (reduced logging)
  worker.on('ready', () => {
    console.log(`✓ Enrichment worker ready (concurrency: ${WORKER_CONCURRENCY})`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`[Worker] ✗ ${job.id} failed: ${err.message}`);
    } else {
      console.error('[Worker] Job failed:', err.message);
    }
  });

  worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled (taking too long)`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\n[Worker] SIGTERM received, closing worker...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('\n[Worker] SIGINT received, closing worker...');
    await worker.close();
    process.exit(0);
  });

  return worker;
}

/**
 * Start the worker if this file is run directly
 */
if (require.main === module) {
  console.log('\n🔧 Starting Enrichment Worker...\n');
  createEnrichmentWorker();

  console.log('Worker is running. Press Ctrl+C to stop.\n');
}

export default createEnrichmentWorker;
