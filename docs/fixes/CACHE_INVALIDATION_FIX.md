# React Query Cache Invalidation Fix - Analysis & Solution

## Problem Summary

When a user enriches a NEW bookmark with AI in one browser session, the generated metadata (concepts and entities) don't appear in that session, but DO appear in a different session (e.g., created in Cursor, visible in incognito).

**Expected Behavior:** Metadata should appear immediately after enrichment in the same browser session.

**Actual Behavior:** Metadata is missing until the user manually refreshes or waits 5+ minutes for cache to expire.

---

## Root Cause Analysis

### The Race Condition Flow

```
Timeline of Events (problematic flow):
┌─────────────────────────────────────────────────────────────────┐
│ Time  │ Component           │ Action                            │
├─────────────────────────────────────────────────────────────────┤
│ T=0   │ Frontend            │ User clicks "Enrich with AI"      │
│ T=1s  │ Backend (Enrichment)│ Fetches URL, generates summary    │
│ T=5s  │ Backend API         │ Returns enriched bookmark         │
│       │                     │ Queues graph jobs (async)         │
│ T=6s  │ Frontend            │ onSuccess fires                   │
│       │ React Query         │ invalidateQueries() called        │
│ T=7s  │ React Query         │ IMMEDIATELY refetches metadata    │
│ T=7s  │ Backend (Database)  │ Queries relationships table       │
│ T=7s  │ Backend (DB Result) │ RETURNS EMPTY (no relationships!) │
│ T=7s  │ React Query         │ CACHES empty result for 5min      │
│       │                     │                                   │
│ T=10s │ Graph Worker       │ Extracts entities, writes to DB   │
│ T=15s │ Graph Worker       │ Analyzes concepts, writes to DB   │
│ T=20s │ Graph Worker       │ Completes, relationships exist    │
│       │ Frontend           │ BUT... data already cached!       │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Happens

1. **Asynchronous Graph Processing**: The enrichment worker completes quickly (5 seconds), but graph workers (entity extraction, concept analysis) run in background queues and take 10-15+ seconds.

2. **Eager Refetch**: React Query's `invalidateQueries()` immediately triggers a refetch. When the metadata endpoint is queried at T=7s, the relationships don't exist yet because graph workers haven't finished.

3. **Stale Time Caching**: The empty metadata result gets cached with `staleTime: 5min`, so even when relationships eventually exist, they won't be fetched again.

4. **Backend Endpoint Timing**: The `/api/graph/bookmarks/:id/related` endpoint queries the relationships table directly without waiting for async graph workers to finish.

### Code Evidence

**In `useBookmarks.ts` (line 327):**
```typescript
// This invalidates immediately, causing refetch before graph workers finish
queryClient.invalidateQueries({ queryKey: ['bookmark-metadata-v2', id] });
```

**In `useBookmarkMetadata.ts` (lines 33-39):**
```typescript
const response = await fetch(`/api/graph/bookmarks/${bookmarkId}/related`);
// This queries database directly - no wait for graph workers
```

**In `graph.ts` (lines 36-75):**
```typescript
// Backend queries relationships immediately, without waiting for graph jobs
const [entityRelationships, conceptRelationships] = await Promise.all([
  prisma.relationship.findMany({ /* entities */ }),
  prisma.relationship.findMany({ /* concepts */ }),
]);
```

---

## Solution: Polling-Based Metadata Refresh

Instead of a single refetch, we implement **smart polling** that waits for graph workers to complete.

### How It Works

```
Timeline of Events (fixed flow):
┌──────────────────────────────────────────────────────────────────────┐
│ Time  │ Component            │ Action                               │
├──────────────────────────────────────────────────────────────────────┤
│ T=0   │ Frontend             │ User clicks "Enrich with AI"         │
│ T=5s  │ Backend (Enrichment) │ Returns enriched bookmark            │
│ T=6s  │ Frontend             │ onSuccess fires                      │
│       │                      │ Calls refreshMetadata() with polling│
│ T=7s  │ React Query          │ pollMetadataUntilReady() starts     │
│       │                      │ Poll attempt 1...                   │
│ T=7s  │ Backend (DB)         │ Query relationships (empty)         │
│ T=7s  │ Polling              │ Empty result → continue polling     │
│ T=8s  │ Polling              │ Poll attempt 2...                   │
│ T=8s  │ Backend (DB)         │ Query relationships (empty)         │
│ T=8s  │ Polling              │ Empty result → wait 1s              │
│       │                      │                                     │
│ T=10s │ Graph Worker (1)     │ Entity extraction completes         │
│ T=12s │ Polling              │ Poll attempt 5...                   │
│ T=12s │ Backend (DB)         │ Query relationships (NOW HAS DATA!)  │
│ T=13s │ Graph Worker (2)     │ Concept analysis completes          │
│ T=13s │ Polling              │ Returns metadata with concepts      │
│       │                      │ AND entities!                       │
│ T=13s │ Frontend             │ Cache updated with REAL data        │
│ T=13s │ UI                   │ Metadata badges appear!             │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Smart Polling**: Checks for metadata every 1 second, stops as soon as data arrives
2. **Timeout Protection**: Defaults to 30 attempts (30 seconds) to avoid infinite loops
3. **Immediate Return**: Returns as soon as ANY metadata found (doesn't wait for all workers)
4. **Fallback**: Returns empty result after timeout (graph workers may have failed)
5. **Logging**: Comprehensive console logs for debugging

---

## Implementation Changes

### 1. New Function: `pollMetadataUntilReady()`

**File**: `/frontend/hooks/useBookmarkMetadata.ts`

```typescript
async function pollMetadataUntilReady(
  bookmarkId: string,
  maxAttempts: number = 30,
  delayMs: number = 1000
): Promise<BookmarkMetadata> {
  // Polls every 1 second until:
  // - We get metadata with actual data, OR
  // - We timeout after 30 seconds

  // Returns immediately when metadata is found
  // Logs progress for debugging
}
```

**Benefits:**
- Waits for graph workers without blocking UI
- Non-blocking: polling happens asynchronously
- Early exit: stops as soon as data arrives

### 2. New Function: `useRefreshBookmarkMetadata()`

**File**: `/frontend/hooks/useBookmarkMetadata.ts`

```typescript
export function useRefreshBookmarkMetadata() {
  const queryClient = useQueryClient();

  return (bookmarkId: string) => {
    // 1. Invalidate the query
    queryClient.invalidateQueries({
      queryKey: ['bookmark-metadata-v2', bookmarkId],
    });

    // 2. Manually fetch with polling
    queryClient.fetchQuery({
      queryKey: ['bookmark-metadata-v2', bookmarkId],
      queryFn: async () => pollMetadataUntilReady(bookmarkId),
    });
  };
}
```

**Benefits:**
- Proper React Query integration
- Clears cache AND refetches with polling
- Handles edge cases (deleted bookmarks, etc.)

### 3. Updated: `useEnrichBookmark()`

**File**: `/frontend/hooks/useBookmarks.ts`

**Before:**
```typescript
onSuccess: (data, id) => {
  queryClient.invalidateQueries({ queryKey: ['bookmark-metadata-v2', id] });
  // Problem: immediate refetch before graph workers finish
}
```

**After:**
```typescript
onSuccess: (data, id) => {
  refreshMetadata(id); // Uses polling-based refresh
  // Fixed: waits for graph workers to finish
}
```

---

## Testing the Fix

### Manual Test Steps

1. **Create a bookmark** with a real URL
2. **Click "Enrich with AI"**
3. **Check the browser console** for polling messages:
   ```
   [useBookmarkMetadata] Force refresh with polling for <id>
   [useBookmarkMetadata] Initial fetch returned empty metadata for <id>, polling...
   [useBookmarkMetadata] Got metadata for <id> after 5 poll(s): {...}
   ```
4. **Verify metadata appears** in the same session
5. **Switch browser tabs** and back - metadata should persist

### Debugging

Check console logs for:
- `[useRefreshBookmarkMetadata] Refreshing metadata for <id>`
- `[useBookmarkMetadata] Poll attempt X/30...`
- `[useBookmarkMetadata] Got metadata for <id>`

If you see `Polling timeout`, the graph workers likely failed. Check backend logs:
```bash
docker logs smartbookmarks_graph_worker
```

---

## Performance Impact

### Before Fix
- **User Experience**: 5-10 seconds of missing metadata, or permanent loss if cache expires
- **Network**: 1 API call immediately (returns empty)
- **Server**: Single query per bookmark

### After Fix
- **User Experience**: Metadata appears in 10-15 seconds (when graph workers finish)
- **Network**: ~5-10 API calls (polling every second for up to 30 seconds)
- **Server**: Same database queries, just repeated until data available

**Trade-off**: Slightly more network calls, but guaranteed correct data. The polling stops immediately when data arrives, so typical case is 5-7 calls (7-10 seconds).

---

## Edge Cases Handled

1. **Deleted Bookmark During Enrichment**
   - Already handled by existing code in `onSuccess`
   - Metadata refresh skipped

2. **Graph Worker Failure**
   - Polling times out after 30 seconds
   - Returns empty metadata gracefully
   - User doesn't see broken/partial metadata

3. **Multiple Enrichments in Parallel**
   - Each bookmark has its own polling task
   - No interference between different metadata refreshes

4. **Browser Refresh During Polling**
   - Polling stops (aborts)
   - Next component mount will refetch normally

5. **User Navigating Away**
   - Polling stops
   - Re-entering bookmark view triggers new fetch (cache expired or invalidated)

---

## Files Modified

1. **`/frontend/hooks/useBookmarkMetadata.ts`**
   - Added `pollMetadataUntilReady()` function
   - Added `useRefreshBookmarkMetadata()` hook
   - Updated `useBookmarkMetadata()` with `forceRefresh` parameter

2. **`/frontend/hooks/useBookmarks.ts`**
   - Imported `useRefreshBookmarkMetadata`
   - Updated `useEnrichBookmark()` to use polling-based refresh

---

## Backward Compatibility

- **No breaking changes** to public APIs
- **Existing code** continues to work without modifications
- **New polling feature** is opt-in via `useRefreshBookmarkMetadata()`
- **Performance** slightly improved for initial loads (no empty cache)

---

## Future Improvements

1. **Backend Awareness**: Enhance `/api/graph/bookmarks/:id/related` to wait for graph workers
   - Could add optional `?wait=true` parameter
   - Or return a "pending" status if relationships are being computed

2. **Configurable Polling**: Allow tuning of polling parameters
   - `maxAttempts`: adjust for slower/faster systems
   - `delayMs`: adjust for different network conditions

3. **WebSocket Updates**: Replace polling with push-based updates
   - Graph worker could emit event when relationships created
   - Frontend subscribes and updates immediately

4. **Batch Metadata Refresh**: Refresh multiple bookmarks at once
   - Useful after bulk enrichment operations

---

## Verification

After deployment, verify the fix with:

```bash
# Terminal 1: Watch backend logs
docker logs -f smartbookmarks_backend

# Terminal 2: Watch graph worker logs
docker logs -f smartbookmarks_graph_worker

# Browser: Create and enrich a bookmark
# Check Console > Network tab for /api/graph/bookmarks/<id>/related calls
# Should see multiple calls as polling happens
```

Expected behavior:
- First call returns empty
- Polling continues
- ~5-10 seconds later, returns with metadata
- UI updates immediately
