import prisma from '../db/prisma';
import { Prisma } from '@prisma/client';
import { createCache } from '../services/cache';

// Redis cache for bookmark queries (5min TTL)
const bookmarkCache = createCache('bookmarks:', 300);

/**
 * Helper function to enrich search results with tag data
 * Fetches tags for all bookmarks in a single query to avoid N+1 problems
 */
async function enrichResultsWithTags(results: any[]): Promise<any[]> {
  if (results.length === 0) return results;

  const bookmarkIds = results.map((b: any) => b.id);

  // Fetch all tags for these bookmarks in a single query
  const tagsData = await prisma.bookmarkTag.findMany({
    where: { bookmarkId: { in: bookmarkIds } },
    include: { tag: true }
  });

  // Group tags by bookmark
  const tagsByBookmark = new Map<string, any[]>();
  for (const bt of tagsData) {
    if (!tagsByBookmark.has(bt.bookmarkId)) {
      tagsByBookmark.set(bt.bookmarkId, []);
    }
    tagsByBookmark.get(bt.bookmarkId)!.push(bt.tag);
  }

  // Attach tags to results
  return results.map((bookmark: any) => ({
    ...bookmark,
    tags: tagsByBookmark.get(bookmark.id) || []
  }));
}

export interface CreateBookmarkInput {
  userId: string;
  url: string;
  title?: string;
  domain?: string;
}

export interface UpdateBookmarkInput {
  title?: string;
  summary?: string;
  keyPoints?: string[];
  contentType?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export const bookmarkRepository = {
  async create(data: CreateBookmarkInput) {
    const domain = data.domain || (data.url ? new URL(data.url).hostname : '');

    return prisma.bookmark.create({
      data: {
        userId: data.userId,
        url: data.url,
        title: data.title || '',
        domain,
      },
      include: {
        tags: {
          include: { tag: true }
        }
      },
    });
  },

  async findById(id: string, userId: string) {
    return prisma.bookmark.findFirst({
      where: { id, userId },
      include: {
        tags: {
          include: { tag: true }
        }
      },
    });
  },

  async findByUserId(
    userId: string,
    options?: {
      cursor?: string;
      limit?: number;
      contentType?: string;
      status?: string;
    }
  ) {
    const { cursor, limit = 20, contentType, status } = options || {};

    // Generate cache key from query parameters
    const cacheKey = `user:${userId}:${JSON.stringify({ cursor, limit, contentType, status })}`;

    // Check cache
    const cached = await bookmarkCache.get(cacheKey);
    if (cached) {
      console.log(`[BookmarkRepository] Cache hit for user: ${userId}`);
      return cached;
    }

    // Query database
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId,
        ...(contentType && { contentType }),
        ...(status && { status }),
      },
      include: {
        tags: {
          include: { tag: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    // Cache the result
    await bookmarkCache.set(cacheKey, bookmarks, 300);

    return bookmarks;
  },

  async update(id: string, userId: string, data: UpdateBookmarkInput) {
    // Extract tags for separate handling (many-to-many relationship)
    const { embedding, tags, ...updateData } = data;

    // Handle embedding separately (raw SQL for pgvector)
    if (embedding) {
      const embeddingStr = `[${embedding.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE bookmarks
        SET embedding = ${embeddingStr}::vector,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `;
    }

    // Update bookmark (excluding tags and embedding)
    const updatedBookmark = await prisma.bookmark.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
        ...(updateData.status === 'completed' && { processedAt: new Date() }),
      },
      include: {
        tags: {
          include: { tag: true }
        }
      },
    });

    // Handle tags update separately if provided
    // Note: For now, we don't update tags via PATCH since the frontend
    // doesn't expect tag modifications through this endpoint
    // Tags are managed through enrichment or dedicated tag endpoints

    return updatedBookmark;
  },

  async delete(id: string, userId: string) {
    return prisma.bookmark.deleteMany({
      where: { id, userId },
    });
  },

  // Full-text search (keyword)
  async searchKeyword(userId: string, query: string, limit = 20) {
    const tsQuery = query.split(' ').join(' & ');

    const results = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      url: string;
      summary: string | null;
      domain: string;
      contentType: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      processedAt: Date | null;
      rank: number
    }>>`
      SELECT id, title, url, summary, domain,
             content_type as "contentType",
             status,
             created_at as "createdAt",
             updated_at as "updatedAt",
             processed_at as "processedAt",
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
      FROM bookmarks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return enrichResultsWithTags(results);
  },

  // Vector similarity search (semantic)
  async searchSemantic(userId: string, embedding: number[], limit = 20) {
    const embeddingStr = `[${embedding.join(',')}]`;

    const results = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      url: string;
      summary: string | null;
      domain: string;
      contentType: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      processedAt: Date | null;
      similarity: number
    }>>`
      SELECT id, title, url, summary, domain,
             content_type as "contentType",
             status,
             created_at as "createdAt",
             updated_at as "updatedAt",
             processed_at as "processedAt",
             1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM bookmarks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;

    return enrichResultsWithTags(results);
  },

  // Hybrid search (combine keyword + semantic)
  async searchHybrid(
    userId: string,
    query: string,
    embedding: number[],
    limit = 20
  ) {
    const tsQuery = query.split(' ').join(' & ');
    const embeddingStr = `[${embedding.join(',')}]`;

    const results = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      url: string;
      summary: string | null;
      domain: string;
      contentType: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      processedAt: Date | null;
      score: number
    }>>`
      WITH keyword_results AS (
        SELECT id, ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as keyword_score
        FROM bookmarks
        WHERE user_id = ${userId}
          AND status = 'completed'
          AND search_vector @@ to_tsquery('english', ${tsQuery})
      ),
      semantic_results AS (
        SELECT id, 1 - (embedding <=> ${embeddingStr}::vector) as semantic_score
        FROM bookmarks
        WHERE user_id = ${userId}
          AND status = 'completed'
          AND embedding IS NOT NULL
      )
      SELECT
        b.id,
        b.title,
        b.url,
        b.summary,
        b.domain,
        b.content_type as "contentType",
        b.status,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        b.processed_at as "processedAt",
        (COALESCE(k.keyword_score, 0) * 0.5 + COALESCE(s.semantic_score, 0) * 0.5) as score
      FROM bookmarks b
      LEFT JOIN keyword_results k ON b.id = k.id
      LEFT JOIN semantic_results s ON b.id = s.id
      WHERE b.user_id = ${userId}
        AND (k.id IS NOT NULL OR s.id IS NOT NULL)
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return enrichResultsWithTags(results);
  },
};

/**
 * Invalidate bookmark caches for a specific user
 * Called when user's bookmarks are created/updated/deleted
 */
export async function invalidateBookmarkCaches(userId: string): Promise<void> {
  await bookmarkCache.clear(`user:${userId}:*`);
  console.log(`[BookmarkRepository] Invalidated bookmark caches for user: ${userId}`);
}
