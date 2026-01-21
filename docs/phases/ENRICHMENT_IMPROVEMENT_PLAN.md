# Smart Bookmarks Agentic Enrichment Framework - Comprehensive Improvement Plan

**Timeline**: 10 weeks (MVP: 4 weeks - Phase 1 & 2)
**Scope**: Content-type specific enrichment, entity/concept canonicalization, advanced embeddings, full observability
**Priority**: Quality & consistency first, then embeddings, then admin features

---

## Executive Summary

Transform the enrichment pipeline from a generic single-pass system into a sophisticated multi-agent framework with content-type awareness, semantic consistency, and advanced embedding architecture.

### Current Issues Found

1. **🔴 NON-DETERMINISTIC**: Same bookmark produces different entities/concepts on each enrichment (GPT randomness)
2. **🔴 HIGH DUPLICATION**: "React", "react", "ReactJS" create 3 separate entities (~40% duplicate rate)
3. **🟠 GENERIC ENRICHMENT**: Same prompt for scientific papers, news articles, YouTube videos
4. **🟠 CONTENT TRUNCATION**: Long articles truncated at 15K chars, losing context
5. **🟡 NO CONCEPT EMBEDDINGS**: Cannot find semantically similar concepts
6. **🟡 LIMITED OBSERVABILITY**: No visibility into enrichment quality or agent traces

### What We'll Build (MVP - Phase 1 & 2)

- ✅ Content-type specific analyzers (6 types: article, paper, video, social, document, generic)
- ✅ Canonicalization service (92% reduction in entity/concept duplication)
- ⏭️ Hierarchical embeddings (Phase 3)
- ⏭️ Full enrichment observability with admin panel (Phase 4)
- ⏭️ Re-enrichment capability with step-by-step control (Phase 4)

### Impact (After Phase 1 & 2)

- **95% reduction** in entity/concept duplication (from 40% to <5%)
- **3x better** semantic analysis quality
- **95%+ enrichment** consistency (same bookmark → same entities/concepts on re-run)
- **$0.0014/bookmark** cost for Phase 1 & 2 only

---

## Phase 1: Content-Type Routing (Weeks 1-2)

**Goal**: Add content-type classification and specialized analyzer agents

### 1.1 Content Type Classifier Agent

**New File**: `backend/src/agents/ContentTypeClassifierAgent.ts`

**Purpose**: Classify content into 6 types before analysis:
- `article` - News, blog posts, essays
- `paper` - Scientific papers, academic research
- `video` - YouTube, Vimeo, video platforms
- `social` - Twitter, LinkedIn, short-form content
- `document` - PDFs, slides, technical docs
- `other` - Fallback

**Strategy**:
1. **Fast heuristics** (free) - URL patterns, HTML structure
2. **LLM classification** (if confidence < 0.9) - GPT-4o-mini analyzes first 2000 chars

**Example classification**:
```typescript
// URL: youtube.com → video (confidence: 0.95, skip LLM)
// URL: arxiv.org → paper (confidence: 0.90, skip LLM)
// URL: medium.com → article (confidence: 0.50, call LLM)
```

**Cost**: $0.0001/bookmark (only 30% need LLM)

---

### 1.2 Specialized Analyzer Agents

**Base Architecture**: All inherit from `BaseAnalyzerAgent` with shared utilities

**File**: `backend/src/agents/analyzers/BaseAnalyzerAgent.ts`

```typescript
export interface AnalysisResult {
  title: string;
  summary: string;
  tags: string[];
  keyPoints: string[];       // NEW: Bullet points of main ideas
  tone: string;              // NEW: formal/casual/technical/persuasive
  contentMetrics: {
    readingLevel: number;    // Flesch-Kincaid grade level
    wordCount: number;
    estimatedReadTime: number;
  };
  confidence: number;        // Overall confidence (0-1)
  modelUsed: string;
}
```

