import express, { Request, Response } from 'express';
import { graphService } from '../services/graphService';
import { graphCache } from '../services/graphCache';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/v1/graph/bookmarks/:id/related
 * Find related bookmarks (1-3 hop traversal)
 *
 * Query params:
 * - depth: Traversal depth (1-3, default: 2)
 * - limit: Max results (default: 20)
 */
router.get('/bookmarks/:id/related', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { depth, limit } = req.query;

    const related = await graphService.findRelatedBookmarks(
      id,
      userId,
      depth ? parseInt(depth as string) : 2,
      limit ? parseInt(limit as string) : 20
    );

    res.json({
      data: {
        bookmarkId: id,
        related,
      },
    });
  } catch (error) {
    console.error('Error finding related bookmarks:', error);
    const statusCode = error instanceof Error && error.message === 'Bookmark not found' ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to find related bookmarks',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/entities
 * List extracted entities with filters
 *
 * Query params:
 * - type: Filter by entity type (person, company, technology, product, location)
 * - limit: Max results (default: 50)
 */
router.get('/entities', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { type, limit } = req.query;

    const entities = await graphService.listEntities(
      userId,
      type as string,
      limit ? parseInt(limit as string) : 50
    );

    res.json({ data: entities });
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({
      error: 'Failed to fetch entities',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/entities/:id/bookmarks
 * Get all bookmarks mentioning an entity
 *
 * Query params:
 * - limit: Max results (default: 50)
 */
router.get('/entities/:id/bookmarks', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { limit } = req.query;

    const bookmarks = await graphService.getBookmarksForEntity(
      id,
      userId,
      limit ? parseInt(limit as string) : 50
    );

    res.json({ data: bookmarks });
  } catch (error) {
    console.error('Error fetching bookmarks for entity:', error);
    const statusCode = error instanceof Error && error.message === 'Entity not found' ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to fetch bookmarks',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/concepts
 * List concepts with hierarchy
 *
 * Query params:
 * - limit: Max results (default: 100)
 */
router.get('/concepts', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit } = req.query;

    const concepts = await graphService.listConcepts(
      userId,
      limit ? parseInt(limit as string) : 100
    );

    res.json({ data: concepts });
  } catch (error) {
    console.error('Error fetching concepts:', error);
    res.status(500).json({
      error: 'Failed to fetch concepts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/concepts/:id/related
 * Find related concepts (via co-occurrence)
 *
 * Query params:
 * - minCoOccurrence: Minimum shared bookmarks (default: 2)
 */
router.get('/concepts/:id/related', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { minCoOccurrence } = req.query;

    const relatedConcepts = await graphService.findRelatedConcepts(
      id,
      userId,
      minCoOccurrence ? parseInt(minCoOccurrence as string) : 2
    );

    res.json({
      data: {
        conceptId: id,
        related: relatedConcepts,
      },
    });
  } catch (error) {
    console.error('Error finding related concepts:', error);
    const statusCode = error instanceof Error && error.message === 'Concept not found' ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to find related concepts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/clusters
 * List auto-generated clusters
 *
 * Query params:
 * - limit: Max results (default: 20)
 */
router.get('/clusters', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit } = req.query;

    const clusters = await graphService.listClusters(
      userId,
      limit ? parseInt(limit as string) : 20
    );

    res.json({ data: clusters });
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({
      error: 'Failed to fetch clusters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/clusters/:id
 * Get cluster details with member bookmarks
 *
 * Query params:
 * - bookmarkLimit: Max bookmarks to return (default: 50)
 */
router.get('/clusters/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { bookmarkLimit } = req.query;

    const cluster = await graphService.getClusterDetails(
      id,
      userId,
      bookmarkLimit ? parseInt(bookmarkLimit as string) : 50
    );

    res.json({ data: cluster });
  } catch (error) {
    console.error('Error fetching cluster:', error);
    const statusCode = error instanceof Error && error.message === 'Cluster not found' ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to fetch cluster',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/graph/clusters/:id/merge
 * Merge two clusters
 *
 * Body:
 * - sourceClusterId: Cluster to merge and delete
 */
router.post('/clusters/:id/merge', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: targetClusterId } = req.params;
    const { sourceClusterId } = req.body;

    if (!sourceClusterId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'sourceClusterId is required',
      });
    }

    const result = await graphService.mergeClusters(
      targetClusterId,
      sourceClusterId,
      userId
    );

    res.json({ data: result });
  } catch (error) {
    console.error('Error merging clusters:', error);
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to merge clusters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/stats
 * Get graph statistics for the user
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const stats = await graphService.getGraphStats(userId);

    res.json({ data: stats });
  } catch (error) {
    console.error('Error fetching graph stats:', error);
    res.status(500).json({
      error: 'Failed to fetch graph statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/graph/bookmarks/:id/refresh
 * Trigger graph refresh for a specific bookmark
 */
router.post('/bookmarks/:id/refresh', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await graphService.refreshBookmarkGraph(id, userId);

    res.json({ data: result });
  } catch (error) {
    console.error('Error refreshing bookmark graph:', error);
    const statusCode = error instanceof Error && error.message === 'Bookmark not found' ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to refresh graph',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/insights
 * Get AI-generated insights for the user
 *
 * Query params:
 * - regenerate: Force regeneration of insights (default: false)
 */
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const regenerate = req.query.regenerate === 'true';

    const { insightEngineAgent } = await import('../agents/InsightEngineAgent');

    let insights;
    if (regenerate) {
      // Force regeneration
      insights = await insightEngineAgent.generateInsights(userId);
    } else {
      // Try to get cached insights first
      insights = await insightEngineAgent.getInsights(userId);

      // If no insights or expired, generate new ones
      if (insights.length === 0) {
        insights = await insightEngineAgent.generateInsights(userId);
      }
    }

    res.json({ data: insights });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({
      error: 'Failed to fetch insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/graph/cache/stats
 * Get cache statistics for monitoring
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = await graphCache.getCacheStats();

    res.json({ data: stats });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({
      error: 'Failed to fetch cache statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
