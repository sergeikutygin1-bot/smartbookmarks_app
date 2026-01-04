import { UMAP } from 'umap-js';
import seedrandom from 'seedrandom';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Position {
  x: number;
  y: number;
}

interface BookmarkPosition {
  bookmarkId: string;
  position: Position;
  method: 'umap' | 'fallback';
}

interface ConceptPosition {
  conceptId: string;
  position: Position;
  connectedBookmarks: string[];
}

interface EntityPosition {
  entityId: string;
  position: Position;
  connectedBookmarks: string[];
}

export interface PositionData {
  timestamp: number;
  positions: {
    bookmarks: BookmarkPosition[];
    concepts: ConceptPosition[];
    entities: EntityPosition[];
  };
  metadata: {
    totalBookmarks: number;
    enrichedBookmarks: number;
    computeTimeMs: number;
  };
}

/**
 * ProjectionAgent - UMAP dimensionality reduction for semantic graph positioning
 *
 * Core Features:
 * - Projects 1536D embeddings to 2D coordinates using UMAP
 * - Positions concepts/entities radially around connected bookmarks
 * - Handles edge cases (un-enriched bookmarks, small datasets, timeouts)
 * - Deterministic results via seeded random number generation
 */
export class ProjectionAgent {
  private readonly MIN_BOOKMARKS_FOR_UMAP = 5;
  private readonly UMAP_TIMEOUT_MS = 15000; // 15 seconds
  private readonly CANVAS_WIDTH = 4000;
  private readonly CANVAS_HEIGHT = 3000;
  private readonly CANVAS_PADDING = 200;
  private readonly CONCEPT_RADIUS = 400; // Distance from bookmark (increased for better spacing)
  private readonly ENTITY_RADIUS = 500; // Slightly farther than concepts

  /**
   * Main entry point - compute all positions for a user's graph
   */
  async computeAllPositions(userId: string): Promise<PositionData> {
    const startTime = Date.now();

    console.log(`[ProjectionAgent] Computing positions for user ${userId}`);

    // Fetch all bookmarks with embeddings AND stored positions using raw SQL
    const bookmarksWithEmbeddings = await prisma.$queryRaw<
      Array<{
        id: string;
        embedding: string | null;
        graph_x: number | null;
        graph_y: number | null;
      }>
    >`
      SELECT id, embedding::text as embedding, graph_x, graph_y
      FROM bookmarks
      WHERE user_id = ${userId} AND embedding IS NOT NULL
    `;

    // Separate into positioned vs unpositioned bookmarks
    const positionedBookmarks = bookmarksWithEmbeddings.filter(
      (b) => b.graph_x !== null && b.graph_y !== null
    );
    const unpositionedBookmarks = bookmarksWithEmbeddings.filter(
      (b) => b.graph_x === null || b.graph_y === null
    );

    console.log(
      `[ProjectionAgent] - ${positionedBookmarks.length} bookmarks with stored positions`
    );
    console.log(
      `[ProjectionAgent] - ${unpositionedBookmarks.length} bookmarks need positioning`
    );

    // Use stored positions for already-positioned bookmarks (STABLE - never recalculate)
    let bookmarkPositions: BookmarkPosition[] = positionedBookmarks.map((b) => ({
      bookmarkId: b.id,
      position: { x: b.graph_x!, y: b.graph_y! },
      method: 'stored',
    }));

    // Only compute positions for NEW unpositioned bookmarks
    if (unpositionedBookmarks.length > 0) {
      const newPositions = await this.computeIncrementalPositions(
        unpositionedBookmarks,
        positionedBookmarks,
        userId
      );
      bookmarkPositions.push(...newPositions);

      // Save new positions to database
      await this.savePositionsToDatabase(newPositions);
    }

    // Create position map for radial spread
    const bookmarkPosMap = new Map<string, Position>(
      bookmarkPositions.map((p) => [p.bookmarkId, p.position])
    );

    // Compute concept and entity positions (radial spread around bookmarks)
    const { concepts, entities } = await this.computeRadialPositions(
      bookmarkPosMap,
      userId
    );

    const computeTimeMs = Date.now() - startTime;

    console.log(
      `[ProjectionAgent] UMAP completed in ${computeTimeMs}ms for ${bookmarkPositions.length} bookmarks, ${concepts.length} concepts, ${entities.length} entities`
    );

    return {
      timestamp: Date.now(),
      positions: {
        bookmarks: bookmarkPositions,
        concepts,
        entities,
      },
      metadata: {
        totalBookmarks: bookmarkPositions.length,
        enrichedBookmarks: bookmarkPositions.length,
        positionedBookmarks: positionedBookmarks.length,
        newlyPositioned: unpositionedBookmarks.length,
        computeTimeMs,
      },
    };
  }

