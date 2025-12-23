import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { EntityExtractorAgent } from '../agents/EntityExtractorAgent';
import { ConceptAnalyzerAgent } from '../agents/ConceptAnalyzerAgent';
import { SimilarityComputer } from '../agents/SimilarityComputer';
import {
  EntityExtractionJobData,
  ConceptAnalysisJobData,
  SimilarityJobData,
} from '../queues/graphQueue';
import { trackAICost } from '../middleware/costControl';
import { graphCache } from '../services/graphCache';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Graph Workers
 *
 * Background processors for knowledge graph jobs.
 * Runs independently from the API server and can be scaled horizontally.
 *
 * Workers:
 * 1. Entity Extraction Worker - Extracts named entities from bookmarks
 * 2. Concept Analysis Worker - Identifies abstract topics and concepts
 * 3. Similarity Worker - Computes bookmark similarities using embeddings
 *
 * Features:
 * - Concurrent job processing (configurable via GRAPH_WORKER_CONCURRENCY)
 * - Automatic retries with exponential backoff (3 attempts)
 * - Graceful shutdown on SIGTERM/SIGINT
 *
 * Usage:
 * ```bash
 * npm run worker:graph
 * ```
 */

// Worker configuration
const GRAPH_WORKER_CONCURRENCY = parseInt(
  process.env.GRAPH_WORKER_CONCURRENCY || '3'
);

/**
 * Process entity extraction job
 */
async function processEntityExtractionJob(
  job: Job<EntityExtractionJobData>
): Promise<void> {
  const { bookmarkId, userId, content, url } = job.data;

  console.log(
    `[GraphWorker:Entity] Processing ${job.id} for bookmark ${bookmarkId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1})`
  );

  try {
    const agent = new EntityExtractorAgent();
    const startTime = Date.now();

    // Extract entities
    const result = await agent.extract(content);
    const processingTime = Date.now() - startTime;

    console.log(
      `[GraphWorker:Entity] ✓ Extracted ${result.entities.length} entities in ${processingTime}ms`
    );

    // Save entities to database
    await agent.saveEntities(result.entities, bookmarkId, userId);

    // Invalidate entity caches (new entities created)
    await graphCache.invalidateEntityCaches(userId);
    await graphCache.invalidateStatsCaches(userId);

    // Track AI costs if GPT was used
    if (result.cost) {
      console.log(
        `[GraphWorker:Entity] 💰 Cost: $${result.cost.toFixed(6)}`
      );
      // Track cost (GPT-4o-mini usage)
      await trackAICost('gpt-4o-mini', 0, 0); // Actual tokens tracked internally
    }

    console.log(
      `[GraphWorker:Entity] ✓ Job ${job.id} completed successfully`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[GraphWorker:Entity] ✗ Job ${job.id} failed:`,
      errorMessage
    );
    throw error; // Let BullMQ handle retries
  }
}

/**
 * Process concept analysis job
 */
async function processConceptAnalysisJob(
  job: Job<ConceptAnalysisJobData>
): Promise<void> {
  const { bookmarkId, userId, content, embedding } = job.data;

  console.log(
    `[GraphWorker:Concept] Processing ${job.id} for bookmark ${bookmarkId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1})`
  );

  try {
    const agent = new ConceptAnalyzerAgent();
    const startTime = Date.now();

    // Analyze concepts
    const result = await agent.analyze(content, embedding);
    const processingTime = Date.now() - startTime;

    console.log(
      `[GraphWorker:Concept] ✓ Extracted ${result.concepts.length} concepts in ${processingTime}ms`
    );

    // Save concepts to database
    await agent.saveConcepts(result.concepts, bookmarkId, userId);

    // Invalidate concept caches (new concepts created)
    await graphCache.invalidateConceptCaches(userId);
    await graphCache.invalidateStatsCaches(userId);

    // Track AI costs
    if (result.cost) {
      console.log(
        `[GraphWorker:Concept] 💰 Cost: $${result.cost.toFixed(6)}`
      );
      await trackAICost('gpt-4o-mini', 0, 0);
    }

    console.log(
      `[GraphWorker:Concept] ✓ Job ${job.id} completed successfully`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[GraphWorker:Concept] ✗ Job ${job.id} failed:`,
      errorMessage
    );
    throw error;
  }
}

/**
 * Process similarity computation job
 */
