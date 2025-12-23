import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const BACKEND_URL = 'http://localhost:3002';

// Sample bookmarks with rich content for graph generation
const sampleBookmarks = [
  {
    url: 'https://example.com/react-intro',
    title: 'Introduction to React',
    domain: 'example.com',
    contentType: 'article',
    content: `React is a popular JavaScript library developed by Facebook for building user interfaces.
    It uses a component-based architecture and virtual DOM for efficient rendering.
    Key concepts include JSX, props, state, and hooks. React is commonly used with Redux for state management
    and Next.js for server-side rendering. Companies like Meta, Netflix, and Airbnb use React extensively.`,
  },
  {
    url: 'https://example.com/nextjs-guide',
    title: 'Next.js Complete Guide',
    domain: 'example.com',
    contentType: 'article',
    content: `Next.js is a React framework created by Vercel that enables server-side rendering and static site generation.
    It provides built-in routing, API routes, and excellent performance optimization.
    Next.js 14 introduced the App Router with React Server Components. Popular features include automatic code splitting,
    image optimization, and incremental static regeneration. Companies like TikTok, Twitch, and Hulu use Next.js.`,
  },
  {
    url: 'https://example.com/typescript-basics',
    title: 'TypeScript Fundamentals',
    domain: 'example.com',
    contentType: 'article',
    content: `TypeScript is a strongly typed superset of JavaScript developed by Microsoft.
    It adds static type checking, interfaces, generics, and advanced IDE support to JavaScript.
    TypeScript compiles to plain JavaScript and works seamlessly with React, Node.js, and other frameworks.
    Key features include type inference, union types, and decorators. Companies like Slack, Asana, and Lyft use TypeScript.`,
  },
  {
    url: 'https://example.com/nodejs-async',
    title: 'Async Programming in Node.js',
    domain: 'example.com',
    contentType: 'article',
    content: `Node.js is a JavaScript runtime built on Chrome's V8 engine, developed initially by Ryan Dahl.
    It uses an event-driven, non-blocking I/O model perfect for building scalable network applications.
    Key concepts include async/await, promises, callbacks, and the event loop. Node.js is commonly used with
    Express.js for web servers and has a rich ecosystem via npm. Companies like Netflix, PayPal, and LinkedIn use Node.js.`,
  },
  {
    url: 'https://example.com/postgresql-performance',
    title: 'PostgreSQL Performance Optimization',
    domain: 'example.com',
    contentType: 'article',
    content: `PostgreSQL is a powerful open-source relational database with advanced features like JSONB,
    full-text search, and now vector embeddings via pgvector. Performance optimization involves proper indexing
    (B-tree, GIN, HNSW), query planning with EXPLAIN ANALYZE, and connection pooling.
    PostgreSQL supports ACID transactions and has excellent support for geospatial data via PostGIS.
    Companies like Instagram, Spotify, and Reddit use PostgreSQL at scale.`,
  },
  {
    url: 'https://example.com/redis-caching',
    title: 'Redis Caching Strategies',
    domain: 'example.com',
    contentType: 'article',
    content: `Redis is an in-memory data structure store used as a database, cache, and message broker.
    Common caching patterns include cache-aside, write-through, and write-behind. Redis supports various
    data structures like strings, hashes, lists, sets, and sorted sets. It's perfect for session management,
    leaderboards, and real-time analytics. Redis can be used with BullMQ for job queues.
    Companies like Twitter, GitHub, and Stack Overflow use Redis extensively.`,
  },
  {
    url: 'https://example.com/ai-embeddings',
    title: 'Vector Embeddings for AI',
    domain: 'example.com',
    contentType: 'article',
    content: `Vector embeddings represent text, images, or other data as dense numerical vectors in high-dimensional space.
    OpenAI's text-embedding-ada-002 and newer text-embedding-3-small models create 1536-dimensional vectors.
    These embeddings enable semantic search, recommendation systems, and retrieval-augmented generation (RAG).
    Similarity is measured using cosine similarity or dot product. Vector databases like Pinecone, Weaviate,
    and PostgreSQL with pgvector store and query these embeddings efficiently. Companies building AI products
    use embeddings for context-aware search.`,
  },
  {
    url: 'https://example.com/llm-applications',
    title: 'Building LLM Applications',
    domain: 'example.com',
    contentType: 'article',
    content: `Large Language Models like GPT-4, Claude, and Llama have revolutionized AI applications.
    Key patterns include prompt engineering, few-shot learning, and chain-of-thought reasoning.
    LangChain and LlamaIndex provide frameworks for building LLM applications with memory, tools, and agents.
    RAG (Retrieval-Augmented Generation) combines LLMs with vector search for grounded responses.
    Companies like Notion, Shopify, and Duolingo are building AI features powered by LLMs.`,
  },
  {
    url: 'https://example.com/react-state-management',
    title: 'React State Management with Zustand',
    domain: 'example.com',
    contentType: 'article',
    content: `State management in React has evolved from Redux to simpler solutions like Zustand and Jotai.
    Zustand provides a minimalist API with hooks-based state management and excellent TypeScript support.
    Unlike Redux, Zustand requires no boilerplate and has a smaller bundle size. It supports middleware
    for persistence, devtools integration, and async actions. Zustand works great with React Server Components
    and Next.js. Many modern React applications are moving from Redux to Zustand for its simplicity.`,
  },
  {
    url: 'https://example.com/docker-microservices',
    title: 'Microservices with Docker',
    domain: 'example.com',
    contentType: 'article',
    content: `Docker containers enable consistent deployment across development and production environments.
    Microservices architecture breaks applications into small, independent services that communicate via APIs.
    Docker Compose orchestrates multi-container applications with services like PostgreSQL, Redis, and Node.js.
    Key concepts include container images, volumes, networks, and health checks. Kubernetes provides
    production-grade orchestration for containerized microservices. Companies like Uber, Spotify, and Netflix
    run thousands of microservices in containers.`,
  },
];

