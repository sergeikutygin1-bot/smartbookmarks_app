import { Redis } from 'ioredis';
import RedisClient from '../config/redis';

/**
 * Cache Statistics Interface
 */
export interface CacheStats {
  size: number;
  memoryUsage: string;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Generic Redis-backed cache service
 *
 * Features:
 * - Persistent caching with Redis
 * - JSON serialization for complex objects
 * - TTL support with default 24 hours
 * - Pattern-based cache clearing
 * - Cache statistics and monitoring
 * - Graceful error handling
 */
export class RedisCache {
  private redis: Redis;
  private keyPrefix: string;
  private defaultTTL: number;

  // Statistics tracking
  private hits: number = 0;
  private misses: number = 0;

  /**
   * @param keyPrefix - Prefix for all cache keys (e.g., "embeddings:")
   * @param defaultTTL - Default TTL in seconds (default: 24 hours)
   */
  constructor(keyPrefix: string = 'cache:', defaultTTL: number = 86400) {
    this.redis = RedisClient.getInstance();
    this.keyPrefix = keyPrefix;
    this.defaultTTL = defaultTTL;

    console.log(`[RedisCache] Initialized with prefix: ${keyPrefix}, TTL: ${defaultTTL}s`);
  }

  /**
   * Get value from cache
   * @returns Parsed value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        this.misses++;
        return null;
      }

      this.hits++;

      // Try to parse as JSON, fallback to raw value
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      console.error(`[RedisCache] Failed to get key: ${key}`, error);
      this.misses++;
      return null;
    }
  }

  /**
   * Set value in cache
   * @param ttl - Time to live in seconds (optional, uses defaultTTL if not provided)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const serialized = JSON.stringify(value);
      const ttlSeconds = ttl ?? this.defaultTTL;

      if (ttlSeconds > 0) {
        await this.redis.setex(fullKey, ttlSeconds, serialized);
      } else {
        await this.redis.set(fullKey, serialized);
      }
    } catch (error) {
      console.error(`[RedisCache] Failed to set key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await this.redis.del(fullKey);
    } catch (error) {
      console.error(`[RedisCache] Failed to delete key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error(`[RedisCache] Failed to check existence of key: ${key}`, error);
      return false;
    }
  }

  /**
   * Clear cache entries
   * @param pattern - Optional pattern to match keys (e.g., "user:*")
   *                  If not provided, clears all keys with this cache's prefix
   */
  async clear(pattern?: string): Promise<void> {
    try {
      const searchPattern = pattern
        ? `${this.keyPrefix}${pattern}`
        : `${this.keyPrefix}*`;

      // Use SCAN for safer iteration (doesn't block Redis)
      const keys: string[] = [];
      const stream = this.redis.scanStream({
        match: searchPattern,
        count: 100,
      });

      stream.on('data', (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => resolve());
        stream.on('error', (error) => reject(error));
      });

      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[RedisCache] Cleared ${keys.length} keys matching: ${searchPattern}`);
      } else {
        console.log(`[RedisCache] No keys found matching: ${searchPattern}`);
      }
    } catch (error) {
      console.error(`[RedisCache] Failed to clear cache:`, error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      // Count keys with this prefix
      let size = 0;
      const stream = this.redis.scanStream({
        match: `${this.keyPrefix}*`,
        count: 100,
      });

      stream.on('data', (keys: string[]) => {
        size += keys.length;
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => resolve());
        stream.on('error', (error) => reject(error));
      });

      // Get memory usage
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      // Calculate hit rate
      const totalRequests = this.hits + this.misses;
      const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

      return {
        size,
        memoryUsage,
        hits: this.hits,
        misses: this.misses,
        hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
      };
    } catch (error) {
      console.error(`[RedisCache] Failed to get stats:`, error);
      return {
        size: 0,
        memoryUsage: 'unknown',
        hits: this.hits,
        misses: this.misses,
        hitRate: 0,
      };
    }
  }

  /**
   * Reset statistics counters
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    console.log(`[RedisCache] Statistics reset`);
  }

  /**
   * Get full Redis key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get TTL (Time To Live) for a key in seconds
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async getTTL(key: string): Promise<number> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      console.error(`[RedisCache] Failed to get TTL for key: ${key}`, error);
      return -2;
    }
  }

  /**
   * Set expiration time for a key
   * @param ttl - Time to live in seconds
   */
  async expire(key: string, ttl: number): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await this.redis.expire(fullKey, ttl);
    } catch (error) {
      console.error(`[RedisCache] Failed to set expiration for key: ${key}`, error);
      throw error;
    }
  }
}

/**
 * Create a new Redis cache instance
 */
export function createCache(keyPrefix: string, defaultTTL?: number): RedisCache {
  return new RedisCache(keyPrefix, defaultTTL);
}
