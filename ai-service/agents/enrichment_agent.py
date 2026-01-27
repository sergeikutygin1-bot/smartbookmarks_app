"""
EnrichmentAgent - Main orchestrator for the enrichment pipeline.

Coordinates content classification, analysis, and embedding generation.
Python equivalent of backend/src/workers/enrichmentWorker.ts logic.
"""
from typing import List, Optional, Callable, Awaitable, Any
import time
from datetime import datetime

from langchain_openai import OpenAIEmbeddings

from agents.content_type_classifier import ContentTypeClassifierAgent
from agents.analyzers.article_analyzer import ArticleAnalyzerAgent
from agents.analyzers.paper_analyzer import PaperAnalyzerAgent
from agents.analyzers.video_analyzer import VideoAnalyzerAgent
from agents.analyzers.social_analyzer import SocialAnalyzerAgent
from agents.analyzers.document_analyzer import DocumentAnalyzerAgent
from agents.analyzers.generic_analyzer import GenericAnalyzerAgent
from schemas.enrichment import (
    ExtractedContent,
    DetectedContentType,
    AnalyzerContext,
    EnhancedAnalysisResult,
    AnalysisTrace,
    EnrichmentResult,
)
from utils.cost_calculator import calculate_embedding_cost, estimate_tokens
from config import settings


