# Smart Bookmark App — Product Requirements Document

## Executive Summary

Smart Bookmark is a web-first universal content capture and organization app that allows users to save, process, and retrieve any type of digital content—articles, webpages, videos, social media posts, and more. The app uses AI to automatically extract metadata, generate summaries, assign tags, and enable semantic search across all saved content.

**Platform Strategy:** Web application first, with mobile apps to follow once core functionality is validated.

---

## Problem Statement

Users consume content across dozens of platforms daily—news articles, YouTube videos, Instagram posts, tweets, podcasts, PDFs, and more. Current solutions force users to:

- Maintain separate bookmark systems per browser/platform
- Manually organize and tag saved content
- Lose context of why something was saved
- Struggle to find saved content later
- Re-read/re-watch content to remember what it was about

There's no unified system that captures everything, understands the content, and makes it instantly retrievable.

---

## Product Vision

**One place to save anything. Instant recall of everything.**

Smart Bookmark becomes the user's external memory for all digital content—automatically processing, understanding, and organizing everything they find valuable.

---

## Target Users

### Primary Persona: The Knowledge Worker
- Researchers, writers, analysts, students
- Saves 10-50 pieces of content weekly
- Needs to reference saved content for work
- Values organization but lacks time to maintain it

### Secondary Persona: The Curious Explorer
- Lifelong learners, hobbyists
- Saves interesting content across many topics
- Wants to build a personal knowledge library
- Struggles to find things saved months ago

### Tertiary Persona: The Content Creator
- Writers, marketers, designers
- Saves inspiration and reference material
- Needs to quickly pull relevant examples
- Values visual organization and mood boards

---

## Jobs To Be Done (JTBD)

### Primary Jobs

#### Job 1: Capture Without Friction
> **When** I come across interesting content online,
> **I want to** save it instantly without interrupting my flow,
> **So that** I don't lose valuable information and can return to it later.

**Success criteria:**
- Save any content in under 3 seconds
- No manual data entry required
- Works regardless of content source or type

#### Job 2: Understand Without Re-consuming
> **When** I need to recall what a saved piece of content was about,
> **I want to** see a quick summary and key points,
> **So that** I don't have to re-read or re-watch the entire thing.

**Success criteria:**
- AI-generated summary available for every saved item
- Key points extracted and scannable
- Context preserved (why was this valuable?)

#### Job 3: Find Anything Instantly
> **When** I vaguely remember saving something relevant,
> **I want to** describe what I'm looking for in plain language,
> **So that** I can find it without remembering exact titles or where I saved it.

**Success criteria:**
- Natural language search works
- Results ranked by relevance, not just recency
- Search across all content types simultaneously

#### Job 4: Stay Organized Effortlessly
> **When** my saved content library grows,
> **I want** the system to organize things automatically,
> **So that** I don't spend time manually sorting and tagging.

**Success criteria:**
- Auto-generated tags are accurate and useful
- Related content is grouped together
- Manual organization optional, not required

### Secondary Jobs

#### Job 5: Build a Personal Knowledge Base
> **When** I'm researching a topic over time,
> **I want to** see all my saved content on that subject connected,
> **So that** I can build deep understanding and make new connections.

#### Job 6: Never Lose Important Content
> **When** online content disappears or changes,
> **I want** my saved version preserved,
> **So that** I always have access to what I found valuable.

#### Job 7: Share Curated Collections
> **When** I've gathered valuable resources on a topic,
> **I want to** share them as a collection with others,
> **So that** I can help others and showcase my curation.

---

## User Stories

### Epic 1: Content Capture

| ID | User Story | Priority |
|----|------------|----------|
| US-1.1 | As a user, I want to paste a URL into the web app so that I can save any content I find | P0 |
| US-1.2 | As a user, I want to save content via browser extension with one click so that I don't leave my current page | P1 |
| US-1.3 | As a user, I want to add a personal note when saving so that I remember why I saved it | P1 |
| US-1.4 | As a user, I want to save content from mobile share sheets so that I can capture on the go | P2 (Future) |
| US-1.5 | As a user, I want to import my existing bookmarks from browsers/other apps so that I don't start from zero | P2 |

