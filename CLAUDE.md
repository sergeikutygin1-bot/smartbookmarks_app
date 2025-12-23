# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Bookmark is an AI-powered universal content capture and organization application with an advanced knowledge graph feature. Users can save content by pasting URLs, and the app automatically extracts metadata, generates summaries, assigns tags, creates embeddings for semantic search, and builds a knowledge graph showing relationships between bookmarks, concepts, and entities.

**Current Status:** Phase 4 complete. Core features implemented including enrichment pipeline, knowledge graph with 4 view modes, AI agents, and production-ready infrastructure. All services run in Docker containers.

## Architecture

### Three-Tier System

1. **Frontend (Next.js 14)** - React Flow-based graph visualization with 4 view modes
2. **Backend (Node.js/Express)** - RESTful API with agentic AI processing
3. **Data Layer** - PostgreSQL with pgvector + Redis for caching/queues

### Knowledge Graph Architecture

**5 Core Node Types:**
- **Bookmarks** - User-saved content
- **Concepts** - Abstract topics (e.g., "Machine Learning")
- **Entities** - Named entities (people, companies, technologies)
- **Tags** - User-created labels
- **Clusters** - Auto-generated bookmark groups

**7 Relationship Types:**
- `similar_to` (Bookmark → Bookmark) - Cosine similarity
- `mentions` (Bookmark → Entity) - TF-IDF relevance
- `about` (Bookmark → Concept) - LLM confidence
- `has_tag` (Bookmark → Tag) - User-applied
- `belongs_to_cluster` (Bookmark → Cluster) - Distance from centroid
- `related_to` (Concept → Concept) - Co-occurrence
- `entity_in_concept` (Entity → Concept) - Contextual relevance

### Agentic Processing Pipeline

**Enrichment Agents** (real-time, per bookmark):
- **Extractor Agent** - Fetches and parses content from URLs
- **Analyzer Agent** - Generates summaries via GPT
- **Tagger Agent** - Suggests tags using LLM
- **Embedder Agent** - Creates vector embeddings

**Graph Agents** (real-time, per bookmark):
- **Entity Extractor Agent** - Extracts named entities (hybrid spaCy + GPT)
- **Concept Analyzer Agent** - Identifies abstract topics
- **Similarity Computer** - Finds similar bookmarks via pgvector

**Batch Agents** (scheduled, per user):
- **Cluster Generator Agent** - Groups bookmarks using K-means clustering
- **Insight Engine Agent** - Generates 4 types of insights (trending, gaps, connections, recommendations)

## Development Commands

### Docker Infrastructure (Primary Development Method)

All services run in Docker. **Never run services directly on host.**

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
docker logs -f smartbookmarks_backend
docker logs -f smartbookmarks_graph_worker

# Restart specific services
docker-compose restart backend-api
docker-compose restart graph-worker

# Stop all services
docker-compose down
```

### Backend Commands (via Docker)

```bash
# Development server (auto-restart on file changes)
# Already running via docker-compose, no manual start needed

# Run backfill (process existing bookmarks through graph pipeline)
docker exec smartbookmarks_backend npm run backfill
docker exec smartbookmarks_backend npm run backfill -- --limit 100
docker exec smartbookmarks_backend npm run backfill -- --user-id <uuid>

# Performance analysis
docker exec smartbookmarks_backend npm run analyze-performance

# Testing
docker exec smartbookmarks_backend npm run test:vector
docker exec smartbookmarks_backend npm run test:db-performance
docker exec smartbookmarks_backend npm run test:cache

# Database migrations
docker exec smartbookmarks_backend npx prisma migrate dev
docker exec smartbookmarks_backend npx prisma generate

# Access PostgreSQL
docker exec -it smartbookmarks_db psql -U smartbookmarks -d smartbookmarks

# Clear Redis cache
docker exec smartbookmarks_redis redis-cli FLUSHALL
```

### Frontend Commands

```bash
# Development server runs automatically via docker-compose
# Access at http://localhost:3000