class EnrichmentAgent:
    """
    Main orchestrator for bookmark enrichment pipeline.

    Pipeline stages:
    1. Content classification (heuristic + LLM fallback)
    2. Specialized analysis (content-type specific)
    3. Embedding generation (OpenAI text-embedding-3-small)

    Returns complete enrichment result with traces for observability.
    """

    def __init__(self):
        """Initialize enrichment agent."""
        self.classifier = ContentTypeClassifierAgent()
        self.progress_callback: Optional[Callable[[int], Awaitable[None]]] = None
        self.agent_traces: List[AnalysisTrace] = []

    def on_progress(self, callback: Callable[[int], Awaitable[None]]):
        """
        Register progress callback for real-time updates.

        Args:
            callback: Async function that receives progress percentage (0-100)
        """
        self.progress_callback = callback

    async def enrich(
        self,
        bookmark_id: str,
        url: str,
        extracted_content: ExtractedContent,
        user_tags: List[str],
        user_id: str
    ) -> EnrichmentResult:
        """
        Execute full enrichment pipeline.

        Args:
            bookmark_id: Bookmark ID
            url: Content URL
            extracted_content: Extracted content from URL
            user_tags: User-provided tags
            user_id: User ID

        Returns:
            Complete enrichment result with analysis and embedding
        """
        pipeline_start = time.time()
        self.agent_traces = []

        try:
            # Step 1: Classify content type (10% progress)
            await self._update_progress(10)
            classification = await self._classify_content(url, extracted_content)

            # Step 2: Analyze with specialized analyzer (50% progress)
            await self._update_progress(50)
            analysis, analysis_trace = await self._analyze_content(
                extracted_content,
                classification.type,
                user_tags
            )
            self.agent_traces.append(analysis_trace)

            # Step 3: Generate embedding (80% progress)
            await self._update_progress(80)
            embedding, embedding_trace = await self._generate_embedding(
                analysis,
                user_tags
            )
            self.agent_traces.append(embedding_trace)

            # Complete (100% progress)
            await self._update_progress(100)

            # Calculate total cost and latency
            total_cost = sum(trace.cost_usd or 0.0 for trace in self.agent_traces)
            total_latency = int((time.time() - pipeline_start) * 1000)

            return EnrichmentResult(
                bookmark_id=bookmark_id,
                url=url,
                title=analysis.title,
                summary=analysis.summary,
                tags=analysis.tags,
                key_points=analysis.key_points,
                tone=analysis.tone,
                content_type=classification.type,
                content_metrics=analysis.content_metrics,
                embedding=embedding,
                confidence=analysis.confidence,
                analysis_traces=self.agent_traces,
                total_cost_usd=total_cost,
                total_latency_ms=total_latency,
                enriched_at=datetime.now()
            )

        except Exception as error:
            print(f"[EnrichmentAgent] Pipeline failed: {error}")
            raise

    async def _classify_content(
        self,
        url: str,
        extracted_content: ExtractedContent
    ) -> Any:
        """
        Step 1: Classify content type.

        Args:
            url: Content URL
            extracted_content: Extracted content

        Returns:
            ContentTypeClassification
        """
        start_time = time.time()

        classification = await self.classifier.classify(url, extracted_content)

        latency_ms = int((time.time() - start_time) * 1000)

        # Create trace for classification
        trace = AnalysisTrace(
            step="classification",
            agent="ContentTypeClassifierAgent",
            model="gpt-4o-mini-2024-07-18" if classification.method == "llm" else None,
            input_tokens=None,
            output_tokens=None,
            cost_usd=0.0003 if classification.method == "llm" else 0.0,  # Estimated
            latency_ms=latency_ms,
            success=True,
            metadata={
                "content_type": classification.type.value,
                "confidence": classification.confidence,
                "method": classification.method,
                "indicators": classification.indicators
            }
        )
        self.agent_traces.append(trace)

        return classification

    async def _analyze_content(
        self,
        extracted_content: ExtractedContent,
        content_type: DetectedContentType,
        user_tags: List[str]
    ) -> tuple[EnhancedAnalysisResult, AnalysisTrace]:
        """
        Step 2: Analyze content with specialized analyzer.

        Args:
            extracted_content: Extracted content
            content_type: Detected content type
            user_tags: User-provided tags

        Returns:
            Tuple of (analysis result, trace)
        """
        # Select appropriate analyzer
        analyzer = self._select_analyzer(content_type)

        # Build analyzer context
        context = AnalyzerContext(
            url=extracted_content.url,
            title=extracted_content.title,
            clean_text=extracted_content.clean_text,
            content_type=content_type,
            user_provided_title=None,  # Could be added in future
            user_provided_summary=None,  # Could be added in future
            user_tags=user_tags,
            metadata=extracted_content.metadata
        )

        # Run analysis
        result, trace = await analyzer.analyze(context)

        return result, trace

    def _select_analyzer(self, content_type: DetectedContentType):
        """
        Factory method to select appropriate analyzer.

        Args:
            content_type: Detected content type

        Returns:
            Analyzer instance
        """
        if content_type == DetectedContentType.ARTICLE:
            return ArticleAnalyzerAgent()
        elif content_type == DetectedContentType.PAPER:
            return PaperAnalyzerAgent()
        elif content_type == DetectedContentType.VIDEO:
            return VideoAnalyzerAgent()
        elif content_type == DetectedContentType.SOCIAL:
            return SocialAnalyzerAgent()
        elif content_type == DetectedContentType.DOCUMENT:
            return DocumentAnalyzerAgent()
        else:  # DetectedContentType.OTHER
            return GenericAnalyzerAgent()

    async def _generate_embedding(
        self,
        analysis: EnhancedAnalysisResult,
        user_tags: List[str]
    ) -> tuple[List[float], AnalysisTrace]:
        """
        Step 3: Generate embedding vector.

        Args:
            analysis: Analysis result
            user_tags: User-provided tags

        Returns:
            Tuple of (embedding vector, trace)
        """
        start_time = time.time()

        # Combine title + summary + tags for embedding
        all_tags = list(set(analysis.tags + user_tags))
        embedding_text = f"{analysis.title}\n\n{analysis.summary}\n\nTags: {', '.join(all_tags)}"

        try:
            # Generate embedding using OpenAI
            embeddings = OpenAIEmbeddings(
                model=settings.EMBEDDING_MODEL,
                openai_api_key=settings.OPENAI_API_KEY
            )

            embedding_vector = await embeddings.aembed_query(embedding_text)

            latency_ms = int((time.time() - start_time) * 1000)

            # Estimate tokens and cost
            tokens_used = estimate_tokens(embedding_text)
            cost_usd = calculate_embedding_cost(settings.EMBEDDING_MODEL, tokens_used)

            trace = AnalysisTrace(
                step="embedding",
                agent="OpenAIEmbeddings",
                model=settings.EMBEDDING_MODEL,
                input_tokens=tokens_used,
                output_tokens=0,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
                success=True,
                metadata={
                    "dimensions": len(embedding_vector),
                    "text_length": len(embedding_text)
                }
            )

            return embedding_vector, trace

        except Exception as error:
            print(f"[EnrichmentAgent] Embedding generation failed: {error}")

            # Return zero vector as fallback
            latency_ms = int((time.time() - start_time) * 1000)
            trace = AnalysisTrace(
                step="embedding",
                agent="OpenAIEmbeddings",
                model=settings.EMBEDDING_MODEL,
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
                latency_ms=latency_ms,
                success=False,
                error_message=str(error)
            )

            return [0.0] * 1536, trace  # Return zero vector

    async def _update_progress(self, percentage: int):
        """
        Update progress via callback if registered.

        Args:
            percentage: Progress percentage (0-100)
        """
        if self.progress_callback:
            await self.progress_callback(percentage)
