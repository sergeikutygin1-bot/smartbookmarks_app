import express, { Request, Response } from 'express';
import { projectionAgent } from '../agents/ProjectionAgent';
import { projectionCache } from '../services/projectionCache';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/v1/graph/positions
 * Compute and return 2D positions for bookmarks, concepts, and entities
 *
 * Query params:
 * - refreshCache: (optional, boolean) Force recompute even if cached
 *
 * Response format:
 * {
 *   data: {
 *     bookmarkPositions: [{bookmarkId, position: {x, y}, method: 'umap'|'fallback'}],
 *     conceptPositions: [{conceptId, position: {x, y}, connectedBookmarks: [...]}],
 *     entityPositions: [{entityId, position: {x, y}, connectedBookmarks: [...]}],
 *     metadata: {
 *       totalBookmarks: number,
 *       enrichedBookmarks: number,
 *       computeTimeMs: number,
 *       cacheHit: boolean
 *     }
 *   }
 * }
 *
 * Error Response:
 * {
 *   error: string,
 *   message: string,
 *   fallback: 'force-directed'
 * }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const refreshCache = req.query.refreshCache === 'true';

    console.log(
      `[ProjectionRoute] GET /positions for user ${userId}, refreshCache=${refreshCache}`
    );

    // Check cache first (unless refresh requested)
    if (!refreshCache) {
      const cached = await projectionCache.getProjection(userId);
      if (cached) {
        // Return cached data with cache hit indicator
        res.json({
          data: {
            bookmarkPositions: cached.positions.bookmarks,
            conceptPositions: cached.positions.concepts,
            entityPositions: cached.positions.entities,
            metadata: {
              ...cached.metadata,
              cacheHit: true,
            },
          },
        });
        return;
      }
    }

    // Cache miss or refresh requested - compute positions
    console.log(
      `[ProjectionRoute] Computing fresh positions for user ${userId}`
    );

    const positionData = await projectionAgent.computeAllPositions(userId);

    // Cache the result
    await projectionCache.setProjection(userId, positionData);

    // Return fresh data
    res.json({
      data: {
        bookmarkPositions: positionData.positions.bookmarks,
        conceptPositions: positionData.positions.concepts,
        entityPositions: positionData.positions.entities,
        metadata: {
          ...positionData.metadata,
          cacheHit: false,
        },
      },
    });
  } catch (error) {
    console.error('[ProjectionRoute] Error computing positions:', error);

    // Return error with fallback indicator
    res.status(500).json({
      error: 'Failed to compute positions',
      message: error instanceof Error ? error.message : 'Unknown error',
      fallback: 'force-directed', // Tell frontend to use fallback layout
    });
  }
});

/**
 * DELETE /api/v1/graph/positions
 * Invalidate cached positions for the user
 *
 * Use cases:
 * - User clicks "Reset to Semantic Layout" button
 * - Manual cache invalidation for troubleshooting
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    console.log(`[ProjectionRoute] DELETE /positions for user ${userId}`);

    await projectionCache.invalidateProjection(userId);

    res.json({
      success: true,
      message: 'Projection cache invalidated',
    });
  } catch (error) {
    console.error('[ProjectionRoute] Error invalidating cache:', error);

    res.status(500).json({
      error: 'Failed to invalidate cache',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
