import { OpenAIEmbeddings } from "@langchain/openai";
import { createCache } from "../services/cache";

/**
 * Embedder Agent - Generates vector embeddings for semantic search
 *
 * Features:
 * - Uses OpenAI text-embedding-3-small (1536 dimensions)
 * - Batch processing support for efficiency
 * - Error handling with graceful degradation
 * - Redis-based caching to avoid redundant API calls (persistent across restarts)
 */

export interface EmbeddingOptions {
  text: string;
  useCache?: boolean;
}

export interface BatchEmbeddingOptions {
  texts: string[];
  useCache?: boolean;
}

export class EmbedderAgent {
  private embeddings: OpenAIEmbeddings;
  private cache = createCache('embeddings:', 86400); // 24hr TTL in Redis

  constructor() {
    // Initialize OpenAI embeddings with text-embedding-3-small model
    // This model is cheaper ($0.02/1M tokens) and faster than ada-002
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536, // Standard dimension for compatibility
      maxRetries: 3,
      timeout: 30000, // 30 second timeout
    });

    console.log("[EmbedderAgent] Initialized with text-embedding-3-small and Redis cache");
  }

  /**
   * Generate embedding for a single text
   */
  async embed(options: EmbeddingOptions): Promise<number[]> {
    const { text, useCache = true } = options;

    // Validate input
    if (!text || text.trim().length === 0) {
      throw new Error("Cannot generate embedding for empty text");
    }

    // Check Redis cache
    if (useCache) {
      const cached = await this.getCached(text);
      if (cached) {
        console.log("[EmbedderAgent] Cache hit for embedding");
        return cached;
      }
    }

    try {
      console.log(
        `[EmbedderAgent] Generating embedding for ${text.substring(0, 100)}...`
      );

      const embedding = await this.embeddings.embedQuery(text);

      // Cache the result in Redis
      if (useCache) {
        await this.cacheEmbedding(text, embedding);
      }

      console.log(
        `[EmbedderAgent] Generated embedding with ${embedding.length} dimensions`
      );

      return embedding;
    } catch (error) {
      console.error("[EmbedderAgent] Failed to generate embedding:", error);
      throw new Error(
        `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * More efficient for multiple items
   */
  async embedBatch(options: BatchEmbeddingOptions): Promise<number[][]> {
    const { texts, useCache = true } = options;

    if (texts.length === 0) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter((t) => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error("No valid texts to embed");
    }

    try {
      // Check Redis cache for each text
      const results: number[][] = [];
      const uncachedTexts: string[] = [];
      const uncachedIndices: number[] = [];

      if (useCache) {
        for (let index = 0; index < validTexts.length; index++) {
          const text = validTexts[index];
          const cached = await this.getCached(text);
          if (cached) {
            results[index] = cached;
          } else {
            uncachedTexts.push(text);
            uncachedIndices.push(index);
          }
        }

        if (uncachedTexts.length === 0) {
          console.log(
            `[EmbedderAgent] All ${validTexts.length} embeddings found in cache`
          );
          return results;
        }
      }

      console.log(
        `[EmbedderAgent] Generating ${useCache ? uncachedTexts.length : validTexts.length}/${validTexts.length} embeddings (batch)`
      );

      const textsToEmbed = useCache ? uncachedTexts : validTexts;
      const embeddings = await this.embeddings.embedDocuments(textsToEmbed);

      // Cache and assign results
      if (useCache) {
        for (let i = 0; i < embeddings.length; i++) {
          const originalIndex = uncachedIndices[i];
          results[originalIndex] = embeddings[i];
          await this.cacheEmbedding(uncachedTexts[i], embeddings[i]);
        }
      } else {
        for (let i = 0; i < textsToEmbed.length; i++) {
          await this.cacheEmbedding(textsToEmbed[i], embeddings[i]);
        }
        return embeddings;
      }

      console.log(`[EmbedderAgent] Batch embedding complete`);
      return results;
    } catch (error) {
      console.error("[EmbedderAgent] Batch embedding failed:", error);
      throw new Error(
        `Batch embedding generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get cached embedding from Redis if available
   */
  private async getCached(text: string): Promise<number[] | null> {
    const cacheKey = this.getCacheKey(text);
    return await this.cache.get<number[]>(cacheKey);
  }

  /**
   * Cache an embedding in Redis
   */
  private async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    const cacheKey = this.getCacheKey(text);
    await this.cache.set(cacheKey, embedding); // Uses default 24hr TTL
  }

  /**
   * Generate cache key from text (simple hash)
   */
  private getCacheKey(text: string): string {
    // Simple hash function for cache key
    // In production, consider using a proper hash function
    return Buffer.from(text.substring(0, 200)).toString("base64");
  }

  /**
   * Clear the embedding cache in Redis
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    console.log("[EmbedderAgent] Redis cache cleared");
  }

  /**
   * Get cache statistics from Redis
   */
  async getCacheStats() {
    return await this.cache.getStats();
  }
}

/**
 * Singleton instance of EmbedderAgent
 */
let embedderAgentInstance: EmbedderAgent | null = null;

export function getEmbedderAgent(): EmbedderAgent {
  if (!embedderAgentInstance) {
    embedderAgentInstance = new EmbedderAgent();
  }
  return embedderAgentInstance;
}

/**
 * Convenience function to embed a single text
 */
export async function embedText(text: string, useCache = true): Promise<number[]> {
  const agent = getEmbedderAgent();
  return agent.embed({ text, useCache });
}

/**
 * Convenience function to embed multiple texts
 */
export async function embedTexts(texts: string[], useCache = true): Promise<number[][]> {
  const agent = getEmbedderAgent();
  return agent.embedBatch({ texts, useCache });
}
