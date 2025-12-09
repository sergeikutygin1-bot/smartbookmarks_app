import { PromptTemplate } from "@langchain/core/prompts";

/**
 * TAGGING PROMPT - Suggests relevant tags for content organization
 *
 * CUSTOMIZATION GUIDE:
 * - Modify tag count (currently 3-5 tags)
 * - Adjust tag style (broad vs specific, short vs descriptive)
 * - Add domain-specific tag categories
 * - Define tag vocabulary or constraints
 * - Control tag granularity
 *
 * INPUT VARIABLES:
 * - {title}: The page/content title
 * - {summary}: The generated summary from analysis chain
 * - {contentType}: Type of content (article, video, social, etc.)
 * - {existingTags}: User's existing tag vocabulary (optional)
 *
 * OUTPUT FORMAT:
 * The LLM will be constrained by Zod schema to return:
 * {
 *   tags: string[]     // 3-5 suggested tags
 * }
 */

// TODO: Customize this prompt to match your tagging strategy
export const taggingPrompt = PromptTemplate.fromTemplate(`You are an expert content organizer specializing in creating intuitive, consistent tag taxonomies.

Your task is to suggest relevant tags for the following {contentType}:

TITLE: {title}

SUMMARY: {summary}

EXISTING USER TAGS (prefer these if relevant):
{existingTags}

Please suggest 3 tags that:

1. COVERAGE: Balance broad categories with specific topics
   - Example: Both "Programming" (broad) and "React Hooks" (specific)
   - TODO: Adjust breadth vs specificity preference

2. CONSISTENCY: Prioritize existing user tags when applicable
   - Reuse tags the user already has (shown above)
   - Only create new tags if existing ones don't fit
   - TODO: Adjust how strongly to prefer existing tags

3. DISCOVERABILITY: Use terms someone would actually search for
   - Think: "How would I look for this later?"
   - Use common terminology, not jargon (unless technical content)
   - TODO: Modify discoverability criteria

4. FORMATTING: Follow these rules:
   - Use lowercase (e.g., "machine learning" not "Machine Learning")
   - Separate multi-word tags with hyphens (e.g., "web-development")
   - Keep tags concise (1-3 words max)
   - No special characters except hyphens
   - TODO: Adjust formatting rules to your preference

5. AVOID:
   - Overly generic tags (e.g., "interesting", "important")
   - Redundant tags that mean the same thing
   - Tags that are too narrow to be reused
   - TODO: Add your own exclusion criteria

TAG CATEGORIES TO CONSIDER:
- Domain/Field (e.g., "design", "business", "science")
- Topic/Subject (e.g., "user-research", "pricing-strategy")
- Format (e.g., "tutorial", "case-study", "tool")
- Technology (e.g., "javascript", "postgresql", "figma")
- TODO: Add or remove categories based on your use case

Return ONLY the tags, nothing else.`);

/**
 * Alternative tagging strategies you can experiment with:
 *
 * For strict controlled vocabulary:
 * "You must ONLY use tags from this list: {allowedTags}. Map content to the closest matches."
 *
 * For hierarchical tagging:
 * "Suggest tags in format 'parent/child' (e.g., 'tech/ai/nlp')"
 *
 * For semantic clustering:
 * "Group tags by: subject matter, content type, and intended use"
 */
