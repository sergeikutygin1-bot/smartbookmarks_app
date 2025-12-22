import prisma from '../db/prisma';
import { SimilarityComputer } from '../agents/SimilarityComputer';
import { ConceptAnalyzerAgent } from '../agents/ConceptAnalyzerAgent';

/**
 * Graph Service
 *
 * Business logic for knowledge graph operations.
 * Provides methods for exploring relationships, entities, concepts, and clusters.
 */
export class GraphService {
  /**
   * Find related bookmarks (1-3 hop traversal)
   *
   * @param bookmarkId - Source bookmark
   * @param userId - User ID for isolation
   * @param depth - Traversal depth (1-3 hops, default: 2)
   * @param limit - Max results per hop (default: 20)
   */
  async findRelatedBookmarks(
    bookmarkId: string,
    userId: string,
    depth: number = 2,
    limit: number = 20
  ) {
    // Validate depth
    const safeDepth = Math.min(Math.max(depth, 1), 3); // Clamp to 1-3

    // Get the source bookmark to verify ownership
    const sourceBookmark = await prisma.bookmark.findFirst({
      where: { id: bookmarkId, userId },
    });

    if (!sourceBookmark) {
      throw new Error('Bookmark not found');
    }

    // Build results with path information
    const related: Array<{
      bookmark: any;
      relationshipType: string;
      weight: number;
      path: string[];
      pathLength: number;
    }> = [];

    // 1-hop: Direct similar bookmarks
    if (safeDepth >= 1) {
      const directSimilar = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: bookmarkId,
          targetType: 'bookmark',
          relationshipType: 'similar_to',
        },
        orderBy: { weight: 'desc' },
        take: limit,
      });

      const bookmarkIds = directSimilar.map((r) => r.targetId);
      const bookmarks = await prisma.bookmark.findMany({
        where: { id: { in: bookmarkIds } },
        include: {
          tags: {
            include: { tag: true },
          },
        },
      });

      for (const rel of directSimilar) {
        const bookmark = bookmarks.find((b) => b.id === rel.targetId);
        if (bookmark) {
          related.push({
            bookmark,
            relationshipType: 'similar_to',
            weight: rel.weight,
            path: [bookmarkId, bookmark.id],
            pathLength: 1,
          });
        }
      }
    }

    // 2-hop: Via concepts or entities
    if (safeDepth >= 2) {
      // Find concepts this bookmark is about
      const bookmarkConcepts = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: bookmarkId,
          targetType: 'concept',
          relationshipType: 'about',
        },
        orderBy: { weight: 'desc' },
        take: 10, // Top 10 concepts
      });

      // Find other bookmarks about these concepts
      for (const conceptRel of bookmarkConcepts) {
        const relatedViaConceptRaw = await prisma.relationship.findMany({
          where: {
            userId,
            sourceType: 'bookmark',
            targetType: 'concept',
            targetId: conceptRel.targetId,
            relationshipType: 'about',
            NOT: { sourceId: bookmarkId }, // Exclude source bookmark
          },
          orderBy: { weight: 'desc' },
          take: 5, // Top 5 per concept
        });

        const bookmarkIds = relatedViaConceptRaw.map((r) => r.sourceId);
        const bookmarks = await prisma.bookmark.findMany({
          where: { id: { in: bookmarkIds } },
          include: {
            tags: {
              include: { tag: true },
            },
          },
        });

        // Get concept name for path
        const concept = await prisma.concept.findUnique({
          where: { id: conceptRel.targetId },
          select: { name: true },
        });

        for (const rel of relatedViaConceptRaw) {
          const bookmark = bookmarks.find((b) => b.id === rel.sourceId);
          if (bookmark && !related.find((r) => r.bookmark.id === bookmark.id)) {
            related.push({
              bookmark,
              relationshipType: 'via_concept',
              weight: (conceptRel.weight + rel.weight) / 2,
              path: [
                bookmarkId,
                `concept:${concept?.name || 'unknown'}`,
                bookmark.id,
              ],
              pathLength: 2,
            });
          }
        }
      }

      // Also find via entities (same pattern)
      const bookmarkEntities = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: bookmarkId,
          targetType: 'entity',
          relationshipType: 'mentions',
        },
        orderBy: { weight: 'desc' },
        take: 10,
      });

      for (const entityRel of bookmarkEntities) {
        const relatedViaEntityRaw = await prisma.relationship.findMany({
          where: {
            userId,
            sourceType: 'bookmark',
            targetType: 'entity',
            targetId: entityRel.targetId,
            relationshipType: 'mentions',
            NOT: { sourceId: bookmarkId },
          },
          orderBy: { weight: 'desc' },
          take: 5,
        });

        const bookmarkIds = relatedViaEntityRaw.map((r) => r.sourceId);
        const bookmarks = await prisma.bookmark.findMany({
          where: { id: { in: bookmarkIds } },
          include: {
            tags: {
              include: { tag: true },
            },
          },
        });

        const entity = await prisma.entity.findUnique({
          where: { id: entityRel.targetId },
          select: { name: true },
        });

        for (const rel of relatedViaEntityRaw) {
          const bookmark = bookmarks.find((b) => b.id === rel.sourceId);
          if (bookmark && !related.find((r) => r.bookmark.id === bookmark.id)) {
            related.push({
              bookmark,
              relationshipType: 'via_entity',
              weight: (entityRel.weight + rel.weight) / 2,
              path: [
                bookmarkId,
                `entity:${entity?.name || 'unknown'}`,
                bookmark.id,
              ],
              pathLength: 2,
            });
          }
        }
      }
    }

    // Sort by weight and limit
    return related.sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  /**
   * List entities with filters
   *
   * @param userId - User ID for isolation
   * @param entityType - Filter by type (optional)
   * @param limit - Max results (default: 50)
   */
  async listEntities(
    userId: string,
    entityType?: string,
    limit: number = 50
  ) {
    const where: any = { userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const entities = await prisma.entity.findMany({
      where,
      orderBy: { occurrenceCount: 'desc' },
      take: limit,
    });

    return entities;
  }

  /**
   * Get bookmarks that mention an entity
   *
   * @param entityId - Entity ID
   * @param userId - User ID for isolation
   * @param limit - Max results (default: 50)
   */
  async getBookmarksForEntity(
    entityId: string,
    userId: string,
    limit: number = 50
  ) {
    // Verify entity ownership
    const entity = await prisma.entity.findFirst({
      where: { id: entityId, userId },
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    // Find relationships
    const relationships = await prisma.relationship.findMany({
      where: {
        userId,
        targetType: 'entity',
        targetId: entityId,
        relationshipType: 'mentions',
      },
      orderBy: { weight: 'desc' },
      take: limit,
    });

    // Fetch bookmarks
    const bookmarkIds = relationships.map((r) => r.sourceId);
    const bookmarks = await prisma.bookmark.findMany({
      where: { id: { in: bookmarkIds } },
      include: {
        tags: {
          include: { tag: true },
        },
      },
    });

    // Merge with relationship weights
    return relationships.map((rel) => {
      const bookmark = bookmarks.find((b) => b.id === rel.sourceId);
      return {
        bookmark,
        weight: rel.weight,
        metadata: rel.metadata,
      };
    });
  }

  /**
   * List concepts with hierarchy
   *
   * @param userId - User ID for isolation
   * @param limit - Max results (default: 100)
   */
  async listConcepts(userId: string, limit: number = 100) {
    const concepts = await prisma.concept.findMany({
      where: { userId },
      orderBy: { occurrenceCount: 'desc' },
      take: limit,
      include: {
        parentConcept: true,
        childConcepts: true,
      },
    });

    return concepts;
  }

  /**
   * Find related concepts (via co-occurrence)
   *
   * @param conceptId - Source concept
   * @param userId - User ID for isolation
   * @param minCoOccurrence - Minimum shared bookmarks (default: 2)
   */
  async findRelatedConcepts(
    conceptId: string,
    userId: string,
    minCoOccurrence: number = 2
  ) {
    // Verify concept ownership
    const concept = await prisma.concept.findFirst({
      where: { id: conceptId, userId },
    });

    if (!concept) {
      throw new Error('Concept not found');
    }

    // Use ConceptAnalyzerAgent's co-occurrence method
    const agent = new ConceptAnalyzerAgent();
    return agent.findRelatedConcepts(conceptId, userId, minCoOccurrence);
  }

  /**
   * List clusters
   *
   * @param userId - User ID for isolation
   * @param limit - Max results (default: 20)
   */
  async listClusters(userId: string, limit: number = 20) {
    const clusters = await prisma.cluster.findMany({
      where: { userId },
      orderBy: { bookmarkCount: 'desc' },
      take: limit,
      include: {
        _count: {
          select: { bookmarks: true },
        },
      },
    });

    return clusters;
  }

  /**
   * Get cluster details with member bookmarks
   *
   * @param clusterId - Cluster ID
   * @param userId - User ID for isolation
   * @param bookmarkLimit - Max bookmarks to return (default: 50)
   */
  async getClusterDetails(
    clusterId: string,
    userId: string,
    bookmarkLimit: number = 50
  ) {
    // Verify cluster ownership
    const cluster = await prisma.cluster.findFirst({
      where: { id: clusterId, userId },
      include: {
        bookmarks: {
          take: bookmarkLimit,
          orderBy: { centralityScore: 'desc' }, // Most central bookmarks first
          include: {
            tags: {
              include: { tag: true },
            },
          },
        },
      },
    });

    if (!cluster) {
      throw new Error('Cluster not found');
    }

    return cluster;
  }

  /**
   * Merge two clusters
   *
   * @param targetClusterId - Cluster to keep
   * @param sourceClusterId - Cluster to merge and delete
   * @param userId - User ID for isolation
   */
  async mergeClusters(
    targetClusterId: string,
    sourceClusterId: string,
    userId: string
  ) {
    // Verify both clusters exist and are owned by user
    const [targetCluster, sourceCluster] = await Promise.all([
      prisma.cluster.findFirst({ where: { id: targetClusterId, userId } }),
      prisma.cluster.findFirst({ where: { id: sourceClusterId, userId } }),
    ]);

    if (!targetCluster || !sourceCluster) {
      throw new Error('One or both clusters not found');
    }

    // Move all bookmarks from source to target
    await prisma.bookmark.updateMany({
      where: { clusterId: sourceClusterId },
      data: { clusterId: targetClusterId },
    });

    // Update target cluster bookmark count
    const newBookmarkCount =
      targetCluster.bookmarkCount + sourceCluster.bookmarkCount;
    await prisma.cluster.update({
      where: { id: targetClusterId },
      data: { bookmarkCount: newBookmarkCount },
    });

    // Delete source cluster
    await prisma.cluster.delete({
      where: { id: sourceClusterId },
    });

    return { success: true, mergedCount: sourceCluster.bookmarkCount };
  }

  /**
   * Get graph statistics for user
   *
   * @param userId - User ID
   */
  async getGraphStats(userId: string) {
    const [
      entityCount,
      conceptCount,
      clusterCount,
      relationshipCount,
      topEntities,
      topConcepts,
    ] = await Promise.all([
      prisma.entity.count({ where: { userId } }),
      prisma.concept.count({ where: { userId } }),
      prisma.cluster.count({ where: { userId } }),
      prisma.relationship.count({ where: { userId } }),
      prisma.entity.findMany({
        where: { userId },
        orderBy: { occurrenceCount: 'desc' },
        take: 10,
        select: { name: true, entityType: true, occurrenceCount: true },
      }),
      prisma.concept.findMany({
        where: { userId },
        orderBy: { occurrenceCount: 'desc' },
        take: 10,
        select: { name: true, occurrenceCount: true },
      }),
    ]);

    return {
      counts: {
        entities: entityCount,
        concepts: conceptCount,
        clusters: clusterCount,
        relationships: relationshipCount,
      },
      topEntities,
      topConcepts,
    };
  }

  /**
   * Trigger graph refresh for a bookmark (re-process)
   *
   * @param bookmarkId - Bookmark to refresh
   * @param userId - User ID for isolation
   */
  async refreshBookmarkGraph(bookmarkId: string, userId: string) {
    // Verify bookmark ownership
    const bookmark = await prisma.bookmark.findFirst({
      where: { id: bookmarkId, userId },
    });

    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    // Delete existing relationships for this bookmark
    await prisma.relationship.deleteMany({
      where: {
        userId,
        OR: [
          { sourceType: 'bookmark', sourceId: bookmarkId },
          { targetType: 'bookmark', targetId: bookmarkId },
        ],
      },
    });

    // Re-queue graph processing
    const { graphQueue } = await import('../queues/graphQueue');
    const content = [bookmark.title, bookmark.summary]
      .filter(Boolean)
      .join('\n\n');

    if (bookmark.embedding && content.length > 0) {
      const embedding = JSON.parse(
        JSON.stringify(bookmark.embedding)
      ) as number[];
      await graphQueue.processBookmarkGraph(
        bookmarkId,
        userId,
        content,
        embedding,
        bookmark.url
      );
    }

    return { success: true, message: 'Graph refresh queued' };
  }
}

// Export singleton instance
export const graphService = new GraphService();
