import OpenAI from 'openai';
import prisma from '../db/prisma';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Entity types supported by the extractor
 */
export enum EntityType {
  PERSON = 'person',
  COMPANY = 'company',
  TECHNOLOGY = 'technology',
  LOCATION = 'location',
  PRODUCT = 'product',
}

/**
 * Extracted entity structure
 */
export interface ExtractedEntity {
  text: string; // Original mention
  normalizedName: string; // Canonical form
  type: EntityType;
  confidence: number; // 0-1
  mentions: number; // Frequency in document
  context?: string; // Surrounding text
}

/**
 * Entity extraction result
 */
export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  method: 'gpt' | 'hybrid'; // Which method was used
  processingTime: number;
  cost?: number;
}

/**
 * Entity Extractor Agent
 *
 * Hybrid approach:
 * - Tier 1: GPT-4o-mini (primary, high accuracy)
 * - Future: Add spaCy for cost optimization
 *
 * Extracts named entities from bookmark content:
 * - People (authors, experts, leaders)
 * - Companies (organizations, institutions)
 * - Technologies (frameworks, tools, platforms)
 * - Products (software, services)
 * - Locations (cities, countries, places)
 *
 * Features:
 * - Entity normalization (lowercase, dedupe)
 * - Entity resolution (merge similar entities)
 * - Confidence scoring
 * - Cost tracking
 */
