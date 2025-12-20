/**
 * Database Performance Tests
 *
 * Tests that verify:
 * - Composite indexes are being used for bookmark list queries
 * - Query execution times are acceptable
 * - Partial GIN index is being used for full-text search
 * - Vector search uses HNSW index
 */

import prisma from '../db/prisma';
import { generateEmbedding } from '../services/embeddings';

const testUserId = 'test-perf-' + Date.now();

/**
 * Helper: Create test user
 */
async function createTestUser() {
  await prisma.user.create({
    data: {
      id: testUserId,
      email: `test-perf-${Date.now()}@example.com`,
      emailVerified: true,
    }
  });
}

/**
 * Helper: Create test bookmarks
 */
async function createTestBookmarks() {
  console.log('Creating test bookmarks for performance testing...');

  await createTestUser();

  // Create 50 bookmarks to have realistic data set
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      prisma.bookmark.create({
        data: {
          userId: testUserId,
          url: `https://example.com/bookmark-${i}`,
          title: `Test Bookmark ${i}`,
          summary: `This is test bookmark number ${i} about various topics like machine learning and AI`,
          domain: 'example.com',
          keyPoints: ['Point 1', 'Point 2'],
          status: i % 10 === 0 ? 'pending' : 'completed', // 10% pending, 90% completed
          contentType: i % 3 === 0 ? 'article' : i % 3 === 1 ? 'video' : 'other',
        }
      })
    );
  }

  await Promise.all(promises);
  console.log(`✓ Created 50 test bookmarks\n`);
}

/**
 * Helper: Cleanup test data
 */
async function cleanup() {
  console.log('Cleaning up test data...');
  await prisma.bookmark.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  await prisma.$disconnect();
  console.log('✓ Cleanup complete\n');
}

/**
 * Test 1: Bookmark List Query Performance
 */
async function testBookmarkListPerformance() {
  console.log('🧪 Test: Bookmark List Query Performance\n');

  // Test 1: Basic list query (ORDER BY updatedAt DESC)
  console.log('1. Testing basic bookmark list query with updatedAt sorting...');

  const plan1 = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT *
    FROM bookmarks
    WHERE user_id = '${testUserId}'
    ORDER BY updated_at DESC
    LIMIT 20
  `);

  const plan1Json = JSON.stringify(plan1, null, 2);
  const executionTime1 = extractExecutionTime(plan1Json);
  const usesIndex1 = plan1Json.toLowerCase().includes('index') &&
                     plan1Json.toLowerCase().includes('bookmarks_user_id_updated_at_idx');

  console.log(`   - Execution Time: ${executionTime1}ms`);
  console.log(`   - Uses bookmarks_user_id_updated_at_idx: ${usesIndex1 ? '✓ YES' : '✗ NO'}`);
  console.log(`   - Performance: ${executionTime1 < 20 ? '✓ EXCELLENT (<20ms)' : executionTime1 < 50 ? '✓ GOOD (<50ms)' : '⚠️ SLOW (>50ms)'}\n`);

  // Test 2: Filtered by contentType
  console.log('2. Testing filtered query (contentType + updatedAt sorting)...');

  const plan2 = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT *
    FROM bookmarks
    WHERE user_id = '${testUserId}' AND content_type = 'article'
    ORDER BY updated_at DESC
    LIMIT 20
  `);

  const plan2Json = JSON.stringify(plan2, null, 2);
  const executionTime2 = extractExecutionTime(plan2Json);
  const usesIndex2 = plan2Json.toLowerCase().includes('index') &&
                     plan2Json.toLowerCase().includes('bookmarks_user_content_updated_idx');

  console.log(`   - Execution Time: ${executionTime2}ms`);
  console.log(`   - Uses bookmarks_user_content_updated_idx: ${usesIndex2 ? '✓ YES' : '✗ NO'}`);
  console.log(`   - Performance: ${executionTime2 < 20 ? '✓ EXCELLENT (<20ms)' : executionTime2 < 50 ? '✓ GOOD (<50ms)' : '⚠️ SLOW (>50ms)'}\n`);

  // Test 3: Filtered by status
  console.log('3. Testing filtered query (status + updatedAt sorting)...');

  const plan3 = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT *
    FROM bookmarks
    WHERE user_id = '${testUserId}' AND status = 'completed'
    ORDER BY updated_at DESC
    LIMIT 20
  `);

  const plan3Json = JSON.stringify(plan3, null, 2);
  const executionTime3 = extractExecutionTime(plan3Json);
  const usesIndex3 = plan3Json.toLowerCase().includes('index') &&
                     plan3Json.toLowerCase().includes('bookmarks_user_status_updated_idx');

  console.log(`   - Execution Time: ${executionTime3}ms`);
  console.log(`   - Uses bookmarks_user_status_updated_idx: ${usesIndex3 ? '✓ YES' : '✗ NO'}`);
  console.log(`   - Performance: ${executionTime3 < 20 ? '✓ EXCELLENT (<20ms)' : executionTime3 < 50 ? '✓ GOOD (<50ms)' : '⚠️ SLOW (>50ms)'}\n`);
}

/**
 * Test 2: Full-Text Search Performance
 */
async function testFullTextSearchPerformance() {
  console.log('🧪 Test: Full-Text Search Performance\n');

  console.log('Testing full-text search with partial GIN index...');

  const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT id, title, summary,
           ts_rank(search_vector, to_tsquery('english', 'machine & learning')) as rank
    FROM bookmarks
    WHERE user_id = '${testUserId}'
      AND status = 'completed'
      AND search_vector @@ to_tsquery('english', 'machine & learning')
    ORDER BY rank DESC
    LIMIT 10
  `);

  const planJson = JSON.stringify(plan, null, 2);
  const executionTime = extractExecutionTime(planJson);
  const usesGinIndex = planJson.toLowerCase().includes('gin') && planJson.toLowerCase().includes('index');
  const usesPartialIndex = planJson.toLowerCase().includes('bookmarks_completed_search_idx');

  console.log(`   - Execution Time: ${executionTime}ms`);
  console.log(`   - Uses GIN index: ${usesGinIndex ? '✓ YES' : '✗ NO'}`);
  console.log(`   - Uses partial index (bookmarks_completed_search_idx): ${usesPartialIndex ? '✓ YES' : '⚠️ NO (using full index)'}`);
  console.log(`   - Performance: ${executionTime < 50 ? '✓ EXCELLENT (<50ms)' : executionTime < 100 ? '✓ GOOD (<100ms)' : '⚠️ SLOW (>100ms)'}\n`);
}

