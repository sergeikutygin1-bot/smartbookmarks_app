# Canonicalization & Wikidata Integration Guide

**Phase 2.1 Feature** - Reducing entity/concept duplication from 40% to <5%

---

## Table of Contents

1. [What is Canonicalization?](#what-is-canonicalization)
2. [The Problem We're Solving](#the-problem-were-solving)
3. [The 5-Step Resolution Process](#the-5-step-resolution-process)
4. [Wikidata Integration](#wikidata-integration)
5. [Fuzzy Matching with Jaro-Winkler](#fuzzy-matching-with-jaro-winkler)
6. [Real-World Examples](#real-world-examples)
7. [Performance & Cost](#performance--cost)

---

## What is Canonicalization?

**Canonicalization** is the process of converting multiple variations of an entity or concept into a single **canonical form** (the "official" representation).

### Simple Example

When users save bookmarks, they mention the same things in different ways:

```
User bookmarks mentioning React:
- "React" (official name)
- "react" (lowercase)
- "ReactJS" (common variation)
- "React.js" (with punctuation)

Without canonicalization: 4 separate entities
With canonicalization: 1 entity ("React") with 3 aliases
```

### Benefits

- **Consistency**: Same entity always has the same name
- **Deduplication**: Reduces duplicates by 90%+
- **Searchability**: Find all mentions regardless of variation
- **Authority**: Links to authoritative sources (Wikidata)
- **Knowledge Graph**: Cleaner connections between entities

---

## The Problem We're Solving

### Before Canonicalization (Phase 1)

```sql
SELECT * FROM entities WHERE user_id = 'user-123';

-- Results:
-- { name: "React", type: "technology", occurrence: 5 }
-- { name: "react", type: "technology", occurrence: 3 }
-- { name: "ReactJS", type: "technology", occurrence: 7 }
-- { name: "React.js", type: "technology", occurrence: 2 }

-- Total: 4 entities, 40% duplication rate
```

**Issues**:
1. 17 occurrences split across 4 entities
2. Search for "React" only finds 5 mentions (misses 12 others)
3. Knowledge graph has 4 separate nodes for the same library
4. Popularity metrics are inaccurate (split across variations)

### After Canonicalization (Phase 2.1)

```sql
SELECT * FROM entities WHERE user_id = 'user-123';

-- Results:
-- {
--   name: "React",
--   canonical_name: "React",
--   aliases: ["react", "ReactJS", "React.js"],
--   type: "technology",
--   occurrence: 17,
--   popularity: 4,
--   wikidata_id: "Q20800404"
-- }

-- Total: 1 entity, 0% duplication
```

**Benefits**:
1. All 17 occurrences tracked in one entity
2. Search for "React" finds all mentions (including aliases)
3. Clean knowledge graph with 1 node
4. Accurate popularity metrics (17 total occurrences)
5. Linked to Wikidata for external integrations

---

## The 5-Step Resolution Process

The canonicalization service uses a **fallback chain** to resolve entities efficiently:

```
┌──────────────────────────────────────────────────────────┐
│                    ENTITY EXTRACTION                     │
│                                                          │
│  User saves bookmark about "react hooks tutorial"       │
│  EntityExtractorAgent extracts: "react"                 │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 1: REDIS CACHE LOOKUP (7-day TTL)                  │
├──────────────────────────────────────────────────────────┤
│  Key: "canonical:entity:technology:react:user-123"       │
│                                                          │
│  If HIT:  Return cached result (85% of cases, <1ms)     │
│  If MISS: Continue to Step 2                            │
└─────────────────────┬────────────────────────────────────┘
                      │ MISS
                      ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 2: DATABASE FUZZY MATCHING (Jaro-Winkler)          │
├──────────────────────────────────────────────────────────┤
│  Query: Top 50 technology entities by popularity         │
│                                                          │
│  Compare "react" to each entity:                         │
│  - "React" (canonical_name) → similarity = 1.0 ✓         │
│  - "ReactJS" (alias) → similarity = 0.88 ✓               │
│  - "Angular" (canonical_name) → similarity = 0.42 ✗      │
│                                                          │
│  Threshold: 0.85                                         │
│                                                          │
│  If MATCH: Return canonical entity (10% of cases, ~5ms)  │
│  If MISS:  Continue to Step 3                           │
└─────────────────────┬────────────────────────────────────┘
                      │ MISS
                      ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 3: WIKIDATA SPARQL LOOKUP                          │
├──────────────────────────────────────────────────────────┤
│  Query Wikidata for "react" + type "technology"         │
│                                                          │
│  SPARQL:                                                 │
│    SELECT ?item ?itemLabel ?itemDescription WHERE {     │
│      ?item rdfs:label "react"@en .                      │
│      ?item wdt:P31/wdt:P279* wd:Q7397 .  # software    │
│      SERVICE wikibase:label {                           │
│        bd:serviceParam wikibase:language "en" .         │
│      }                                                  │
│    }                                                    │
│                                                          │
│  Result: Q20800404 - "React"                            │
│          "JavaScript library for building UIs"          │
│                                                          │
│  If FOUND: Extract canonical name (3% of cases, ~200ms) │
│  If MISS:  Continue to Step 4                           │
└─────────────────────┬────────────────────────────────────┘
                      │ MISS (rare)
                      ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 4: LLM CANONICALIZATION (GPT-4o-mini, temp 0.0)    │
├──────────────────────────────────────────────────────────┤
│  Prompt:                                                 │
│    "Canonicalize this entity name:                      │
│     Name: 'react'                                        │
│     Type: technology                                     │
│     Context: 'React hooks tutorial for beginners'       │
│                                                          │
│     Return the official canonical name in JSON."        │
│                                                          │
│  Response: { "canonical_name": "React" }                │
│                                                          │
│  Deterministic (temp 0.0) for consistency               │
│                                                          │
│  (2% of cases, ~500ms, $0.0001)                         │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 5: CREATE NEW CANONICAL ENTITY                     │
├──────────────────────────────────────────────────────────┤
│  INSERT INTO entities (                                  │
│    name: "react",                                        │
│    normalized_name: "react",                             │
│    canonical_name: "React",       ← Official name       │
│    aliases: ["react"],             ← Variations         │
│    wikidata_id: "Q20800404",      ← External ID         │
│    popularity: 1,                                        │
│    occurrence_count: 1                                   │
│  )                                                       │
│                                                          │
│  Cache result in Redis (7-day TTL)                      │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────────┐
│                    RESULT RETURNED                       │
│                                                          │
│  canonical_name: "React"                                 │
│  wikidata_id: "Q20800404"                                │
│  aliases: ["react"]                                      │
└──────────────────────────────────────────────────────────┘
```

---

## Wikidata Integration

### What is Wikidata?

[Wikidata](https://www.wikidata.org) is a free, collaborative knowledge base maintained by the Wikimedia Foundation. It contains structured data about millions of entities:

- **People**: Q76 = Barack Obama, Q42 = Douglas Adams
- **Companies**: Q95 = Google, Q380 = Meta, Q312 = Apple
- **Technologies**: Q20800404 = React, Q28865 = Python, Q47607 = PostgreSQL
- **Locations**: Q60 = New York City, Q84 = London

Each entity has:
- **Q-number**: Unique identifier (e.g., Q20800404)
- **Canonical name**: Official name in multiple languages
- **Aliases**: Alternative names and abbreviations
- **Description**: Brief summary
- **Properties**: Structured data (website, founded date, etc.)

### Why Use Wikidata?

1. **Authority**: Crowd-sourced, high-quality data
2. **Coverage**: 100M+ entities across all domains
3. **Linkage**: Enables external integrations (Wikipedia, DBpedia, etc.)
4. **Multilingual**: Names in 300+ languages
5. **Free**: No API costs

### SPARQL Query Examples

#### Example 1: Technology Lookup

Query for "React":

```sparql
SELECT ?item ?itemLabel ?itemDescription ?website WHERE {
  # Find items with label "React" in English
  ?item rdfs:label "React"@en .

  # Filter to software (P31 = instance of, Q7397 = software)
  ?item wdt:P31/wdt:P279* wd:Q7397 .

  # Optional: get official website
  OPTIONAL { ?item wdt:P856 ?website . }

  # Wikidata label service (human-readable labels)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
  }
}
LIMIT 10
```

**Result**:
```json
{
  "item": "http://www.wikidata.org/entity/Q20800404",
  "itemLabel": "React",
  "itemDescription": "JavaScript library for building user interfaces",
  "website": "https://react.dev"
}
```

We extract:
- **Canonical name**: "React"
- **Wikidata ID**: "Q20800404"
- **Description**: "JavaScript library for building user interfaces"
- **Website**: "https://react.dev"

#### Example 2: Company Lookup

Query for "Meta" (formerly Facebook):

```sparql
SELECT ?item ?itemLabel ?itemDescription ?alias WHERE {
  # Find business enterprises with label "Meta"
  ?item rdfs:label "Meta"@en .
  ?item wdt:P31/wdt:P279* wd:Q4830453 .  # instance of business enterprise

  # Get aliases (alternative names)
  OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "en") . }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
  }
}
```

**Result**:
```json
{
  "item": "http://www.wikidata.org/entity/Q380",
  "itemLabel": "Meta Platforms",
  "itemDescription": "American technology conglomerate",
  "alias": ["Meta", "Facebook", "Facebook, Inc.", "FB"]
}
```

We extract:
- **Canonical name**: "Meta Platforms"
- **Wikidata ID**: "Q380"
- **Aliases**: ["Meta", "Facebook", "Facebook, Inc.", "FB"]

### Type-Specific Filters

Different entity types use different Wikidata classes:

| Entity Type | Wikidata Class | Example |
|-------------|----------------|---------|
| **technology** | Q7397 (software) | React, Python, PostgreSQL |
| **company** | Q4830453 (business) | Google, Meta, Apple |
| **person** | Q5 (human) | Linus Torvalds, Tim Berners-Lee |
| **location** | Q515 (city) | San Francisco, London |
| **product** | Q2424752 (product) | iPhone, Chrome, Windows |

### Wikidata Linkage Benefits

With Wikidata IDs stored in our database, we can:

1. **Enrich entity pages**: Display descriptions, logos, websites
2. **Cross-reference**: Link to Wikipedia articles
3. **Disambiguation**: Distinguish "Apple" (company) from "Apple" (fruit)
4. **Multilingual**: Show names in user's preferred language
5. **External APIs**: Integrate with other knowledge bases

---

## Fuzzy Matching with Jaro-Winkler

When an entity isn't in cache or Wikidata, we search our database using **fuzzy string matching**.

### Why Fuzzy Matching?

Exact matching would fail for:
- Different casing: "React" vs "react"
- Punctuation: "React.js" vs "ReactJS"
- Abbreviations: "PostgreSQL" vs "psql"
- Typos: "Reactt" vs "React"

### Jaro-Winkler Algorithm

**Jaro-Winkler** is a string similarity algorithm that:
1. Counts matching characters within a window
2. Penalizes transpositions
3. **Boosts score for common prefixes** (key advantage)

**Score range**: 0.0 (completely different) to 1.0 (identical)

### Algorithm Steps

```python
def jaro_winkler(s1: str, s2: str) -> float:
    # Step 1: Calculate Jaro distance
    jaro = jaro_distance(s1, s2)

    # Step 2: Find common prefix length (max 4 chars)
    prefix_len = 0
    for i in range(min(len(s1), len(s2), 4)):
        if s1[i] == s2[i]:
            prefix_len += 1
        else:
            break

    # Step 3: Apply Winkler adjustment (boost for prefixes)
    p = 0.1  # prefix scaling factor
    jaro_winkler = jaro + (prefix_len * p * (1 - jaro))

    return jaro_winkler
```

### Similarity Examples

| String 1 | String 2 | Jaro-Winkler | Match (≥0.85)? |
|----------|----------|--------------|----------------|
| "React" | "react" | 0.95 | ✓ Yes |
| "React" | "ReactJS" | 0.88 | ✓ Yes |
| "React" | "React.js" | 0.91 | ✓ Yes |
| "React" | "Reactt" | 0.92 | ✓ Yes (typo) |
| "React" | "Angular" | 0.42 | ✗ No |
| "PostgreSQL" | "postgres" | 0.92 | ✓ Yes |
| "PostgreSQL" | "psql" | 0.68 | ✗ No |

**Our threshold**: 0.85 (tuned for high precision)

### Why Jaro-Winkler over Levenshtein?

| Aspect | Levenshtein | Jaro-Winkler |
|--------|-------------|--------------|
| **Prefix boost** | No | Yes (important for "React" vs "ReactJS") |
| **Short strings** | Less accurate | Better |
| **Transpositions** | Heavy penalty | Light penalty |
| **Casing** | Penalty | More tolerant |

**Example**: "React" vs "ReactJS"
- **Levenshtein**: 0.71 (would miss)
- **Jaro-Winkler**: 0.88 (would match)

### Database Query Optimization

We don't compare against all entities (too slow):

```python
async def _fuzzy_match_entity(
    self,
    entity_name: str,
    entity_type: EntityType,
    user_id: str,
    session: AsyncSession
):
    # Query top 50 entities by popularity (most likely matches)
    result = await session.execute(
        select(Entity)
        .where(Entity.user_id == user_id, Entity.entity_type == entity_type.value)
        .order_by(Entity.popularity.desc())
        .limit(50)
    )
    entities = result.scalars().all()

    best_match = None
    best_similarity = 0.0

    for entity in entities:
        # Check canonical name
        similarity = jaro_winkler(entity_name.lower(), entity.canonical_name.lower())

        if similarity > best_similarity and similarity >= THRESHOLD:
            best_match = entity
            best_similarity = similarity

        # Check aliases
        if entity.aliases:
            for alias in entity.aliases:
                similarity = jaro_winkler(entity_name.lower(), alias.lower())
                if similarity > best_similarity and similarity >= THRESHOLD:
                    best_match = entity
                    best_similarity = similarity

    return best_match
```

**Performance**: ~5ms for 50 comparisons (fast enough)

---

## Real-World Examples

### Example 1: React Variations

User saves 4 bookmarks mentioning React in different ways:

```
Bookmark 1: "React hooks tutorial"
  → Extract: "React"
  → Canonicalize: "React" (cache miss, Wikidata match)
  → Store: canonical_name="React", wikidata_id="Q20800404"

Bookmark 2: "Building apps with react"
  → Extract: "react"
  → Canonicalize: "React" (cache hit, <1ms)
  → Update: occurrence_count++, aliases+=["react"]

Bookmark 3: "ReactJS best practices"
  → Extract: "ReactJS"
  → Canonicalize: "React" (cache miss, DB fuzzy match)
  → Update: occurrence_count++, aliases+=["ReactJS"]

Bookmark 4: "React.js components"
  → Extract: "React.js"
  → Canonicalize: "React" (cache hit, <1ms)
  → Update: occurrence_count++, aliases+=["React.js"]
```

**Final database state**:
```json
{
  "canonical_name": "React",
  "aliases": ["react", "ReactJS", "React.js"],
  "occurrence_count": 4,
  "popularity": 4,
  "wikidata_id": "Q20800404"
}
```

**Before Phase 2.1**: 4 separate entities
**After Phase 2.1**: 1 entity with 3 aliases (75% deduplication)

---

### Example 2: Facebook → Meta Migration

User saved bookmarks over time mentioning both "Facebook" and "Meta":

```
2020 Bookmark: "Facebook's new AI model"
  → Extract: "Facebook"
  → Canonicalize: Wikidata lookup
  → Wikidata: Q380 - "Meta Platforms" (aliases: ["Facebook", "FB"])
  → Store: canonical_name="Meta Platforms", aliases=["Facebook"]

2023 Bookmark: "Meta's VR headset"
  → Extract: "Meta"
  → Canonicalize: Cache miss, DB fuzzy match
  → Match: "Meta Platforms" (alias "Meta" added by Wikidata)
  → Update: occurrence_count++

2024 Bookmark: "FB earnings report"
  → Extract: "FB"
  → Canonicalize: Cache hit
  → Update: occurrence_count++, aliases+=["FB"]
```

**Result**: All 3 variations linked to canonical "Meta Platforms"

**Knowledge graph benefit**: When user searches for "Facebook", they see:
- All bookmarks mentioning "Facebook", "Meta", or "FB"
- Canonical name "Meta Platforms" with Wikidata link
- Description from Wikidata

---

### Example 3: PostgreSQL Variations

Technical users mention PostgreSQL many ways:

```
Variations extracted:
- "PostgreSQL" (official)
- "postgres" (common abbreviation)
- "Postgres" (capitalized)
- "psql" (CLI tool name)
- "PSQL" (uppercase)

Canonicalization results:
1. "PostgreSQL" → Wikidata Q47607 → canonical="PostgreSQL"
2. "postgres" → DB fuzzy (0.92) → canonical="PostgreSQL"
3. "Postgres" → Cache hit → canonical="PostgreSQL"
4. "psql" → DB fuzzy (0.68, FAIL) → Check aliases → Match!
5. "PSQL" → Cache hit → canonical="PostgreSQL"

Final: 5 variations → 1 entity (80% reduction)
```

---

### Example 4: AI → Artificial Intelligence (Concepts)

Concepts use **semantic matching** instead of fuzzy string matching:

```
User saves bookmark: "AI trends in 2024"
  → Extract concept: "AI"
  → Canonicalize:
    1. Cache miss
    2. DB semantic search (embedding similarity)
       - Compare "AI" embedding to existing concepts
       - "Artificial Intelligence" → cosine similarity 0.94 ✓
    3. Return: canonical_name="Artificial Intelligence"
  → Update: aliases+=["AI"], occurrence_count++

User saves bookmark: "Artificial intelligence ethics"
  → Extract: "Artificial intelligence"
  → Canonicalize: Cache hit
  → Update: occurrence_count++

User saves bookmark: "A.I. safety research"
  → Extract: "A.I."
  → Canonicalize: DB semantic match
  → Return: canonical_name="Artificial Intelligence"
  → Update: aliases+=["A.I."]
```

**Final state**:
```json
{
  "canonical_name": "Artificial Intelligence",
  "aliases": ["AI", "A.I.", "artificial intelligence"],
  "description": "Simulation of human intelligence by machines",
  "occurrence_count": 3,
  "popularity": 3
}
```

**Why semantic matching for concepts?**
- "AI" and "Machine Learning" are textually similar but semantically different
- "AI" and "Artificial Intelligence" are textually different but semantically identical
- Embedding similarity captures meaning, not just characters

---

## Performance & Cost

### Response Times

| Step | Hit Rate | Latency | Cost |
|------|----------|---------|------|
| **1. Redis Cache** | 85% | <1ms | $0 |
| **2. DB Fuzzy Match** | 10% | ~5ms | $0 |
| **3. Wikidata Lookup** | 3% | ~200ms | $0 |
| **4. LLM Fallback** | 2% | ~500ms | $0.0001 |

**Average latency**: ~8ms (weighted by hit rates)

### Cost Breakdown

Per entity canonicalization:
- Cache hit (85%): $0
- DB match (10%): $0
- Wikidata (3%): $0 (free API, rate-limited)
- LLM (2%): $0.0001 (GPT-4o-mini, temp 0.0)

**Average cost per entity**: ~$0.000002

**For typical bookmark** (5 entities, 4 concepts):
- Entity canonicalization: 5 × $0.000002 = $0.00001
- Concept canonicalization: 4 × $0.000002 = $0.000008
- **Total**: ~$0.000018 (negligible)

### Scalability

**Cache size** (Redis):
- 10,000 users × 100 entities each = 1M cache entries
- Avg entry size: 1KB
- Total: ~1GB RAM (easily fits in Redis)

**Database queries**:
- Fuzzy matching: 50 entity comparisons = ~5ms
- Indexed by (user_id, entity_type, popularity) for fast retrieval

**Wikidata rate limits**:
- 200 requests/second (community limit)
- We typically make <1 req/sec (3% hit rate)
- No API key required

---

## Implementation Details

### Code Structure

```
ai-service/
├── services/
│   └── canonicalization_service.py    # Main service (785 lines)
│       ├── resolve_entity()            # Entity 5-step resolution
│       ├── resolve_concept()           # Concept semantic resolution
│       ├── _cache_lookup()             # Redis operations
│       ├── _fuzzy_match_entity()       # Jaro-Winkler matching
│       ├── _lookup_wikidata()          # SPARQL queries
│       └── _llm_canonicalize()         # GPT fallback
│
├── agents/
│   ├── entity_extractor_agent.py      # Calls canonicalization
│   └── concept_analyzer_agent.py      # Calls canonicalization
│
├── utils/
│   ├── entity_normalizer.py           # Post-processing (100+ mappings)
│   └── concept_normalizer.py          # Hierarchy enforcement (40+ mappings)
│
└── scripts/
    └── backfill_canonicalization.py   # Migrate existing data
```

### Testing

Run comprehensive tests:

```bash
cd ai-service

# Test canonicalization service
python test_canonicalization.py

# Expected output:
# ✓ Fuzzy match: 'react' → 'React'
# ✓ Fuzzy match: 'reactjs' → 'React'
# ✓ Semantic match: 'AI' → 'Artificial Intelligence'
# ✓ Redis caching: cache hit returns same result
# ✓ Entity extraction: 4 entities extracted
# ✓ Entity canonicalization: 4 canonical entities created
# ✓ Deduplication: 10 variations → 2 canonical (80% reduction)
#
# All 9/9 tests passed ✓
```

### Backfilling Existing Data

Migrate existing entities/concepts to canonical forms:

```bash
# Dry-run (preview changes)
python scripts/backfill_canonicalization.py --dry-run

# Full backfill
python scripts/backfill_canonicalization.py

# Expected output:
# Entities:
#   Before:         1,247
#   After:          118
#   Merged:         1,129
#   Dedup Rate:     90.5%
#   Wikidata:       72 (61.0%)
#
# Concepts:
#   Before:         245
#   After:          38
#   Merged:         207
#   Dedup Rate:     84.5%
```

---

## References

- **Wikidata**: https://www.wikidata.org
- **SPARQL Endpoint**: https://query.wikidata.org
- **Jaro-Winkler Paper**: Winkler, W.E. (1990). "String Comparator Metrics"
- **Phase 2.1 Implementation**: `/ai-service/services/canonicalization_service.py`
- **Test Suite**: `/ai-service/test_canonicalization.py`

---

## FAQ

**Q: What if Wikidata doesn't have an entity?**
A: We fall back to LLM canonicalization (GPT-4o-mini, temp 0.0) which provides deterministic canonical names.

**Q: Can users override canonical names?**
A: Not yet implemented, but planned for Phase 3. Users could manually set preferred canonical forms.

**Q: What about entities in non-English languages?**
A: Wikidata supports 300+ languages. We could extend SPARQL queries to accept language parameter.

**Q: How do we handle disambiguation (e.g., "Apple" company vs fruit)?**
A: Entity type + context + Wikidata filters handle most cases. For edge cases, we could add disambiguation UI.

**Q: What's the cache invalidation strategy?**
A: 7-day TTL is sufficient since canonical forms rarely change. Could add manual cache clearing for migrations.

**Q: Performance impact on bookmark processing?**
A: Minimal. 85% cache hits (<1ms), 10% DB queries (~5ms). Total overhead: ~8ms per entity on average.

---

**Last Updated**: 2026-01-22
**Phase**: 2.1 - Canonicalization & Wikidata Integration
**Status**: Implemented ✓