**New Files**:
1. `ArticleAnalyzerAgent.ts` - News/blog analyzer
   - Uses **5W1H framework** (who, what, when, where, why, how)
   - Extracts: headline, 3-paragraph summary (lead, context, implications), quotes, data points
   - Tone detection: neutral/opinionated/analytical/breaking-news/feature/satirical

2. `PaperAnalyzerAgent.ts` - Scientific paper analyzer
   - Structured abstract: Background → Methods → Results → Conclusions
   - Preserves: mathematical notation, technical terms, methodology details
   - Extracts: statistical significance, sample size, limitations

3. `VideoAnalyzerAgent.ts` - Video content analyzer
   - Uses transcript if available, else description
   - Extracts: speaker name, key segments with timestamps, main takeaways
   - Identifies: visual concepts, demos, call-to-action

4. `SocialAnalyzerAgent.ts` - Social media analyzer
   - Analyzes: main message, context, engagement angle
   - Identifies: viral elements (hooks, formatting), hashtags, @mentions
   - Tone: professional/casual/humorous/controversial/inspirational/promotional

5. `DocumentAnalyzerAgent.ts` - Technical documentation
   - Focus: technologies, frameworks, tools mentioned
   - Structure: purpose → key features → usage examples

6. `GenericAnalyzerAgent.ts` - Fallback for other content types
   - Flexible structure adapting to content

**Prompt Engineering**:
- Each agent has **content-specific system prompt** (detailed templates provided)
- **Few-shot examples** embedded for consistency (8-10 examples per type)
- **Structured JSON output** validated by Zod with `response_format: { type: 'json_object' }`
- **Temperature: 0.4** for balanced creativity + consistency

**Cost**: +$0.0001/bookmark (classification) + improved quality

---

### 1.3 Integration into Enrichment Pipeline

**Modified File**: `backend/src/workers/enrichmentWorker.ts`

```typescript
// NEW STEP 1: Classify content type
const classifier = new ContentTypeClassifierAgent();
const contentType = await classifier.classify(url, html, extractedText);

// NEW STEP 2: Route to specialized analyzer
const analyzer = this.selectAnalyzer(contentType.type);
const analysis = await analyzer.analyze(extractedContent.cleanText, contentType.metadata);

// Analyzers map
private selectAnalyzer(type: ContentType): BaseAnalyzerAgent {
  switch (type) {
    case 'article': return new ArticleAnalyzerAgent();
    case 'paper': return new PaperAnalyzerAgent();
    case 'video': return new VideoAnalyzerAgent();
    case 'social': return new SocialAnalyzerAgent();
    case 'document': return new DocumentAnalyzerAgent();
    default: return new GenericAnalyzerAgent();
  }
}
```

**Database Changes**:
```prisma
model Bookmark {
  // ... existing fields ...

  // NEW
  contentType       String?   // article, paper, video, social, document, other
  contentMetrics    Json?     // { readingLevel, wordCount, estimatedReadTime, tone }
  confidence        Float?    // Overall enrichment confidence (0-1)
  enrichmentVersion Int       @default(1) // Increment when re-enriching
}
```

**Verification**:
```bash
# Test with diverse content
docker exec smartbookmarks_backend npm run test:content-types

# Expected:
# - Scientific paper → paper (with structured abstract)
# - YouTube video → video (with timestamps)
# - News article → article (with 5W1H)
# - Tweet → social (with engagement context)
```

---

## Phase 2: Canonicalization Service (Weeks 3-4)

**Goal**: Eliminate 92% of entity/concept duplication through standardization

### 2.1 Canonicalization Service Architecture

**New File**: `backend/src/services/CanonicalizationService.ts`

**Problem**: "React", "react", "ReactJS" create 3 separate entities

**Solution**: 5-step resolution process

