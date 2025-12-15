import { PromptTemplate } from "@langchain/core/prompts";

/**
 * JUDGE PROMPT - LLM-as-a-Judge for Summary Quality Evaluation
 *
 * This prompt evaluates AI-generated summaries on 4 key quality dimensions:
 * - Comprehensiveness: Does it capture all key points?
 * - Accuracy: Is it factually consistent with the source?
 * - Formatting: Does it use proper markdown?
 * - Clarity: Is it well-organized and readable?
 *
 * Uses binary scoring (pass/fail) for consistency and reliability.
 * Temperature should be set to 0.0 for consistent evaluations.
 *
 * INPUT VARIABLES:
 * - {summary}: The AI-generated summary to evaluate
 * - {sourceContent}: The original extracted content (up to 10,000 chars)
 * - {expectedLength}: Target length (e.g., "300-500 words")
 *
 * OUTPUT FORMAT (constrained by Zod schema):
 * {
 *   comprehensiveness: "pass" | "fail",
 *   accuracy: "pass" | "fail",
 *   formatting: "pass" | "fail",
 *   clarity: "pass" | "fail",
 *   overall_verdict: "pass" | "fail",
 *   reasoning: string,
 *   issues: string[]
 * }
 */

export const judgePrompt = PromptTemplate.fromTemplate(`You are a quality evaluator for AI-generated summaries. Assess this summary against the source content using a strict pass/fail binary for each criterion.

## SOURCE CONTENT (first 10,000 chars)
{sourceContent}

## SUMMARY TO EVALUATE
{summary}

## EXPECTED STANDARDS
- Length: {expectedLength}
- Format: Markdown with **bold** for key terms and bullet points for lists

---

## EVALUATION CRITERIA (Binary: PASS or FAIL)

Evaluate each independently. Overall verdict = PASS only if ALL criteria pass.

### 1. ACCURACY (Highest Priority)
**Question:** Is all information factually consistent with the source?

**PASS if:**
- All facts, numbers, names, dates match source exactly
- No fabricated information (hallucinations)
- Technical terms used correctly

**FAIL if:**
- Contains information not in source
- Misrepresents facts or contradicts source
- Incorrect technical terminology

### 2. COMPREHENSIVENESS
**Question:** Does the summary capture all main points and key details?

**PASS if:**
- Includes all major topics/arguments from source
- Contains essential supporting details (examples, data)
- Provides sufficient context for understanding

**FAIL if:**
- Missing critical arguments or major topics
- Too surface-level or too narrow
- Omits important evidence or context

### 3. FORMATTING & CLARITY
**Question:** Is the summary well-formatted with clear organization?

**PASS if:**
- Uses **bold** for key terms (at least 5 instances)
- Uses bullet points appropriately
- Logical flow with clear expression
- Proper paragraph structure

**FAIL if:**
- Plain text with no formatting
- Confusing organization or abrupt transitions
- Verbose or repetitive
- Minimal formatting (< 3 bold instances)

---

## CALIBRATION EXAMPLES

**PASS Example:**
"This article explores **type-first development** for **GraphQL APIs**...
- **Schema-first approach**: Define types before resolvers
- **Modular composition**: Break schemas into domain modules
Key benefit: catches errors at build time, not runtime."

(✓ Accurate, ✓ Comprehensive, ✓ Well-formatted)

**FAIL Example:**
"GraphQL is a popular query language that many developers use. It has schemas and resolvers. Schema-first design is recommended by experts. It's good for APIs."

(✓ Accurate, ✗ Not comprehensive - too vague, ✗ No formatting)

---

## YOUR RESPONSE (JSON Format)

Provide structured evaluation:

{{
  "accuracy": "pass" | "fail",
  "comprehensiveness": "pass" | "fail",
  "formatting": "pass" | "fail",
  "overall_verdict": "pass" | "fail",
  "reasoning": "Brief explanation (2-3 sentences)",
  "issues": ["Specific issue 1", "Specific issue 2"]
}}

Be objective and consistent. Use the same standards for every evaluation.`);
