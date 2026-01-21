/**
 * OpenTelemetry Distributed Tracing Configuration
 *
 * Provides end-to-end request tracing with automatic instrumentation
 * for Express, HTTP, PostgreSQL, Redis, and other dependencies
 *
 * Architecture:
 * - Traces are exported to Jaeger (http://localhost:16686)
 * - Automatic instrumentation for common libraries
 * - Custom attributes for user context, errors, and performance
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Use require for better CommonJS compatibility
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT } = require('@opentelemetry/semantic-conventions');

/**
 * Initialize OpenTelemetry SDK
 *
 * IMPORTANT: This must be called BEFORE any other imports in your application
 * Otherwise, auto-instrumentation may not work correctly
 */
export function initTracing(): void {
  // Only enable in development/staging, not in production (unless explicitly enabled)
  const tracingEnabled = process.env.ENABLE_TRACING === 'true';

  if (!tracingEnabled) {
    console.log('[Tracing] OpenTelemetry tracing is disabled. Set ENABLE_TRACING=true to enable.');
    return;
  }

  // Enable diagnostic logging for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  // Configure OTLP exporter (sends traces to Jaeger)
  // Note: Use base endpoint without path - SDK will append /v1/traces automatically
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318',
  });

  // Configure SDK with automatic instrumentation
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'smart-bookmarks-backend',
      [ATTR_SERVICE_VERSION]: '1.0.0',
      [ATTR_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Instrument HTTP requests (incoming and outgoing)
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // Add custom attributes to HTTP spans
          requestHook: (span, request) => {
            // Add user context if available
            const userId = (request as any).user?.id;
            if (userId) {
              span.setAttribute('user.id', userId);
            }
          },
          // Add response attributes
          responseHook: (span, response) => {
            span.setAttribute('http.response.status_code', response.statusCode);
          },
        },

        // Instrument Express routes
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },

        // Instrument PostgreSQL queries
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
          enhancedDatabaseReporting: true, // Include SQL statements (sanitized)
        },

        // Instrument Redis commands
        '@opentelemetry/instrumentation-redis-4': {
          enabled: true,
        },

        // Instrument DNS lookups
        '@opentelemetry/instrumentation-dns': {
          enabled: true,
        },

        // Disable instrumentation for file system (too noisy)
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  console.log('[Tracing] OpenTelemetry tracing initialized');
  console.log(`[Tracing] Service: ${process.env.OTEL_SERVICE_NAME || 'smart-bookmarks-backend'}`);
  console.log(`[Tracing] Exporter: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318'}`);
  console.log('[Tracing] Jaeger UI: http://localhost:16686');

  // Gracefully shutdown on process termination
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[Tracing] OpenTelemetry SDK shut down'))
      .catch((error) => console.error('[Tracing] Error shutting down SDK', error))
      .finally(() => process.exit(0));
  });
}

/**
 * Get current trace context (for manual instrumentation)
 *
 * @example
 * import { trace } from '@opentelemetry/api';
 * const span = trace.getTracer('my-tracer').startSpan('my-operation');
 * // ... do work
 * span.end();
 */
export { trace, context } from '@opentelemetry/api';
