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
 * @openapi
 * /api/v1/graph/bookmarks/{id}/related:
 *   get:
 *     summary: Find related bookmarks
 *     description: Find related bookmarks using 1-3 hop graph traversal via entities and concepts
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Bookmark ID
 *       - in: query
 *         name: depth
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 3
 *           default: 2
 *         description: Traversal depth (1-3 hops)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Related bookmarks with entities and concepts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookmarkId:
 *                       type: string
 *                       format: uuid
 *                     related:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Bookmark'
 *                     entities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entity:
 *                             $ref: '#/components/schemas/Entity'
 *                           weight:
 *                             type: number
 *                             description: Relationship strength (0-1)
 *                     concepts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           concept:
 *                             $ref: '#/components/schemas/Concept'
 *                           weight:
 *                             type: number
 *                             description: Relationship strength (0-1)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/graph/entities:
 *   get:
 *     summary: List entities
 *     description: List all extracted entities with optional type filtering
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [person, company, technology, product, location]
 *         description: Filter by entity type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: List of entities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Entity'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get('/entities', async (req: Request, res: Response) => {
  try {
    console.log('[GraphRoute] GET /entities - Start', { userId: req.user!.id });
    const userId = req.user!.id;
    const { type, limit } = req.query;

    console.log('[GraphRoute] Calling graphService.listEntities...');
    const entities = await graphService.listEntities(
      userId,
      type as string,
      limit ? parseInt(limit as string) : 50
    );

    console.log('[GraphRoute] Entities fetched:', entities.length);
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
 * @openapi
 * /api/v1/graph/entities/{id}/bookmarks:
 *   get:
 *     summary: Get bookmarks for entity
 *     description: Retrieve all bookmarks that mention a specific entity
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Entity ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Bookmarks mentioning the entity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Bookmark'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/graph/concepts:
 *   get:
 *     summary: List concepts
 *     description: List all extracted concepts with hierarchical relationships
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 100
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: List of concepts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Concept'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get('/concepts', async (req: Request, res: Response) => {
  try {
    console.log('[GraphRoute] GET /concepts - Start', { userId: req.user!.id });
    const userId = req.user!.id;
    const { limit } = req.query;

    console.log('[GraphRoute] Calling graphService.listConcepts...');
    const concepts = await graphService.listConcepts(
      userId,
      limit ? parseInt(limit as string) : 100
    );

    console.log('[GraphRoute] Concepts fetched:', concepts.length);
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
 * @openapi
 * /api/v1/graph/concepts/{id}/related:
 *   get:
 *     summary: Find related concepts
 *     description: Find concepts related via co-occurrence in bookmarks
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Concept ID
 *       - in: query
 *         name: minCoOccurrence
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 2
 *         description: Minimum number of shared bookmarks
 *     responses:
 *       200:
 *         description: Related concepts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     conceptId:
 *                       type: string
 *                       format: uuid
 *                     related:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Concept'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/graph/stats:
 *   get:
 *     summary: Get graph statistics
 *     description: Retrieve knowledge graph statistics for the authenticated user
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graph statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalBookmarks:
 *                       type: integer
 *                     totalEntities:
 *                       type: integer
 *                     totalConcepts:
 *                       type: integer
 *                     totalRelationships:
 *                       type: integer
 *                     totalClusters:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/graph/bookmarks/{id}/refresh:
 *   post:
 *     summary: Refresh bookmark graph
 *     description: Trigger graph refresh for a specific bookmark (re-extract entities, concepts, relationships)
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Bookmark ID
 *     responses:
 *       200:
 *         description: Graph refresh triggered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Graph refresh queued for processing
 *                     jobId:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/graph/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Retrieve cache performance statistics for monitoring (admin use)
 *     tags:
 *       - Knowledge Graph
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalKeys:
 *                       type: integer
 *                       description: Total number of cached keys
 *                     hitRate:
 *                       type: number
 *                       description: Cache hit rate (0-1)
 *                     memoryUsage:
 *                       type: string
 *                       description: Memory usage in MB
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