# Build production
docker exec smartbookmarks_frontend npm run build
```

### Database Scripts

```bash
# Test scripts (run from backend container)
docker exec smartbookmarks_backend npx tsx scripts/test-insights.ts
docker exec smartbookmarks_backend npx tsx scripts/test-clustering.ts
docker exec smartbookmarks_backend npx tsx scripts/create-synthetic-clusters.ts
docker exec smartbookmarks_backend npx tsx scripts/populate-graph-data.ts
```

## Project Structure

```
smart_bookmarks_v2/
├── frontend/
│   ├── app/
│   │   ├── graph/page.tsx              # Knowledge graph page with 4 view modes
│   │   └── bookmarks/                  # Bookmark management pages
│   ├── components/
│   │   ├── graph/                      # Graph visualization components
│   │   │   ├── GraphView/              # React Flow canvas with custom nodes
│   │   │   ├── ClusterView/            # Auto-generated topic clusters
│   │   │   ├── InsightsView/           # AI-powered insights dashboard
│   │   │   └── DiscoveryMode/          # Breadcrumb-based exploration
│   │   └── bookmarks/                  # Bookmark UI components
│   ├── hooks/
│   │   └── graph/useGraphData.ts       # Graph data fetching hook
│   └── store/
│       └── graphStore.ts               # Zustand store for graph UI state
│
├── backend/
│   ├── src/
│   │   ├── agents/                     # AI processing agents
│   │   │   ├── EntityExtractorAgent.ts
│   │   │   ├── ConceptAnalyzerAgent.ts
│   │   │   ├── ClusterGeneratorAgent.ts
│   │   │   └── InsightEngineAgent.ts
│   │   ├── routes/
│   │   │   ├── bookmarks.ts
│   │   │   ├── auth.ts
│   │   │   └── graph.ts                # 10 graph API endpoints
│   │   ├── services/
│   │   │   ├── graphService.ts         # Graph query logic
│   │   │   └── graphCache.ts           # Redis caching layer
│   │   ├── queues/
│   │   │   ├── enrichmentQueue.ts      # Enrichment job queue
│   │   │   └── graphQueue.ts           # Graph processing queues (5 queues)
│   │   ├── workers/
│   │   │   ├── enrichmentWorker.ts     # Processes enrichment jobs
│   │   │   └── graphWorker.ts          # Processes graph jobs
│   │   └── middleware/
│   │       └── auth.ts                 # JWT authentication
│   ├── scripts/
│   │   ├── backfill-graph-data.ts      # Backfill existing bookmarks
│   │   ├── analyze-query-performance.ts # Query performance analysis
│   │   ├── test-insights.ts
│   │   └── test-clustering.ts
│   └── prisma/
│       └── schema.prisma               # Database schema with 13 tables
│
├── docs/                                # Comprehensive documentation
├── docker-compose.yml                   # 6 services: frontend, backend, workers (2), postgres, redis
├── PHASE_4_SUMMARY.md                   # Phase 4 completion report
└── CLAUDE.md                            # This file
```

## Database Schema

### Core Tables

**bookmarks** - User-saved content with embeddings
- `embedding` (VECTOR(1536)) - For semantic search (HNSW index)
- `search_vector` (TSVECTOR) - For full-text search (GIN index)
- `cluster_id` - FK to clusters
- `centrality_score` - Graph hub detection score

**entities** - Named entities extracted from bookmarks
- `entity_type` - person, company, technology, location, product
- `occurrence_count` - Frequency across bookmarks

**concepts** - Abstract topics with hierarchy
- `parent_concept_id` - Self-referencing FK for hierarchy
- `embedding` (VECTOR(1536)) - Semantic representation
- `occurrence_count` - Frequency

**clusters** - Auto-generated bookmark groups
- `centroid_embedding` (VECTOR(1536)) - Cluster center
- `coherence_score` - Quality metric (0-1)
- `bookmark_count` - Number of members

**relationships** - Polymorphic edges between all node types
- `source_type`, `source_id`, `target_type`, `target_id` - Polymorphic references
- `relationship_type` - Type of relationship
- `weight` - Relationship strength (0-1)

**graph_insights** - AI-generated insights
- `insight_type` - trending_topic, knowledge_gap, surprising_connection, recommendation
- `confidence_score` - LLM confidence (0-1)
- `expires_at` - TTL for insights

### Critical Indexes

**Bookmarks** (12 indexes):
- HNSW on `embedding` for vector similarity (m=16, ef_construction=64)
- GIN on `search_vector` for full-text search
- Composite: `(user_id, updated_at DESC)`, `(user_id, created_at DESC)`
- Partial HNSW: `WHERE status='completed'` for optimized searches

**Relationships** (7 indexes):
- Composite: `(user_id, source_type, source_id)` for outgoing edges
- Composite: `(user_id, target_type, target_id)` for incoming edges
- Composite: `(user_id, relationship_type, weight DESC)` for weighted queries

## API Endpoints

### Knowledge Graph API (`/api/v1/graph/`)

**Graph Exploration:**
- `GET /bookmarks/:id/related?depth=2&limit=20` - Find related bookmarks (1-3 hop traversal)
- `GET /entities?type=company&limit=50` - List extracted entities with filters
- `GET /entities/:id/bookmarks` - All bookmarks mentioning an entity
- `GET /concepts?limit=100` - List concepts with hierarchy
- `GET /concepts/:id/related?minCoOccurrence=2` - Related concepts via co-occurrence

**Clusters:**
- `GET /clusters?limit=20` - List auto-generated clusters
- `GET /clusters/:id?bookmarkLimit=50` - Cluster details with members
- `POST /clusters/:id/merge` - Merge two clusters

**Insights:**
- `GET /insights?regenerate=false` - Get/generate AI insights
  - Returns: trending topics, knowledge gaps, surprising connections, recommendations

**Utilities:**
- `GET /stats` - Graph statistics for user
- `POST /bookmarks/:id/refresh` - Trigger graph refresh for bookmark
- `GET /cache/stats` - Cache statistics for monitoring

## Frontend Architecture

### Graph Visualization (React Flow)

**4 View Modes** (tabbed navigation):

1. **Graph View** - Interactive network visualization
   - Custom nodes: `BookmarkNode`, `ConceptNode`, `EntityNode`
   - Weighted edges with labels
   - Zoom, pan, layout controls

2. **Cluster View** - Grid of auto-generated topic clusters
   - Shows cluster name, description, coherence score, bookmark count
   - Visual preview with bookmark dots

3. **Insights View** - AI-powered analytics dashboard
   - Trending topics with line charts (Recharts)
   - Knowledge gaps with suggestions
   - Surprising connections highlighting cross-domain patterns
   - Recommendations based on user interests

4. **Discovery Mode** - Breadcrumb-based exploration
   - Click node → Show related items → Navigate forward
   - Click breadcrumb → Navigate backward
   - Depth tracker showing exploration distance

### State Management

- **Zustand** (`graphStore.ts`) - UI state (view mode, filters, selections)
- **React Query** - Server state with 5min TTL cache
- **React Flow** - Node positions, layout state

## Caching Strategy

### Redis Cache Layers (8 layers)

| Cache Type | TTL | Key Pattern | Invalidation |
|------------|-----|-------------|--------------|
| Embedding | 24hr | `embedding:{url_hash}` | Never (stable) |
| Search Query | 10min | `search:embedding:{query_hash}` | TTL |
| Search Results | 10min | `search:results:{user_id}:{query_hash}` | User bookmark change |
| Bookmark List | 5min | `bookmarks:list:{user_id}` | CRUD operations |
| Graph Similar | 30min | `graph:similar:{id}` | Never (embeddings stable) |
| Graph Concepts | 1hr | `graph:concepts:{user_id}` | New concept |
| Graph Clusters | 6hr | `graph:clusters:{user_id}` | Clustering job |
| Graph Insights | 24hr | `graph:insights:{user_id}` | Daily refresh |

**Performance Impact:**
- 50-70% reduction in OpenAI API calls
- 80-90% reduction in database queries
- <10ms response time for cached queries

## Job Queue System (BullMQ)

### 7 Queues

**Enrichment Queue:**
- `enrichment-jobs` - URL extraction, summarization, tagging, embedding

**Graph Queues:**
- `graph-entities` - Entity extraction (priority: 70)
- `graph-concepts` - Concept analysis (priority: 70)
- `graph-similarity` - Similarity computation (priority: 80, fast)
- `graph-clustering` - Batch clustering (priority: 10, expensive, 30min timeout)
- `graph-insights` - Batch insight generation (priority: 10)

**Processing Model:**
- Real-time: Entities, concepts, similarity (per bookmark after enrichment)
- Batch: Clustering, insights (daily/weekly for active users)

**Error Handling:**
- 3 retry attempts with exponential backoff (2s base delay)
- Failed jobs kept for 1000 entries
- Completed jobs kept for 100 entries

## AI Processing Costs

| Agent | Model | Cost/Bookmark | Notes |
|-------|-------|---------------|-------|
| Entity Extraction | spaCy (90%) + GPT-4o-mini (10%) | $0.001 | Hybrid approach for cost savings |
| Concept Analysis | GPT-3.5-turbo | $0.002 | BERTopic + GPT refinement |
| Similarity Computation | pgvector | Free | Local cosine similarity |
| Clustering | GPT-3.5-turbo | $0.010 | Cluster naming only |
| Insight Generation | GPT-3.5-turbo | $0.005 | 4 insight types |

**Total**: ~$0.08/user/month (under $0.10 budget)

## Performance Benchmarks

### Query Performance (Current: 11 bookmarks)

| Query | p95 Latency | Target | Status |
|-------|-------------|--------|--------|
| Bookmark List | 0.51ms | <10ms | 🟢 Excellent |
| Full-Text Search | 0.44ms | <200ms | 🟢 Excellent |
| Vector Similarity | 0.54ms | <500ms | 🟢 Excellent |
| Graph Relationships | 0.72ms | <1s | 🟢 Excellent |
| Cluster Query | 0.92ms | <1s | 🟢 Excellent |

All queries perform excellently with sub-millisecond execution times.

## Key Implementation Patterns

### Polymorphic Relationships

The `relationships` table uses polymorphic references:

```typescript
// Query all concepts related to a bookmark
const concepts = await prisma.relationship.findMany({
  where: {
    userId,
    sourceType: 'bookmark',
    sourceId: bookmarkId,
    targetType: 'concept',
  },
});
```

### Vector Similarity Search

```sql
-- Find similar bookmarks using pgvector
SELECT id, title, 1 - (embedding <=> $1::vector) as similarity
FROM bookmarks
WHERE user_id = $2 AND id != $3 AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 20;
```

### Graph Traversal (Multi-Hop)

```typescript
// Find related bookmarks via concepts (2-hop)
// 1. Bookmark → Concept relationships
// 2. Concept → Bookmark relationships
// Merge and deduplicate
```

### Clustering Algorithm (K-means)

```typescript
// 1. Initialize centroids randomly
// 2. Iterate: Assign bookmarks to nearest centroid
// 3. Update centroids (average of assigned embeddings)
// 4. Repeat until convergence
// 5. Use GPT-3.5 to generate cluster names
```

### Insight Generation

```typescript
// Trending Topics: Compare recent (7d) vs baseline (30d) concept counts
// Knowledge Gaps: Find related concepts user hasn't explored
// Surprising Connections: Bookmarks connecting multiple concepts
// Recommendations: Suggest content based on top concepts
```

## Security & Authentication

- **JWT Authentication** - Access token (15min) + refresh token (7d)
- **bcrypt** - Password hashing (work factor 12)
- **Row-Level Security** - All queries include `WHERE user_id = $1`
- **Input Validation** - Zod schemas on all endpoints
- **Rate Limiting** - 60 req/min default

## Docker Services

**6 Containers** (all must run for full functionality):

```
smartbookmarks_frontend      (Port 3000) - Next.js UI
smartbookmarks_backend       (Port 3002) - Express API
smartbookmarks_worker        (Internal) - Enrichment processing
smartbookmarks_graph_worker  (Internal) - Graph processing
smartbookmarks_db            (Port 5432) - PostgreSQL + pgvector
smartbookmarks_redis         (Port 6379) - Cache + job queue
```

**Health Checks:**
- All services have health checks (interval: 10s)
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- Backend/Frontend: HTTP GET to health endpoint

## Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL="postgresql://smartbookmarks:dev_password@postgres:5432/smartbookmarks"

# Redis
REDIS_URL="redis://redis:6379"

# OpenAI
OPENAI_API_KEY="sk-..."
AI_MODEL="gpt-3.5-turbo"
EMBEDDING_MODEL="text-embedding-3-small"

# Auth
JWT_SECRET="..." # 256-bit random
JWT_REFRESH_SECRET="..." # 256-bit random

# Server
PORT=3002
NODE_ENV=development
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL="http://localhost:3002"
```

