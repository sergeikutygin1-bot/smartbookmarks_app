/**
 * Comprehensive Vector Search Tests
 *
 * Tests the complete vector search pipeline including:
 * - Embedding generation with correct model
 * - Cosine similarity search
 * - Hybrid search scoring
 * - HNSW index usage
 * - Model consistency
 */

import { bookmarkRepository } from '../repositories/bookmarkRepository';
import { EmbedderAgent } from '../agents/embedderAgent';
import { generateEmbedding } from '../services/embeddings';
import prisma from '../db/prisma';

const testUserId = 'test-vector-search-' + Date.now();
let testBookmarkIds: string[] = [];

/**
 * Helper: Create test user
 */
async function createTestUser() {
  await prisma.user.create({
    data: {
      id: testUserId,
      email: `test-${Date.now()}@example.com`,
      emailVerified: true,
    }
  });
}

/**
 * Helper: Create test bookmarks with embeddings
 */
async function createTestBookmarks() {
  console.log('Creating test bookmarks with embeddings...');

  // Create test user first
  await createTestUser();

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
        id, user_id, url, title, summary, domain, key_points, status, embedding, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        ${testUserId},
        ${data.url},
        ${data.title},
        ${data.summary},
        'example.com',
        ARRAY[]::text[],
        'completed',
        ${embeddingStr}::vector,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    bookmarkIds.push(result[0].id);
  }

  console.log(`✓ Created ${bookmarkIds.length} test bookmarks\n`);
  return bookmarkIds;
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log('Cleaning up test data...');
  // Delete bookmarks first (foreign key constraint)
  await prisma.bookmark.deleteMany({
    where: { userId: testUserId }
  });
  // Delete test user
  await prisma.user.delete({
    where: { id: testUserId }
  }).catch(() => {}); // Ignore if user doesn't exist
  await prisma.$disconnect();
  console.log('✓ Cleanup complete\n');
}

/**
 * Test: Embedding Generation
 */
async function testEmbeddingGeneration() {
  console.log('🧪 Test: Embedding Generation');
  const embedder = new EmbedderAgent();

  // Test 1: 1536 dimensions
  const embedding = await embedder.embed({
    text: 'machine learning and artificial intelligence',
    useCache: false
  });

  const is1536 = embedding.length === 1536;
  const allNumbers = embedding.every(n => typeof n === 'number' && !isNaN(n) && isFinite(n));

  console.log(`   1. Embedding dimensions: ${embedding.length} ${is1536 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   2. All values are valid numbers: ${allNumbers ? '✓ PASS' : '✗ FAIL'}`);

  // Test 2: Consistency
  const text = 'test consistency ' + Date.now();
  const embedding1 = await embedder.embed({ text, useCache: false });
  const embedding2 = await embedder.embed({ text, useCache: false });
  const isConsistent = JSON.stringify(embedding1) === JSON.stringify(embedding2);

  console.log(`   3. Consistent embeddings for same text: ${isConsistent ? '✓ PASS' : '✗ FAIL'}`);

  // Test 3: Caching performance
  const cacheText = 'test caching ' + Date.now();
  const start1 = Date.now();
  await embedder.embed({ text: cacheText, useCache: true });
  const time1 = Date.now() - start1;

  const start2 = Date.now();
  await embedder.embed({ text: cacheText, useCache: true });
  const time2 = Date.now() - start2;

  const isFaster = time2 < time1 / 5;
  console.log(`   4. Cache performance (${time1}ms → ${time2}ms): ${isFaster ? '✓ PASS' : '✗ FAIL'}`);

  // Test 4: Services function
  const serviceEmbedding = await generateEmbedding('test query');
  const isServiceValid = serviceEmbedding.length === 1536;
  console.log(`   5. generateEmbedding function works: ${isServiceValid ? '✓ PASS' : '✗ FAIL'}`);

  console.log('');
}

/**
 * Test: Model Consistency
 */
