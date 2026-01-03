import { Queue, QueueOptions } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Job data structures for graph processing
 */

// Entity Extraction Job
export interface EntityExtractionJobData {
  bookmarkId: string;
  userId: string;
  content: string; // Title + summary + key points
  url: string;
  priority?: number;
}

// Concept Analysis Job
export interface ConceptAnalysisJobData {
  bookmarkId: string;
  userId: string;
  content: string;
  embedding: number[];
  priority?: number;
}

// Similarity Computation Job
export interface SimilarityJobData {
  bookmarkId: string;
  userId: string;
  embedding: number[];
  threshold?: number;
  priority?: number;
}

// Insight Generation Job (batch process for user)
export interface InsightJobData {
  userId: string;
  insightTypes?: ('trending' | 'gaps' | 'connections' | 'recommendations')[];
  priority?: number;
}

/**
 * Queue configurations
 */
const graphQueueOptions: QueueOptions = {
  connection: createRedisConnection(),
  defaultJobOptions: {
    // Automatic retry configuration
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
    timeout: 600000, // 10 minutes
  },
};

/**
 * Graph Queue Manager
 *
 * Manages 4 specialized queues for knowledge graph processing:
 * 1. Entity Extraction (high priority, real-time)
 * 2. Concept Analysis (high priority, real-time)
 * 3. Similarity Computation (high priority, real-time)
 * 4. Insight Generation (low priority, batch)
 */
class GraphQueueManager {
  // Real-time queues (process immediately after bookmark enrichment)
  private entityQueue: Queue<EntityExtractionJobData>;
  private conceptQueue: Queue<ConceptAnalysisJobData>;
  private similarityQueue: Queue<SimilarityJobData>;

  // Batch queues (scheduled processing)
  private insightQueue: Queue<InsightJobData>;

  constructor() {
    // Initialize all queues
    this.entityQueue = new Queue<EntityExtractionJobData>(
      'graph-entities',
      graphQueueOptions
    );

    this.conceptQueue = new Queue<ConceptAnalysisJobData>(
      'graph-concepts',
      graphQueueOptions
    );

    this.similarityQueue = new Queue<SimilarityJobData>(
      'graph-similarity',
      graphQueueOptions
    );

    this.insightQueue = new Queue<InsightJobData>(
      'graph-insights',
      graphQueueOptions
    );

    // Set up error handlers
    [
      this.entityQueue,
      this.conceptQueue,
      this.similarityQueue,
      this.insightQueue,
    ].forEach((queue) => {
      queue.on('error', (err) => {
        console.error(`[GraphQueue] ${queue.name} error:`, err);
      });
    });

    console.log('✓ Graph processing queues initialized');
  }

  /**
   * Add entity extraction job
   */
  async addEntityExtractionJob(data: EntityExtractionJobData) {
    const job = await this.entityQueue.add('extract-entities', data, {
      priority: data.priority || 70, // Medium-high priority
      jobId: `entity-${data.bookmarkId}`, // Deduplication
    });

    console.log(`[GraphQueue] Added entity extraction job for bookmark ${data.bookmarkId}`);
    return job;
  }

  /**
   * Add concept analysis job
   */
  async addConceptAnalysisJob(data: ConceptAnalysisJobData) {
    const job = await this.conceptQueue.add('analyze-concepts', data, {
      priority: data.priority || 70, // Medium-high priority
      jobId: `concept-${data.bookmarkId}`, // Deduplication
    });

    console.log(`[GraphQueue] Added concept analysis job for bookmark ${data.bookmarkId}`);
    return job;
  }

  /**
   * Add similarity computation job
   */
  async addSimilarityJob(data: SimilarityJobData) {
    const job = await this.similarityQueue.add('compute-similarity', data, {
      priority: data.priority || 80, // High priority (fast operation)
      jobId: `similarity-${data.bookmarkId}`, // Deduplication
    });

    console.log(`[GraphQueue] Added similarity job for bookmark ${data.bookmarkId}`);
    return job;
  }

  /**
   * Add insight generation job (batch operation)
   */
  async addInsightJob(data: InsightJobData) {
    const job = await this.insightQueue.add('generate-insights', data, {
      priority: data.priority || 10, // Low priority
      jobId: `insight-${data.userId}-${Date.now()}`, // Unique per run
    });

    console.log(`[GraphQueue] Added insight job for user ${data.userId}`);
    return job;
  }

  /**
   * Process a bookmark through the entire graph pipeline
   * (call this after enrichment completes)
   */
  async processBookmarkGraph(
    bookmarkId: string,
    userId: string,
    content: string,
    embedding: number[],
    url: string
  ) {
    // Add all real-time jobs in parallel
    await Promise.all([
      this.addEntityExtractionJob({ bookmarkId, userId, content, url }),
      this.addConceptAnalysisJob({ bookmarkId, userId, content, embedding }),
      this.addSimilarityJob({ bookmarkId, userId, embedding }),
    ]);

    console.log(`[GraphQueue] All graph processing jobs queued for bookmark ${bookmarkId}`);
  }

  /**
   * Get metrics for all queues
   */
  async getMetrics() {
    const [
      entityMetrics,
      conceptMetrics,
      similarityMetrics,
      insightMetrics,
    ] = await Promise.all([
      this.getQueueMetrics(this.entityQueue),
      this.getQueueMetrics(this.conceptQueue),
      this.getQueueMetrics(this.similarityQueue),
      this.getQueueMetrics(this.insightQueue),
    ]);

    return {
      entities: entityMetrics,
      concepts: conceptMetrics,
      similarity: similarityMetrics,
      insights: insightMetrics,
    };
  }

  /**
   * Get metrics for a single queue
   */
  private async getQueueMetrics(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      name: queue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Pause all queues
   */
  async pauseAll() {
    await Promise.all([
      this.entityQueue.pause(),
      this.conceptQueue.pause(),
      this.similarityQueue.pause(),
      this.insightQueue.pause(),
    ]);
    console.log('[GraphQueue] All queues paused');
  }

  /**
   * Resume all queues
   */
  async resumeAll() {
    await Promise.all([
      this.entityQueue.resume(),
      this.conceptQueue.resume(),
      this.similarityQueue.resume(),
      this.insightQueue.resume(),
    ]);
    console.log('[GraphQueue] All queues resumed');
  }

  /**
   * Close all queues
   */
  async closeAll() {
    await Promise.all([
      this.entityQueue.close(),
      this.conceptQueue.close(),
      this.similarityQueue.close(),
      this.insightQueue.close(),
    ]);
    console.log('[GraphQueue] All queues closed');
  }

  /**
   * Get underlying queue instances (for worker setup)
   */
  getQueues() {
    return {
      entity: this.entityQueue,
      concept: this.conceptQueue,
      similarity: this.similarityQueue,
      insight: this.insightQueue,
    };
  }
}

// Export singleton instance
export const graphQueue = new GraphQueueManager();

// Export the class for testing
export { GraphQueueManager };
