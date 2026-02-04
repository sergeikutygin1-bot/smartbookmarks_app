"""
Comprehensive End-to-End Tests for Canonicalization Service - Phase 2.1

Tests all 5 steps of the canonicalization process:
1. Redis cache lookup
2. Database fuzzy matching (Jaro-Winkler)
3. Wikidata SPARQL lookup
4. LLM canonicalization
5. Entity/concept creation

Also tests integration with EntityExtractorAgent and ConceptAnalyzerAgent.

Usage:
    python test_canonicalization.py
"""
import asyncio
import sys
import os
import logging
from datetime import datetime

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from config import settings
from models import Entity, Concept, Bookmark, Relationship
from services.canonicalization_service import CanonicalizationService
from agents.entity_extractor_agent import EntityExtractorAgent, ExtractedEntity
from agents.concept_analyzer_agent import ConceptAnalyzerAgent
from utils.entity_normalizer import EntityType
from schemas.enrichment import DetectedContentType

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TestResult:
    """Track test results."""

    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.errors = []

    def record_pass(self, test_name: str):
        """Record passed test."""
        self.total += 1
        self.passed += 1
        print(f"✓ {test_name}")

    def record_fail(self, test_name: str, error: str):
        """Record failed test."""
        self.total += 1
        self.failed += 1
        self.errors.append((test_name, error))
        print(f"✗ {test_name}: {error}")

    def print_summary(self):
        """Print test summary."""
        print("\n" + "=" * 60)
        print("CANONICALIZATION TEST SUMMARY")
        print("=" * 60)
        print(f"Total:   {self.total}")
        print(f"Passed:  {self.passed}")
        print(f"Failed:  {self.failed}")

        if self.errors:
            print("\nFailed tests:")
            for test_name, error in self.errors:
                print(f"  - {test_name}: {error}")

        print("=" * 60 + "\n")


async def test_entity_fuzzy_matching(
    session: AsyncSession,
    canonicalization_service: CanonicalizationService,
    user_id: str,
    results: TestResult
):
    """Test entity fuzzy matching with Jaro-Winkler similarity."""
    logger.info("[Test] Testing entity fuzzy matching")

    try:
        # Create a canonical entity in database
        canonical_entity = Entity(
            user_id=user_id,
            name="React",
            normalized_name="react",
            entity_type="technology",
            canonical_name="React",
            aliases=["React", "ReactJS"],
            popularity=10,
            occurrence_count=10,
            first_seen_at=datetime.now(),
            last_seen_at=datetime.now()
        )
        session.add(canonical_entity)
        await session.flush()

        # Test variations that should match
        variations = [
            ("react", "React"),  # Exact match (normalized)
            ("reactjs", "React"),  # Common variation
            ("React.js", "React"),  # Punctuation variation
        ]

        for variation, expected_canonical in variations:
            result = await canonicalization_service.resolve_entity(
                entity_name=variation,
                entity_type=EntityType.TECHNOLOGY,
                context="",
                user_id=user_id,
                session=session
            )

            if result.canonical_name == expected_canonical:
                results.record_pass(f"Fuzzy match: '{variation}' → '{expected_canonical}'")
            else:
                results.record_fail(
                    f"Fuzzy match: '{variation}'",
                    f"Expected '{expected_canonical}', got '{result.canonical_name}'"
                )

        await session.rollback()  # Cleanup

    except Exception as e:
        results.record_fail("Entity fuzzy matching", str(e))
        logger.error(f"[Test] Entity fuzzy matching failed: {e}")


async def test_concept_semantic_matching(
    session: AsyncSession,
    canonicalization_service: CanonicalizationService,
    user_id: str,
    results: TestResult
):
    """Test concept semantic matching with embeddings."""
    logger.info("[Test] Testing concept semantic matching")

    try:
        # Create canonical concepts
        ai_concept = Concept(
            user_id=user_id,
            name="Artificial Intelligence",
            normalized_name="artificial intelligence",
            canonical_name="Artificial Intelligence",
            aliases=["AI", "A.I."],
            description="The simulation of human intelligence by machines",
            popularity=5,
            occurrence_count=5,
            created_at=datetime.now()
        )
        session.add(ai_concept)
        await session.flush()

        # Test variations
        variations = [
            ("AI", "Artificial Intelligence"),
            ("A.I.", "Artificial Intelligence"),
            ("artificial intelligence", "Artificial Intelligence"),
        ]

        for variation, expected_canonical in variations:
            result = await canonicalization_service.resolve_concept(
                concept_name=variation,
                description="",
                user_id=user_id,
                session=session,
                embedding=None
            )

            if result.canonical_name == expected_canonical:
                results.record_pass(f"Semantic match: '{variation}' → '{expected_canonical}'")
            else:
                results.record_fail(
                    f"Semantic match: '{variation}'",
                    f"Expected '{expected_canonical}', got '{result.canonical_name}'"
                )

        await session.rollback()  # Cleanup

    except Exception as e:
        results.record_fail("Concept semantic matching", str(e))
        logger.error(f"[Test] Concept semantic matching failed: {e}")


