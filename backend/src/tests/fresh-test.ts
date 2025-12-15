/**
 * Test with fresh unique URL
 */
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';

async function freshTest() {
  console.log('🧪 Fresh URL Test\n');

  const worker = createEnrichmentWorker();

  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Unique URL with timestamp
    const timestamp = Date.now();
    const testUrl = `https://httpbin.org/delay/0?test=${timestamp}`;

    console.log(`1. Testing with unique URL: ${testUrl}\n`);

    const job = await enrichmentQueue.addJob({
      url: testUrl,
      skipEmbedding: true, // Skip embedding to speed up test
    });

    console.log(`   Job ID: ${job.id}\n`);

    // Poll for completion
    console.log('2. Monitoring...\n');
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const jobState = await enrichmentQueue.getJobState(job.id!);
      const progress = await enrichmentQueue.getJobProgress(job.id!);

      const step = progress?.progress?.step || '?';
      const msg = progress?.progress?.message || 'unknown';
      const pct = progress?.progress?.percentage || 0;

      console.log(`   [${i * 2}s] ${jobState.padEnd(10)} | ${step.padEnd(12)} | ${pct}% | ${msg}`);

      if (jobState === 'completed') {
        const result = await enrichmentQueue.getJobResult(job.id!);
        console.log('\n✅ COMPLETED!\n');

        if (result) {
          console.log('Result Object Keys:', Object.keys(result));
          console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
        } else {
          console.log('⚠️  Result is null/undefined');
        }
        break;
      }

      if (jobState === 'failed') {
        console.log(`\n❌ FAILED: ${progress?.failedReason}`);
        break;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n🧹 Cleanup...');
    await worker.close();
    await enrichmentQueue.close();
    process.exit(0);
  }
}

freshTest();