  /**
   * UMAP projection: 1536D → 2D
   */
  private async computeUMAPPositions(
    enrichedBookmarks: Array<{ id: string; embedding: any }>,
    userId: string
  ): Promise<BookmarkPosition[]> {
    try {
      // Extract embeddings as matrix (N x 1536)
      const embeddings = enrichedBookmarks.map((b) => {
        // Parse embedding (stored as JSON string)
        if (typeof b.embedding === 'string') {
          return JSON.parse(b.embedding) as number[];
        }
        // Or convert from Buffer/object
        return Array.from(Object.values(b.embedding)) as number[];
      });

      // Validate embeddings
      const validEmbeddings = embeddings.filter(
        (emb) => emb.length === 1536 && emb.every((v) => typeof v === 'number')
      );

      if (validEmbeddings.length !== embeddings.length) {
        console.warn(
          `[ProjectionAgent] Invalid embeddings detected: ${embeddings.length - validEmbeddings.length} bookmarks skipped`
        );
      }

      if (validEmbeddings.length < this.MIN_BOOKMARKS_FOR_UMAP) {
        throw new Error('Not enough valid embeddings for UMAP');
      }

      // Initialize UMAP with parameters
      const umap = new UMAP({
        nComponents: 2, // 2D output
        nNeighbors: Math.min(15, validEmbeddings.length - 1), // Adaptive
        minDist: 0.3, // Spacing between clusters (increased for better separation)
        spread: 2.5, // Overall spread (increased for more spacing)
        nEpochs: 200, // Iterations (faster than default 400)
        random: seedrandom(userId), // Deterministic
      });

      // Fit and transform with timeout
      const projections = await this.computeUMAPWithTimeout(
        umap,
        validEmbeddings
      );

      if (!projections) {
        // Timeout occurred, use fallback
        console.warn('[ProjectionAgent] UMAP timeout, using fallback layout');
        return this.computeFallbackPositions(enrichedBookmarks);
      }

      // Normalize to canvas coordinates
      const normalized = this.normalizeToCanvas(projections);

      // Map back to bookmark IDs
      return enrichedBookmarks.slice(0, validEmbeddings.length).map((bookmark, i) => ({
        bookmarkId: bookmark.id,
        position: { x: normalized[i][0], y: normalized[i][1] },
        method: 'umap',
      }));
    } catch (error) {
      console.error('[ProjectionAgent] UMAP computation failed:', error);
      // Fallback to simple layout
      return this.computeFallbackPositions(enrichedBookmarks);
    }
  }

