import OpenAI from 'openai';
import prisma from '../db/prisma';
import dotenv from 'dotenv';
import { CanonicalizationService } from '../services/CanonicalizationService';
import { v4 as uuidv4 } from 'uuid';
import { AgentTrace } from '../services/jobStorage';

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
  private agentTraces: AgentTrace[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  public getAgentTraces(): AgentTrace[] {
    return this.agentTraces;
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
    const startTime = new Date();
    const prompt = `Extract ALL named entities from this content. Be thorough and comprehensive. Focus on:
- **People**: Authors, speakers, experts, leaders, influential figures, researchers, politicians
- **Companies**: Organizations, institutions, government agencies, startups, corporations
- **Technologies**: Frameworks, programming languages, tools, platforms, systems (e.g., React, Python, PostgreSQL)
- **Products**: Software products, services, apps, platforms, tools
- **Locations**: Cities, countries, regions, places (if mentioned)

Content:
"""
${content.slice(0, 4000)}
"""

Return a JSON array of entities. Each entity should have:
- text: The exact name as it appears
- type: One of: person, company, technology, product, location
- context: A brief snippet showing where it appears (max 50 chars)

**IMPORTANT**: Extract AT LEAST 5-10 entities. Be comprehensive - include all:
- Named people mentioned (even in passing)
- Organizations and companies referenced
- Technologies, frameworks, and tools discussed
- Products and services mentioned
- Geographic locations if relevant

Avoid only generic terms like "user", "system", "data" unless they're specific products/technologies.

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
      temperature: 0.0, // Pure determinism - same entities every time
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
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = this.calculateCost(inputTokens, outputTokens);

    // Create LLM trace for observability
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.6;

    this.agentTraces.push({
      agentName: 'EntityExtractorAgent',
      startTime,
      endTime,
      duration,
      input: {
        contentLength: content.length,
        contentPreview: content.substring(0, 200) + '...',
      },
      output: {
        entityCount: entities.length,
        entities: entities.map(e => ({
          name: e.text,
          type: e.type,
          normalizedName: e.normalizedName
        })),
      },
      llmTrace: {
        model: 'gpt-4o-mini',
        temperature: 0.0,
        maxTokens: 1000,
        promptText: prompt.substring(0, 5000),
        response: rawEntities,
        tokenUsage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        cost: {
          inputCost,
          outputCost,
          totalCost: cost,
        },
        duration,
        timestamp: endTime,
      },
    });

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

    const canonicalService = new CanonicalizationService();

    // Process each entity
    for (const entity of entities) {
      try {
        // Phase 2: Canonicalize entity before saving
        const canonical = await canonicalService.resolveEntity(
          entity.text,
          entity.type,
          entity.context || '', // 200-char context snippet
          userId
        );

        // Add current mention to aliases if not already present
        const aliases = new Set([...canonical.aliases, entity.text]);
        if (entity.normalizedName) aliases.add(entity.normalizedName);

        // Upsert entity with canonical name
        const dbEntity = await prisma.entity.upsert({
          where: {
            userId_canonicalName_entityType: {
              userId,
              canonicalName: canonical.canonicalName,
              entityType: entity.type,
            },
          },
          create: {
            id: canonical.id || uuidv4(),
            userId,
            name: canonical.canonicalName, // Use canonical name
            normalizedName: canonical.canonicalName.toLowerCase(),
            canonicalName: canonical.canonicalName,
            entityType: entity.type,
            aliases: Array.from(aliases),
            wikidataId: canonical.wikidataId,
            popularity: 1,
            occurrenceCount: 1,
            metadata: {
              firstMentionContext: entity.context,
              canonicalizationMethod: canonical.method,
              canonicalizationConfidence: canonical.confidence,
            },
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
          update: {
            occurrenceCount: { increment: 1 },
            popularity: { increment: 1 },
            lastSeenAt: new Date(),
            aliases: Array.from(aliases), // Merge aliases
            // Update Wikidata ID if we didn't have one before
            wikidataId: canonical.wikidataId || undefined,
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
              canonicalMethod: canonical.method,
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

    // Cleanup canonicalization service
    await canonicalService.disconnect();

    console.log(`[EntityExtractor] ✓ Entities saved successfully`);
  }
}
