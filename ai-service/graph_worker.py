"""
Graph Worker - Processes knowledge graph jobs (entities, concepts, similarity).

Consumes jobs from BullMQ graph queues (via Redis) and processes them
using specialized agents.

BullMQ-compatible worker using direct Redis BLPOP for 3 queues:
- bull:graph-entities:wait - Entity extraction jobs
- bull:graph-concepts:wait - Concept analysis jobs
- bull:graph-similarity:wait - Similarity computation jobs (future)
"""
import asyncio
import json
import logging
from datetime import datetime
import redis.asyncio as redis

from config import settings
from agents.entity_extractor_agent import EntityExtractorAgent
from agents.concept_analyzer_agent import ConceptAnalyzerAgent
from models import Bookmark
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

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


async def process_entity_extraction_job(job_data: dict) -> dict:
    """
    Process entity extraction job from BullMQ queue.

    Args:
        job_data: Job data from BullMQ
            - bookmarkId: str
            - userId: str
            - content: str
            - url: str

    Returns:
        Processing result as dict
    """
    job_id = job_data.get("id", "unknown")
    data = job_data.get("data", {})

    logger.info(f"[GraphWorker:Entity] Processing job {job_id}")

    try:
        bookmark_id = data.get("bookmarkId")
        user_id = data.get("userId")
        content = data.get("content")
        url = data.get("url")

        if not all([bookmark_id, user_id, content]):
            raise ValueError("Missing required fields: bookmarkId, userId, or content")

        # Create entity extractor agent
        agent = EntityExtractorAgent()

        # Extract entities
        result = await agent.extract(content)

        logger.info(
            f"[GraphWorker:Entity] Extracted {len(result.entities)} entities "
            f"in {result.processing_time}ms"
        )

        # Save entities to database
        async with SessionLocal() as session:
            await agent.save_entities(result.entities, bookmark_id, user_id, session)

        # Return result
        logger.info(
            f"[GraphWorker:Entity] Job {job_id} completed successfully. "
            f"Cost: ${result.cost:.6f}, Latency: {result.processing_time}ms"
        )

        return {
            "success": True,
            "entities_count": len(result.entities),
            "cost": result.cost,
            "processing_time": result.processing_time
        }

    except Exception as e:
        logger.error(f"[GraphWorker:Entity] Job {job_id} failed: {str(e)}")
        raise


async def process_concept_analysis_job(job_data: dict) -> dict:
    """
    Process concept analysis job from BullMQ queue.

    Args:
        job_data: Job data from BullMQ
            - bookmarkId: str
            - userId: str
            - content: str
            - embedding: list[float] (optional)

    Returns:
        Processing result as dict
    """
    job_id = job_data.get("id", "unknown")
    data = job_data.get("data", {})

    logger.info(f"[GraphWorker:Concept] Processing job {job_id}")

    try:
        bookmark_id = data.get("bookmarkId")
        user_id = data.get("userId")
        content = data.get("content")
        embedding = data.get("embedding")  # Optional

        if not all([bookmark_id, user_id, content]):
            raise ValueError("Missing required fields: bookmarkId, userId, or content")

        # Create concept analyzer agent
        agent = ConceptAnalyzerAgent()

        # Analyze concepts
        result = await agent.analyze(content, embedding)

        logger.info(
            f"[GraphWorker:Concept] Extracted {len(result.concepts)} concepts "
            f"in {result.processing_time}ms"
        )

        # Save concepts to database
        async with SessionLocal() as session:
            await agent.save_concepts(result.concepts, bookmark_id, user_id, session)

        # Return result
        logger.info(
            f"[GraphWorker:Concept] Job {job_id} completed successfully. "
            f"Cost: ${result.cost:.6f}, Latency: {result.processing_time}ms"
        )

        return {
            "success": True,
            "concepts_count": len(result.concepts),
            "hierarchy_count": len(result.hierarchy),
            "cost": result.cost,
            "processing_time": result.processing_time
        }

    except Exception as e:
        logger.error(f"[GraphWorker:Concept] Job {job_id} failed: {str(e)}")
        raise


async def process_similarity_job(job_data: dict) -> dict:
    """
    Process similarity computation job from BullMQ queue.

    Args:
        job_data: Job data from BullMQ
            - bookmarkId: str
            - userId: str
            - embedding: list[float]
            - threshold: float (optional)

    Returns:
        Processing result as dict
    """
    job_id = job_data.get("id", "unknown")
    data = job_data.get("data", {})

    logger.info(f"[GraphWorker:Similarity] Processing job {job_id}")

    # TODO: Implement similarity computation
    # For now, just log and return success
    logger.info(f"[GraphWorker:Similarity] Job {job_id} completed (not implemented)")

    return {
        "success": True,
        "message": "Similarity computation not implemented yet"
    }


async def consume_graph_jobs():
    """
    Consume jobs from BullMQ graph queues using direct Redis BLPOP.

    Processes 3 queue types:
    - bull:graph-entities:wait
    - bull:graph-concepts:wait
    - bull:graph-similarity:wait
    """
    # Connect to Redis
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

    # Queue names
    entity_queue = "bull:graph-entities:wait"
    concept_queue = "bull:graph-concepts:wait"
    similarity_queue = "bull:graph-similarity:wait"

    logger.info(f"[GraphWorker] Starting graph worker...")
    logger.info(f"[GraphWorker] Environment: {settings.ENVIRONMENT}")
    logger.info(f"[GraphWorker] Redis URL: {settings.REDIS_URL}")
    logger.info(f"[GraphWorker] Queues: {entity_queue}, {concept_queue}, {similarity_queue}")
    logger.info(f"[GraphWorker] Concurrency: {settings.WORKER_CONCURRENCY}")
    logger.info(f"[GraphWorker] Listening for graph jobs...")

    # Process jobs with concurrency control
    semaphore = asyncio.Semaphore(settings.WORKER_CONCURRENCY)

    # Job processors map
    processors = {
        entity_queue: process_entity_extraction_job,
        concept_queue: process_concept_analysis_job,
        similarity_queue: process_similarity_job,
    }

    async def process_with_limit(queue_name: str, job_data: dict):
        async with semaphore:
            try:
                processor = processors[queue_name]
                await processor(job_data)
            except Exception as e:
                logger.error(f"[GraphWorker] Error processing job from {queue_name}: {e}")

    while True:
        try:
            # Block until job available from any queue (BLPOP with 5s timeout)
            # Try all queues in round-robin fashion
            for queue_name in [entity_queue, concept_queue, similarity_queue]:
                result = await redis_client.blpop(queue_name, timeout=1)

                if result:
                    _, job_json = result
                    job_data = json.loads(job_json)

                    # Process job asynchronously with concurrency control
                    asyncio.create_task(process_with_limit(queue_name, job_data))

        except KeyboardInterrupt:
            logger.info("[GraphWorker] Shutting down gracefully...")
            break
        except Exception as e:
            logger.error(f"[GraphWorker] Error in main loop: {e}")
            await asyncio.sleep(1)  # Brief delay before retry

    await redis_client.close()


if __name__ == "__main__":
    # Run worker
    asyncio.run(consume_graph_jobs())
