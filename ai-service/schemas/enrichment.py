"""
Pydantic schemas for enrichment data validation.

These schemas mirror the TypeScript Zod schemas and define the contract
between the TypeScript API and the Python worker.
"""
from pydantic import BaseModel, Field, field_validator, confloat, constr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class DetectedContentType(str, Enum):
    """Content type classification (6 types)."""
    ARTICLE = "article"
    PAPER = "paper"
    VIDEO = "video"
    SOCIAL = "social"
    DOCUMENT = "document"
    OTHER = "other"


class ContentMetrics(BaseModel):
    """Content reading metrics."""
    reading_level: float = Field(ge=0.0, le=20.0, description="Flesch-Kincaid grade level")
    word_count: int = Field(ge=0, description="Total word count")
    estimated_read_time: int = Field(ge=0, description="Estimated read time in minutes")


class ExtractedContent(BaseModel):
    """Content extracted from URL by TypeScript extractor."""
    url: str
    title: str
    domain: str
    content_type: str  # Initial type, may be "other" before classification
    raw_text: str
    clean_text: str
    extraction_confidence: float = Field(ge=0.0, le=1.0)
    extracted_at: datetime
    metadata: Optional[Dict[str, Any]] = None

    @field_validator('url')
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Ensure URL is non-empty."""
        if not v or not v.strip():
            raise ValueError("URL cannot be empty")
        return v.strip()


class ContentTypeClassification(BaseModel):
    """Result of content type classification."""
    type: DetectedContentType
    confidence: float = Field(ge=0.0, le=1.0)
    method: str  # "heuristic" or "llm"
    indicators: Dict[str, Any] = Field(default_factory=dict)
    reasoning: Optional[str] = None


class AnalyzerContext(BaseModel):
    """Context passed to analyzer agents."""
    url: str
    title: str
    clean_text: str
    content_type: DetectedContentType
    user_provided_title: Optional[str] = None
    user_provided_summary: Optional[str] = None
    user_tags: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None


class EnhancedAnalysisResult(BaseModel):
    """Analysis result from content-specific analyzer (LLM output schema)."""
    title: constr(min_length=5, max_length=150)
    summary: constr(min_length=200, max_length=3500)
    tags: List[constr(min_length=1, max_length=50)] = Field(min_length=1, max_length=20)
    key_points: List[str] = Field(min_length=3, max_length=10)
    tone: str
    content_metrics: ContentMetrics
    confidence: confloat(ge=0.0, le=1.0)
    model_used: str

    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        """Ensure tags are unique and non-empty."""
        unique_tags = []
        seen = set()
        for tag in v:
            tag_lower = tag.lower().strip()
            if tag_lower and tag_lower not in seen:
                unique_tags.append(tag.strip())
                seen.add(tag_lower)
        return unique_tags


class TokenUsage(BaseModel):
    """Token usage from LLM API call."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class AnalysisTrace(BaseModel):
    """Trace data for a single analysis step."""
    step: str  # "classification", "analysis", "embedding"
    agent: str  # Agent class name
    model: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    latency_ms: int
    success: bool
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class EnrichmentJobData(BaseModel):
    """Job data passed from TypeScript API to Python worker."""
    bookmark_id: str
    url: str
    extracted_content: ExtractedContent
    user_tags: List[str] = Field(default_factory=list)
    user_id: str


class EnrichmentResult(BaseModel):
    """Complete enrichment result returned to TypeScript."""
    bookmark_id: str
    url: str
    title: str
    summary: str
    tags: List[str]
    key_points: List[str]
    tone: str
    content_type: DetectedContentType
    content_metrics: ContentMetrics
    embedding: List[float]  # 1536-dim vector
    confidence: float
    analysis_traces: List[AnalysisTrace]
    total_cost_usd: float
    total_latency_ms: int
    enriched_at: datetime


class EmbeddingRequest(BaseModel):
    """Request to generate embedding."""
    text: str
    model: str = "text-embedding-3-small"


class EmbeddingResponse(BaseModel):
    """Response from embedding generation."""
    embedding: List[float]
    tokens_used: int
    cost_usd: float
