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
import { enrichUrl } from "./agents/enrichmentAgent";
import { logger } from "./services/logger";
import { enrichmentTracker } from "./services/enrichmentTracker";
import adminRoutes from "./routes/admin";
import searchRoutes from "./routes/search";
import bookmarksRoutes from "./routes/bookmarks";
import { enrichmentQueue } from "./queues/enrichmentQueue";
import { authMiddleware } from "./middleware/auth";
import { enrichmentRateLimit, generalRateLimit, searchRateLimit } from "./middleware/rateLimiter";
import { checkDailyBudget } from "./middleware/costControl";

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for vector embeddings

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

// Admin dashboard routes
app.use("/admin", adminRoutes);

// Search routes (with dedicated rate limit: 30 req/min)
app.use("/search", searchRateLimit, searchRoutes);

// Bookmarks CRUD routes
app.use("/api/bookmarks", bookmarksRoutes);

// Enrichment endpoint (async job-based)
// Rate limits: 10/hour, 50/day per user + $10/day OpenAI budget
app.post("/enrich", authMiddleware, enrichmentRateLimit, checkDailyBudget, async (req, res) => {
  const { url, userTitle, userSummary, userTags, existingTags = [], bookmarkId } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    logger.info("server", `Queueing enrichment job for: ${url}`);

    // Add job to queue (returns immediately)
    const job = await enrichmentQueue.addJob({
      url,
      userTitle,
      userSummary,
      userTags,
      existingTags,
      bookmarkId,
      userId: req.user!.id,
    });

    logger.info("server", `Job queued: ${job.id}`);

    // Return job ID for polling
    res.json({
      jobId: job.id,
      status: "queued",
      message: "Enrichment job queued successfully. Poll /enrich/:jobId for status."
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error("server", "Failed to queue enrichment job", {
      error: errorMessage,
      url,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: errorMessage,
      message: "Failed to queue enrichment job",
    });
  }
});

// Get enrichment job status and result
app.get("/enrich/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const jobState = await enrichmentQueue.getJobState(jobId);

    if (!jobState) {
      return res.status(404).json({
        error: "Job not found",
        message: `No job found with ID: ${jobId}`,
      });
    }

    const progress = await enrichmentQueue.getJobProgress(jobId);

    // Base response
    const response: any = {
      jobId,
      status: jobState,
      progress: progress?.progress,
      attemptsMade: progress?.attemptsMade,
    };

    // Add result if completed
    if (jobState === "completed") {
      const result = await enrichmentQueue.getJobResult(jobId);
      response.result = result;
    }

    // Add failure reason if failed
    if (jobState === "failed") {
      response.error = progress?.failedReason;
      response.attemptsMade = progress?.attemptsMade;
    }

    res.json(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error("server", "Failed to get job status", {
      error: errorMessage,
      jobId,
    });

    res.status(500).json({
      error: errorMessage,
      message: "Failed to retrieve job status",
    });
  }
});

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
  console.log(`\n🔍 Search & Admin:`);
  console.log(`   Search endpoint:  POST   http://localhost:${PORT}/search`);
  console.log(`   Admin dashboard:  GET    http://localhost:${PORT}/admin`);
  console.log("\n⚙️  Background worker: npm run worker");
  console.log("=".repeat(60) + "\n");

  logger.info("server", `Server started on port ${PORT}`);
});
