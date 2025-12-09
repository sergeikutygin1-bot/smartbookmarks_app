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

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

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

// Enrichment endpoint
app.post("/enrich", async (req, res) => {
  const enrichmentId = enrichmentTracker.startEnrichment(req.body.url);

  try {
    const { url, existingTags = [] } = req.body;

    if (!url) {
      enrichmentTracker.failEnrichment(enrichmentId, "URL is required");
      return res.status(400).json({ error: "URL is required" });
    }

    logger.info("server", `Enriching URL: ${url}`);
    const startTime = Date.now();

    const result = await enrichUrl(url, existingTags);

    const duration = Date.now() - startTime;
    enrichmentTracker.completeEnrichment(enrichmentId);
    logger.info("server", `Enrichment completed in ${duration}ms`, {
      url,
      duration,
    });

    res.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    enrichmentTracker.failEnrichment(enrichmentId, errorMessage);

    logger.error("server", "Enrichment failed", {
      error: errorMessage,
      url: req.body.url,
    });

    res.status(500).json({
      error: "Enrichment failed",
      message: errorMessage,
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
  console.log(`   Admin dashboard:  GET  http://localhost:${PORT}/admin`);
  console.log("\n" + "=".repeat(60) + "\n");

  logger.info("server", `Server started on port ${PORT}`);
});
