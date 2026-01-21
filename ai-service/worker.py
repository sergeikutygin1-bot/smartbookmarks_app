"""
Worker - Main entry point for Python AI enrichment worker.

Consumes enrichment jobs from BullMQ queue (via Redis) and processes them
using the EnrichmentAgent pipeline.
"""
import asyncio
import logging
from datetime import datetime

from taskiq import TaskiqScheduler, ZeroMQBroker
from taskiq_redis import ListQueueBroker

from config import settings
from agents.enrichment_agent import EnrichmentAgent
from schemas.enrichment import EnrichmentJobData, EnrichmentResult


# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='[%(asctime)s] %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize taskiq broker with Redis
# Note: taskiq-redis provides BullMQ-compatible queue consumption
broker = ListQueueBroker(settings.REDIS_URL).with_result_backend(
    # Use Redis for result storage
    ListQueueBroker(settings.REDIS_URL)
)


@broker.task(task_name="enrich", max_retries=settings.MAX_RETRIES)
async def process_enrichment_job(job_data: dict) -> dict:
    """
    Process enrichment job from queue.

    This is the main task handler that BullMQ will invoke.

    Args:
        job_data: Job data from BullMQ (contains 'data' field with EnrichmentJobData)

    Returns:
        Enrichment result as dict
    """
    job_id = job_data.get("id", "unknown")
    data = job_data.get("data", {})

    logger.info(f"[Worker] Processing enrichment job {job_id}")

    try:
        # Parse and validate job data
        enrichment_data = EnrichmentJobData(**data)

        # Create enrichment agent
        agent = EnrichmentAgent()

        # Optional: Register progress callback
        async def update_progress(progress: int):
            logger.debug(f"[Worker] Job {job_id} progress: {progress}%")
            # Could update BullMQ job progress here if needed

        agent.on_progress(update_progress)

        # Execute enrichment pipeline
        result = await agent.enrich(
            bookmark_id=enrichment_data.bookmark_id,
            url=enrichment_data.url,
            extracted_content=enrichment_data.extracted_content,
            user_tags=enrichment_data.user_tags,
            user_id=enrichment_data.user_id
        )

        # Save to database (via SQLAlchemy)
        bookmark_id = await save_enrichment_result(result)

        logger.info(
            f"[Worker] Job {job_id} completed successfully. "
            f"Bookmark: {bookmark_id}, "
            f"Cost: ${result.total_cost_usd:.6f}, "
            f"Latency: {result.total_latency_ms}ms"
        )

        # Return result as dict for BullMQ
        return result.dict()

    except Exception as error:
        logger.error(f"[Worker] Job {job_id} failed: {error}", exc_info=True)
        raise  # Let taskiq handle retries


async def save_enrichment_result(result: EnrichmentResult) -> str:
    """
    Save enrichment result to database.

    Args:
        result: Enrichment result

    Returns:
        Bookmark ID
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import update, select
    from models import Bookmark  # Will be created next

    # Create async engine and session
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        # Update bookmark with enrichment data
        stmt = (
            update(Bookmark)
            .where(Bookmark.id == result.bookmark_id)
            .values(
                title=result.title,
                summary=result.summary,
                tags=result.tags,
                content_type=result.content_type.value,
                embedding=result.embedding,
                confidence=result.confidence,
                status="completed",
                enriched_at=result.enriched_at
            )
        )

        await session.execute(stmt)
        await session.commit()

    return result.bookmark_id


async def main():
    """Main entry point for worker."""
    logger.info(f"[Worker] Starting AI enrichment worker...")
    logger.info(f"[Worker] Environment: {settings.ENVIRONMENT}")
    logger.info(f"[Worker] Redis URL: {settings.REDIS_URL}")
    logger.info(f"[Worker] Queue: {settings.QUEUE_NAME}")
    logger.info(f"[Worker] Concurrency: {settings.WORKER_CONCURRENCY}")

    # Start broker and begin consuming tasks
    await broker.startup()

    try:
        # Keep worker running
        logger.info("[Worker] Listening for enrichment jobs...")
        async for _ in broker.listen():
            # Process tasks as they arrive
            pass
    except KeyboardInterrupt:
        logger.info("[Worker] Shutting down gracefully...")
    finally:
        await broker.shutdown()


if __name__ == "__main__":
    # Run worker
    asyncio.run(main())
