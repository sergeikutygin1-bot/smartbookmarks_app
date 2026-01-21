"""
Configuration management for AI service.

Uses pydantic-settings to load and validate environment variables.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://redis:6379"

    # OpenAI API
    OPENAI_API_KEY: str
    AI_MODEL: str = "gpt-4o-mini-2024-07-18"
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Worker Configuration
    WORKER_CONCURRENCY: int = 5
    QUEUE_NAME: str = "enrichment-jobs"

    # Application
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"

    # Temperature settings (critical for consistency)
    CLASSIFICATION_TEMPERATURE: float = 0.0  # Deterministic
    ANALYSIS_TEMPERATURE: float = 0.4  # Balanced

    # Retry configuration
    MAX_RETRIES: int = 3
    RETRY_BASE_DELAY_SECONDS: int = 2

    # LLM Configuration
    MAX_TOKENS_ANALYSIS: int = 3500
    MAX_TOKENS_CLASSIFICATION: int = 500
    LLM_MAX_RETRIES: int = 6

    # Confidence thresholds
    CLASSIFICATION_CONFIDENCE_THRESHOLD: float = 0.9
    MIN_ANALYSIS_CONFIDENCE: float = 0.6

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


# Global settings instance
settings = Settings()
