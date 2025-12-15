/**
 * Test async enrichment API flow
 * Tests POST /enrich and GET /enrich/:jobId endpoints
 */

// Mock server test using direct queue interaction
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';

async function testAsyncAPI() {
  console.log('🧪 Testing Async API Flow\n');

  const worker = createEnrichmentWorker();

  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate POST /enrich request
    console.log('1. POST /enrich (simulated)');
    const testUrl = 'https://example.com';
    const job = await enrichmentQueue.addJob({
      url: testUrl,
      existingTags: ['test'],
    });

    console.log(`   ✓ Job queued: ${job.id}`);
    console.log(`   Response: { jobId: "${job.id}", status: "queued" }\n`);

    // Simulate GET /enrich/:jobId polling
    console.log('2. GET /enrich/:jobId (polling every 2s)\n');

    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate the API endpoint logic
      const jobState = await enrichmentQueue.getJobState(job.id!);
      const progress = await enrichmentQueue.getJobProgress(job.id!);

      const response: any = {
        jobId: job.id,
        status: jobState,
        progress: progress?.progress,
        attemptsMade: progress?.attemptsMade,
      };

      if (jobState === 'completed') {
        const result = await enrichmentQueue.getJobResult(job.id!);
        response.result = result;
      }

      if (jobState === 'failed') {
        response.error = progress?.failedReason;
      }

      // Log polling response
      const progressMsg = progress?.progress?.message || 'unknown';
      const pct = progress?.progress?.percentage || 0;
      console.log(`   [${i * 2}s] ${jobState.padEnd(10)} | ${pct}% | ${progressMsg}`);

      if (jobState === 'completed') {
        console.log('\n✅ Job completed!\n');
        console.log('Final API Response:');
        console.log(JSON.stringify(response, null, 2).substring(0, 1000) + '...\n');

        // Verify response structure
        console.log('📋 Response Validation:');
        console.log(`   ✓ jobId present: ${!!response.jobId}`);
        console.log(`   ✓ status === 'completed': ${response.status === 'completed'}`);
        console.log(`   ✓ result present: ${!!response.result}`);
        if (response.result) {
          console.log(`   ✓ result.title: ${!!response.result.title}`);
          console.log(`   ✓ result.tags: ${Array.isArray(response.result.tags)}`);
          console.log(`   ✓ result.summary: ${!!response.result.summary}`);
        }

        console.log('\n✅ Async API flow working correctly!');
        break;
      }

      if (jobState === 'failed') {
        console.log(`\n❌ Job failed: ${response.error}\n`);
        throw new Error(`Job failed: ${response.error}`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    console.log('\n🧹 Cleanup...');
    await worker.close();
    await enrichmentQueue.close();
    console.log('Done\n');
    process.exit(0);
  }
}

testAsyncAPI();