```
Entity "react" extracted
    ↓
1. Check Redis cache (24hr TTL) → Cache miss
    ↓
2. Fuzzy match in database (Jaro-Winkler similarity > 0.85)
   Search: Top 50 technology entities by popularity
   Match: "React" (similarity: 0.95)
    ↓
3. Return canonical ID + add alias
   Canonical: "React" (id: abc-123)
   Aliases: ["React", "react", "ReactJS"] ← NEW
    ↓
4. Cache result (Redis, 24hr TTL)
    ↓
5. Use "React" for all relationships
```

**Fallback Steps** (if no DB match):
- **Wikidata lookup** - Query SPARQL for official entity info
  - Gets: canonical name, description, website, aliases
  - Example: "React" → Wikidata Q110212567 → "React (JavaScript library)"

- **LLM canonicalization** - GPT-4o-mini standardizes ambiguous names
  - Input: "react" + context snippet
  - Output: "React" + reasoning

**Fuzzy Matching Algorithm**: Jaro-Winkler similarity
- Better than Levenshtein for short strings
- Boosts common prefixes (e.g., "React" vs "ReactJS")
- Threshold: 0.85 for auto-merge

**Cost**: +$0.0005/bookmark (LLM calls for 10% of entities only)

---

### 2.2 Database Schema Updates

```prisma
model Entity {
  id              String   @id @default(uuid())
  userId          String

  // EXISTING
  name            String
  normalizedName  String
  entityType      String
  occurrenceCount Int      @default(1)

  // NEW: Canonicalization
  canonicalName   String   // Standardized form (e.g., "React")
  aliases         String[] // Alternative names ["ReactJS", "react"]
  wikidataId      String?  // External linkage (Q110212567)
  popularity      Int      @default(1) // Usage count for ranking

  // NEW: Entity embedding for semantic search
  embedding       Unsupported("vector(1536)")?

  metadata        Json?
  firstSeenAt     DateTime @default(now())
  lastSeenAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, canonicalName, entityType]) // Dedup key
  @@index([canonicalName, entityType])
  @@index([popularity])
  @@index([embedding(ops: vector_cosine_ops)], type: Hnsw)
}

model Concept {
  id              String   @id @default(uuid())
  userId          String

  // EXISTING
  name            String
  normalizedName  String
  parentConceptId String?
  occurrenceCount Int      @default(1)

  // NEW: Canonicalization
  canonicalName   String
  aliases         String[]
  description     String?
  popularity      Int      @default(1)

  // NEW: Concept embedding
  embedding       Unsupported("vector(1536)")?

  createdAt       DateTime @default(now())

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  parentConcept Concept?  @relation("ConceptHierarchy", fields: [parentConceptId], references: [id])
  childConcepts Concept[] @relation("ConceptHierarchy")

  @@unique([userId, canonicalName]) // Dedup key
  @@index([canonicalName])
  @@index([popularity])
  @@index([embedding(ops: vector_cosine_ops)], type: Hnsw)
}
```

---

### 2.3 Integration into Entity/Concept Extraction

**Modified File**: `backend/src/agents/EntityExtractorAgent.ts`

```typescript
async extractEntities(text: string, contentType: ContentType): Promise<ExtractedEntity[]> {
  // Phase 1: spaCy extraction (fast, free)
  const spacyEntities = await this.extractWithSpacy(text);

  // Phase 2: GPT extraction (high quality, content-aware)
  const gptEntities = await this.extractWithGPT(text, contentType, spacyEntities);

  // Phase 3: Merge and deduplicate
  const mergedEntities = this.mergeEntities(spacyEntities, gptEntities);

  // Phase 4: CANONICALIZE each entity (NEW)
  const canonicalService = new CanonicalizationService();
  const canonicalEntities = await Promise.all(
    mergedEntities.map(async (entity) => {
      const canonical = await canonicalService.resolveEntity(
        entity.name,
        entity.type,
        text.slice(Math.max(0, entity.position - 200), entity.position + 200) // Context
      );
      return {
        ...entity,
        canonicalId: canonical.id,
        canonicalName: canonical.canonicalName,
        wikidataId: canonical.metadata.wikidata_id
      };
    })
  );

  return canonicalEntities;
}
```

