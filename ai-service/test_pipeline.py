"""
Test script for Python AI enrichment pipeline.

Tests the complete enrichment flow without requiring BullMQ queue.
Validates all agents work correctly.
"""
import asyncio
from datetime import datetime

from agents.enrichment_agent import EnrichmentAgent
from schemas.enrichment import ExtractedContent, EnrichmentJobData


async def test_enrichment_pipeline():
    """Test complete enrichment pipeline with sample content."""

    # Sample article content (BBC News example from TypeScript tests)
    test_content = ExtractedContent(
        url="https://www.bbc.com/news/technology-12345678",
        title="Breaking: AI Breakthrough in Medical Diagnostics",
        domain="bbc.com",
        content_type="article",
        raw_text="Scientists have made a breakthrough...",
        clean_text="""Scientists have made a breakthrough in using artificial intelligence for medical diagnostics. The new system can detect diseases with 95% accuracy, significantly improving early detection rates.

Researchers at Stanford University developed the AI model using deep learning techniques trained on millions of medical images. The breakthrough represents a major step forward in applying AI to healthcare.

The system has been tested on over 100,000 patient scans and consistently outperforms traditional diagnostic methods. Dr. Sarah Johnson, lead researcher on the project, stated: "This technology could save countless lives by enabling earlier intervention."

The AI model uses a novel neural network architecture that can identify patterns invisible to the human eye. It has been validated across multiple hospitals and shows particular promise in detecting early-stage cancers.

However, experts caution that AI should complement, not replace, human medical expertise. The technology will initially be deployed as a second-opinion tool to assist radiologists and pathologists in their diagnoses.""",
        extraction_confidence=0.95,
        extracted_at=datetime.now(),
        metadata={"source": "test"}
    )

    print("=" * 80)
    print("PYTHON AI ENRICHMENT PIPELINE TEST")
    print("=" * 80)
    print(f"\nTest Content:")
    print(f"  URL: {test_content.url}")
    print(f"  Title: {test_content.title}")
    print(f"  Domain: {test_content.domain}")
    print(f"  Content Length: {len(test_content.clean_text)} chars")
    print(f"  Word Count: {len(test_content.clean_text.split())} words")

    # Create enrichment agent
    agent = EnrichmentAgent()

    # Track progress
    progress_updates = []
    async def track_progress(percentage: int):
        progress_updates.append(percentage)
        print(f"\n[Progress] {percentage}%")

    agent.on_progress(track_progress)

    # Execute enrichment pipeline
    print("\n" + "-" * 80)
    print("EXECUTING ENRICHMENT PIPELINE")
    print("-" * 80)

    try:
        result = await agent.enrich(
            bookmark_id="test-bookmark-123",
            url=test_content.url,
            extracted_content=test_content,
            user_tags=["ai", "healthcare"],
            user_id="test-user-123"
        )

        # Display results
        print("\n" + "=" * 80)
        print("ENRICHMENT RESULTS")
        print("=" * 80)

        print(f"\n📋 Content Type: {result.content_type.value}")
        print(f"📊 Confidence: {result.confidence:.2f}")
        print(f"🎯 Tone: {result.tone}")

        print(f"\n📝 Title ({len(result.title)} chars):")
        print(f"   {result.title}")

        print(f"\n📄 Summary ({len(result.summary)} chars):")
        print(f"   {result.summary[:300]}...")

        print(f"\n🏷️  Tags ({len(result.tags)}):")
        for tag in result.tags:
            print(f"   - {tag}")

        print(f"\n💡 Key Points ({len(result.key_points)}):")
        for i, point in enumerate(result.key_points, 1):
            print(f"   {i}. {point}")

        print(f"\n📊 Content Metrics:")
        print(f"   Reading Level: {result.content_metrics.reading_level}")
        print(f"   Word Count: {result.content_metrics.word_count}")
        print(f"   Est. Read Time: {result.content_metrics.estimated_read_time} min")

        print(f"\n🔢 Embedding:")
        print(f"   Dimensions: {len(result.embedding)}")
        print(f"   Sample values: [{result.embedding[0]:.4f}, {result.embedding[1]:.4f}, ...]")

        print(f"\n⏱️  Performance:")
        print(f"   Total Latency: {result.total_latency_ms}ms")
        print(f"   Total Cost: ${result.total_cost_usd:.6f}")

        print(f"\n🔍 Agent Traces ({len(result.analysis_traces)}):")
        for trace in result.analysis_traces:
            status = "✅" if trace.success else "❌"
            cost_str = f"${trace.cost_usd:.6f}" if trace.cost_usd else "$0.000000"
            print(f"   {status} {trace.step:15s} | {trace.agent:30s} | {trace.latency_ms:5d}ms | {cost_str}")

        print(f"\n📈 Progress Updates: {progress_updates}")

        # Validation checks
        print("\n" + "=" * 80)
        print("VALIDATION CHECKS")
        print("=" * 80)

        checks = {
            "Title length (5-150)": 5 <= len(result.title) <= 150,
            "Summary length (200-3500)": 200 <= len(result.summary) <= 3500,
            "Tags count (1-20)": 1 <= len(result.tags) <= 20,
            "Key points count (3-10)": 3 <= len(result.key_points) <= 10,
            "Embedding dimensions": len(result.embedding) == 1536,
            "Confidence in range": 0.0 <= result.confidence <= 1.0,
            "Content type detected": result.content_type.value == "article",
            "Total cost < $0.10": result.total_cost_usd < 0.10,
            "Latency < 30000ms": result.total_latency_ms < 30000,
            "All traces successful": all(t.success for t in result.analysis_traces),
        }

        passed = 0
        failed = 0

        for check, passed_check in checks.items():
            status = "✅ PASS" if passed_check else "❌ FAIL"
            print(f"{status} - {check}")
            if passed_check:
                passed += 1
            else:
                failed += 1

        print("\n" + "=" * 80)
        print(f"SUMMARY: {passed}/{len(checks)} checks passed")
        print("=" * 80)

        if failed == 0:
            print("\n🎉 ALL TESTS PASSED! Python AI worker is working correctly.")
            return 0
        else:
            print(f"\n⚠️  {failed} test(s) failed. Review results above.")
            return 1

    except Exception as error:
        print("\n" + "=" * 80)
        print("❌ ENRICHMENT FAILED")
        print("=" * 80)
        print(f"Error: {error}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(test_enrichment_pipeline())
    exit(exit_code)
