# AI Service - Python Enrichment Worker

This is the Python-based AI worker service that processes bookmark enrichment jobs using LangChain.

## Architecture

```
ai-service/
├── agents/              # LangChain agents for content processing
│   ├── analyzers/       # Content-type specific analyzers
│   ├── enrichment_agent.py
│   └── content_type_classifier.py
├── schemas/             # Pydantic schemas for data validation
├── utils/               # Utility functions (cost calculator, etc.)
├── tests/               # Pytest test suite
│   ├── unit/
│   └── integration/
├── config.py            # Configuration management
├── worker.py            # Main worker entry point (taskiq)
├── requirements.txt     # Python dependencies
└── Dockerfile           # Container definition
```

## Technology Stack

- **LangChain 0.1.0**: LLM application framework
- **langchain-openai 0.0.5**: OpenAI integration
- **Pydantic v2**: Schema validation
- **SQLAlchemy 2.0+**: Async ORM for PostgreSQL
- **taskiq 0.11.0**: Task queue integration with BullMQ/Redis
- **asyncpg**: Async PostgreSQL driver

## Development

```bash
# Run tests
pytest -v

# Run with coverage
pytest --cov=ai_service --cov-report=html

# Run worker locally
python -m worker
```

## Docker

```bash
# Build image
docker build -t smartbookmarks-ai-worker .

# Run container
docker run --env-file .env smartbookmarks-ai-worker
```

See `docs/plans/2026-01-21-python-migration-design.md` for full migration documentation.
