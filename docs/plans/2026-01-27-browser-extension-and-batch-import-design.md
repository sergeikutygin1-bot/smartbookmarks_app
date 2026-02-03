# Browser Extension & Batch Import Design

**Date**: 2026-01-27
**Status**: Validated Design
**Features**: Chrome/Safari Extension + Batch URL Import

---

## Overview

Adding two new entry points to Smart Bookmark for faster content capture:

1. **Browser Extension** - Save current page with one click from Chrome/Safari toolbar
2. **Batch Import** - Paste multiple URLs at once in the web app

Both features leverage the existing enrichment and graph processing pipelines without modifications.

---

## Architecture

### System Integration

```
Extension/Batch Import → POST /api/v1/bookmarks (single) or /bulk (batch)
  → Create bookmark records with status='pending'
  → Enqueue enrichment jobs
  → Enqueue graph jobs
  → Return immediately to user
  → Background workers process asynchronously
```

**Key Principle**: Zero changes to existing enrichment/graph pipelines. New features simply create bookmarks and let existing queue system handle processing.

---

## Browser Extension Design

### Technology Stack

- **Language**: TypeScript (maintaining consistency with frontend/backend)
- **UI Framework**: React (for popup)
- **Build Tool**: Webpack/esbuild (TS → JS compilation)
- **Manifest Version**: V3 (Chrome/Safari compatibility)

### Project Structure

```
extension/
├── src/
│   ├── popup/
│   │   ├── popup.tsx          # React component for popup UI
│   │   ├── popup.html         # HTML shell
│   │   └── index.tsx          # Entry point
│   ├── background/
│   │   └── background.ts      # Service worker
│   ├── types/
│   │   └── index.ts           # Shared types
│   └── utils/
│       └── api.ts             # API client (typed)
├── manifest.json
├── tsconfig.json
├── webpack.config.js          # Bundles TS → JS for browser
└── package.json
```

### Extension Components

**1. Manifest.json (Manifest V3)**
- Permissions: `activeTab`, `storage`, `identity`
- Host permissions: API domain for fetch requests
- Background service worker for auth state management
- Popup HTML/JS for save UI

**2. Popup UI**
- Toolbar button with popup (not context menu)
- Displays current tab title and URL
- "Save Bookmark" button
- Simple "✓ Saved!" toast on success (2s, auto-close)
- Small "Login" button if not authenticated

**3. Background Service Worker**
- Manages authentication state (stores JWT tokens)
- Listens for auth messages from web app
- Handles API requests to backend
- Token refresh logic

### Authentication Flow

```
User clicks extension icon (not logged in)
  → Popup shows "Login to Smart Bookmark" button
  → Click opens web app login page: /extension-auth
  → User logs in on web app
  → Web app sends message to extension with JWT tokens via postMessage
  → Extension stores tokens in chrome.storage.local
  → Popup automatically updates to show save UI
```

**Token Storage**:
- Access token + refresh token in `chrome.storage.local` (browser-encrypted)
- Extension checks token expiry before each save
- Auto-refresh if expired using refresh token

### Extension ↔ Web App Communication

**Web App Side** (`frontend/app/extension-auth/page.tsx`):

```typescript
useEffect(() => {
  if (isAuthenticated) {
    const tokens = getAuthTokens();

    // Send to extension via postMessage
    window.postMessage({
      type: 'SMART_BOOKMARK_AUTH',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }, window.location.origin);

    // Show "✓ Extension connected!"
    // Auto-close tab after 2 seconds
  }
}, [isAuthenticated]);
```

**Extension Side** (`background.ts`):

```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SMART_BOOKMARK_AUTH') {
    chrome.storage.local.set({
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    chrome.runtime.sendMessage({ type: 'AUTH_SUCCESS' });
  }
});
```

**Security**:
- Validate message source using `window.location.origin`
- Extension ID validation on web app side
- Tokens never in URL parameters (only postMessage)
- HTTPS required

### Popup Implementation

**UI States**:
1. Not authenticated: Show "Login" button
2. Authenticated + loading: Show current page info + spinner
3. Authenticated + idle: Show page info + "Save" button
4. Saving: Show spinner on button
5. Success: Show "✓ Saved!" (2s, auto-close)
6. Error: Show error with "Retry" button

