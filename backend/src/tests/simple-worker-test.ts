/**
 * Simple test script to verify basic queue and worker functionality
 */
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';

async function simpleTest() {
  console.log('🧪 Simple Worker Test\n');

  const worker = createEnrichmentWorker();

  try {
    // Give worker time to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    const testUrl = 'https://example.com';

    console.log('1. Adding test job...');
    const job = await enrichmentQueue.addJob({
      url: testUrl,
      skipAnalysis: true, // Skip AI to test just the infrastructure
      skipTagging: true,
      skipEmbedding: true,
    });

    console.log(`   Job ID: ${job.id}`);
    console.log('');

    // Wait for job to be picked up
    console.log('2. Waiting 10 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check job status
    const jobState = await enrichmentQueue.getJobState(job.id!);
    console.log(`   Job state: ${jobState}`);

    const jobData = await enrichmentQueue.getJobProgress(job.id!);
    console.log(`   Progress: ${JSON.stringify(jobData?.progress)}`);
    console.log(`   Attempts: ${jobData?.attemptsMade}`);
    console.log(`   Failed reason: ${jobData?.failedReason || 'none'}`);

    // Try to get result
    const result = await enrichmentQueue.getJobResult(job.id!);
    console.log(`   Result: ${result ? 'Found' : 'Not found'}`);

    if (result) {
      console.log(`   Title: ${result.title}`);
    }

    console.log('');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await worker.close();
    await enrichmentQueue.close();
    process.exit(0);
  }
}

simpleTest();
