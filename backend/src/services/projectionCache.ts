import { RedisCache, createCache } from './cache';
import { PositionData } from '../agents/ProjectionAgent';

/**
 * Projection Cache Service
 *
 * Caches 2D projections of bookmark embeddings via UMAP
 * - TTL: 6 hours (embeddings are stable after enrichment)
 * - Key pattern: `graph:projection:{user_id}`
 * - Invalidation: On bookmark create/delete with embedding
 *
 * Integration with existing cache architecture:
 * This is the 8th cache layer, following the pattern established in graphCache.ts
 */
export class ProjectionCacheService {
  private cache: RedisCache; // TTL: 6 hours (21,600 seconds)

  constructor() {
    this.cache = createCache('graph:projection:', 21600); // 6 hours
    console.log('[ProjectionCache] Initialized with 6-hour TTL');
  }

  /**
   * Get cached projection data for a user
   */
  async getProjection(userId: string): Promise<PositionData | null> {
    const key = userId;
    const cached = await this.cache.get(key);

    if (cached) {
      console.log(`[ProjectionCache] Cache HIT for user ${userId}`);
      return cached as PositionData;
    }

    console.log(`[ProjectionCache] Cache MISS for user ${userId}`);
    return null;
  }

  /**
   * Cache projection data for a user
   */
  async setProjection(userId: string, data: PositionData): Promise<void> {
    const key = userId;
    await this.cache.set(key, data);
    console.log(
      `[ProjectionCache] Cached positions for user ${userId}: ${data.positions.bookmarks.length} bookmarks, ${data.positions.concepts.length} concepts, ${data.positions.entities.length} entities`
    );
  }

  /**
   * Invalidate projection cache for a user
   * Call this when:
   * - New bookmark with embedding is created
   * - Bookmark is deleted
   * - User manually requests "Reset to Semantic Layout"
   */
  async invalidateProjection(userId: string): Promise<void> {
    const key = userId;
    await this.cache.clear(key);
    console.log(`[ProjectionCache] Invalidated projection cache for user ${userId}`);
  }

  /**
   * Get cache statistics for monitoring
   */
  async getStats() {
    const stats = await this.cache.getStats();
    return {
      ...stats,
      name: 'projection',
      ttl: 21600,
    };
  }
}

// Export singleton instance
export const projectionCache = new ProjectionCacheService();
