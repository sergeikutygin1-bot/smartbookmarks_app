# Critical Metadata Cache Issues - Root Cause Analysis

## Issue Summary

Two critical bugs preventing metadata (concepts/entities) from working like tags:

1. **Issue 1: New enrichments don't show in current browser**
   - Enrichment succeeds, but metadata doesn't appear in Browser A
   - Closing and reopening Browser A shows the metadata
   - Or viewing in Browser B shows it immediately

2. **Issue 2: Metadata disappears after enrichment**
   - Metadata appears briefly after enrichment
   - Then disappears despite no manual action
   - User can't get it back without re-enriching

## Root Cause Analysis

### Issue 1: Silent Cache Update Failure

**Problem:** The `refreshMetadata()` call in `useEnrichBookmark.onSuccess` is NOT AWAITED.

**Code (useBookmarks.ts:332):**
```typescript
// CRITICAL FIX: Refresh metadata with polling to wait for graph worker completion
console.log(`[useEnrichBookmark] Starting metadata refresh with polling for: ${id}`);
refreshMetadata(id);  // <-- NOT AWAITED! Fire and forget!

// Update the specific bookmark in the list cache
const currentBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());
```

**Why this is a problem:**
- `refreshMetadata()` is an async function that polls for up to 30 seconds
- The code doesn't wait for it to complete
- Components render immediately with stale cache
- Polling happens in background, but React has already rendered empty metadata
- Browser A's React Query cache is never updated

**Manifestation:**
- Polling starts and completes (you see logs)
- `setQueryData` is called (you see logs)
- BUT component already rendered before that happened
- React Query's subscriptions don't know about the cache update because components already "read" the old value

### Issue 2: BookmarkList Metadata Fetch Race Condition

**Problem:** When concept/entity filters are active, `BookmarkList` fetches metadata separately using `useQueries`, creating cache pollution.

**Code (BookmarkList.tsx:58-79):**
```typescript
const metadataQueries = useQueries({
  queries: (bookmarks || []).map((bookmark) => ({
    queryKey: ['bookmark-metadata-v3', bookmark.id],
    queryFn: async () => {
      const response = await fetch(`/api/graph/bookmarks/${bookmark.id}/related`);
      if (!response.ok) return { concepts: [], entities: [] };
      const result = await response.json();
      return {
        bookmarkId: bookmark.id,
        conceptIds: result.data.concepts?.map((c: any) => c.concept.id) || [],
        entityIds: result.data.entities?.map((e: any) => e.entity.id) || [],
      };
    },
    enabled: hasConceptOrEntityFilters && !!bookmarks,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })),
});
```

**Why this causes disappearance:**

1. User enriches bookmark, `refreshMetadata()` polls and sets cache with full data:
   ```typescript
   {
     concepts: [{ id, name, weight }],
     entities: [{ id, name, weight }]
   }
   ```

2. Bookmark list still has active filters, so `useQueries` runs and fetches metadata

3. The fetch returns the SAME data structure BUT the query function returns transformed data:
   ```typescript
   {
     bookmarkId: id,
     conceptIds: [id],      // <-- Different structure!
     entityIds: [id],
   }
   ```

4. React Query sees same key but different data structure

5. When components read the cache, they get:
   ```typescript
   metadata.concepts  // undefined or error!
   metadata.entities  // undefined or error!
   ```

6. Because the second query overwrote the first query's cached structure

**Root cause:** Two different query functions writing to the same cache key with different return types.

### Issue 3: Race Condition - List Invalidation Before Metadata Polling Completes

**Problem:** The enrichment flow can invalidate the bookmark list before metadata polling finishes.

**Code flow (useBookmarks.ts:326-346):**
```typescript
// CRITICAL FIX: Refresh metadata with polling...
refreshMetadata(id);  // <-- Not awaited, starts polling in background

// Update the specific bookmark in the list cache without full invalidation
const currentBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());
if (currentBookmarks) {
  const updatedBookmarks = currentBookmarks.map(bookmark =>
    bookmark.id === id ? data : bookmark
  );
  queryClient.setQueryData(bookmarksKeys.lists(), updatedBookmarks);
} else {
  // Fallback: if cache is empty, invalidate to refetch
  queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
}
```

**Problem sequence:**
1. Enrichment completes, `refreshMetadata()` starts polling (NOT AWAITED)
2. Meanwhile, bookmark list query completes
3. List query returns fresh bookmark data but NO metadata (backend returns just the bookmark)
4. Because metadata is fetched separately via a different endpoint
5. When metadata finally polls and caches (after 1-10 seconds), BookmarkListItem components don't re-render
6. User sees stale data from the combined bookmark+metadata view

## Technical Insights

### Why Tags Work But Metadata Doesn't

**Tags:**
- Returned in enrichment response alongside bookmark data
- `queryClient.setQueryData(bookmarksKeys.detail(id), data)` updates bookmark with tags
- Tags are part of Bookmark object, so whenever bookmark is queried, tags come with it
- Simple to cache because tags never change after enrichment

**Metadata (Concepts/Entities):**
- Generated AFTER enrichment by separate async graph workers
- Fetched from SEPARATE endpoint (`/api/graph/bookmarks/:id/related`)
- Cached in SEPARATE query key (`bookmark-metadata-v3`)
- Multiple components fetch metadata independently
- Multiple cache write patterns from different sources (BookmarkListItem, BookmarkNote, BookmarkList filtering)

### Why React Query DevTools Shows Cache Updates But Components Don't

When you see "cache was updated" in React Query DevTools but the component doesn't show the data:
- The cache update happened
- But the component wasn't "subscribed" at the moment the update happened
- Or the component's query instance was already unmounted
- Or component used `initialData` which bypasses subscriptions

## Solution Strategy

Fix requires addressing three issues:

1. **Make refreshMetadata properly trigger re-renders** - AWAIT the refresh
2. **Consolidate metadata cache writes** - Only one source of truth for each query key
3. **Prevent stale cache pollution** - Don't write different data structures to same key

