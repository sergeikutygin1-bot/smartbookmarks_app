import prisma from '../db/prisma';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Similar bookmark result
 */
export interface SimilarBookmark {
  bookmarkId: string;
  similarity: number; // Cosine similarity (0-1)
  title: string;
  url: string;
  domain: string;
  contentType: string;
}

/**
 * Similarity computation result
 */
export interface SimilarityResult {
  bookmarkId: string;
  similarBookmarks: SimilarBookmark[];
  method: 'pgvector';
  processingTime: number;
}

/**
 * Similarity Computer
 *
 * Uses pgvector's cosine similarity to find related bookmarks.
 *
 * Key Features:
 * - Fast vector similarity search using HNSW index
 * - Configurable similarity threshold
 * - Automatically creates similarity relationships
 * - Supports multi-modal similarity (content + tags + temporal)
 *
 * Performance:
 * - Target: <50ms with HNSW index
 * - Scales well with HNSW (approximate nearest neighbor)
 */
export class SimilarityComputer {
  /**
   * Find similar bookmarks using vector embeddings
   *
   * @param bookmarkId - Bookmark to find similarities for
   * @param userId - User ID for isolation
   * @param embedding - Vector embedding of the bookmark
   * @param threshold - Minimum similarity score (0-1, default: 0.7)
   * @param limit - Maximum number of results (default: 20)
   * @returns Similarity result with similar bookmarks
   */
  async findSimilar(
    bookmarkId: string,
    userId: string,
    embedding: number[],
    threshold: number = 0.7,
    limit: number = 20
  ): Promise<SimilarityResult> {
    const startTime = Date.now();

    if (!embedding || embedding.length === 0) {
      console.warn(`[SimilarityComputer] No embedding provided for bookmark ${bookmarkId}`);
      return {
        bookmarkId,
        similarBookmarks: [],
        method: 'pgvector',
        processingTime: Date.now() - startTime,
      };
    }

    // Query similar bookmarks using pgvector cosine similarity
    // Note: pgvector uses <=> operator for cosine distance (0 = identical, 2 = opposite)
    // Cosine similarity = 1 - (cosine distance / 2)
    const embeddingString = `[${embedding.join(',')}]`;

    const similarBookmarksRaw = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        url: string;
        domain: string;
        content_type: string;
        cosine_distance: number;
      }>
    >`
      SELECT
        id,
        title,
        url,
        domain,
        content_type,
        (embedding <=> ${embeddingString}::vector) as cosine_distance
      FROM bookmarks
      WHERE
        user_id = ${userId}
        AND id != ${bookmarkId}
        AND embedding IS NOT NULL
        AND (embedding <=> ${embeddingString}::vector) < ${(1 - threshold) * 2}
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit}
    `;

    // Convert cosine distance to similarity score
    const similarBookmarks: SimilarBookmark[] = similarBookmarksRaw.map((row) => ({
      bookmarkId: row.id,
      similarity: 1 - row.cosine_distance / 2,
      title: row.title,
      url: row.url,
      domain: row.domain,
      contentType: row.content_type,
    }));

    const processingTime = Date.now() - startTime;

    console.log(
      `[SimilarityComputer] Found ${similarBookmarks.length} similar bookmarks for ${bookmarkId} in ${processingTime}ms`
    );

