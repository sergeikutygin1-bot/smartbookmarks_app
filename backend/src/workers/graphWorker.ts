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
import { getJobStorage } from '../services/jobStorage';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Check if all graph agents have completed and update job status to 'completed'
 * Expected agents: ExtractorAgent, AnalyzerAgent, EmbedderAgent, (TaggerAgent),
 *                  EntityExtractorAgent, ConceptAnalyzerAgent, SimilarityComputer
 */
async function checkAndCompleteJob(jobId: string) {
  try {
    console.log(`[GraphWorker] Checking job completion for ${jobId}`);
    const jobStorage = getJobStorage();
    const job = await jobStorage.getJob(jobId);

    if (!job) {
      console.log(`[GraphWorker] Job ${jobId} not found`);
      return;
    }

    if (job.status !== 'graph_processing') {
      console.log(`[GraphWorker] Job ${jobId} status is ${job.status}, not graph_processing - skipping`);
      return;
    }

    // Check if we have all expected graph agent traces
    const agentNames = (job.agentTraces || []).map(t => t.agentName);
    const hasEntityExtractor = agentNames.includes('EntityExtractorAgent');
    const hasConceptAnalyzer = agentNames.includes('ConceptAnalyzerAgent');
    const hasSimilarityComputer = agentNames.includes('SimilarityComputer');

    console.log(`[GraphWorker] Job ${jobId} agents: Entity=${hasEntityExtractor}, Concept=${hasConceptAnalyzer}, Similarity=${hasSimilarityComputer}`);
    console.log(`[GraphWorker] Job ${jobId} all agent names: ${agentNames.join(', ')}`);

    if (hasEntityExtractor && hasConceptAnalyzer && hasSimilarityComputer) {
      // All graph agents have completed - mark job as completed
      await jobStorage.updateJobStatus(jobId, 'completed');
      console.log(`[GraphWorker] ✓ All graph agents completed for job ${jobId} - marked as completed`);
    } else {
      console.log(`[GraphWorker] Job ${jobId} still waiting for agents to complete`);
    }
  } catch (error) {
    console.error(`[GraphWorker] Failed to check job completion for ${jobId}:`, error);
  }
}

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

    // Append entity extraction traces to enrichment job
    if (job.data.jobId) {
      const jobStorage = getJobStorage();
      const agentTraces = agent.getAgentTraces();

      for (const trace of agentTraces) {
        try {
          await jobStorage.addAgentTrace(job.data.jobId, trace);
        } catch (error) {
          console.error(`[GraphWorker:Entity] Failed to append trace:`, error);
        }
      }

      console.log(`[GraphWorker:Entity] ✓ Appended ${agentTraces.length} trace(s) to job ${job.data.jobId}`);

      // Check if all graph work is done
      await checkAndCompleteJob(job.data.jobId);
    }

    // Invalidate entity caches (new entities created)
    await graphCache.invalidateEntityCaches(userId);
    await graphCache.invalidateStatsCaches(userId);

    // Track AI costs if GPT was used (per user)
    if (result.cost) {
      console.log(
        `[GraphWorker:Entity] 💰 Cost: $${result.cost.toFixed(6)}`
      );
      // Track cost (GPT-4o-mini usage)
      await trackAICost(userId, 'gpt-4o-mini', 0, 0); // Actual tokens tracked internally
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

    // Append concept analysis traces to enrichment job
    if (job.data.jobId) {
      const jobStorage = getJobStorage();
      const agentTraces = agent.getAgentTraces();

      for (const trace of agentTraces) {
        try {
          await jobStorage.addAgentTrace(job.data.jobId, trace);
        } catch (error) {
          console.error(`[GraphWorker:Concept] Failed to append trace:`, error);
        }
      }

      console.log(`[GraphWorker:Concept] ✓ Appended ${agentTraces.length} trace(s) to job ${job.data.jobId}`);

      // Check if all graph work is done
      await checkAndCompleteJob(job.data.jobId);
    }

    // Invalidate concept caches (new concepts created)
    await graphCache.invalidateConceptCaches(userId);
    await graphCache.invalidateStatsCaches(userId);

    // Track AI costs (per user)
    if (result.cost) {
      console.log(
        `[GraphWorker:Concept] 💰 Cost: $${result.cost.toFixed(6)}`
      );
      await trackAICost(userId, 'gpt-4o-mini', 0, 0);
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

    // Append similarity computation trace to enrichment job
    if (job.data.jobId) {
      const jobStorage = getJobStorage();

      // SimilarityComputer doesn't use LLM, so create trace manually
      await jobStorage.addAgentTrace(job.data.jobId, {
        agentName: 'SimilarityComputer',
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: processingTime,
        input: {
          bookmarkId: job.data.bookmarkId,
          embeddingLength: job.data.embedding?.length || 0,
          threshold: threshold || 0.65,
        },
        output: {
          similarCount: result.similarBookmarks.length,
          similarBookmarkIds: result.similarBookmarks.map(b => b.id),
        },
        metadata: {
          method: 'pgvector',
          threshold: threshold || 0.65,
        },
      });

      console.log(`[GraphWorker:Similarity] ✓ Appended trace to job ${job.data.jobId}`);

      // Check if all graph work is done
      await checkAndCompleteJob(job.data.jobId);
    }

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
