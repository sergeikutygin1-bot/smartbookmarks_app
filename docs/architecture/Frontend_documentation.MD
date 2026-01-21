# Smart Bookmark — Frontend Technical Documentation

## Web Application (Phase 1)

**Version:** 1.0  
**Last Updated:** November 2024  
**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Core Technologies](#4-core-technologies)
5. [Design System](#5-design-system)
6. [Component Library](#6-component-library)
7. [Pages & Routing](#7-pages--routing)
8. [State Management](#8-state-management)
9. [API Integration](#9-api-integration)
10. [Authentication](#10-authentication)
11. [Performance Optimization](#11-performance-optimization)
12. [Testing Strategy](#12-testing-strategy)
13. [Deployment](#13-deployment)
14. [Environment Configuration](#14-environment-configuration)

---

## 1. Overview

The Smart Bookmark web application is a streamlined, single-page application built with Next.js 14 using the App Router. Phase 1 focuses on delivering a simple, native-feeling interface inspired by Apple Notes — minimal, distraction-free, and instantly familiar.

### Phase 1 Scope

The initial release provides a clean two-panel layout:

- **Left Panel (Sidebar)**: Search bar at the top, scrollable list of all bookmarks below
- **Right Panel (Note Editor)**: Full bookmark details displayed as an editable note
- **Inline Editing**: No separate "view" and "edit" modes — everything is editable in place
- **Auto-Save**: Changes save automatically as you type, no save button needed

### Key Features (Phase 1)

| Feature | Description |
|---------|-------------|
| Two-Panel Layout | Sidebar (1/5 width) + Note editor (4/5 width) |
| Bookmark List | Minimal list items showing title and date |
| Inline Editing | Click any field to edit directly in the note view |
| Auto-Save | Changes persist automatically, no manual save required |
| Quick Add | "New Bookmark" button creates empty entry instantly |
| AI Enrich | Paste a URL and click enrich to auto-fill metadata |
| Search | Real-time filtering of bookmark list |

### Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NEXT.JS APP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   App Router │  │   Layouts    │  │   Server Components  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    CLIENT LAYER                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │  UI Comps   │  │   Hooks     │  │  State (Zustand)│   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    DATA LAYER                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ React Query │  │  API Client │  │  Local Storage  │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  Backend API  │
                    │    (REST)     │
                    └───────────────┘
```

### Phase 1 Screen Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  ┌──────────────────┐  ┌────────────────────────────────────────────────┐  │
│  │     SIDEBAR      │  │                  NOTE EDITOR                   │  │
│  │      (1/5)       │  │                    (4/5)                       │  │
│  │                  │  │                                                │  │
│  │  ┌────────────┐  │  │  Title                                        │  │
│  │  │ 🔍 Search  │  │  │  ─────────────────────────────────────────    │  │
│  │  └────────────┘  │  │  My Interesting Article                       │  │
│  │                  │  │                                                │  │
│  │  ┌────────────┐  │  │                                                │  │
│  │  │ + New      │  │  │  Link                                         │  │
│  │  └────────────┘  │  │  ─────────────────────────────────────────    │  │
│  │                  │  │  https://example.com/article    [✨ Enrich]   │  │
│  │  ──────────────  │  │                                                │  │
│  │                  │  │                                                │  │
│  │  My Interesting  │  │  Source                                       │  │
│  │  Article         │  │  ─────────────────────────────────────────    │  │
│  │  Dec 6, 2024     │  │  Medium                                       │  │
│  │  ● (selected)    │  │                                                │  │
│  │                  │  │                                                │  │
│  │  ──────────────  │  │  Tags                                         │  │
│  │                  │  │  ─────────────────────────────────────────    │  │
│  │  Another Note    │  │  [ productivity ] [ reading ] [ + ]           │  │
│  │  Dec 5, 2024     │  │                                                │  │
│  │                  │  │                                                │  │
│  │  ──────────────  │  │  Summary / Notes                              │  │
│  │                  │  │  ─────────────────────────────────────────    │  │
│  │  Research Links  │  │  This article discusses...                    │  │
│  │  Dec 4, 2024     │  │                                                │  │
│  │                  │  │  My thoughts:                                  │  │
│  │  ──────────────  │  │  - Key insight about...                       │  │
│  │                  │  │  - Remember to follow up on...                │  │
│  │  ...             │  │                                                │  │
│  │                  │  │                                                │  │
│  └──────────────────┘  └────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### User Flow

**Creating a New Bookmark:**
1. User clicks "New Bookmark" button in sidebar
2. New empty entry appears at top of list (auto-selected)
3. Right panel shows empty form with editable fields
4. User can either:
   - Fill in fields manually (title, link, source, tags, summary)
   - Paste a URL and click the "Enrich" icon to auto-fill metadata
5. Changes save automatically as user types — no save button needed
6. Entry in sidebar updates in real-time with the title

**Editing an Existing Bookmark:**
1. User clicks any bookmark in the sidebar list
2. Right panel displays all fields for that bookmark
3. User clicks any field to edit directly
4. Changes auto-save with debounce (saves after 500ms of no typing)
5. Visual indicator shows "Saving..." then "Saved" status

**Searching Bookmarks:**
1. User types in search field at top of sidebar
2. Bookmark list filters in real-time
3. Matching bookmarks remain visible
4. Clear search to show all bookmarks again

### Design Principles

1. **Native Feel** — Inspired by Apple Notes; familiar, intuitive, distraction-free
2. **Inline Everything** — No modals, no separate edit screens; edit directly in place
3. **Auto-Save** — Never ask users to save; changes persist automatically
4. **Minimalist Aesthetic** — White background, black text, subtle gray borders only
5. **Content First** — UI disappears, your notes take center stage

---

## 3. Project Structure

```
smart-bookmark-web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth route group
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── (main)/                   # Main app route group
│   │   │   ├── page.tsx              # Two-panel bookmark view
│   │   │   └── layout.tsx
│   │   ├── api/                      # API Routes (BFF)
│   │   │   ├── bookmarks/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       └── enrich/
│   │   │   │           └── route.ts  # AI enrichment endpoint
│   │   │   └── auth/
│   │   │       └── [...nextauth]/
│   │   │           └── route.ts
│   │   ├── layout.tsx                # Root layout
│   │   ├── loading.tsx               # Global loading state
│   │   ├── error.tsx                 # Global error boundary
│   │   └── globals.css               # Global styles
│   │
│   ├── components/                   # React Components
│   │   ├── ui/                       # Base UI components
│   │   │   ├── Input/
│   │   │   ├── IconButton/
│   │   │   ├── Badge/
│   │   │   ├── Spinner/
│   │   │   └── index.ts
│   │   ├── layout/                   # Layout components
│   │   │   ├── Sidebar/
│   │   │   ├── NoteEditor/
│   │   │   ├── TwoPanel/
│   │   │   └── index.ts
│   │   ├── bookmarks/                # Bookmark-specific components
│   │   │   ├── BookmarkListItem/
│   │   │   ├── BookmarkList/
│   │   │   ├── BookmarkNote/
│   │   │   ├── NewBookmarkButton/
│   │   │   ├── EnrichButton/
│   │   │   ├── AutoSaveIndicator/
│   │   │   └── index.ts
│   │   ├── search/                   # Search components
│   │   │   ├── SearchInput/
│   │   │   └── index.ts
│   │   ├── tags/                     # Tag components
│   │   │   ├── TagBadge/
│   │   │   ├── TagInput/
│   │   │   └── index.ts
│   │   └── shared/                   # Shared/utility components
│   │       ├── EmptyState/
│   │       ├── ErrorBoundary/
│   │       └── index.ts
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── useBookmarks.ts
│   │   ├── useBookmark.ts
│   │   ├── useAutoSave.ts            # Auto-save with debounce
│   │   ├── useEnrich.ts              # AI enrichment
│   │   ├── useTags.ts
│   │   ├── useSearch.ts
│   │   ├── useAuth.ts
│   │   ├── useDebounce.ts
│   │   └── index.ts
│   │
│   ├── lib/                          # Utilities and configurations
│   │   ├── api/                      # API client
│   │   │   ├── client.ts
│   │   │   ├── bookmarks.ts
│   │   │   ├── auth.ts
│   │   │   └── index.ts
│   │   ├── utils/                    # Utility functions
│   │   │   ├── cn.ts                 # Classname utility
│   │   │   ├── date.ts
│   │   │   ├── url.ts
│   │   │   └── index.ts
│   │   ├── validators/               # Zod schemas
│   │   │   ├── bookmark.ts
│   │   │   └── index.ts
│   │   └── constants.ts              # App constants
│   │
│   ├── store/                        # Zustand stores
│   │   ├── useBookmarkStore.ts       # Selected bookmark, list state
│   │   └── index.ts
│   │
│   └── types/                        # TypeScript types
│       ├── bookmark.ts
│       ├── tag.ts
│       ├── user.ts
│       └── index.ts
│
├── public/                           # Static assets
│   └── icons/
│
├── .env.example                      # Environment template
├── .eslintrc.js                      # ESLint configuration
├── next.config.js                    # Next.js configuration
├── tailwind.config.ts                # Tailwind configuration
├── tsconfig.json                     # TypeScript configuration
├── package.json
└── README.md
```

---

## 4. Core Technologies

### Primary Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.x | React framework with App Router |
| React | 18.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.4.x | Utility-first styling |

### Supporting Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| @tanstack/react-query | 5.x | Server state management — handles data fetching, caching, and synchronization with the backend |
| zustand | 4.x | Client state management — lightweight store for UI state like modals and theme |
| zod | 3.x | Schema validation — validates form inputs and API responses |
| next-auth | 5.x | Authentication — manages user sessions with support for OAuth and credentials |
| framer-motion | 10.x | Animations — powers smooth transitions and micro-interactions |
| lucide-react | 0.x | Icons — provides consistent, minimalist line icons |
| date-fns | 2.x | Date utilities — formats relative timestamps ("2 days ago") |
| clsx + tailwind-merge | - | Classname utilities — merges Tailwind classes without conflicts |
| react-hot-toast | 2.x | Toast notifications — shows success/error feedback |
| react-hook-form | 7.x | Form handling — manages form state with minimal re-renders |

### Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code linting — enforces consistent code style |
| Prettier | Code formatting — auto-formats code on save |
| Jest | Unit testing — tests individual functions and components |
| React Testing Library | Component testing — tests components as users interact with them |
| Husky | Git hooks — runs linting before commits |

---

## 5. Design System

### Design Philosophy

The visual design takes direct inspiration from Apple Notes — a tool that feels native, invisible, and gets out of your way. The interface should feel like a natural extension of the operating system, not a "web app."

**Reference:** Apple Notes on macOS
- Clean two-panel layout
- Minimal chrome and decorations
- Content is the interface
- Subtle separators, not heavy borders
- System fonts for native feel

### Color Palette

An extremely minimal palette. Almost everything is black, white, or gray.

#### Core Colors

| Color | Value | Usage |
|-------|-------|-------|
| **Background** | `#FFFFFF` | Main background, note editor, cards |
| **Text Primary** | `#000000` | Headings, body text, input values |
| **Text Secondary** | `#86868B` | Timestamps, placeholders, hints |
| **Border** | `#E5E5E5` | Dividers, input borders, panel separator |
| **Border Light** | `#F0F0F0` | Subtle separators between list items |
| **Selection** | `#007AFF` | Selected list item background (very subtle, ~10% opacity) |
| **Accent** | `#007AFF` | Interactive elements, links, enrich button |

#### Semantic Colors (Used Sparingly)

| Purpose | Value | Usage |
|---------|-------|-------|
| Success | `#34C759` | "Saved" indicator |
| Error | `#FF3B30` | Validation errors only |
| Warning | `#FF9500` | Rarely used |

#### Color Usage Rules

- **No colored backgrounds** — Everything sits on white
- **No colored cards** — Cards are white with subtle borders or no borders
- **Color only for interaction** — Blue appears only on clickable elements
- **Grayscale for structure** — Borders and dividers are light gray
- **Black for content** — All readable text is pure black or dark gray

### Typography

#### Font Family

Use the system font stack for a native feel across all platforms:

**Primary:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

This renders as:
- San Francisco on macOS/iOS
- Segoe UI on Windows
- Roboto on Android/Chrome OS

#### Font Scale (Minimal)

| Name | Size | Weight | Usage |
|------|------|--------|-------|
| Title | 22px | Semibold (600) | Note title in editor |
| Body | 15px | Regular (400) | Main content, form fields |
| Caption | 13px | Regular (400) | Timestamps, secondary text |
| Micro | 11px | Medium (500) | Tags, badges |

#### Typography Rules

- **No bold overuse** — Bold only for the note title
- **No ALL CAPS** — Never use uppercase for labels
- **Consistent sizing** — Only 3-4 font sizes across entire app
- **Generous line height** — 1.5 for body text, 1.3 for titles

### Icons

#### Icon Style

Minimal, thin line icons. Use SF Symbols style or Lucide icons with thin stroke weight.

#### Icons Used

| Icon | Usage |
|------|-------|
| `Search` | Search input |
| `Plus` | New bookmark button |
| `Sparkles` | Enrich button |
| `Trash2` | Delete (in context menu only) |
| `X` | Remove tag |
| `ExternalLink` | Open URL |
| `Check` | Save confirmation |

**Icon Sizing:** 16px for inline, 18px for buttons

**Icon Color:** `#86868B` (gray) by default, `#007AFF` (blue) on hover for interactive

### Spacing

#### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight gaps (between tags) |
| sm | 8px | Compact spacing |
| md | 12px | Standard padding |
| lg | 16px | Section gaps |
| xl | 24px | Major separations |
| 2xl | 32px | Panel padding |

#### Layout Spacing

- **Sidebar width:** 280px (fixed) — approximately 1/5 of a typical screen
- **Panel gap:** 1px border or no gap (panels touch)
- **Note editor padding:** 32px horizontal, 24px vertical
- **List item padding:** 12px horizontal, 10px vertical

### Borders & Dividers

#### Border Rules

- **Panel separator:** 1px solid `#E5E5E5`
- **List item separator:** 1px solid `#F0F0F0` (very subtle)
- **Input borders:** 1px solid `#E5E5E5`, no border-radius or very subtle (4px max)
- **No heavy borders** — If something looks boxy, remove the border

#### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| none | 0px | Most elements — keeps things sharp |
| sm | 4px | Inputs, tags |
| md | 6px | Buttons (if any) |

### Shadows

**Rule: Almost no shadows.** The interface should feel flat and printed.

Only exception:
- **Floating elements** (dropdown menus): `0 2px 8px rgba(0, 0, 0, 0.15)`

### Interactions & Animations

#### Transition Durations

| Duration | Usage |
|----------|-------|
| 100ms | Hover states |
| 150ms | Selection changes |
| 200ms | Panel transitions |

#### Interaction Patterns

| Interaction | Feedback |
|-------------|----------|
| List item hover | Background shifts to `#F5F5F5` |
| List item selected | Background `#007AFF` at 10% opacity, subtle left border |
| Input focus | Border color changes to `#007AFF` |
| Button hover | Text color shifts to `#007AFF` |
| Enrich button | Subtle pulse animation while loading |
| Save indicator | "Saving..." → "Saved" with fade |

### Empty States

Empty states should be minimal — just centered gray text, no illustrations or icons.

- Empty list: "No bookmarks yet"
- No search results: "No results found"
- Empty note: Show placeholder text in fields

### Responsive Behavior

**Desktop (>1024px):** Full two-panel layout

**Tablet (768px-1024px):** Narrower sidebar (240px), same layout

**Mobile (<768px):** 
- Single panel view
- Sidebar becomes full-screen list
- Tapping item navigates to full-screen note editor
- Back button to return to list

---

## 6. Component Library

### Component Architecture

All components follow a consistent folder structure. Components are designed to be self-contained, composable, accessible, and fully typed with TypeScript.

### Layout Components

#### TwoPanel

The root layout component that establishes the sidebar + editor split.

**Structure:**
- Fixed-width left panel (sidebar): 280px
- Flexible right panel (note editor): fills remaining space
- 1px border separator between panels
- Full viewport height

**Behavior:** On mobile, collapses to single-panel view with navigation between list and editor.

#### Sidebar

The left panel containing search and bookmark list.

**Structure:**
- Search input at top (sticky)
- "New Bookmark" button below search
- Scrollable bookmark list filling remaining height

**Appearance:** White background, right border separator. No internal padding — child components handle their own spacing.

#### NoteEditor

The right panel for viewing/editing bookmark details.

**Structure:**
- Generous padding (32px horizontal, 24px vertical)
- Stacked form fields with labels
- Auto-save indicator in top-right corner

**Appearance:** White background, no borders. Clean, spacious feel like a writing app.

### Base UI Components

#### Input (Borderless)

A minimal text input that looks like editable text until focused.

**Appearance:**
- No visible border in default state
- Light gray placeholder text
- On focus: subtle bottom border or full border appears in blue
- No background color

**Behavior:** Click to focus, type to edit, blur to commit.

#### IconButton

A minimal button containing only an icon.

**Appearance:**
- No background by default
- Icon in gray (`#86868B`)
- On hover: icon turns blue (`#007AFF`)
- No borders or shadows

**Sizes:** Small (24px), Medium (32px)

#### Badge (Tag)

Small pill for displaying tags.

**Appearance:**
- Light gray background (`#F0F0F0`)
- Dark text
- Subtle border-radius (4px)
- Small "x" button on hover for removal

**Sizing:** Compact — 11px text, minimal padding

#### Spinner

Simple loading indicator.

**Appearance:** Thin circular spinner in gray, small (16px diameter)

### Bookmark Components

#### BookmarkListItem

A single row in the bookmark list.

**Appearance:**
- Two lines: Title (primary), Date (secondary caption)
- Title truncates with ellipsis if too long
- Subtle bottom border separating items
- Selected state: light blue background tint, possibly blue left border accent

**Interactions:**
- Hover: Background shifts to light gray
- Click: Selects item, loads in editor
- Right-click: Context menu (delete)

**Empty/New State:** Shows "New Bookmark" as title in gray italic

#### BookmarkList

Container for all BookmarkListItems.

**Behavior:**
- Scrollable within sidebar
- Sorted by date (newest first)
- Filters based on search query
- Shows empty state when no bookmarks

**Performance:** Virtualized rendering for large lists (future optimization)

#### BookmarkNote

The main editor view for a single bookmark.

**Layout (top to bottom):**

1. **Title Field**
   - Large text (22px, semibold)
   - Placeholder: "Title"
   - Full width, borderless input

2. **Link Field**
   - Standard text (15px)
   - Placeholder: "Paste link here..."
   - Enrich button appears at end when URL is present
   - Click URL to open in new tab

3. **Source Field**
   - Standard text (15px)
   - Placeholder: "Source (e.g., Medium, YouTube)"
   - Optional field

4. **Tags Field**
   - Inline tag badges
   - "Add tag" input at end
   - Enter to add tag, click X to remove

5. **Summary/Notes Field**
   - Multi-line textarea
   - Placeholder: "Add your notes..."
   - Auto-grows with content
   - This is where users write their thoughts

**All fields are inline-editable.** No separate view/edit modes.

#### NewBookmarkButton

Button to create a new bookmark.

**Appearance:**
- Text button: "+ New Bookmark" or just "+" icon
- Positioned below search in sidebar
- Light style — not a heavy CTA

**Behavior:**
- Click creates new empty bookmark
- New item appears at top of list
- New item is auto-selected
- Editor shows empty fields ready for input

#### EnrichButton

Button to trigger AI auto-fill of bookmark metadata.

**Appearance:**
- Small icon button (sparkles icon ✨)
- Appears next to Link field when URL is present
- Gray by default, blue on hover

**Behavior:**
- Click sends URL to backend for processing
- Shows spinner while loading
- On success: fills in Title, Source, Summary automatically
- On error: shows subtle error state, allows retry

**States:** Default, Hover, Loading, Success, Error

#### AutoSaveIndicator

Visual feedback for save status.

**Position:** Top-right corner of note editor, small and unobtrusive

**States:**
- Hidden (no changes)
- "Saving..." (gray text, subtle)
- "Saved" (green checkmark or text, fades after 2s)
- "Error saving" (red, with retry option)

**Behavior:** Appears when user makes changes, disappears shortly after save completes

### Search Components

#### SearchInput

Search field at top of sidebar.

**Appearance:**
- Full width of sidebar (with padding)
- Search icon on left (gray)
- Placeholder: "Search"
- Light border or borderless with gray background
- Clear button (X) when text present

**Behavior:**
- Type to filter list in real-time
- Debounced (200ms)
- Escape clears search
- ⌘/Ctrl+F focuses search

### Tag Components

#### TagBadge

Individual tag display.

**Appearance:**
- Small pill shape
- Light gray background
- Dark text
- On hover in edit mode: shows X to remove

#### TagInput

Inline input for adding new tags.

**Appearance:**
- Appears after existing tags
- Minimal — just a text cursor with "+" or "add tag" hint
- Blends with tag row

**Behavior:**
- Click to focus
- Type tag name
- Enter to add
- Comma also adds tag
- Escape to cancel
- Backspace on empty removes last tag

---

## 7. Pages & Routing

### Route Structure (Phase 1)

| Route | Page | Auth Required | Description |
|-------|------|---------------|-------------|
| `/` | Main | Yes | Two-panel bookmark app |
| `/login` | Login | No | User authentication |
| `/register` | Register | No | New user registration |

**Note:** Unlike typical apps, there is no `/bookmark/[id]` route. The selected bookmark is managed via client-side state, not URL. This keeps the interface feeling like a native app rather than a website.

### Main Page (`/`)

The single-page interface where users spend all their time.

**Layout:**
- `TwoPanel` layout component at root
- Left: `Sidebar` with `SearchInput`, `NewBookmarkButton`, and `BookmarkList`
- Right: `NoteEditor` with `BookmarkNote` for selected item

**State Management:**
- `selectedBookmarkId` stored in Zustand
- Bookmark list fetched and cached via React Query
- Selected bookmark details loaded when selection changes
- Form state managed locally with auto-save

**Data Flow:**

1. **Initial Load:**
   - Fetch all bookmarks (paginated)
   - Select first bookmark by default (or show empty state)
   - Display selected bookmark in editor

2. **Creating New Bookmark:**
   - User clicks "New Bookmark"
   - Create empty bookmark via API (optimistic)
   - Add to top of list, auto-select
   - Focus title field in editor

3. **Editing Bookmark:**
   - User clicks field in editor
   - User types changes
   - Debounced auto-save (500ms after last keystroke)
   - "Saving..." indicator appears
   - API call to update
   - "Saved" indicator, then fades

4. **Using Enrich:**
   - User pastes URL in link field
   - Enrich button appears
   - User clicks enrich
   - API call to process URL
   - Fields auto-populate with response
   - Auto-save triggers

5. **Searching:**
   - User types in search
   - List filters in real-time (client-side for small lists)
   - For larger lists, debounced API search

6. **Deleting:**
   - User right-clicks bookmark in list
   - Context menu with "Delete" option
   - Confirmation (optional, could be immediate with undo)
   - Remove from list, select next/previous item

### Auth Pages (`/login`, `/register`)

Simple, minimal authentication screens.

**Login Page:**
- Email input
- Password input
- "Sign In" button
- "Create account" link
- Optional: Google OAuth button

**Register Page:**
- Email input
- Password input
- "Create Account" button
- "Sign in" link

**Appearance:** Centered card on white background. Minimal styling matching the main app aesthetic.

### Layout Hierarchy

The RootLayout provides global providers (QueryClient, Zustand, Auth). The MainLayout wraps the authenticated app and handles auth checks. Auth pages have their own minimal layout.

---

## 8. State Management

### Architecture Overview

The application uses a hybrid approach optimized for different types of state:

| State Type | Solution | Examples |
|------------|----------|----------|
| Server State | React Query | Bookmark list, individual bookmarks |
| Selection State | Zustand | Currently selected bookmark ID |
| Form State | Local useState | Current field values while editing |
| Auto-Save State | Custom Hook | Debounced save trigger, save status |

### Server State (React Query)

All data fetched from the backend is managed by React Query.

**Bookmark List Query:**
- Fetches paginated list of all bookmarks
- Cached for 5 minutes (staleTime)
- Background refetch disabled to avoid disrupting editing
- Invalidated after create/delete operations

**Individual Bookmark Query:**
- Fetches full details for selected bookmark
- Cached per bookmark ID
- Used to populate the editor form

**Mutations:**
- Create: Optimistically adds to list, rolls back on error
- Update: Triggered by auto-save, updates cache on success
- Delete: Optimistically removes, rolls back on error
- Enrich: Separate mutation, updates fields on success

### Selection State (Zustand)

Simple store for tracking which bookmark is being edited.

**State:**
- `selectedId`: string | null
- `setSelectedId(id)`: function to change selection

**Why Zustand:** Minimal overhead, persists across React Query re-renders, simple to access from any component.

### Form State (Local)

Each editable field manages its own local state.

**Pattern:**
- Initialize from fetched bookmark data
- Update on every keystroke (controlled input)
- Trigger auto-save on change (debounced)

**Why Local State:** 
- Immediate feedback while typing
- No lag from external state management
- Form state is transient, doesn't need persistence

### Auto-Save Architecture

The core UX feature — changes save automatically without user action.

**useAutoSave Hook:**

This custom hook handles the auto-save logic:

1. **Track dirty state:** Compare current values to last saved values
2. **Debounce changes:** Wait 500ms after last keystroke before saving
3. **Trigger save:** Call update mutation when debounce completes
4. **Track status:** Expose `isSaving`, `lastSaved`, `error` states
5. **Handle conflicts:** If save fails, show error and allow retry

**Flow:**
```
User types → Local state updates → Debounce timer starts
                                         ↓ (500ms)
                                    Auto-save triggers
                                         ↓
                              API call (PATCH /bookmarks/:id)
                                         ↓
                              Success: Update cache, show "Saved"
                              Error: Show error, allow retry
```

**Edge Cases:**
- User navigates away while saving: Complete save before navigation
- Rapid selection changes: Cancel pending saves for previous item
- Network error: Show error state, keep local changes, offer retry
- Concurrent edits: Last write wins (acceptable for single-user app)

### Enrich State

When user clicks "Enrich", a separate flow occurs:

1. Set `isEnriching: true`
2. Call enrich API with URL
3. On success: Merge returned data into form state
4. Trigger auto-save with enriched data
5. Set `isEnriching: false`

This is handled by a dedicated `useEnrich` hook that coordinates with the auto-save system.

---

## 9. API Integration

### API Client Architecture

A centralized API client handles all backend communication with consistent error handling and request formatting.

**Base Configuration:** Base URL from environment variable, JSON content type headers, credentials included for auth cookies, automatic response parsing.

**Error Handling:** Custom ApiError class captures HTTP status code, status text, and response body. Errors bubble up to React Query mutation handlers for UI feedback.

### Bookmark API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/bookmarks` | List all bookmarks |
| GET | `/bookmarks/:id` | Get single bookmark details |
| POST | `/bookmarks` | Create new (empty) bookmark |
| PATCH | `/bookmarks/:id` | Update bookmark fields |
| DELETE | `/bookmarks/:id` | Delete bookmark |
| POST | `/bookmarks/:id/enrich` | AI-enrich bookmark from URL |

**Query Parameters (GET /bookmarks):**
- `q`: Search query string (optional)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50)

**Request Body (POST /bookmarks):**
- Empty object `{}` — creates a new blank bookmark
- Returns the new bookmark with generated ID

**Request Body (PATCH /bookmarks/:id):**
- `title` (optional): Updated title
- `url` (optional): Updated URL
- `source` (optional): Updated source
- `summary` (optional): Updated notes
- `tags` (optional): Array of tag strings

**Request Body (POST /bookmarks/:id/enrich):**
- `url` (required): The URL to process

**Response (enrich):**
- `title`: Extracted page title
- `source`: Detected source/platform
- `summary`: AI-generated summary
- `content_type`: Detected type (article, video, etc.)

### Response Formats

**Bookmark Object:**
```
{
  id: string
  url: string | null
  title: string | null
  source: string | null
  summary: string | null
  content_type: string | null
  tags: string[]
  created_at: string (ISO 8601)
  updated_at: string (ISO 8601)
}
```

**List Response:**
```
{
  bookmarks: Array<Bookmark>
  total: number
  page: number
  limit: number
}
```

### Auto-Save API Pattern

The frontend sends PATCH requests for every auto-save. To minimize server load:

**Debouncing:** Frontend waits 500ms after last change before sending
**Partial Updates:** Only changed fields are sent in the PATCH body
**Optimistic Caching:** Local state updates immediately; server confirmation updates cache

**Example PATCH request (after user edits title):**
```
PATCH /bookmarks/abc123
{ "title": "Updated Title" }
```

### Enrich API Pattern

Enrichment is a separate action, not part of auto-save.

**Flow:**
1. User pastes URL, clicks Enrich button
2. Frontend calls POST `/bookmarks/:id/enrich` with URL
3. Backend fetches URL, extracts metadata, generates summary
4. Backend returns enriched fields
5. Frontend merges into form state
6. Auto-save triggers with new values

**Timeout:** Enrich can take several seconds; UI shows loading state

**Partial Success:** If some fields fail to extract, return what's available

---

## 10. Authentication

### Authentication Strategy

The application uses NextAuth.js (Auth.js) for authentication, supporting:

**Providers:** Credentials (email/password authentication), Google OAuth (social login, primary recommendation).

**Session Strategy:** JWT-based sessions stored in HTTP-only cookies. This approach works well with serverless deployments, doesn't require session database, and supports API route protection.

### Auth Flow

**Login Flow:** User enters credentials or clicks Google, NextAuth validates with backend/OAuth provider, on success JWT created, cookie set, redirect to main page, on failure error message displayed.

**Session Check:** Server components call `getServerSession()`, if no session redirect to login, if session valid render protected content.

**Logout Flow:** User triggers logout, NextAuth clears session cookie, redirect to landing/login page.

### Protected Routes

All routes under `/(main)` require authentication.

**Server-Side Protection:** Layout checks session before rendering, unauthorized users redirected to `/login`, no flash of protected content.

**Client-Side Protection:** `useAuth` hook provides user state, components can conditionally render based on auth, automatic redirect if session expires mid-use.

### Auth Hook

The `useAuth` custom hook provides: `user` (current user object or null), `isAuthenticated` (boolean for quick checks), `isLoading` (true during session verification), `login(provider, credentials?)` to trigger login, `logout()` to trigger logout.

---

## 11. Performance Optimization

### Rendering Strategy

**Server Components (Default):** Pages and layouts render on server, zero JavaScript for static content, faster initial page load.

**Client Components (Where Needed):** Interactive elements (forms, buttons), components using hooks or browser APIs, marked with `'use client'` directive.

**Streaming:** Suspense boundaries for async components, loading skeletons shown immediately, content streams in as data arrives.

### Data Fetching

**Parallel Fetching:** Independent data fetched simultaneously, no waterfall requests.

**Prefetching:** React Query prefetches on hover (future), Next.js Link prefetches visible routes.

**Caching:** React Query caches API responses, Next.js caches static assets, service worker caches shell (future).

### Bundle Optimization

**Code Splitting:** Automatic per-route splitting, dynamic imports for heavy components, modals loaded only when opened.

**Tree Shaking:** Unused code eliminated, icon library imports optimized, date library uses modular imports.

**Image Optimization:** Next.js Image component, automatic WebP/AVIF conversion, responsive srcsets, lazy loading by default.

### List Performance

**Virtual Scrolling (Future):** Only visible items rendered, smooth scrolling maintained, memory usage constant regardless of list size.

**Current Approach:** Paginated loading (20 items/page), infinite scroll triggers, loading skeletons for pending items.

### Debouncing

Search input debounced at 300ms to reduce API calls during typing, prevent UI flashing, and maintain responsive feel.

---

## 12. Testing Strategy

### Testing Pyramid

**Unit Tests (Foundation):** Utility functions, custom hooks, validation schemas, pure component logic.

**Integration Tests (Middle):** Component interactions, form submissions, API integration (mocked), state management.

**E2E Tests (Top, Future):** Critical user flows, cross-browser testing, visual regression.

### Testing Tools

| Tool | Purpose |
|------|---------|
| Jest | Test runner, assertions |
| React Testing Library | Component rendering, user interactions |
| MSW (Mock Service Worker) | API mocking |
| Playwright (Future) | E2E testing |

### What to Test

**Components:** Renders correctly with props, handles user interactions, displays correct states (loading, error, empty), accessibility (keyboard nav, ARIA).

**Hooks:** Returns correct initial state, updates state on actions, handles edge cases.

**API Integration:** Sends correct request format, handles success responses, handles error responses, retries appropriately.

### Test File Location

Tests live alongside components in the same folder.

---

## 13. Deployment

### Build Process

**Production Build:** TypeScript compilation, Next.js optimization, CSS purging (unused Tailwind removed), bundle analysis, static generation where possible.

**Output:** Standalone Node.js server, optimized static assets, source maps (optional).

### Deployment Options

**Recommended: Vercel** — Zero-config Next.js deployment, automatic preview deployments, edge functions support, built-in analytics.

**Alternative: Docker** — Containerized deployment, works with any cloud provider, consistent environments, custom infrastructure control.

### Environment Configuration

**Build-time Variables:** `NEXT_PUBLIC_*` embedded in client bundle, used for API URL and feature flags.

**Runtime Variables:** Server-only secrets, used for auth secrets and API keys.

### CI/CD Pipeline

**On Pull Request:** Install dependencies, run linter, run type check, run tests, build preview deployment.

**On Merge to Main:** All PR checks, build production, deploy to production, notify team.

---

## 14. Environment Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Yes | Frontend URL (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL |
| `NEXTAUTH_URL` | Yes | Auth callback URL (same as APP_URL) |
| `NEXTAUTH_SECRET` | Yes | Random string for JWT encryption |
| `GOOGLE_CLIENT_ID` | For OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For OAuth | Google OAuth secret |

### Configuration Files

**next.config.js:** Image domains whitelist, environment variable exposure, redirects and rewrites, build output configuration.

**tailwind.config.ts:** Custom color palette, typography settings, spacing scale extensions, plugin configuration.

**tsconfig.json:** Path aliases (`@/*` → `./src/*`), strict mode enabled, Next.js plugin integration.

### Development Setup

1. Clone repository
2. Copy `.env.example` to `.env.local`
3. Fill in environment variables
4. Run `npm install`
5. Run `npm run dev`
6. Open `http://localhost:3000`

---

## Appendix

### TypeScript Types

**Bookmark:**
- `id`: Unique identifier (UUID)
- `url`: The bookmarked URL (nullable for new bookmarks)
- `title`: User-provided or extracted title (nullable)
- `source`: Platform/source name (nullable)
- `summary`: User notes or AI-generated summary (nullable)
- `content_type`: Detected content type (nullable)
- `tags`: Array of tag strings
- `created_at`: Creation timestamp (ISO 8601)
- `updated_at`: Last modification timestamp (ISO 8601)

**User:**
- `id`: Unique identifier
- `email`: User email
- `created_at`: Registration timestamp

**SaveStatus (for auto-save indicator):**
- `idle`: No changes
- `saving`: Save in progress
- `saved`: Successfully saved
- `error`: Save failed

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘/Ctrl + N` | Create new bookmark |
| `⌘/Ctrl + F` | Focus search |
| `↑ / ↓` | Navigate bookmark list |
| `Enter` | Select highlighted bookmark |
| `Escape` | Clear search / Deselect |
| `⌘/Ctrl + Backspace` | Delete selected bookmark |

### Accessibility Checklist

- [x] All interactive elements keyboard accessible
- [x] Visible focus indicators (blue outline)
- [x] Color contrast meets WCAG AA (black on white)
- [x] Form inputs have associated labels
- [x] Error messages announced to screen readers
- [x] List navigation via arrow keys

### Browser Storage

| Key | Storage | Purpose |
|-----|---------|---------|
| `smart-bookmark-selected` | localStorage | Last selected bookmark ID |
| Auth session | HTTP-only cookie | User authentication |

---

*Document Version: 1.0 (Phase 1)*  
*Last Updated: November 2024*  
*Author: Frontend Team*