#!/usr/bin/env tsx

/**
 * Migration Script: Generate Embeddings for Existing Bookmarks
 *
 * This script:
 * 1. Loads all bookmarks from storage
 * 2. Identifies bookmarks without embeddings
 * 3. Calls the enrichment backend to generate embeddings
 * 4. Updates bookmarks with the new embeddings
 *
 * Usage: npm run migrate:embeddings
 */

import { loadBookmarksServer, saveBookmarksServer } from '../lib/server-storage';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';

interface ProgressStats {
  total: number;
  withEmbeddings: number;
  needsEmbedding: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

async function enrichBookmark(bookmarkId: string, url: string, existingTags: string[]) {
  try {
    const response = await fetch(`${BACKEND_URL}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, existingTags }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      `Failed to enrich bookmark ${bookmarkId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function migrateEmbeddings() {
  console.log('\n' + '='.repeat(60));
  console.log('📦 Bookmark Embedding Migration');
  console.log('='.repeat(60) + '\n');

  // Load all bookmarks
  console.log('📂 Loading bookmarks from storage...');
  const bookmarks = loadBookmarksServer();

  const stats: ProgressStats = {
    total: bookmarks.length,
    withEmbeddings: 0,
    needsEmbedding: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  // Analyze current state
  bookmarks.forEach((bookmark) => {
    if (bookmark.embedding && bookmark.embedding.length > 0) {
      stats.withEmbeddings++;
    } else {
      stats.needsEmbedding++;
    }
  });

  console.log(`✅ Loaded ${stats.total} bookmarks`);
  console.log(`   - With embeddings: ${stats.withEmbeddings}`);
  console.log(`   - Need embeddings: ${stats.needsEmbedding}\n`);

  if (stats.needsEmbedding === 0) {
    console.log('🎉 All bookmarks already have embeddings!');
    console.log('='.repeat(60) + '\n');
    return;
  }

  // Confirm migration
  console.log(`⚠️  This will enrich ${stats.needsEmbedding} bookmarks.`);
  console.log(`   This may take a few minutes and use OpenAI API credits.`);
  console.log(`   Backend URL: ${BACKEND_URL}\n`);

  // Get all unique tags for consistency
  const allTags = Array.from(new Set(bookmarks.flatMap((b) => b.tags)));

  // Process bookmarks that need embeddings
  console.log('🔄 Starting enrichment process...\n');

  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i];

    // Skip if already has embedding
    if (bookmark.embedding && bookmark.embedding.length > 0) {
      stats.skipped++;
      continue;
    }

    stats.processed++;
    const progress = `[${stats.processed}/${stats.needsEmbedding}]`;

    try {
      console.log(`${progress} Processing: ${bookmark.title.substring(0, 60)}...`);
      console.log(`          URL: ${bookmark.url}`);

      // Call enrichment backend
      const enrichmentData = await enrichBookmark(bookmark.id, bookmark.url, allTags);

      // Update bookmark with embedding
      if (enrichmentData.embedding && enrichmentData.embedding.length > 0) {
        bookmarks[i] = {
          ...bookmark,
          title: enrichmentData.title || bookmark.title,
          domain: enrichmentData.domain || bookmark.domain,
          contentType: enrichmentData.contentType || bookmark.contentType,
          summary: enrichmentData.analysis?.summary || bookmark.summary,
          tags: enrichmentData.tagging?.tags || bookmark.tags,
          embedding: enrichmentData.embedding,
          embeddedAt: new Date(enrichmentData.embeddedAt),
          updatedAt: new Date(),
        };

        console.log(`          ✅ Generated ${enrichmentData.embedding.length}-dim embedding`);
        stats.succeeded++;
      } else {
        console.log(`          ⚠️  No embedding returned (may have been skipped)`);
        stats.failed++;
      }
    } catch (error) {
      console.error(`          ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      stats.failed++;
    }

    console.log(''); // Empty line for readability

    // Save progress every 5 bookmarks
    if (stats.processed % 5 === 0) {
      console.log('💾 Saving progress...\n');
      await saveBookmarksServer(bookmarks);
    }
  }

  // Final save
  console.log('💾 Saving final results...');
  await saveBookmarksServer(bookmarks);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total bookmarks:       ${stats.total}`);
  console.log(`Already had embeddings: ${stats.withEmbeddings}`);
  console.log(`Needed embeddings:     ${stats.needsEmbedding}`);
  console.log(`Successfully enriched: ${stats.succeeded}`);
  console.log(`Failed:                ${stats.failed}`);
  console.log(`Skipped:               ${stats.skipped}`);
  console.log('='.repeat(60));

  if (stats.failed > 0) {
    console.log(`\n⚠️  ${stats.failed} bookmark(s) failed to generate embeddings.`);
    console.log('   You can re-run this script to retry failed bookmarks.');
  } else {
    console.log('\n✨ Migration completed successfully!');
  }

  console.log('='.repeat(60) + '\n');
}

// Run migration
migrateEmbeddings().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
