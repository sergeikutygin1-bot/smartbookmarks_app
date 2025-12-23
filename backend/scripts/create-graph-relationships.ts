import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Entities to extract from our sample bookmarks
const entities = [
  { name: 'Facebook', type: 'company', bookmarkTitles: ['Introduction to React'] },
  { name: 'Meta', type: 'company', bookmarkTitles: ['Introduction to React'] },
  { name: 'Netflix', type: 'company', bookmarkTitles: ['Introduction to React', 'Async Programming in Node.js'] },
  { name: 'Airbnb', type: 'company', bookmarkTitles: ['Introduction to React'] },
  { name: 'Vercel', type: 'company', bookmarkTitles: ['Next.js Complete Guide'] },
  { name: 'TikTok', type: 'company', bookmarkTitles: ['Next.js Complete Guide'] },
  { name: 'Microsoft', type: 'company', bookmarkTitles: ['TypeScript Fundamentals'] },
  { name: 'Slack', type: 'company', bookmarkTitles: ['TypeScript Fundamentals'] },
  { name: 'OpenAI', type: 'company', bookmarkTitles: ['Vector Embeddings for AI', 'Building LLM Applications'] },
  { name: 'Instagram', type: 'company', bookmarkTitles: ['PostgreSQL Performance Optimization'] },
  { name: 'Spotify', type: 'company', bookmarkTitles: ['PostgreSQL Performance Optimization', 'Microservices with Docker'] },
  { name: 'Reddit', type: 'company', bookmarkTitles: ['PostgreSQL Performance Optimization'] },
  { name: 'Twitter', type: 'company', bookmarkTitles: ['Redis Caching Strategies'] },
  { name: 'GitHub', type: 'company', bookmarkTitles: ['Redis Caching Strategies'] },
  { name: 'React', type: 'technology', bookmarkTitles: ['Introduction to React', 'Next.js Complete Guide', 'React State Management with Zustand'] },
  { name: 'Next.js', type: 'technology', bookmarkTitles: ['Next.js Complete Guide', 'React State Management with Zustand'] },
  { name: 'TypeScript', type: 'technology', bookmarkTitles: ['TypeScript Fundamentals', 'React State Management with Zustand'] },
  { name: 'Node.js', type: 'technology', bookmarkTitles: ['Async Programming in Node.js', 'TypeScript Fundamentals'] },
  { name: 'PostgreSQL', type: 'technology', bookmarkTitles: ['PostgreSQL Performance Optimization', 'Vector Embeddings for AI'] },
  { name: 'Redis', type: 'technology', bookmarkTitles: ['Redis Caching Strategies'] },
  { name: 'Docker', type: 'technology', bookmarkTitles: ['Microservices with Docker'] },
  { name: 'LangChain', type: 'product', bookmarkTitles: ['Building LLM Applications'] },
  { name: 'GPT-4', type: 'product', bookmarkTitles: ['Building LLM Applications'] },
  { name: 'Redux', type: 'product', bookmarkTitles: ['Introduction to React', 'React State Management with Zustand'] },
  { name: 'Zustand', type: 'product', bookmarkTitles: ['React State Management with Zustand'] },
  { name: 'BullMQ', type: 'product', bookmarkTitles: ['Redis Caching Strategies'] },
];

// Concepts for our bookmarks
const concepts = [
  { name: 'Frontend Development', bookmarkTitles: ['Introduction to React', 'Next.js Complete Guide', 'TypeScript Fundamentals', 'React State Management with Zustand'] },
  { name: 'Backend Development', bookmarkTitles: ['Async Programming in Node.js', 'PostgreSQL Performance Optimization', 'Redis Caching Strategies', 'Microservices with Docker'] },
  { name: 'JavaScript Frameworks', bookmarkTitles: ['Introduction to React', 'Next.js Complete Guide', 'Async Programming in Node.js'] },
  { name: 'State Management', bookmarkTitles: ['Introduction to React', 'React State Management with Zustand'] },
  { name: 'Database Optimization', bookmarkTitles: ['PostgreSQL Performance Optimization', 'Redis Caching Strategies'] },
  { name: 'Artificial Intelligence', bookmarkTitles: ['Vector Embeddings for AI', 'Building LLM Applications'] },
  { name: 'Machine Learning', bookmarkTitles: ['Vector Embeddings for AI', 'Building LLM Applications'] },
  { name: 'Microservices Architecture', bookmarkTitles: ['Microservices with Docker', 'Redis Caching Strategies'] },
  { name: 'Performance Optimization', bookmarkTitles: ['PostgreSQL Performance Optimization', 'Redis Caching Strategies', 'Next.js Complete Guide'] },
  { name: 'Type Safety', bookmarkTitles: ['TypeScript Fundamentals', 'React State Management with Zustand'] },
];

