# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Bookmark is an AI-powered universal content capture and organization application. Users can save any digital content (articles, videos, social media posts, PDFs) by pasting URLs, and the app automatically extracts metadata, generates summaries, assigns tags, and enables semantic search.

**Current Status:** This is a greenfield project with comprehensive documentation but no implementation yet. Phase 1 (MVP) focuses on web-first deployment.

## Architecture

### High-Level System Design

The application follows a three-tier architecture:

1. **Frontend (Next.js 14)** — Apple Notes-inspired two-panel interface with inline editing and auto-save
2. **Backend (Node.js/Express/Fastify)** — RESTful API with agentic AI processing pipeline
3. **Data Layer** — PostgreSQL with pgvector extension for embeddings, Redis for caching/job queue

### Key Architectural Patterns

**Agentic Processing Framework:** The backend uses specialized "agents" that work independently:
- **Orchestrator Agent** — Coordinates the processing pipeline
- **Extractor Agent** — Fetches and parses content from URLs (supports articles, YouTube, Twitter, PDFs, etc.)
- **Analyzer Agent** — Uses GPT-4/3.5 to generate summaries and key points
- **Tagger Agent** — Suggests relevant tags using LLM + keyword extraction
- **Embedder Agent** — Creates vector embeddings for semantic search

**Asynchronous Processing:** Bookmark creation returns immediately; heavy AI processing happens in background via BullMQ job queue.

**Dual Search Strategy:**
- PostgreSQL full-text search for keyword matching
- pgvector semantic search for conceptual queries
- Hybrid approach merges both with weighted ranking

## Tech Stack

### Frontend
- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS (minimal, Apple Notes aesthetic)
- **State Management:**
  - React Query (@tanstack/react-query) for server state
  - Zustand for UI state (selected bookmark)
  - Local state for forms with auto-save
- **Authentication:** NextAuth.js with JWT sessions

### Backend
- **Runtime:** Node.js
- **Framework:** Express or Fastify
- **Database:** PostgreSQL 14+ with pgvector extension
- **Cache/Queue:** Redis + BullMQ
- **AI Services:** OpenAI API (GPT-4/3.5-turbo, text-embedding-ada-002)
- **Authentication:** JWT with bcrypt for password hashing

### Key Libraries
- **Frontend:** framer-motion, react-hook-form, zod, date-fns, lucide-react
- **Backend:** Readability (content extraction), youtube-transcript-api, pdf-parse

## Project Structure

The project is not yet initialized. Expected structure:

```
smart_bookmarks_v2/
├── docs/                    # Comprehensive product & technical docs (already present)
├── frontend/                # Next.js application (to be created)
│   └── src/
│       ├── app/            # Next.js App Router pages
│       ├── components/     # React components (ui/, bookmarks/, search/, tags/)
│       ├── hooks/          # Custom React hooks (useAutoSave, useEnrich, etc.)
│       ├── lib/            # API client, utilities, validators
│       └── store/          # Zustand stores
├── backend/                # Node.js API server (to be created)
│   └── src/
│       ├── routes/         # API route handlers
│       ├── services/       # Business logic services
│       ├── agents/         # Agentic processing (orchestrator, extractor, analyzer, etc.)
│       ├── db/             # Database migrations, models
│       └── workers/        # BullMQ background job processors
└── .env.example            # Environment variables template
```

## Database Schema (Key Tables)

### users
- `id` (UUID), `email`, `password_hash`, `google_id`, `created_at`, `updated_at`

### bookmarks
- `id` (UUID), `user_id` (FK), `url`, `title`, `domain`, `summary`, `content_type`
- `metadata` (JSONB) — Flexible type-specific data
- `embedding` (VECTOR(1536)) — For semantic search
- `search_vector` (TSVECTOR) — For full-text search
- `status` — pending | processing | completed | failed
- `created_at`, `updated_at`, `processed_at`

### tags
- `id` (UUID), `user_id` (FK), `name`, `normalized_name`, `color`, `created_at`

### bookmark_tags (junction table)
- `bookmark_id` (FK), `tag_id` (FK), `auto_generated` (boolean)

**Critical Indexes:**
- GIN index on `search_vector` for full-text search
- IVFFlat/HNSW index on `embedding` for vector similarity
- Composite index on `(user_id, created_at DESC)` for bookmark lists

## API Design

All endpoints under `/api/v1/` with RESTful conventions.

### Authentication
- `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`
- `GET /auth/me`
- `POST /auth/google` (OAuth)

### Bookmarks
- `GET /bookmarks` — List with filters (query params: `q`, `type`, `tags`, `status`, `cursor`, `limit`)
- `GET /bookmarks/:id`
- `POST /bookmarks` — Create (empty body `{}` creates blank bookmark)
- `PATCH /bookmarks/:id` — Update (partial fields)
- `DELETE /bookmarks/:id`
- `POST /bookmarks/:id/enrich` — AI-powered metadata extraction

