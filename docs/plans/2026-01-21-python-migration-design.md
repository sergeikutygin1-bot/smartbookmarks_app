# Python AI Worker Migration Design

**Date**: 2026-01-21
**Status**: Approved - Ready for Implementation
**Scope**: Migrate Phase 1 enrichment agents from TypeScript to Python

## Overview

This design migrates the Smart Bookmarks enrichment pipeline from TypeScript/LangChain to Python/LangChain while maintaining full compatibility with the existing TypeScript API, database, and queue system.

**Migration Strategy**: Python worker as drop-in replacement for TypeScript enrichment worker.

## Architecture

### Current (TypeScript)
```
TypeScript API → Redis Queue (BullMQ) → TypeScript Worker → PostgreSQL
                                         ↓
                                    agents/
                                    - ContentTypeClassifierAgent
                                    - ArticleAnalyzerAgent
                                    - PaperAnalyzerAgent
                                    - VideoAnalyzerAgent
                                    - SocialAnalyzerAgent
                                    - DocumentAnalyzerAgent
                                    - GenericAnalyzerAgent
```

### Target (Python)
```
TypeScript API → Redis Queue (BullMQ) → Python Worker → PostgreSQL
                                         ↓
                                    ai-service/
                                    - ContentTypeClassifierAgent
                                    - ArticleAnalyzerAgent
                                    - PaperAnalyzerAgent
                                    - VideoAnalyzerAgent
                                    - SocialAnalyzerAgent
                                    - DocumentAnalyzerAgent
                                    - GenericAnalyzerAgent
```

### What Changes
- **Moves to Python**: `backend/src/agents/`, `backend/src/workers/enrichmentWorker.ts`
- **Stays TypeScript**: API routes, middleware, auth, services, repositories, frontend
- **Same Database**: PostgreSQL schema unchanged, SQLAlchemy uses same table/column names
- **Same Queue**: BullMQ on Redis, Python worker consumes same job format

## Technology Stack

### Core Dependencies
- **LangChain 0.1.0**: LLM application framework
- **langchain-openai 0.0.5**: OpenAI integration (ChatOpenAI, embeddings)
- **Pydantic v2**: Schema validation (equivalent to TypeScript Zod)
- **SQLAlchemy 2.0+**: Async ORM for PostgreSQL (equivalent to Prisma)
- **taskiq 0.11.0**: Modern async task queue (better than python-bullmq)
- **asyncpg**: Async PostgreSQL driver
- **FastAPI/Uvicorn**: Optional HTTP server for health checks

### Python vs TypeScript Equivalents
| TypeScript | Python | Purpose |
|------------|--------|---------|
| Prisma | SQLAlchemy 2.0+ | Async ORM |
| Zod | Pydantic v2 | Schema validation |
| BullMQ | taskiq + taskiq-redis | Task queue |
| Express | FastAPI | HTTP server (optional) |

## Data Flow

### Job Schema (Shared Between TypeScript & Python)

**TypeScript Enqueues** (in `enrichmentQueue.ts`):
```typescript
await enrichmentQueue.add("enrich", {
  bookmarkId: string,
  url: string,
  extractedContent: {
    url: string,
    title: string,
    domain: string,
    contentType: "article" | "paper" | "video" | "social" | "document" | "other",
    rawText: string,
    cleanText: string,
    extractionConfidence: number,
    extractedAt: Date,
    metadata?: Record<string, any>
  },
  userTags: string[],
  userId: string
});
```

**Python Consumes** (in `worker.py`):
```python
@broker.task(task_name="enrich", max_retries=3)
async def process_enrichment_job(job_data: dict) -> dict:
    data = EnrichmentJobData(**job_data["data"])
    # ... process with EnrichmentAgent
    return result
```

### Processing Pipeline

