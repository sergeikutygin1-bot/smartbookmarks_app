import OpenAI from 'openai';
import prisma from '../db/prisma';
import dotenv from 'dotenv';
import { CanonicalizationService } from '../services/CanonicalizationService';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

/**
 * Extracted concept structure
 */
export interface ExtractedConcept {
  name: string; // Original concept name
  normalizedName: string; // Lowercase, cleaned
  parentConcept?: string; // Parent concept (if hierarchical)
  confidence: number; // 0-1
  relevance: number; // How relevant to the bookmark
}

/**
 * Concept analysis result
 */
export interface ConceptAnalysisResult {
  concepts: ExtractedConcept[];
  hierarchy: ConceptHierarchy[];
  method: 'gpt' | 'bertopic'; // Which method was used
  processingTime: number;
  cost?: number;
}

/**
 * Concept hierarchy (parent-child relationships)
 */
export interface ConceptHierarchy {
  parent: string;
  children: string[];
}

/**
 * Concept Analyzer Agent
 *
 * Hybrid approach:
 * - Tier 1: GPT-4o-mini (primary, flexible)
 * - Future: BERTopic for batch clustering across user's bookmarks
 *
 * Extracts abstract topics and concepts from bookmark content:
 * - High-level topics (e.g., "Machine Learning", "Web Development")
 * - Subtopics (e.g., "Neural Networks" under "Machine Learning")
 * - Concept hierarchies (parent-child relationships)
 *
 * Features:
 * - Concept normalization (lowercase, dedupe)
 * - Hierarchy building (detect parent-child relationships)
 * - Confidence and relevance scoring
 * - Cost tracking
 */
