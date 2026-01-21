"""
Entity Extractor Agent - Phase 2 with Canonicalization.

Extracts named entities from bookmark content using GPT-4o-mini.
Implements Phase 2 improvements:
- Temperature 0.0 (was 0.1) - eliminates randomness
- Post-processing normalization layer
- Prepares for canonicalization service integration

Extracts 5 entity types:
- people (authors, experts, leaders)
- companies (organizations, institutions)
- technologies (frameworks, tools, platforms)
- products (software, services)
- locations (cities, countries, places)
"""
import json
import logging
import re
from typing import List, Dict, Optional, Any
from datetime import datetime

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from schemas.enrichment import DetectedContentType
from models import Entity, Relationship
from utils.entity_normalizer import (
    EntityType,
    normalize_entity_name,
    deduplicate_entities
)

logger = logging.getLogger(__name__)


class ExtractedEntity:
    """Extracted entity structure."""

    def __init__(
        self,
        text: str,
        normalized_name: str,
        entity_type: EntityType,
        confidence: float,
        mentions: int,
        context: Optional[str] = None
    ):
        self.text = text
        self.normalized_name = normalized_name
        self.entity_type = entity_type
        self.confidence = confidence
        self.mentions = mentions
        self.context = context


class EntityExtractionResult:
    """Entity extraction result."""

    def __init__(
        self,
        entities: List[ExtractedEntity],
        method: str,
        processing_time: int,
        cost: Optional[float] = None
    ):
        self.entities = entities
        self.method = method
        self.processing_time = processing_time
        self.cost = cost