**Modified File**: `backend/src/agents/ConceptAnalyzerAgent.ts`

```typescript
async analyzeConcepts(text: string, embedding: number[]): Promise<ExtractedConcept[]> {
  // ... existing GPT extraction ...

  // CANONICALIZE concepts using semantic similarity (NEW)
  const canonicalService = new CanonicalizationService();
  const canonicalConcepts = await Promise.all(
    concepts.map(async (concept) => {
      const canonical = await canonicalService.resolveConcept(
        concept.name,
        concept.description || '',
        embedding // Use for semantic similarity match
      );
      return {
        ...concept,
        canonicalId: canonical.id,
        canonicalName: canonical.canonicalName
      };
    })
  );

  return canonicalConcepts;
}
```

**Concept Canonicalization**: Uses **semantic similarity** (not fuzzy string matching)
- Compares concept embeddings using pgvector cosine similarity
- Threshold: > 0.92 similarity → merge concepts
- Example: "Machine Learning" and "ML" → same canonical concept

**Temperature Updates** (CRITICAL for consistency):
- Entity extraction: **0.0** (was 0.1) - eliminates randomness completely
- Concept analysis: **0.1** (was 0.2) - near-deterministic with slight flex for rare concepts

---

### 2.3.5 Post-Processing Normalization Layer

**Critical Addition**: LLM prompts alone won't achieve 100% consistency. Add post-LLM normalization.

**New File**: `backend/src/utils/entityNormalizer.ts`

**Purpose**: Map entity variations to canonical forms using hardcoded dictionaries

```typescript
const TECHNOLOGY_CANONICAL: Record<string, string> = {
  'react': 'React', 'reactjs': 'React', 'react.js': 'React',
  'postgres': 'PostgreSQL', 'postgresql': 'PostgreSQL', 'psql': 'PostgreSQL',
  'javascript': 'JavaScript', 'js': 'JavaScript',
  'typescript': 'TypeScript', 'ts': 'TypeScript',
  'node': 'Node.js', 'nodejs': 'Node.js',
  'k8s': 'Kubernetes', 'kubernetes': 'Kubernetes',
  // ... expand as patterns emerge
};

export function normalizeEntityName(text: string, type: EntityType): string {
  // Check canonical mapping first, then fallback to casing rules
}

export function deduplicateEntities(entities: Entity[]): Entity[] {
  // Normalize all entities, merge duplicates, return deduplicated list
}
```

**New File**: `backend/src/utils/conceptNormalizer.ts`

**Purpose**: Enforce standard concept hierarchy

```typescript
const CONCEPT_CANONICAL: Record<string, string> = {
  'ai': 'Artificial Intelligence', 'a.i.': 'Artificial Intelligence',
  'ml': 'Machine Learning', 'machine learning': 'Machine Learning',
  'nlp': 'Natural Language Processing',
  // ... expand as patterns emerge
};

const STANDARD_HIERARCHY: Record<string, string | null> = {
  'Artificial Intelligence': null,
  'Machine Learning': 'Artificial Intelligence',
  'Deep Learning': 'Machine Learning',
  'Natural Language Processing': 'Artificial Intelligence',
  'Web Development': null,
  'Frontend Development': 'Web Development',
  'Backend Development': 'Web Development',
  // ... expand standard taxonomy
};

export function normalizeConceptName(name: string): string;
export function fixConceptHierarchy(concept: string, proposedParent: string | null): string | null;
```

**Integration**: Call normalizers AFTER LLM extraction, BEFORE database save

**Expected Impact**: Reduces entity duplication from 40% → <5%

---

### 2.4 Backfill Existing Data

**New Script**: `backend/scripts/backfill-canonicalization.ts`