```
1. Content Classification (heuristics + LLM fallback)
   ↓ DetectedContentType
2. Specialized Analysis (content-type specific analyzer)
   ↓ EnhancedAnalysisResult
3. Embedding Generation (OpenAI text-embedding-3-small)
   ↓ float[] (1536 dimensions)
4. Database Update (SQLAlchemy async session)
   ↓ Bookmark record updated
5. Return Result (job complete)
```

## Python Worker Implementation

### Project Structure
```
ai-service/
├── agents/
│   ├── __init__.py
│   ├── enrichment_agent.py          # Main orchestrator
│   ├── content_type_classifier.py   # Two-phase classification
│   └── analyzers/
│       ├── __init__.py
│       ├── base_analyzer.py         # Abstract base class
│       ├── article_analyzer.py
│       ├── paper_analyzer.py
│       ├── video_analyzer.py
│       ├── social_analyzer.py
│       ├── document_analyzer.py
│       └── generic_analyzer.py
├── schemas/
│   ├── __init__.py
│   └── enrichment.py                # Pydantic models
├── utils/
│   ├── __init__.py
│   └── cost_calculator.py
├── config.py                        # Settings management
├── worker.py                        # Main worker entry point
├── requirements.txt
└── Dockerfile
```

### Key Classes

**EnrichmentAgent** (`agents/enrichment_agent.py`)
- Purpose: Orchestrates entire enrichment pipeline
- Methods:
  - `async def enrich(url, extracted_content, user_tags, user_id)`: Main entry point
  - `async def _classify_content()`: Phase 1 classification
  - `async def _analyze_content()`: Phase 2 specialized analysis
  - `async def _generate_embedding()`: Phase 3 embedding creation
  - `def _select_analyzer(content_type)`: Factory method for analyzer selection
- Returns: Complete enrichment result with traces

**BaseAnalyzerAgent** (`agents/analyzers/base_analyzer.py`)
- Purpose: Abstract base class for all content-type analyzers
- Shared utilities:
  - `async def invoke_with_trace()`: LLM invocation with structured output
  - `def calculate_content_metrics()`: Flesch-Kincaid grade level
  - `def build_user_prompt()`: Merge user/LLM context
  - `def get_fallback_result()`: Graceful degradation
- All subclasses must implement:
  - `async def analyze(context: AnalyzerContext)`
  - `def get_system_prompt() -> str`

**ContentTypeClassifierAgent** (`agents/content_type_classifier.py`)
- Purpose: Two-phase classification (heuristics + LLM fallback)
- Phase 1: Heuristics (free, fast)
  - Domain patterns: `youtube.com` → video, `arxiv.org` → paper
  - URL path patterns: `/docs` → document, `/watch` → video
  - Content structure: word count, keywords
- Phase 2: LLM Classification (if confidence < 0.9)
  - Model: gpt-4o-mini-2024-07-18
  - Temperature: 0.0 (deterministic)
  - Structured output: `ContentTypeClassification` schema

### LangChain Patterns (Python)

**Structured Output** (equivalent to TypeScript `withStructuredOutput()`):
```python
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableSequence
from langchain_core.prompts import PromptTemplate

llm = ChatOpenAI(
    model="gpt-4o-mini-2024-07-18",
    temperature=0.4,
    max_tokens=3500,
    max_retries=6
)

# Key method: with_structured_output()
llm_with_structure = llm.with_structured_output(EnhancedAnalysisResult)

# LCEL Chain
prompt_template = PromptTemplate.from_template("{system_prompt}\n\n{user_prompt}")
chain = RunnableSequence(prompt_template, llm_with_structure)

# Async invocation
result = await chain.ainvoke({
    "system_prompt": system_prompt,
    "user_prompt": user_prompt
})
```

**Token Tracking** (for cost calculation):
```python
response = await llm.ainvoke(messages)
token_usage = response.response_metadata["token_usage"]
# {
#   "prompt_tokens": 450,
#   "completion_tokens": 280,
#   "total_tokens": 730
# }
```