class EntityExtractorAgent:
    """
    Entity Extractor Agent with Phase 2 improvements.

    Phase 2 changes:
    - Temperature: 0.0 (was 0.1) - completely deterministic
    - Post-processing normalization using entity_normalizer
    - Ready for canonicalization service (Phase 2.1)
    """

    def __init__(self):
        """Initialize entity extractor with GPT-4o-mini."""
        self.model_name = settings.AI_MODEL
        self.temperature = 0.0  # Phase 2: Completely deterministic

    async def extract(
        self,
        content: str,
        content_type: Optional[DetectedContentType] = None
    ) -> EntityExtractionResult:
        """
        Extract entities from bookmark content.

        Args:
            content: Text to extract entities from (title + summary + key points)
            content_type: Type of content (for future optimization)

        Returns:
            EntityExtractionResult with extracted entities
        """
        import time
        start_time = int(time.time() * 1000)

        # Use GPT for extraction
        result = await self._extract_with_gpt(content)

        processing_time = int(time.time() * 1000) - start_time

        return EntityExtractionResult(
            entities=result['entities'],
            method='gpt',
            processing_time=processing_time,
            cost=result.get('cost')
        )

    async def _extract_with_gpt(self, content: str) -> Dict[str, Any]:
        """
        Extract entities using GPT-4o-mini with Phase 2 improvements.

        Phase 2:
        - Temperature 0.0 (completely deterministic)
        - JSON mode for reliable parsing
        - Post-processing normalization
        """
        # Truncate content to avoid excessive tokens
        truncated_content = content[:4000]

        prompt = f"""Extract key entities from this content. Focus on:
- **People**: Authors, experts, leaders, influential figures
- **Companies**: Organizations, institutions, startups
- **Technologies**: Frameworks, programming languages, tools, platforms (e.g., React, Python, PostgreSQL)
- **Products**: Software products, services, apps
- **Locations**: Cities, countries, regions (only if relevant to the topic)

Content:
\"\"\"
{truncated_content}
\"\"\"

Return a JSON object with an "entities" array. Each entity should have:
- text: The exact name as it appears
- type: One of: person, company, technology, product, location
- context: A brief snippet showing where it appears (max 50 chars)

Only include entities that are clearly mentioned and relevant to the content's main topic.
Avoid generic terms like "user", "system", "data" unless they're specific products/technologies.

Example format:
{{
  "entities": [
    {{"text": "React", "type": "technology", "context": "...using React hooks..."}},
    {{"text": "Dan Abramov", "type": "person", "context": "...created by Dan Abramov..."}},
    {{"text": "OpenAI", "type": "company", "context": "...developed by OpenAI..."}}
  ]
}}"""

        # Initialize LLM with JSON mode (Phase 2: temp 0.0)
        llm = ChatOpenAI(
            model=self.model_name,
            temperature=self.temperature,  # 0.0 for Phase 2
            max_tokens=1000,
            max_retries=settings.LLM_MAX_RETRIES,
            model_kwargs={"response_format": {"type": "json_object"}}
        )

        messages = [
            {
                "role": "system",
                "content": "You are an expert at identifying named entities in technical and business content. Extract only clear, specific entities that are central to the content."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]

        try:
            response = await llm.ainvoke(messages)

            # Parse JSON response
            content_str = response.content if hasattr(response, 'content') else str(response)
            parsed = json.loads(content_str)

            # Handle both {"entities": [...]} and direct array formats
            raw_entities = parsed if isinstance(parsed, list) else parsed.get('entities', [])

            # Map to entity types and normalize
            entities = self._normalize_and_deduplicate(raw_entities, content)

            # Calculate cost
            usage = response.response_metadata.get('token_usage', {})
            input_tokens = usage.get('prompt_tokens', 0)
            output_tokens = usage.get('completion_tokens', 0)
            cost = self._calculate_cost(input_tokens, output_tokens)

            logger.info(f"[EntityExtractor] Extracted {len(entities)} entities (cost: ${cost:.6f})")

            return {
                'entities': entities,
                'cost': cost
            }

        except json.JSONDecodeError as e:
            logger.error(f"[EntityExtractor] Failed to parse GPT response: {e}")
            return {'entities': [], 'cost': 0.0}
        except Exception as e:
            logger.error(f"[EntityExtractor] Error extracting entities: {e}")
            return {'entities': [], 'cost': 0.0}

    def _normalize_and_deduplicate(
        self,
        raw_entities: List[Dict],
        full_content: str
    ) -> List[ExtractedEntity]:
        """
        Normalize entity names and deduplicate.

        Phase 2: Uses entity_normalizer for post-processing.
        """
        entity_list = []

        for entity_data in raw_entities:
            text = entity_data.get('text', '').strip()
            type_str = entity_data.get('type', '').lower()
            context = entity_data.get('context')

            # Map to EntityType
            entity_type = self._map_to_entity_type(type_str)

            # Phase 2: Post-processing normalization
            normalized = normalize_entity_name(text, entity_type)

            if not normalized:
                continue  # Filtered out by normalizer

            # Count mentions in content (case-insensitive)
            try:
                mention_regex = re.compile(re.escape(text), re.IGNORECASE)
                mentions = len(mention_regex.findall(full_content))
            except Exception:
                mentions = 1

            entity_list.append({
                'text': text,
                'normalizedName': normalized,
                'entityType': entity_type.value,
                'confidence': 0.85,  # GPT-4o-mini is reliable
                'mentions': mentions,
                'context': context
            })

        # Phase 2: Deduplicate using normalizer utility
        deduplicated = deduplicate_entities(entity_list)

        # Convert to ExtractedEntity objects
        return [
            ExtractedEntity(
                text=e['text'],
                normalized_name=e['normalizedName'],
                entity_type=EntityType(e['entityType']),
                confidence=e['confidence'],
                mentions=e['mentions'],
                context=e.get('context')
            )
            for e in deduplicated
        ]

    def _map_to_entity_type(self, type_str: str) -> EntityType:
        """Map string type to EntityType enum."""
        type_mapping = {
            'person': EntityType.PERSON,
            'people': EntityType.PERSON,
            'company': EntityType.COMPANY,
            'organization': EntityType.COMPANY,
            'org': EntityType.COMPANY,
            'technology': EntityType.TECHNOLOGY,
            'tech': EntityType.TECHNOLOGY,
            'framework': EntityType.TECHNOLOGY,
            'library': EntityType.TECHNOLOGY,
            'language': EntityType.TECHNOLOGY,
            'product': EntityType.PRODUCT,
            'software': EntityType.PRODUCT,
            'app': EntityType.PRODUCT,
            'service': EntityType.PRODUCT,
            'location': EntityType.LOCATION,
            'place': EntityType.LOCATION,
            'city': EntityType.LOCATION,
            'country': EntityType.LOCATION,
        }

        return type_mapping.get(type_str, EntityType.TECHNOLOGY)  # Default fallback

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """
        Calculate GPT cost.
        GPT-4o-mini pricing: $0.150 per 1M input tokens, $0.600 per 1M output tokens
        """
        input_cost = (input_tokens / 1_000_000) * 0.15
        output_cost = (output_tokens / 1_000_000) * 0.6
        return input_cost + output_cost

    async def save_entities(
        self,
        entities: List[ExtractedEntity],
        bookmark_id: str,
        user_id: str,
        session: AsyncSession
    ) -> None:
        """
        Save entities to database with upsert logic.

        Args:
            entities: Extracted entities
            bookmark_id: Bookmark to associate entities with
            user_id: User ID for isolation
            session: Database session
        """
        if not entities:
            logger.info(f"[EntityExtractor] No entities to save for bookmark {bookmark_id}")
            return

        logger.info(f"[EntityExtractor] Saving {len(entities)} entities for bookmark {bookmark_id}")

        for entity in entities:
            try:
                # Check if entity exists
                result = await session.execute(
                    select(Entity).where(
                        Entity.user_id == user_id,
                        Entity.normalized_name == entity.normalized_name,
                        Entity.entity_type == entity.entity_type.value
                    )
                )
                db_entity = result.scalar_one_or_none()

                if db_entity:
                    # Update existing entity
                    db_entity.occurrence_count += 1
                    db_entity.last_seen_at = datetime.now()
                    # Update name if new mention is longer (more complete)
                    if len(entity.text) > len(db_entity.name):
                        db_entity.name = entity.text
                else:
                    # Create new entity
                    db_entity = Entity(
                        user_id=user_id,
                        name=entity.text,
                        normalized_name=entity.normalized_name,
                        entity_type=entity.entity_type.value,
                        occurrence_count=1,
                        entity_metadata={'first_mention_context': entity.context},
                        first_seen_at=datetime.now(),
                        last_seen_at=datetime.now()
                    )
                    session.add(db_entity)
                    await session.flush()  # Get entity ID

                # Create/update relationship: bookmark → entity
                rel_result = await session.execute(
                    select(Relationship).where(
                        Relationship.user_id == user_id,
                        Relationship.source_type == 'bookmark',
                        Relationship.source_id == bookmark_id,
                        Relationship.target_type == 'entity',
                        Relationship.target_id == db_entity.id,
                        Relationship.relationship_type == 'mentions'
                    )
                )
                db_relationship = rel_result.scalar_one_or_none()

                if db_relationship:
                    # Update existing relationship
                    db_relationship.weight = entity.confidence
                    db_relationship.relationship_metadata = {
                        'mentions': entity.mentions,
                        'context': entity.context
                    }
                else:
                    # Create new relationship
                    db_relationship = Relationship(
                        user_id=user_id,
                        source_type='bookmark',
                        source_id=bookmark_id,
                        target_type='entity',
                        target_id=db_entity.id,
                        relationship_type='mentions',
                        weight=entity.confidence,
                        relationship_metadata={
                            'mentions': entity.mentions,
                            'context': entity.context
                        }
                    )
                    session.add(db_relationship)

            except Exception as e:
                logger.error(f"[EntityExtractor] Failed to save entity {entity.text}: {e}")
                # Continue with other entities even if one fails

        await session.commit()
        logger.info(f"[EntityExtractor] ✓ Entities saved successfully")
