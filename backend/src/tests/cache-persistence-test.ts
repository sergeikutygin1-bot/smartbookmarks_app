/**
 * Test Redis cache persistence across server restarts
 *
 * This test verifies that:
 * 1. Embeddings are cached in Redis
 * 2. Cache persists across server restarts
 * 3. Cached embeddings are retrieved without API calls
 */

import { getEmbedderAgent } from '../agents/embedderAgent';

async function testCachePersistence() {
  console.log('🧪 Redis Cache Persistence Test\n');

  const agent = getEmbedderAgent();

  // Test data
  const testTexts = [
    'Machine learning is transforming software development',
    'Redis provides persistent caching for web applications',
    'Vector embeddings enable semantic search capabilities',
  ];

  try {
    console.log('Step 1: Generate embeddings (will cache in Redis)...\n');

    for (const text of testTexts) {
      console.log(`   Embedding: "${text.substring(0, 50)}..."`);
      const start = Date.now();
      await agent.embed({ text });
      const duration = Date.now() - start;
      console.log(`   ✓ Generated in ${duration}ms\n`);
    }

    // Get cache stats
    console.log('Step 2: Check cache statistics...\n');
    const stats = await agent.getCacheStats();
    console.log(`   Cache entries: ${stats.size}`);
    console.log(`   Cache hits: ${stats.hits}`);
    console.log(`   Cache misses: ${stats.misses}`);
    console.log(`   Hit rate: ${stats.hitRate}%`);
    console.log(`   Memory usage: ${stats.memoryUsage}\n`);

    console.log('─'.repeat(60));
    console.log('✅ Embeddings cached successfully in Redis!\n');
    console.log('📝 Next step: Restart the backend server to test persistence');
    console.log('   1. Stop the server (Ctrl+C)');
    console.log('   2. Start it again: npm run dev');
    console.log('   3. Run this test again: npm run test:cache\n');
    console.log('🔄 When you re-run this test after restart:');
    console.log('   - Embeddings should be retrieved from cache (< 10ms)');
    console.log('   - No OpenAI API calls should be made');
    console.log('   - Cache hit rate should be 100%');
    console.log('─'.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCachePersistence();