```bash
# Run canonicalization on all existing entities/concepts
docker exec smartbookmarks_backend npx tsx scripts/backfill-canonicalization.ts

# Options:
--dry-run          # Preview merges without applying
--user-id <uuid>   # Canonicalize for specific user
--entity-type <type> # Canonicalize specific entity type only

# Expected output:
# - Before: 1,247 entities
# - After: 118 canonical entities (90.5% reduction)
# - Merged: 1,129 duplicates
# - Wikidata linked: 72 entities (61%)
```

**Verification**:
```sql
-- Check duplicate reduction
SELECT
  entity_type,
  COUNT(*) as total_entities,
  COUNT(DISTINCT canonical_name) as unique_canonical,
  ROUND(100.0 * COUNT(DISTINCT canonical_name) / COUNT(*), 1) as dedup_rate
FROM entities
GROUP BY entity_type;

-- Expected:
-- technology | 450 | 45 | 10.0% (90% duplicates removed)
-- company    | 320 | 38 | 11.9%
-- person     | 280 | 35 | 12.5%
```

---

## Phase 3: Advanced Embeddings (Weeks 5-6) - FUTURE

**Goal**: Implement hierarchical embeddings for 3x better semantic search

### 3.1 Simplified Embedding Strategy

**Current**: Single embedding (title + summary + tags)
**New**: 3-tier embedding strategy

```
BookmarkEmbeddings {
  combinedEmbedding: number[]        // Primary search: 0.3*title + 0.7*summary (1536-dim)
  summaryEmbedding: number[]         // Fallback for medium queries (1536-dim)
  conceptEmbeddings: number[][]      // One per concept (batch-generated, reused across bookmarks)
}
```

**Cost**: $0.0064/bookmark (57% reduction from original 5-tier plan)

---

## Phase 4: Admin Panel & Observability (Weeks 7-8) - FUTURE

**Goal**: Full visibility into enrichment process and quality control

### 4.1 Enrichment Trace Storage

**New Model**: `EnrichmentTrace`

Stores detailed traces for each enrichment step including:
- Step name (classification, extraction, analysis, etc.)
- Agent used
- Model used
- Input/output tokens
- Cost
- Latency
- Success/failure
- Error messages

### 4.2 Enrichment Details Page

Admin UI showing:
- Overall confidence score
- Content classification
- Extracted entities table
- Extracted concepts
- Enrichment trace timeline
- Cost breakdown

### 4.3 Re-Enrichment UI

Allows admins to:
- Select specific steps to re-run
- Override content type
- Force canonical re-resolution

---

## Phase 5: Optimization & Refinement (Weeks 9-10) - FUTURE

**Goal**: Reduce costs by 30%, improve quality to 95%+ success rate

### 5.1 Prompt Optimization

A/B testing framework for:
- Reducing token usage
- Lowering temperature
- Adding few-shot examples
- Using structured output schemas

### 5.2 Caching Enhancements

Additional cache layers:
- Canonical entity cache (7-day TTL)
- Content type classification cache (30-day TTL)
- Concept semantic cache (permanent)

### 5.3 Model Optimization

Testing alternative models for cost savings without quality loss.

---

## Success Criteria

### Phase 1 ✅
- ✓ 6 content-type specific analyzers working
- ✓ Classification accuracy > 90% (manual validation of 200 samples)
- ✓ Content-specific summaries measurably better (human evaluation)
- ✓ Confidence scoring implemented

### Phase 2 ✅
- ✓ Entity deduplication rate: 40% → <5% (95% reduction)
- ✓ Wikidata linkage rate > 60% for entities
- ✓ Concept semantic merging working (similarity > 0.92)
- ✓ Cache hit rate > 85% for canonical entities (7-day TTL)
- ✓ Post-processing normalization layer implemented

---

## MVP Cost Breakdown (Phase 1 & 2 Only)