async function testModelConsistency() {
  console.log('🧪 Test: Model Consistency');

  const embedder = new EmbedderAgent();
  const model = embedder['embeddings']['model'];
  const isCorrectModel = model === 'text-embedding-3-small';

  console.log(`   1. EmbedderAgent uses text-embedding-3-small: ${isCorrectModel ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`      (current model: ${model})`);

  // Test embeddings from both sources are comparable
  const text = 'artificial intelligence';
  const embedding1 = await embedder.embed({ text, useCache: false });
  const embedding2 = await generateEmbedding(text);

  // Calculate cosine similarity
  const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
  const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));
  const similarity = dotProduct / (magnitude1 * magnitude2);

  const isIdentical = similarity > 0.99;
  console.log(`   2. Embeddings from both sources are identical: ${isIdentical ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`      (similarity: ${similarity.toFixed(4)})`);

  console.log('');
}

/**
 * Test: Semantic Search
 */
async function testSemanticSearch() {
  console.log('🧪 Test: Semantic Search');

  const queryEmbedding = await generateEmbedding('artificial intelligence and deep learning');
  const results = await bookmarkRepository.searchSemantic(testUserId, queryEmbedding, 10);

  console.log(`   1. Returns results: ${results.length > 0 ? '✓ PASS' : '✗ FAIL'} (${results.length} results)`);

  // Check similarity scores
  const hasValidScores = results.every(r => r.similarity > 0.5 && r.similarity <= 1.0);
  console.log(`   2. Similarity scores in valid range (0.5-1.0): ${hasValidScores ? '✓ PASS' : '✗ FAIL'}`);

  // Check ordering
  let isOrdered = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i - 1].similarity < results[i].similarity) {
      isOrdered = false;
      break;
    }
  }
  console.log(`   3. Results ordered by similarity: ${isOrdered ? '✓ PASS' : '✗ FAIL'}`);

  // Check relevance
  const mlBookmark = results.find(r => r.title.includes('Machine Learning'));
  const cakeBookmark = results.find(r => r.title.includes('Chocolate Cake'));
  const isRelevant = mlBookmark && cakeBookmark && mlBookmark.similarity > cakeBookmark.similarity;
  console.log(`   4. ML content ranks higher than cake recipe: ${isRelevant ? '✓ PASS' : '✗ FAIL'}`);

  // Test semantic matching without exact keywords
  const aiQuery = await generateEmbedding('AI and neural networks');
  const aiResults = await bookmarkRepository.searchSemantic(testUserId, aiQuery, 10);
  const hasMLContent = aiResults.some(r =>
    r.title.includes('Machine Learning') || r.title.includes('Deep Learning')
  );
  console.log(`   5. Finds semantically similar content (AI → ML): ${hasMLContent ? '✓ PASS' : '✗ FAIL'}`);

  console.log('');
}

/**
 * Test: Hybrid Search
 */
async function testHybridSearch() {
  console.log('🧪 Test: Hybrid Search');

  const query = 'machine learning algorithms';
  const queryEmbedding = await generateEmbedding(query);
  const results = await bookmarkRepository.searchHybrid(testUserId, query, queryEmbedding, 10);

  console.log(`   1. Returns results: ${results.length > 0 ? '✓ PASS' : '✗ FAIL'} (${results.length} results)`);

  // Check hybrid scores
  const hasValidScores = results.every(r => r.score > 0 && r.score <= 1.0);
  console.log(`   2. Hybrid scores in valid range (0-1.0): ${hasValidScores ? '✓ PASS' : '✗ FAIL'}`);

  // Check ordering
  let isOrdered = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i - 1].score < results[i].score) {
      isOrdered = false;
      break;
    }
  }
  console.log(`   3. Results ordered by combined score: ${isOrdered ? '✓ PASS' : '✗ FAIL'}`);

  // Should find ML bookmark
  const mlBookmark = results.find(r => r.title.includes('Machine Learning'));
  console.log(`   4. Finds ML bookmark: ${mlBookmark ? '✓ PASS' : '✗ FAIL'}`);

  console.log('');
}

