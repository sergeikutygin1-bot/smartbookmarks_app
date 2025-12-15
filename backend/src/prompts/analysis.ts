import { PromptTemplate } from "@langchain/core/prompts";

/**
 * ENHANCED ANALYSIS PROMPT - Comprehensive content analysis with user context integration
 *
 * This prompt uses Chain of Density techniques for comprehensive summarization
 * and intelligently merges/enhances user-provided content rather than replacing it.
 *
 * INPUT VARIABLES:
 * - {extractedTitle}: Original title from the source (may be clickbait/vague)
 * - {content}: Extracted main content text (up to 15,000 chars)
 * - {contentType}: Type of content (article, video, social, pdf, etc.)
 * - {userTitle}: User's current title (optional, may be empty)
 * - {userSummary}: User's current summary (optional, may be empty)
 * - {userTags}: User's current tags as comma-separated string (optional, may be empty)
 *
 * OUTPUT FORMAT (constrained by Zod schema):
 * {
 *   title: string,       // Improved, clear, descriptive title (5-150 chars)
 *   summary: string,     // Comprehensive 300-500 word structured summary
 *   tags: string[]       // 5-10 relevant tags
 * }
 */

export const analysisPrompt = PromptTemplate.fromTemplate(`You are an expert content analyst. Your task: create comprehensive, well-structured summaries with clear titles and relevant tags.

## INPUT
**Content Type:** {contentType}
**Extracted Title:** {extractedTitle}
**Content:** {content}

**User Context (optional):**
- Title: {userTitle}
- Summary: {userSummary}
- Tags: {userTags}

## OUTPUT FORMAT (required JSON)
{{
  "title": "...",    // 5-150 chars, clear and descriptive
  "summary": "...",  // 300-500 words, markdown formatted
  "tags": [...]      // 3-5 lowercase-hyphenated tags
}}

## TASK 1: IMPROVED TITLE
**If user provided title:** Keep if clear; improve if vague/clickbait
**If no user title:** Rewrite extracted title to be searchable and informative

Examples:
- ❌ "You Won't Believe This!" → ✅ "CSS Grid: Complete Guide to Two-Dimensional Layouts"
- ❌ "My Thoughts on React" → ✅ "React Hooks Best Practices: State Management & Performance"

## TASK 2: COMPREHENSIVE SUMMARY (300-500 words)

**CRITICAL: Use markdown extensively**
- **Bold** for key terms, concepts, names, numbers, tools
- Bullet points (-) for lists
- Numbered lists (1.) for sequential steps
- ## Headings for sections (optional)

**Required Structure:**

**Overview** (50-75 words): What is this about? What problem does it solve? Use **bold** for core concepts.

**Key Points** (200-300 words):
- **Major argument 1**: Detailed explanation with **specific examples, numbers, names**
  - Supporting evidence
  - Concrete details
- **Major argument 2**: More specifics
- **Important concept/tool**: Technical details

**Insights** (50-75 words):
- **Key takeaway 1**: Why it matters
- **Practical application**: How to use this
- **Broader significance**: Context or implications

**User Context Integration:**
- If user summary adds valuable insights NOT in extracted content: incorporate them
- If user summary contradicts source: note both perspectives
- If user summary is low-quality placeholder: ignore it

**Constraints:**
- Be specific: cite examples, data points, names (and **bold** them)
- Use professional prose, avoid marketing hyperbole
- Stay factually accurate: DO NOT add information not present in source content
- Prioritize clarity over comprehensiveness if content is truncated

## TASK 3: TAGS (3-5 only)
Generate 3-5 focused tags:
- **Primary topic (1-2)**: Core subject (e.g., "machine-learning", "react")
- **Domain/type (1)**: Field or format (e.g., "web-development", "tutorial")
- **Specific tools (1-2)**: Technologies mentioned (e.g., "docker", "postgresql")

**User Tag Integration:**
- Keep relevant user tags, discard irrelevant ones, add critical missing tags
- Prioritize accuracy over preserving user tags

**Format Rules:**
- lowercase-hyphenated (e.g., "machine-learning")
- Specific but searchable (e.g., "react-hooks" not just "react")
- No redundancy (not both "js" and "javascript")
- **Maximum 5 tags**

## EXAMPLE OUTPUT (for a technical article)

{{
  "title": "GraphQL Schema Design: Type-First Development with Apollo Server",
  "summary": "## Overview\\n\\nThis article explores **type-first development** for **GraphQL APIs** using **Apollo Server**, focusing on **schema design patterns** that improve maintainability and developer experience...\\n\\n## Key Points\\n\\n- **Schema-first approach**: Define types before resolvers to ensure **type safety** across frontend and backend\\n  - Use **SDL (Schema Definition Language)** for clear contracts\\n  - Enables **automatic documentation** and **code generation**\\n- **Modular schema composition**: Break large schemas into domain-specific modules using \`@graphql-tools/schema\`\\n- **Input validation**: Implement **custom scalars** (e.g., \`EmailAddress\`, \`DateTime\`) for built-in validation\\n\\n## Insights\\n\\n- **Key benefit**: Type-first design catches errors at build time, not runtime\\n- **Practical tip**: Use **GraphQL Code Generator** to auto-generate TypeScript types\\n- **Performance consideration**: Implement **DataLoader** pattern to prevent N+1 queries",
  "tags": ["graphql", "api-design", "apollo-server", "typescript", "backend"]
}}

Return ONLY valid JSON matching the required format.`);


/**
 * Alternative prompt templates you can experiment with:
 *
 * For technical content:
 * "You are a senior software engineer reviewing technical documentation..."
 *
 * For academic content:
 * "You are a research analyst synthesizing academic papers..."
 *
 * For casual/personal content:
 * "You are a helpful assistant organizing someone's reading list..."
 */
