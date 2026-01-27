import prisma from '../src/db/prisma';
import { getEmbedderAgent } from '../src/agents/embedderAgent';
import { rrfSearch } from '../src/services/rrfSearch';

/**
 * Test Advanced Embeddings Implementation
 * Verifies:
 * 1. Multi-embedding generation
 * 2. Database storage
 * 3. Concept embeddings
 * 4. RRF search functionality
 */

async function testAdvancedEmbeddings() {
  console.log('\n🧪 Testing Advanced Embeddings Implementation\n');
  console.log('─'.repeat(60));

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Multi-Embedding Generation
  console.log('\n📝 Test 1: Multi-Embedding Generation');
  totalTests++;

  try {
    const embedder = getEmbedderAgent();
    const testResult = await embedder.embedMulti({
      title: 'Test Title About Machine Learning',
      summary: 'This is a test summary about machine learning and artificial intelligence.',
      useCache: false,
    });

    if (testResult.combined.length === 1536 && testResult.summary.length === 1536) {
      console.log('  ✅ Combined embedding: 1536 dimensions');
      console.log('  ✅ Summary embedding: 1536 dimensions');
      passedTests++;
    } else {
      console.log('  ❌ Embedding dimensions incorrect');
    }
  } catch (error) {
    console.log('  ❌ Failed:', error);
  }

  // Test 2: Database Storage Coverage
  console.log('\n📊 Test 2: Database Storage Coverage');
  totalTests++;

  try {
    const stats = await prisma.$queryRaw<Array<{
      total: bigint;
      has_combined: bigint;
      has_summary: bigint;
    }>>`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as has_combined,
        COUNT(summary_embedding) as has_summary
      FROM bookmarks
      WHERE status = 'completed'
    `;

    const total = Number(stats[0].total);
    const hasCombined = Number(stats[0].has_combined);
    const hasSummary = Number(stats[0].has_summary);

    console.log('  📈 Bookmark embedding coverage:');
    console.log(`     Total completed bookmarks: ${total}`);
    console.log(`     Combined embeddings: ${hasCombined} (${total > 0 ? Math.round(hasCombined / total * 100) : 0}%)`);
    console.log(`     Summary embeddings: ${hasSummary} (${total > 0 ? Math.round(hasSummary / total * 100) : 0}%)`);

    if (total === 0 || (hasCombined > 0 && hasSummary > 0)) {
      console.log('  ✅ Database storage working');
      passedTests++;
    } else {
      console.log('  ⚠️  Some embeddings missing - run backfill script');
    }
  } catch (error) {
    console.log('  ❌ Failed:', error);
  }

  // Test 3: Concept Embeddings
  console.log('\n🧠 Test 3: Concept Embeddings');
  totalTests++;

  try {
    const conceptStats = await prisma.$queryRaw<Array<{
      total: bigint;
      has_embedding: bigint;
    }>>`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as has_embedding
      FROM concepts
    `;

    const total = Number(conceptStats[0].total);
    const hasEmbedding = Number(conceptStats[0].has_embedding);

    console.log('  📈 Concept embedding coverage:');
    console.log(`     Total concepts: ${total}`);
    console.log(`     With embeddings: ${hasEmbedding} (${total > 0 ? Math.round(hasEmbedding / total * 100) : 0}%)`);

    if (total === 0 || hasEmbedding > 0) {
      console.log('  ✅ Concept embeddings working');
      passedTests++;
    } else {
      console.log('  ⚠️  No concept embeddings - run backfill script');
    }

    // Show top concepts with embeddings
    if (hasEmbedding > 0) {
      const topConcepts = await prisma.$queryRaw<Array<{
        canonical_name: string;
        has_embedding: boolean;
        occurrence_count: number;
      }>>`
        SELECT canonical_name, embedding IS NOT NULL as has_embedding, occurrence_count
        FROM concepts
        ORDER BY occurrence_count DESC
        LIMIT 5
      `;

      console.log('\n  Top 5 concepts:');
      topConcepts.forEach(c => {
        console.log(`    ${c.has_embedding ? '✓' : '✗'} ${c.canonical_name} (${c.occurrence_count} occurrences)`);
      });
    }
  } catch (error) {
    console.log('  ❌ Failed:', error);
  }

  // Test 4: RRF Search Functionality
  console.log('\n🔍 Test 4: RRF Search Functionality');
  totalTests++;

  try {
    // Get a random user with bookmarks (using raw SQL to filter by embedding)
    const users = await prisma.$queryRaw<Array<{ user_id: string; email: string }>>`
      SELECT DISTINCT b.user_id, u.email
      FROM bookmarks b
      JOIN users u ON u.id = b.user_id
      WHERE b.status = 'completed' AND b.embedding IS NOT NULL
      LIMIT 1
    `;

    const user = users.length > 0 ? { id: users[0].user_id, email: users[0].email } : null;

    if (!user) {
      console.log('  ⚠️  No users with completed bookmarks found');
    } else {
      console.log(`  Testing with user: ${user.email}`);

      const rrfResults = await rrfSearch({
        query: 'technology programming',
        userId: user.id,
        limit: 5,
        k: 60,
        enableGraphBoost: true,
      });

      console.log(`\n  📊 RRF search returned ${rrfResults.length} results:`);
      rrfResults.slice(0, 3).forEach((result, i) => {
        console.log(`    ${i + 1}. RRF Score: ${result.rrfScore.toFixed(4)}`);
        console.log(`       Signals: ${JSON.stringify(result.signals)}`);
      });

      if (rrfResults.length > 0) {
        console.log('  ✅ RRF search working');
        passedTests++;
      } else {
        console.log('  ⚠️  No results found - may need more bookmarks');
      }
    }
  } catch (error) {
    console.log('  ❌ Failed:', error);
  }

  // Test 5: Index Performance
  console.log('\n⚡ Test 5: Index Performance Check');
  totalTests++;

  try {
    const indexes = await prisma.$queryRaw<Array<{
      indexname: string;
      tablename: string;
    }>>`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename IN ('bookmarks', 'concepts')
        AND indexname LIKE '%embedding%'
      ORDER BY tablename, indexname
    `;

    console.log('  📋 Embedding indexes:');
    indexes.forEach(idx => {
      console.log(`    ✓ ${idx.tablename}.${idx.indexname}`);
    });

    const expectedIndexes = [
      'bookmarks_summary_embedding_hnsw_idx',
      'bookmarks_embedding_hnsw_idx',
      'concepts_embedding_hnsw_idx',
    ];

    const foundIndexes = indexes.map(i => i.indexname);
    const hasAllIndexes = expectedIndexes.every(idx =>
      foundIndexes.some(f => f.includes(idx.replace('_hnsw_idx', '')))
    );

    if (hasAllIndexes) {
      console.log('  ✅ All required indexes present');
      passedTests++;
    } else {
      console.log('  ⚠️  Some indexes missing');
    }
  } catch (error) {
    console.log('  ❌ Failed:', error);
  }

  // Summary
  console.log('\n' + '─'.repeat(60));
  console.log(`\n🎯 Test Results: ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    console.log('✨ All tests passed! Advanced embeddings are working correctly.\n');
    return 0;
  } else {
    console.log('⚠️  Some tests failed. Review the output above for details.\n');
    return 1;
  }
}

if (require.main === module) {
  testAdvancedEmbeddings()
    .then(exitCode => {
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}