### Pydantic Schemas (`schemas/enrichment.py`)

**Key Schemas**:
```python
from pydantic import BaseModel, Field, confloat, constr
from enum import Enum
from typing import List, Optional

class DetectedContentType(str, Enum):
    ARTICLE = "article"
    PAPER = "paper"
    VIDEO = "video"
    SOCIAL = "social"
    DOCUMENT = "document"
    OTHER = "other"

class ContentMetrics(BaseModel):
    reading_level: float = Field(ge=0.0, le=20.0)
    word_count: int = Field(ge=0)
    estimated_read_time: int = Field(ge=0)

class EnhancedAnalysisResult(BaseModel):
    title: constr(min_length=5, max_length=150)
    summary: constr(min_length=200, max_length=3500)
    tags: List[constr(min_length=1, max_length=50)]
    key_points: List[str]
    tone: str
    content_metrics: ContentMetrics
    confidence: confloat(ge=0.0, le=1.0)
    model_used: str
```

## Worker Integration & Deployment

### Docker Service Configuration

**docker-compose.yml** (updated):
```yaml
services:
  ai-worker:  # NEW - Replaces backend-worker
    build:
      context: ./ai-service
      dockerfile: Dockerfile
    container_name: smartbookmarks_ai_worker
    environment:
      - DATABASE_URL=postgresql+asyncpg://smartbookmarks:dev_password@postgres:5432/smartbookmarks
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AI_MODEL=gpt-4o-mini-2024-07-18
      - WORKER_CONCURRENCY=5
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    command: python -m worker

  # backend-worker service REMOVED (replaced by ai-worker)
```

**Dockerfile** (`ai-service/Dockerfile`):
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run worker
CMD ["python", "-m", "worker"]
```

### Database Integration (SQLAlchemy)

**Model Mapping** (SQLAlchemy ↔ Prisma):
- Use `@map()` names from Prisma schema for column names
- Snake_case in Python code, database columns match Prisma exactly
- Example: `created_at` (Python) → `created_at` (DB, via Prisma `@map("created_at")`)

**Async Session Pattern**:
```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_session():
    async with async_session() as session:
        yield session
```

## Testing Strategy

### Test Structure
```
ai-service/tests/
├── conftest.py                      # Pytest fixtures
├── unit/
│   ├── test_base_analyzer.py
│   ├── test_classifier.py
│   ├── test_article_analyzer.py
│   ├── test_paper_analyzer.py
│   ├── test_video_analyzer.py
│   ├── test_social_analyzer.py
│   ├── test_document_analyzer.py
│   └── test_cost_calculator.py
└── integration/
    ├── test_enrichment_agent.py     # Full pipeline
    └── test_worker.py               # Worker integration
```

### Key Test Fixtures (`conftest.py`)
```python
import pytest
from schemas.enrichment import ExtractedContent, AnalyzerContext

@pytest.fixture
def sample_article():
    return ExtractedContent(
        url="https://example.com/article",
        title="Sample Article",
        domain="example.com",
        content_type="article",
        raw_text="...",
        clean_text="Scientists have made a breakthrough...",
        extraction_confidence=0.95,
        extracted_at=datetime.now()
    )

@pytest.fixture
def sample_classification():
    return ContentTypeClassification(
        type=DetectedContentType.ARTICLE,
        confidence=0.95,
        method="heuristic",
        indicators={
            "domain_match": "news_site",
            "url_pattern": "article_path"
        }
    )

@pytest.fixture
def mock_openai_response():
    # Mock LLM response for testing
    return EnhancedAnalysisResult(...)
```

### Test Commands
```bash
# Run all tests
pytest -v

# Run with coverage
pytest --cov=ai_service --cov-report=html

# Run specific test file
pytest tests/unit/test_classifier.py -v

