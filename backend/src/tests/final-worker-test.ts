/**
 * Final comprehensive worker test
 */
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';

async function finalTest() {
  console.log('🧪 Final Worker Test - Comprehensive\n');

  const worker = createEnrichmentWorker();

  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Use a reliable, simple URL
    const testUrl = 'https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md';

    console.log(`Testing with: ${testUrl}\n`);

    const job = await enrichmentQueue.addJob({
      url: testUrl,
      existingTags: ['test'],
    });

    console.log(`Job ID: ${job.id}\n`);
    console.log('Monitoring progress:\n');

    let lastState = '';
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const jobState = await enrichmentQueue.getJobState(job.id!);
      const progress = await enrichmentQueue.getJobProgress(job.id!);

      const step = progress?.progress?.step || '?';
      const pct = progress?.progress?.percentage || 0;

      if (jobState !== lastState) {
        console.log(`\n[${i * 2}s] State changed: ${lastState || 'waiting'} → ${jobState}`);
        lastState = jobState;
      }

      console.log(`      ${step.padEnd(12)} ${pct}%`);

      if (jobState === 'completed') {
        const result = await enrichmentQueue.getJobResult(job.id!);
        console.log('\n✅ SUCCESS!\n');

        console.log('Full Result:');
        console.log(JSON.stringify(result, null, 2));

        console.log('\n📊 Metrics:');
        const metrics = await enrichmentQueue.getMetrics();
        console.log(`  Completed: ${metrics.completed}`);
        console.log(`  Failed: ${metrics.failed}`);
        console.log(`  Active: ${metrics.active}`);

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

finalTest();