### Epic 2: AI Processing

| ID | User Story | Priority |
|----|------------|----------|
| US-2.1 | As a user, I want automatic summaries generated for every saved item so that I can quickly recall content | P0 |
| US-2.2 | As a user, I want automatic tags assigned to my content so that organization happens without effort | P0 |
| US-2.3 | As a user, I want key points extracted from articles so that I can scan the main ideas | P1 |
| US-2.4 | As a user, I want video/audio content transcribed so that I can search spoken content | P2 |
| US-2.5 | As a user, I want entities (people, companies, places) extracted so that I can filter by them | P2 |

### Epic 3: Organization

| ID | User Story | Priority |
|----|------------|----------|
| US-3.1 | As a user, I want to create collections to group related bookmarks so that I can organize by project or topic | P0 |
| US-3.2 | As a user, I want to add/edit tags manually so that I can customize organization | P1 |
| US-3.3 | As a user, I want to favorite items so that I can quickly access important content | P1 |
| US-3.4 | As a user, I want to archive items so that I can hide without deleting | P1 |
| US-3.5 | As a user, I want smart collections that auto-populate based on rules so that organization is automated | P2 |

### Epic 4: Search & Retrieval

| ID | User Story | Priority |
|----|------------|----------|
| US-4.1 | As a user, I want to search using natural language so that I can find content by describing it | P0 |
| US-4.2 | As a user, I want to filter by content type, date, tags, and collections so that I can narrow results | P0 |
| US-4.3 | As a user, I want to see recent saves quickly so that I can access what I just saved | P0 |
| US-4.4 | As a user, I want to see related items when viewing a bookmark so that I can discover connections | P2 |

### Epic 5: Content Display (V1)

| ID | User Story | Priority |
|----|------------|----------|
| US-5.1 | As a user, I want to see the AI summary prominently when viewing a saved item so that I get instant context | P0 |
| US-5.2 | As a user, I want to click through to the original source so that I can access full content when needed | P0 |
| US-5.3 | As a user, I want to see a thumbnail/preview so that I can visually recognize content | P1 |

---

## Customer Journey Map (CJM)

### Journey 1: First-Time User — Discovery to First Save

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE        │ AWARENESS      │ CONSIDERATION  │ ONBOARDING     │ FIRST USE│
├─────────────────────────────────────────────────────────────────────────────┤
│               │                │                │                │          │
│  USER ACTIONS │ • Sees ad/     │ • Visits       │ • Signs up     │ • Pastes │
│               │   recommendation│   landing page │ • (Optional)   │   first  │
│               │ • Searches for │ • Reads        │   installs     │   URL    │
│               │   bookmark app │   features     │   extension    │ • Sees   │
│               │                │ • Compares     │ • Watches      │   result │
│               │                │   alternatives │   quick tour   │          │
│               │                │                │                │          │
├─────────────────────────────────────────────────────────────────────────────┤
│               │                │                │                │          │
│  THINKING     │ "I keep losing │ "This looks    │ "Hope this is  │ "Wow, it │
│               │  things I save"│  promising"    │  quick to set  │  actually│
│               │ "There must be │ "Will it       │  up"           │  summarized│
│               │  a better way" │  actually work │                │  it!"    │
│               │                │  for my use?"  │                │          │
│               │                │                │                │          │
├─────────────────────────────────────────────────────────────────────────────┤
│               │                │                │                │          │
│  FEELING      │ Frustrated     │ Hopeful but    │ Slightly       │ Delighted│
│               │ Overwhelmed    │ skeptical      │ anxious        │ Surprised│
│               │                │                │                │          │
├─────────────────────────────────────────────────────────────────────────────┤
│               │                │                │                │          │
│  TOUCHPOINTS  │ • Social media │ • Landing page │ • Sign-up flow │ • Web app│
│               │ • Word of mouth│ • Demo video   │ • Extension    │          │
│               │ • Search       │ • Pricing page │   install page │          │
│               │                │                │ • Welcome email│          │
│               │                │                │                │          │
├─────────────────────────────────────────────────────────────────────────────┤
│               │                │                │                │          │
│  PAIN POINTS  │ • Doesn't know │ • Hard to      │ • Too many     │ • Unclear│
│               │   solution     │   evaluate     │   steps        │   what   │
│               │   exists       │   without      │ • Extension    │   to do  │
│               │                │   trying       │   permissions  │   next   │
│               │                │                │   feel invasive│          │
│               │                │                │                │          │
├─────────────────────────────────────────────────────────────────────────────┤
│               │                │                │                │          │
│  OPPORTUNITIES│ • Clear value  │ • Interactive  │ • One-click    │ • Guided │
│               │   proposition  │   demo         │   setup        │   first  │
│               │ • Social proof │ • Free tier    │ • URL paste as │   save   │
│               │                │   removes risk │   primary (no  │ • Instant│
│               │                │                │   extension    │   value  │
│               │                │                │   required)    │          │
│               │                │                │                │          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Journey 2: Active User — Daily Usage Flow

