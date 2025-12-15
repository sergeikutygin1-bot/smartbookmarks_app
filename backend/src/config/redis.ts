import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis client singleton for the application
 * Used for both BullMQ job queue and caching
 */
class RedisClient {
  private static instance: Redis | null = null;
  private static isShuttingDown = false;

  /**
   * Get the Redis client instance (creates if doesn't exist)
   */
  static getInstance(): Redis {
    if (!RedisClient.instance && !RedisClient.isShuttingDown) {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      RedisClient.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError(err) {
          const targetErrors = ['READONLY', 'ECONNREFUSED'];
          if (targetErrors.some(targetError => err.message.includes(targetError))) {
            // Reconnect on specific errors
            return true;
          }
          return false;
        },
        lazyConnect: false,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      // Event handlers for monitoring
      RedisClient.instance.on('connect', () => {
        console.log('✓ Redis client connected');
      });

      RedisClient.instance.on('ready', () => {
        console.log('✓ Redis client ready');
      });

      RedisClient.instance.on('error', (err) => {
        console.error('✗ Redis client error:', err);
      });

      RedisClient.instance.on('close', () => {
        console.log('⊗ Redis client connection closed');
      });

      RedisClient.instance.on('reconnecting', () => {
        console.log('⟳ Redis client reconnecting...');
      });
    }

    if (!RedisClient.instance) {
      throw new Error('Redis client is shutting down or failed to initialize');
    }

    return RedisClient.instance;
  }

  /**
   * Gracefully close the Redis connection
   */
  static async close(): Promise<void> {
    if (RedisClient.instance) {
      RedisClient.isShuttingDown = true;
      await RedisClient.instance.quit();
      RedisClient.instance = null;
      console.log('✓ Redis client closed gracefully');
    }
  }

  /**
   * Check if Redis is connected and ready
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const client = RedisClient.getInstance();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Get Redis connection info for debugging
   */
  static getConnectionInfo(): {
    url: string;
    status: string;
    ready: boolean;
  } {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const instance = RedisClient.instance;

    return {
      url,
      status: instance?.status || 'not_initialized',
      ready: instance?.status === 'ready',
    };
  }
}

// Export the getInstance method as default
export default RedisClient;

// Export connection factory for BullMQ (it expects a connection object)
export const createRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null, // BullMQ recommendation
    enableReadyCheck: false,
    enableOfflineQueue: true,
  });
};