export class ConceptAnalyzerAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Analyze concepts from bookmark content
   *
   * @param content - Text to analyze (title + summary + key points)
   * @param embedding - Vector embedding (for future BERTopic integration)
   * @returns Analysis result with concepts and hierarchy
   */
  async analyze(
    content: string,
    embedding?: number[]
  ): Promise<ConceptAnalysisResult> {
    const startTime = Date.now();

    // For now, use GPT for all analysis
    // TODO: Add BERTopic tier for batch clustering across user's bookmarks
    const result = await this.analyzeWithGPT(content);

    const processingTime = Date.now() - startTime;

    return {
      ...result,
      processingTime,
    };
  }

  /**
   * Analyze concepts using GPT-4o-mini
   */
  private async analyzeWithGPT(content: string): Promise<{
    concepts: ExtractedConcept[];
    hierarchy: ConceptHierarchy[];
    method: 'gpt';
    cost: number;
  }> {
    const prompt = `Analyze this content and extract ALL relevant concepts and topics. Be thorough and comprehensive. Focus on:

**High-Level Topics**: Broad categories (e.g., "Machine Learning", "Web Development", "Political Science", "International Relations")
**Subtopics**: More specific concepts (e.g., "Neural Networks", "React Hooks", "Opposition Movements", "Geopolitical Strategy")
**Domain-Specific Concepts**: Field-specific ideas, theories, methodologies
**Thematic Concepts**: Key themes, issues, problems discussed
**Hierarchies**: Parent-child relationships (e.g., "Opposition Strategy" → "Political Activism" → "Political Science")

Content:
"""
${content.slice(0, 4000)}
"""

Return a JSON object with:
- concepts: Array of concepts with name, parent (if subtopic), and relevance (0-1 score)
- hierarchy: Array showing parent-child relationships

Guidelines:
- Extract AT LEAST 5-10 concepts (be comprehensive, not conservative)
- Focus on abstract topics, not concrete entities (people/companies are handled elsewhere)
- Use clear, concise concept names (2-4 words max)
- Identify hierarchies where applicable
- Include both broad themes AND specific subtopics
- Assign relevance scores based on how central the concept is to the content
- Capture the full intellectual landscape of the content

Example format:
{
  "concepts": [
    {"name": "Political Opposition", "parent": null, "relevance": 0.95},
    {"name": "Civil Resistance", "parent": "Political Opposition", "relevance": 0.85},
    {"name": "Authoritarian Regimes", "parent": null, "relevance": 0.90},
    {"name": "Democratic Transitions", "parent": "Political Opposition", "relevance": 0.75},
    {"name": "Strategic Communication", "parent": null, "relevance": 0.80}
  ],
  "hierarchy": [
    {"parent": "Political Opposition", "children": ["Civil Resistance", "Democratic Transitions"]},
    {"parent": "Authoritarian Regimes", "children": []}
  ]
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at identifying abstract concepts and building knowledge hierarchies. Extract only clear, meaningful concepts that help organize and understand content.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2, // Low temperature for consistency
      max_tokens: 800,
    });

    // Parse response
    const responseText = response.choices[0].message.content || '{"concepts": [], "hierarchy": []}';
    let rawConcepts: Array<{ name: string; parent?: string | null; relevance?: number }> = [];
    let rawHierarchy: ConceptHierarchy[] = [];

    try {
      const parsed = JSON.parse(responseText);
      rawConcepts = parsed.concepts || [];
      rawHierarchy = parsed.hierarchy || [];
    } catch (error) {
      console.error('[ConceptAnalyzer] Failed to parse GPT response:', error);
      rawConcepts = [];
      rawHierarchy = [];
    }

    // Normalize and deduplicate concepts
    const concepts = this.normalizeAndDeduplicate(
      rawConcepts.map((c) => ({
        name: c.name,
        parentConcept: c.parent || undefined,
        relevance: c.relevance || 0.7,
      }))
    );

    // Calculate cost
    const cost = this.calculateCost(
      response.usage?.prompt_tokens || 0,
      response.usage?.completion_tokens || 0
    );

    return {
      concepts,
      hierarchy: rawHierarchy,
      method: 'gpt',
      cost,
    };
  }

  /**
   * Normalize concept names and deduplicate
   */
  private normalizeAndDeduplicate(
    rawConcepts: Array<{ name: string; parentConcept?: string; relevance: number }>
  ): ExtractedConcept[] {
    const conceptMap = new Map<string, ExtractedConcept>();

    for (const concept of rawConcepts) {
      const normalized = this.normalizeConceptName(concept.name);

      if (!normalized) continue; // Skip invalid concepts

      // Normalize parent concept name too
      const normalizedParent = concept.parentConcept
        ? this.normalizeConceptName(concept.parentConcept)
        : undefined;

      if (conceptMap.has(normalized)) {
        // Merge duplicate concept (take higher relevance)
        const existing = conceptMap.get(normalized)!;
        existing.relevance = Math.max(existing.relevance, concept.relevance);
      } else {
        // Add new concept
        conceptMap.set(normalized, {
          name: concept.name,
          normalizedName: normalized,
          parentConcept: normalizedParent,
          confidence: 0.85, // GPT-4o-mini is reliable
          relevance: concept.relevance,
        });
      }
    }

    // Return concepts sorted by relevance (most relevant first)
    return Array.from(conceptMap.values()).sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Normalize concept name
   */
  private normalizeConceptName(name: string): string | null {
    let normalized = name.trim();

    // Skip empty or very short names
    if (normalized.length < 2) return null;

    // Convert to lowercase for storage (standardization)
    normalized = normalized.toLowerCase();

    // Skip overly generic terms
    const genericTerms = [
      'topic',
      'concept',
      'idea',
      'thing',
      'stuff',
      'content',
      'information',
      'data',
    ];
    if (genericTerms.includes(normalized)) return null;

    // Clean whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Calculate GPT cost
   * GPT-4o-mini pricing: $0.150 per 1M input tokens, $0.600 per 1M output tokens
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.6;
    return inputCost + outputCost;
  }

  /**
   * Save concepts to database (with hierarchy)
   *
   * @param concepts - Extracted concepts
   * @param bookmarkId - Bookmark to associate concepts with
   * @param userId - User ID for isolation
   */
  async saveConcepts(
    concepts: ExtractedConcept[],
    bookmarkId: string,
    userId: string,
    embedding?: number[]
  ): Promise<void> {
    if (concepts.length === 0) {
      console.log(`[ConceptAnalyzer] No concepts to save for bookmark ${bookmarkId}`);
      return;
    }

    console.log(`[ConceptAnalyzer] Saving ${concepts.length} concepts for bookmark ${bookmarkId}`);

    // DEDUPLICATION: Remove concepts that overlap with entities
    // Entities are more specific (e.g., "React" as technology) than concepts (e.g., "React" as topic)
    // So we prioritize entities and skip overlapping concepts to avoid redundancy
    const entityRelationships = await prisma.relationship.findMany({
      where: {
        userId,
        sourceType: 'bookmark',
        sourceId: bookmarkId,
        targetType: 'entity',
      },
    });

    if (entityRelationships.length > 0) {
      const entities = await prisma.entity.findMany({
        where: {
          id: { in: entityRelationships.map(rel => rel.targetId) },
        },
      });

      // Create set of entity names (normalized lowercase) for fast lookup
      const entityNames = new Set(
        entities.flatMap(e => [
          e.name.toLowerCase(),
          e.canonicalName.toLowerCase(),
          ...e.aliases.map(a => a.toLowerCase()),
        ])
      );

      // Filter out concepts that match entity names
      const beforeCount = concepts.length;
      concepts = concepts.filter(concept => {
        const conceptNormalized = concept.name.toLowerCase();
        const isOverlap = entityNames.has(conceptNormalized);

        if (isOverlap) {
          console.log(
            `[ConceptAnalyzer] ⚠️  Skipping concept "${concept.name}" - overlaps with entity`
          );
        }

        return !isOverlap;
      });

      const removedCount = beforeCount - concepts.length;
      if (removedCount > 0) {
        console.log(
          `[ConceptAnalyzer] ✓ Removed ${removedCount} overlapping concept(s), ${concepts.length} remain`
        );
      }
    }

    // If all concepts were filtered out, nothing left to save
    if (concepts.length === 0) {
      console.log(`[ConceptAnalyzer] No concepts to save after deduplication for bookmark ${bookmarkId}`);
      return;
    }

    const canonicalService = new CanonicalizationService();

    // Two-pass approach:
    // Pass 1: Create all concepts (without parent references)
    // Pass 2: Update parent references

    const createdConcepts = new Map<string, string>(); // canonicalName -> id
    const conceptMap = new Map<string, any>(); // Store canonicalized concepts for parent mapping

    // Pass 1: Create/update all concepts with canonicalization
    for (const concept of concepts) {
      try {
        // Phase 2: Canonicalize concept before saving
        const canonical = await canonicalService.resolveConcept(
          concept.name,
          '',  // Description will be added in Phase 3
          embedding || null,
          userId
        );

        // Add current mention to aliases
        const aliases = new Set([...canonical.aliases, concept.name]);
        if (concept.normalizedName) aliases.add(concept.normalizedName);

        const dbConcept = await prisma.concept.upsert({
          where: {
            userId_canonicalName: {
              userId,
              canonicalName: canonical.canonicalName,
            },
          },
          create: {
            id: canonical.id || uuidv4(),
            userId,
            name: canonical.canonicalName, // Use canonical name
            normalizedName: canonical.canonicalName.toLowerCase(),
            canonicalName: canonical.canonicalName,
            aliases: Array.from(aliases),
            description: canonical.description,
            popularity: 1,
            occurrenceCount: 1,
          },
          update: {
            occurrenceCount: { increment: 1 },
            popularity: { increment: 1 },
            aliases: Array.from(aliases), // Merge aliases
            description: canonical.description || undefined,
          },
        });

        console.log(
          `[ConceptAnalyzer] ✓ Saved concept "${dbConcept.canonicalName}" (ID: ${dbConcept.id})`
        );

        createdConcepts.set(canonical.canonicalName, dbConcept.id);
        conceptMap.set(concept.name, { canonical, dbConcept });

        // Create relationship: bookmark -> concept
        console.log(
          `[ConceptAnalyzer] Creating relationship: bookmark ${bookmarkId} -> concept ${dbConcept.id}`
        );
        const relationship = await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId,
              sourceType: 'bookmark',
              sourceId: bookmarkId,
              targetType: 'concept',
              targetId: dbConcept.id,
              relationshipType: 'about',
            },
          },
          create: {
            userId,
            sourceType: 'bookmark',
            sourceId: bookmarkId,
            targetType: 'concept',
            targetId: dbConcept.id,
            relationshipType: 'about',
            weight: concept.relevance,
            metadata: {
              confidence: concept.confidence,
              canonicalMethod: canonical.method,
            },
          },
          update: {
            weight: concept.relevance,
            metadata: {
              confidence: concept.confidence,
            },
          },
        });

        console.log(
          `[ConceptAnalyzer] ✓ Created relationship: bookmark ${bookmarkId} -> concept ${dbConcept.id} (relationship ID: ${relationship.id})`
        );
      } catch (error) {
        console.error(
          `[ConceptAnalyzer] Failed to save concept ${concept.name}:`,
          error
        );
        // Continue with other concepts even if one fails
      }
    }

    // Pass 2: Update parent-child relationships
    for (const concept of concepts) {
      if (!concept.parentConcept) continue;

      try {
        // Get canonical child concept
        const childData = conceptMap.get(concept.name);
        if (!childData) continue;

        const childId = childData.dbConcept.id;

        // Canonicalize parent concept name to find its ID
        const parentCanonical = await canonicalService.resolveConcept(
          concept.parentConcept,
          '',
          embedding || null,
          userId
        );

        const parentId = createdConcepts.get(parentCanonical.canonicalName);

        if (!childId || !parentId) {
          console.warn(
            `[ConceptAnalyzer] Cannot create hierarchy: ${concept.name} -> ${concept.parentConcept} (missing IDs)`
          );
          continue;
        }

        // Update concept with parent reference
        await prisma.concept.update({
          where: { id: childId },
          data: {
            parentConceptId: parentId,
          },
        });

        // Create relationship: child concept -> parent concept
        await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId,
              sourceType: 'concept',
              sourceId: childId,
              targetType: 'concept',
              targetId: parentId,
              relationshipType: 'related_to',
            },
          },
          create: {
            userId,
            sourceType: 'concept',
            sourceId: childId,
            targetType: 'concept',
            targetId: parentId,
            relationshipType: 'related_to',
            weight: 1.0, // Strong relationship (parent-child)
            metadata: {
              hierarchyType: 'parent-child',
            },
          },
          update: {
            weight: 1.0,
          },
        });
      } catch (error) {
        console.error(
          `[ConceptAnalyzer] Failed to create hierarchy for ${concept.name}:`,
          error
        );
        // Continue with other concepts even if one fails
      }
    }

    // Pass 3: Generate embeddings for new concepts
    // Generate embeddings for concepts that don't have them yet
    for (const concept of concepts) {
      const canonical = conceptMap.get(concept.name)?.canonical;
      if (!canonical) continue;

      const conceptId = createdConcepts.get(canonical.canonicalName);
      if (!conceptId) continue;

      const dbConcept = await prisma.concept.findUnique({
        where: { id: conceptId },
        select: { embedding: true },
      });

      if (!dbConcept?.embedding) {
        try {
          const embedding = await this.generateConceptEmbedding(conceptId, userId);
          if (embedding) {
            const embeddingStr = `[${embedding.join(',')}]`;
            await prisma.$executeRaw`
              UPDATE concepts SET embedding = ${embeddingStr}::vector
              WHERE id = ${conceptId}
            `;
            console.log(`[ConceptAnalyzer] ✓ Generated embedding for concept "${canonical.canonicalName}"`);
          }
        } catch (error) {
          console.error(`[ConceptAnalyzer] Failed to generate concept embedding:`, error);
          // Continue with other concepts even if embedding fails
        }
      }
    }

    // Cleanup canonicalization service
    await canonicalService.disconnect();

    console.log(`[ConceptAnalyzer] ✓ Concepts saved successfully with hierarchy and embeddings`);
  }

  /**
   * Find related concepts (co-occurrence analysis)
   *
   * Given a concept, find other concepts that frequently appear together
   * across the user's bookmarks.
   *
   * @param conceptId - Concept to find relations for
   * @param userId - User ID for isolation
   * @param minCoOccurrence - Minimum number of shared bookmarks (default: 2)
   */
  async findRelatedConcepts(
    conceptId: string,
    userId: string,
    minCoOccurrence: number = 2
  ): Promise<Array<{ concept: any; coOccurrenceCount: number; weight: number }>> {
    // Find bookmarks that have this concept
    const bookmarksWithConcept = await prisma.relationship.findMany({
      where: {
        userId,
        targetType: 'concept',
        targetId: conceptId,
        relationshipType: 'about',
      },
      select: {
        sourceId: true, // bookmark IDs
      },
    });

    const bookmarkIds = bookmarksWithConcept.map((r) => r.sourceId);

    if (bookmarkIds.length === 0) {
      return [];
    }

    // Find other concepts that appear in these bookmarks
    const relatedConceptRelationships = await prisma.relationship.findMany({
      where: {
        userId,
        sourceType: 'bookmark',
        sourceId: { in: bookmarkIds },
        targetType: 'concept',
        relationshipType: 'about',
        NOT: {
          targetId: conceptId, // Exclude the original concept
        },
      },
      select: {
        targetId: true,
        weight: true,
      },
    });

    // Count co-occurrences
    const coOccurrenceMap = new Map<
      string,
      { count: number; totalWeight: number }
    >();

    for (const rel of relatedConceptRelationships) {
      const existing = coOccurrenceMap.get(rel.targetId) || {
        count: 0,
        totalWeight: 0,
      };
      existing.count += 1;
      existing.totalWeight += rel.weight;
      coOccurrenceMap.set(rel.targetId, existing);
    }

    // Filter by minimum co-occurrence and fetch concept details
    const relatedConceptIds = Array.from(coOccurrenceMap.entries())
      .filter(([_, data]) => data.count >= minCoOccurrence)
      .sort((a, b) => b[1].count - a[1].count) // Sort by co-occurrence count
      .slice(0, 20); // Limit to top 20

    if (relatedConceptIds.length === 0) {
      return [];
    }

    const concepts = await prisma.concept.findMany({
      where: {
        id: { in: relatedConceptIds.map(([id]) => id) },
      },
    });

    // Merge with co-occurrence data
    return relatedConceptIds.map(([id, data]) => {
      const concept = concepts.find((c) => c.id === id);
      return {
        concept,
        coOccurrenceCount: data.count,
        weight: data.totalWeight / data.count, // Average weight
      };
    });
  }

  /**
   * Generate embedding for a concept based on its definition
   * Approach: Find top 3 bookmarks, extract summaries, embed definition
   */
  async generateConceptEmbedding(
    conceptId: string,
    userId: string
  ): Promise<number[] | null> {
    try {
      // 1. Find top 3 bookmarks about this concept
      const relationships = await prisma.relationship.findMany({
        where: {
          userId,
          targetType: 'concept',
          targetId: conceptId,
          relationshipType: 'about',
        },
        orderBy: { weight: 'desc' },
        take: 3,
      });

      if (relationships.length === 0) {
        console.warn(`Cannot generate embedding for concept ${conceptId} - no bookmarks`);
        return null;
      }

      // 2. Fetch bookmark summaries
      const bookmarkIds = relationships.map(r => r.sourceId);
      const bookmarks = await prisma.bookmark.findMany({
        where: { id: { in: bookmarkIds } },
        select: { title: true, summary: true },
      });

      // 3. Fetch concept details
      const concept = await prisma.concept.findUnique({
        where: { id: conceptId },
      });

      if (!concept) return null;

      // 4. Build context-rich definition
      const definition = bookmarks
        .map(b => b.summary || b.title)
        .filter(Boolean)
        .join('\n\n');

      // 5. Create embedding text
      const embeddingText = `Concept: ${concept.canonicalName}\n\nContext: ${definition}`;

      // 6. Generate embedding
      const { getEmbedderAgent } = await import('./embedderAgent');
      const embedder = getEmbedderAgent();
      const embedding = await embedder.embed({ text: embeddingText, useCache: true });

      console.log(`Generated embedding for concept "${concept.canonicalName}"`);
      return embedding;
    } catch (error) {
      console.error(`Failed to generate concept embedding:`, error);
      return null;
    }
  }

  /**
   * Batch generate embeddings for all concepts without embeddings
   */
  async batchGenerateConceptEmbeddings(
    userId: string,
    batchSize: number = 10
  ): Promise<{ success: number; failed: number }> {
    console.log(`Starting batch concept embedding for user ${userId}`);

    // Use raw SQL to filter by vector field (Prisma can't filter Unsupported types)
    const concepts = await prisma.$queryRaw<Array<{
      id: string;
      canonical_name: string;
    }>>`
      SELECT id, canonical_name
      FROM concepts
      WHERE user_id = ${userId} AND embedding IS NULL
    `;

    console.log(`Found ${concepts.length} concepts without embeddings`);

    let success = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < concepts.length; i += batchSize) {
      const batch = concepts.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (concept) => {
          const embedding = await this.generateConceptEmbedding(concept.id, userId);

          if (embedding) {
            const embeddingStr = `[${embedding.join(',')}]`;
            await prisma.$executeRaw`
              UPDATE concepts
              SET embedding = ${embeddingStr}::vector
              WHERE id = ${concept.id}
            `;
            return { success: true };
          }
          return { success: false };
        })
      );

      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value.success) {
          success++;
        } else {
          failed++;
        }
      });

      // Rate limiting
      if (i + batchSize < concepts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Batch complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }
}