/**
 * Test: Keyword Search
 */
async function testKeywordSearch() {
  console.log('🧪 Test: Keyword Search');

  const results = await bookmarkRepository.searchKeyword(testUserId, 'chocolate', 10);

  console.log(`   1. Returns results: ${results.length > 0 ? '✓ PASS' : '✗ FAIL'} (${results.length} results)`);

  // Should find chocolate cake
  const cakeBookmark = results.find(r => r.title.includes('Chocolate Cake'));
  console.log(`   2. Finds chocolate cake bookmark: ${cakeBookmark ? '✓ PASS' : '✗ FAIL'}`);

  // Test ranking
  const learningResults = await bookmarkRepository.searchKeyword(testUserId, 'learning', 10);
  const hasRankScores = learningResults.every(r => r.rank > 0);
  console.log(`   3. Results have rank scores: ${hasRankScores ? '✓ PASS' : '✗ FAIL'}`);

  // Check ordering
  let isOrdered = true;
  for (let i = 1; i < learningResults.length; i++) {
    if (learningResults[i - 1].rank < learningResults[i].rank) {
      isOrdered = false;
      break;
    }
  }
  console.log(`   4. Results ordered by rank: ${isOrdered ? '✓ PASS' : '✗ FAIL'}`);

  console.log('');
}

/**
 * Test: Index Usage
 */
async function testIndexUsage() {
  console.log('🧪 Test: Index Usage');

  try {
    // Test HNSW index for vector search
    const queryEmbedding = await generateEmbedding('test query for index verification');
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const vectorPlan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
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

    const vectorPlanJson = JSON.stringify(vectorPlan).toLowerCase();
    const hasVectorIndex = vectorPlanJson.includes('index');
    console.log(`   1. Vector search uses index: ${hasVectorIndex ? '✓ PASS' : '✗ FAIL'}`);

    // Test GIN index for full-text search
    const textPlan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
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

    const textPlanJson = JSON.stringify(textPlan).toLowerCase();
    const hasTextIndex = textPlanJson.includes('index') && textPlanJson.includes('gin');
    console.log(`   2. Full-text search uses GIN index: ${hasTextIndex ? '✓ PASS' : '✗ FAIL'}`);

  } catch (error) {
    console.log(`   ✗ Index verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('');
}

/**
 * Test: Performance
 */
async function testPerformance() {
  console.log('🧪 Test: Performance');

  const queryEmbedding = await generateEmbedding('test performance');

  const start = Date.now();
  const results = await bookmarkRepository.searchSemantic(testUserId, queryEmbedding, 10);
  const duration = Date.now() - start;

  const isFast = duration < 500;
  console.log(`   1. Search completes in < 500ms: ${isFast ? '✓ PASS' : '✗ FAIL'} (${duration}ms)`);

  // Test empty result handling
  const zeroEmbedding = new Array(1536).fill(0);
  const emptyResults = await bookmarkRepository.searchSemantic(testUserId, zeroEmbedding, 10);
  const handlesEmpty = Array.isArray(emptyResults);
  console.log(`   2. Handles empty results gracefully: ${handlesEmpty ? '✓ PASS' : '✗ FAIL'}`);

  console.log('');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('================================');
  console.log('Vector Search Test Suite');
  console.log('================================\n');

  try {
    // Setup
    testBookmarkIds = await createTestBookmarks();

    // Run all tests
    await testEmbeddingGeneration();
    await testModelConsistency();
    await testSemanticSearch();
    await testHybridSearch();
    await testKeywordSearch();
    await testIndexUsage();
    await testPerformance();

    console.log('================================');
    console.log('✓ All tests completed');
    console.log('================================');

  } catch (error) {
    console.error('\n✗ Test suite failed:', error);
    throw error;
  } finally {
    // Cleanup
    await cleanup();
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
