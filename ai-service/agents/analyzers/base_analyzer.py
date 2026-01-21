"""
BaseAnalyzerAgent - Abstract base class for content-type specific analyzers.

Provides shared utilities, tracing logic, and standard output format.
Python equivalent of backend/src/agents/analyzers/BaseAnalyzerAgent.ts
"""
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any
import time
import re
from datetime import datetime

from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableSequence

from schemas.enrichment import (
    AnalyzerContext,
    EnhancedAnalysisResult,
    ContentMetrics,
    AnalysisTrace,
    TokenUsage,
)
from utils.cost_calculator import calculate_cost
from config import settings


class BaseAnalyzerAgent(ABC):
    """
    Abstract base class for all content-type specific analyzers.

    Concrete analyzers must implement:
    - get_system_prompt(): Content-type specific prompt
    - analyze(): Main analysis logic

    Features:
    - Shared LLM invocation with structured output
    - Consistent tracing (compatible with TypeScript AgentTrace system)
    - Content metrics calculation (reading level, word count, read time)
    - Graceful fallback on errors
    """

    def __init__(
        self,
        model_name: str = None,
        temperature: float = None,
        max_tokens: int = None
    ):
        """
        Initialize base analyzer.

        Args:
            model_name: OpenAI model to use (default: from settings)
            temperature: Sampling temperature (default: 0.4)
            max_tokens: Maximum tokens in response (default: 3500)
        """
        self.model_name = model_name or settings.AI_MODEL
        self.temperature = temperature if temperature is not None else settings.ANALYSIS_TEMPERATURE
        self.max_tokens = max_tokens or settings.MAX_TOKENS_ANALYSIS

    @abstractmethod
    async def analyze(
        self,
        context: AnalyzerContext
    ) -> Tuple[EnhancedAnalysisResult, AnalysisTrace]:
        """
        Main analysis method - must be implemented by each analyzer.

        Args:
            context: Analyzer context with content and metadata

        Returns:
            Tuple of (analysis result, trace)
        """
        pass

    @abstractmethod
    def get_system_prompt(self) -> str:
        """
        Get the content-specific system prompt.
        Each analyzer implements its own prompt.

        Returns:
            System prompt string
        """
        pass

    def build_user_prompt(self, context: AnalyzerContext) -> str:
        """
        Build user prompt with context.
        Shared across all analyzers.

        Args:
            context: Analyzer context

        Returns:
            Formatted user prompt
        """
        user_context_str = ""
        if context.user_provided_title or context.user_provided_summary or context.user_tags:
            user_context_str = f"""**User Context (optional - merge/enhance if provided):**
- Title: {context.user_provided_title or "(none)"}
- Summary: {context.user_provided_summary or "(none)"}
- Tags: {", ".join(context.user_tags) if context.user_tags else "(none)"}"""

        return f"""## INPUT

**Detected Content Type:** {context.content_type.value}
**Extracted Title:** {context.title}
**Domain:** {context.url.split('/')[2] if '/' in context.url else context.url}

**Content to Analyze:**
{context.clean_text[:15000]}

{user_context_str}

## OUTPUT

Return ONLY valid JSON matching the EnhancedAnalysisResult schema:
- title: Improved/clarified title (5-150 chars)
- summary: Comprehensive structured summary (200-3500 chars)
- tags: 3-5 focused tags
- key_points: 3-10 bullet points of main ideas
- tone: Content tone (formal/casual/technical/persuasive/neutral/etc)
- content_metrics: {{ reading_level, word_count, estimated_read_time }}
- confidence: Your confidence in this analysis (0.0-1.0)
- model_used: "{self.model_name}"
"""

    async def invoke_with_trace(
        self,
        system_prompt: str,
        user_prompt: str,
        context: AnalyzerContext
    ) -> Tuple[EnhancedAnalysisResult, AnalysisTrace]:
        """
        Shared LLM invocation with tracing.
        Reuses pattern from TypeScript analysisChain.ts

        Args:
            system_prompt: System prompt for the LLM
            user_prompt: User prompt with content
            context: Analyzer context

        Returns:
            Tuple of (analysis result, trace)
        """
        start_time = time.time()
        timestamp = datetime.now()

        # Initialize LLM with structured output
        llm = ChatOpenAI(
            model=self.model_name,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            max_retries=settings.LLM_MAX_RETRIES
        )

        # Use with_structured_output for Pydantic model
        llm_with_structure = llm.with_structured_output(EnhancedAnalysisResult)

        # Create prompt template
        prompt_template = PromptTemplate.from_template(
            "{system_prompt}\n\n{user_prompt}"
        )

        # Build chain
        chain = RunnableSequence(prompt_template, llm_with_structure)

        # Format prompt for tracing
        prompt_text = await prompt_template.aformat(
            system_prompt=system_prompt,
            user_prompt=user_prompt
        )

        try:
            # Invoke chain
            result = await chain.ainvoke({
                "system_prompt": system_prompt,
                "user_prompt": user_prompt
            })

            duration_ms = int((time.time() - start_time) * 1000)

            # Extract token usage from response metadata
            # LangChain Python stores this in response.response_metadata
            token_usage = TokenUsage(
                prompt_tokens=getattr(result, 'usage_metadata', {}).get('input_tokens', 0) or 0,
                completion_tokens=getattr(result, 'usage_metadata', {}).get('output_tokens', 0) or 0,
                total_tokens=getattr(result, 'usage_metadata', {}).get('total_tokens', 0) or 0
            )

            # Estimate tokens if not available
            if token_usage.total_tokens == 0:
                token_usage.prompt_tokens = len(prompt_text) // 4
                token_usage.completion_tokens = len(str(result.dict())) // 4
                token_usage.total_tokens = token_usage.prompt_tokens + token_usage.completion_tokens

            # Calculate cost
            cost_breakdown = calculate_cost(self.model_name, token_usage)

            # Build trace
            trace = AnalysisTrace(
                step="analysis",
                agent=self.__class__.__name__,
                model=self.model_name,
                input_tokens=token_usage.prompt_tokens,
                output_tokens=token_usage.completion_tokens,
                cost_usd=cost_breakdown["total_cost"],
                latency_ms=duration_ms,
                success=True,
                metadata={
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                    "content_type": context.content_type.value,
                }
            )

            return result, trace

        except Exception as error:
            print(f"[{self.__class__.__name__}] Analysis failed: {str(error)}")

            # Fallback with minimal trace
            fallback = self.get_fallback_result(context)
            duration_ms = int((time.time() - start_time) * 1000)

            trace = AnalysisTrace(
                step="analysis",
                agent=self.__class__.__name__,
                model=self.model_name,
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
                latency_ms=duration_ms,
                success=False,
                error_message=str(error),
                metadata={
                    "fallback": True,
                    "content_type": context.content_type.value,
                }
            )

            return fallback, trace

    def calculate_content_metrics(self, text: str) -> ContentMetrics:
        """
        Calculate reading metrics using Flesch-Kincaid grade level.

        Args:
            text: Text content to analyze

        Returns:
            ContentMetrics with reading level, word count, and read time
        """
        words = [w for w in text.split() if len(w) > 0]
        word_count = len(words)

        sentences = re.split(r'[.!?]+', text)
        sentence_count = max(1, len([s for s in sentences if s.strip()]))

        syllable_count = self._estimate_syllables(text)

        # Flesch-Kincaid Grade Level
        # Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
        reading_level = max(
            0,
            0.39 * (word_count / sentence_count) +
            11.8 * (syllable_count / max(word_count, 1)) -
            15.59
        )

        # Round to 1 decimal place
        reading_level = round(reading_level, 1)

        # Average reading speed: 200 words/minute
        estimated_read_time = max(1, (word_count + 199) // 200)  # Ceiling division

        return ContentMetrics(
            reading_level=reading_level,
            word_count=word_count,
            estimated_read_time=estimated_read_time
        )

    def _estimate_syllables(self, text: str) -> int:
        """
        Estimate syllable count for Flesch-Kincaid calculation.
        Simple heuristic: count vowel groups.

        Args:
            text: Text to analyze

        Returns:
            Estimated syllable count
        """
        words = text.lower().split()
        syllables = 0

        for word in words:
            if not word:
                continue

            # Count vowel groups (consecutive vowels = 1 syllable)
            vowel_groups = re.findall(r'[aeiouy]+', word)
            syllables += max(1, len(vowel_groups))

            # Adjust for silent 'e' at end
            if word.endswith('e') and len(word) > 2:
                syllables -= 1

        return max(syllables, 1)

    def get_fallback_result(self, context: AnalyzerContext) -> EnhancedAnalysisResult:
        """
        Fallback result if analysis fails.
        Provides graceful degradation.

        Args:
            context: Analyzer context

        Returns:
            Fallback EnhancedAnalysisResult
        """
        metrics = self.calculate_content_metrics(context.clean_text)

        domain = context.url.split('/')[2] if '/' in context.url else context.url

        return EnhancedAnalysisResult(
            title=context.user_provided_title or context.title or "Untitled Bookmark",
            summary=(
                context.user_provided_summary or
                f"Failed to analyze {context.content_type.value} content from {domain}. Manual review needed."
            ),
            tags=context.user_tags or [
                context.content_type.value,
                domain,
                "needs-review"
            ],
            key_points=[
                "Analysis failed - requires manual review",
                f"Content type: {context.content_type.value}",
                f"Domain: {domain}"
            ],
            tone="unknown",
            content_metrics=metrics,
            confidence=0.2,  # Low confidence for fallback
            model_used=self.model_name
        )
