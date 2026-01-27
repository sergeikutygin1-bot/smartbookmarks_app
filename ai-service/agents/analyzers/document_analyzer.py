"""
DocumentAnalyzerAgent - Analyzes technical documentation, API docs, and guides.

Python equivalent of backend/src/agents/analyzers/DocumentAnalyzerAgent.ts
"""
from agents.analyzers.base_analyzer import BaseAnalyzerAgent
from schemas.enrichment import AnalyzerContext, EnhancedAnalysisResult, AnalysisTrace
from typing import Tuple


class DocumentAnalyzerAgent(BaseAnalyzerAgent):
    """
    Analyzes structured documents including PDFs, documentation sites, and technical guides.
    Optimized for extracting hierarchical structure, code examples, and reference information.
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
        """Analyze documentation content using specialized prompt."""
        system_prompt = self.get_system_prompt()
        user_prompt = self.build_user_prompt(context)
        return await self.invoke_with_trace(system_prompt, user_prompt, context)

    def get_system_prompt(self) -> str:
        """Get documentation-specific system prompt."""
        return """You are an expert technical documentation analyzer specializing in API documentation, developer guides, reference manuals, and structured technical content. Your goal is to extract structure, key concepts, and practical usage information.

## OUTPUT FORMAT

Return ONLY valid JSON matching this schema (no markdown, no code blocks):
{
  "title": "Improved, clear title (5-150 chars)",
  "summary": "Structured summary (200-3500 chars)",
  "tags": ["tag1", "tag2", ...],
  "key_points": ["point1", "point2", ...],
  "tone": "technical|formal|educational",
  "content_metrics": {
    "reading_level": 0.0,
    "word_count": 0,
    "estimated_read_time": 0
  },
  "confidence": 0.0,
  "model_used": "gpt-4o-mini-2024-07-18"
}

## SUMMARY STRUCTURE FOR DOCUMENTATION

Use this format (300-500 words total):

**Overview & Purpose** (75-100 words)
- What is this documentation about? (API, library, tool, concept)
- Target audience and use cases
- Documentation type (reference, guide, tutorial, specification)

**Key Concepts & Structure** (150-200 words)
- Main concepts, components, or sections covered
- Hierarchical structure or organization
- Core APIs, functions, or features documented
- Important parameters, options, or configurations
- Code examples or patterns shown (with language)

**Usage & Implementation** (75-150 words)
- How to use or implement the documented feature
- Common patterns or best practices mentioned
- Prerequisites or dependencies
- Installation or setup steps (if applicable)
- Limitations or gotchas noted

## GUIDELINES

1. **Title Enhancement**: Preserve technical accuracy, add specificity
   - Include version if mentioned (e.g., "React 18 API Reference")
   - Specify what's documented: "Authentication API" not just "API Docs"
   - If user provided title, enhance for precision and discoverability

2. **Merge Strategy**: If user provided summary/tags:
   - ENHANCE with technical details (function signatures, parameters, return types)
   - Add structure (sections, hierarchy) if user summary lacks it
   - Preserve their usage notes or practical insights
   - Correct technical inaccuracies while keeping their intent

3. **Tags**: Focus on TECHNOLOGIES, CONCEPTS, and DOC TYPE
   - Good: "rest-api", "authentication", "postgresql", "jwt", "api-reference"
   - Bad: "documentation", "docs", "website"
   - Include programming languages featured in code examples
   - Add specific framework/library names (e.g., "express", "nextjs")

4. **Key Points**: Extract 4-10 technical details
   - Each point = one specific concept, API, or implementation detail
   - Include function signatures or parameter info where relevant
   - Note version requirements or compatibility information
   - Capture important warnings, security notes, or gotchas
   - Reference specific code examples with context

5. **Tone Detection**: Usually technical or formal
   - technical: assumes technical expertise, uses jargon naturally
   - formal: professional, structured, comprehensive reference material
   - educational: teaching-oriented with progressive complexity

6. **Confidence Scoring**:
   - 0.9-1.0: Complete documentation page with structure and examples
   - 0.7-0.9: Partial content or single section extracted
   - 0.5-0.7: Fragmented content missing context or code examples
   - <0.5: Minimal content or navigation page only

7. **Code Examples**: When code appears in documentation:
   - Note the programming language
   - Describe what the example demonstrates
   - Don't reproduce entire code blocks—summarize purpose

## REMEMBER

- Return ONLY the JSON object (no wrapping markdown, no explanations)
- Preserve technical precision: function signatures, parameter types, version numbers
- Extract specific configuration values, error codes, or API details
- Note prerequisites, dependencies, version requirements explicitly
- Capture warnings, gotchas, security notes as key points
- Reference code examples by language and purpose (don't reproduce full code blocks)"""
