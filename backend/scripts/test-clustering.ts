import { PrismaClient } from '@prisma/client';
import { clusterGeneratorAgent } from '../src/agents/ClusterGeneratorAgent';

const prisma = new PrismaClient();

async function testClustering() {
  try {
    console.log('🧪 Testing Cluster Generator Agent...\n');

    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('❌ No user found');
      process.exit(1);
    }

    console.log(`✓ Using user: ${user.email}\n`);

    // Check bookmark count using raw SQL
    const bookmarkCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM bookmarks
      WHERE user_id = ${user.id}
        AND embedding IS NOT NULL
        AND status = 'completed'
    `;
    const bookmarkCount = Number(bookmarkCountResult[0].count);

    console.log(`📚 Found ${bookmarkCount} bookmarks with embeddings\n`);

    if (bookmarkCount < 6) {
      console.warn('⚠️  Not enough bookmarks to generate meaningful clusters (need at least 6)');
      console.log('💡 Run create-synthetic-bookmarks.ts first to create test data');
      process.exit(0);
    }

    // Generate clusters
    console.log('🔮 Generating clusters...');
    await clusterGeneratorAgent.generateClusters(user.id, 3);

    // Fetch and display results
    const clusters = await prisma.cluster.findMany({
      where: { userId: user.id },
      include: {
        bookmarks: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { coherenceScore: 'desc' },
    });

    console.log(`\n✅ Generated ${clusters.length} clusters:\n`);

    clusters.forEach((cluster, idx) => {
      console.log(`${idx + 1}. ${cluster.name}`);
      console.log(`   ${cluster.description}`);
      console.log(`   📊 Coherence: ${((cluster.coherenceScore || 0) * 100).toFixed(0)}%`);
      console.log(`   📚 ${cluster.bookmarks.length} bookmarks:`);
      cluster.bookmarks.forEach((bookmark) => {
        console.log(`      • ${bookmark.title}`);
      });
      console.log('');
    });

    console.log('🎉 Cluster generation complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testClustering();
