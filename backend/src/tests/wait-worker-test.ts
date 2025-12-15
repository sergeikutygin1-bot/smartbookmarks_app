/**
 * Test that waits for job to fully complete
 */
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';

async function waitTest() {
  console.log('🧪 Wait Test - Will wait 30s for completion\n');

  const worker = createEnrichmentWorker();

  try {
    // Give worker time to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    const testUrl = 'https://example.com';

    console.log('1. Adding simple test job...');
    const job = await enrichmentQueue.addJob({
      url: testUrl,
      skipAnalysis: true,
      skipTagging: true,
      skipEmbedding: true,
    });

    console.log(`   Job ID: ${job.id}`);
    console.log('');

    // Poll for completion
    console.log('2. Polling for completion (checking every 2s for 30s)...');
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const jobState = await enrichmentQueue.getJobState(job.id!);
      const result = await enrichmentQueue.getJobResult(job.id!);

      console.log(`   [${i * 2}s] State: ${jobState} | Result: ${result ? '✓' : '✗'}`);

      if (jobState === 'completed' && result) {
        console.log('\n✅ Job completed successfully!');
        console.log(`   Title: ${result.title}`);
        console.log(`   Content Type: ${result.contentType}`);
        console.log(`   Errors: ${result.errors.length}`);
        break;
      }

      if (jobState === 'failed') {
        const jobData = await enrichmentQueue.getJobProgress(job.id!);
        console.log(`\n❌ Job failed: ${jobData?.failedReason}`);
        break;
      }
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    console.log('\n🧹 Cleaning up...');
    await worker.close();
    await enrichmentQueue.close();
    console.log('Done\n');
    process.exit(0);
  }
}

waitTest();