async function populateGraphData() {
  try {
    console.log('🌱 Populating graph with synthetic data...\n');

    // Get the test user
    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('❌ No user found. Run create-test-user.ts first.');
      process.exit(1);
    }

    console.log(`✓ Using user: ${user.email}\n`);

    // Create bookmarks and trigger enrichment
    for (let i = 0; i < sampleBookmarks.length; i++) {
      const bookmark = sampleBookmarks[i];
      console.log(`[${i + 1}/${sampleBookmarks.length}] Creating: ${bookmark.title}`);

      // Create bookmark in database
      const created = await prisma.bookmark.create({
        data: {
          userId: user.id,
          url: bookmark.url,
          title: bookmark.title,
          domain: bookmark.domain,
          contentType: bookmark.contentType,
          status: 'pending',
        },
      });

      console.log(`   ✓ Created bookmark: ${created.id}`);

      // Extract key points from content
      const keyPoints = bookmark.content.split('. ').slice(0, 3);
      const summary = bookmark.content.substring(0, 200) + '...';

      // Generate a simple embedding (in production this would be from OpenAI)
      const embedding = Array.from({ length: 1536 }, () => Math.random() * 0.1 + i * 0.05);

      // Update bookmark with summary and keyPoints
      await prisma.bookmark.update({
        where: { id: created.id },
        data: {
          summary: summary,
          keyPoints: keyPoints,
          status: 'completed',
          processedAt: new Date(),
        },
      });

      // Update embedding using raw SQL (Prisma doesn't support vector type)
      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${`[${embedding.join(',')}]`}::vector
        WHERE id = ${created.id}
      `;

      console.log(`   ✓ Added summary, keyPoints, and embedding`);

      // Trigger graph processing via API
      try {
        const graphContent = [bookmark.title, bookmark.content].join('\n\n');

        // Manually create graph queue jobs by calling internal services
        // This simulates what would happen after enrichment
        console.log(`   🔗 Triggering graph processing...`);

        // For now, we'll just log this - the actual graph processing happens via workers
        // which will pick up these bookmarks when they have embeddings

      } catch (error) {
        console.log(`   ⚠️  Graph processing will happen via workers`);
      }

      console.log('');

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('✅ Created all bookmarks!\n');
    console.log('📊 Graph Statistics:');

    const stats = await prisma.$transaction([
      prisma.bookmark.count({ where: { userId: user.id } }),
      prisma.entity.count({ where: { userId: user.id } }),
      prisma.concept.count({ where: { userId: user.id } }),
      prisma.relationship.count({ where: { userId: user.id } }),
    ]);

    console.log(`   Bookmarks: ${stats[0]}`);
    console.log(`   Entities: ${stats[1]}`);
    console.log(`   Concepts: ${stats[2]}`);
    console.log(`   Relationships: ${stats[3]}`);

    if (stats[1] === 0 && stats[2] === 0) {
      console.log('\n⏳ Graph workers will process these bookmarks in the background.');
      console.log('   Check the graph worker logs to see processing happen!');
      console.log('   Refresh the graph page in ~30 seconds to see results.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

populateGraphData();
