import { Router, Request, Response } from 'express';
import { bookmarkRepository } from '../repositories/bookmarkRepository';
import { authMiddleware } from '../middleware/auth';
import { generateEmbedding } from '../services/embeddings';
import { createCache } from '../services/cache';

const router = Router();

// Redis caches for search optimization
const searchEmbeddingCache = createCache('search-embeddings:', 600); // 10min TTL
const searchResultsCache = createCache('search-results:', 600); // 10min TTL

// Apply auth middleware
router.use(authMiddleware);

/**
 * GET /api/search?q=query&mode=keyword|semantic|hybrid
 * Perform search across user's bookmarks
 *
 * Query params:
 * - q: string (required) - Search query
 * - mode: 'keyword' | 'semantic' | 'hybrid' (optional, default: 'hybrid')
 * - limit: number (optional, default: 20)
 *
 * Response:
 * - data: Array of bookmark results with scores
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { q, mode = 'hybrid', limit } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'Query parameter required',
        message: 'Please provide a search query using the "q" parameter'
      });
    }

    const searchLimit = limit ? parseInt(limit as string) : 20;

    // Check results cache first
    const resultsCacheKey = `${userId}:${q}:${mode}:${searchLimit}`;
    const cachedResults = await searchResultsCache.get(resultsCacheKey);

    if (cachedResults) {
      console.log(`[Search] Cache hit for results: ${q.substring(0, 50)}`);
      return res.json(cachedResults);
    }

    let results;

    switch (mode) {
      case 'keyword':
        results = await bookmarkRepository.searchKeyword(userId, q, searchLimit);
        break;

      case 'semantic': {
        // Check embedding cache
        const embeddingCacheKey = q.toLowerCase().trim();
        let embedding = await searchEmbeddingCache.get<number[]>(embeddingCacheKey);

        if (!embedding) {
          console.log(`[Search] Generating embedding for: ${q.substring(0, 50)}`);
          embedding = await generateEmbedding(q);
          await searchEmbeddingCache.set(embeddingCacheKey, embedding, 600);
        } else {
          console.log(`[Search] Cache hit for embedding: ${q.substring(0, 50)}`);
        }

        results = await bookmarkRepository.searchSemantic(userId, embedding, searchLimit);
        break;
      }

      case 'hybrid':
      default: {
        // Check embedding cache
        const embeddingCacheKey = q.toLowerCase().trim();
        let embedding = await searchEmbeddingCache.get<number[]>(embeddingCacheKey);

        if (!embedding) {
          console.log(`[Search] Generating embedding for: ${q.substring(0, 50)}`);
          embedding = await generateEmbedding(q);
          await searchEmbeddingCache.set(embeddingCacheKey, embedding, 600);
        } else {
          console.log(`[Search] Cache hit for embedding: ${q.substring(0, 50)}`);
        }

        results = await bookmarkRepository.searchHybrid(userId, q, embedding, searchLimit);
        break;
      }
    }

    const response = {
      data: results,
      metadata: {
        query: q,
        mode,
        resultsCount: results.length,
      }
    };

    // Cache the results
    await searchResultsCache.set(resultsCacheKey, response, 600);

    res.json(response);
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Invalidate search caches for a specific user
 * Called when user's bookmarks are created/updated/deleted
 */
export async function invalidateSearchCaches(userId: string): Promise<void> {
  await searchResultsCache.clear(`${userId}:*`);
  console.log(`[Search] Invalidated search caches for user: ${userId}`);
}

export default router;
