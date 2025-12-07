# Smart Bookmark — Backend Technical Documentation

## Web Application (Phase 1)

**Version:** 1.0  
**Last Updated:** November 2024  
**Tech Stack:** Node.js, Express/Fastify, PostgreSQL, Redis, OpenAI API

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Design](#3-api-design)
4. [Database Design](#4-database-design)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Agentic Processing Framework](#6-agentic-processing-framework)
7. [Content Extraction Pipeline](#7-content-extraction-pipeline)
8. [Search Infrastructure](#8-search-infrastructure)
9. [Background Job Processing](#9-background-job-processing)
10. [Caching Strategy](#10-caching-strategy)
11. [Error Handling & Logging](#11-error-handling--logging)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Environment Configuration](#13-environment-configuration)
14. [Appendix](#appendix)

---

## 1. Overview

The Smart Bookmark backend is responsible for handling all business logic, data persistence, user authentication, and most importantly—the AI-powered content processing pipeline. It serves as the brain behind the application, orchestrating content extraction, AI analysis, and search functionality.

### Core Responsibilities

| Responsibility | Description |
|----------------|-------------|
| API Layer | RESTful endpoints for frontend communication |
| Data Persistence | PostgreSQL for structured data, vector storage for embeddings |
| Authentication | User registration, login, session management |
| Content Processing | URL fetching, metadata extraction, AI summarization |
| Search | Full-text and semantic search across bookmarks |
| Background Jobs | Asynchronous processing of bookmarks |

### Design Principles

The backend follows these guiding principles:

**Asynchronous by Default** — When a user saves a bookmark, they receive an immediate response while heavy processing happens in the background. This keeps the UI snappy and responsive.

**Graceful Degradation** — If AI processing fails, the bookmark is still saved with whatever metadata could be extracted. Users never lose their data due to processing failures.

**Idempotency** — API operations can be safely retried without side effects. This is critical for handling network issues and ensuring data consistency.

**Separation of Concerns** — The API layer is thin and delegates to specialized services for business logic, making the codebase easier to test and maintain.

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY / LOAD BALANCER                    │
│                            (Rate Limiting, SSL Termination)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION SERVER                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Auth Module   │  │   Bookmark API  │  │   Search API    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Tag Service    │  │  User Service   │  │ Processing Svc  │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────────────┐
│   PostgreSQL    │  │       Redis         │  │     Job Queue (BullMQ)      │
│   (Primary DB)  │  │  (Cache + Sessions) │  │   (Background Processing)   │
└─────────────────┘  └─────────────────────┘  └─────────────────────────────┘
                                                         │
                                                         ▼
                              ┌─────────────────────────────────────────────┐
                              │           AGENTIC PROCESSING WORKERS        │
                              │  ┌───────────┐ ┌───────────┐ ┌───────────┐  │
                              │  │ Extractor │ │ AI Agent  │ │ Embedder  │  │
                              │  └───────────┘ └───────────┘ └───────────┘  │
                              └─────────────────────────────────────────────┘
                                       │               │
                                       ▼               ▼
                              ┌─────────────┐  ┌─────────────────┐
                              │  External   │  │   Vector DB     │
                              │  APIs       │  │  (pgvector)     │
                              └─────────────┘  └─────────────────┘
```

### Component Overview

**API Gateway** handles incoming requests, performs rate limiting, and terminates SSL. In production, this could be Nginx, AWS API Gateway, or Cloudflare.

**Application Server** is the main Node.js process running Express or Fastify. It contains route handlers, middleware, and service orchestration.

**PostgreSQL** stores all persistent data: users, bookmarks, tags, and processing history. We use the pgvector extension for storing embeddings.

**Redis** serves dual purposes: caching frequently accessed data (like user sessions and popular searches) and acting as the message broker for our job queue.

**Job Queue (BullMQ)** manages background processing tasks. When a bookmark is created, jobs are enqueued for content extraction, AI processing, and embedding generation.

**Agentic Processing Workers** are specialized worker processes that handle the heavy lifting of content analysis. They operate independently from the main API server, allowing horizontal scaling based on processing load.

---

## 3. API Design

### API Conventions

All API endpoints follow RESTful conventions with JSON request/response bodies. The base URL structure is `/api/v1/` to allow for future versioning.

**Request Headers:**
- `Content-Type: application/json` for all POST/PATCH requests
- `Authorization: Bearer <token>` for authenticated endpoints
- `X-Request-ID: <uuid>` for request tracing (optional, generated if not provided)

**Response Format:**
Every response follows a consistent envelope structure with a `data` field for successful responses and an `error` field for failures. This makes client-side error handling predictable.

**Pagination:**
List endpoints use cursor-based pagination for efficiency. Each response includes a `nextCursor` value that clients pass to fetch subsequent pages.

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create new user account |
| POST | `/auth/login` | Authenticate and receive tokens |
| POST | `/auth/logout` | Invalidate current session |
| POST | `/auth/refresh` | Refresh expired access token |
| GET | `/auth/me` | Get current user profile |
| POST | `/auth/google` | OAuth callback for Google login |

**Registration Flow:**
The registration endpoint accepts email and password, validates them, hashes the password using bcrypt, creates the user record, and returns an access token. Email verification is optional in Phase 1 but the schema supports it.

**Login Flow:**
Login validates credentials against stored hash, generates a JWT access token (short-lived, 15 minutes) and a refresh token (long-lived, 7 days). The refresh token is stored in Redis for revocation capability.

### Bookmark Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bookmarks` | List user's bookmarks with filters |
| GET | `/bookmarks/:id` | Get single bookmark details |
| POST | `/bookmarks` | Create new bookmark |
| PATCH | `/bookmarks/:id` | Update bookmark fields |
| DELETE | `/bookmarks/:id` | Delete bookmark |

**GET /bookmarks Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (full-text or semantic) |
| `type` | string | Filter by content type (article, video, etc.) |
| `tags` | string | Comma-separated tag IDs |
| `status` | string | Filter by processing status |
| `sort` | string | Sort field (created_at, updated_at, title) |
| `order` | string | Sort order (asc, desc) |
| `cursor` | string | Pagination cursor |
| `limit` | number | Items per page (default: 20, max: 100) |

**POST /bookmarks Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The URL to bookmark |
| `source` | string | No | User-defined source label |
| `summary` | string | No | User-provided notes (will be appended to AI summary) |
| `tags` | string[] | No | Array of tag names (auto-created if new) |

**Create Bookmark Flow:**
When a bookmark is created, the API immediately returns a response with `status: "processing"`. The actual content extraction and AI analysis happen asynchronously. Clients can poll the bookmark endpoint or subscribe to WebSocket updates to know when processing completes.

### Tag Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tags` | List all user's tags |
| POST | `/tags` | Create new tag |
| PATCH | `/tags/:id` | Rename tag |
| DELETE | `/tags/:id` | Delete tag (removes from bookmarks) |
| GET | `/tags/:id/bookmarks` | List bookmarks with this tag |

Tags are user-scoped—each user has their own tag namespace. When AI suggests tags during processing, it first looks for existing tags with similar names to maintain consistency.

### Search Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search` | Unified search across bookmarks |

**Search Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `mode` | string | Search mode: "keyword" or "semantic" (default: auto) |
| `filters` | object | Additional filters (type, tags, date range) |

The search endpoint intelligently chooses between keyword search (PostgreSQL full-text) and semantic search (vector similarity) based on query characteristics. Short, keyword-like queries use full-text search; longer, natural language queries use semantic search.

---

## 4. Database Design

### Database Choice Rationale

PostgreSQL was chosen as the primary database for several reasons:

**Relational Integrity** — Bookmarks, users, and tags have clear relationships that benefit from foreign keys and joins.

**Full-Text Search** — PostgreSQL's built-in `tsvector` and `GIN` indexes provide excellent keyword search without additional infrastructure.

**pgvector Extension** — Enables storing and querying vector embeddings directly alongside relational data, eliminating the need for a separate vector database in Phase 1.

**JSON Support** — The `jsonb` type allows flexible storage of metadata that varies by content type without schema migrations.

### Entity-Relationship Overview

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│    users    │       │    bookmarks    │       │    tags     │
├─────────────┤       ├─────────────────┤       ├─────────────┤
│ id (PK)     │──┐    │ id (PK)         │    ┌──│ id (PK)     │
│ email       │  │    │ user_id (FK)    │◄───┤  │ user_id(FK) │
│ password    │  └───►│ url             │    │  │ name        │
│ created_at  │       │ title           │    │  │ color       │
│ updated_at  │       │ domain          │    │  │ created_at  │
└─────────────┘       │ summary         │    │  └─────────────┘
                      │ content_type    │    │
                      │ status          │    │  ┌─────────────────┐
                      │ metadata (json) │    │  │ bookmark_tags   │
                      │ embedding       │    │  ├─────────────────┤
                      │ created_at      │    └──│ bookmark_id(FK) │
                      │ updated_at      │◄──────│ tag_id (FK)     │
                      └─────────────────┘       └─────────────────┘
```

### Table Definitions

**users** — Stores user account information.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| email | VARCHAR(255) | Unique, indexed |
| password_hash | VARCHAR(255) | bcrypt hash, null for OAuth users |
| google_id | VARCHAR(255) | Google OAuth identifier, nullable |
| email_verified | BOOLEAN | Whether email is verified |
| created_at | TIMESTAMP | Account creation time |
| updated_at | TIMESTAMP | Last profile update |

**bookmarks** — Core bookmark data.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users |
| url | TEXT | Original URL (indexed) |
| title | VARCHAR(500) | Extracted or user-provided title |
| domain | VARCHAR(255) | Extracted domain (indexed for filtering) |
| source | VARCHAR(255) | User-labeled source |
| summary | TEXT | AI-generated or user-provided summary |
| key_points | TEXT[] | Array of extracted key points |
| content_type | VARCHAR(50) | article, video, image, social, podcast, other |
| status | VARCHAR(50) | pending, processing, completed, failed |
| metadata | JSONB | Flexible storage for type-specific data |
| embedding | VECTOR(1536) | OpenAI embedding for semantic search |
| search_vector | TSVECTOR | Full-text search index |
| created_at | TIMESTAMP | When bookmark was saved |
| updated_at | TIMESTAMP | Last modification |
| processed_at | TIMESTAMP | When AI processing completed |

**tags** — User-defined tags.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users (tags are user-scoped) |
| name | VARCHAR(100) | Tag display name |
| normalized_name | VARCHAR(100) | Lowercase for deduplication |
| color | VARCHAR(7) | Hex color code for UI |
| created_at | TIMESTAMP | Creation timestamp |

**bookmark_tags** — Many-to-many relationship between bookmarks and tags.

| Column | Type | Description |
|--------|------|-------------|
| bookmark_id | UUID | Foreign key to bookmarks |
| tag_id | UUID | Foreign key to tags |
| auto_generated | BOOLEAN | Whether tag was AI-suggested |

### Indexes

Several indexes are crucial for performance:

**Full-Text Search Index** — A GIN index on `search_vector` enables fast keyword searches across titles, summaries, and extracted content.

**Vector Similarity Index** — An IVFFlat or HNSW index on `embedding` enables efficient approximate nearest neighbor queries for semantic search.

**Composite Indexes** — Common query patterns like "user's bookmarks sorted by date" benefit from composite indexes on `(user_id, created_at DESC)`.

### Metadata Schema by Content Type

The `metadata` JSONB column stores type-specific information:

**Article:**
```
{
  "author": "string",
  "publication_date": "ISO date",
  "reading_time": "number (minutes)",
  "word_count": "number",
  "excerpt": "string (first 500 chars)"
}
```

**Video:**
```
{
  "duration": "number (seconds)",
  "channel": "string",
  "platform": "youtube | vimeo | tiktok",
  "thumbnail_url": "string",
  "transcript_available": "boolean"
}
```

**Social:**
```
{
  "platform": "twitter | instagram | linkedin",
  "author_handle": "string",
  "engagement": {
    "likes": "number",
    "shares": "number"
  },
  "media_urls": ["string"]
}
```

---

## 5. Authentication & Authorization

### Authentication Strategy

The backend uses JWT-based authentication with a dual-token approach:

**Access Token** — Short-lived (15 minutes), stateless JWT containing user ID and basic claims. Used for authenticating API requests.

**Refresh Token** — Long-lived (7 days), opaque token stored in Redis. Used to obtain new access tokens without re-authentication.

This approach balances security (short-lived tokens limit exposure if compromised) with user experience (refresh tokens prevent constant re-login).

### Token Structure

**Access Token Claims:**

| Claim | Description |
|-------|-------------|
| `sub` | User ID (UUID) |
| `email` | User email |
| `iat` | Issued at timestamp |
| `exp` | Expiration timestamp |
| `type` | Token type ("access") |

**Refresh Token:**
Refresh tokens are not JWTs—they're random UUIDs stored in Redis with the associated user ID. This allows server-side revocation (logout, password change).

### OAuth Integration (Google)

Google OAuth follows the standard authorization code flow:

1. Frontend redirects to Google's consent screen
2. User grants permission, Google redirects back with authorization code
3. Frontend sends code to `/auth/google`
4. Backend exchanges code for Google tokens, fetches user profile
5. Backend creates/updates user record, issues our own tokens

For users who signed up with email/password and later connect Google, we merge accounts based on email match.

### Authorization Model

Phase 1 uses a simple ownership-based authorization model:

**Rule:** Users can only access their own resources.

Every database query for bookmarks and tags includes a `WHERE user_id = ?` clause. Middleware validates the authenticated user matches the resource owner before allowing mutations.

Future phases may add:
- Shared collections with permission levels
- Team workspaces with role-based access
- Public/private bookmark visibility

### Password Security

**Hashing:** Passwords are hashed using bcrypt with a work factor of 12 (adjustable based on hardware benchmarks).

**Validation:** Passwords must be at least 8 characters. We check against common passwords list during registration.

**Reset Flow:** Password reset uses time-limited tokens (1 hour) sent via email. Tokens are single-use and invalidated after use.

---

## 6. Agentic Processing Framework

This is the heart of Smart Bookmark's intelligence. The agentic framework orchestrates multiple specialized "agents" that work together to understand and enrich bookmark content.

### Philosophy

Rather than a single monolithic processing function, we use an agent-based architecture where each agent has a specific responsibility. This provides several benefits:

**Modularity** — Agents can be developed, tested, and deployed independently.

**Resilience** — If one agent fails, others can still complete their work. A bookmark with a failed summary can still have successful tags.

**Scalability** — Different agents can scale independently based on their resource needs.

**Extensibility** — New capabilities can be added by creating new agents without modifying existing ones.

### Agent Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BOOKMARK PROCESSING PIPELINE                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────┐
                    │        ORCHESTRATOR AGENT       │
                    │   (Coordinates all processing)  │
                    └─────────────────────────────────┘
                                       │
           ┌───────────────┬───────────┴───────────┬───────────────┐
           ▼               ▼                       ▼               ▼
    ┌─────────────┐ ┌─────────────┐       ┌─────────────┐ ┌─────────────┐
    │  EXTRACTOR  │ │  ANALYZER   │       │   TAGGER    │ │  EMBEDDER   │
    │    AGENT    │ │    AGENT    │       │    AGENT    │ │    AGENT    │
    │             │ │             │       │             │ │             │
    │ Fetches URL │ │ Generates   │       │ Suggests    │ │ Creates     │
    │ Extracts    │ │ summary &   │       │ relevant    │ │ vector      │
    │ content     │ │ key points  │       │ tags        │ │ embedding   │
    └─────────────┘ └─────────────┘       └─────────────┘ └─────────────┘
           │               │                       │               │
           └───────────────┴───────────┬───────────┴───────────────┘
                                       ▼
                              ┌─────────────────┐
                              │   BOOKMARK DB   │
                              │   (Updated)     │
                              └─────────────────┘
```

### Orchestrator Agent

The Orchestrator is the conductor of the processing pipeline. When a new bookmark job arrives, it:

1. **Validates the URL** — Checks if the URL is reachable and not on a blocklist
2. **Determines Content Type** — Analyzes URL patterns and headers to identify content type (article, video, social post, etc.)
3. **Dispatches to Specialists** — Sends the bookmark to appropriate agents based on content type
4. **Aggregates Results** — Collects outputs from all agents and updates the bookmark record
5. **Handles Failures** — Implements retry logic and graceful degradation

**Decision Logic:**
The Orchestrator uses simple heuristics initially (URL patterns, Content-Type headers) but can be enhanced with ML classification for ambiguous content.

### Extractor Agent

Responsible for fetching and parsing content from URLs.

**Capabilities by Content Type:**

| Content Type | Extraction Method |
|--------------|-------------------|
| Articles | HTTP fetch + Readability algorithm for clean text extraction |
| YouTube | YouTube Data API for metadata, transcripts via youtube-transcript-api |
| Twitter/X | Twitter API or embedded tweet data |
| Instagram | Instagram oEmbed API for public posts |
| PDFs | pdf-parse library for text extraction |
| Generic | Puppeteer for JavaScript-rendered content |

**Output Schema:**
The Extractor outputs a normalized content object regardless of source:
- `raw_text`: Full extracted text content
- `clean_text`: Cleaned, readable text
- `images`: Array of image URLs
- `metadata`: Source-specific metadata
- `extraction_confidence`: Score indicating extraction quality

### Analyzer Agent

The AI-powered brain that generates summaries and key points.

**Implementation:**
Uses OpenAI's GPT-4 (or GPT-3.5-turbo for cost optimization) with carefully crafted prompts.

**Summary Generation Prompt Pattern:**

The prompt instructs the LLM to:
1. Read the provided content carefully
2. Generate a 2-4 sentence summary capturing the main idea
3. Extract 3-5 key points as bullet items
4. Identify the content type and any notable entities
5. Maintain objectivity and avoid editorializing

**Context Window Management:**
For long content, we use a chunking strategy:
1. Split content into overlapping chunks (max 4000 tokens each)
2. Summarize each chunk independently
3. Generate a final summary from chunk summaries

**Caching Strategy:**
Identical URLs are cached—if a URL was processed before (by any user), we can reuse the AI analysis to save costs and time.

### Tagger Agent

Suggests relevant tags based on content analysis.

**Approach:**
The Tagger combines multiple strategies:

1. **Keyword Extraction** — Identifies important terms using TF-IDF or RAKE algorithm
2. **LLM Classification** — Asks the LLM to categorize content into predefined topics
3. **User Tag Matching** — Compares extracted keywords against user's existing tags for consistency

**Tag Suggestion Logic:**
- Suggests 3-5 tags per bookmark
- Prioritizes matching existing user tags over creating new ones
- Uses semantic similarity to find related existing tags
- Respects user's tag vocabulary and naming conventions

**Output:**
Returns an array of suggested tags with confidence scores. Tags above a threshold (e.g., 0.7) are auto-applied; lower-confidence tags are shown as suggestions.

### Embedder Agent

Creates vector embeddings for semantic search.

**Model:**
Uses OpenAI's `text-embedding-ada-002` model, which produces 1536-dimensional vectors.

**Input Preparation:**
Creates a composite text from:
- Title
- Summary (AI-generated)
- Key points
- User notes (if provided)
- Tags

This ensures searches match against the most meaningful content.

**Storage:**
Embeddings are stored in the `embedding` column using pgvector's `VECTOR` type.

### Agent Communication

Agents communicate via the job queue (BullMQ). Each agent:
- Consumes jobs from its dedicated queue
- Processes the job
- Publishes results to a completion queue
- The Orchestrator listens to completion events and coordinates

**Job Payload Structure:**

```
{
  "job_id": "uuid",
  "bookmark_id": "uuid",
  "agent_type": "extractor | analyzer | tagger | embedder",
  "input": {
    // Agent-specific input data
  },
  "attempt": 1,
  "max_attempts": 3,
  "created_at": "ISO timestamp"
}
```

### Error Handling & Retries

**Retry Policy:**
- Transient errors (network issues, rate limits): Retry up to 3 times with exponential backoff
- Permanent errors (invalid URL, blocked content): Mark as failed immediately
- Partial failures: Save whatever data was successfully extracted

**Failure States:**

| Status | Description | User Impact |
|--------|-------------|-------------|
| `processing` | Currently being processed | Shows loading indicator |
| `completed` | All agents succeeded | Full functionality |
| `partial` | Some agents failed | Limited data, retry option |
| `failed` | Critical failure | Basic metadata only |

---

## 7. Content Extraction Pipeline

### Pipeline Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  URL Input  │────►│   Prefetch  │────►│   Extract   │────►│   Clean &   │
│             │     │   Headers   │     │   Content   │     │   Normalize │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    Determine Type      Type-Specific
                    (article/video/     Extraction
                     social/etc.)       Strategy
```

### URL Validation & Prefetch

Before fetching content, we:

1. **Validate URL format** — Ensure it's a well-formed HTTP/HTTPS URL
2. **Check blocklist** — Skip known problematic domains
3. **HEAD request** — Fetch headers to determine Content-Type and size
4. **Rate limiting** — Respect robots.txt and implement per-domain rate limits

### Content Type Detection

**Detection Hierarchy:**

1. **URL Pattern Matching** — Known patterns (youtube.com/watch, twitter.com/*/status)
2. **Content-Type Header** — MIME type from HTTP response
3. **OpenGraph/Meta Tags** — `og:type` and similar metadata
4. **Content Analysis** — Fall back to analyzing actual content

### Extraction Strategies

**Articles (HTML):**
Uses Mozilla's Readability library (same tech behind Firefox Reader View) to extract the main article content, stripping navigation, ads, and other cruft.

**YouTube Videos:**
Extracts video ID from URL, fetches metadata via YouTube Data API (title, description, duration, thumbnail), and retrieves auto-generated or uploaded transcripts when available.

**Social Media:**
Uses platform oEmbed endpoints where available, falling back to HTML parsing. For Twitter, we can use the Twitter API or parse embedded tweet HTML.

**PDFs:**
Uses pdf-parse for text extraction. For scanned PDFs, we could add OCR capability in future phases.

**JavaScript-Heavy Sites:**
Falls back to Puppeteer/Playwright for sites that require JavaScript rendering. This is resource-intensive, so it's used only when static fetching fails.

### Content Cleaning

After extraction, content goes through normalization:

1. **HTML Sanitization** — Remove scripts, styles, and potentially harmful elements
2. **Text Normalization** — Collapse whitespace, fix encoding issues
3. **Length Limiting** — Truncate extremely long content to stay within AI context limits
4. **Language Detection** — Identify content language for future multilingual support

---

## 8. Search Infrastructure

### Dual Search Strategy

Smart Bookmark implements two complementary search approaches:

**Full-Text Search (PostgreSQL)** — Best for exact keyword matches, specific terms, titles, and domains. Fast and doesn't require AI calls.

**Semantic Search (Vector Similarity)** — Best for conceptual queries, finding related content, and natural language questions. Uses embeddings and requires AI-generated vectors.

### Full-Text Search Implementation

PostgreSQL's full-text search uses `tsvector` and `tsquery` types with GIN indexing.

**Indexed Fields:**
- Title (weight A - highest priority)
- Summary (weight B)
- Key points (weight C)
- Tags (weight B)
- Raw content (weight D - lowest priority)

**Search Features:**
- Stemming (matches "running" when searching "run")
- Ranking by relevance
- Phrase matching
- Boolean operators (AND, OR, NOT)

### Semantic Search Implementation

Semantic search finds conceptually similar content even without keyword overlap.

**Query Flow:**
1. User enters search query
2. Query is converted to embedding using same model as bookmarks
3. pgvector finds nearest neighbors using cosine similarity
4. Results ranked by similarity score

**Index Type:**
Using IVFFlat index for approximate nearest neighbor search. This trades some accuracy for significant speed improvements on large datasets.

**Hybrid Approach:**
For best results, we combine both approaches:
1. Run full-text search for exact matches
2. Run semantic search for conceptual matches
3. Merge results with weighted scoring
4. Deduplicate and rank

### Search Quality Optimizations

**Query Expansion:**
For short queries, we can expand with synonyms or related terms.

**Re-ranking:**
Initial retrieval fetches more results than needed, then a re-ranker (could be a smaller ML model) orders by relevance.

**Personalization:**
Factor in user's click history and time-spent signals to personalize ranking.

---

## 9. Background Job Processing

### Queue Architecture

Using BullMQ (Redis-based) for job queue management.

**Queue Types:**

| Queue | Priority | Purpose |
|-------|----------|---------|
| `bookmark:extract` | High | Content extraction from URLs |
| `bookmark:analyze` | Medium | AI summary and analysis |
| `bookmark:embed` | Low | Embedding generation |
| `maintenance` | Lowest | Cleanup, analytics, etc. |

### Job Lifecycle

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────┐
│ WAITING │───►│ ACTIVE  │───►│COMPLETED│    │   FAILED    │
└─────────┘    └────┬────┘    └─────────┘    └──────▲──────┘
                    │                               │
                    └──────────────────────────────┘
                           (after max retries)
```

**Job States:**
- **waiting**: In queue, not yet picked up
- **active**: Currently being processed by a worker
- **completed**: Successfully finished
- **failed**: Failed after all retry attempts
- **delayed**: Scheduled for future execution (retries)

### Worker Configuration

**Concurrency:**
Workers process multiple jobs concurrently. Typical settings:
- Extraction workers: 10 concurrent jobs
- AI workers: 5 concurrent jobs (API rate limits)
- Embedding workers: 20 concurrent jobs (batching)

**Resource Isolation:**
AI-heavy workers run on separate processes/containers to prevent blocking the API server.

### Progress Tracking

Jobs report progress that clients can observe:

```
{
  "bookmark_id": "uuid",
  "status": "processing",
  "progress": {
    "extraction": "completed",
    "analysis": "in_progress",
    "tagging": "pending",
    "embedding": "pending"
  },
  "updated_at": "ISO timestamp"
}
```

Frontend can poll or subscribe via WebSocket for real-time updates.

---

## 10. Caching Strategy

### Cache Layers

**L1 - Application Memory:**
In-process cache for extremely hot data (e.g., user session data). Uses LRU eviction.

**L2 - Redis:**
Distributed cache for data shared across API instances.

### Cached Data Types

| Data | TTL | Invalidation |
|------|-----|--------------|
| User sessions | 15 min | On logout, password change |
| Bookmark lists | 5 min | On any bookmark change |
| Search results | 10 min | On bookmark changes affecting query |
| Tag lists | 30 min | On tag CRUD |
| AI analysis | 24 hours | Never (content at URL doesn't change) |

### Cache Keys

Key naming convention: `{entity}:{user_id}:{identifier}`

Examples:
- `bookmark:123e4567:list:page1`
- `search:123e4567:query:machine+learning`
- `ai:url:sha256hash` (shared across users)

### Cache Invalidation

**Event-Based Invalidation:**
When a bookmark is created/updated/deleted, we publish an event. Cache listeners invalidate relevant keys.

**TTL-Based Expiration:**
All cached data has a TTL. Even if invalidation fails, stale data expires naturally.

---

## 11. Error Handling & Logging

### Error Classification

| Category | HTTP Code | Retry | Example |
|----------|-----------|-------|---------|
| Validation | 400 | No | Invalid URL format |
| Authentication | 401 | No | Expired token |
| Authorization | 403 | No | Accessing another user's data |
| Not Found | 404 | No | Bookmark doesn't exist |
| Rate Limit | 429 | Yes | Too many requests |
| Server Error | 500 | Yes | Database connection failed |
| External Service | 502 | Yes | OpenAI API timeout |

### Error Response Format

All error responses follow a consistent structure:

```
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {
      // Field-specific errors for validation
      "url": "Invalid URL format"
    },
    "request_id": "uuid for tracing"
  }
}
```

### Logging Strategy

**Log Levels:**
- ERROR: Failures requiring attention
- WARN: Unusual conditions that might indicate problems
- INFO: Normal operations (request/response, job completion)
- DEBUG: Detailed information for development

**Structured Logging:**
All logs are JSON-formatted for easy parsing by log aggregation tools.

**Key Fields:**
- `timestamp`: ISO 8601 format
- `level`: Log level
- `request_id`: Correlation ID
- `user_id`: If authenticated
- `action`: What operation was performed
- `duration_ms`: For performance tracking

### Monitoring & Alerting

**Key Metrics:**
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Job queue depth and processing time
- AI API usage and costs
- Cache hit/miss ratio

---

## 12. Deployment & Infrastructure

### Deployment Architecture

**Recommended Stack:**

| Component | Service | Why |
|-----------|---------|-----|
| API Server | Railway / Render / AWS ECS | Easy deployment, auto-scaling |
| PostgreSQL | Supabase / Neon / RDS | Managed, with pgvector support |
| Redis | Upstash / ElastiCache | Serverless option available |
| Workers | Separate containers | Scale independently |
| CDN | Cloudflare | Caching, DDoS protection |

### Environment Separation

**Development:**
- Local PostgreSQL and Redis (Docker)
- Mock AI responses to save costs
- Hot reloading enabled

**Staging:**
- Mirrors production setup
- Uses production AI APIs with lower limits
- Seed data for testing

**Production:**
- Multi-region for availability
- Auto-scaling based on load
- Comprehensive monitoring

### CI/CD Pipeline

1. **Push to main** triggers pipeline
2. **Lint & Type Check** — ESLint, TypeScript
3. **Unit Tests** — Jest
4. **Integration Tests** — Database, API
5. **Build** — Create production artifacts
6. **Deploy to Staging** — Automatic
7. **Smoke Tests** — Verify critical paths
8. **Deploy to Production** — Manual approval or automatic

### Scaling Considerations

**Horizontal Scaling:**
- API servers: Stateless, scale based on request volume
- Workers: Scale based on queue depth
- Database: Read replicas for search queries

**Vertical Scaling:**
- AI workers may need more memory for large documents
- Database benefits from more CPU for complex queries

---

## 13. Environment Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment name | production |
| `PORT` | API server port | 3001 |
| `DATABASE_URL` | PostgreSQL connection string | postgresql://... |
| `REDIS_URL` | Redis connection string | redis://... |
| `JWT_SECRET` | Secret for signing tokens | (random 256-bit) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | (random 256-bit) |
| `OPENAI_API_KEY` | OpenAI API key | sk-... |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | ...apps.googleusercontent.com |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | GOCSPX-... |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level | info |
| `RATE_LIMIT_WINDOW` | Rate limit window (ms) | 60000 |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |
| `AI_MODEL` | OpenAI model for analysis | gpt-3.5-turbo |
| `EMBEDDING_MODEL` | Model for embeddings | text-embedding-ada-002 |
| `WORKER_CONCURRENCY` | Jobs per worker | 10 |

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **Agent** | Specialized processing component with single responsibility |
| **Embedding** | Vector representation of text for semantic similarity |
| **Orchestrator** | Coordinator that manages agent workflow |
| **pgvector** | PostgreSQL extension for vector operations |
| **Semantic Search** | Finding content by meaning rather than keywords |
| **tsvector** | PostgreSQL type for full-text search |

### API Rate Limits

| Tier | Requests/minute | AI Operations/day |
|------|-----------------|-------------------|
| Free | 60 | 50 |
| Pro | 300 | 500 |
| Team | 1000 | Unlimited |

### External API Dependencies

| Service | Purpose | Fallback |
|---------|---------|----------|
| OpenAI | Summary, tagging, embeddings | Queue for retry |
| YouTube Data API | Video metadata | Basic URL parsing |
| Twitter API | Tweet data | oEmbed fallback |

### Database Migrations

Migrations use a tool like Prisma Migrate or node-pg-migrate. Key principles:
- Always write reversible migrations
- Test migrations on staging before production
- Back up database before major schema changes

### Security Checklist

- [ ] All passwords hashed with bcrypt
- [ ] JWT secrets are strong and rotated periodically
- [ ] SQL queries use parameterized statements
- [ ] Input validation on all endpoints
- [ ] Rate limiting enabled
- [ ] CORS configured for frontend origin only
- [ ] Sensitive data encrypted at rest
- [ ] HTTPS enforced in production
- [ ] Dependencies regularly updated
- [ ] Security headers set (HSTS, CSP, etc.)

---

*Document Version: 1.0 (Phase 1)*  
*Last Updated: November 2024*  
*Author: Backend Team*