**Save Flow**:

```typescript
On popup open:
  → Get current tab (chrome.tabs.query)
  → Check auth status (chrome.storage.local.get)
  → Display tab title + URL (if authenticated)

On "Save" click:
  → Disable button, show spinner
  → POST /api/v1/bookmarks { url, title }
  → On success: Show "✓ Saved!" → Close after 2s
  → On 401: Refresh token, retry
  → On error: Show error, enable retry
```

**API Client** (`api.ts`):

```typescript
class BookmarkAPI {
  async saveBookmark(url: string, title: string) {
    const { accessToken } = await chrome.storage.local.get('accessToken');

    const response = await fetch(`${API_URL}/api/v1/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ url, title })
    });

    if (response.status === 401) {
      await this.refreshToken();
      return this.saveBookmark(url, title); // Retry
    }

    return response.json();
  }
}
```

**Popup Size**: 400x600px (standard extension popup)

---

## Batch Import Design

### Frontend UI

**Location**: `/bookmarks` page

```
/bookmarks
├── Header with "Add Bookmark" button
├── NEW: "Bulk Import" button (opens modal/drawer)
└── Bookmark list/grid
```

**Component**: `frontend/components/bookmarks/BulkImportModal.tsx`

**Interface**:
- Large textarea: "Paste URLs (one per line)"
- Real-time counter: "X URLs detected"
- Preview list with validation icons (✓/✗)
- "Import All" button
- Progress indicator during import
- Results summary: "✓ 48 imported, ✗ 2 failed"

**Client-side Parsing**:

```typescript
function parseUrls(text: string): { valid: string[], invalid: string[] } {
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const urlRegex = /^https?:\/\/.+/i;

  const valid = lines.filter(line => urlRegex.test(line));
  const invalid = lines.filter(line => !urlRegex.test(line));

  return { valid, invalid };
}
```

**Import Flow**:
1. User pastes URLs → Real-time validation (green/red indicators)
2. Click "Import All" → POST `/api/v1/bookmarks/bulk`
3. Show loading spinner
4. On success: Close modal → Toast "✓ 48 bookmarks imported" → Refresh list
5. Failed URLs: Create bookmarks with `status='failed'`, visible in list with retry option

### Backend API

**New Endpoint**: `POST /api/v1/bookmarks/bulk`

**Request**:
```json
{
  "urls": ["https://example.com/1", "https://example.com/2", ...]
}
```

**Response**:
```json
{
  "created": 48,
  "bookmarks": [
    { "id": "uuid", "url": "...", "status": "pending" },
    ...
  ]
}
```

**Implementation** (`backend/src/routes/bookmarks.ts`):

```typescript
router.post('/bulk', async (req: Request, res: Response) => {
  const { urls } = req.body;
  const userId = req.user!.id;

  // Create all bookmarks in transaction
  const bookmarks = await prisma.$transaction(
    urls.map(url =>
      prisma.bookmark.create({
        data: {
          url,
          userId,
          status: 'pending',
          createdAt: new Date()
        }
      })
    )
  );

  // Enqueue enrichment jobs
  const jobs = bookmarks.map(b => ({
    bookmarkId: b.id,
    userId: b.userId,
    url: b.url
  }));

  await enrichmentQueue.addBulk(jobs);

  res.json({ created: bookmarks.length, bookmarks });
});
```

**New Endpoint**: `GET /api/v1/auth/extension-token`

**Purpose**: Called by web app after login to get tokens for extension

**Response**:
```json
{
  "accessToken": "jwt...",
  "refreshToken": "jwt..."
}
```

**Processing Behavior**:
- All bookmarks created with `status='pending'`
- Enrichment queue processes in parallel (existing rate limiting applies)
- Failed enrichments → `status='failed'` (bookmark preserved)
- Users see bookmarks appear as enrichment completes

### Database

**No schema changes needed!**

Existing `bookmarks` table already supports:
- `url` (TEXT) - stores URL
- `status` (ENUM: pending/processing/completed/failed) - tracks state
- `user_id` (UUID) - row-level security
- All other fields nullable until enrichment completes

---

## Error Handling

### Extension Errors

**Network Failures**:
- Retry logic: 3 attempts, exponential backoff (1s, 2s, 4s)
- User message: "Could not save. Check connection."
- Cache failed save locally, retry when online

**Token Expiration**:
- Auto-refresh using refresh token before each request
- If refresh fails: Clear storage, show "Login again"

**Invalid URLs**:
- Reject: `chrome://`, `about:`, `file://` schemes
- Accept: `http://`, `https://` only
- Validate before sending to API

