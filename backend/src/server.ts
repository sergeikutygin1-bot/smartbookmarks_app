/**
 * Backend API Server for Smart Bookmarks
 *
 * Features:
 * - REST API for bookmark enrichment
 * - Admin dashboard for monitoring
 * - Real-time logging and tracking
 * - Distributed tracing with OpenTelemetry
 */

import "dotenv/config";

// IMPORTANT: Initialize tracing BEFORE any other imports
// This ensures auto-instrumentation works for all dependencies
import { initTracing } from "./config/tracing";
initTracing();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "./config/passport";
import { enrichUrl } from "./agents/enrichmentAgent";
import { logger } from "./services/logger";
import { enrichmentTracker } from "./services/enrichmentTracker";
import adminRoutes from "./routes/admin";
import searchRoutes from "./routes/search";
import bookmarksRoutes from "./routes/bookmarks";
import enrichRoutes from "./routes/enrich";
import graphRoutes from "./routes/graph";
import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profile";
import { enrichmentQueue } from "./queues/enrichmentQueue";
import { authMiddleware } from "./middleware/auth";
import { adminMiddleware } from "./middleware/adminAuth";
import { enrichmentRateLimit, generalRateLimit, searchRateLimit, authRateLimit } from "./middleware/rateLimiter";
import { checkDailyBudget } from "./middleware/costControl";
import { configureSecurityHeaders } from "./middleware/security";
import { setupSwagger } from "./config/swagger";
import { verifyCsrfToken } from "./middleware/csrf";
import { apiVersionHeader, deprecationWarning } from "./middleware/versioning";
import { metricsMiddleware } from "./middleware/metrics";
import { register as metricsRegister } from "./config/metrics";

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' })); // Increase limit for vector embeddings
app.use(passport.initialize());

// Security headers (Helmet.js) - MUST be early in middleware chain
configureSecurityHeaders(app);

// Metrics collection middleware - tracks all HTTP requests
app.use(metricsMiddleware);

// Global rate limiting (user-based for authenticated, IP-based for unauthenticated)
app.use(generalRateLimit);

// Request logging middleware - filter out noisy admin routes and polling requests
app.use((req, res, next) => {
  // Skip logging for:
  // - Admin dashboard polling (happens every few seconds)
  // - Job status polling (GET /enrich/:jobId) - these happen every 2 seconds during enrichment
  // - Regular API endpoint calls (too noisy, use INFO logs for important events instead)
  const skipPaths = [
    "/admin/stats",
    "/admin/enrichments",
    "/admin/jobs",  // Admin job polling
    "/admin/logs/stream",
    "/health"
  ];
  const isJobStatusPolling = req.method === 'GET' && req.path.startsWith('/enrich/enrich-');
  const isApiEndpoint = req.path.startsWith('/api/bookmarks');

  if (!skipPaths.includes(req.path) && !isJobStatusPolling && !isApiEndpoint) {
    logger.debug("server", `${req.method} ${req.path}`);
  }
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "smart-bookmarks-backend" });
});

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set('Content-Type', metricsRegister.contentType);
    res.send(await metricsRegister.metrics());
  } catch (error) {
    res.status(500).send('Error generating metrics');
  }
});

// ============================================================
// API v1 Routes - All public API endpoints
// ============================================================

// Apply version header to all v1 routes
app.use("/api/v1", apiVersionHeader("1.0.0"));

// Authentication routes (with auth rate limiting)
app.use("/api/v1/auth", authRateLimit, authRoutes);

// Profile routes (protected with auth + CSRF)
app.use("/api/v1/profile", authMiddleware, verifyCsrfToken, profileRoutes);

// Bookmarks CRUD routes (protected with auth + CSRF)
// IMPORTANT: authMiddleware must run BEFORE verifyCsrfToken
app.use("/api/v1/bookmarks", authMiddleware, verifyCsrfToken, bookmarksRoutes);

