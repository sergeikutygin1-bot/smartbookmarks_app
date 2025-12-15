/**
 * Test script to verify enrichment worker processes jobs correctly
 */
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';
import { QueueEvents } from 'bullmq';
import { createRedisConnection } from '../config/redis';

async function testWorkerProcessing() {
  console.log('🧪 Testing Enrichment Worker...\n');

  const worker = createEnrichmentWorker();
  const queueEvents = new QueueEvents('enrichment', {
    connection: createRedisConnection(),
  });

  try {
    // Test URL - a simple article
    const testUrl = 'https://paulgraham.com/good.html';

    console.log('1. Adding job to queue...');
    const job = await enrichmentQueue.addJob({
      url: testUrl,
      existingTags: ['test', 'programming'],
    });

    console.log(`   ✓ Job added with ID: ${job.id}`);
    console.log('');

    // Monitor job progress
    console.log('2. Monitoring job progress...');

    job.log('Job started from test script');

    // Wait for completion or failure
    console.log('   Waiting for job to complete (max 60 seconds)...\n');

    const result = await job.waitUntilFinished(queueEvents, 60000);

    console.log('\n3. Job completed!');
    console.log('');
    console.log('   Result:');
    console.log(`   ├─ Title: ${result.title}`);
    console.log(`   ├─ Content Type: ${result.contentType}`);
    console.log(`   ├─ Tags: ${result.tags.join(', ')}`);
    console.log(`   ├─ Summary Length: ${result.summary.length} chars`);
    console.log(`   ├─ Has Embedding: ${result.embedding ? 'Yes' : 'No'}`);
    console.log(`   ├─ Errors: ${result.errors.length}`);
    console.log(`   └─ Processing Time: ${result.processingTime}ms`);
    console.log('');

    // Display summary preview
    console.log('4. Summary Preview:');
    console.log('   ' + result.summary.substring(0, 200) + '...');
    console.log('');

    // Show any errors
    if (result.errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. [${err.step}] ${err.error}`);
        console.log(`      Recoverable: ${err.recoverable}`);
      });
      console.log('');
    }

    // Verify queue metrics
    console.log('5. Queue Metrics:');
    const metrics = await enrichmentQueue.getMetrics();
    console.log(`   ├─ Waiting: ${metrics.waiting}`);
    console.log(`   ├─ Active: ${metrics.active}`);
    console.log(`   ├─ Completed: ${metrics.completed}`);
    console.log(`   ├─ Failed: ${metrics.failed}`);
    console.log(`   └─ Total: ${metrics.total}`);
    console.log('');

    // Test job retrieval
    console.log('6. Testing job retrieval...');
    const retrievedJob = await enrichmentQueue.getJob(job.id!);
    const jobState = await enrichmentQueue.getJobState(job.id!);
    const jobResult = await enrichmentQueue.getJobResult(job.id!);

    console.log(`   ├─ Job found: ${retrievedJob ? 'Yes' : 'No'}`);
    console.log(`   ├─ Job state: ${jobState}`);
    console.log(`   └─ Result matches: ${jobResult?.title === result.title ? 'Yes' : 'No'}`);
    console.log('');

    console.log('✅ All tests passed! Worker is functioning correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    console.log('\n🧹 Cleaning up...');

    // Close worker
    await worker.close();
    console.log('   ✓ Worker closed');

    // Close queue events
    await queueEvents.close();
    console.log('   ✓ Queue events closed');

    // Close queue
    await enrichmentQueue.close();
    console.log('   ✓ Queue closed');

    console.log('');
  }
}

// Run the test
testWorkerProcessing()
  .then(() => {
    console.log('✓ Test completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error);
    process.exit(1);
  });