async function createGraphRelationships() {
  try {
    console.log('🔗 Creating graph relationships...\n');

    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('❌ No user found');
      process.exit(1);
    }

    // Get all bookmarks
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: user.id },
    });

    console.log(`Found ${bookmarks.length} bookmarks\n`);

    // Create entities
    console.log('Creating entities...');
    for (const entity of entities) {
      const dbEntity = await prisma.entity.upsert({
        where: {
          userId_normalizedName_entityType: {
            userId: user.id,
            normalizedName: entity.name.toLowerCase(),
            entityType: entity.type,
          },
        },
        create: {
          userId: user.id,
          name: entity.name,
          normalizedName: entity.name.toLowerCase(),
          entityType: entity.type,
          occurrenceCount: entity.bookmarkTitles.length,
        },
        update: {
          occurrenceCount: entity.bookmarkTitles.length,
        },
      });

      // Create relationships to bookmarks
      for (const title of entity.bookmarkTitles) {
        const bookmark = bookmarks.find((b) => b.title === title);
        if (bookmark) {
          await prisma.relationship.upsert({
            where: {
              userId_sourceType_sourceId_targetType_targetId_relationshipType: {
                userId: user.id,
                sourceType: 'bookmark',
                sourceId: bookmark.id,
                targetType: 'entity',
                targetId: dbEntity.id,
                relationshipType: 'mentions',
              },
            },
            create: {
              userId: user.id,
              sourceType: 'bookmark',
              sourceId: bookmark.id,
              targetType: 'entity',
              targetId: dbEntity.id,
              relationshipType: 'mentions',
              weight: 0.8 + Math.random() * 0.2, // Random weight between 0.8-1.0
            },
            update: {},
          });
        }
      }
    }
    console.log(`✓ Created ${entities.length} entities\n`);

    // Create concepts
    console.log('Creating concepts...');
    for (const concept of concepts) {
      const dbConcept = await prisma.concept.upsert({
        where: {
          userId_normalizedName: {
            userId: user.id,
            normalizedName: concept.name.toLowerCase(),
          },
        },
        create: {
          userId: user.id,
          name: concept.name,
          normalizedName: concept.name.toLowerCase(),
          occurrenceCount: concept.bookmarkTitles.length,
        },
        update: {
          occurrenceCount: concept.bookmarkTitles.length,
        },
      });

      // Create relationships to bookmarks
      for (const title of concept.bookmarkTitles) {
        const bookmark = bookmarks.find((b) => b.title === title);
        if (bookmark) {
          await prisma.relationship.upsert({
            where: {
              userId_sourceType_sourceId_targetType_targetId_relationshipType: {
                userId: user.id,
                sourceType: 'bookmark',
                sourceId: bookmark.id,
                targetType: 'concept',
                targetId: dbConcept.id,
                relationshipType: 'about',
              },
            },
            create: {
              userId: user.id,
              sourceType: 'bookmark',
              sourceId: bookmark.id,
              targetType: 'concept',
              targetId: dbConcept.id,
              relationshipType: 'about',
              weight: 0.7 + Math.random() * 0.3, // Random weight between 0.7-1.0
            },
            update: {},
          });
        }
      }
    }
    console.log(`✓ Created ${concepts.length} concepts\n`);

    // Create similarity relationships between related bookmarks
    console.log('Creating similarity relationships...');
    const similarPairs = [
      ['Introduction to React', 'Next.js Complete Guide', 0.85],
      ['Introduction to React', 'React State Management with Zustand', 0.9],
      ['Next.js Complete Guide', 'React State Management with Zustand', 0.75],
      ['TypeScript Fundamentals', 'React State Management with Zustand', 0.7],
      ['Async Programming in Node.js', 'Microservices with Docker', 0.65],
      ['PostgreSQL Performance Optimization', 'Redis Caching Strategies', 0.8],
      ['Vector Embeddings for AI', 'Building LLM Applications', 0.95],
    ];

    for (const [title1, title2, weight] of similarPairs) {
      const bookmark1 = bookmarks.find((b) => b.title === title1);
      const bookmark2 = bookmarks.find((b) => b.title === title2);

      if (bookmark1 && bookmark2) {
        // Bidirectional similarity
        await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId: user.id,
              sourceType: 'bookmark',
              sourceId: bookmark1.id,
              targetType: 'bookmark',
              targetId: bookmark2.id,
              relationshipType: 'similar_to',
            },
          },
          create: {
            userId: user.id,
            sourceType: 'bookmark',
            sourceId: bookmark1.id,
            targetType: 'bookmark',
            targetId: bookmark2.id,
            relationshipType: 'similar_to',
            weight: weight as number,
          },
          update: {},
        });

        await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId: user.id,
              sourceType: 'bookmark',
              sourceId: bookmark2.id,
              targetType: 'bookmark',
              targetId: bookmark1.id,
              relationshipType: 'similar_to',
            },
          },
          create: {
            userId: user.id,
            sourceType: 'bookmark',
            sourceId: bookmark2.id,
            targetType: 'bookmark',
            targetId: bookmark1.id,
            relationshipType: 'similar_to',
            weight: weight as number,
          },
          update: {},
        });
      }
    }
    console.log(`✓ Created ${similarPairs.length * 2} similarity relationships\n`);

    // Final statistics
    const stats = await prisma.$transaction([
      prisma.bookmark.count({ where: { userId: user.id } }),
      prisma.entity.count({ where: { userId: user.id } }),
      prisma.concept.count({ where: { userId: user.id } }),
      prisma.relationship.count({ where: { userId: user.id } }),
    ]);

    console.log('✅ Graph created successfully!\n');
    console.log('📊 Final Statistics:');
    console.log(`   Bookmarks: ${stats[0]}`);
    console.log(`   Entities: ${stats[1]}`);
    console.log(`   Concepts: ${stats[2]}`);
    console.log(`   Relationships: ${stats[3]}`);
    console.log('\n🎉 Refresh your graph page to see the results!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createGraphRelationships();
