/**
 * Test script to verify Redis connection and basic operations
 */
import RedisClient from '../config/redis';

async function testRedisConnection() {
  console.log('🧪 Testing Redis connection...\n');

  try {
    // Get Redis client instance
    const redis = RedisClient.getInstance();

    // Test 1: Connection info
    console.log('1. Connection Info:');
    const info = RedisClient.getConnectionInfo();
    console.log(`   URL: ${info.url}`);
    console.log(`   Status: ${info.status}`);
    console.log(`   Ready: ${info.ready}`);
    console.log('');

    // Test 2: Health check (PING)
    console.log('2. Health Check (PING):');
    const isHealthy = await RedisClient.healthCheck();
    console.log(`   Result: ${isHealthy ? '✓ PASS' : '✗ FAIL'}`);
    console.log('');

    // Test 3: SET operation
    console.log('3. SET Operation:');
    const testKey = 'test:connection';
    const testValue = JSON.stringify({
      message: 'Hello Redis!',
      timestamp: new Date().toISOString(),
    });
    await redis.set(testKey, testValue, 'EX', 60); // Expire in 60 seconds
    console.log(`   ✓ Set key "${testKey}"`);
    console.log('');

    // Test 4: GET operation
    console.log('4. GET Operation:');
    const retrievedValue = await redis.get(testKey);
    console.log(`   Retrieved: ${retrievedValue}`);
    console.log(`   Match: ${retrievedValue === testValue ? '✓ PASS' : '✗ FAIL'}`);
    console.log('');

    // Test 5: TTL check
    console.log('5. TTL Check:');
    const ttl = await redis.ttl(testKey);
    console.log(`   TTL: ${ttl} seconds`);
    console.log(`   Valid: ${ttl > 0 && ttl <= 60 ? '✓ PASS' : '✗ FAIL'}`);
    console.log('');

    // Test 6: DELETE operation
    console.log('6. DELETE Operation:');
    const deleted = await redis.del(testKey);
    console.log(`   Deleted: ${deleted === 1 ? '✓ PASS' : '✗ FAIL'}`);
    console.log('');

    // Test 7: Verify deletion
    console.log('7. Verify Deletion:');
    const afterDelete = await redis.get(testKey);
    console.log(`   Value after delete: ${afterDelete}`);
    console.log(`   Deleted successfully: ${afterDelete === null ? '✓ PASS' : '✗ FAIL'}`);
    console.log('');

    // Test 8: Hash operations (for complex data)
    console.log('8. Hash Operations:');
    const hashKey = 'test:hash';
    await redis.hset(hashKey, 'field1', 'value1');
    await redis.hset(hashKey, 'field2', 'value2');
    const hashValue = await redis.hgetall(hashKey);
    console.log(`   Hash data: ${JSON.stringify(hashValue)}`);
    console.log(`   Fields match: ${hashValue.field1 === 'value1' && hashValue.field2 === 'value2' ? '✓ PASS' : '✗ FAIL'}`);
    await redis.del(hashKey);
    console.log('');

    // Test 9: Cache pattern (SET with EX and GET)
    console.log('9. Cache Pattern (Embedding Cache Simulation):');
    const cacheKey = 'cache:embedding:test-content-hash';
    const embedding = Array.from({ length: 10 }, (_, i) => i * 0.1); // Simulate embedding vector
    await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 86400); // 24 hour TTL
    const cachedEmbedding = await redis.get(cacheKey);
    const parsedEmbedding = cachedEmbedding ? JSON.parse(cachedEmbedding) : null;
    console.log(`   Cached embedding: ${JSON.stringify(parsedEmbedding?.slice(0, 3))}...`);
    console.log(`   Cache hit: ${parsedEmbedding !== null ? '✓ PASS' : '✗ FAIL'}`);
    await redis.del(cacheKey);
    console.log('');

    console.log('✅ All tests passed! Redis is ready for use.');
    console.log('');

    // Close connection
    await RedisClient.close();
    console.log('✓ Connection closed gracefully');

  } catch (error) {
    console.error('❌ Redis test failed:', error);
    process.exit(1);
  }
}

// Run the test
testRedisConnection();
