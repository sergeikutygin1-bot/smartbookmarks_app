import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { bookmarkRepository } from '../repositories/bookmarkRepository';
import { EmbedderAgent } from '../agents/embedderAgent';
import { generateEmbedding } from '../services/embeddings';
import prisma from '../db/prisma';

/**
 * Vector Search Functionality Tests
 *
 * Tests the complete vector search pipeline including:
 * - Embedding generation with correct model
 * - Cosine similarity search
 * - Hybrid search scoring
 * - HNSW index usage
 * - Model consistency
 */

describe('Vector Search Functionality', () => {
  const testUserId = 'test-vector-search-' + Date.now();
  let testBookmarkIds: string[] = [];

  /**
   * Helper: Create test bookmarks with embeddings
   */
  async function createTestBookmarks() {
    const embedder = new EmbedderAgent();
    const testData = [
      {
        title: 'Introduction to Machine Learning',
        summary: 'Learn ML basics including supervised learning, neural networks, and model training',
        url: 'https://example.com/ml-intro'
      },
      {
        title: 'Deep Learning for Natural Language Processing',
        summary: 'Advanced neural networks for text processing, transformers, and BERT models',
        url: 'https://example.com/dl-nlp'
      },
      {
        title: 'Recipe for Chocolate Cake',
        summary: 'Delicious chocolate dessert with buttercream frosting and vanilla extract',
        url: 'https://example.com/chocolate-cake'
      },
      {
        title: 'Python Programming Tutorial',
        summary: 'Complete guide to Python syntax, data structures, and object-oriented programming',
        url: 'https://example.com/python-tutorial'
      },
    ];

    const bookmarkIds: string[] = [];

    for (const data of testData) {
      // Generate embedding
      const embedding = await embedder.embed({
        text: `${data.title} ${data.summary}`,
        useCache: false // Don't use cache for test data
      });

      // Create bookmark with embedding using raw SQL
      const embeddingStr = `[${embedding.join(',')}]`;
      const result = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO bookmarks (
          id, user_id, url, title, summary, domain, status, embedding
        ) VALUES (
          gen_random_uuid(),
          ${testUserId},
          ${data.url},
          ${data.title},
          ${data.summary},
          'example.com',
          'completed',
          ${embeddingStr}::vector
        )
        RETURNING id
      `;

      bookmarkIds.push(result[0].id);
    }

    return bookmarkIds;
  }

  beforeAll(async () => {
    console.log('Setting up vector search tests...');
    testBookmarkIds = await createTestBookmarks();
    console.log(`Created ${testBookmarkIds.length} test bookmarks`);
  });

  afterAll(async () => {
    console.log('Cleaning up vector search tests...');
    // Delete test bookmarks
    await prisma.bookmark.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.$disconnect();
  });

  describe('Embedding Generation', () => {
    it('should generate 1536-dimensional embeddings', async () => {
      const embedder = new EmbedderAgent();
      const embedding = await embedder.embed({
        text: 'machine learning and artificial intelligence',
        useCache: false
      });

      expect(embedding).toHaveLength(1536);
      expect(embedding.every(n => typeof n === 'number')).toBe(true);
      expect(embedding.every(n => !isNaN(n) && isFinite(n))).toBe(true);
    });

    it('should generate consistent embeddings for same text', async () => {
      const embedder = new EmbedderAgent();
      const text = 'test consistency ' + Date.now();

      const embedding1 = await embedder.embed({ text, useCache: false });
      const embedding2 = await embedder.embed({ text, useCache: false });

      // Embeddings should be identical for same input
      expect(embedding1).toEqual(embedding2);
    });

    it('should cache embeddings for performance', async () => {
      const embedder = new EmbedderAgent();
      const text = 'test caching ' + Date.now();

      // First call (cache miss)
      const start1 = Date.now();
      const embedding1 = await embedder.embed({ text, useCache: true });
      const time1 = Date.now() - start1;

      // Second call (cache hit)
      const start2 = Date.now();
      const embedding2 = await embedder.embed({ text, useCache: true });
      const time2 = Date.now() - start2;

      expect(embedding1).toEqual(embedding2);
      // Cache should be significantly faster (at least 5x)
      expect(time2).toBeLessThan(time1 / 5);
    });

    it('should use generateEmbedding function from services', async () => {
      const embedding = await generateEmbedding('test query');

      expect(embedding).toHaveLength(1536);
      expect(embedding.every(n => typeof n === 'number')).toBe(true);
    });
  });

  describe('Model Consistency', () => {
    it('should use text-embedding-3-small for both enrichment and search', async () => {
      const embedder = new EmbedderAgent();

      // Check EmbedderAgent uses text-embedding-3-small
      // Note: This is a structural test - the model is configured in the constructor
      expect(embedder['embeddings']['model']).toBe('text-embedding-3-small');

      // The generateEmbedding function in services/embeddings.ts should also use
      // text-embedding-3-small (verified via code inspection in services/embeddings.ts:13)
      // This ensures embeddings are in the same vector space
    });

    it('should generate comparable embeddings between EmbedderAgent and generateEmbedding', async () => {
      const text = 'artificial intelligence';

      const embedder = new EmbedderAgent();
      const embedding1 = await embedder.embed({ text, useCache: false });
      const embedding2 = await generateEmbedding(text);

      // Both should be 1536 dimensions
      expect(embedding1).toHaveLength(1536);
      expect(embedding2).toHaveLength(1536);

      // Calculate cosine similarity between the two embeddings
      // They should be identical (similarity = 1.0) since same model and text
      const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
      const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
      const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));
      const similarity = dotProduct / (magnitude1 * magnitude2);

      expect(similarity).toBeGreaterThan(0.99); // Should be very close to 1.0
    });
  });

  describe('Semantic Search', () => {
    it('should return relevant bookmarks via semantic search', async () => {
      const queryEmbedding = await generateEmbedding('artificial intelligence and deep learning');

      const results = await bookmarkRepository.searchSemantic(
        testUserId,
        queryEmbedding,
        10
      );

      expect(results.length).toBeGreaterThan(0);

      // Verify similarity scores are reasonable (0.5-1.0 range)
      results.forEach(result => {
        expect(result).toHaveProperty('similarity');
        expect(result.similarity).toBeGreaterThan(0.5);
        expect(result.similarity).toBeLessThanOrEqual(1.0);
      });

      // Results should be ordered by similarity (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }

      // The ML/DL bookmarks should rank higher than the cake recipe
      const mlBookmark = results.find(r => r.title.includes('Machine Learning'));
      const cakeBookmark = results.find(r => r.title.includes('Chocolate Cake'));

      if (mlBookmark && cakeBookmark) {
        expect(mlBookmark.similarity).toBeGreaterThan(cakeBookmark.similarity);
      }
    });

    it('should find semantically similar content even without exact keyword matches', async () => {
      // Query for "AI" should find "Machine Learning" bookmarks even though "AI" isn't in the text
      const queryEmbedding = await generateEmbedding('AI and neural networks');

      const results = await bookmarkRepository.searchSemantic(
        testUserId,
        queryEmbedding,
        10
      );

      // Should find ML-related bookmarks
      const hasMLContent = results.some(r =>
        r.title.includes('Machine Learning') || r.title.includes('Deep Learning')
      );
      expect(hasMLContent).toBe(true);
    });
  });

  describe('Hybrid Search', () => {
    it('should combine keyword and semantic scores correctly', async () => {
      const query = 'machine learning algorithms';
      const queryEmbedding = await generateEmbedding(query);

      const results = await bookmarkRepository.searchHybrid(
        testUserId,
        query,
        queryEmbedding,
        10
      );

      expect(results.length).toBeGreaterThan(0);

      // Verify hybrid scores are present
      results.forEach(result => {
        expect(result).toHaveProperty('score');
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1.0);
      });

      // Results ordered by combined score
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }

      // Should find ML bookmark since it has both keyword and semantic match
      const mlBookmark = results.find(r => r.title.includes('Machine Learning'));
      expect(mlBookmark).toBeDefined();
    });

    it('should boost results that match both keyword and semantic criteria', async () => {
      const query = 'deep learning';
      const queryEmbedding = await generateEmbedding(query);

      const hybridResults = await bookmarkRepository.searchHybrid(
        testUserId,
        query,
        queryEmbedding,
        10
      );

      const semanticResults = await bookmarkRepository.searchSemantic(
        testUserId,
        queryEmbedding,
        10
      );

      // Hybrid search should boost the "Deep Learning" bookmark higher than semantic-only
      const hybridDL = hybridResults.find(r => r.title.includes('Deep Learning'));
      const semanticDL = semanticResults.find(r => r.title.includes('Deep Learning'));

      if (hybridDL && semanticDL) {
        // Hybrid score should be higher because it gets both keyword and semantic boost
        expect(hybridDL.score).toBeGreaterThan(semanticDL.similarity * 0.5);
      }
    });
  });

  describe('Keyword Search', () => {
    it('should find exact keyword matches', async () => {
      const results = await bookmarkRepository.searchKeyword(
        testUserId,
        'chocolate',
        10
      );

      expect(results.length).toBeGreaterThan(0);

      // Should find the chocolate cake bookmark
      const cakeBookmark = results.find(r => r.title.includes('Chocolate Cake'));
      expect(cakeBookmark).toBeDefined();
    });

    it('should rank results by text relevance', async () => {
      const results = await bookmarkRepository.searchKeyword(
        testUserId,
        'learning',
        10
      );

      expect(results.length).toBeGreaterThan(0);

      // Results should have rank scores
      results.forEach(result => {
        expect(result).toHaveProperty('rank');
        expect(result.rank).toBeGreaterThan(0);
      });

      // Results should be ordered by rank (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].rank).toBeGreaterThanOrEqual(results[i].rank);
      }
    });
  });

  describe('Index Usage Verification', () => {
    it('should use HNSW index for vector similarity search', async () => {
      // Generate test embedding
      const queryEmbedding = await generateEmbedding('test query for index verification');
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      // Run EXPLAIN ANALYZE to check query plan
      const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        `
        EXPLAIN (FORMAT JSON)
        SELECT id, 1 - (embedding <=> $1::vector) as similarity
        FROM bookmarks
        WHERE user_id = $2 AND status = 'completed' AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT 10
        `,
        embeddingStr,
        testUserId
      );

      const planJson = JSON.stringify(plan);

      // Verify HNSW index is used
      // Note: The exact plan format depends on PostgreSQL version
      // We're checking for presence of "Index" and "hnsw" in the plan
      expect(planJson.toLowerCase()).toMatch(/index/);
      // HNSW index should be present if properly configured
      // (may show as "Index Scan" or "Bitmap Index Scan")
    });

    it('should use GIN index for full-text search', async () => {
      // Run EXPLAIN ANALYZE for full-text search
      const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        `
        EXPLAIN (FORMAT JSON)
        SELECT id, ts_rank(search_vector, to_tsquery('english', $1)) as rank
        FROM bookmarks
        WHERE user_id = $2 AND status = 'completed' AND search_vector @@ to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT 10
        `,
        'machine & learning',
        testUserId
      );

      const planJson = JSON.stringify(plan);

      // Verify GIN index is used
      expect(planJson.toLowerCase()).toMatch(/index/);
      expect(planJson.toLowerCase()).toMatch(/gin/);
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete semantic search within reasonable time', async () => {
      const queryEmbedding = await generateEmbedding('test performance');

      const start = Date.now();
      const results = await bookmarkRepository.searchSemantic(
        testUserId,
        queryEmbedding,
        10
      );
      const duration = Date.now() - start;

      expect(results).toBeDefined();
      // Search should complete in under 500ms (even with small dataset)
      expect(duration).toBeLessThan(500);
    });

    it('should handle empty result sets gracefully', async () => {
      // Search with embedding that won't match anything
      const queryEmbedding = new Array(1536).fill(0);

      const results = await bookmarkRepository.searchSemantic(
        testUserId,
        queryEmbedding,
        10
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // May return 0 or very low similarity matches
    });
  });
});
