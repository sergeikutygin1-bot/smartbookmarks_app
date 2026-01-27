"""
Concept Analyzer Agent - Phase 2 with Canonicalization.

Analyzes abstract topics and concepts from bookmark content using GPT-4o-mini.
Implements Phase 2 improvements:
- Temperature 0.1 (was 0.2) - near-deterministic
- Post-processing normalization layer
- Standard hierarchy enforcement
- Prepares for semantic canonicalization (Phase 2.1)

Extracts high-level topics (e.g., "Machine Learning", "Web Development")
and builds concept hierarchies (parent-child relationships).
"""
import json
import logging
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from models import Concept, Relationship
from utils.concept_normalizer import (
    normalize_concept_name,
    fix_concept_hierarchy,
    deduplicate_concepts
)

logger = logging.getLogger(__name__)


class ExtractedConcept:
    """Extracted concept structure."""

    def __init__(
        self,
        name: str,
        normalized_name: str,
        parent_concept: Optional[str],
        confidence: float,
        relevance: float
    ):
        self.name = name
        self.normalized_name = normalized_name
        self.parent_concept = parent_concept
        self.confidence = confidence
        self.relevance = relevance


class ConceptHierarchy:
    """Concept hierarchy (parent-child relationships)."""

    def __init__(self, parent: str, children: List[str]):
        self.parent = parent
        self.children = children


class ConceptAnalysisResult:
    """Concept analysis result."""

    def __init__(
        self,
        concepts: List[ExtractedConcept],
        hierarchy: List[ConceptHierarchy],
        method: str,
        processing_time: int,
        cost: Optional[float] = None
    ):
        self.concepts = concepts
        self.hierarchy = hierarchy
        self.method = method
        self.processing_time = processing_time
        self.cost = cost