**API Budget Exceeded**:
- Backend returns 429 with retry-after header
- Message: "Daily limit reached. Bookmark saved but will enrich tomorrow."
- Bookmark created with `status='pending'`

### Batch Import Errors

**Malformed Input**:
- Auto-trim whitespace and special characters
- Auto-deduplicate URLs in paste
- Filter out empty lines silently

**Partial Failures**:
- Invalid URL format: Create with `status='failed'`, store original URL
- Enrichment fails: Bookmark exists with `status='failed'`, show retry button
- Duplicate URL (constraint violation): Skip, increment "already exists" counter

**Large Batches**:
- Client warning if >500 URLs
- Backend limit: 1000 URLs per request (400 if exceeded)
- Suggest splitting into multiple imports

---

## Implementation Checklist

### Phase 1: Backend API
- [ ] Create new route: `POST /api/v1/bookmarks/bulk`
- [ ] Create new route: `GET /api/v1/auth/extension-token`
- [ ] Add bulk job queueing to enrichment queue
- [ ] Add rate limiting for bulk endpoint
- [ ] Add validation (URL format, batch size limit)
- [ ] Write tests for bulk endpoint

### Phase 2: Frontend Batch Import
- [ ] Create `BulkImportModal.tsx` component
- [ ] Add "Bulk Import" button to bookmarks page
- [ ] Implement URL parsing and validation
- [ ] Add progress indicators and result summary
- [ ] Create API client for bulk endpoint
- [ ] Handle error states (partial failures, duplicates)
- [ ] Write component tests

### Phase 3: Extension Auth Setup
- [ ] Create `/extension-auth` page in web app
- [ ] Implement postMessage token passing
- [ ] Add extension ID validation
- [ ] Handle already-authenticated flow
- [ ] Add success message and auto-close

### Phase 4: Extension Development
- [ ] Set up extension project structure (TypeScript + React)
- [ ] Configure webpack/esbuild for TS compilation
- [ ] Create manifest.json (Manifest V3)
- [ ] Implement background service worker (auth state)
- [ ] Build popup UI component (React)
- [ ] Implement API client with retry logic
- [ ] Add token refresh mechanism
- [ ] Handle all error states
- [ ] Test in Chrome and Safari
- [ ] Create extension package for distribution

### Phase 5: Testing & Documentation
- [ ] Integration tests (extension → backend)
- [ ] Load testing (bulk import with 100+ URLs)
- [ ] User acceptance testing
- [ ] Update user documentation
- [ ] Create extension installation guide
- [ ] Add troubleshooting guide

---

## Success Metrics

**Extension**:
- Save time: <3 seconds from click to "Saved!" confirmation
- Auth success rate: >95% on first attempt
- Token refresh success rate: >99%

**Batch Import**:
- Parse accuracy: 100% for valid URLs
- Import speed: 50 URLs in <5 seconds (bookmark creation only)
- Enrichment throughput: Existing queue performance (no degradation)

**User Experience**:
- No manual metadata entry required
- Partial failures don't block entire batch
- Clear error messages for all failure scenarios

---

## Future Enhancements (Not in MVP)

- Context menu right-click option in extension
- Ability to add notes/tags before saving in extension
- CSV import with metadata columns
- Browser bookmark HTML file import
- Batch operations in extension (save multiple tabs)
- Extension keyboard shortcuts
- Safari App Extension (native)

---

## Notes

- Extension built with TypeScript for consistency with existing stack
- Reuses existing enrichment and graph pipelines
- No database schema changes required
- All bookmarks preserved even if enrichment fails
- Extension popup stays under 400x600px for browser compatibility
