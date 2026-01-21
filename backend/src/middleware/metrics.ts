/**
 * Metrics Collection Middleware
 *
 * Automatically tracks HTTP request metrics:
 * - Request duration
 * - Request counts
 * - Status codes
 * - Route patterns
 */

import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal } from '../config/metrics';

/**
 * Metrics Collection Middleware
 *
 * Records HTTP request duration and count for all routes.
 * Extracts route pattern from Express router for better aggregation.
 *
 * Usage:
 * ```
 * import { metricsMiddleware } from './middleware/metrics';
 * app.use(metricsMiddleware);
 * ```
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint to avoid recursive metrics
  if (req.path === '/metrics') {
    return next();
  }

  const start = Date.now();

  // Capture response finish event
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = getRoutePattern(req);
    const method = req.method;
    const statusCode = res.statusCode.toString();

    // Record metrics
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );

    httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });
  });

  next();
}

/**
 * Extract route pattern from Express request
 *
 * Returns route pattern (e.g., "/api/v1/bookmarks/:id") instead of actual path
 * This allows better metric aggregation
 */
function getRoutePattern(req: Request): string {
  // Try to get route from Express router
  if (req.route && req.route.path) {
    const baseUrl = req.baseUrl || '';
    return `${baseUrl}${req.route.path}`;
  }

  // Fallback to path for unmatched routes
  const path = req.path;

  // Normalize common patterns
  if (path === '/' || path === '') return 'root';
  if (path === '/health') return '/health';
  if (path === '/metrics') return '/metrics';

  // Try to extract route pattern from path
  // Replace UUIDs with :id
  let pattern = path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id'
  );

  // Replace numeric IDs
  pattern = pattern.replace(/\/\d+/g, '/:id');

  // Replace job IDs (enrich-xxx format)
  pattern = pattern.replace(/\/enrich-[a-z0-9]+/gi, '/enrich-:jobId');

  return pattern;
}

/**
 * Helper: Record custom metric
 *
 * Use this to record business-specific metrics in route handlers
 *
 * @example
 * import { recordMetric } from '../middleware/metrics';
 * recordMetric('bookmark_created', { user_id: req.user.id });
 */
export function recordMetric(metricName: string, labels?: Record<string, string | number>): void {
  // This is a placeholder for custom metric recording
  // Extend as needed for specific use cases
  console.log(`[Metrics] ${metricName}`, labels);
}
