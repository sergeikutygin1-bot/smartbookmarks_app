import { getEmbedderAgent } from "../agents/embedderAgent";

/**
 * Vector Search Service - Handles semantic search and hybrid ranking
 *
 * Features:
 * - Cosine similarity for vector comparison
 * - Hybrid search combining keyword + semantic results
 * - Configurable ranking weights
 * - Efficient in-memory vector operations
 */

export interface SearchableItem {
  id: string;
  title: string;
  tags: string[];
  summary?: string;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  keywordScore: number;
  semanticScore: number;
  hybridScore: number;
}

export interface SearchOptions {
  query: string;
  items: SearchableItem[];
  topK?: number;
  semanticWeight?: number; // 0-1, how much to weight semantic vs keyword
  minScore?: number; // Minimum hybrid score to include in results
}

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 (opposite) and 1 (identical)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(
      `Vector dimensions mismatch: ${vecA.length} vs ${vecB.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Calculate keyword match score (simple but effective)
 * Returns score between 0 and 1
 */
export function keywordScore(query: string, item: SearchableItem): number {
  const queryLower = query.toLowerCase().trim();
  if (!queryLower) return 0;

  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
  if (queryWords.length === 0) return 0;

  let score = 0;
  const titleLower = item.title.toLowerCase();
  const tagsLower = item.tags.map((t) => t.toLowerCase());
  const summaryLower = item.summary?.toLowerCase() || "";

  queryWords.forEach((word) => {
    // Exact phrase match in title (highest weight)
    if (titleLower.includes(queryLower)) {
      score += 1.0;
    }
    // Word match in title (high weight)
    else if (titleLower.includes(word)) {
      score += 0.6;
    }

    // Exact tag match (high weight)
    if (tagsLower.some((tag) => tag === word)) {
      score += 0.8;
    }
    // Partial tag match (medium weight)
    else if (tagsLower.some((tag) => tag.includes(word))) {
      score += 0.4;
    }

    // Word match in summary (low weight)
    if (summaryLower.includes(word)) {
      score += 0.2;
    }
  });

  // Normalize by number of query words
  const normalizedScore = score / queryWords.length;

  // Cap at 1.0
  return Math.min(normalizedScore, 1.0);
}

/**
 * Perform hybrid search combining keyword and semantic similarity
 */
export async function hybridSearch(
  options: SearchOptions
): Promise<SearchResult[]> {
  const {
    query,
    items,
    topK = 10,
    semanticWeight = 0.6,
    minScore = 0.1,
  } = options;

  console.log(
    `[VectorSearch] Hybrid search: query="${query}", items=${items.length}, topK=${topK}`
  );

  if (items.length === 0) {
    return [];
  }

  // Calculate keyword scores for all items
  const keywordScores = items.map((item) => ({
    id: item.id,
    score: keywordScore(query, item),
  }));

  // Calculate semantic scores (only for items with embeddings)
  let queryEmbedding: number[] | null = null;
  const semanticScores: Record<string, number> = {};

  // Count items with embeddings
  const itemsWithEmbeddings = items.filter(
    (item) => item.embedding && item.embedding.length > 0
  );

  if (itemsWithEmbeddings.length > 0) {
    try {
      const embedder = getEmbedderAgent();
      queryEmbedding = await embedder.embed({ text: query, useCache: true });

      itemsWithEmbeddings.forEach((item) => {
        if (item.embedding) {
          try {
            const similarity = cosineSimilarity(queryEmbedding!, item.embedding);
            // Convert similarity from [-1, 1] to [0, 1] range
            semanticScores[item.id] = (similarity + 1) / 2;
          } catch (error) {
            console.error(
              `[VectorSearch] Error calculating similarity for item ${item.id}:`,
              error
            );
            semanticScores[item.id] = 0;
          }
        }
      });

      console.log(
        `[VectorSearch] Generated semantic scores for ${Object.keys(semanticScores).length}/${items.length} items`
      );
    } catch (error) {
      console.error(
        "[VectorSearch] Failed to generate query embedding, falling back to keyword-only:",
        error
      );
      // Fallback to keyword-only search
    }
  } else {
    console.log(
      "[VectorSearch] No items with embeddings, using keyword-only search"
    );
  }

  // Combine scores with configurable weights
  const keywordWeight = 1 - semanticWeight;
  const hasSemantic = Object.keys(semanticScores).length > 0;

  const results: SearchResult[] = items
    .map((item) => {
      const kScore =
        keywordScores.find((k) => k.id === item.id)?.score || 0;
      const sScore = semanticScores[item.id] || 0;

      // If no semantic scores available, use keyword-only
      const hybridScore = hasSemantic
        ? kScore * keywordWeight + sScore * semanticWeight
        : kScore;

      return {
        id: item.id,
        keywordScore: kScore,
        semanticScore: sScore,
        hybridScore,
      };
    })
    .filter((result) => result.hybridScore >= minScore)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK);

  console.log(
    `[VectorSearch] Returning ${results.length} results (filtered by minScore=${minScore})`
  );

  return results;
}

/**
 * Perform semantic-only search (useful for debugging or comparison)
 */
export async function semanticSearch(
  query: string,
  items: SearchableItem[],
  topK: number = 10
): Promise<SearchResult[]> {
  return hybridSearch({
    query,
    items,
    topK,
    semanticWeight: 1.0, // 100% semantic
  });
}

/**
 * Perform keyword-only search (useful for debugging or comparison)
 */
export function keywordSearch(
  query: string,
  items: SearchableItem[],
  topK: number = 10
): SearchResult[] {
  const scores = items
    .map((item) => ({
      id: item.id,
      keywordScore: keywordScore(query, item),
      semanticScore: 0,
      hybridScore: keywordScore(query, item),
    }))
    .filter((result) => result.hybridScore > 0)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK);

  return scores;
}
