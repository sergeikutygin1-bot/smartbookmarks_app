import { PromptTemplate } from "@langchain/core/prompts";

/**
 * JUDGE PROMPT - LLM-as-a-Judge for Summary Quality Evaluation
 *
 * This prompt evaluates AI-generated summaries on 4 key quality dimensions:
 * - Accuracy: Is it factually consistent with the source? (highest priority)
 * - Comprehensiveness: Does it capture all key points?
 * - Formatting: Does it use proper markdown and clear organization?
 * - Completeness: Does it provide meaningful insights without fallback/error content?
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
 *   accuracy: "pass" | "fail",
 *   comprehensiveness: "pass" | "fail",
 *   formatting: "pass" | "fail",
 *   completeness: "pass" | "fail",
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

### 4. COMPLETENESS (Critical Quality Gate)
**Question:** Does the summary provide meaningful insights, not fallback/error content?

**PASS if:**
- Summary provides substantive analysis of the content
- No error messages or fallback text (e.g., "AI analysis failed")
- No generic placeholders (e.g., "Content from X: Y")
- Actually summarizes the content substance, not just metadata
- Not suspiciously short or template-like

**FAIL if:**
- Contains error messages or fallback patterns
- Generic description without real insights (e.g., "An article about X")
- Just restates the title or URL without analysis
- Template-like or clearly incomplete content
- Placeholder text indicating processing failure

**CRITICAL:** If completeness = FAIL, the entire evaluation MUST be marked as failing,
regardless of other scores. Incomplete or fallback content is unacceptable for production.

---

## CALIBRATION EXAMPLES

**PASS Example (All 4 criteria):**
"This article explores **type-first development** for **GraphQL APIs**...
- **Schema-first approach**: Define types before resolvers
- **Modular composition**: Break schemas into domain modules
Key benefit: catches errors at build time, not runtime."

(✓ Accurate, ✓ Comprehensive, ✓ Well-formatted, ✓ Complete - substantive insights)

**FAIL Example 1 (Completeness failure - fallback text):**
"Content from arxiv.org: Quantum Computing. AI analysis failed - manual review needed."

(✗ Completeness FAIL - contains error message, no real summary)

**FAIL Example 2 (Completeness failure - generic placeholder):**
"An article about neural networks and AI from medium.com."

(✓ Accurate, ✗ Not comprehensive, ✗ No formatting, ✗ Completeness FAIL - too generic)

**FAIL Example 3 (Other criteria failure):**
"GraphQL is a popular query language that many developers use. It has schemas and resolvers. Schema-first design is recommended by experts. It's good for APIs."

(✓ Accurate, ✗ Not comprehensive - too vague, ✗ No formatting, ✓ Complete - but still fails overall)

---

## YOUR RESPONSE (JSON Format)

Provide structured evaluation:

{{{{
  "accuracy": "pass" | "fail",
  "comprehensiveness": "pass" | "fail",
  "formatting": "pass" | "fail",
  "completeness": "pass" | "fail",
  "overall_verdict": "pass" | "fail",
  "reasoning": "Brief explanation (2-3 sentences)",
  "issues": ["Specific issue 1", "Specific issue 2"]
}}}}

**Remember:** If completeness = "fail", overall_verdict MUST be "fail".

Be objective and consistent. Use the same standards for every evaluation.`);
