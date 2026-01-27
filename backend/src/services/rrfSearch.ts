import prisma from '../db/prisma';
import { getEmbedderAgent } from '../agents/embedderAgent';

/**
 * RRF (Reciprocal Rank Fusion) Search Service
 *
 * Implements Reciprocal Rank Fusion for combining multiple search signals:
 * - Vector similarity (semantic search)
 * - Keyword search (full-text)
 * - Graph boost (concept-based relevance)
 *
 * RRF Formula: RRF(d) = Σ(1 / (k + rank_i(d)))
 * where k is a constant (typically 60) and rank_i is the rank in search result i
 */

export interface RRFSearchOptions {
  query: string;
  userId: string;
  limit?: number;
  k?: number;  // RRF constant (default: 60)
  enableGraphBoost?: boolean;
}

export interface RRFResult {
  bookmarkId: string;
  rrfScore: number;
  signals: {
    vectorRank?: number;
    keywordRank?: number;
    graphBoostRank?: number;
  };
}

/**
 * Perform hybrid search using Reciprocal Rank Fusion
 * Combines vector similarity, keyword matching, and graph-based boost
 */
export async function rrfSearch(options: RRFSearchOptions): Promise<RRFResult[]> {
  const { query, userId, limit = 20, k = 60, enableGraphBoost = true } = options;

  console.log(`[RRF] Starting search: "${query}"`);

  // 1. Generate query embedding
  const embedder = getEmbedderAgent();
  const queryEmbedding = await embedder.embed({ text: query, useCache: true });

  // 2. Execute three parallel searches
  const [vectorResults, keywordResults, graphBoostResults] = await Promise.all([
    searchVector(userId, queryEmbedding, limit * 2),
    searchKeyword(userId, query, limit * 2),
    enableGraphBoost ? searchGraphBoost(userId, query, limit * 2) : Promise.resolve([]),
  ]);

  console.log(
    `[RRF] Retrieved: vector=${vectorResults.length}, ` +
    `keyword=${keywordResults.length}, graph=${graphBoostResults.length}`
  );

  // 3. Apply RRF fusion
  const fusedResults = fuseRRF(
    [
      { results: vectorResults, name: 'vector' },
      { results: keywordResults, name: 'keyword' },
      { results: graphBoostResults, name: 'graph' },
    ],
    k
  );

  return fusedResults.slice(0, limit);
}

/**
 * Fuse multiple result sets using RRF algorithm
 * RRF score for document d: RRF(d) = Σ(1 / (k + rank(d)))
 */
function fuseRRF(
  resultSets: Array<{ results: Array<{ id: string }>; name: string }>,
  k: number = 60
): RRFResult[] {
  const rrfScores = new Map<string, {
    score: number;
    signals: Record<string, number>;
  }>();

  for (const { results, name } of resultSets) {
    results.forEach((result, rank) => {
      const existing = rrfScores.get(result.id) || { score: 0, signals: {} };
      existing.score += 1 / (k + rank + 1);
      existing.signals[`${name}Rank`] = rank + 1;
      rrfScores.set(result.id, existing);
    });
  }

  return Array.from(rrfScores.entries())
    .map(([bookmarkId, { score, signals }]) => ({
      bookmarkId,
      rrfScore: score,
      signals,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Vector similarity search using pgvector
 */
async function searchVector(userId: string, queryEmbedding: number[], limit: number) {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  return await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM bookmarks
    WHERE user_id = ${userId} AND status = 'completed' AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
}

/**
 * Full-text keyword search using PostgreSQL ts_vector
 */
async function searchKeyword(userId: string, query: string, limit: number) {
  const tsQuery = query.split(' ').join(' & ');

  return await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM bookmarks
    WHERE user_id = ${userId} AND status = 'completed'
      AND search_vector @@ to_tsquery('english', ${tsQuery})
    ORDER BY ts_rank(search_vector, to_tsquery('english', ${tsQuery})) DESC
    LIMIT ${limit}
  `;
}

/**
 * Graph-boosted search: prioritize bookmarks about top concepts that match the query
 * Uses concept occurrence count to identify user's primary interests
 */
async function searchGraphBoost(userId: string, query: string, limit: number) {
  // Get top 5 concepts for this user (their primary interests)
  const topConcepts = await prisma.concept.findMany({
    where: { userId },
    orderBy: { occurrenceCount: 'desc' },
    take: 5,
    select: { id: true },
  });

  if (topConcepts.length === 0) return [];

  const conceptIds = topConcepts.map(c => c.id);
  const tsQuery = query.split(' ').join(' & ');

  // Use subquery to get max weight per bookmark, then select distinct bookmarks
  return await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT b.id, MAX(r.weight) as max_weight
    FROM bookmarks b
    INNER JOIN relationships r ON r.source_id = b.id
    WHERE b.user_id = ${userId} AND b.status = 'completed'
      AND r.source_type = 'bookmark'
      AND r.target_type = 'concept'
      AND r.target_id = ANY(${conceptIds}::text[])
      AND b.search_vector @@ to_tsquery('english', ${tsQuery})
    GROUP BY b.id
    ORDER BY max_weight DESC
    LIMIT ${limit}
  `;
}