### Tags
- `GET /tags`, `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id`

### Search
- `GET /search?q=<query>&mode=keyword|semantic`

**Response Format:** Consistent envelope with `data` for success, `error` for failures.

## Frontend UI Philosophy

**Design Inspiration:** Apple Notes — minimal, native-feeling, distraction-free.

**Key Principles:**
- **Two-panel layout:** Sidebar (1/5 width) with search + list, Note editor (4/5 width)
- **Inline editing:** No separate view/edit modes; click to edit any field directly
- **Auto-save:** Changes persist automatically after 500ms debounce
- **Minimal aesthetic:** White background, black text, subtle gray borders only
- **System fonts:** `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`

**Color Palette:**
- Background: `#FFFFFF`
- Text Primary: `#000000`
- Text Secondary: `#86868B`
- Border: `#E5E5E5`
- Accent: `#007AFF` (for interactive elements)

**Core Components:**
- `TwoPanel` — Root layout wrapper
- `Sidebar` — Search input + BookmarkList
- `NoteEditor` — Shows BookmarkNote for selected item
- `BookmarkNote` — Editable fields (title, link, source, tags, summary)
- `EnrichButton` — Triggers AI metadata extraction (sparkles icon)
- `AutoSaveIndicator` — Shows "Saving..." → "Saved" feedback

### UI Component Library

**Use shadcn/ui for all base UI components.** shadcn/ui provides accessible, customizable components that align perfectly with our minimal design aesthetic.

**Installation & Usage:**
- Install shadcn/ui: `npx shadcn-ui@latest init`
- Add components as needed: `npx shadcn-ui@latest add <component>`
- Components are copied into `src/components/ui/` and fully customizable
- All components are built on Radix UI primitives (accessible by default)

**Recommended shadcn/ui Components:**
- `Input` — Text inputs with variants for search, URLs, etc.
- `Button` — Minimal button styles (use "ghost" variant for icon buttons)
- `Badge` — For tags display
- `Separator` — For subtle dividers between sections
- `Textarea` — For multi-line summary/notes field
- `Popover` — For context menus and tag suggestions
- `Command` — For search with keyboard navigation (⌘K)
- `ScrollArea` — For bookmark list scrolling
- `Toast` — For save confirmations and error messages

**Customization Guidelines:**
- Modify `tailwind.config.ts` to use our minimal color palette
- Override default styles to match Apple Notes aesthetic
- Remove heavy shadows and rounded corners (use subtle borders instead)
- Keep animations minimal (100-200ms transitions only)

## Development Commands

This project is not yet initialized. Once setup is complete, expected commands:

### Frontend
- `npm run dev` — Start Next.js dev server (port 3000)
- `npm run build` — Production build
- `npm run lint` — Run ESLint
- `npm test` — Run Jest tests

### Backend
- `npm run dev` — Start API server with hot reload (port 3001)
- `npm run migrate` — Run database migrations
- `npm run worker` — Start BullMQ background workers
- `npm test` — Run tests

### Database
- PostgreSQL must have `pgvector` extension installed
- Migrations use Prisma Migrate or node-pg-migrate

## Environment Variables

### Frontend
- `NEXT_PUBLIC_APP_URL` — Frontend URL
- `NEXT_PUBLIC_API_URL` — Backend API URL
- `NEXTAUTH_URL` — Auth callback URL
- `NEXTAUTH_SECRET` — JWT encryption secret
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth credentials

### Backend
- `NODE_ENV` — production | development
- `PORT` — API server port (default: 3001)
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — Token signing secrets
- `OPENAI_API_KEY` — OpenAI API key
- `AI_MODEL` — GPT model to use (default: gpt-3.5-turbo)
- `EMBEDDING_MODEL` — Embedding model (default: text-embedding-ada-002)

## Critical Implementation Details

### Auto-Save Flow (Frontend)
1. User edits field → Local state updates immediately
2. Debounce timer starts (500ms)
3. After debounce → Trigger React Query mutation
4. Send `PATCH /bookmarks/:id` with changed fields only
5. Show "Saving..." → "Saved" indicator
6. On error: Show error, keep local changes, allow retry

### AI Enrichment Flow
1. User pastes URL → "Enrich" button appears
2. Click enrich → `POST /bookmarks/:id/enrich`
3. Backend: Orchestrator dispatches to Extractor Agent
4. Extractor fetches URL, parses content (Readability for articles, YouTube API for videos, etc.)
5. Analyzer Agent generates summary + key points via GPT
6. Tagger Agent suggests tags
7. Embedder Agent creates vector embedding
8. Response returns enriched metadata
9. Frontend merges into form, triggers auto-save