async function processSimilarityJob(
  job: Job<SimilarityJobData>
): Promise<void> {
  const { bookmarkId, userId, embedding, threshold } = job.data;

  console.log(
    `[GraphWorker:Similarity] Processing ${job.id} for bookmark ${bookmarkId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1})`
  );

  try {
    const computer = new SimilarityComputer();
    const startTime = Date.now();

    // Compute similarities (use hybrid scoring by default)
    const result = await computer.findSimilarHybrid(
      bookmarkId,
      userId,
      threshold || 0.65
    );
    const processingTime = Date.now() - startTime;

    console.log(
      `[GraphWorker:Similarity] ✓ Found ${result.similarBookmarks.length} similar bookmarks in ${processingTime}ms`
    );

    // Save similarities to database
    await computer.saveSimilarities(
      bookmarkId,
      result.similarBookmarks,
      userId
    );

    // Invalidate similar bookmark caches (new relationships created)
    await graphCache.invalidateSimilarCaches(bookmarkId, userId);
    await graphCache.invalidateStatsCaches(userId);

    console.log(
      `[GraphWorker:Similarity] ✓ Job ${job.id} completed successfully`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[GraphWorker:Similarity] ✗ Job ${job.id} failed:`,
      errorMessage
    );
    throw error;
  }
}

/**
 * Create entity extraction worker
 */
function createEntityWorker(): Worker {
  const worker = new Worker<EntityExtractionJobData>(
    'graph-entities',
    processEntityExtractionJob,
    {
      connection: createRedisConnection(),
      concurrency: GRAPH_WORKER_CONCURRENCY,
      lockDuration: 300000, // 5 minutes
      lockRenewTime: 30000,
      autorun: true,
    }
  );

  worker.on('ready', () => {
    console.log(`✓ Entity extraction worker ready (concurrency: ${GRAPH_WORKER_CONCURRENCY})`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`[GraphWorker:Entity] ✗ ${job.id} failed: ${err.message}`);
    }
  });

  worker.on('error', (err) => {
    console.error('[GraphWorker:Entity] Worker error:', err);
  });

  return worker;
}

/**
 * Create concept analysis worker
 */
function createConceptWorker(): Worker {
  const worker = new Worker<ConceptAnalysisJobData>(
    'graph-concepts',
    processConceptAnalysisJob,
    {
      connection: createRedisConnection(),
      concurrency: GRAPH_WORKER_CONCURRENCY,
      lockDuration: 300000, // 5 minutes
      lockRenewTime: 30000,
      autorun: true,
    }
  );

  worker.on('ready', () => {
    console.log(`✓ Concept analysis worker ready (concurrency: ${GRAPH_WORKER_CONCURRENCY})`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`[GraphWorker:Concept] ✗ ${job.id} failed: ${err.message}`);
    }
  });

  worker.on('error', (err) => {
    console.error('[GraphWorker:Concept] Worker error:', err);
  });

  return worker;
}

/**
 * Create similarity computation worker
 */
function createSimilarityWorker(): Worker {
  const worker = new Worker<SimilarityJobData>(
    'graph-similarity',
    processSimilarityJob,
    {
      connection: createRedisConnection(),
      concurrency: GRAPH_WORKER_CONCURRENCY,
      lockDuration: 120000, // 2 minutes (faster operation)
      lockRenewTime: 30000,
      autorun: true,
    }
  );

  worker.on('ready', () => {
    console.log(`✓ Similarity computation worker ready (concurrency: ${GRAPH_WORKER_CONCURRENCY})`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`[GraphWorker:Similarity] ✗ ${job.id} failed: ${err.message}`);
    }
  });

  worker.on('error', (err) => {
    console.error('[GraphWorker:Similarity] Worker error:', err);
  });

  return worker;
}

/**
 * Create and start all graph workers
 */
export function createGraphWorkers() {
  const entityWorker = createEntityWorker();
  const conceptWorker = createConceptWorker();
  const similarityWorker = createSimilarityWorker();

  const workers = [entityWorker, conceptWorker, similarityWorker];

  // Graceful shutdown for all workers
  const shutdown = async () => {
    console.log('\n[GraphWorker] Shutting down all graph workers...');
    await Promise.all(workers.map((w) => w.close()));
    console.log('[GraphWorker] All workers closed');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return workers;
}

/**
 * Start workers if this file is run directly
 */
if (require.main === module) {
  console.log('\n🔧 Starting Graph Workers...\n');
  createGraphWorkers();
  console.log('\nGraph workers are running. Press Ctrl+C to stop.\n');
}

export default createGraphWorkers;