```
MORNING RESEARCH SESSION
─────────────────────────────────────────────────────────────────

[Reading Article] ──► [Finds valuable insight] ──► [Copies URL]
                                                         │
                                                         ▼
                                              [Opens Smart Bookmark]
                                                         │
                                                         ▼
                                              [Pastes URL, Enter]
                                                         │
                                                         ▼
                                              [Sees confirmation + summary]
                                                         │
                                                         ▼
                                              [Back to browsing]
                                                    (5 seconds total)


AFTERNOON WORK SESSION  
─────────────────────────────────────────────────────────────────

[Need that article about X] ──► [Opens Smart Bookmark]
                                        │
                                        ▼
                               [Types: "that article about 
                                AI productivity tools"]
                                        │
                                        ▼
                               [Results appear instantly]
                                        │
                                        ▼
                               [Reads AI summary] ──► [Got what I needed]
                                        │                    │
                                        │                    ▼
                                        │              [Back to work]
                                        ▼
                               [Clicks to original]
                                        │
                                        ▼
                               [Deep dive if needed]
```

### Journey 3: Power User — Building Knowledge Base

```
Week 1                    Week 4                    Week 12
─────────                 ─────────                 ──────────
                                                    
Save 15 items    ──►     Save 60 items     ──►    Save 200+ items
Random topics            Patterns emerge           Rich knowledge base
                                                   
     │                        │                         │
     ▼                        ▼                         ▼
                                                   
[Explore app]            [Create first            [Rely on search]
[Try features]            collections]            [Share collections]
                         [Refine tags]            [Daily workflow]
                                                   
     │                        │                         │
     ▼                        ▼                         ▼
                                                   
FEELING:                 FEELING:                 FEELING:
Curious                  Invested                 Dependent
Experimenting            Organizing               Advocating


KEY RETENTION MOMENTS:
• First successful search for something saved weeks ago
• First time AI summary saved them from re-reading
• First collection that felt genuinely useful
• First time sharing a collection with someone
```

---

## Detailed User Flows

### Flow 1: Save via URL Paste (Primary V1 Method)

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEB APP                                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  + New Bookmark                                          │   │
│  │                                                          │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ Paste URL here...                              [→] │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User pastes URL
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PROCESSING STATE                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │   🔄 Processing...                                       │   │
│  │                                                          │   │
│  │   [████████████░░░░░░░░] Extracting content              │   │
│  │                                                          │   │
│  │   URL: https://example.com/article-title                 │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 2-5 seconds
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUCCESS STATE                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ✓ Saved!                                                │   │
│  │                                                          │   │
│  │  ┌────────┐  The Future of AI in Productivity           │   │
│  │  │  IMG   │  techblog.com • 8 min read                   │   │
│  │  └────────┘                                              │   │
│  │                                                          │   │
│  │  Summary:                                                │   │
│  │  This article explores how AI tools are transforming     │   │
│  │  workplace productivity, focusing on automation of       │   │
│  │  repetitive tasks and intelligent assistance...          │   │
│  │                                                          │   │
│  │  Tags: [AI] [productivity] [future-of-work]              │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ Add a note... (optional)                         │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  Collection: [None ▾]     [Save Another] [View Item]     │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: Save via Browser Extension (Secondary)