### Content Extraction Strategy
- **Articles:** Readability library (same as Firefox Reader View)
- **YouTube:** YouTube Data API + youtube-transcript-api
- **Twitter:** Twitter API or oEmbed fallback
- **PDFs:** pdf-parse for text extraction
- **JavaScript-heavy sites:** Puppeteer/Playwright fallback

### Caching Strategy
- **User sessions:** Redis, 15min TTL
- **Bookmark lists:** Redis, 5min TTL, invalidate on CRUD
- **AI analysis:** Redis, 24hr TTL (content at URL rarely changes)
- **Search results:** Redis, 10min TTL

### Error Handling
- **Validation errors:** HTTP 400, detailed field errors
- **Auth errors:** HTTP 401/403
- **Server errors:** HTTP 500, retry with exponential backoff
- **AI failures:** Save bookmark anyway with partial data (graceful degradation)

## Important Constraints & Guidelines

1. **No Implementation Yet:** This is a documentation-only repository. All code must be created from scratch following the documented architecture.

2. **Phase 1 Scope:** Focus on MVP features only:
   - URL paste capture (primary method)
   - Basic AI processing (summary, tags)
   - Two-panel web UI with auto-save
   - Semantic + keyword search
   - User authentication
   - Browser extension is secondary (optional for Phase 1)

3. **AI Cost Optimization:**
   - Cache AI analysis results by URL hash
   - Use GPT-3.5-turbo by default (GPT-4 only for complex content)
   - Batch embedding generation when possible

4. **Security Requirements:**
   - All passwords hashed with bcrypt (work factor 12)
   - JWT secrets must be strong (256-bit random)
   - SQL parameterized statements only (prevent injection)
   - Input validation on all endpoints (use Zod schemas)
   - Rate limiting enabled (60 req/min default)

5. **Performance Targets:**
   - Bookmark creation response < 200ms (before AI processing)
   - Search results < 500ms
   - Auto-save debounce: 500ms
   - AI processing completes within 5-10 seconds

6. **Testing Strategy:**
   - Unit tests for utilities, hooks, validators
   - Integration tests for API endpoints with mocked AI
   - Component tests with React Testing Library
   - E2E tests for critical user flows (future)

## Key Design Decisions

### Why Next.js App Router?
- Server Components reduce client bundle size
- Streaming for faster perceived performance
- Built-in API routes can serve as BFF (Backend for Frontend)
- Vercel deployment is zero-config

### Why Agentic Architecture?
- Each agent has single responsibility (testable, maintainable)
- Agents can fail independently (resilience)
- Easy to add new processing capabilities (extensibility)
- Different agents scale independently

### Why pgvector Instead of Dedicated Vector DB?
- Simpler architecture (one database instead of two)
- PostgreSQL already handles relational data
- pgvector performance sufficient for Phase 1 scale
- Can migrate to Pinecone/Weaviate later if needed

### Why Auto-Save Instead of Manual Save?
- Reduces user friction (one less action)
- Feels more native (like Apple Notes)
- Prevents data loss from forgotten saves
- Aligns with "effortless organization" product vision

## Common Pitfalls to Avoid

1. **Don't implement full content display in Phase 1** — Focus on summary view only; full reader mode is Phase 4
2. **Don't over-engineer the AI pipeline** — Start with simple prompts; optimize later based on quality metrics
3. **Don't forget rate limiting** — Both on API endpoints and OpenAI calls
4. **Don't store large content in database** — Store extracted text only; original HTML/video is fetched on-demand
5. **Don't block the main thread** — All heavy processing (AI calls, content extraction) must be async in workers

## References

All detailed documentation is in the `docs/` directory. Refer to these documents for comprehensive specifications:

- **[Product Requirements (APP_PRD.MD)](docs/APP_PRD.MD)** — Complete product vision, user personas, jobs-to-be-done, user stories, customer journey maps, detailed user flows, and competitive analysis
- **[Backend Documentation (Backend_documentation.MD)](docs/Backend_documentation.MD)** — In-depth backend architecture including the agentic processing framework, API endpoints, database schema with indexes, authentication strategy, content extraction pipeline, search infrastructure, job queue system, caching strategy, error handling, and deployment considerations
- **[Frontend Documentation (Frontend_documentation.MD)](docs/Frontend_documentation.MD)** — Comprehensive frontend specifications including Next.js architecture, component library, design system (colors, typography, spacing), state management patterns, API integration, authentication flow, performance optimization, and testing strategy
- **[Roadmap to MVP (Roadmap_to_MVP.MD)](docs/Roadmap_to_MVP.MD)** — Implementation roadmap with phases and milestones

**When to consult each document:**
- Need to understand **what** to build and **why**? → Read APP_PRD.MD
- Implementing **backend** features or APIs? → Read Backend_documentation.MD
- Building **UI components** or frontend features? → Read Frontend_documentation.MD
- Planning **implementation order** or timeline? → Read Roadmap_to_MVP.MD

When in doubt about any implementation detail, these documents are the source of truth.
