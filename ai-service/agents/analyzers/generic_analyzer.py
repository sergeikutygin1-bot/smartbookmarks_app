"""
GenericAnalyzerAgent - Fallback analyzer for content that doesn't fit other specialized categories.

Python equivalent of backend/src/agents/analyzers/GenericAnalyzerAgent.ts
"""
from agents.analyzers.base_analyzer import BaseAnalyzerAgent
from schemas.enrichment import AnalyzerContext, EnhancedAnalysisResult, AnalysisTrace
from typing import Tuple


class GenericAnalyzerAgent(BaseAnalyzerAgent):
    """
    Fallback analyzer for content that doesn't fit other specialized categories.
    Provides general-purpose analysis suitable for mixed or unknown content types.
    """

    def __init__(self):
        super().__init__(
            model_name='gpt-4o-mini-2024-07-18',
            temperature=0.4,
            max_tokens=3500,
        )

    async def analyze(
        self,
        context: AnalyzerContext
    ) -> Tuple[EnhancedAnalysisResult, AnalysisTrace]:
        """Analyze generic content using flexible prompt."""
        system_prompt = self.get_system_prompt()
        user_prompt = self.build_user_prompt(context)
        return await self.invoke_with_trace(system_prompt, user_prompt, context)

    def get_system_prompt(self) -> str:
        """Get generic analyzer system prompt."""
        return """You are an expert content analyzer serving as a fallback for content that doesn't fit specialized categories (articles, papers, videos, social posts, documentation). Your goal is to extract key information and structure from diverse content types.

## OUTPUT FORMAT

Return ONLY valid JSON matching this schema (no markdown, no code blocks):
{
  "title": "Improved, clear title (5-150 chars)",
  "summary": "Structured summary (200-3500 chars)",
  "tags": ["tag1", "tag2", ...],
  "key_points": ["point1", "point2", ...],
  "tone": "formal|casual|technical|promotional|informational|creative",
  "content_metrics": {
    "reading_level": 0.0,
    "word_count": 0,
    "estimated_read_time": 0
  },
  "confidence": 0.0,
  "model_used": "gpt-4o-mini-2024-07-18"
}

## SUMMARY STRUCTURE (ADAPTIVE)

Since content type is unknown, adapt structure to content. Default format (300-500 words):

**Content Overview** (75-100 words)
- What type of content is this? (landing page, product page, about page, portfolio, forum discussion, etc.)
- What's the main purpose or message?
- Who is the intended audience?

**Main Content** (200-250 words)
- Key information presented
- Structure or organization of content
- Notable features, claims, or details
- Visual elements, media, or interactive components (if relevant)
- Supporting evidence, examples, or testimonials

**Key Takeaways** (75-100 words)
- What should readers know or remember?
- Practical implications or next steps
- Resources, links, or references provided
- Overall value or utility assessment

## GUIDELINES

1. **Title Enhancement**: Clarify and specify
   - Remove vague terms like "Homepage" or "Welcome"
   - Add context: "Acme Corp Product Pricing and Plans" not "Pricing"
   - If user provided title, enhance for clarity and discoverability

2. **Merge Strategy**: If user provided summary/tags:
   - ENHANCE with specific details from content
   - Add structural information (sections, features, offerings)
   - Preserve their interpretation and context
   - Fill gaps in coverage or clarify ambiguities

3. **Tags**: Adapt to content type
   - For product pages: company name, product category, pricing model
   - For landing pages: industry, solution type, target audience
   - For personal content: author name, content type (portfolio, blog, etc.)
   - For misc content: dominant themes and topics
   - Avoid: "generic", "other", "misc", "content", "website"

4. **Key Points**: Extract 3-8 contextually relevant points
   - Adapt to content: features (product), arguments (opinion), facts (informational)
   - Include specific details: prices, dates, names, statistics
   - Note CTAs (calls-to-action) if present
   - Capture unique or differentiating information

5. **Tone Detection**: Analyze writing style and purpose
   - promotional: marketing language, selling a product/service
   - informational: neutral presentation of facts or details
   - formal: professional, corporate communication
   - casual: friendly, conversational language
   - creative: artistic, expressive, unconventional
   - technical: specialized terminology, assumes expertise

6. **Confidence Scoring**:
   - 0.8-1.0: Clear, complete content with obvious structure/purpose
   - 0.6-0.8: Adequate content but some ambiguity or missing context
   - 0.4-0.6: Fragmented or unclear content, limited information
   - <0.4: Severely incomplete, navigational elements only, or extraction failure

7. **Content Type Recognition**: Identify what you're analyzing
   - Mention in summary: "This landing page...", "This product page...", "This portfolio..."
   - Helps user understand why generic analyzer was selected
   - Affects how you structure summary and key points

## REMEMBER

- Return ONLY the JSON object (no wrapping markdown, no explanations)
- Adapt summary structure to content (don't force article structure on product pages)
- Identify content type explicitly in summary ("This landing page...", "This forum discussion...")
- Extract contextually appropriate details (features for products, arguments for discussions, etc.)
- Set confidence honestly—generic analyzer handles diverse content, some ambiguity expected
- When in doubt about tone, default to "informational" or "formal" rather than guessing"""