async def test_redis_caching(
    session: AsyncSession,
    canonicalization_service: CanonicalizationService,
    user_id: str,
    results: TestResult
):
    """Test Redis caching (7-day TTL)."""
    logger.info("[Test] Testing Redis caching")

    try:
        # Clear cache first
        cache_key = f"canonical:entity:technology:react:{user_id}"
        await canonicalization_service.redis_client.delete(cache_key)

        # First call (cache miss, should query database/Wikidata/LLM)
        result1 = await canonicalization_service.resolve_entity(
            entity_name="React",
            entity_type=EntityType.TECHNOLOGY,
            context="JavaScript library",
            user_id=user_id,
            session=session
        )

        # Second call (cache hit, should return immediately)
        result2 = await canonicalization_service.resolve_entity(
            entity_name="React",
            entity_type=EntityType.TECHNOLOGY,
            context="JavaScript library",
            user_id=user_id,
            session=session
        )

        # Both should return the same canonical name
        if result1.canonical_name == result2.canonical_name:
            results.record_pass("Redis caching: cache hit returns same result")
        else:
            results.record_fail(
                "Redis caching",
                f"Cache miss '{result1.canonical_name}' != cache hit '{result2.canonical_name}'"
            )

        # Check cache TTL
        ttl = await canonicalization_service.redis_client.ttl(cache_key)
        if ttl > 0 and ttl <= 7 * 24 * 60 * 60:  # 7 days
            results.record_pass(f"Redis caching: TTL is {ttl}s (≤7 days)")
        else:
            results.record_fail("Redis caching", f"Invalid TTL: {ttl}s")

    except Exception as e:
        results.record_fail("Redis caching", str(e))
        logger.error(f"[Test] Redis caching failed: {e}")


async def test_entity_extractor_integration(
    session: AsyncSession,
    user_id: str,
    bookmark_id: str,
    results: TestResult
):
    """Test EntityExtractorAgent integration with canonicalization."""
    logger.info("[Test] Testing EntityExtractorAgent integration")

    try:
        agent = EntityExtractorAgent()

        # Extract entities from sample content
        content = """
        Facebook (now Meta) announced a new React library update.
        The team at Facebook developed this using JavaScript and TypeScript.
        """

        result = await agent.extract(content, DetectedContentType.ARTICLE)

        # Should extract: Meta/Facebook (canonical: Meta), React, JavaScript, TypeScript
        if len(result.entities) >= 3:
            results.record_pass(f"Entity extraction: {len(result.entities)} entities extracted")
        else:
            results.record_fail(
                "Entity extraction",
                f"Expected ≥3 entities, got {len(result.entities)}"
            )

        # Save entities (should canonicalize)
        await agent.save_entities(result.entities, bookmark_id, user_id, session)

        # Verify canonical entities were created
        db_result = await session.execute(
            select(Entity).where(
                Entity.user_id == user_id,
                Entity.canonical_name.in_(["Meta", "React", "JavaScript", "TypeScript"])
            )
        )
        canonical_entities = db_result.scalars().all()

        if len(canonical_entities) >= 3:
            results.record_pass(f"Entity canonicalization: {len(canonical_entities)} canonical entities created")

            # Check aliases were added
            for entity in canonical_entities:
                if entity.canonical_name == "Meta" and entity.aliases:
                    if "Facebook" in entity.aliases:
                        results.record_pass("Entity aliases: 'Facebook' added to 'Meta' aliases")
                    else:
                        results.record_fail("Entity aliases", "'Facebook' not in 'Meta' aliases")
                    break
        else:
            results.record_fail(
                "Entity canonicalization",
                f"Expected ≥3 canonical entities, got {len(canonical_entities)}"
            )

        await session.rollback()  # Cleanup

    except Exception as e:
        results.record_fail("EntityExtractorAgent integration", str(e))
        logger.error(f"[Test] EntityExtractorAgent integration failed: {e}")


