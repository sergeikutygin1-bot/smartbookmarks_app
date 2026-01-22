import prisma, { Prisma } from '../src/db/prisma';
import { getEmbedderAgent } from '../src/agents/embedderAgent';
import { ConceptAnalyzerAgent } from '../src/agents/ConceptAnalyzerAgent';

interface BackfillOptions {
  userId?: string;
  batchSize?: number;
  conceptsOnly?: boolean;
  bookmarksOnly?: boolean;
  dryRun?: boolean;
}

async function backfillAdvancedEmbeddings(options: BackfillOptions = {}) {
  const { userId, batchSize = 10, conceptsOnly, bookmarksOnly, dryRun } = options;

  console.log('\n🚀 Starting Advanced Embeddings Backfill\n');
  console.log('Options:', { userId: userId || 'all', batchSize, conceptsOnly, bookmarksOnly, dryRun });
  console.log('─'.repeat(60));

  let totalCost = 0;
  let bookmarksProcessed = 0;
  let conceptsProcessed = 0;

  // Backfill Bookmark Summary Embeddings
  if (!conceptsOnly) {
    console.log('\n📚 Step 1: Backfilling Bookmark Summary Embeddings\n');

    // Use raw SQL to filter by vector fields (Prisma can't filter Unsupported types)
    const bookmarks = userId
      ? await prisma.$queryRaw<Array<{
          id: string;
          user_id: string;
          summary: string;
        }>>`
          SELECT id, user_id, summary
          FROM bookmarks
          WHERE status = 'completed'
            AND summary_embedding IS NULL
            AND summary IS NOT NULL
            AND user_id = ${userId}
        `
      : await prisma.$queryRaw<Array<{
          id: string;
          user_id: string;
          summary: string;
        }>>`
          SELECT id, user_id, summary
          FROM bookmarks
          WHERE status = 'completed'
            AND summary_embedding IS NULL
            AND summary IS NOT NULL
        `;

    console.log(`Found ${bookmarks.length} bookmarks without summary embeddings\n`);

    if (bookmarks.length > 0) {
      const embedder = getEmbedderAgent();

      for (let i = 0; i < bookmarks.length; i += batchSize) {
        const batch = bookmarks.slice(i, i + batchSize);
        const summaries = batch.map(b => b.summary);

        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(bookmarks.length / batchSize)}...`);

        const embeddings = await embedder.embedBatch({ texts: summaries, useCache: true });

        if (!dryRun) {
          for (let j = 0; j < batch.length; j++) {
            const embeddingStr = `[${embeddings[j].join(',')}]`;
            await prisma.$executeRaw`
              UPDATE bookmarks
              SET summary_embedding = ${embeddingStr}::vector
              WHERE id = ${batch[j].id}
            `;
          }
        }

        bookmarksProcessed += batch.length;
        totalCost += batch.length * 0.0006;

        console.log(`  ✓ Processed ${bookmarksProcessed}/${bookmarks.length} bookmarks`);

        // Rate limiting
        if (i + batchSize < bookmarks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`\n✅ Summary embeddings: ${bookmarksProcessed} bookmarks processed`);
      console.log(`💰 Estimated cost: $${(bookmarksProcessed * 0.0006).toFixed(4)}`);
    }
  }

  // Backfill Concept Embeddings
  if (!bookmarksOnly) {
    console.log('\n🧠 Step 2: Backfilling Concept Embeddings\n');

    const conceptAnalyzer = new ConceptAnalyzerAgent();

    if (userId) {
      const result = await conceptAnalyzer.batchGenerateConceptEmbeddings(userId, batchSize);
      conceptsProcessed = result.success;
      totalCost += result.success * 0.001;

      console.log(`\n✅ Concept embeddings: ${result.success} success, ${result.failed} failed`);
      console.log(`💰 Estimated cost: $${(result.success * 0.001).toFixed(4)}`);
    } else {
      const users = await prisma.user.findMany({ select: { id: true, email: true } });
      console.log(`Processing concepts for ${users.length} users\n`);

      for (const user of users) {
        console.log(`\n👤 User: ${user.email}`);
        const result = await conceptAnalyzer.batchGenerateConceptEmbeddings(user.id, batchSize);
        conceptsProcessed += result.success;
        totalCost += result.success * 0.001;

        console.log(`  ✓ ${result.success} success, ${result.failed} failed`);
      }

      console.log(`\n✅ Total concept embeddings: ${conceptsProcessed} processed`);
      console.log(`💰 Estimated cost: $${(conceptsProcessed * 0.001).toFixed(4)}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(60));
  console.log('\n✨ Backfill Complete!\n');
  console.log(`📊 Summary:`);
  console.log(`  • Bookmarks: ${bookmarksProcessed} summary embeddings generated`);
  console.log(`  • Concepts: ${conceptsProcessed} embeddings generated`);
  console.log(`  • Total cost: $${totalCost.toFixed(4)}`);

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN - No changes were made to the database`);
  }

  console.log('');
}

// CLI parsing
const args = process.argv.slice(2);
const options: BackfillOptions = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--user-id' && args[i + 1]) options.userId = args[i + 1];
  if (args[i] === '--batch-size' && args[i + 1]) options.batchSize = parseInt(args[i + 1]);
  if (args[i] === '--concepts-only') options.conceptsOnly = true;
  if (args[i] === '--bookmarks-only') options.bookmarksOnly = true;
  if (args[i] === '--dry-run') options.dryRun = true;
}

if (require.main === module) {
  backfillAdvancedEmbeddings(options)
    .then(() => {
      console.log('Backfill completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Backfill failed:', error);
      process.exit(1);
    });
}