| Component | Cost | Notes |
|-----------|------|-------|
| **Classification** | $0.0001 | Heuristics reduce LLM calls to 30% |
| **Analysis** | $0.0011 | Temp 0.4, content-specific prompts |
| **Entities** | $0.0001 | Temp 0.0, post-processing normalization |
| **Canonicalization** | $0.0001 | 7-day cache (85% hit rate) |
| **TOTAL** | **$0.0014** | **-88% from current $0.0115** |

---

## Critical Files Summary (Phase 1 & 2)

### Phase 1 Files (Content-Type Routing)
```
backend/src/agents/ContentTypeClassifierAgent.ts          [NEW] - Content type detection
backend/src/agents/analyzers/BaseAnalyzerAgent.ts         [NEW] - Base class for analyzers
backend/src/agents/analyzers/ArticleAnalyzerAgent.ts      [NEW] - News/blog analyzer
backend/src/agents/analyzers/PaperAnalyzerAgent.ts        [NEW] - Scientific paper analyzer
backend/src/agents/analyzers/VideoAnalyzerAgent.ts        [NEW] - Video content analyzer
backend/src/agents/analyzers/SocialAnalyzerAgent.ts       [NEW] - Social media analyzer
backend/src/agents/analyzers/DocumentAnalyzerAgent.ts     [NEW] - Technical doc analyzer
backend/src/agents/analyzers/GenericAnalyzerAgent.ts      [NEW] - Fallback analyzer
backend/src/agents/enrichmentAgent.ts                     [MODIFY] - Add classification step
backend/prisma/schema.prisma                              [MODIFY] - Add contentType, contentMetrics, confidence
```

### Phase 2 Files (Canonicalization)
```
backend/src/services/CanonicalizationService.ts           [NEW] - Entity/concept standardization
backend/src/utils/entityNormalizer.ts                     [NEW] - Post-processing entity normalization
backend/src/utils/conceptNormalizer.ts                    [NEW] - Post-processing concept normalization
backend/src/agents/EntityExtractorAgent.ts                [MODIFY] - Add canonicalization step
backend/src/agents/ConceptAnalyzerAgent.ts                [MODIFY] - Add canonicalization step
backend/prisma/schema.prisma                              [MODIFY] - Add canonicalName, aliases, wikidataId, popularity
backend/scripts/backfill-canonicalization.ts              [NEW] - Backfill existing data
```

---

## Timeline & Effort (MVP)

| Phase | Focus | Duration | Key Deliverables |
|-------|-------|----------|------------------|
| 1 | Content-Type Routing | 2 weeks | 6 specialized analyzers, classification |
| 2 | Canonicalization | 2 weeks | 92% dedup, Wikidata integration |

**Total MVP**: 4 weeks

---

## Rollback Strategy

1. **Phase 1** - Comment out content-type routing in enrichmentAgent.ts, use existing analysis chain
2. **Phase 2** - Disable canonicalization service, use raw entity/concept names

**Emergency Rollback**: Restore from database backup + checkout previous commit

---

## Next Actions

1. ✅ Review and approve this plan
2. ✅ Create dedicated git branch for implementation
3. Begin Phase 1: Content-Type Routing
   - Implement ContentTypeClassifierAgent
   - Implement BaseAnalyzerAgent
   - Implement 6 specialized analyzers
   - Update enrichmentAgent.ts
   - Update database schema
4. Begin Phase 2: Canonicalization
   - Implement CanonicalizationService
   - Implement entity/concept normalizers
   - Update EntityExtractorAgent
   - Update ConceptAnalyzerAgent
   - Update database schema
   - Create backfill script

---

## Document Version & Status

**Plan Version**: 2.0 (MVP Focus - Phase 1 & 2)
**Last Updated**: 2026-01-21
**Status**: Ready for Implementation
**Implementation Branch**: TBD

**Notes**:
- Phase 3-5 deferred until MVP validated
- Focus on quality improvements (content-type routing + canonicalization)
- Cost target: $0.0014/bookmark for MVP (88% reduction from current)
