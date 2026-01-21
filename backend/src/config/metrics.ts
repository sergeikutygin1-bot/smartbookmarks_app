/**
 * Prometheus Metrics Configuration
 *
 * Provides application-level metrics for monitoring:
 * - HTTP request duration and counts
 * - Database query performance
 * - Cache hit/miss rates
 * - Queue processing metrics
 * - Custom business metrics
 */

import { Registry, Histogram, Counter, Gauge } from 'prom-client';

// Create a new registry (separate from default to avoid conflicts)
export const register = new Registry();

// Enable default metrics (CPU, memory, event loop, etc.)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({
  register,
  prefix: 'smartbookmarks_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

/**
 * HTTP Request Duration Histogram
 * Tracks response time distribution by method, route, and status code
 */
export const httpRequestDuration = new Histogram({
  name: 'smartbookmarks_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * HTTP Request Counter
 * Counts total HTTP requests by method, route, and status
 */
export const httpRequestTotal = new Counter({
  name: 'smartbookmarks_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Database Query Duration Histogram
 * Tracks database query performance
 */
export const dbQueryDuration = new Histogram({
  name: 'smartbookmarks_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

/**
 * Cache Operations Counter
 * Tracks cache hits, misses, and sets
 */
export const cacheOperations = new Counter({
  name: 'smartbookmarks_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'cache_type', 'result'],
  registers: [register],
});

/**
 * Cache Hit Ratio Gauge
 * Maintains current cache hit ratio
 */
export const cacheHitRatio = new Gauge({
  name: 'smartbookmarks_cache_hit_ratio',
  help: 'Current cache hit ratio',
  labelNames: ['cache_type'],
  registers: [register],
});

/**
 * Queue Job Duration Histogram
 * Tracks job processing time in queues
 */
export const queueJobDuration = new Histogram({
  name: 'smartbookmarks_queue_job_duration_seconds',
  help: 'Duration of queue job processing in seconds',
  labelNames: ['queue_name', 'job_type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

/**
 * Queue Job Counter
 * Counts total jobs processed
 */
export const queueJobsTotal = new Counter({
  name: 'smartbookmarks_queue_jobs_total',
  help: 'Total number of queue jobs processed',
  labelNames: ['queue_name', 'job_type', 'status'],
  registers: [register],
});

/**
 * Active Queue Jobs Gauge
 * Tracks currently processing jobs
 */
export const queueActiveJobs = new Gauge({
  name: 'smartbookmarks_queue_active_jobs',
  help: 'Number of currently active queue jobs',
  labelNames: ['queue_name'],
  registers: [register],
});

/**
 * AI API Calls Counter
 * Tracks OpenAI API usage
 */
export const aiApiCalls = new Counter({
  name: 'smartbookmarks_ai_api_calls_total',
  help: 'Total number of AI API calls',
  labelNames: ['model', 'operation', 'status'],
  registers: [register],
});

/**
 * AI API Cost Gauge
 * Tracks estimated API costs
 */
export const aiApiCost = new Gauge({
  name: 'smartbookmarks_ai_api_cost_usd',
  help: 'Estimated AI API cost in USD',
  labelNames: ['model'],
  registers: [register],
});

/**
 * Active User Sessions Gauge
 * Tracks number of active user sessions
 */
export const activeUserSessions = new Gauge({
  name: 'smartbookmarks_active_user_sessions',
  help: 'Number of active user sessions',
  registers: [register],
});

/**
 * Bookmark Operations Counter
 * Tracks bookmark CRUD operations
 */
export const bookmarkOperations = new Counter({
  name: 'smartbookmarks_bookmark_operations_total',
  help: 'Total number of bookmark operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

/**
 * Search Query Duration Histogram
 * Tracks search performance
 */
export const searchQueryDuration = new Histogram({
  name: 'smartbookmarks_search_query_duration_seconds',
  help: 'Duration of search queries in seconds',
  labelNames: ['search_mode', 'result_count'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [register],
});