class ConceptAnalyzerAgent:
    """
    Concept Analyzer Agent with Phase 2 improvements.

    Phase 2 changes:
    - Temperature: 0.1 (was 0.2) - near-deterministic
    - Post-processing normalization using concept_normalizer
    - Standard hierarchy enforcement
    - Ready for semantic canonicalization (Phase 2.1)
    """

    def __init__(self):
        """Initialize concept analyzer with GPT-4o-mini."""
        self.model_name = settings.AI_MODEL
        self.temperature = 0.1  # Phase 2: Near-deterministic (was 0.2)

    async def analyze(
        self,
        content: str,
        embedding: Optional[List[float]] = None
    ) -> ConceptAnalysisResult:
        """
        Analyze concepts from bookmark content.

        Args:
            content: Text to analyze (title + summary + key points)
            embedding: Vector embedding (for future semantic canonicalization)

        Returns:
            ConceptAnalysisResult with extracted concepts and hierarchy
        """
        import time
        start_time = int(time.time() * 1000)

        # Use GPT for analysis
        result = await self._analyze_with_gpt(content)

        processing_time = int(time.time() * 1000) - start_time

        return ConceptAnalysisResult(
            concepts=result['concepts'],
            hierarchy=result['hierarchy'],
            method='gpt',
            processing_time=processing_time,
            cost=result.get('cost')
        )

    async def _analyze_with_gpt(self, content: str) -> Dict[str, Any]:
        """
        Analyze concepts using GPT-4o-mini with Phase 2 improvements.

        Phase 2:
        - Temperature 0.1 (near-deterministic, was 0.2)
        - JSON mode for reliable parsing
        - Post-processing normalization and hierarchy enforcement
        """
        # Truncate content to avoid excessive tokens
        truncated_content = content[:4000]

        prompt = f"""Analyze this content and extract key concepts and topics. Focus on:

**High-Level Topics**: Broad categories (e.g., "Machine Learning", "Web Development", "Psychology")
**Subtopics**: More specific concepts (e.g., "Neural Networks", "React Hooks", "Cognitive Load")
**Hierarchies**: Parent-child relationships (e.g., "React Hooks" is a subtopic of "Web Development")

Content:
\"\"\"
{truncated_content}
\"\"\"

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
{{
  "concepts": [
    {{"name": "Machine Learning", "parent": null, "relevance": 0.95}},
    {{"name": "Neural Networks", "parent": "Machine Learning", "relevance": 0.85}},
    {{"name": "Deep Learning", "parent": "Neural Networks", "relevance": 0.80}}
  ],
  "hierarchy": [
    {{"parent": "Machine Learning", "children": ["Neural Networks"]}},
    {{"parent": "Neural Networks", "children": ["Deep Learning"]}}
  ]
}}"""

        # Initialize LLM with JSON mode (Phase 2: temp 0.1)
        llm = ChatOpenAI(
            model=self.model_name,
            temperature=self.temperature,  # 0.1 for Phase 2
            max_tokens=800,
            max_retries=settings.LLM_MAX_RETRIES,
            model_kwargs={"response_format": {"type": "json_object"}}
        )

        messages = [
            {
                "role": "system",
                "content": "You are an expert at identifying abstract concepts and building knowledge hierarchies. Extract only clear, meaningful concepts that help organize and understand content."
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

            raw_concepts = parsed.get('concepts', [])
            raw_hierarchy = parsed.get('hierarchy', [])

            # Normalize and deduplicate concepts (Phase 2)
            concepts = self._normalize_and_deduplicate(raw_concepts)

            # Build hierarchy objects
            hierarchy = [
                ConceptHierarchy(
                    parent=h.get('parent', ''),
                    children=h.get('children', [])
                )
                for h in raw_hierarchy
            ]

            # Calculate cost
            usage = response.response_metadata.get('token_usage', {})
            input_tokens = usage.get('prompt_tokens', 0)
            output_tokens = usage.get('completion_tokens', 0)
            cost = self._calculate_cost(input_tokens, output_tokens)

            logger.info(f"[ConceptAnalyzer] Extracted {len(concepts)} concepts (cost: ${cost:.6f})")

            return {
                'concepts': concepts,
                'hierarchy': hierarchy,
                'cost': cost
            }

        except json.JSONDecodeError as e:
            logger.error(f"[ConceptAnalyzer] Failed to parse GPT response: {e}")
            return {'concepts': [], 'hierarchy': [], 'cost': 0.0}
        except Exception as e:
            logger.error(f"[ConceptAnalyzer] Error analyzing concepts: {e}")
            return {'concepts': [], 'hierarchy': [], 'cost': 0.0}

    def _normalize_and_deduplicate(
        self,
        raw_concepts: List[Dict]
    ) -> List[ExtractedConcept]:
        """
        Normalize concept names and deduplicate.

        Phase 2: Uses concept_normalizer for post-processing.
        """
        concept_list = []

        for concept_data in raw_concepts:
            name = concept_data.get('name', '').strip()
            parent = concept_data.get('parent')
            relevance = concept_data.get('relevance', 0.7)

            # Phase 2: Post-processing normalization
            normalized = normalize_concept_name(name)

            if not normalized:
                continue  # Filtered out by normalizer

            # Normalize parent concept too
            normalized_parent = None
            if parent:
                normalized_parent = normalize_concept_name(parent)

            # Phase 2: Fix hierarchy using standard taxonomy
            normalized, normalized_parent = fix_concept_hierarchy(
                normalized,
                normalized_parent
            )

            concept_list.append({
                'name': name,
                'normalizedName': normalized,
                'parentConcept': normalized_parent,
                'relevance': relevance,
                'confidence': 0.85  # GPT-4o-mini is reliable
            })

        # Phase 2: Deduplicate using normalizer utility
        deduplicated = deduplicate_concepts(concept_list)

        # Convert to ExtractedConcept objects
        return [
            ExtractedConcept(
                name=c['name'],
                normalized_name=c['normalizedName'],
                parent_concept=c.get('parentConcept'),
                confidence=c['confidence'],
                relevance=c['relevance']
            )
            for c in deduplicated
        ]

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """
        Calculate GPT cost.
        GPT-4o-mini pricing: $0.150 per 1M input tokens, $0.600 per 1M output tokens
        """
        input_cost = (input_tokens / 1_000_000) * 0.15
        output_cost = (output_tokens / 1_000_000) * 0.6
        return input_cost + output_cost

    async def save_concepts(
        self,
        concepts: List[ExtractedConcept],
        bookmark_id: str,
        user_id: str,
        session: AsyncSession
    ) -> None:
        """
        Save concepts to database with hierarchy.

        Two-pass approach:
        1. Create/update all concepts (without parent references)
        2. Update parent references

        Args:
            concepts: Extracted concepts
            bookmark_id: Bookmark to associate concepts with
            user_id: User ID for isolation
            session: Database session
        """
        if not concepts:
            logger.info(f"[ConceptAnalyzer] No concepts to save for bookmark {bookmark_id}")
            return

        logger.info(f"[ConceptAnalyzer] Saving {len(concepts)} concepts for bookmark {bookmark_id}")

        # Map: normalized_name → id
        created_concepts = {}

        # Pass 1: Create/update all concepts
        for concept in concepts:
            try:
                # Check if concept exists
                result = await session.execute(
                    select(Concept).where(
                        Concept.user_id == user_id,
                        Concept.normalized_name == concept.normalized_name
                    )
                )
                db_concept = result.scalar_one_or_none()

                if db_concept:
                    # Update existing concept
                    db_concept.occurrence_count += 1
                    db_concept.name = concept.name  # Keep most recent name
                else:
                    # Create new concept
                    db_concept = Concept(
                        user_id=user_id,
                        name=concept.name,
                        normalized_name=concept.normalized_name,
                        occurrence_count=1,
                        created_at=datetime.now()
                    )
                    session.add(db_concept)
                    await session.flush()  # Get concept ID

                created_concepts[concept.normalized_name] = db_concept.id

                # Create/update relationship: bookmark → concept
                rel_result = await session.execute(
                    select(Relationship).where(
                        Relationship.user_id == user_id,
                        Relationship.source_type == 'bookmark',
                        Relationship.source_id == bookmark_id,
                        Relationship.target_type == 'concept',
                        Relationship.target_id == db_concept.id,
                        Relationship.relationship_type == 'about'
                    )
                )
                db_relationship = rel_result.scalar_one_or_none()

                if db_relationship:
                    # Update existing relationship
                    db_relationship.weight = concept.relevance
                    db_relationship.relationship_metadata = {'confidence': concept.confidence}
                else:
                    # Create new relationship
                    db_relationship = Relationship(
                        user_id=user_id,
                        source_type='bookmark',
                        source_id=bookmark_id,
                        target_type='concept',
                        target_id=db_concept.id,
                        relationship_type='about',
                        weight=concept.relevance,
                        relationship_metadata={'confidence': concept.confidence}
                    )
                    session.add(db_relationship)

            except Exception as e:
                logger.error(f"[ConceptAnalyzer] Failed to save concept {concept.name}: {e}")
                # Continue with other concepts even if one fails

        # Pass 2: Update parent-child relationships
        for concept in concepts:
            if not concept.parent_concept:
                continue

            try:
                child_id = created_concepts.get(concept.normalized_name)
                parent_id = created_concepts.get(concept.parent_concept)

                if not child_id or not parent_id:
                    logger.warning(
                        f"[ConceptAnalyzer] Cannot create hierarchy: "
                        f"{concept.name} -> {concept.parent_concept} (missing IDs)"
                    )
                    continue

                # Update concept with parent reference
                result = await session.execute(
                    select(Concept).where(Concept.id == child_id)
                )
                db_concept = result.scalar_one_or_none()

                if db_concept:
                    db_concept.parent_concept_id = parent_id

                # Create/update relationship: child concept → parent concept
                rel_result = await session.execute(
                    select(Relationship).where(
                        Relationship.user_id == user_id,
                        Relationship.source_type == 'concept',
                        Relationship.source_id == child_id,
                        Relationship.target_type == 'concept',
                        Relationship.target_id == parent_id,
                        Relationship.relationship_type == 'related_to'
                    )
                )
                db_relationship = rel_result.scalar_one_or_none()

                if db_relationship:
                    # Update existing relationship
                    db_relationship.weight = 1.0
                else:
                    # Create new relationship
                    db_relationship = Relationship(
                        user_id=user_id,
                        source_type='concept',
                        source_id=child_id,
                        target_type='concept',
                        target_id=parent_id,
                        relationship_type='related_to',
                        weight=1.0,  # Strong relationship (parent-child)
                        relationship_metadata={'hierarchy_type': 'parent-child'}
                    )
                    session.add(db_relationship)

            except Exception as e:
                logger.error(
                    f"[ConceptAnalyzer] Failed to create hierarchy for {concept.name}: {e}"
                )
                # Continue with other concepts even if one fails

        await session.commit()
        logger.info(f"[ConceptAnalyzer] ✓ Concepts saved successfully with hierarchy")
