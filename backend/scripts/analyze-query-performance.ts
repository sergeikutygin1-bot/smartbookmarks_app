import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface QueryPerformance {
  query: string;
  executionTime: number;
  planningTime: number;
  totalTime: number;
  plan: any;
}

/**
 * Analyze performance of common queries
 * Uses EXPLAIN ANALYZE to get detailed execution plans
 */
async function analyzeQueryPerformance() {
  console.log('🔍 Analyzing Query Performance...\n');
  console.log('='.repeat(80));

  const results: QueryPerformance[] = [];

  // Get a test user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('❌ No user found for testing');
    return;
  }

  console.log(`✓ Using user: ${user.email}\n`);

  // Test 1: Bookmark list query (most common)
  console.log('📋 Test 1: Bookmark List Query');
  console.log('-'.repeat(80));
  const bookmarkListResult = await prisma.$queryRawUnsafe<any[]>(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, title, url, domain, summary, content_type, created_at, updated_at
    FROM bookmarks
    WHERE user_id = '${user.id}'
    ORDER BY updated_at DESC
    LIMIT 50
  `);
  const bookmarkListPlan = bookmarkListResult[0]['QUERY PLAN'][0];
  results.push({
    query: 'Bookmark List (ORDER BY updated_at)',
    executionTime: bookmarkListPlan['Execution Time'],
    planningTime: bookmarkListPlan['Planning Time'],
    totalTime: bookmarkListPlan['Execution Time'] + bookmarkListPlan['Planning Time'],
    plan: bookmarkListPlan,
  });
  printQueryResult('Bookmark List', bookmarkListPlan);

  // Test 2: Full-text search query
  console.log('\n🔎 Test 2: Full-Text Search Query');
  console.log('-'.repeat(80));
  const searchResult = await prisma.$queryRawUnsafe<any[]>(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, title, url, summary,
           ts_rank(search_vector, plainto_tsquery('english', 'react typescript')) as rank
    FROM bookmarks
    WHERE user_id = '${user.id}'
      AND search_vector @@ plainto_tsquery('english', 'react typescript')
    ORDER BY rank DESC
    LIMIT 20
  `);
  const searchPlan = searchResult[0]['QUERY PLAN'][0];
  results.push({
    query: 'Full-Text Search',
    executionTime: searchPlan['Execution Time'],
    planningTime: searchPlan['Planning Time'],
    totalTime: searchPlan['Execution Time'] + searchPlan['Planning Time'],
    plan: searchPlan,
  });
  printQueryResult('Full-Text Search', searchPlan);

  // Test 3: Vector similarity search
  console.log('\n🎯 Test 3: Vector Similarity Search');
  console.log('-'.repeat(80));
  const bookmarkWithEmbedding = await prisma.$queryRaw<any[]>`
    SELECT id, embedding::text
    FROM bookmarks
    WHERE user_id = ${user.id}
      AND embedding IS NOT NULL
    LIMIT 1
  `;

  if (bookmarkWithEmbedding.length > 0) {
    const bookmark = bookmarkWithEmbedding[0];
    const embeddingResult = bookmarkWithEmbedding;

    if (embeddingResult.length > 0) {
      const embedding = embeddingResult[0].embedding;
      const vectorSearchResult = await prisma.$queryRawUnsafe<any[]>(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id, title, 1 - (embedding <=> '${embedding}'::vector) as similarity
        FROM bookmarks
        WHERE user_id = '${user.id}'
          AND id != '${bookmark.id}'
          AND embedding IS NOT NULL
        ORDER BY embedding <=> '${embedding}'::vector
        LIMIT 20
      `);
      const vectorPlan = vectorSearchResult[0]['QUERY PLAN'][0];
      results.push({
        query: 'Vector Similarity Search',
        executionTime: vectorPlan['Execution Time'],
        planningTime: vectorPlan['Planning Time'],
        totalTime: vectorPlan['Execution Time'] + vectorPlan['Planning Time'],
        plan: vectorPlan,
      });
      printQueryResult('Vector Similarity', vectorPlan);
    }
  }

  // Test 4: Graph relationship query
  console.log('\n🕸️  Test 4: Graph Relationship Query');
  console.log('-'.repeat(80));
  const graphResult = await prisma.$queryRawUnsafe<any[]>(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT r.*, c.name as concept_name
    FROM relationships r
    LEFT JOIN concepts c ON r.target_type = 'concept' AND r.target_id = c.id
    WHERE r.user_id = '${user.id}'
      AND r.source_type = 'bookmark'
      AND r.target_type = 'concept'
    ORDER BY r.weight DESC
    LIMIT 50
  `);
  const graphPlan = graphResult[0]['QUERY PLAN'][0];
  results.push({
    query: 'Graph Relationships',
    executionTime: graphPlan['Execution Time'],
    planningTime: graphPlan['Planning Time'],
    totalTime: graphPlan['Execution Time'] + graphPlan['Planning Time'],
    plan: graphPlan,
  });
  printQueryResult('Graph Relationships', graphPlan);

  // Test 5: Cluster query
  console.log('\n📊 Test 5: Cluster Query');
  console.log('-'.repeat(80));
  const clusterResult = await prisma.$queryRawUnsafe<any[]>(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT c.*, COUNT(b.id) as bookmark_count
    FROM clusters c
    LEFT JOIN bookmarks b ON b.cluster_id = c.id
    WHERE c.user_id = '${user.id}'
    GROUP BY c.id
    ORDER BY c.coherence_score DESC NULLS LAST
    LIMIT 20
  `);
  const clusterPlan = clusterResult[0]['QUERY PLAN'][0];
  results.push({
    query: 'Cluster List',
    executionTime: clusterPlan['Execution Time'],
    planningTime: clusterPlan['Planning Time'],
    totalTime: clusterPlan['Execution Time'] + clusterPlan['Planning Time'],
    plan: clusterPlan,
  });
  printQueryResult('Cluster List', clusterPlan);

  // Summary
  printSummary(results);

  await prisma.$disconnect();
}

function printQueryResult(name: string, plan: any) {
  console.log(`Query: ${name}`);
  console.log(`  Planning Time: ${plan['Planning Time'].toFixed(2)}ms`);
  console.log(`  Execution Time: ${plan['Execution Time'].toFixed(2)}ms`);
  console.log(`  Total Time: ${(plan['Planning Time'] + plan['Execution Time']).toFixed(2)}ms`);

  // Check if indexes are being used
  const planStr = JSON.stringify(plan);
  const usesIndex = planStr.includes('Index Scan') || planStr.includes('Index Only Scan');
  const usesSeqScan = planStr.includes('Seq Scan');

  if (usesIndex) {
    console.log(`  ✅ Uses Index`);
  }
  if (usesSeqScan) {
    console.log(`  ⚠️  Uses Sequential Scan (may benefit from index)`);
  }

  // Print top-level node type
  console.log(`  Node Type: ${plan.Plan['Node Type']}`);
}

function printSummary(results: QueryPerformance[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 Performance Summary');
  console.log('='.repeat(80));

  results.sort((a, b) => b.totalTime - a.totalTime);

  console.log('\nQueries ranked by total time:');
  results.forEach((result, index) => {
    const status = result.totalTime < 10 ? '🟢' : result.totalTime < 50 ? '🟡' : '🔴';
    console.log(`${index + 1}. ${status} ${result.query}`);
    console.log(`   Total: ${result.totalTime.toFixed(2)}ms (Planning: ${result.planningTime.toFixed(2)}ms, Execution: ${result.executionTime.toFixed(2)}ms)`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('Performance Guidelines:');
  console.log('  🟢 < 10ms  - Excellent');
  console.log('  🟡 10-50ms - Good');
  console.log('  🔴 > 50ms  - Needs optimization');
  console.log('='.repeat(80));
}

analyzeQueryPerformance();
