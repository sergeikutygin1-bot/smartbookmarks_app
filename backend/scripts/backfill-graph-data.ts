import { PrismaClient } from '@prisma/client';
import { graphQueue } from '../src/queues/graphQueue';

const prisma = new PrismaClient();

interface BackfillStats {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  startTime: Date;
}

const stats: BackfillStats = {
  total: 0,
  processed: 0,
  failed: 0,
  skipped: 0,
  startTime: new Date(),
};

/**
 * Backfill script to process existing bookmarks through graph agents
 *
 * Usage:
 *   npm run backfill              # Process all bookmarks
 *   npm run backfill -- --limit 100  # Process first 100
 *   npm run backfill -- --user-id <id>  # Process specific user
 */
async function backfillGraphData() {
  try {
    console.log('🔄 Starting graph data backfill...\n');

    // Parse CLI arguments
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    const userIdIndex = args.indexOf('--user-id');

    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : undefined;
    const userId = userIdIndex !== -1 ? args[userIdIndex + 1] : undefined;

    // Get bookmarks that need graph processing
    const bookmarks = await getBookmarksToProcess(userId, limit);
    stats.total = bookmarks.length;

    console.log(`📚 Found ${stats.total} bookmarks to process`);
    if (userId) console.log(`   Filtering by user: ${userId}`);
    if (limit) console.log(`   Limit: ${limit}`);
    console.log('');

    if (bookmarks.length === 0) {
      console.log('✅ No bookmarks to process!');
      return;
    }

    // Process in batches
    const batchSize = 10;
    const batches = Math.ceil(bookmarks.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, bookmarks.length);
      const batch = bookmarks.slice(start, end);

      console.log(`📦 Processing batch ${i + 1}/${batches} (${start + 1}-${end}/${stats.total})`);

      await processBatch(batch);

      // Progress report
      const progress = ((stats.processed + stats.failed + stats.skipped) / stats.total * 100).toFixed(1);
      console.log(`   Progress: ${progress}% | ✅ ${stats.processed} | ❌ ${stats.failed} | ⏭️  ${stats.skipped}\n`);

      // Small delay between batches to avoid overwhelming the queue
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Final report
    printFinalReport();

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get bookmarks that need graph processing
 */
async function getBookmarksToProcess(userId?: string, limit?: number) {
  const whereClause: any = {
    status: 'completed', // Only process completed bookmarks
  };

  if (userId) {
    whereClause.userId = userId;
  }

  // Get bookmarks without graph data (must have embeddings)
  let query = `
    SELECT b.id, b.user_id, b.title, b.url, b.summary, b.embedding::text
    FROM bookmarks b
    WHERE b.status = 'completed'
      AND b.embedding IS NOT NULL
  `;

  if (userId) {
    query += ` AND b.user_id = '${userId}'`;
  }

  query += `
      AND NOT EXISTS (
        SELECT 1 FROM relationships r
        WHERE r.source_type = 'bookmark'
          AND r.source_id = b.id
      )
    ORDER BY b.created_at DESC
  `;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const bookmarksWithoutGraph = await prisma.$queryRawUnsafe<any[]>(query);

  return bookmarksWithoutGraph.map((b: any) => ({
    id: b.id,
    userId: b.user_id,
    title: b.title,
    url: b.url,
    summary: b.summary,
    embedding: b.embedding ? JSON.parse(b.embedding) : [],
  }));
}

/**
 * Process a batch of bookmarks
 */
async function processBatch(bookmarks: any[]) {
  const promises = bookmarks.map(async (bookmark) => {
    try {
      // Check if bookmark has required data
      if (!bookmark.summary || bookmark.summary.length < 50) {
        console.log(`   ⏭️  Skipped: ${bookmark.title} (insufficient data)`);
        stats.skipped++;
        return;
      }

      // Queue graph processing jobs using graphQueue manager
      await graphQueue.processBookmarkGraph(
        bookmark.id,
        bookmark.userId,
        bookmark.summary || bookmark.title, // Use summary or fall back to title
        bookmark.embedding, // Embedding from database
        bookmark.url
      );

      console.log(`   ✅ Queued: ${bookmark.title}`);
      stats.processed++;
    } catch (error) {
      console.error(`   ❌ Failed: ${bookmark.title} - ${error instanceof Error ? error.message : error}`);
      stats.failed++;
    }
  });

  await Promise.allSettled(promises);
}

/**
 * Print final report
 */
function printFinalReport() {
  const duration = (Date.now() - stats.startTime.getTime()) / 1000;
  const rate = stats.total / duration;

  console.log('\n' + '='.repeat(50));
  console.log('📊 Backfill Complete!');
  console.log('='.repeat(50));
  console.log(`Total bookmarks:     ${stats.total}`);
  console.log(`✅ Successfully queued: ${stats.processed}`);
  console.log(`❌ Failed:             ${stats.failed}`);
  console.log(`⏭️  Skipped:            ${stats.skipped}`);
  console.log(`⏱️  Duration:           ${duration.toFixed(1)}s`);
  console.log(`📈 Rate:               ${rate.toFixed(1)} bookmarks/sec`);
  console.log('='.repeat(50));

  if (stats.failed > 0) {
    console.log('\n⚠️  Some bookmarks failed to process. Check logs above for details.');
  }

  if (stats.processed > 0) {
    console.log('\n💡 Jobs are now queued. Monitor the graph workers to see processing progress.');
    console.log('   Use: docker logs -f smartbookmarks_graph_worker');
  }
}

// Run the backfill
backfillGraphData();
