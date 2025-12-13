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

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for vector embeddings

// Request logging middleware - filter out noisy admin routes
app.use((req, res, next) => {
  // Skip logging for admin dashboard polling and SSE heartbeats
  const skipPaths = ["/admin/stats", "/admin/enrichments", "/admin/logs/stream", "/health"];
  if (!skipPaths.includes(req.path)) {
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

// Search routes
app.use("/search", searchRoutes);

// Enrichment endpoint
app.post("/enrich", async (req, res) => {
  const { url, existingTags = [] } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  const enrichmentId = enrichmentTracker.startEnrichment(url);

  try {
    logger.info("server", `Enriching URL: ${url}`);

    // Create agent with progress tracking
    const { EnrichmentAgent } = await import('./agents/enrichmentAgent');
    const agent = new EnrichmentAgent();

    // Track progress in enrichmentTracker
    agent.onProgress((progress) => {
      logger.debug("enrichment", `Progress: ${progress.step}`, {
        message: progress.message
      });
    });

    const startTime = Date.now();
    const result = await agent.enrich({ url, existingTags });
    const duration = Date.now() - startTime;

    // Record step successes/failures
    const errors = agent.getErrors();
    if (errors.length > 0) {
      errors.forEach((err) => {
        const stepDuration = 0; // Duration not tracked per step currently
        enrichmentTracker.recordStep(enrichmentId, err.step as any, false, stepDuration);
      });
    }

    // Mark as complete (even with non-critical errors)
    enrichmentTracker.completeEnrichment(enrichmentId);

    logger.info("server", `Enrichment completed in ${duration}ms`, {
      url,
      duration,
      errors: errors.length,
    });

    res.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    enrichmentTracker.failEnrichment(enrichmentId, errorMessage);

    logger.error("server", "Enrichment failed", {
      error: errorMessage,
      url,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: errorMessage, // Pass through the specific error message
      message: errorMessage, // Keep message for backward compatibility
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 Smart Bookmarks Backend Server");
  console.log("=".repeat(60));
  console.log(`\n📍 Server running on http://localhost:${PORT}`);
  console.log(`   Health check:     GET  http://localhost:${PORT}/health`);
  console.log(`   Enrich endpoint:  POST http://localhost:${PORT}/enrich`);
  console.log(`   Search endpoint:  POST http://localhost:${PORT}/search`);
  console.log(`   Admin dashboard:  GET  http://localhost:${PORT}/admin`);
  console.log("\n" + "=".repeat(60) + "\n");

  logger.info("server", `Server started on port ${PORT}`);
});