export class EntityExtractorAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Extract entities from bookmark content
   *
   * @param content - Text to extract entities from (title + summary + key points)
   * @param contentType - Type of content (for deciding extraction strategy)
   * @returns Extraction result with entities
   */
  async extract(
    content: string,
    contentType?: string
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now();

    // For now, use GPT for all extractions
    // TODO: Add spaCy tier for cost optimization
    const result = await this.extractWithGPT(content);

    const processingTime = Date.now() - startTime;

    return {
      ...result,
      processingTime,
    };
  }

  /**
   * Extract entities using GPT-4o-mini
   */
  private async extractWithGPT(content: string): Promise<{
    entities: ExtractedEntity[];
    method: 'gpt';
    cost: number;
  }> {
    const prompt = `Extract key entities from this content. Focus on:
- **People**: Authors, experts, leaders, influential figures
- **Companies**: Organizations, institutions, startups
- **Technologies**: Frameworks, programming languages, tools, platforms (e.g., React, Python, PostgreSQL)
- **Products**: Software products, services, apps
- **Locations**: Cities, countries, regions (only if relevant to the topic)

Content:
"""
${content.slice(0, 4000)}
"""

Return a JSON array of entities. Each entity should have:
- text: The exact name as it appears
- type: One of: person, company, technology, product, location
- context: A brief snippet showing where it appears (max 50 chars)

Only include entities that are clearly mentioned and relevant to the content's main topic.
Avoid generic terms like "user", "system", "data" unless they're specific products/technologies.

Example format:
[
  {"text": "React", "type": "technology", "context": "...using React hooks..."},
  {"text": "Dan Abramov", "type": "person", "context": "...created by Dan Abramov..."},
  {"text": "OpenAI", "type": "company", "context": "...developed by OpenAI..."}
]`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at identifying named entities in technical and business content. Extract only clear, specific entities that are central to the content.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 1000,
    });

    // Parse response
    const responseText = response.choices[0].message.content || '{"entities": []}';
    let rawEntities: Array<{ text: string; type: string; context?: string }> = [];

    try {
      const parsed = JSON.parse(responseText);
      // Handle both {"entities": [...]} and direct array formats
      rawEntities = Array.isArray(parsed) ? parsed : (parsed.entities || []);
    } catch (error) {
      console.error('[EntityExtractor] Failed to parse GPT response:', error);
      rawEntities = [];
    }

    // Normalize and deduplicate entities
    const entities = this.normalizeAndDeduplicate(
      rawEntities.map((e) => ({
        text: e.text,
        type: this.mapToEntityType(e.type),
        context: e.context,
      })),
      content
    );

    // Calculate cost
    const cost = this.calculateCost(
      response.usage?.prompt_tokens || 0,
      response.usage?.completion_tokens || 0
    );

    return {
      entities,
      method: 'gpt',
      cost,
    };
  }

  /**
   * Normalize entity names and deduplicate
   */
  private normalizeAndDeduplicate(
    rawEntities: Array<{ text: string; type: EntityType; context?: string }>,
    fullContent: string
  ): ExtractedEntity[] {
    const entityMap = new Map<string, ExtractedEntity>();

    for (const entity of rawEntities) {
      const normalized = this.normalizeEntityName(entity.text, entity.type);

      if (!normalized) continue; // Skip invalid entities

      // Count mentions in content (case-insensitive)
      const mentionRegex = new RegExp(
        entity.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'gi'
      );
      const mentions = (fullContent.match(mentionRegex) || []).length;

      if (entityMap.has(normalized)) {
        // Merge duplicate entity
        const existing = entityMap.get(normalized)!;
        existing.mentions += mentions;
      } else {
        // Add new entity
        entityMap.set(normalized, {
          text: entity.text,
          normalizedName: normalized,
          type: entity.type,
          confidence: 0.85, // GPT-4o-mini is reliable
          mentions,
          context: entity.context,
        });
      }
    }

    // Return entities sorted by mentions (most mentioned first)
    return Array.from(entityMap.values()).sort((a, b) => b.mentions - a.mentions);
  }

  /**
   * Normalize entity name based on type
   */
  private normalizeEntityName(text: string, type: EntityType): string | null {
    let normalized = text.trim();

    // Skip empty or very short names
    if (normalized.length < 2) return null;

    // Skip generic terms
    const genericTerms = [
      'user',
      'system',
      'data',
      'code',
      'app',
      'software',
      'website',
      'api',
      'database',
      'server',
      'client',
    ];
    if (genericTerms.includes(normalized.toLowerCase())) return null;

    // Type-specific normalization
    switch (type) {
      case EntityType.PERSON:
        // Title case for person names
        normalized = this.toTitleCase(normalized);
        break;

      case EntityType.COMPANY:
      case EntityType.PRODUCT:
        // Preserve original casing for companies/products (e.g., "OpenAI", "iPhone")
        // Just trim and clean
        normalized = normalized.replace(/\s+/g, ' ');
        break;

      case EntityType.TECHNOLOGY:
        // Preserve casing for technologies (React != REACT)
        normalized = normalized.replace(/\s+/g, ' ');
        break;

      case EntityType.LOCATION:
        // Title case for locations
        normalized = this.toTitleCase(normalized);
        break;
    }

    return normalized;
  }

  /**
   * Convert to title case (First Letter Uppercase)
   */
  private toTitleCase(str: string): string {
    return str
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Map string type to EntityType enum
   */
  private mapToEntityType(type: string): EntityType {
    const normalizedType = type.toLowerCase();

    switch (normalizedType) {
      case 'person':
      case 'people':
        return EntityType.PERSON;
      case 'company':
      case 'organization':
      case 'org':
        return EntityType.COMPANY;
      case 'technology':
      case 'tech':
      case 'framework':
      case 'library':
      case 'language':
        return EntityType.TECHNOLOGY;
      case 'product':
      case 'software':
      case 'app':
      case 'service':
        return EntityType.PRODUCT;
      case 'location':
      case 'place':
      case 'city':
      case 'country':
        return EntityType.LOCATION;
      default:
        return EntityType.TECHNOLOGY; // Default fallback
    }
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
   * Save entities to database (with upsert logic)
   *
   * @param entities - Extracted entities
   * @param bookmarkId - Bookmark to associate entities with
   * @param userId - User ID for isolation
   */
  async saveEntities(
    entities: ExtractedEntity[],
    bookmarkId: string,
    userId: string
  ): Promise<void> {
    if (entities.length === 0) {
      console.log(`[EntityExtractor] No entities to save for bookmark ${bookmarkId}`);
      return;
    }

    console.log(`[EntityExtractor] Saving ${entities.length} entities for bookmark ${bookmarkId}`);

    // Process each entity
    for (const entity of entities) {
      try {
        // Upsert entity (create or increment occurrence count)
        const dbEntity = await prisma.entity.upsert({
          where: {
            userId_normalizedName_entityType: {
              userId,
              normalizedName: entity.normalizedName,
              entityType: entity.type,
            },
          },
          create: {
            userId,
            name: entity.text,
            normalizedName: entity.normalizedName,
            entityType: entity.type,
            occurrenceCount: 1,
            metadata: {
              firstMentionContext: entity.context,
            },
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
          update: {
            occurrenceCount: {
              increment: 1,
            },
            lastSeenAt: new Date(),
            // Update name if the new mention is longer (more complete)
            name: entity.text.length > 0 ? entity.text : undefined,
          },
        });

        // Create relationship: bookmark -> entity
        await prisma.relationship.upsert({
          where: {
            userId_sourceType_sourceId_targetType_targetId_relationshipType: {
              userId,
              sourceType: 'bookmark',
              sourceId: bookmarkId,
              targetType: 'entity',
              targetId: dbEntity.id,
              relationshipType: 'mentions',
            },
          },
          create: {
            userId,
            sourceType: 'bookmark',
            sourceId: bookmarkId,
            targetType: 'entity',
            targetId: dbEntity.id,
            relationshipType: 'mentions',
            weight: entity.confidence,
            metadata: {
              mentions: entity.mentions,
              context: entity.context,
            },
          },
          update: {
            weight: entity.confidence,
            metadata: {
              mentions: entity.mentions,
              context: entity.context,
            },
          },
        });
      } catch (error) {
        console.error(
          `[EntityExtractor] Failed to save entity ${entity.text}:`,
          error
        );
        // Continue with other entities even if one fails
      }
    }

    console.log(`[EntityExtractor] ✓ Entities saved successfully`);
  }
}
