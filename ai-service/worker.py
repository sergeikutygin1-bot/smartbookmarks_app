"""
Worker - Main entry point for Python AI enrichment worker.

Consumes enrichment jobs from BullMQ queue (via Redis) and processes them
using the EnrichmentAgent pipeline.

BullMQ-compatible worker using direct Redis BLPOP.
"""
import asyncio
import json
import logging
from datetime import datetime
import redis.asyncio as redis

from config import settings
from agents.enrichment_agent import EnrichmentAgent
from schemas.enrichment import EnrichmentJobData, EnrichmentResult
from models import Bookmark
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='[%(asctime)s] %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize database engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def save_enrichment_result(result: EnrichmentResult) -> str:
    """
    Save enrichment result to database.

    Args:
        result: Enrichment result from agent

    Returns:
        Bookmark ID
    """
    async with SessionLocal() as session:
        try:
            # Update bookmark with enrichment results
            bookmark = await session.get(Bookmark, result.bookmark_id)

            if bookmark:
                bookmark.title = result.title
                bookmark.summary = result.summary
                # Note: tags handled by TypeScript backend, not Python worker
                bookmark.content_type = result.content_type.value
                bookmark.content_metrics = {
                    "reading_level": result.content_metrics.reading_level,
                    "word_count": result.content_metrics.word_count,
                    "estimated_read_time": result.content_metrics.estimated_read_time
                }
                bookmark.embedding = result.embedding
                bookmark.confidence = result.confidence
                bookmark.status = "completed"
                bookmark.processed_at = result.enriched_at  # Maps to processed_at in DB
                bookmark.updated_at = datetime.now()

                await session.commit()
                logger.info(f"[Database] Updated bookmark {result.bookmark_id}")
                return result.bookmark_id
            else:
                logger.error(f"[Database] Bookmark {result.bookmark_id} not found")
                return result.bookmark_id

        except Exception as e:
            logger.error(f"[Database] Error saving enrichment result: {e}")
            await session.rollback()
            raise


async def process_enrichment_job(job_data: dict) -> dict:
    """
    Process enrichment job from BullMQ queue.

    Args:
        job_data: Job data from BullMQ

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

        agent.on_progress(update_progress)

        # Execute enrichment pipeline
        result = await agent.enrich(
            bookmark_id=enrichment_data.bookmark_id,
            url=enrichment_data.url,
            extracted_content=enrichment_data.extracted_content,
            user_tags=enrichment_data.user_tags,
            user_id=enrichment_data.user_id
        )

        # Save to database
        bookmark_id = await save_enrichment_result(result)

        logger.info(
            f"[Worker] Job {job_id} completed successfully. "
            f"Bookmark: {bookmark_id}, "
            f"Cost: ${result.total_cost_usd:.6f}, "
            f"Latency: {result.total_latency_ms}ms"
        )

        return result.model_dump()

    except Exception as e:
        logger.error(f"[Worker] Job {job_id} failed: {str(e)}")
        raise


async def consume_bullmq_jobs():
    """
    Consume jobs from BullMQ queue using direct Redis BLPOP.

    BullMQ uses the following queue structure:
    - bull:{queue_name}:wait - waiting jobs
    - bull:{queue_name}:active - active jobs
    - bull:{queue_name}:completed - completed jobs
    - bull:{queue_name}:failed - failed jobs
    """
    # Connect to Redis
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

    queue_name = "bull:enrichment-jobs:wait"

    logger.info(f"[Worker] Starting AI enrichment worker...")
    logger.info(f"[Worker] Environment: {settings.ENVIRONMENT}")
    logger.info(f"[Worker] Redis URL: {settings.REDIS_URL}")
    logger.info(f"[Worker] Queue: {queue_name}")
    logger.info(f"[Worker] Concurrency: {settings.WORKER_CONCURRENCY}")
    logger.info(f"[Worker] Listening for enrichment jobs...")

    # Process jobs with concurrency control
    semaphore = asyncio.Semaphore(settings.WORKER_CONCURRENCY)

    async def process_with_limit(job_data):
        async with semaphore:
            try:
                await process_enrichment_job(job_data)
            except Exception as e:
                logger.error(f"[Worker] Error processing job: {e}")

    while True:
        try:
            # Block until job available (BLPOP with 5s timeout)
            result = await redis_client.blpop(queue_name, timeout=5)

            if result:
                _, job_json = result
                job_data = json.loads(job_json)

                # Process job asynchronously with concurrency control
                asyncio.create_task(process_with_limit(job_data))

        except KeyboardInterrupt:
            logger.info("[Worker] Shutting down gracefully...")
            break
        except Exception as e:
            logger.error(f"[Worker] Error in main loop: {e}")
            await asyncio.sleep(1)  # Brief delay before retry

    await redis_client.close()


if __name__ == "__main__":
    # Run worker
    asyncio.run(consume_bullmq_jobs())
