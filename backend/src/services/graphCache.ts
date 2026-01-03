import { RedisCache, createCache } from './cache';

/**
 * Graph Cache Service
 *
 * Multi-tier caching strategy for knowledge graph queries:
 * - Similar bookmarks: 30 min (embeddings are stable)
 * - Entities: 1 hour (updated when new entities extracted)
 * - Concepts: 1 hour (updated when new concepts created)
 * - Stats: 10 minutes (frequently changing)
 *
 * Cache invalidation triggers:
 * - Entity/concept creation: Clear respective caches
 * - Graph refresh: Clear all caches for that user
 */
export class GraphCacheService {
  // Separate cache instances for different data types with optimized TTLs
  private similarCache: RedisCache; // 30 minutes
  private entityCache: RedisCache; // 1 hour
  private conceptCache: RedisCache; // 1 hour
  private statsCache: RedisCache; // 10 minutes

  constructor() {
    this.similarCache = createCache('graph:similar:', 1800); // 30 min
    this.entityCache = createCache('graph:entities:', 3600); // 1 hour
    this.conceptCache = createCache('graph:concepts:', 3600); // 1 hour
    this.statsCache = createCache('graph:stats:', 600); // 10 min

    console.log('[GraphCache] Initialized multi-tier cache strategy');
  }

  /**
   * Get cached similar bookmarks
   */
  async getSimilar(bookmarkId: string, userId: string, depth: number, limit: number) {
    const key = `${userId}:${bookmarkId}:d${depth}:l${limit}`;
    return this.similarCache.get(key);
  }

  /**
   * Cache similar bookmarks
   */
  async setSimilar(
    bookmarkId: string,
    userId: string,
    depth: number,
    limit: number,
    data: any
  ) {
    const key = `${userId}:${bookmarkId}:d${depth}:l${limit}`;
    await this.similarCache.set(key, data);
  }

  /**
   * Get cached entity list
   */
  async getEntityList(userId: string, entityType: string | undefined, limit: number) {
    const key = `${userId}:list:${entityType || 'all'}:l${limit}`;
    return this.entityCache.get(key);
  }

  /**
   * Cache entity list
   */
  async setEntityList(
    userId: string,
    entityType: string | undefined,
    limit: number,
    data: any
  ) {
    const key = `${userId}:list:${entityType || 'all'}:l${limit}`;
    await this.entityCache.set(key, data);
  }

  /**
   * Get cached bookmarks for entity
   */
  async getEntityBookmarks(entityId: string, userId: string, limit: number) {
    const key = `${userId}:entity:${entityId}:l${limit}`;
    return this.entityCache.get(key);
  }

  /**
   * Cache bookmarks for entity
   */
  async setEntityBookmarks(entityId: string, userId: string, limit: number, data: any) {
    const key = `${userId}:entity:${entityId}:l${limit}`;
    await this.entityCache.set(key, data);
  }

  /**
   * Get cached concept list
   */
  async getConceptList(userId: string, limit: number) {
    const key = `${userId}:list:l${limit}`;
    return this.conceptCache.get(key);
  }

  /**
   * Cache concept list
   */
  async setConceptList(userId: string, limit: number, data: any) {
    const key = `${userId}:list:l${limit}`;
    await this.conceptCache.set(key, data);
  }

  /**
   * Get cached related concepts
   */
  async getRelatedConcepts(
    conceptId: string,
    userId: string,
    minCoOccurrence: number
  ) {
    const key = `${userId}:related:${conceptId}:m${minCoOccurrence}`;
    return this.conceptCache.get(key);
  }

  /**
   * Cache related concepts
   */
  async setRelatedConcepts(
    conceptId: string,
    userId: string,
    minCoOccurrence: number,
    data: any
  ) {
    const key = `${userId}:related:${conceptId}:m${minCoOccurrence}`;
    await this.conceptCache.set(key, data);
  }

  /**
   * Get cached graph stats
   */
  async getStats(userId: string) {
    const key = userId;
    return this.statsCache.get(key);
  }

  /**
   * Cache graph stats
   */
  async setStats(userId: string, data: any) {
    const key = userId;
    await this.statsCache.set(key, data);
  }

  /**
   * Invalidate entity caches for a user
   * Call this when new entities are created
   */
  async invalidateEntityCaches(userId: string) {
    await this.entityCache.clear(`${userId}:*`);
    console.log(`[GraphCache] Invalidated entity caches for user ${userId}`);
  }

  /**
   * Invalidate concept caches for a user
   * Call this when new concepts are created
   */
  async invalidateConceptCaches(userId: string) {
    await this.conceptCache.clear(`${userId}:*`);
    console.log(`[GraphCache] Invalidated concept caches for user ${userId}`);
  }

  /**
   * Invalidate similar bookmark caches for a specific bookmark
   * Call this when a bookmark's relationships change
   */
  async invalidateSimilarCaches(bookmarkId: string, userId: string) {
    await this.similarCache.clear(`${userId}:${bookmarkId}:*`);
    console.log(`[GraphCache] Invalidated similar caches for bookmark ${bookmarkId}`);
  }

  /**
   * Invalidate stats cache for a user
   * Call this when graph structure changes significantly
   */
  async invalidateStatsCaches(userId: string) {
    await this.statsCache.clear(userId);
    console.log(`[GraphCache] Invalidated stats cache for user ${userId}`);
  }

  /**
   * Invalidate ALL graph caches for a user
   * Call this on graph refresh or major updates
   */
  async invalidateAllCaches(userId: string) {
    await Promise.all([
      this.similarCache.clear(`${userId}:*`),
      this.entityCache.clear(`${userId}:*`),
      this.conceptCache.clear(`${userId}:*`),
      this.statsCache.clear(userId),
    ]);
    console.log(`[GraphCache] Invalidated ALL graph caches for user ${userId}`);
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats() {
    const [similarStats, entityStats, conceptStats, statsStats] =
      await Promise.all([
        this.similarCache.getStats(),
        this.entityCache.getStats(),
        this.conceptCache.getStats(),
        this.statsCache.getStats(),
      ]);

    return {
      similar: similarStats,
      entities: entityStats,
      concepts: conceptStats,
      stats: statsStats,
      overall: {
        totalSize:
          similarStats.size +
          entityStats.size +
          conceptStats.size +
          statsStats.size,
        averageHitRate:
          (similarStats.hitRate +
            entityStats.hitRate +
            conceptStats.hitRate +
            statsStats.hitRate) /
          4,
      },
    };
  }

  /**
   * Warm up cache with commonly accessed data
   * Call this after graph processing completes
   */
  async warmCache(userId: string) {
    // This is a placeholder for cache warming logic
    // In production, you might:
    // 1. Pre-compute top entities
    // 2. Pre-compute top concepts
    // 3. Pre-compute graph stats
    console.log(`[GraphCache] Cache warming initiated for user ${userId}`);
  }
}

// Export singleton instance
export const graphCache = new GraphCacheService();