```
USER IS ON ANY WEBPAGE
─────────────────────────────────────────────────────────────────

     ┌──────────────────────────────────────────┐
     │  Article: "10 Tips for Better Sleep"     │
     │  ─────────────────────────────────────   │
     │  Sleep is essential for health...        │
     │                                          │
     │                                          │
     └──────────────────────────────────────────┘
                                          
                    User clicks extension icon
                              │
                              ▼
     ┌──────────────────────────────────────────┐
     │  ┌──────────────────────────────────┐    │
     │  │ 📑 Smart Bookmark                │    │
     │  │                                  │    │
     │  │ Save this page?                  │    │
     │  │                                  │    │
     │  │ "10 Tips for Better Sleep"       │    │
     │  │  healthmag.com                   │    │
     │  │                                  │    │
     │  │ Note: __________________________ │    │
     │  │                                  │    │
     │  │ Collection: [Select... ▾]        │    │
     │  │                                  │    │
     │  │        [Cancel]  [💾 Save]       │    │
     │  └──────────────────────────────────┘    │
     │                                          │
     └──────────────────────────────────────────┘
                              │
                    User clicks Save
                              │
                              ▼
     ┌──────────────────────────────────────────┐
     │  ┌──────────────────────────────────┐    │
     │  │ ✓ Saved!                         │    │
     │  │                                  │    │
     │  │ Processing in background...      │    │
     │  │                                  │    │
     │  │ [View in App]                    │    │
     │  └──────────────────────────────────┘    │
     │                                          │
     │  (auto-closes in 2 seconds)              │
     └──────────────────────────────────────────┘
```

### Flow 3: Search and Retrieve

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SMART BOOKMARK                                              [User ▾]      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 🔍 that article about sleep tips from last week                    ⌘K │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Filters: [All Types ▾] [Any Date ▾] [All Tags ▾] [All Collections ▾]      │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  3 results                                                    Sort: [Best] │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ┌────────┐                                                          │   │
│  │ │  IMG   │  10 Tips for Better Sleep                    ★           │   │
│  │ │        │  healthmag.com • Saved Nov 22                            │   │
│  │ └────────┘                                                          │   │
│  │                                                                     │   │
│  │  Summary: Expert-backed strategies for improving sleep quality,     │   │
│  │  including maintaining consistent schedules, optimizing bedroom     │   │
│  │  environment, and managing screen time before bed.                  │   │
│  │                                                                     │   │
│  │  [sleep] [health] [wellness]                                        │   │
│  │                                                                     │   │
│  │  Your note: "Try the 4-7-8 breathing technique"                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ┌────────┐                                                          │   │
│  │ │  IMG   │  The Science of Sleep Cycles                             │   │
│  │ │        │  sciencedaily.com • Saved Nov 18                         │   │
│  │ └────────┘                                                          │   │
│  │                                                                     │   │
│  │  Summary: Research explains the four stages of sleep and why        │   │
│  │  completing full 90-minute cycles matters for feeling rested...     │   │
│  │                                                                     │   │
│  │  [sleep] [science] [research]                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 4: View Saved Item (V1 — Summary Focus)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                    [⋯] [★] [↗]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │                         [THUMBNAIL IMAGE]                           │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  10 Tips for Better Sleep                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  healthmag.com • Dr. Sarah Johnson • Nov 15, 2024 • 8 min read              │
│                                                                             │
│  [View Original Article →]                                                  │
│                                                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                             │
│  📝 AI SUMMARY                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  This comprehensive guide presents evidence-based strategies for           │
│  improving sleep quality. The article emphasizes the importance of         │
│  consistent sleep schedules, optimal bedroom conditions (cool, dark,       │
│  quiet), and limiting screen exposure before bed. It also covers           │
│  dietary considerations, exercise timing, and relaxation techniques        │
│  like the 4-7-8 breathing method.                                          │
│                                                                             │
│  KEY POINTS:                                                                │
│  • Maintain the same sleep/wake time, even on weekends                     │
│  • Keep bedroom temperature between 65-68°F (18-20°C)                      │
│  • Stop screen use 1 hour before bed                                       │
│  • Avoid caffeine after 2pm                                                │
│  • Exercise regularly, but not within 3 hours of bedtime                   │
│                                                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                             │
│  🏷️ TAGS                                                                   │
│  [sleep] [health] [wellness] [self-improvement]  [+ Add tag]               │
│                                                                             │
│  📁 COLLECTIONS                                                            │
│  [Health & Fitness]  [+ Add to collection]                                 │
│                                                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                             │
│  📌 YOUR NOTE                                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Try the 4-7-8 breathing technique - inhale 4 sec, hold 7, exhale 8       │
│  [Edit note]                                                               │
│                                                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                             │
│  Saved on Nov 22, 2024 at 3:45 PM                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Features (V1)

