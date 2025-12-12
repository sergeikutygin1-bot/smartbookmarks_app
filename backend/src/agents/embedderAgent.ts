import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * Embedder Agent - Generates vector embeddings for semantic search
 *
 * Features:
 * - Uses OpenAI text-embedding-3-small (1536 dimensions)
 * - Batch processing support for efficiency
 * - Error handling with graceful degradation
 * - Caching to avoid redundant API calls
 */

const EMBEDDING_CACHE = new Map<string, number[]>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_TIMESTAMPS = new Map<string, number>();

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

  constructor() {
    // Initialize OpenAI embeddings with text-embedding-3-small model
    // This model is cheaper ($0.02/1M tokens) and faster than ada-002
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536, // Standard dimension for compatibility
      maxRetries: 3,
      timeout: 30000, // 30 second timeout
    });

    console.log("[EmbedderAgent] Initialized with text-embedding-3-small");
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

    // Check cache
    if (useCache) {
      const cached = this.getCached(text);
      if (cached) {
        console.log("[EmbedderAgent] Using cached embedding");
        return cached;
      }
    }

    try {
      console.log(
        `[EmbedderAgent] Generating embedding for ${text.substring(0, 100)}...`
      );

      const embedding = await this.embeddings.embedQuery(text);

      // Cache the result
      if (useCache) {
        this.cacheEmbedding(text, embedding);
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
      // Check cache for each text
      const results: number[][] = [];
      const uncachedTexts: string[] = [];
      const uncachedIndices: number[] = [];

      if (useCache) {
        validTexts.forEach((text, index) => {
          const cached = this.getCached(text);
          if (cached) {
            results[index] = cached;
          } else {
            uncachedTexts.push(text);
            uncachedIndices.push(index);
          }
        });

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
        embeddings.forEach((embedding, i) => {
          const originalIndex = uncachedIndices[i];
          results[originalIndex] = embedding;
          this.cacheEmbedding(uncachedTexts[i], embedding);
        });
      } else {
        textsToEmbed.forEach((text, i) => {
          this.cacheEmbedding(text, embeddings[i]);
        });
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
   * Get cached embedding if available and not expired
   */
  private getCached(text: string): number[] | null {
    const cacheKey = this.getCacheKey(text);
    const cached = EMBEDDING_CACHE.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const timestamp = CACHE_TIMESTAMPS.get(cacheKey);
    if (timestamp && Date.now() - timestamp > CACHE_TTL_MS) {
      EMBEDDING_CACHE.delete(cacheKey);
      CACHE_TIMESTAMPS.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * Cache an embedding
   */
  private cacheEmbedding(text: string, embedding: number[]): void {
    const cacheKey = this.getCacheKey(text);
    EMBEDDING_CACHE.set(cacheKey, embedding);
    CACHE_TIMESTAMPS.set(cacheKey, Date.now());
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
   * Clear the embedding cache
   */
  clearCache(): void {
    EMBEDDING_CACHE.clear();
    CACHE_TIMESTAMPS.clear();
    console.log("[EmbedderAgent] Cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestEntry: number | null } {
    const timestamps = Array.from(CACHE_TIMESTAMPS.values());
    return {
      size: EMBEDDING_CACHE.size,
      oldestEntry:
        timestamps.length > 0 ? Math.min(...timestamps) : null,
    };
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
