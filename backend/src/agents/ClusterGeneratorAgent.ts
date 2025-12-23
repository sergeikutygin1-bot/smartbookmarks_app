import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface BookmarkWithEmbedding {
  id: string;
  title: string;
  summary: string | null;
  embedding: number[];
}

interface ClusterGroup {
  bookmarks: BookmarkWithEmbedding[];
  centroid: number[];
  coherenceScore: number;
}

export class ClusterGeneratorAgent {
  /**
   * Generate clusters for a user's bookmarks
   */
  async generateClusters(userId: string, minClusterSize: number = 3): Promise<void> {
    console.log(`[ClusterGenerator] Generating clusters for user ${userId}`);

    try {
      // Get all bookmarks with embeddings
      const bookmarks = await this.getBookmarksWithEmbeddings(userId);

      if (bookmarks.length < minClusterSize * 2) {
        console.log(`[ClusterGenerator] Not enough bookmarks (${bookmarks.length}) to cluster`);
        return;
      }

      // Perform simple clustering (k-means-like approach)
      const numClusters = Math.min(Math.floor(bookmarks.length / minClusterSize), 10);
      const clusters = await this.simpleKMeansClustering(bookmarks, numClusters, minClusterSize);

      console.log(`[ClusterGenerator] Created ${clusters.length} clusters`);

      // Delete old clusters for this user
      await prisma.cluster.deleteMany({
        where: { userId },
      });

      // Create new clusters
      for (const cluster of clusters) {
        const { name, description } = await this.generateClusterName(cluster.bookmarks);

        const createdCluster = await prisma.cluster.create({
          data: {
            userId,
            name,
            description,
            bookmarkCount: cluster.bookmarks.length,
            coherenceScore: cluster.coherenceScore,
          },
        });

        // Update centroid embedding using raw SQL
        const centroidStr = `[${cluster.centroid.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE clusters
          SET centroid_embedding = ${centroidStr}::vector
          WHERE id = ${createdCluster.id}
        `;

        // Assign bookmarks to cluster
        await prisma.bookmark.updateMany({
          where: {
            id: { in: cluster.bookmarks.map((b) => b.id) },
          },
          data: {
            clusterId: createdCluster.id,
          },
        });

        console.log(
          `[ClusterGenerator] Created cluster "${name}" with ${cluster.bookmarks.length} bookmarks (coherence: ${cluster.coherenceScore.toFixed(2)})`
        );
      }

      console.log(`[ClusterGenerator] Clustering complete`);
    } catch (error) {
      console.error('[ClusterGenerator] Error generating clusters:', error);
      throw error;
    }
  }

  /**
   * Get bookmarks with embeddings
   */
  private async getBookmarksWithEmbeddings(userId: string): Promise<BookmarkWithEmbedding[]> {
    const bookmarks = await prisma.$queryRaw<any[]>`
      SELECT id, title, summary, embedding::text
      FROM bookmarks
      WHERE user_id = ${userId}
        AND embedding IS NOT NULL
        AND status = 'completed'
      ORDER BY created_at DESC
    `;

    return bookmarks.map((b) => ({
      id: b.id,
      title: b.title,
      summary: b.summary,
      embedding: this.parseVector(b.embedding),
    }));
  }

  /**
   * Parse vector string to array
   */
  private parseVector(vectorStr: string): number[] {
    // Vector is stored as "[0.1, 0.2, ...]"
    return JSON.parse(vectorStr);
  }