### 1. Content Capture

#### 1.1 Supported Content Types
| Content Type | Source Examples | Captured Data |
|--------------|-----------------|---------------|
| Articles | News sites, blogs, Medium | Full text, images, author, date |
| Webpages | Any URL | Title, description, screenshot, key content |
| Videos | YouTube, Vimeo, TikTok | Title, description, thumbnails |
| Social Posts | Instagram, Twitter/X, LinkedIn | Text, images/video, author |
| PDFs | Any source | Full text extraction, images |
| Images | Any source | Image, OCR text, visual description |

#### 1.2 Capture Methods

**Primary: URL Paste in Web App (V1 Focus)**
- Large, prominent input field on main dashboard
- Paste any URL and press Enter/click Save
- Instant feedback with processing indicator
- No browser extension required to get started
- Works on any device with a browser

**Secondary: Browser Extension**
- One-click save from toolbar icon
- Keyboard shortcut (Cmd/Ctrl + Shift + S)
- Minimal popup for optional note/collection
- Chrome extension in V1, other browsers to follow

**Future: Mobile Apps**
- iOS/Android apps with share sheet integration
- Will be developed after web app validation

#### 1.3 Capture Experience
- Instant save with visual confirmation
- Optional: Add personal note at capture time
- Optional: Assign to collection at capture time
- Background processing (user doesn't wait)
- Processing status visible in dashboard

---

### 2. AI-Powered Processing

#### 2.1 Automatic Metadata Extraction
- **Title** — Cleaned and normalized
- **Author/Creator** — When available
- **Publication Date** — When available
- **Source/Domain** — Categorized
- **Content Type** — Article, video, image, etc.
- **Language** — Auto-detected
- **Read/Watch Time** — Estimated duration
- **Thumbnail** — Extracted or generated screenshot

#### 2.2 Content Understanding (V1)
- **Summary Generation**
  - 2-4 sentence overview
  - 3-5 key points as bullet list
- **Auto-Tagging**
  - Topic tags (e.g., "machine learning", "cooking", "travel")
  - Suggests based on user's existing tag vocabulary

---

### 3. Organization System

#### 3.1 Automatic Organization
- **Smart Defaults**
  - "Recent" — Last 7 days
  - "Unread" — Not yet viewed
  - "Favorites" — Starred items
- **Tag Suggestions** — AI recommends tags based on content
- **Duplicate Detection** — Alerts for same URL saved twice

#### 3.2 Manual Organization
- **Collections** — User-created folders
  - Nested collections supported
  - Collection descriptions
- **Tags** — Flexible labeling system
  - Edit auto-assigned tags
  - Create custom tags
  - Tag colors
- **Favorites** — Quick-access starred items
- **Archive** — Hide without deleting

#### 3.3 Views
- **Card View** — Visual thumbnails (default)
- **List View** — Dense, scannable

---

### 4. Search & Retrieval

#### 4.1 Semantic Search
- Natural language queries
- "That article about productivity I saved last month"
- "Videos explaining how to cook pasta"
- "Instagram posts with minimalist design"
- Searches across titles, summaries, tags, notes

#### 4.2 Filters
- Content type
- Date range (saved date)
- Tags
- Collections
- Favorites only
- Has notes

#### 4.3 Quick Access
- Recent saves on dashboard
- Keyboard shortcut to search (Cmd/Ctrl + K)

---

### 5. Content Display (V1)

#### 5.1 Summary View
- AI-generated summary prominently displayed
- Key points as scannable bullets
- Link to original source
- Thumbnail/preview image

#### 5.2 Metadata Display
- Title, source, author, date
- Read/watch time estimate
- Auto-assigned tags (editable)
- User's personal note

#### 5.3 Actions
- Open original URL
- Edit tags/collections
- Add/edit personal note
- Favorite/unfavorite
- Archive
- Delete

---

## Success Metrics

### North Star Metric
**Weekly Active Savers** — Users who save at least one item per week

### Primary Metrics
| Metric | Target (Month 6) |
|--------|------------------|
| Monthly Active Users | 25,000 |
| Weekly Active Savers | 10,000 |
| Saves per active user/week | 8 |
| Search queries per user/week | 5 |
| Processing success rate | >95% |

### User Satisfaction Metrics
- Time to first save < 60 seconds from signup
- Search success rate (found what looking for) > 80%
- AI summary usefulness rating > 4/5
- NPS > 40

---

## Roadmap

### Phase 1: MVP (Months 1-3)
**Goal: Core save and retrieve functionality via web app**

- [ ] Web app with URL paste capture (primary method)
- [ ] Content extraction pipeline
- [ ] AI processing (summary, tags, key points)
- [ ] Semantic search
- [ ] Collections and tags
- [ ] Card and list views
- [ ] User authentication
- [ ] Chrome browser extension (secondary capture)

### Phase 2: Enhanced Intelligence (Months 4-6)
**Goal: Improved AI and broader browser support**

- [ ] Video/audio transcript support
- [ ] Entity extraction
- [ ] Improved auto-tagging (learns from user edits)
- [ ] Smart duplicate detection
- [ ] Safari, Firefox, Edge extensions
- [ ] Import from browsers/Pocket/Raindrop
- [ ] Export functionality

### Phase 3: Mobile & Collaboration (Months 7-9)
**Goal: Cross-platform and sharing**

- [ ] iOS app with share sheet capture
- [ ] Android app with share sheet capture
- [ ] Shared collections (view-only links)
- [ ] Public collection pages
- [ ] Team workspaces (basic)

### Phase 4: Advanced Features (Months 10-12)
**Goal: Power user capabilities**

- [ ] Smart collections (auto-populate by rules)
- [ ] Graph view (relationship visualization)
- [ ] "Related items" suggestions
- [ ] Daily/weekly digest emails
- [ ] API for integrations

### Nice to Have (Future Backlog)
**Reading & Annotation Features**
- [ ] Reader mode (distraction-free reading in-app)
- [ ] Highlights (multiple colors)
- [ ] Inline notes/comments on content
- [ ] Text-to-speech
- [ ] Full content caching (offline access)
- [ ] Content change detection (alert if original changes)
- [ ] Desktop apps (macOS, Windows)

---

## Open Questions

1. **Offline handling** — What happens when user tries to save while offline? Queue for later?
2. **Failed processing** — How do we handle URLs that can't be processed? Show partial info?
3. **Content updates** — If a webpage changes, should we update our saved version?
4. **Duplicate handling** — Auto-merge duplicates or just warn user?
5. **Tag limits** — Should we limit auto-generated tags per item? (Suggest: 3-5)

---

## Competitive Landscape

| Capability | Smart Bookmark | Pocket | Raindrop | Notion Web Clipper |
|------------|---------------|--------|----------|-------------------|
| URL paste capture | ✓ (Primary) | ✓ | ✓ | — |
| Universal capture | ✓ | Partial | ✓ | ✓ |
| AI summaries | ✓ | — | — | — |
| Auto-tagging | ✓ | — | AI-powered | — |
| Semantic search | ✓ | — | — | — |
| Video support | ✓ | — | ✓ | Partial |
| Social media support | ✓ | — | ✓ | Partial |
| Free tier | ✓ | ✓ | ✓ | ✓ |

---

## Glossary

- **Bookmark** — Any saved piece of content
- **Collection** — User-created folder for organizing bookmarks
- **Tag** — Flexible label applied to bookmarks (auto or manual)
- **Summary** — AI-generated overview of saved content
- **Key Points** — Bullet list of main ideas extracted by AI
- **Semantic Search** — Search that understands meaning, not just keywords

---

*Document Version: 1.1*  
*Last Updated: November 2024*  
*Author: Product Team*