  /**
   * Run UMAP with timeout protection
   */
  private async computeUMAPWithTimeout(
    umap: UMAP,
    embeddings: number[][]
  ): Promise<number[][] | null> {
    const computePromise = Promise.resolve(umap.fit(embeddings));
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), this.UMAP_TIMEOUT_MS)
    );

    const result = await Promise.race([computePromise, timeoutPromise]);
    return result;
  }

  /**
   * Normalize UMAP projections to canvas coordinates (4000x3000)
   */
  private normalizeToCanvas(projections: number[][]): number[][] {
    if (projections.length === 0) return [];

    // Find min/max for each dimension
    const xValues = projections.map((p) => p[0]);
    const yValues = projections.map((p) => p[1]);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    // Avoid division by zero
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    console.log(`[ProjectionAgent] UMAP raw range: X=[${xMin.toFixed(3)}, ${xMax.toFixed(3)}] (range: ${xRange.toFixed(3)}), Y=[${yMin.toFixed(3)}, ${yMax.toFixed(3)}] (range: ${yRange.toFixed(3)})`);
    console.log(`[ProjectionAgent] First 3 raw UMAP coords:`, projections.slice(0, 3).map(p => `[${p[0].toFixed(3)}, ${p[1].toFixed(3)}]`).join(', '));

    // Scale to canvas with padding
    const normalized = projections.map(([x, y]) => [
      ((x - xMin) / xRange) * (this.CANVAS_WIDTH - 2 * this.CANVAS_PADDING) +
        this.CANVAS_PADDING,
      ((y - yMin) / yRange) *
        (this.CANVAS_HEIGHT - 2 * this.CANVAS_PADDING) +
        this.CANVAS_PADDING,
    ]);

    console.log(`[ProjectionAgent] First 3 normalized coords:`, normalized.slice(0, 3).map(p => `[${p[0].toFixed(1)}, ${p[1].toFixed(1)}]`).join(', '));

    return normalized;
  }

  /**
   * Fallback layout for enriched bookmarks when UMAP fails or dataset too small
   */
  private computeFallbackPositions(
    bookmarks: Array<{ id: string }>
  ): BookmarkPosition[] {
    // Simple grid layout in center of canvas
    const centerX = this.CANVAS_WIDTH / 2;
    const centerY = this.CANVAS_HEIGHT / 2;
    const gridSpacing = 200;
    const cols = Math.ceil(Math.sqrt(bookmarks.length));

    return bookmarks.map((bookmark, i) => ({
      bookmarkId: bookmark.id,
      position: {
        x: centerX + ((i % cols) - cols / 2) * gridSpacing,
        y: centerY + (Math.floor(i / cols) - cols / 2) * gridSpacing,
      },
      method: 'fallback',
    }));
  }

  /**
   * Compute positions for NEW bookmarks incrementally (stable positioning)
   * - If <5 total bookmarks: Run UMAP on all to establish initial layout
   * - If >=5 positioned bookmarks: Position new bookmarks using K-NN average
   */
  private async computeIncrementalPositions(
    unpositionedBookmarks: Array<{ id: string; embedding: string }>,
    positionedBookmarks: Array<{ id: string; embedding: string; graph_x: number; graph_y: number }>,
    userId: string
  ): Promise<BookmarkPosition[]> {
    const totalBookmarks = unpositionedBookmarks.length + positionedBookmarks.length;

    // If we have <5 total bookmarks, run UMAP on all to establish initial layout
    if (totalBookmarks < this.MIN_BOOKMARKS_FOR_UMAP) {
      console.log(`[ProjectionAgent] <5 total bookmarks, using fallback grid layout`);
      return this.computeFallbackPositions(unpositionedBookmarks);
    }

    // If we have <5 positioned bookmarks, run UMAP on all bookmarks
    if (positionedBookmarks.length < this.MIN_BOOKMARKS_FOR_UMAP) {
      console.log(`[ProjectionAgent] Initial UMAP layout for ${totalBookmarks} bookmarks`);
      const allBookmarks = [...positionedBookmarks, ...unpositionedBookmarks];
      return await this.computeUMAPPositions(allBookmarks, userId);
    }

    // Position new bookmarks using K-NN in embedding space
    console.log(`[ProjectionAgent] Positioning ${unpositionedBookmarks.length} new bookmarks using K-NN`);
    return this.positionUsingKNN(unpositionedBookmarks, positionedBookmarks);
  }

  /**
   * Position new bookmarks using K-Nearest Neighbors in embedding space
   */
  private positionUsingKNN(
    newBookmarks: Array<{ id: string; embedding: string }>,
    existingBookmarks: Array<{ id: string; embedding: string; graph_x: number; graph_y: number }>
  ): BookmarkPosition[] {
    const K = Math.min(5, existingBookmarks.length); // Use up to 5 nearest neighbors

    return newBookmarks.map((newBookmark) => {
      // Parse embedding
      const newEmbedding = JSON.parse(newBookmark.embedding) as number[];

      // Find K nearest neighbors by cosine similarity
      const neighbors = existingBookmarks
        .map((existing) => {
          const existingEmbedding = JSON.parse(existing.embedding) as number[];
          const similarity = this.cosineSimilarity(newEmbedding, existingEmbedding);
          return {
            ...existing,
            similarity,
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, K);

      // Weighted average of neighbor positions (inverse distance weighting)
      let totalWeight = 0;
      let weightedX = 0;
      let weightedY = 0;

      neighbors.forEach((neighbor) => {
        const weight = neighbor.similarity; // Higher similarity = higher weight
        totalWeight += weight;
        weightedX += neighbor.graph_x * weight;
        weightedY += neighbor.graph_y * weight;
      });

      // Calculate position
      const x = weightedX / totalWeight;
      const y = weightedY / totalWeight;

      // Add small jitter to avoid exact overlaps
      const jitterX = (Math.random() - 0.5) * 100;
      const jitterY = (Math.random() - 0.5) * 100;

      console.log(`[ProjectionAgent] Positioned bookmark ${newBookmark.id} near ${K} neighbors (avg similarity: ${(neighbors.reduce((sum, n) => sum + n.similarity, 0) / K).toFixed(3)})`);

      return {
        bookmarkId: newBookmark.id,
        position: {
          x: x + jitterX,
          y: y + jitterY,
        },
        method: 'knn',
      };
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Save computed positions to database (permanent storage)
   */
  private async savePositionsToDatabase(positions: BookmarkPosition[]): Promise<void> {
    console.log(`[ProjectionAgent] Saving ${positions.length} positions to database`);

    await Promise.all(
      positions.map((pos) =>
        prisma.bookmark.update({
          where: { id: pos.bookmarkId },
          data: {
            graphX: pos.position.x,
            graphY: pos.position.y,
            graphPositionedAt: new Date(),
          },
        })
      )
    );

    console.log(`[ProjectionAgent] Positions saved to database`);
  }

  /**
   * Radial spread: Position concepts/entities around connected bookmarks
   */
  private async computeRadialPositions(
    bookmarkPositions: Map<string, Position>,
    userId: string
  ): Promise<{ concepts: ConceptPosition[]; entities: EntityPosition[] }> {
    const positionedConcepts = new Map<string, Position>();
    const positionedEntities = new Map<string, Position>();

    // Track which bookmarks each concept/entity is connected to
    const conceptConnections = new Map<string, Array<{ bookmarkId: string; weight: number }>>();
    const entityConnections = new Map<string, Array<{ bookmarkId: string; weight: number }>>();

    // For each bookmark, collect its concepts and entities
    for (const [bookmarkId, bookmarkPos] of bookmarkPositions) {
      // Get concepts for this bookmark
      const conceptRels = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: bookmarkId,
          targetType: 'concept',
        },
        orderBy: { weight: 'desc' },
        take: 10, // Limit to top 10 concepts per bookmark
      });

      conceptRels.forEach((rel) => {
        const conceptId = rel.targetId;
        if (!conceptConnections.has(conceptId)) {
          conceptConnections.set(conceptId, []);
        }
        conceptConnections.get(conceptId)!.push({
          bookmarkId,
          weight: rel.weight || 0.5,
        });
      });

      // Get entities for this bookmark
      const entityRels = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: bookmarkId,
          targetType: 'entity',
        },
        orderBy: { weight: 'desc' },
        take: 10, // Limit to top 10 entities per bookmark
      });

      entityRels.forEach((rel) => {
        const entityId = rel.targetId;
        if (!entityConnections.has(entityId)) {
          entityConnections.set(entityId, []);
        }
        entityConnections.get(entityId)!.push({
          bookmarkId,
          weight: rel.weight || 0.5,
        });
      });
    }

    // Position concepts
    for (const [conceptId, connections] of conceptConnections) {
      const position = this.resolveMultiBookmarkPosition(
        connections,
        bookmarkPositions,
        this.CONCEPT_RADIUS
      );
      positionedConcepts.set(conceptId, position);
    }

    // Position entities
    for (const [entityId, connections] of entityConnections) {
      const position = this.resolveMultiBookmarkPosition(
        connections,
        bookmarkPositions,
        this.ENTITY_RADIUS
      );
      positionedEntities.set(entityId, position);
    }

    // Apply collision detection to prevent overlaps
    const allPositions = [
      ...Array.from(positionedConcepts.values()),
      ...Array.from(positionedEntities.values()),
    ];
    this.applyCollisionDetection(allPositions);

    return {
      concepts: Array.from(positionedConcepts.entries()).map(([id, pos]) => ({
        conceptId: id,
        position: pos,
        connectedBookmarks: (conceptConnections.get(id) || []).map(c => c.bookmarkId),
      })),
      entities: Array.from(positionedEntities.entries()).map(([id, pos]) => ({
        entityId: id,
        position: pos,
        connectedBookmarks: (entityConnections.get(id) || []).map(e => e.bookmarkId),
      })),
    };
  }

  /**
   * Resolve position for concept/entity connected to multiple bookmarks
   * Uses weighted average of top 5 strongest connections
   */
  private resolveMultiBookmarkPosition(
    connections: Array<{ bookmarkId: string; weight: number }>,
    bookmarkPositions: Map<string, Position>,
    radiusOffset: number
  ): Position {
    if (connections.length === 0) {
      // Fallback: center of canvas
      return { x: this.CANVAS_WIDTH / 2, y: this.CANVAS_HEIGHT / 2 };
    }

    if (connections.length === 1) {
      // Single connection: position radially around bookmark
      const { bookmarkId } = connections[0];
      const bookmarkPos = bookmarkPositions.get(bookmarkId);
      if (!bookmarkPos) {
        return { x: this.CANVAS_WIDTH / 2, y: this.CANVAS_HEIGHT / 2 };
      }

      // Random angle for variety
      const angle = Math.random() * 2 * Math.PI;
      return {
        x: bookmarkPos.x + radiusOffset * Math.cos(angle),
        y: bookmarkPos.y + radiusOffset * Math.sin(angle),
      };
    }

    // Multiple connections: weighted average of top 5
    const top5 = connections
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (const { bookmarkId, weight } of top5) {
      const pos = bookmarkPositions.get(bookmarkId);
      if (pos) {
        weightedX += pos.x * weight;
        weightedY += pos.y * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      return { x: this.CANVAS_WIDTH / 2, y: this.CANVAS_HEIGHT / 2 };
    }

    return {
      x: weightedX / totalWeight,
      y: weightedY / totalWeight,
    };
  }

  /**
   * Apply collision detection to prevent overlapping nodes
   */
  private applyCollisionDetection(
    positions: Position[],
    minDistance: number = 100
  ): void {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = this.distance(positions[i], positions[j]);

        if (dist < minDistance && dist > 0) {
          // Add jitter to second node
          positions[j].x += (Math.random() - 0.5) * 50;
          positions[j].y += (Math.random() - 0.5) * 50;
        }
      }
    }
  }

  /**
   * Calculate Euclidean distance between two positions
   */
  private distance(pos1: Position, pos2: Position): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// Export singleton instance
export const projectionAgent = new ProjectionAgent();
