"""
Test script for graph agents (Phase 2).

Tests entity extraction and concept analysis with Phase 2 improvements:
- Temperature: Entity 0.0, Concept 0.1
- Post-processing normalization
- Standard hierarchy enforcement
"""
import asyncio
import logging
from datetime import datetime

from agents.entity_extractor_agent import EntityExtractorAgent
from agents.concept_analyzer_agent import ConceptAnalyzerAgent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Test content about React and web development
TEST_CONTENT = """
React Hooks: A Deep Dive into Modern State Management

React Hooks have revolutionized how developers build React applications. Introduced by Dan Abramov and the React team at Facebook (now Meta), hooks provide a more direct API to the React concepts you already know: state, lifecycle, context, refs, and more.

Key concepts covered in this article:

1. useState - The fundamental hook for adding state to function components
2. useEffect - Managing side effects and lifecycle events
3. Custom hooks - Building reusable stateful logic
4. Performance optimization with useMemo and useCallback

The rise of hooks represents a paradigm shift in React development, moving away from class components to a more functional programming approach. This aligns with broader trends in JavaScript and frontend development.

Modern web development frameworks like Next.js leverage React hooks extensively, providing developers with powerful tools for building server-side rendered applications. The combination of React, TypeScript, and Next.js has become a popular stack for full-stack web development.

Technologies mentioned: React, JavaScript, TypeScript, Next.js, Node.js, PostgreSQL
People: Dan Abramov
Companies: Meta (Facebook), Vercel
Concepts: Web Development, Frontend Development, State Management, Functional Programming
"""


async def test_entity_extraction():
    """Test entity extraction with Phase 2 improvements."""
    logger.info("\n" + "="*80)
    logger.info("TEST 1: Entity Extraction (Phase 2)")
    logger.info("="*80)

    agent = EntityExtractorAgent()
    result = await agent.extract(TEST_CONTENT)

    logger.info(f"\n✓ Extracted {len(result.entities)} entities in {result.processing_time}ms")
    logger.info(f"Cost: ${result.cost:.6f}")
    logger.info(f"Method: {result.method}")

    # Validation checks
    checks_passed = 0
    total_checks = 5

    # Check 1: Should extract at least 5 entities
    if len(result.entities) >= 5:
        logger.info("✓ Check 1: At least 5 entities extracted")
        checks_passed += 1
    else:
        logger.error(f"✗ Check 1: Only {len(result.entities)} entities extracted (expected >= 5)")

    # Check 2: Should have "React" as a technology (normalized)
    react_found = any(
        e.normalized_name == "React" and e.entity_type.value == "technology"
        for e in result.entities
    )
    if react_found:
        logger.info("✓ Check 2: 'React' found as normalized technology")
        checks_passed += 1
    else:
        logger.error("✗ Check 2: 'React' not found as technology")

    # Check 3: Should have "Meta" as company (canonical form)
    meta_found = any(
        e.normalized_name == "Meta" and e.entity_type.value == "company"
        for e in result.entities
    )
    if meta_found:
        logger.info("✓ Check 3: 'Meta' found as normalized company")
        checks_passed += 1
    else:
        logger.error("✗ Check 3: 'Meta' not found as company")

    # Check 4: Should have person entity (Dan Abramov)
    person_found = any(
        e.entity_type.value == "person"
        for e in result.entities
    )
    if person_found:
        logger.info("✓ Check 4: Person entity found")
        checks_passed += 1
    else:
        logger.error("✗ Check 4: No person entity found")

    # Check 5: Cost should be reasonable (<$0.01)
    if result.cost < 0.01:
        logger.info(f"✓ Check 5: Cost ${result.cost:.6f} is reasonable (<$0.01)")
        checks_passed += 1
    else:
        logger.error(f"✗ Check 5: Cost ${result.cost:.6f} is too high (>=$0.01)")

    # Print all entities
    logger.info("\nExtracted entities:")
    for i, entity in enumerate(result.entities, 1):
        logger.info(
            f"  {i}. {entity.normalized_name} ({entity.entity_type.value}) - "
            f"mentions: {entity.mentions}, confidence: {entity.confidence}"
        )

    logger.info(f"\nEntity Extraction: {checks_passed}/{total_checks} checks passed")
    return checks_passed == total_checks


