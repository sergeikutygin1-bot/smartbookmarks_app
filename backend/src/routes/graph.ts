import express, { Request, Response } from 'express';
import { graphService } from '../services/graphService';
import { graphCache } from '../services/graphCache';
import { authMiddleware } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import projectionRouter from './projection';

const prisma = new PrismaClient();

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Mount projection routes
router.use('/positions', projectionRouter);

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

    // Also fetch entities and concepts connected to this bookmark
    const [entityRelationships, conceptRelationships] = await Promise.all([
      // Get entities mentioned in this bookmark
      prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: id,
          targetType: 'entity',
        },
        take: 20,
      }),
      // Get concepts this bookmark is about
      prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: id,
          targetType: 'concept',
        },
        take: 20,
      }),
    ]);

    // Fetch the actual entity and concept data
    const [entities, concepts] = await Promise.all([
      entityRelationships.length > 0
        ? prisma.entity.findMany({
            where: {
              id: { in: entityRelationships.map(rel => rel.targetId) },
            },
          })
        : [],
      conceptRelationships.length > 0
        ? prisma.concept.findMany({
            where: {
              id: { in: conceptRelationships.map(rel => rel.targetId) },
            },
          })
        : [],
    ]);

    // Create maps for quick lookup
    const entityMap = new Map(entities.map(e => [e.id, e]));
    const conceptMap = new Map(concepts.map(c => [c.id, c]));

    res.json({
      data: {
        bookmarkId: id,
        related,
        entities: entityRelationships
          .map(rel => ({
            entity: entityMap.get(rel.targetId),
            weight: rel.weight,
          }))
          .filter(e => e.entity), // Remove any not found
        concepts: conceptRelationships
          .map(rel => ({
            concept: conceptMap.get(rel.targetId),
            weight: rel.weight,
          }))
          .filter(c => c.concept), // Remove any not found
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
