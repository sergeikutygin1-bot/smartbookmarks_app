# Smart Bookmark - Enrichment Agent

AI-powered bookmark enrichment using **LangChain** and **GPT-4o-mini**.

Automatically extracts content from URLs, generates summaries, extracts key points, and suggests relevant tags.

## Features

✨ **Content Extraction** - Fetches and parses content from URLs using Readability (same tech as Firefox Reader View)
🤖 **AI Analysis** - Generates concise summaries and key points using GPT-4o-mini
🏷️ **Smart Tagging** - Suggests relevant tags while maintaining consistency with existing tags
🔄 **Graceful Degradation** - Returns partial results if any step fails
⚡ **Fast** - Typical enrichment completes in 5-10 seconds
💰 **Cost-Effective** - Uses gpt-4o-mini (~$0.002-0.005 per enrichment)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ENRICHMENT PIPELINE                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │  1. Content Extraction  │
            │  (Readability + axios)  │
            └─────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │   2. Analysis Chain     │
            │  (LangChain + GPT-4o)   │
            │  • Summary (2-4 sent)   │
            │  • Key Points (3-5)     │
            └─────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │   3. Tagging Chain      │
            │  (LangChain + GPT-4o)   │
            │  • Suggest 3-5 tags     │
            │  • Reuse existing tags  │
            └─────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │   Enriched Bookmark     │
            └─────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
cd agents
npm install
```

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-...
```

### 3. Test the Agent

```bash
npm test
```

This will enrich a sample article and display the results.

## Usage

### Basic Example

```typescript
import { enrichUrl } from './src';

const result = await enrichUrl('https://paulgraham.com/greatwork.html');

console.log(result.analysis.summary);
// "This essay explores what it takes to do great work..."

console.log(result.analysis.keyPoints);
// ["Choose work you have a natural aptitude for", ...]

console.log(result.tagging.tags);
// ["writing", "creativity", "career-advice"]
```

### Advanced Usage with Custom Options

```typescript
import { EnrichmentAgent } from './src';

const agent = new EnrichmentAgent();

// Track progress
agent.onProgress((progress) => {
  console.log(`[${progress.step}] ${progress.message}`);
});

// Enrich with existing tags for consistency
const result = await agent.enrich({
  url: 'https://example.com/article',
  existingTags: ['programming', 'web-dev', 'ai'],
  skipAnalysis: false, // Set to true to skip AI summary
  skipTagging: false,  // Set to true to skip tag suggestions
});

// Check for errors
if (agent.hasErrors()) {
  console.log('Errors:', agent.getErrors());
}
```

### Individual Components

You can use individual components for more control:

```typescript
import {
  extractContent,
  analyzeContent,
  suggestTags
} from './src';

// 1. Extract content
const content = await extractContent('https://example.com');

// 2. Analyze
const analysis = await analyzeContent(content);

// 3. Suggest tags
const tagging = await suggestTags(content, analysis, ['existing', 'tags']);
```

## Customizing Prompts

All prompts are in `src/prompts/` and can be easily customized:

### `src/prompts/analysis.ts`

Customize the summary and key points generation:

```typescript
// TODO: Modify the prompt to change:
// - Summary length (currently 2-4 sentences)
// - Key points count (currently 3-5)
// - Analysis style (formal, casual, technical)
// - Focus areas (actionable, theoretical, practical)
```

### `src/prompts/tagging.ts`

Customize tag suggestions:

```typescript
// TODO: Modify the prompt to change:
// - Tag count (currently 3-5)
// - Tag style (broad vs specific)
// - Tag formatting rules
// - Category preferences
```

## Configuration

Environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `AI_MODEL` | GPT model to use | `gpt-4o-mini` |
| `OPENAI_TEMPERATURE` | LLM temperature (0-1) | `0.7` |
| `OPENAI_MAX_TOKENS` | Max tokens per request | `2000` |
| `REQUEST_TIMEOUT_MS` | HTTP request timeout | `10000` |

## Project Structure

