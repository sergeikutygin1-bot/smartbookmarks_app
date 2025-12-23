import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Define synthetic clusters based on our existing bookmarks
const syntheticClusters = [
  {
    name: 'Frontend Development',
    description: 'Modern web frontend technologies including React, Next.js, and TypeScript',
    bookmarkTitles: [
      'Introduction to React',
      'Next.js Complete Guide',
      'TypeScript Fundamentals',
      'React State Management with Zustand',
    ],
    coherenceScore: 0.92,
  },
  {
    name: 'Backend & Infrastructure',
    description: 'Server-side development with Node.js, databases, and containerization',
    bookmarkTitles: [
      'Async Programming in Node.js',
      'PostgreSQL Performance Optimization',
      'Redis Caching Strategies',
      'Microservices with Docker',
    ],
    coherenceScore: 0.88,
  },
  {
    name: 'Artificial Intelligence',
    description: 'AI/ML applications, embeddings, and language models',
    bookmarkTitles: [
      'Vector Embeddings for AI',
      'Building LLM Applications',
    ],
    coherenceScore: 0.95,
  },
];

async function createSyntheticClusters() {
  try {
    console.log('🎨 Creating synthetic clusters...\\n');

    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('❌ No user found');
      process.exit(1);
    }

    // Get all bookmarks
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: user.id },
    });

    console.log(`Found ${bookmarks.length} bookmarks\\n`);

    let totalCreated = 0;

    for (const clusterData of syntheticClusters) {
      console.log(`Creating cluster: ${clusterData.name}`);

      // Find matching bookmarks
      const matchingBookmarks = bookmarks.filter((b) =>
        clusterData.bookmarkTitles.includes(b.title)
      );

      if (matchingBookmarks.length === 0) {
        console.log(`  ⚠️  No bookmarks found for this cluster, skipping\\n`);
        continue;
      }

      // Calculate centroid embedding (average of all bookmark embeddings)
      // For now, we'll use a placeholder since we can't easily query vector fields with Prisma
      const centroidEmbedding = Array.from({ length: 1536 }, () => Math.random());

      // Create cluster
      const cluster = await prisma.cluster.create({
        data: {
          userId: user.id,
          name: clusterData.name,
          description: clusterData.description,
          coherenceScore: clusterData.coherenceScore,
          bookmarkCount: matchingBookmarks.length,
        },
      });

      // Update centroid using raw SQL
      await prisma.$executeRaw`
        UPDATE clusters
        SET centroid_embedding = ${`[${centroidEmbedding.join(',')}]`}::vector
        WHERE id = ${cluster.id}
      `;

      // Assign bookmarks to cluster
      for (const bookmark of matchingBookmarks) {
        await prisma.bookmark.update({
          where: { id: bookmark.id },
          data: { clusterId: cluster.id },
        });

        // Create relationship
        await prisma.relationship.create({
          data: {
            userId: user.id,
            sourceType: 'bookmark',
            sourceId: bookmark.id,
            targetType: 'cluster',
            targetId: cluster.id,
            relationshipType: 'belongs_to_cluster',
            weight: 0.8 + Math.random() * 0.2, // Random weight 0.8-1.0
          },
        });
      }

      console.log(`  ✓ Created cluster with ${matchingBookmarks.length} bookmarks`);
      console.log(`  ✓ Coherence score: ${clusterData.coherenceScore}\\n`);
      totalCreated++;
    }

    // Final statistics
    const stats = await prisma.$transaction([
      prisma.cluster.count({ where: { userId: user.id } }),
      prisma.bookmark.count({
        where: { userId: user.id, clusterId: { not: null } },
      }),
    ]);

    console.log('✅ Cluster creation complete!\\n');
    console.log('📊 Final Statistics:');
    console.log(`   Total Clusters: ${stats[0]}`);
    console.log(`   Clustered Bookmarks: ${stats[1]}/${bookmarks.length}`);
    console.log(
      `   Unclustered Bookmarks: ${bookmarks.length - stats[1]}`
    );
    console.log('\\n🎉 Refresh the Clusters view to see the results!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createSyntheticClusters();
