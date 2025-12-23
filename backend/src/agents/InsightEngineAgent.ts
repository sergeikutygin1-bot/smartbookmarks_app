import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface Insight {
  id: string;
  userId: string;
  insightType: 'trending_topic' | 'knowledge_gap' | 'surprising_connection' | 'recommendation';
  title: string;
  description: string;
  confidenceScore: number;
  metadata: any;
  expiresAt: Date;
}

export class InsightEngineAgent {
  /**
   * Generate all insights for a user
   */
  async generateInsights(userId: string): Promise<Insight[]> {
    console.log(`[InsightEngine] Generating insights for user ${userId}`);

    const insights: Insight[] = [];

    // Generate different types of insights
    const trending = await this.generateTrendingTopics(userId);
    const gaps = await this.generateKnowledgeGaps(userId);
    const connections = await this.generateSurprisingConnections(userId);
    const recommendations = await this.generateRecommendations(userId);

    insights.push(...trending, ...gaps, ...connections, ...recommendations);

    // Store insights in database
    await this.storeInsights(insights);

    console.log(`[InsightEngine] Generated ${insights.length} insights`);
    return insights;
  }

  /**
   * Generate trending topic insights
   * Analyzes which topics are being saved more frequently recently
   */
  private async generateTrendingTopics(userId: string): Promise<Insight[]> {
    const insights: Insight[] = [];

    try {
      // Get bookmarks from last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get recent and baseline bookmarks
      const recentBookmarks = await prisma.bookmark.findMany({
        where: {
          userId,
          createdAt: { gte: sevenDaysAgo },
        },
        select: { id: true },
      });

      const baselineBookmarks = await prisma.bookmark.findMany({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
        },
        select: { id: true },
      });

      // Get relationships for these bookmarks
      const recentBookmarkIds = recentBookmarks.map((b) => b.id);
      const baselineBookmarkIds = baselineBookmarks.map((b) => b.id);

      const recentRelationships = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: { in: recentBookmarkIds },
          targetType: 'concept',
        },
      });

      const baselineRelationships = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: { in: baselineBookmarkIds },
          targetType: 'concept',
        },
      });

      // Get all concept IDs
      const allConceptIds = new Set([
        ...recentRelationships.map((r) => r.targetId),
        ...baselineRelationships.map((r) => r.targetId),
      ]);

      const concepts = await prisma.concept.findMany({
        where: {
          id: { in: Array.from(allConceptIds) },
        },
      });

      const conceptMap = new Map(concepts.map((c) => [c.id, c]));

      // Count concepts
      const recentConceptCounts = new Map<string, { name: string; count: number }>();
      const baselineConceptCounts = new Map<string, number>();

      recentRelationships.forEach((rel) => {
        const concept = conceptMap.get(rel.targetId);
        if (concept) {
          const current = recentConceptCounts.get(concept.id) || {
            name: concept.name,
            count: 0,
          };
          current.count++;
          recentConceptCounts.set(concept.id, current);
        }
      });

      baselineRelationships.forEach((rel) => {
        const concept = conceptMap.get(rel.targetId);
        if (concept) {
          const count = baselineConceptCounts.get(concept.id) || 0;
          baselineConceptCounts.set(concept.id, count + 1);
        }
      });

      // Find trending (2x increase or more)
      recentConceptCounts.forEach((data, conceptId) => {
        const baselineCount = baselineConceptCounts.get(conceptId) || 0;
        const baselineWeekly = baselineCount / 3; // 3 weeks average

        if (data.count > baselineWeekly * 1.5 && data.count >= 2) {
          const growthPercent = Math.round(((data.count - baselineWeekly) / Math.max(baselineWeekly, 1)) * 100);

          insights.push({
            id: `trending-${conceptId}`,
            userId,
            insightType: 'trending_topic',
            title: `${data.name} Trending`,
            description: `You've saved ${data.count} bookmarks about ${data.name} this week, up from ${baselineWeekly.toFixed(1)}/week average`,
            confidenceScore: Math.min(0.95, 0.6 + (growthPercent / 500)),
            metadata: {
              conceptId,
              conceptName: data.name,
              currentCount: data.count,
              previousAverage: baselineWeekly,
              growthPercent,
            },
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          });
        }
      });
    } catch (error) {
      console.error('[InsightEngine] Error generating trending topics:', error);
    }

    return insights.slice(0, 3); // Top 3
  }

  /**
   * Generate knowledge gap insights
   * Identifies missing topics based on existing interests
   */
  private async generateKnowledgeGaps(userId: string): Promise<Insight[]> {
    const insights: Insight[] = [];

    try {
      // Get user's top concepts
      const userConcepts = await prisma.concept.findMany({
        where: { userId },
        orderBy: { occurrenceCount: 'desc' },
        take: 10,
      });

      if (userConcepts.length === 0) return [];

      // Find related concepts (would normally use semantic similarity)
      // For now, use simple rules based on concept names
      const conceptMap: Record<string, string[]> = {
        'Frontend Development': ['Testing', 'Performance', 'Accessibility', 'State Management'],
        'Backend Development': ['DevOps', 'Monitoring', 'Security', 'Scaling'],
        'Artificial Intelligence': ['MLOps', 'Model Deployment', 'Data Engineering', 'Ethics'],
        'React': ['Testing Library', 'Performance Optimization', 'Server Components'],
        'TypeScript': ['Advanced Types', 'Generics', 'Decorators'],
        'Node.js': ['Clustering', 'Worker Threads', 'Performance Tuning'],
      };

      for (const concept of userConcepts) {
        const relatedTopics = conceptMap[concept.name];
        if (!relatedTopics) continue;

        // Check if user has bookmarks about these topics
        for (const topic of relatedTopics) {
          const hasContent = await prisma.concept.findFirst({
            where: {
              userId,
              normalizedName: topic.toLowerCase(),
            },
          });

          if (!hasContent) {
            insights.push({
              id: `gap-${concept.id}-${topic}`,
              userId,
              insightType: 'knowledge_gap',
              title: `Missing: ${topic}`,
              description: `You have ${concept.occurrenceCount} bookmarks about ${concept.name} but none about ${topic}`,
              confidenceScore: 0.7 + (concept.occurrenceCount / 100),
              metadata: {
                baseConceptId: concept.id,
                baseConcept: concept.name,
                suggestedTopic: topic,
                baseCount: concept.occurrenceCount,
              },
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            });
            break; // One gap per base concept
          }
        }
      }
    } catch (error) {
      console.error('[InsightEngine] Error generating knowledge gaps:', error);
    }

    return insights.slice(0, 2); // Top 2
  }

  /**
   * Generate surprising connection insights
   * Finds unexpected relationships between different topics
   */
  private async generateSurprisingConnections(userId: string): Promise<Insight[]> {
    const insights: Insight[] = [];

    try {
      // Find bookmarks that belong to multiple concepts from different domains
      const bookmarks = await prisma.bookmark.findMany({
        where: { userId },
        select: { id: true },
      });

      const bookmarkIds = bookmarks.map((b) => b.id);

      // Get all relationships to concepts
      const relationships = await prisma.relationship.findMany({
        where: {
          userId,
          sourceType: 'bookmark',
          sourceId: { in: bookmarkIds },
          targetType: 'concept',
        },
      });

      // Get all concepts
      const conceptIds = Array.from(new Set(relationships.map((r) => r.targetId)));
      const concepts = await prisma.concept.findMany({
        where: { id: { in: conceptIds } },
      });

      const conceptMap = new Map(concepts.map((c) => [c.id, c]));

      // Group relationships by bookmark
      const bookmarkConcepts = new Map<string, string[]>();
      relationships.forEach((rel) => {
        const concept = conceptMap.get(rel.targetId);
        if (concept) {
          const existing = bookmarkConcepts.get(rel.sourceId) || [];
          existing.push(concept.name);
          bookmarkConcepts.set(rel.sourceId, existing);
        }
      });

      // Look for bookmarks with concepts from different domains
      const conceptPairs = new Map<string, { concepts: string[]; count: number }>();

      bookmarkConcepts.forEach((concepts, bookmarkId) => {
        if (concepts.length >= 2) {
          // Create pairs
          for (let i = 0; i < concepts.length; i++) {
            for (let j = i + 1; j < concepts.length; j++) {
              const key = [concepts[i], concepts[j]].sort().join('|');
              const existing = conceptPairs.get(key) || {
                concepts: [concepts[i], concepts[j]],
                count: 0,
              };
              existing.count++;
              conceptPairs.set(key, existing);
            }
          }
        }
      });

      // Find pairs with at least 2 bookmarks
      conceptPairs.forEach((data, key) => {
        if (data.count >= 2) {
          insights.push({
            id: `connection-${key}`,
            userId,
            insightType: 'surprising_connection',
            title: 'Cross-Domain Pattern',
            description: `${data.count} of your bookmarks connect ${data.concepts[0]} and ${data.concepts[1]}`,
            confidenceScore: 0.65 + (data.count / 20),
            metadata: {
              concepts: data.concepts,
              bookmarkCount: data.count,
            },
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }
      });
    } catch (error) {
      console.error('[InsightEngine] Error generating connections:', error);
    }

    return insights.slice(0, 2); // Top 2
  }

  /**
   * Generate recommendation insights
   * Suggests content based on clusters and interests
   */
  private async generateRecommendations(userId: string): Promise<Insight[]> {
    const insights: Insight[] = [];

    try {
      // Get user's top concepts
      const topConcepts = await prisma.concept.findMany({
        where: { userId },
        orderBy: { occurrenceCount: 'desc' },
        take: 5,
      });

      // Simple recommendations based on concept popularity
      const recommendations: Record<string, string> = {
        'Frontend Development': 'Advanced React patterns and performance optimization',
        'Backend Development': 'Microservices architecture and API design patterns',
        'Artificial Intelligence': 'Production ML systems and MLOps practices',
        'React': 'Next.js 14 App Router and Server Components',
        'TypeScript': 'Advanced type system features and decorators',
      };

      topConcepts.forEach((concept) => {
        const suggestion = recommendations[concept.name];
        if (suggestion) {
          insights.push({
            id: `rec-${concept.id}`,
            userId,
            insightType: 'recommendation',
            title: `Explore ${suggestion}`,
            description: `Based on your ${concept.occurrenceCount} bookmarks about ${concept.name}`,
            confidenceScore: 0.65 + (concept.occurrenceCount / 50),
            metadata: {
              baseConceptId: concept.id,
              baseConcept: concept.name,
              suggestion,
            },
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          });
        }
      });
    } catch (error) {
      console.error('[InsightEngine] Error generating recommendations:', error);
    }

    return insights.slice(0, 2); // Top 2
  }

  /**
   * Store insights in database
   */
  private async storeInsights(insights: Insight[]): Promise<void> {
    try {
      // Delete old insights for this user
      if (insights.length > 0) {
        await prisma.graphInsight.deleteMany({
          where: { userId: insights[0].userId },
        });

        // Create new insights
        await prisma.graphInsight.createMany({
          data: insights.map((insight) => ({
            id: insight.id,
            userId: insight.userId,
            insightType: insight.insightType,
            title: insight.title,
            description: insight.description,
            confidenceScore: insight.confidenceScore,
            metadata: insight.metadata,
            expiresAt: insight.expiresAt,
          })),
        });
      }
    } catch (error) {
      console.error('[InsightEngine] Error storing insights:', error);
    }
  }

  /**
   * Get stored insights for a user
   */
  async getInsights(userId: string): Promise<Insight[]> {
    const insights = await prisma.graphInsight.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { confidenceScore: 'desc' },
    });

    return insights as Insight[];
  }
}

export const insightEngineAgent = new InsightEngineAgent();