```
agents/
├── src/
│   ├── enrichmentAgent.ts     # Main orchestrator
│   ├── chains/
│   │   ├── analysisChain.ts   # Summary + key points
│   │   └── taggingChain.ts    # Tag suggestions
│   ├── prompts/               # ⭐ Customizable prompts
│   │   ├── analysis.ts
│   │   └── tagging.ts
│   ├── tools/
│   │   └── contentExtractor.ts # URL fetching & parsing
│   ├── types/
│   │   └── schemas.ts         # Zod schemas
│   ├── index.ts               # Public API
│   └── test.ts                # Test script
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Build

```bash
npm run build
```

Output: `dist/`

### Type Checking

```bash
npm run type-check
```

### Watch Mode

```bash
npm run dev
```

## API Reference

### `enrichUrl(url, existingTags?)`

Convenience function to enrich a single URL.

**Parameters:**
- `url: string` - The URL to enrich
- `existingTags?: string[]` - User's existing tags for consistency

**Returns:** `Promise<EnrichmentResult>`

### `EnrichmentAgent`

Main agent class for more control.

**Methods:**
- `enrich(options: EnrichmentOptions): Promise<EnrichmentResult>`
- `onProgress(callback: (progress) => void): void`
- `getErrors(): EnrichmentError[]`
- `hasErrors(): boolean`
- `hasCriticalErrors(): boolean`

### Types

All types are exported from `src/types/schemas.ts`:

```typescript
interface EnrichmentResult {
  url: string;
  title: string;
  domain: string;
  contentType: ContentType;
  extractedContent: {
    rawText: string;
    cleanText: string;
    images?: string[];
    metadata?: Record<string, unknown>;
  };
  analysis: {
    summary: string;
    keyPoints: string[];
  };
  tagging: {
    tags: string[];
  };
  enrichedAt: Date;
  modelUsed: string;
  processingTimeMs?: number;
}
```

## Performance

Typical enrichment times:

- **Short article** (< 2000 words): 3-5 seconds
- **Medium article** (2000-5000 words): 5-8 seconds
- **Long article** (> 5000 words): 8-12 seconds

Cost per enrichment: **~$0.002-0.005** (using gpt-4o-mini)

## Error Handling

The agent uses graceful degradation:

1. **Extraction fails** → Returns partial data with error metadata
2. **Analysis fails** → Returns basic summary, continues with tagging
3. **Tagging fails** → Returns basic tags (content type, domain)

All errors are tracked and accessible via `agent.getErrors()`.

## Future Enhancements

- [ ] YouTube video support (transcript extraction)
- [ ] Twitter/X integration (thread unrolling)
- [ ] PDF text extraction
- [ ] Multi-language support
- [ ] Batch processing with rate limiting
- [ ] Caching (Redis) for URL → extracted content
- [ ] WebSocket progress streaming

## Integration with Backend

To integrate with the Smart Bookmark backend:

```typescript
// In your Express/Fastify route:
app.post('/api/v1/bookmarks/:id/enrich', async (req, res) => {
  const { url } = req.body;
  const userId = req.user.id;

  // Get user's existing tags from database
  const existingTags = await db.tags.findMany({
    where: { userId }
  });

  // Enrich
  const result = await enrichUrl(url, existingTags.map(t => t.name));

  // Save to database
  await db.bookmarks.update({
    where: { id: req.params.id },
    data: {
      title: result.title,
      summary: result.analysis.summary,
      keyPoints: result.analysis.keyPoints,
      tags: {
        connectOrCreate: result.tagging.tags.map(tag => ({
          where: { name: tag, userId },
          create: { name: tag, userId }
        }))
      }
    }
  });

  res.json({ data: result });
});
```

## Troubleshooting

### "OPENAI_API_KEY not found"

Make sure you've created `.env` and added your API key:

```bash
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-...
```

### "Request timeout"

Increase the timeout in `.env`:

```
REQUEST_TIMEOUT_MS=20000
```

### Low extraction confidence

Some websites block automated scraping. The agent will still try to extract what it can and mark the confidence score accordingly.

## License

MIT
