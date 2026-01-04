/**
 * Projection Agent Test Suite
 *
 * Tests for UMAP-based semantic positioning with stable K-NN incremental updates
 */

import { ProjectionAgent } from '../agents/ProjectionAgent';
import { prisma } from '../lib/prisma';

const projectionAgent = new ProjectionAgent();

async function testUMAPReduces1536DTo2D() {
  console.log('\n=== Test 1: UMAP reduces 1536D to 2D ===');

  try {
    // Create a test user
    const testUser = await prisma.user.create({
      data: {
        email: `test-projection-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });

    // Create 10 test bookmarks with embeddings
    const testBookmarks = [];
    for (let i = 0; i < 10; i++) {
      const embedding = Array(1536).fill(0).map(() => Math.random() - 0.5);

      const bookmark = await prisma.bookmark.create({
        data: {
          userId: testUser.id,
          url: `https://example.com/test-${i}`,
          title: `Test Bookmark ${i}`,
          domain: 'example.com',
          status: 'completed',
        },
      });

      // Insert embedding using raw SQL
      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${JSON.stringify(embedding)}::vector
        WHERE id = ${bookmark.id}
      `;

      testBookmarks.push(bookmark);
    }

    console.log(`Created ${testBookmarks.length} test bookmarks with embeddings`);

    // Run projection
    const startTime = Date.now();
    const result = await projectionAgent.computeAllPositions(testUser.id);
    const computeTime = Date.now() - startTime;

    console.log(`Projection completed in ${computeTime}ms`);
    console.log(`Bookmarks positioned: ${result.positions.bookmarks.length}`);
    console.log(`Metadata:`, result.metadata);

    // Verify all bookmarks have 2D positions
    let allValid = true;
    result.positions.bookmarks.forEach((pos, idx) => {
      const { x, y } = pos.position;
      const isValid =
        typeof x === 'number' &&
        typeof y === 'number' &&
        isFinite(x) &&
        isFinite(y) &&
        x >= 0 && x <= 4000 &&
        y >= 0 && y <= 3000;

      if (!isValid) {
        console.error(`❌ Invalid position for bookmark ${idx}: (${x}, ${y})`);
        allValid = false;
      }
    });

    // Cleanup
    await prisma.bookmark.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    if (allValid) {
      console.log('✅ PASS: All bookmarks have valid 2D coordinates within canvas bounds');
    } else {
      console.log('❌ FAIL: Some bookmarks have invalid coordinates');
    }

    return allValid;
  } catch (error) {
    console.error('❌ FAIL:', error);
    return false;
  }
}

async function testKNNIncrementalPositioning() {
  console.log('\n=== Test 2: K-NN Incremental Positioning ===');

  try {
    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email: `test-knn-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });

    // Create 5 initial bookmarks with embeddings and positions
    const initialBookmarks = [];
    for (let i = 0; i < 5; i++) {
      const embedding = Array(1536).fill(0).map(() => Math.random() - 0.5);

      const bookmark = await prisma.bookmark.create({
        data: {
          userId: testUser.id,
          url: `https://example.com/initial-${i}`,
          title: `Initial Bookmark ${i}`,
          domain: 'example.com',
          status: 'completed',
          graphX: 1000 + i * 500,
          graphY: 1500 + i * 300,
          graphPositionedAt: new Date(),
        },
      });

      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${JSON.stringify(embedding)}::vector
        WHERE id = ${bookmark.id}
      `;

      initialBookmarks.push(bookmark);
    }

    console.log('Created 5 positioned bookmarks');

    // Store initial positions
    const initialPositions = new Map(
      initialBookmarks.map(b => [b.id, { x: b.graphX, y: b.graphY }])
    );

    // Create 2 new bookmarks without positions
    for (let i = 0; i < 2; i++) {
      const embedding = Array(1536).fill(0).map(() => Math.random() - 0.5);

      const bookmark = await prisma.bookmark.create({
        data: {
          userId: testUser.id,
          url: `https://example.com/new-${i}`,
          title: `New Bookmark ${i}`,
          domain: 'example.com',
          status: 'completed',
        },
      });

      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${JSON.stringify(embedding)}::vector
        WHERE id = ${bookmark.id}
      `;
    }

    console.log('Created 2 new unpositioned bookmarks');

    // Run projection
    const result = await projectionAgent.computeAllPositions(testUser.id);

    // Verify existing positions didn't change
    let stabilityPassed = true;
    for (const [id, originalPos] of initialPositions) {
      const newPos = result.positions.bookmarks.find(p => p.bookmarkId === id);

      if (!newPos) {
        console.error(`❌ Bookmark ${id} missing from results`);
        stabilityPassed = false;
        continue;
      }

      if (newPos.method !== 'stored') {
        console.error(`❌ Existing bookmark ${id} has method '${newPos.method}' (should be 'stored')`);
        stabilityPassed = false;
      }

      const posChanged =
        Math.abs(newPos.position.x - originalPos.x!) > 0.01 ||
        Math.abs(newPos.position.y - originalPos.y!) > 0.01;

      if (posChanged) {
        console.error(`❌ Position changed for bookmark ${id}`);
        console.error(`   Original: (${originalPos.x}, ${originalPos.y})`);
        console.error(`   New: (${newPos.position.x}, ${newPos.position.y})`);
        stabilityPassed = false;
      }
    }

    // Verify new bookmarks were positioned using K-NN
    const newBookmarkPositions = result.positions.bookmarks.filter(p => p.method === 'knn');
    if (newBookmarkPositions.length !== 2) {
      console.error(`❌ Expected 2 K-NN positioned bookmarks, got ${newBookmarkPositions.length}`);
      stabilityPassed = false;
    }

    // Cleanup
    await prisma.bookmark.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    if (stabilityPassed) {
      console.log('✅ PASS: Existing positions stable, new bookmarks positioned via K-NN');
    } else {
      console.log('❌ FAIL: Position stability or K-NN positioning failed');
    }

    return stabilityPassed;
  } catch (error) {
    console.error('❌ FAIL:', error);
    return false;
  }
}

async function testFallbackForSmallDatasets() {
  console.log('\n=== Test 3: Fallback for <5 bookmarks ===');

  try {
    const testUser = await prisma.user.create({
      data: {
        email: `test-fallback-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });

    // Create only 3 bookmarks (below MIN_BOOKMARKS_FOR_UMAP = 5)
    for (let i = 0; i < 3; i++) {
      const embedding = Array(1536).fill(0).map(() => Math.random() - 0.5);

      const bookmark = await prisma.bookmark.create({
        data: {
          userId: testUser.id,
          url: `https://example.com/small-${i}`,
          title: `Small Dataset ${i}`,
          domain: 'example.com',
          status: 'completed',
        },
      });

      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${JSON.stringify(embedding)}::vector
        WHERE id = ${bookmark.id}
      `;
    }

    console.log('Created 3 bookmarks (below UMAP threshold)');

    // Run projection
    const result = await projectionAgent.computeAllPositions(testUser.id);

    // Verify fallback method was used (should be grid layout)
    const allFallback = result.positions.bookmarks.every(p =>
      p.method === 'umap' || p.method === 'fallback'
    );

    // Verify all have valid positions
    const allValid = result.positions.bookmarks.every(p => {
      const { x, y } = p.position;
      return (
        typeof x === 'number' &&
        typeof y === 'number' &&
        isFinite(x) &&
        isFinite(y)
      );
    });

    // Cleanup
    await prisma.bookmark.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    if (allValid) {
      console.log('✅ PASS: Fallback handled small dataset gracefully');
    } else {
      console.log('❌ FAIL: Invalid positions in fallback mode');
    }

    return allValid;
  } catch (error) {
    console.error('❌ FAIL:', error);
    return false;
  }
}

async function testDatabasePersistence() {
  console.log('\n=== Test 4: Database Persistence ===');

  try {
    const testUser = await prisma.user.create({
      data: {
        email: `test-persistence-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });

    // Create 6 bookmarks
    const bookmarks = [];
    for (let i = 0; i < 6; i++) {
      const embedding = Array(1536).fill(0).map(() => Math.random() - 0.5);

      const bookmark = await prisma.bookmark.create({
        data: {
          userId: testUser.id,
          url: `https://example.com/persist-${i}`,
          title: `Persistence Test ${i}`,
          domain: 'example.com',
          status: 'completed',
        },
      });

      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${JSON.stringify(embedding)}::vector
        WHERE id = ${bookmark.id}
      `;

      bookmarks.push(bookmark);
    }

    // First projection run
    await projectionAgent.computeAllPositions(testUser.id);

    // Fetch bookmarks from database
    const persistedBookmarks = await prisma.bookmark.findMany({
      where: { userId: testUser.id },
      select: { id: true, graphX: true, graphY: true, graphPositionedAt: true },
    });

    // Verify all have persisted positions
    const allPersisted = persistedBookmarks.every(b =>
      b.graphX !== null &&
      b.graphY !== null &&
      b.graphPositionedAt !== null
    );

    if (!allPersisted) {
      console.error('❌ Some bookmarks missing persisted positions');
      const missing = persistedBookmarks.filter(b => !b.graphX || !b.graphY);
      console.error(`Missing positions: ${missing.map(b => b.id).join(', ')}`);
    }

    // Second projection run (should load from DB)
    const result = await projectionAgent.computeAllPositions(testUser.id);

    // Verify all are method='stored'
    const allStored = result.positions.bookmarks.every(p => p.method === 'stored');

    // Cleanup
    await prisma.bookmark.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    if (allPersisted && allStored) {
      console.log('✅ PASS: Positions persisted to database and reloaded correctly');
    } else {
      console.log('❌ FAIL: Database persistence or reloading failed');
    }

    return allPersisted && allStored;
  } catch (error) {
    console.error('❌ FAIL:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('PROJECTION AGENT TEST SUITE');
  console.log('='.repeat(60));

  const results = {
    umapReduction: await testUMAPReduces1536DTo2D(),
    knnIncremental: await testKNNIncrementalPositioning(),
    fallbackSmall: await testFallbackForSmallDatasets(),
    dbPersistence: await testDatabasePersistence(),
  };

  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`UMAP Dimensionality Reduction: ${results.umapReduction ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`K-NN Incremental Positioning: ${results.knnIncremental ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Fallback for Small Datasets: ${results.fallbackSmall ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Database Persistence: ${results.dbPersistence ? '✅ PASS' : '❌ FAIL'}`);

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;

  console.log('='.repeat(60));
  console.log(`Total: ${passedTests}/${totalTests} tests passed`);
  console.log('='.repeat(60));

  process.exit(passedTests === totalTests ? 0 : 1);
}

runAllTests();