## Common Tasks

### Adding a New Graph Agent

1. Create agent file in `backend/src/agents/`
2. Add job type to appropriate queue in `graphQueue.ts`
3. Add worker handler in `graphWorker.ts`
4. Update API endpoint in `graph.ts` if needed
5. Create test script in `backend/scripts/`

### Adding a New View Mode

1. Create component in `frontend/components/graph/`
2. Add view mode to `VIEW_TABS` in `graph/page.tsx`
3. Add state to `graphStore.ts`
4. Implement API endpoint if new data needed
5. Update `useGraphData.ts` hook

### Debugging Performance Issues

```bash
# 1. Run query performance analysis
docker exec smartbookmarks_backend npm run analyze-performance

# 2. Check cache stats
curl http://localhost:3002/api/v1/graph/cache/stats

# 3. View slow query logs in PostgreSQL
docker exec smartbookmarks_db psql -U smartbookmarks -d smartbookmarks -c "
  SELECT query, mean_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"

# 4. Monitor queue depth
docker exec smartbookmarks_redis redis-cli LLEN bull:graph-entities:wait
```

### Resetting Development Data

```bash
# Clear all caches
docker exec smartbookmarks_redis redis-cli FLUSHALL

# Reset database
docker exec smartbookmarks_backend npx prisma migrate reset --force

# Regenerate synthetic data
docker exec smartbookmarks_backend npx tsx scripts/populate-graph-data.ts
docker exec smartbookmarks_backend npx tsx scripts/create-synthetic-clusters.ts
```