# Run integration tests only
pytest tests/integration/ -v
```

## Migration Steps & Implementation Plan

### Phase 1: Preparation (Day 1)
1. Create feature branch: `git checkout -b feature/python-ai-worker`
2. Set up Python project structure in `ai-service/` directory
3. Install dependencies and configure development environment
4. Create SQLAlchemy models matching existing Prisma schema (use `@map()` names)

### Phase 2: Parallel Implementation (Days 2-4)
1. Implement all Python agents (classifier, analyzers, enrichment agent)
2. Create worker.py with taskiq integration
3. Write comprehensive test suite (unit + integration)
4. Run tests until all passing: `pytest -v --cov=ai_service`

### Phase 3: Parallel Running (Days 5-6)
1. Deploy Python worker alongside TypeScript worker (both running)
2. Configure Python worker to consume from a separate test queue: `enrichment-jobs-python`
3. Send 10% of enrichment jobs to Python queue for validation
4. Compare results: same bookmarkId through both pipelines, verify identical outputs
5. Monitor for errors, performance, cost differences

### Phase 4: Gradual Cutover (Day 7)
1. Increase Python worker load: 25% → 50% → 75% → 100%
2. Monitor queue metrics, error rates, enrichment quality
3. Once confident (100% traffic, 24hr stability), decommission TypeScript worker
4. Update docker-compose.yml: remove `backend-worker`, keep only `ai-worker`
5. Delete `backend/src/agents/` and `backend/src/workers/enrichmentWorker.ts`

### Rollback Plan
If critical issues arise, route 100% traffic back to TypeScript worker immediately. Python worker stays deployed for debugging.

## Success Criteria

### Functional Requirements
- ✅ All 7 content types classified correctly (article, paper, video, social, document, other)
- ✅ All 6 specialized analyzers produce identical output to TypeScript equivalents
- ✅ Embedding generation matches TypeScript implementation (1536-dim vectors)
- ✅ Database updates successful (SQLAlchemy writes match Prisma schema)
- ✅ Job completion/failure handled correctly (retries, error logging)

### Performance Requirements
- ✅ Enrichment latency ≤ TypeScript baseline (15s p95)
- ✅ Queue processing throughput ≥ TypeScript baseline (20 jobs/min)
- ✅ Cost per enrichment ≤ TypeScript baseline ($0.03/bookmark)

### Quality Requirements
- ✅ Test coverage ≥ 80% (pytest --cov)
- ✅ Zero critical bugs in 24hr parallel run
- ✅ Agent trace data captured for all enrichments

## Cost Optimization Notes

### Temperature Settings (Critical for Consistency)
- **Classification**: 0.0 (deterministic, no randomness)
- **Analysis**: 0.4 (balanced creativity + consistency)

### Model Selection
- **All agents**: gpt-4o-mini-2024-07-18 (cost-effective, high quality)
- **Future Phase 2**: Consider gpt-3.5-turbo for canonicalization ($0.0002/bookmark cheaper)

### Caching Strategy (Inherited from TypeScript)
- Embedding cache: 24hr TTL (Redis)
- Classification cache: 30min TTL (Redis)
- No changes to existing cache layers

## Future Phases (Post-Migration)

Once Python migration is complete and stable:

- **Phase 2**: Canonicalization Service (reduce entity/concept duplication 40% → <5%)
- **Phase 3**: Advanced Embeddings (hierarchical embeddings, chunk search)
- **Phase 4**: Admin Panel & Observability (enrichment traces, re-enrichment UI)
- **Phase 5**: Optimization & Refinement (prompt tuning, cost reduction)

## References

- Original TypeScript implementation: `backend/src/agents/`
- Phase 1 completion report: `docs/phases/PHASE_1_CONTENT_TYPE_ROUTING.md`
- Comprehensive improvement plan: `~/.claude/plans/witty-booping-dahl.md`
- Test output: `backend/src/tests/content-type-classification-test.ts`

---

**Design Status**: ✅ Approved
**Next Step**: Create detailed implementation plan and begin Phase 1 (Preparation)
