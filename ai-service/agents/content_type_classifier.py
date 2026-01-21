"""
ContentTypeClassifierAgent - Two-phase content type classification.

Classifies content into specialized types for routing to appropriate analyzers.
Python equivalent of backend/src/agents/ContentTypeClassifierAgent.ts
"""
from urllib.parse import urlparse
import time

from langchain_openai import ChatOpenAI

from schemas.enrichment import (
    ContentTypeClassification,
    DetectedContentType,
    ExtractedContent,
)
from config import settings


class ContentTypeClassifierAgent:
    """
    Classifies content using a two-phase approach:
    1. Fast heuristic classification (free, <10ms) - handles ~70% of cases
    2. LLM fallback (GPT-4o-mini, ~500ms, $0.0003) - handles ambiguous cases

    Classification Types:
    - article: News, blog posts, essays
    - paper: Scientific papers, academic research
    - video: YouTube, Vimeo, video platforms
    - social: Twitter, LinkedIn, short-form content
    - document: Technical docs, API docs, guides
    - other: Fallback for everything else

    Cost: ~$0.0001/bookmark (30% need LLM at ~$0.0003 each)
    """

    CONFIDENCE_THRESHOLD = settings.CLASSIFICATION_CONFIDENCE_THRESHOLD  # 0.9

    async def classify(
        self,
        url: str,
        extracted_content: ExtractedContent
    ) -> ContentTypeClassification:
        """
        Classify content using heuristics first, LLM fallback if needed.

        Args:
            url: Content URL
            extracted_content: Extracted content from URL

        Returns:
            ContentTypeClassification result
        """
        # Phase 1: Try heuristic classification (fast, free)
        heuristic_result = self._classify_by_heuristics(url, extracted_content)

        # If high confidence, return immediately
        if heuristic_result.confidence >= self.CONFIDENCE_THRESHOLD:
            print(
                f"[ContentTypeClassifier] Heuristic classification: {heuristic_result.type.value} "
                f"(confidence: {heuristic_result.confidence:.2f})"
            )
            return heuristic_result

        # Phase 2: Use LLM for ambiguous cases
        print(
            f"[ContentTypeClassifier] Low heuristic confidence ({heuristic_result.confidence:.2f}), "
            f"using LLM fallback..."
        )
        return await self._classify_by_llm(extracted_content, heuristic_result)

    def _classify_by_heuristics(
        self,
        url: str,
        content: ExtractedContent
    ) -> ContentTypeClassification:
        """
        Phase 1: Fast heuristic classification.
        Analyzes URL patterns, domain, and content structure.

        Args:
            url: Content URL
            content: Extracted content

        Returns:
            ContentTypeClassification from heuristics
        """
        indicators = []
        content_type = DetectedContentType.OTHER
        confidence = 0.5  # Start with neutral confidence

        try:
            parsed_url = urlparse(url)
            domain = parsed_url.hostname.lower() if parsed_url.hostname else ""
            path = parsed_url.path.lower()

            # ==================================================================
            # DOMAIN PATTERNS (Highest Confidence: 0.90-0.98)
            # ==================================================================
            domain_patterns = {
                # Video platforms
                "youtube.com": {"type": DetectedContentType.VIDEO, "confidence": 0.98},
                "youtu.be": {"type": DetectedContentType.VIDEO, "confidence": 0.98},
                "vimeo.com": {"type": DetectedContentType.VIDEO, "confidence": 0.98},

                # Academic/Research platforms
                "arxiv.org": {"type": DetectedContentType.PAPER, "confidence": 0.95},
                "nature.com": {"type": DetectedContentType.PAPER, "confidence": 0.90},
                "sciencedirect.com": {"type": DetectedContentType.PAPER, "confidence": 0.90},
                "springer.com": {"type": DetectedContentType.PAPER, "confidence": 0.90},
                "ieee.org": {"type": DetectedContentType.PAPER, "confidence": 0.90},
                "acm.org": {"type": DetectedContentType.PAPER, "confidence": 0.90},

                # Social platforms
                "twitter.com": {"type": DetectedContentType.SOCIAL, "confidence": 0.95},
                "x.com": {"type": DetectedContentType.SOCIAL, "confidence": 0.95},
                "linkedin.com": {"type": DetectedContentType.SOCIAL, "confidence": 0.90},
                "instagram.com": {"type": DetectedContentType.SOCIAL, "confidence": 0.90},
                "facebook.com": {"type": DetectedContentType.SOCIAL, "confidence": 0.85},

                # News/Article platforms
                "medium.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.85},
                "dev.to": {"type": DetectedContentType.ARTICLE, "confidence": 0.85},
                "substack.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.85},
                "techcrunch.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.90},
                "theverge.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.90},
                "nytimes.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.90},
                "reuters.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.90},
                "bbc.com": {"type": DetectedContentType.ARTICLE, "confidence": 0.90},

                # Documentation platforms (prefix matching)
                "docs.": {"type": DetectedContentType.DOCUMENT, "confidence": 0.85},
            }

            # Check domain patterns
            for pattern, result in domain_patterns.items():
                if pattern in domain:
                    content_type = result["type"]
                    confidence = result["confidence"]
                    indicators.append(f"domain:{pattern}")
                    break

            # ==================================================================
            # URL PATH PATTERNS (Medium Confidence: 0.75-0.85)
            # ==================================================================
            if confidence < 0.85:  # Only check if not already high confidence
                if "/watch" in path or "/video" in path:
                    content_type = DetectedContentType.VIDEO
                    confidence = max(confidence, 0.85)
                    indicators.append("url:video-path")
                elif "/paper" in path or "/pdf" in path:
                    content_type = DetectedContentType.PAPER
                    confidence = max(confidence, 0.80)
                    indicators.append("url:paper-path")
                elif "/status/" in path or "/post/" in path or "/posts/" in path:
                    content_type = DetectedContentType.SOCIAL
                    confidence = max(confidence, 0.80)
                    indicators.append("url:social-path")
                elif "/docs" in path or "/documentation" in path or "/api" in path:
                    content_type = DetectedContentType.DOCUMENT
                    confidence = max(confidence, 0.80)
                    indicators.append("url:docs-path")
                elif "/blog" in path or "/article" in path or "/news" in path:
                    content_type = DetectedContentType.ARTICLE
                    confidence = max(confidence, 0.75)
                    indicators.append("url:article-path")

            # ==================================================================
            # CONTENT STRUCTURE PATTERNS (Lower Confidence: 0.70-0.75)
            # ==================================================================
            if confidence < 0.75:  # Only check if still ambiguous
                text = content.clean_text.lower()

                # PDF content detection
                if content.content_type == "pdf":
                    if "abstract" in text and ("introduction" in text or "methodology" in text):
                        content_type = DetectedContentType.PAPER
                        confidence = max(confidence, 0.75)
                        indicators.append("content:pdf-paper-structure")
                    else:
                        content_type = DetectedContentType.DOCUMENT
                        confidence = max(confidence, 0.75)
                        indicators.append("content:pdf-document")

                # Word count heuristics
                word_count = len([w for w in content.clean_text.split() if w])

                if word_count < 500:
                    # Short content → likely social
                    if content_type == DetectedContentType.OTHER:
                        content_type = DetectedContentType.SOCIAL
                    confidence = max(confidence, 0.70)
                    indicators.append("content:short-text")
                elif (word_count > 2000 and
                      content.metadata and
                      content.metadata.get("author") and
                      "abstract" not in text):
                    # Long content with author → likely article
                    if content_type == DetectedContentType.OTHER:
                        content_type = DetectedContentType.ARTICLE
                    confidence = max(confidence, 0.70)
                    indicators.append("content:long-article")

                # Academic paper indicators
                if ("abstract" in text and
                    "references" in text and
                    ("methodology" in text or "methods" in text or "results" in text)):
                    content_type = DetectedContentType.PAPER
                    confidence = max(confidence, 0.75)
                    indicators.append("content:academic-structure")

                # Documentation indicators
                if (("api" in text or "usage" in text or "example" in text) and
                    "function" in text):
                    content_type = DetectedContentType.DOCUMENT
                    confidence = max(confidence, 0.70)
                    indicators.append("content:docs-indicators")

            return ContentTypeClassification(
                type=content_type,
                confidence=confidence,
                method="heuristic",
                indicators={
                    "domain": domain,
                    "url_patterns": [i for i in indicators if i.startswith("url:")],
                    "html_structure": [i for i in indicators if i.startswith("content:")],
                }
            )

        except Exception as error:
            print(f"[ContentTypeClassifier] Heuristic classification failed: {error}")
            # Fallback to neutral result
            return ContentTypeClassification(
                type=DetectedContentType.OTHER,
                confidence=0.5,
                method="heuristic",
                indicators={"domain": "unknown"}
            )

    async def _classify_by_llm(
        self,
        content: ExtractedContent,
        heuristic_hint: ContentTypeClassification
    ) -> ContentTypeClassification:
        """
        Phase 2: LLM classification for ambiguous cases.
        Uses GPT-4o-mini with structured output.

        Args:
            content: Extracted content
            heuristic_hint: Heuristic classification hint

        Returns:
            ContentTypeClassification from LLM
        """
        start_time = time.time()

        try:
            prompt = self._build_classification_prompt(content, heuristic_hint)

            llm = ChatOpenAI(
                model="gpt-4o-mini-2024-07-18",
                temperature=settings.CLASSIFICATION_TEMPERATURE,  # 0.0 for deterministic
                max_tokens=settings.MAX_TOKENS_CLASSIFICATION,
                max_retries=3
            )

            llm_with_structure = llm.with_structured_output(ContentTypeClassification)

            result = await llm_with_structure.ainvoke(prompt)

            duration_ms = int((time.time() - start_time) * 1000)
            print(
                f"[ContentTypeClassifier] LLM classification: {result.type.value} "
                f"(confidence: {result.confidence:.2f}, {duration_ms}ms)"
            )

            # Override method to "llm"
            result.method = "llm"
            return result

        except Exception as error:
            print(f"[ContentTypeClassifier] LLM classification failed: {error}")
            # Fallback to heuristic result
            return heuristic_hint

    def _build_classification_prompt(
        self,
        content: ExtractedContent,
        heuristic_hint: ContentTypeClassification
    ) -> str:
        """
        Build classification prompt for LLM.

        Args:
            content: Extracted content
            heuristic_hint: Heuristic classification hint

        Returns:
            Formatted prompt string
        """
        # Take first 2000 chars for classification (sufficient for most content)
        content_preview = content.clean_text[:2000]

        return f"""Classify this content into exactly ONE type: article, paper, video, social, document, or other.

**Title:** {content.title}
**Domain:** {content.domain}
**Content Type (extractor):** {content.content_type}

**Content Preview (first 2000 chars):**
{content_preview}

**Heuristic Guess:** {heuristic_hint.type.value} (confidence: {heuristic_hint.confidence:.2f})

**Classification Criteria:**
- **article**: News articles, blog posts, essays, opinion pieces, feature stories
- **paper**: Scientific papers, research articles, academic publications (contains Abstract, Methods, Results, References)
- **video**: YouTube videos, video content, video transcripts (mentions timestamps, speaker, video-specific content)
- **social**: Tweets, LinkedIn posts, social media content, short-form conversational content (<1000 words)
- **document**: Technical documentation, API docs, guides, manuals, tutorials (how-to structure, code examples, reference material)
- **other**: Fallback for content that doesn't clearly fit above categories

**Instructions:**
1. Analyze the content structure, tone, and purpose
2. Consider the heuristic guess but make your own determination
3. Return a confidence score between 0.0 and 1.0 (0.0 = very uncertain, 1.0 = very certain)
4. Return ONLY valid JSON matching the ContentTypeClassification schema

Return JSON: {{ "type": "...", "confidence": 0.0-1.0, "method": "llm" }}"""