  /**
   * Simple k-means clustering
   */
  private async simpleKMeansClustering(
    bookmarks: BookmarkWithEmbedding[],
    k: number,
    minClusterSize: number
  ): Promise<ClusterGroup[]> {
    // Initialize centroids randomly
    const centroids: number[][] = [];
    const shuffled = [...bookmarks].sort(() => Math.random() - 0.5);
    for (let i = 0; i < k; i++) {
      centroids.push([...shuffled[i].embedding]);
    }

    let assignments: number[] = new Array(bookmarks.length).fill(0);
    let iterations = 0;
    const maxIterations = 50;

    // K-means iterations
    while (iterations < maxIterations) {
      // Assign each bookmark to nearest centroid
      const newAssignments = bookmarks.map((bookmark) => {
        let minDist = Infinity;
        let closestCluster = 0;

        for (let i = 0; i < centroids.length; i++) {
          const dist = this.cosineSimilarity(bookmark.embedding, centroids[i]);
          if (dist < minDist) {
            minDist = dist;
            closestCluster = i;
          }
        }

        return closestCluster;
      });

      // Check for convergence
      if (JSON.stringify(newAssignments) === JSON.stringify(assignments)) {
        break;
      }

      assignments = newAssignments;

      // Update centroids
      for (let i = 0; i < k; i++) {
        const clusterBookmarks = bookmarks.filter((_, idx) => assignments[idx] === i);
        if (clusterBookmarks.length > 0) {
          centroids[i] = this.calculateCentroid(clusterBookmarks.map((b) => b.embedding));
        }
      }

      iterations++;
    }

    // Create cluster groups
    const clusters: ClusterGroup[] = [];
    for (let i = 0; i < k; i++) {
      const clusterBookmarks = bookmarks.filter((_, idx) => assignments[idx] === i);

      // Only include clusters with minimum size
      if (clusterBookmarks.length >= minClusterSize) {
        const coherenceScore = this.calculateCoherence(
          clusterBookmarks.map((b) => b.embedding),
          centroids[i]
        );

        clusters.push({
          bookmarks: clusterBookmarks,
          centroid: centroids[i],
          coherenceScore,
        });
      }
    }

    return clusters;
  }

  /**
   * Calculate centroid (average) of embeddings
   */
  private calculateCentroid(embeddings: number[][]): number[] {
    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Calculate cosine distance (1 - cosine similarity)
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

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity; // Return distance
  }

  /**
   * Calculate cluster coherence (average similarity to centroid)
   */
  private calculateCoherence(embeddings: number[][], centroid: number[]): number {
    const similarities = embeddings.map((embedding) => {
      return 1 - this.cosineSimilarity(embedding, centroid); // Convert distance back to similarity
    });

    const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
    return Math.max(0, Math.min(1, avgSimilarity)); // Clamp to [0, 1]
  }

  /**
   * Generate cluster name using LLM
   */
  private async generateClusterName(
    bookmarks: BookmarkWithEmbedding[]
  ): Promise<{ name: string; description: string }> {
    // Get representative bookmarks (max 10)
    const representative = bookmarks.slice(0, 10);

    const bookmarkList = representative
      .map((b, i) => `${i + 1}. ${b.title}${b.summary ? `\n   Summary: ${b.summary.slice(0, 150)}...` : ''}`)
      .join('\n\n');

    const prompt = `Analyze these bookmarks and generate a concise cluster name and description.

Bookmarks:
${bookmarkList}

Generate:
1. A short, descriptive name (2-5 words) that captures the common theme
2. A one-sentence description of what these bookmarks are about

Respond in JSON format:
{
  "name": "Cluster Name",
  "description": "Brief description of the cluster theme"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        name: result.name || 'Unnamed Cluster',
        description: result.description || 'A collection of related bookmarks',
      };
    } catch (error) {
      console.error('[ClusterGenerator] Error generating cluster name:', error);
      // Fallback: Use most common words from titles
      const words = representative
        .flatMap((b) => b.title.split(/\s+/))
        .filter((w) => w.length > 3);
      const topWord = words[0] || 'Bookmarks';
      return {
        name: `${topWord} Cluster`,
        description: `Collection of ${bookmarks.length} related bookmarks`,
      };
    }
  }
}

export const clusterGeneratorAgent = new ClusterGeneratorAgent();