    return {
      bookmarkId,
      similarBookmarks,
      method: 'pgvector',
      processingTime,
    };
  }

  /**
   * Find similar bookmarks with hybrid scoring
   *
   * Combines multiple signals for better similarity:
   * - Vector embedding similarity (70%)
   * - Tag overlap (20%)
   * - Temporal proximity (5%)
   * - Domain match (5%)
   *
   * @param bookmarkId - Bookmark to find similarities for
   * @param userId - User ID for isolation
   * @param threshold - Minimum similarity score (0-1, default: 0.65)
   * @param limit - Maximum number of results (default: 20)
   */
  async findSimilarHybrid(
    bookmarkId: string,
    userId: string,
    threshold: number = 0.65,
    limit: number = 20
  ): Promise<SimilarityResult> {
    const startTime = Date.now();

    // Fetch the source bookmark with tags
    const sourceBookmark = await prisma.bookmark.findUnique({
      where: { id: bookmarkId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!sourceBookmark || !sourceBookmark.embedding) {
      console.warn(`[SimilarityComputer] Bookmark ${bookmarkId} not found or has no embedding`);
      return {
        bookmarkId,
        similarBookmarks: [],
        method: 'pgvector',
        processingTime: Date.now() - startTime,
      };
    }

    // Get embedding as number array
    const embedding = JSON.parse(JSON.stringify(sourceBookmark.embedding)) as number[];
    const embeddingString = `[${embedding.join(',')}]`;

    // Get source bookmark tags
    const sourceTagIds = sourceBookmark.tags.map((bt) => bt.tagId);
    const sourceDomain = sourceBookmark.domain;
    const sourceCreatedAt = sourceBookmark.createdAt;

    // Find candidates using vector similarity (cast wider net with lower threshold)
    const candidatesRaw = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        url: string;
        domain: string;
        content_type: string;
        created_at: Date;
        cosine_distance: number;
      }>
    >`
      SELECT
        id,
        title,
        url,
        domain,
        content_type,
        created_at,
        (embedding <=> ${embeddingString}::vector) as cosine_distance
      FROM bookmarks
      WHERE
        user_id = ${userId}
        AND id != ${bookmarkId}
        AND embedding IS NOT NULL
        AND (embedding <=> ${embeddingString}::vector) < 1.0
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit * 2}
    `;

    // Fetch tags for candidates
    const candidateIds = candidatesRaw.map((c) => c.id);
    const candidateTags = await prisma.bookmarkTag.findMany({
      where: {
        bookmarkId: { in: candidateIds },
      },
      select: {
        bookmarkId: true,
        tagId: true,
      },
    });

    // Group tags by bookmark
    const tagsByBookmark = new Map<string, string[]>();
    for (const bt of candidateTags) {
      if (!tagsByBookmark.has(bt.bookmarkId)) {
        tagsByBookmark.set(bt.bookmarkId, []);
      }
      tagsByBookmark.get(bt.bookmarkId)!.push(bt.tagId);
    }

    // Calculate hybrid scores
    const similarBookmarks: SimilarBookmark[] = candidatesRaw
      .map((candidate) => {
        // 1. Vector similarity (70% weight)
        const vectorSimilarity = 1 - candidate.cosine_distance / 2;

        // 2. Tag overlap (20% weight) - Jaccard similarity
        const candidateTagIds = tagsByBookmark.get(candidate.id) || [];
        const intersection = sourceTagIds.filter((t) => candidateTagIds.includes(t)).length;
        const union = new Set([...sourceTagIds, ...candidateTagIds]).size;
        const tagSimilarity = union > 0 ? intersection / union : 0;

        // 3. Temporal proximity (5% weight) - exponential decay
        const daysDiff = Math.abs(
          (sourceCreatedAt.getTime() - candidate.created_at.getTime()) / (1000 * 60 * 60 * 24)
        );
        const temporalSimilarity = Math.exp(-daysDiff / 30); // Decay over 30 days

        // 4. Domain match (5% weight) - boolean
        const domainSimilarity = candidate.domain === sourceDomain ? 1.0 : 0.0;

        // Weighted hybrid score
        const hybridScore =
          0.7 * vectorSimilarity +
          0.2 * tagSimilarity +
          0.05 * temporalSimilarity +
          0.05 * domainSimilarity;

        return {
          bookmarkId: candidate.id,
          similarity: hybridScore,
          title: candidate.title,
          url: candidate.url,
          domain: candidate.domain,
          contentType: candidate.content_type,
        };
      })
      .filter((s) => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    const processingTime = Date.now() - startTime;

    console.log(
      `[SimilarityComputer] Found ${similarBookmarks.length} similar bookmarks (hybrid) for ${bookmarkId} in ${processingTime}ms`
    );

    return {
      bookmarkId,
      similarBookmarks,
      method: 'pgvector',
      processingTime,
    };
  }

  /**
   * Save similarity relationships to database
   *
   * @param bookmarkId - Source bookmark
   * @param similarBookmarks - Similar bookmarks with scores
   * @param userId - User ID for isolation
   */
  async saveSimilarities(
    bookmarkId: string,
    similarBookmarks: SimilarBookmark[],
    userId: string
  ): Promise<void> {
    if (similarBookmarks.length === 0) {
      console.log(`[SimilarityComputer] No similarities to save for bookmark ${bookmarkId}`);
      return;
    }

    console.log(
      `[SimilarityComputer] Saving ${similarBookmarks.length} similarity relationships for bookmark ${bookmarkId}`
    );

    // Save bidirectional similarity relationships
    for (const similar of similarBookmarks) {
      try {
        // Forward relationship: bookmark -> similar bookmark
        await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId,
              sourceType: 'bookmark',
              sourceId: bookmarkId,
              targetType: 'bookmark',
              targetId: similar.bookmarkId,
              relationshipType: 'similar_to',
            },
          },
          create: {
            userId,
            sourceType: 'bookmark',
            sourceId: bookmarkId,
            targetType: 'bookmark',
            targetId: similar.bookmarkId,
            relationshipType: 'similar_to',
            weight: similar.similarity,
            metadata: {
              method: 'pgvector',
            },
          },
          update: {
            weight: similar.similarity,
            metadata: {
              method: 'pgvector',
            },
          },
        });

        // Reverse relationship: similar bookmark -> bookmark
        // (Similarity is symmetric, so we save both directions)
        await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId,
              sourceType: 'bookmark',
              sourceId: similar.bookmarkId,
              targetType: 'bookmark',
              targetId: bookmarkId,
              relationshipType: 'similar_to',
            },
          },
          create: {
            userId,
            sourceType: 'bookmark',
            sourceId: similar.bookmarkId,
            targetType: 'bookmark',
            targetId: bookmarkId,
            relationshipType: 'similar_to',
            weight: similar.similarity,
            metadata: {
              method: 'pgvector',
            },
          },
          update: {
            weight: similar.similarity,
            metadata: {
              method: 'pgvector',
            },
          },
        });
      } catch (error) {
        console.error(
          `[SimilarityComputer] Failed to save similarity to ${similar.bookmarkId}:`,
          error
        );
        // Continue with other similarities even if one fails
      }
    }

    console.log(`[SimilarityComputer] ✓ Similarities saved successfully`);
  }

  /**
   * Get existing similar bookmarks from database
   *
   * @param bookmarkId - Bookmark to get similarities for
   * @param userId - User ID for isolation
   * @param limit - Maximum number of results (default: 20)
   */
  async getSimilarFromDB(
    bookmarkId: string,
    userId: string,
    limit: number = 20
  ): Promise<SimilarBookmark[]> {
    const relationships = await prisma.relationship.findMany({
      where: {
        userId,
        sourceType: 'bookmark',
        sourceId: bookmarkId,
        targetType: 'bookmark',
        relationshipType: 'similar_to',
      },
      orderBy: {
        weight: 'desc',
      },
      take: limit,
    });

    if (relationships.length === 0) {
      return [];
    }

    // Fetch bookmark details
    const bookmarkIds = relationships.map((r) => r.targetId);
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        id: { in: bookmarkIds },
      },
      select: {
        id: true,
        title: true,
        url: true,
        domain: true,
        contentType: true,
      },
    });

    // Merge relationship weights with bookmark data
    return relationships.map((rel) => {
      const bookmark = bookmarks.find((b) => b.id === rel.targetId);
      return {
        bookmarkId: rel.targetId,
        similarity: rel.weight,
        title: bookmark?.title || '',
        url: bookmark?.url || '',
        domain: bookmark?.domain || '',
        contentType: bookmark?.contentType || 'article',
      };
    });
  }

  /**
   * Batch compute similarities for multiple bookmarks
   *
   * Useful for backfilling or re-computing similarities.
   *
   * @param bookmarkIds - Bookmarks to compute similarities for
   * @param userId - User ID for isolation
   * @param useHybrid - Use hybrid scoring (default: true)
   */
  async batchComputeSimilarities(
    bookmarkIds: string[],
    userId: string,
    useHybrid: boolean = true
  ): Promise<{ processed: number; failed: number }> {
    console.log(`[SimilarityComputer] Starting batch computation for ${bookmarkIds.length} bookmarks`);

    let processed = 0;
    let failed = 0;

    for (const bookmarkId of bookmarkIds) {
      try {
        // Fetch bookmark embedding
        const bookmark = await prisma.bookmark.findUnique({
          where: { id: bookmarkId },
          select: { embedding: true },
        });

        if (!bookmark || !bookmark.embedding) {
          console.warn(`[SimilarityComputer] Skipping ${bookmarkId} - no embedding`);
          failed++;
          continue;
        }

        // Compute similarities
        let result: SimilarityResult;
        if (useHybrid) {
          result = await this.findSimilarHybrid(bookmarkId, userId);
        } else {
          const embedding = JSON.parse(JSON.stringify(bookmark.embedding)) as number[];
          result = await this.findSimilar(bookmarkId, userId, embedding);
        }

        // Save to database
        await this.saveSimilarities(bookmarkId, result.similarBookmarks, userId);

        processed++;

        // Log progress every 10 bookmarks
        if (processed % 10 === 0) {
          console.log(`[SimilarityComputer] Progress: ${processed}/${bookmarkIds.length}`);
        }
      } catch (error) {
        console.error(`[SimilarityComputer] Failed to process ${bookmarkId}:`, error);
        failed++;
      }
    }

    console.log(
      `[SimilarityComputer] Batch computation complete: ${processed} processed, ${failed} failed`
    );

    return { processed, failed };
  }
}
