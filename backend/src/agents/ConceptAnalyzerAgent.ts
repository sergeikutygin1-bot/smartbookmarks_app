import OpenAI from 'openai';
import prisma from '../db/prisma';
import dotenv from 'dotenv';

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
    const prompt = `Analyze this content and extract key concepts and topics. Focus on:

**High-Level Topics**: Broad categories (e.g., "Machine Learning", "Web Development", "Psychology")
**Subtopics**: More specific concepts (e.g., "Neural Networks", "React Hooks", "Cognitive Load")
**Hierarchies**: Parent-child relationships (e.g., "React Hooks" is a subtopic of "Web Development")

Content:
"""
${content.slice(0, 4000)}
"""

Return a JSON object with:
- concepts: Array of concepts with name, parent (if subtopic), and relevance (0-1 score)
- hierarchy: Array showing parent-child relationships

Guidelines:
- Extract 3-8 concepts (don't over-extract)
- Focus on abstract topics, not concrete entities (people/companies are handled elsewhere)
- Use clear, concise concept names (2-4 words max)
- Identify hierarchies where applicable (e.g., "Deep Learning" → "Machine Learning" → "Artificial Intelligence")
- Assign relevance scores based on how central the concept is to the content

Example format:
{
  "concepts": [
    {"name": "Machine Learning", "parent": null, "relevance": 0.95},
    {"name": "Neural Networks", "parent": "Machine Learning", "relevance": 0.85},
    {"name": "Deep Learning", "parent": "Neural Networks", "relevance": 0.80}
  ],
  "hierarchy": [
    {"parent": "Machine Learning", "children": ["Neural Networks"]},
    {"parent": "Neural Networks", "children": ["Deep Learning"]}
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
    userId: string
  ): Promise<void> {
    if (concepts.length === 0) {
      console.log(`[ConceptAnalyzer] No concepts to save for bookmark ${bookmarkId}`);
      return;
    }

    console.log(`[ConceptAnalyzer] Saving ${concepts.length} concepts for bookmark ${bookmarkId}`);

    // Two-pass approach:
    // Pass 1: Create all concepts (without parent references)
    // Pass 2: Update parent references

    const createdConcepts = new Map<string, string>(); // normalizedName -> id

    // Pass 1: Create/update all concepts
    for (const concept of concepts) {
      try {
        const dbConcept = await prisma.concept.upsert({
          where: {
            userId_normalizedName: {
              userId,
              normalizedName: concept.normalizedName,
            },
          },
          create: {
            userId,
            name: concept.name,
            normalizedName: concept.normalizedName,
            occurrenceCount: 1,
          },
          update: {
            occurrenceCount: {
              increment: 1,
            },
            // Update name if new version is different (keep most recent)
            name: concept.name,
          },
        });

        createdConcepts.set(concept.normalizedName, dbConcept.id);

        // Create relationship: bookmark -> concept
        await prisma.relationship.upsert({
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
            },
          },
          update: {
            weight: concept.relevance,
            metadata: {
              confidence: concept.confidence,
            },
          },
        });
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
        const childId = createdConcepts.get(concept.normalizedName);
        const parentId = createdConcepts.get(concept.parentConcept);

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

    console.log(`[ConceptAnalyzer] ✓ Concepts saved successfully with hierarchy`);
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
}
