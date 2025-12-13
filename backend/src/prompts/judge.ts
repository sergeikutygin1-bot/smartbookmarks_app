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

export const judgePrompt = PromptTemplate.fromTemplate(`You are a quality evaluator for AI-generated bookmark summaries. Your role is to assess whether summaries meet quality standards across four critical dimensions.

## SOURCE CONTENT (Original Text - First 10,000 characters)

{sourceContent}

---

## GENERATED SUMMARY (To Be Evaluated)

{summary}

---

## EVALUATION TASK

Evaluate the generated summary using a **step-by-step** approach. Think through each criterion carefully before making your judgment.

### EXPECTED STANDARDS

**Target Length**: {expectedLength}

**Required Format**: Markdown with:
- **Bold** for key terms, concepts, names
- Bullet points for lists
- Clear paragraph structure
- Optional section headings with ##

---

## EVALUATION CRITERIA (Binary: PASS or FAIL)

Evaluate each dimension independently. Be strict but fair.

### 1. COMPREHENSIVENESS

**Question**: Does the summary capture all the main points, key arguments, and important details from the source?

**PASS if**:
- Includes all major topics/arguments from the source
- Captures essential supporting details (examples, data, names)
- Provides appropriate context for understanding
- Balances breadth (covering topics) and depth (sufficient detail)

**FAIL if**:
- Missing critical arguments or major topics
- Omits important examples or supporting evidence
- Lacks context needed to understand the content
- Too surface-level or too narrow in scope

**Your Analysis**: [Think step-by-step: What are the main points in the source? Are they all in the summary?]

---

### 2. ACCURACY (Factual Consistency)

**Question**: Is all information in the summary factually consistent with the source content?

**PASS if**:
- All facts, numbers, names, and dates match the source exactly
- No fabricated or hallucinated information
- Claims and conclusions align with source
- Technical terms used correctly

**FAIL if**:
- Contains information not present in the source (hallucination)
- Misrepresents facts, numbers, or names
- Contradicts or distorts source claims
- Incorrect technical terminology

**Your Analysis**: [Check each factual claim in the summary against the source]

---

### 3. FORMATTING (Markdown Usage)

**Question**: Does the summary use markdown formatting effectively for readability?

**PASS if**:
- Uses **bold** for key terms, concepts, important phrases (at least 5-10 instances)
- Uses bullet points for lists of items, arguments, or features
- Has clear paragraph breaks for readability
- Optional: Uses ## or ### headings for major sections

**FAIL if**:
- Plain text with no markdown formatting at all
- Minimal formatting (fewer than 3 instances of bold)
- No bullet points when lists are appropriate
- Wall of text with no paragraph breaks

**Your Analysis**: [Count bold instances, check for bullets, assess structure]

---

### 4. CLARITY (Organization & Readability)

**Question**: Is the summary well-organized with logical flow and clear expression?

**PASS if**:
- Ideas presented in logical order (e.g., overview → details → implications)
- Smooth transitions between topics
- Clear, concise language (not verbose or redundant)
- Easy to follow and understand

**FAIL if**:
- Confusing or illogical organization
- Abrupt topic shifts without transitions
- Repetitive or unnecessarily verbose
- Unclear or convoluted expression

**Your Analysis**: [Read the summary as a user would - is the flow natural?]

---

## OVERALL VERDICT RULES

**Overall Verdict = PASS** if and only if **ALL FOUR criteria are PASS**

**Overall Verdict = FAIL** if **ANY criterion is FAIL**

---

## YOUR RESPONSE

Now provide your evaluation:

1. **First**, analyze each criterion step-by-step (use the "Your Analysis" sections above)
2. **Then**, assign PASS or FAIL to each dimension
3. **List specific issues** found (be concrete: "Missing discussion of X", "Fabricated claim about Y", "No bold formatting used", etc.)
4. **Provide overall verdict** (PASS only if all four are PASS)
5. **Explain your reasoning** in 2-3 sentences

Be objective and consistent. Use the same standards for every evaluation.

Return your evaluation in JSON format matching the required schema.`);