/**
 * Test 3: Vector Search Performance
 */
async function testVectorSearchPerformance() {
  console.log('🧪 Test: Vector Search Performance\n');

  console.log('Testing vector similarity search with HNSW index...');

  // Generate a test embedding
  const queryEmbedding = await generateEmbedding('machine learning and artificial intelligence');
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT id, title, summary,
           1 - (embedding <=> '${embeddingStr}'::vector) as similarity
    FROM bookmarks
    WHERE user_id = '${testUserId}'
      AND status = 'completed'
      AND embedding IS NOT NULL
    ORDER BY embedding <=> '${embeddingStr}'::vector
    LIMIT 10
  `);

  const planJson = JSON.stringify(plan, null, 2);
  const executionTime = extractExecutionTime(planJson);
  const usesHnswIndex = planJson.toLowerCase().includes('hnsw') ||
                        (planJson.toLowerCase().includes('index') && planJson.toLowerCase().includes('embedding'));

  console.log(`   - Execution Time: ${executionTime}ms`);
  console.log(`   - Uses HNSW/vector index: ${usesHnswIndex ? '✓ YES' : '✗ NO (sequential scan)'}`);
  console.log(`   - Performance: ${executionTime < 100 ? '✓ EXCELLENT (<100ms)' : executionTime < 500 ? '✓ GOOD (<500ms)' : '⚠️ SLOW (>500ms)'}\n`);
}

/**
 * Test 4: Actual Query Performance (Real World)
 */
async function testActualQueryPerformance() {
  console.log('🧪 Test: Actual Query Performance (Real World)\n');

  // Test 1: Repository method (with all joins)
  console.log('1. Testing bookmarkRepository.findByUserId() with joins...');
  const start1 = Date.now();
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: testUserId },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 20
  });
  const duration1 = Date.now() - start1;

  console.log(`   - Execution Time: ${duration1}ms`);
  console.log(`   - Results: ${bookmarks.length} bookmarks`);
  console.log(`   - Performance: ${duration1 < 50 ? '✓ EXCELLENT (<50ms)' : duration1 < 100 ? '✓ GOOD (<100ms)' : '⚠️ SLOW (>100ms)'}\n`);

  // Test 2: Filtered query
  console.log('2. Testing filtered query (status=completed)...');
  const start2 = Date.now();
  const completedBookmarks = await prisma.bookmark.findMany({
    where: {
      userId: testUserId,
      status: 'completed'
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 20
  });
  const duration2 = Date.now() - start2;

  console.log(`   - Execution Time: ${duration2}ms`);
  console.log(`   - Results: ${completedBookmarks.length} bookmarks`);
  console.log(`   - Performance: ${duration2 < 50 ? '✓ EXCELLENT (<50ms)' : duration2 < 100 ? '✓ GOOD (<100ms)' : '⚠️ SLOW (>100ms)'}\n`);
}

/**
 * Test 5: Index Usage Summary
 */
async function testIndexUsageSummary() {
  console.log('🧪 Test: Index Usage Summary\n');

  console.log('Checking all relevant indexes...\n');

  const indexes = await prisma.$queryRaw<Array<{
    schemaname: string;
    relname: string;
    indexrelname: string;
    idx_scan: bigint;
  }>>`
    SELECT schemaname, relname, indexrelname, idx_scan
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public' AND relname = 'bookmarks'
    ORDER BY idx_scan DESC
  `;

  console.log('Index Usage Statistics:');
  console.log('------------------------');

  const targetIndexes = [
    'bookmarks_user_id_updated_at_idx',
    'bookmarks_user_content_updated_idx',
    'bookmarks_user_status_updated_idx',
    'bookmarks_completed_search_idx',
    'bookmarks_completed_embedding_idx'
  ];

  for (const index of indexes) {
    const isTargetIndex = targetIndexes.includes(index.indexrelname);
    const marker = isTargetIndex ? '✓ NEW' : '  ';
    console.log(`${marker} ${index.indexrelname}: ${index.idx_scan} scans`);
  }

  console.log('');
}

/**
 * Helper: Extract execution time from EXPLAIN ANALYZE output
 */
function extractExecutionTime(planJson: string): number {
  try {
    const match = planJson.match(/"Execution Time":\s*(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }

    // Alternative: "Actual Total Time"
    const match2 = planJson.match(/"Actual Total Time":\s*(\d+\.?\d*)/);
    if (match2) {
      return parseFloat(match2[1]);
    }

    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('================================');
  console.log('Database Performance Test Suite');
  console.log('================================\n');

  try {
    // Setup
    await createTestBookmarks();

    // Run all tests
    await testBookmarkListPerformance();
    await testFullTextSearchPerformance();
    await testVectorSearchPerformance();
    await testActualQueryPerformance();
    await testIndexUsageSummary();

    console.log('================================');
    console.log('✓ All performance tests completed');
    console.log('================================\n');

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