## Critical Constraints

1. **All services MUST run in Docker** - Never run on host to avoid conflicts
2. **Vector embeddings are immutable** - Cache aggressively (24hr TTL)
3. **Graph relationships are polymorphic** - Always check both `source_type`/`target_type`
4. **Prisma can't filter Unsupported types** - Use raw SQL for `embedding` and `search_vector` filters
5. **Queue names cannot contain colons** - Use hyphens (e.g., `graph-entities` not `graph:entities`)
6. **Clustering is expensive** - Only run daily/weekly, not per-bookmark
7. **Insight generation requires data** - Minimum 5 bookmarks, 2 concepts for meaningful insights

## Known Issues & Workarounds

**Issue**: Prisma doesn't support `Unsupported("vector(1536)")` in WHERE clauses
**Workaround**: Use `prisma.$queryRaw` for embedding filters

**Issue**: BullMQ queue names with colons fail
**Workaround**: Use hyphens in queue names

**Issue**: Frontend React Flow state not syncing
**Workaround**: Add `useEffect` to sync nodes/edges when data arrives

## References

- **[PHASE_4_SUMMARY.md](PHASE_4_SUMMARY.md)** - Phase 4 completion report with performance benchmarks
- **[docs/APP_PRD.MD](docs/APP_PRD.MD)** - Original product requirements
- **[docs/Backend_documentation.MD](docs/Backend_documentation.MD)** - Backend architecture details
- **[docs/Frontend_documentation.MD](docs/Frontend_documentation.MD)** - Frontend specifications
- **[docs/iOS_Development_Plan.md](docs/iOS_Development_Plan.md)** - Mobile app roadmap