async def test_concept_analysis():
    """Test concept analysis with Phase 2 improvements."""
    logger.info("\n" + "="*80)
    logger.info("TEST 2: Concept Analysis (Phase 2)")
    logger.info("="*80)

    agent = ConceptAnalyzerAgent()
    result = await agent.analyze(TEST_CONTENT)

    logger.info(f"\n✓ Extracted {len(result.concepts)} concepts in {result.processing_time}ms")
    logger.info(f"Cost: ${result.cost:.6f}")
    logger.info(f"Method: {result.method}")
    logger.info(f"Hierarchy relationships: {len(result.hierarchy)}")

    # Validation checks
    checks_passed = 0
    total_checks = 5

    # Check 1: Should extract 3-8 concepts
    if 3 <= len(result.concepts) <= 8:
        logger.info(f"✓ Check 1: {len(result.concepts)} concepts extracted (3-8 range)")
        checks_passed += 1
    else:
        logger.error(f"✗ Check 1: {len(result.concepts)} concepts (expected 3-8)")

    # Check 2: Should have web development related concept
    web_dev_found = any(
        "web" in c.normalized_name.lower() or "frontend" in c.normalized_name.lower()
        for c in result.concepts
    )
    if web_dev_found:
        logger.info("✓ Check 2: Web development related concept found")
        checks_passed += 1
    else:
        logger.error("✗ Check 2: No web development concept found")

    # Check 3: Should have at least one parent-child relationship
    if len(result.hierarchy) > 0:
        logger.info(f"✓ Check 3: {len(result.hierarchy)} parent-child relationships found")
        checks_passed += 1
    else:
        logger.error("✗ Check 3: No parent-child relationships found")

    # Check 4: Concepts should be normalized (title case)
    normalized_correctly = all(
        c.normalized_name[0].isupper() if c.normalized_name else False
        for c in result.concepts
    )
    if normalized_correctly:
        logger.info("✓ Check 4: All concepts properly normalized (title case)")
        checks_passed += 1
    else:
        logger.error("✗ Check 4: Some concepts not properly normalized")

    # Check 5: Cost should be reasonable (<$0.01)
    if result.cost < 0.01:
        logger.info(f"✓ Check 5: Cost ${result.cost:.6f} is reasonable (<$0.01)")
        checks_passed += 1
    else:
        logger.error(f"✗ Check 5: Cost ${result.cost:.6f} is too high (>=$0.01)")

    # Print all concepts
    logger.info("\nExtracted concepts:")
    for i, concept in enumerate(result.concepts, 1):
        parent_str = f" → {concept.parent_concept}" if concept.parent_concept else ""
        logger.info(
            f"  {i}. {concept.normalized_name}{parent_str} - "
            f"relevance: {concept.relevance:.2f}, confidence: {concept.confidence}"
        )

    logger.info(f"\nConcept Analysis: {checks_passed}/{total_checks} checks passed")
    return checks_passed == total_checks


async def main():
    """Run all graph agent tests."""
    logger.info("\n" + "#"*80)
    logger.info("# SMART BOOKMARKS - GRAPH AGENTS TEST (Phase 2)")
    logger.info("#"*80)
    logger.info(f"Test started at: {datetime.now().isoformat()}")
    logger.info("\nPhase 2 improvements:")
    logger.info("- Entity extraction temperature: 0.0 (completely deterministic)")
    logger.info("- Concept analysis temperature: 0.1 (near-deterministic)")
    logger.info("- Post-processing normalization using canonical dictionaries")
    logger.info("- Standard hierarchy enforcement")

    # Run tests
    entity_success = await test_entity_extraction()
    concept_success = await test_concept_analysis()

    # Summary
    logger.info("\n" + "="*80)
    logger.info("TEST SUMMARY")
    logger.info("="*80)

    if entity_success and concept_success:
        logger.info("✓ ALL TESTS PASSED!")
        logger.info("\nPhase 2 graph agents are working correctly:")
        logger.info("- Entity extraction with normalization")
        logger.info("- Concept analysis with hierarchy")
        logger.info("- Ready for integration with graph worker")
    else:
        logger.error("✗ SOME TESTS FAILED")
        if not entity_success:
            logger.error("- Entity extraction failed")
        if not concept_success:
            logger.error("- Concept analysis failed")

    logger.info(f"\nTest completed at: {datetime.now().isoformat()}")


if __name__ == "__main__":
    asyncio.run(main())
