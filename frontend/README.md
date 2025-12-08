# Smart Bookmarks - Frontend

A refined, minimal bookmark manager with AI-powered content capture and organization.

## Features

- **Two-panel layout**: Sidebar with bookmark list + detail panel for editing
- **Inline editing**: Click to edit any field with auto-save
- **Mock data**: 5 sample bookmarks to explore the UI
- **Refined design**: Warm color palette, custom typography (Crimson Pro + DM Sans), and subtle animations
- **Responsive**: Clean, distraction-free interface

## Tech Stack

- **Next.js 14** with App Router
- **TypeScript**
- **Tailwind CSS v4** for styling
- **shadcn/ui** components
- **Zustand** for state management
- **Framer Motion** for animations
- **Lucide React** for icons

## Getting Started

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the available port shown in the terminal).

## Project Structure

```
frontend/
├── app/                     # Next.js App Router pages
│   ├── layout.tsx          # Root layout with fonts
│   ├── page.tsx            # Main bookmarks page
│   └── globals.css         # Global styles and Tailwind config
├── components/
│   ├── layout/
│   │   └── TwoPanel.tsx    # Split panel layout
│   ├── bookmarks/
│   │   ├── Sidebar.tsx              # Sidebar with search
│   │   ├── BookmarkList.tsx         # List of bookmarks
│   │   ├── BookmarkListItem.tsx     # Individual bookmark item
│   │   ├── NoteEditor.tsx           # Detail panel container
│   │   ├── BookmarkNote.tsx         # Editable bookmark fields
│   │   └── CreateBookmarkDialog.tsx # New bookmark modal
│   └── ui/                 # shadcn/ui components
└── store/
    └── bookmarksStore.ts   # Zustand store with mock data
```

## Design System

### Typography
- **Display/Headings**: Crimson Pro (serif)
- **Body**: DM Sans (sans-serif)

### Colors
- Warm neutrals with subtle brown undertones (hue 85)
- Background: `oklch(0.99 0.002 85)` - warm off-white
- Foreground: `oklch(0.2 0.01 85)` - deep charcoal
- Borders: `oklch(0.91 0.004 85)` - soft gray

### Border Radius
- Subtle: 2-6px for refined look

## Current Status

This is a bare minimum MVP with:
- ✅ Mock data (5 sample bookmarks)
- ✅ Two-panel layout
- ✅ Bookmark list with selection
- ✅ Inline editing with auto-save
- ✅ Create bookmark dialog
- ✅ Refined typography and color palette
- ✅ Subtle animations

## Next Steps

- Connect to backend API
- Implement real auto-save functionality
- Add AI enrichment (summary, tags)
- Implement search functionality
- Add tag management
- Authentication

## Notes

- Auto-save is simulated with local state (no backend yet)
- "Enrich with AI" button is non-functional (UI only)
- Search is UI-only (filtering not implemented)