async def test_concept_analyzer_integration(
    session: AsyncSession,
    user_id: str,
    bookmark_id: str,
    results: TestResult
):
    """Test ConceptAnalyzerAgent integration with canonicalization."""
    logger.info("[Test] Testing ConceptAnalyzerAgent integration")

    try:
        agent = ConceptAnalyzerAgent()

        # Analyze concepts from sample content
        content = """
        This article discusses Machine Learning and Deep Learning techniques.
        Neural Networks are a key component of modern AI systems.
        The field of Artificial Intelligence has grown rapidly.
        """

        result = await agent.analyze(content, embedding=None)

        # Should extract concepts: AI, ML, Deep Learning, Neural Networks
        if len(result.concepts) >= 3:
            results.record_pass(f"Concept extraction: {len(result.concepts)} concepts extracted")
        else:
            results.record_fail(
                "Concept extraction",
                f"Expected ≥3 concepts, got {len(result.concepts)}"
            )

        # Save concepts (should canonicalize)
        await agent.save_concepts(result.concepts, bookmark_id, user_id, session)

        # Verify canonical concepts were created
        db_result = await session.execute(
            select(Concept).where(
                Concept.user_id == user_id,
                Concept.canonical_name.in_([
                    "Artificial Intelligence",
                    "Machine Learning",
                    "Deep Learning",
                    "Neural Networks"
                ])
            )
        )
        canonical_concepts = db_result.scalars().all()

        if len(canonical_concepts) >= 2:
            results.record_pass(f"Concept canonicalization: {len(canonical_concepts)} canonical concepts created")

            # Check hierarchy
            for concept in canonical_concepts:
                if concept.canonical_name == "Machine Learning":
                    if concept.parent_concept_id:
                        results.record_pass("Concept hierarchy: 'Machine Learning' has parent")
                    else:
                        results.record_fail("Concept hierarchy", "'Machine Learning' missing parent")
                    break
        else:
            results.record_fail(
                "Concept canonicalization",
                f"Expected ≥2 canonical concepts, got {len(canonical_concepts)}"
            )

        await session.rollback()  # Cleanup

    except Exception as e:
        results.record_fail("ConceptAnalyzerAgent integration", str(e))
        logger.error(f"[Test] ConceptAnalyzerAgent integration failed: {e}")


async def test_deduplication_rate(
    session: AsyncSession,
    canonicalization_service: CanonicalizationService,
    user_id: str,
    results: TestResult
):
    """Test deduplication rate with multiple variations."""
    logger.info("[Test] Testing deduplication rate")

    try:
        # Create multiple variations of the same entity
        variations = [
            "React", "react", "ReactJS", "React.js", "reactjs",
            "PostgreSQL", "postgres", "Postgres", "PSQL", "psql"
        ]

        canonical_names = set()

        for variation in variations:
            # Determine entity type
            entity_type = EntityType.TECHNOLOGY

            result = await canonicalization_service.resolve_entity(
                entity_name=variation,
                entity_type=entity_type,
                context="",
                user_id=user_id,
                session=session
            )
            canonical_names.add(result.canonical_name)

        # Should reduce to 2 canonical entities (React, PostgreSQL)
        if len(canonical_names) == 2:
            dedup_rate = 100 * (1 - len(canonical_names) / len(variations))
            results.record_pass(f"Deduplication: {len(variations)} variations → {len(canonical_names)} canonical ({dedup_rate:.0f}% reduction)")
        else:
            results.record_fail(
                "Deduplication",
                f"Expected 2 canonical entities, got {len(canonical_names)}: {canonical_names}"
            )

    except Exception as e:
        results.record_fail("Deduplication rate", str(e))
        logger.error(f"[Test] Deduplication rate failed: {e}")


async def main():
    """Main test function."""
    logger.info("=" * 60)
    logger.info("CANONICALIZATION SERVICE - END-TO-END TESTS")
    logger.info("=" * 60)

    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Initialize services
    canonicalization_service = CanonicalizationService()
    results = TestResult()

    # Test user and bookmark
    test_user_id = "test-user-canonicalization"
    test_bookmark_id = "test-bookmark-canonicalization"

    try:
        async with async_session() as session:
            # Run tests
            print("\n1. Entity Fuzzy Matching Tests:")
            await test_entity_fuzzy_matching(session, canonicalization_service, test_user_id, results)

            print("\n2. Concept Semantic Matching Tests:")
            await test_concept_semantic_matching(session, canonicalization_service, test_user_id, results)

            print("\n3. Redis Caching Tests:")
            await test_redis_caching(session, canonicalization_service, test_user_id, results)

            print("\n4. EntityExtractorAgent Integration Tests:")
            await test_entity_extractor_integration(session, test_user_id, test_bookmark_id, results)

            print("\n5. ConceptAnalyzerAgent Integration Tests:")
            await test_concept_analyzer_integration(session, test_user_id, test_bookmark_id, results)

            print("\n6. Deduplication Rate Tests:")
            await test_deduplication_rate(session, canonicalization_service, test_user_id, results)

    finally:
        await engine.dispose()
        await canonicalization_service.close()

    # Print summary
    results.print_summary()

    # Exit with appropriate code
    sys.exit(0 if results.failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
