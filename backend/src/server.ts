/**
 * Backend API Server for Smart Bookmarks
 *
 * Features:
 * - REST API for bookmark enrichment
 * - Admin dashboard for monitoring
 * - Real-time logging and tracking
 */

import "dotenv/config";
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
import { enrichmentQueue } from "./queues/enrichmentQueue";
import { authMiddleware } from "./middleware/auth";
import { adminMiddleware } from "./middleware/adminAuth";
import { enrichmentRateLimit, generalRateLimit, searchRateLimit, authRateLimit } from "./middleware/rateLimiter";
import { checkDailyBudget } from "./middleware/costControl";

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' })); // Increase limit for vector embeddings
app.use(passport.initialize());

// Global rate limiting (60 req/min authenticated, 100 req/min unauthenticated)
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

// Authentication routes (with auth rate limiting)
app.use("/api/v1/auth", authRateLimit, authRoutes);

// Admin dashboard routes (protected)
app.use("/admin", authMiddleware, adminMiddleware, adminRoutes);

// Search routes (with dedicated rate limit: 30 req/min)
app.use("/search", searchRateLimit, searchRoutes);

// Bookmarks CRUD routes
app.use("/api/bookmarks", bookmarksRoutes);

// Graph API routes
app.use("/api/v1/graph", graphRoutes);

// Enrichment routes (polling + SSE)
app.use("/enrich", enrichRoutes);

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
