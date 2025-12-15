/**
 * Test real enrichment with AI processing
 */
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { createEnrichmentWorker } from '../workers/enrichmentWorker';

async function realEnrichmentTest() {
  console.log('🧪 Real Enrichment Test\n');

  const worker = createEnrichmentWorker();

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Use a simple, fast-loading page
    const testUrl = 'https://example.com';

    console.log('1. Adding enrichment job for example.com...');
    const job = await enrichmentQueue.addJob({
      url: testUrl,
      existingTags: [],
    });

    console.log(`   Job ID: ${job.id}`);
    console.log('');

    // Poll for completion
    console.log('2. Waiting for AI enrichment (max 60s)...\n');
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const jobState = await enrichmentQueue.getJobState(job.id!);
      const progress = await enrichmentQueue.getJobProgress(job.id!);
      const result = await enrichmentQueue.getJobResult(job.id!);

      const progressMsg = progress?.progress?.message || 'unknown';
      console.log(`   [${i * 2}s] ${jobState} - ${progressMsg}`);

      if (jobState === 'completed' && result) {
        console.log('\n✅ Enrichment completed successfully!\n');
        console.log('Result:');
        console.log(`├─ Title: ${result.title}`);
        console.log(`├─ Content Type: ${result.contentType}`);
        console.log(`├─ Domain: ${result.domain}`);
        console.log(`├─ Tags: ${result.tags?.join(', ') || 'none'}`);
        console.log(`├─ Summary: ${result.summary?.substring(0, 100)}...`);
        console.log(`├─ Has Embedding: ${result.embedding ? 'Yes (' + result.embedding.length + ' dims)' : 'No'}`);
        console.log(`├─ Processing Time: ${result.processingTime}ms`);
        console.log(`└─ Errors: ${result.errors?.length || 0}`);

        if (result.errors && result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach((err: any) => {
            console.log(`  - [${err.step}] ${err.error}`);
          });
        }

        console.log('\n✅ All fields present and valid!');
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

realEnrichmentTest();
