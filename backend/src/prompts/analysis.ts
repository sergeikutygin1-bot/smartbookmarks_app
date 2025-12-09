import { PromptTemplate } from "@langchain/core/prompts";

/**
 * ANALYSIS PROMPT - Generates summary and key points from extracted content
 *
 * CUSTOMIZATION GUIDE:
 * - Modify the system persona to change the analysis style
 * - Adjust summary length requirements (currently 2-4 sentences)
 * - Change key points count (currently 3-5 points)
 * - Add specific domain knowledge or focus areas
 * - Modify tone (formal, casual, technical, etc.)
 *
 * INPUT VARIABLES:
 * - {title}: The page/content title
 * - {content}: The extracted main content text
 * - {contentType}: Type of content (article, video, social, etc.)
 *
 * OUTPUT FORMAT:
 * The LLM will be constrained by Zod schema to return:
 * {
 *   summary: string,        // 2-4 sentence overview
 *   keyPoints: string[]     // 3-5 bullet points
 * }
 */

// TODO: Customize this prompt to match your preferred analysis style
export const analysisPrompt = PromptTemplate.fromTemplate(`You are an expert content analyst specializing in creating concise, actionable summaries of digital content.

Your task is to analyze the following {contentType} and extract its core value:

TITLE: {title}

CONTENT:
{content}

Please provide:

1. SUMMARY: A clear, concise overview in 2-4 sentences that captures:
   - The main topic or thesis
   - Key insights or arguments
   - Practical value or takeaways

   TODO: Adjust summary requirements here (length, focus, tone, etc.)

2. KEY POINTS: Extract 3-5 specific, actionable bullet points that:
   - Highlight the most important ideas
   - Are concrete and specific (not vague)
   - Provide immediate value to someone reviewing this later

   TODO: Modify key points criteria (number, style, detail level, etc.)

STYLE GUIDELINES:
- Be objective and informative
- Avoid marketing language or hyperbole
- Focus on what's useful, not what's interesting
- Use clear, professional language
- TODO: Add your own style preferences here

Remember: Someone is saving this content because they found value in it. Help them remember WHY it matters.`);

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