// Graph API routes
app.use("/api/v1/graph", graphRoutes);

// Search routes (with dedicated rate limit: 30 req/min)
app.use("/api/v1/search", searchRateLimit, searchRoutes);

// Enrichment routes (polling + SSE)
app.use("/api/v1/enrich", enrichRoutes);

// ============================================================
// Backward Compatibility Redirects (deprecated - use /api/v1/)
// ============================================================

// Redirect /api/bookmarks -> /api/v1/bookmarks (deprecated)
app.use("/api/bookmarks",
  deprecationWarning("Use /api/v1/bookmarks instead", "2026-04-20"),
  (req, res, next) => {
    req.url = `/api/v1/bookmarks${req.url}`;
    next();
  },
  authMiddleware, verifyCsrfToken, bookmarksRoutes
);

// Redirect /search -> /api/v1/search (deprecated)
app.use("/search",
  deprecationWarning("Use /api/v1/search instead", "2026-04-20"),
  (req, res, next) => {
    req.url = `/api/v1/search${req.url}`;
    next();
  },
  searchRateLimit, searchRoutes
);

// Redirect /enrich -> /api/v1/enrich (deprecated)
app.use("/enrich",
  deprecationWarning("Use /api/v1/enrich instead", "2026-04-20"),
  (req, res, next) => {
    req.url = `/api/v1/enrich${req.url}`;
    next();
  },
  enrichRoutes
);

// ============================================================
// Admin & Documentation (not versioned)
// ============================================================

// Admin dashboard routes (protected)
app.use("/admin", authMiddleware, adminMiddleware, adminRoutes);

// API Documentation (Swagger UI) - Admin only
setupSwagger(app, authMiddleware, adminMiddleware);

// Start server
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 Smart Bookmarks Backend Server");
  console.log("=".repeat(60));
  console.log(`\n📍 Server running on http://localhost:${PORT}`);
  console.log(`   Health check:     GET    http://localhost:${PORT}/health`);
  console.log(`\n📚 Bookmarks API:`);
  console.log(`   List bookmarks:   GET    http://localhost:${PORT}/api/bookmarks`);
  console.log(`   Get bookmark:     GET    http://localhost:${PORT}/api/bookmarks/:id`);
  console.log(`   Create bookmark:  POST   http://localhost:${PORT}/api/bookmarks`);
  console.log(`   Update bookmark:  PATCH  http://localhost:${PORT}/api/bookmarks/:id`);
  console.log(`   Delete bookmark:  DELETE http://localhost:${PORT}/api/bookmarks/:id`);
  console.log(`\n✨ Enrichment API:`);
  console.log(`   Enrich (queue):   POST   http://localhost:${PORT}/enrich`);
  console.log(`   Job status:       GET    http://localhost:${PORT}/enrich/:jobId`);
  console.log(`   Job stream (SSE): GET    http://localhost:${PORT}/enrich/:jobId/stream`);
  console.log(`\n🔗 Knowledge Graph API:`);
  console.log(`   Related bookmarks: GET   http://localhost:${PORT}/api/v1/graph/bookmarks/:id/related`);
  console.log(`   List entities:     GET   http://localhost:${PORT}/api/v1/graph/entities`);
  console.log(`   List concepts:     GET   http://localhost:${PORT}/api/v1/graph/concepts`);
  console.log(`   Graph stats:       GET   http://localhost:${PORT}/api/v1/graph/stats`);
  console.log(`\n🔍 Search & Admin:`);
  console.log(`   Search endpoint:  POST   http://localhost:${PORT}/search`);
  console.log(`   Admin dashboard:  GET    http://localhost:${PORT}/admin`);
  console.log("\n⚙️  Background workers:");
  console.log("   Enrichment:       npm run worker");
  console.log("   Graph:            npm run worker:graph");
  console.log("=".repeat(60) + "\n");

  logger.info("server", `Server started on port ${PORT}`);
});
