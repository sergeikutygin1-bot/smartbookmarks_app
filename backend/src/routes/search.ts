import { Router, Request, Response } from "express";
import { hybridSearch, type SearchableItem } from "../services/vectorSearch";

const router = Router();

/**
 * POST /search
 * Perform hybrid search across bookmarks
 *
 * Body:
 * - query: string (required) - Search query
 * - bookmarks: SearchableItem[] (required) - Array of bookmarks to search
 * - topK: number (optional) - Number of results to return (default: 10)
 * - semanticWeight: number (optional) - Weight for semantic vs keyword (0-1, default: 0.6)
 * - minScore: number (optional) - Minimum score threshold (default: 0.1)
 *
 * Response:
 * - results: Array of bookmark IDs with scores
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      query,
      bookmarks,
      topK = 10,
      semanticWeight = 0.6,
      minScore = 0.1,
    } = req.body;

    // Validation
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Missing or invalid query parameter",
      });
    }

    if (!Array.isArray(bookmarks)) {
      return res.status(400).json({
        error: "Missing or invalid bookmarks array",
      });
    }

    // Perform hybrid search
    const results = await hybridSearch({
      query: query.trim(),
      items: bookmarks,
      topK,
      semanticWeight,
      minScore,
    });

    res.json({
      query,
      results,
      metadata: {
        totalItems: bookmarks.length,
        resultsCount: results.length,
        semanticWeight,
        minScore,
      },
    });
  } catch (error) {
    console.error("[SearchRoute] Search failed:", error);
    res.status(500).json({
      error: "Search failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
