# Metadata Cache Issues - Detailed Root Cause Analysis

## Executive Summary

Two critical bugs prevented metadata (concepts/entities) from working reliably:

1. **Silent cache update failure** - Polling completed but components never saw the data
2. **Cache structure pollution** - Multiple query functions wrote different data types to the same cache key

Both are now fixed. The solution involved one line change to `await` the async refresh, and one cache key rename to isolate filtering logic.

---

## Issue 1: New Enrichments Don't Show in Current Browser

### Symptom
- User enriches bookmark in Browser A
- Metadata doesn't appear in Browser A's current view
- User closes and reopens Browser A (cache clears) → metadata appears
- Or user opens Browser B → metadata appears immediately

### Root Cause: Not Awaiting Async Refresh

**Location:** `frontend/hooks/useBookmarks.ts`, line 332 in `useEnrichBookmark.onSuccess`

**Original Code:**
```typescript
onSuccess: (data, id) => {
  // ... update bookmark cache ...

  // WRONG: Fire-and-forget async call
  refreshMetadata(id);  // <-- This doesn't wait!

  // Component renders immediately with stale cache
  // Meanwhile, refreshMetadata is polling in background...
};
```

**Why This Fails:**

1. **React's Render Timing:**
   ```
   t=0: User clicks "Enrich"
   t=X: Enrichment completes, onSuccess fires
   t=X+1: refreshMetadata() started (async, not awaited)
   t=X+2: React Query notifies subscribers
   t=X+3: Components re-render with enriched bookmark data
   t=X+10: Background polling finally finds metadata
   t=X+11: Cache updated BUT components already rendered with stale metadata
   ```

2. **React Query Subscription Model:**
   - When a component uses `useQuery()`, it subscribes to cache updates
   - React Query only notifies active subscribers when data changes
   - If the component already rendered with empty data (because polling hadn't finished), it won't re-render when the async cache update happens later
   - The component holds onto the "empty metadata" state

3. **Why Cache DevTools Shows Success:**
   - React Query DevTools shows ALL cache updates, even if no components see them
   - Just because cache was updated doesn't mean subscribed components got notified
   - The component that read the cache earlier "cached" the response in its render cycle

4. **Why Tags Work But Metadata Doesn't:**
   ```
   Tags:
   - Returned in same response as enrichment
   - Cache updated synchronously
   - Components see update immediately

   Metadata:
   - Returned from SEPARATE async endpoint
   - Cache updated asynchronously
   - Components might render before update happens
   ```

### The Fix

**Changed to:**
```typescript
onSuccess: async (data, id) => {  // <-- Made async
  // ... update bookmark cache ...

  // RIGHT: Await the refresh
  try {
    await refreshMetadata(id);  // <-- NOW WAITS!
    console.log('Metadata refresh completed');
  } catch (error) {
    console.error('Metadata refresh failed');
  }

  // Component renders AFTER metadata is cached
};
```

**Why This Works:**

```
t=0: User clicks "Enrich"
t=X: Enrichment completes, onSuccess fires
t=X+1: refreshMetadata() started and we AWAIT
t=X+1 to X+10: Polling happens (waits for graph workers)
t=X+10: Metadata arrives and cache is updated
t=X+11: onSuccess completes, React Query notifies subscribers
t=X+12: Components re-render with FRESH metadata
✓ Metadata is already in cache when components render
```

**Key Insight:** The mutation's `onSuccess` handler can be async. React Query will wait for it to complete before triggering re-renders.

---

## Issue 2: Metadata Disappears After Enrichment

### Symptom
- Metadata appears briefly after enrichment
- After a few seconds or actions, it disappears
- Console doesn't show any cache invalidation
- Happens randomly, sometimes after filtering by concept/entity

### Root Cause: Cache Structure Pollution

**Location:** `frontend/components/bookmarks/BookmarkList.tsx`, lines 58-79

**Original Problem:**

Two different React Query hooks were writing to the SAME cache key with DIFFERENT data structures:

**Hook 1: BookmarkListItem/BookmarkNote**
```typescript
// Reads from cache key: ['bookmark-metadata-v3', id]
const { data: metadata } = useBookmarkMetadata(id);

// Expected structure:
metadata = {
  concepts: [{ id, name, weight }],
  entities: [{ id, name, weight, entityType }]
}

// Rendered as:
{metadata.concepts.map(c => <ConceptBadge key={c.id} />)}
{metadata.entities.map(e => <EntityBadge key={e.id} />)}
```

**Hook 2: BookmarkList Filtering**
```typescript
// Writes to SAME cache key: ['bookmark-metadata-v3', id]
const metadataQueries = useQueries({
  queries: bookmarks.map((bookmark) => ({
    queryKey: ['bookmark-metadata-v3', bookmark.id],  // <-- SAME KEY!
    queryFn: async () => {
      const response = await fetch(`/api/graph/bookmarks/${id}/related`);
      const result = await response.json();

      // DIFFERENT STRUCTURE!
      return {
        bookmarkId: bookmark.id,
        conceptIds: result.data.concepts?.map((c) => c.concept.id),  // <-- Different!
        entityIds: result.data.entities?.map((e) => e.entity.id),    // <-- Different!
      };
    },
  })),
});
```

**The Cache Collision:**

```
Timeline:
t=0: User enriches bookmark A
t=5: BookmarkListItem queries and caches metadata:
     {'concepts': [{id, name, weight}], 'entities': [{...}]}

t=6: Component renders, shows concepts/entities badges ✓

t=7: User clicks concept filter button
t=8: BookmarkList filtering enabled, useQueries runs
t=9: Filtering query fetches data and OVERWRITES cache with:
     {'bookmarkId': '...', 'conceptIds': [id], 'entityIds': [id]}

t=10: BookmarkListItem re-renders, tries to access:
      metadata.concepts  --> undefined or type error!
      metadata.entities  --> undefined or type error!

✗ Metadata disappears because data structure changed
```

**Why This Is Subtle:**

1. **Same endpoint, different transformations:**
   - Both hooks call the SAME backend endpoint
   - Both call `/api/graph/bookmarks/:id/related`
   - But they transform the response differently
   - The cache key should match the data structure

2. **React Query's cache is simple:**
   - It doesn't know about data types or structures
   - It just stores whatever the query function returns
   - If two query functions write to same key with different shapes, last one wins
   - Components using the old shape now get corrupted data

3. **Non-deterministic timing:**
   - Whether filtering query overwrites display query depends on timing
   - If filtering query runs before enrichment completes: might not cause issues
   - If filtering query runs after enrichment: overwrites display cache
   - This explains why it's random and hard to reproduce

### The Fix

**Changed from:**
```typescript
// In BookmarkList.tsx filtering logic
const metadataQueries = useQueries({
  queries: bookmarks.map((bookmark) => ({
    queryKey: ['bookmark-metadata-v3', bookmark.id],  // WRONG: same as display
    queryFn: async () => {
      // ... fetch and transform ...
      return {
        bookmarkId: id,
        conceptIds: [...],
        entityIds: [...]
      };
    },
  })),
});
```

**To:**
```typescript
// In BookmarkList.tsx filtering logic
const metadataQueries = useQueries({
  queries: bookmarks.map((bookmark) => ({
    queryKey: ['bookmark-metadata-for-filtering', bookmark.id],  // RIGHT: separate key
    queryFn: async () => {
      // ... fetch and transform (SAME as before) ...
      return {
        bookmarkId: id,
        conceptIds: [...],
        entityIds: [...]
      };
    },
  })),
});
```

**Why This Works:**

```
t=0: User enriches bookmark A
t=5: BookmarkListItem caches to ['bookmark-metadata-v3', A]:
     {concepts, entities}  ← Display structure

t=7: User clicks concept filter
t=8: BookmarkList filtering caches to ['bookmark-metadata-for-filtering', A]:
     {bookmarkId, conceptIds, entityIds}  ← Filtering structure

t=10: BookmarkListItem reads from ['bookmark-metadata-v3', A]:
      Still has {concepts, entities}  ✓ Correct!

t=11: Filtering logic reads from ['bookmark-metadata-for-filtering', A]:
      Has {conceptIds, entityIds}  ✓ Correct!

✓ No collision, no data corruption
```

**Key Insight:** Cache keys should be specific to the data structure. Different transforms = different keys.

---

## Why Tags Work But Metadata Doesn't

### Tags (Works Perfectly)
```
1. Enrichment completes
2. Backend returns: { tags: ['tag1', 'tag2'] }
3. Frontend caches in Bookmark object
4. Components read tags from Bookmark
5. Tags stay with Bookmark forever (immutable after enrichment)
6. No separate queries, no async delays
```

**Why Tags Are Reliable:**
- Single query, single response
- Synchronous cache update
- Returned alongside bookmark (not separate endpoint)
- Never change after enrichment
- No async workers in backend

### Metadata (Was Broken)
```
1. Enrichment completes
2. Frontend tries to cache metadata
3. But metadata is being generated by async graph workers (not done yet)
4. Polling must happen (30-second race condition window)
5. Multiple places fetch metadata independently
6. Multiple cache write patterns with different structures
7. Async updates cause timing issues with React renders
8. Filtering logic collides with display logic
```

**Why Metadata Is Hard:**
- Two-stage process: enrichment + graph workers
- Separate endpoint from bookmark
- Can change (concepts/entities are computed dynamically)
- Multiple components fetch independently
- Requires race condition handling (polling)
- Filtering logic needed separate cache

---

## Technical Details: React Query Subscriptions

### Why Components Don't See Async Cache Updates

React Query uses a subscription model:

```typescript
// When component mounts
useQuery(['bookmark-metadata-v3', id], async () => {
  const data = await fetch(...);
  return data;  // Store in cache
});

// React Query maintains a list of subscribers for this key
// When this query runs, React Query notifies all subscribers

// Later, if something calls setQueryData:
queryClient.setQueryData(['bookmark-metadata-v3', id], newData);

// React Query notifies subscribers that cache changed
// Subscribers re-render with new data
```

**The Problem with Fire-and-Forget:**

```typescript
onSuccess: (data, id) => {
  // Component reads cache here: {concepts: []}
  const metadata = queryClient.getQueryData(['bookmark-metadata-v3', id]);

  // This starts async but doesn't wait
  refreshMetadata(id);  // <-- Fire-and-forget

  // React renders component with empty metadata
  // Meanwhile, refreshMetadata is running in background

  // 10 seconds later...
  queryClient.setQueryData(['bookmark-metadata-v3', id], {concepts: [...], entities: [...]});

  // React Query notifies subscribers
  // But if component is no longer reading this cache (already rendered with empty data),
  // or if component's query instance was destroyed, update might not trigger re-render
};
```

**Why Awaiting Fixes It:**

```typescript
onSuccess: async (data, id) => {
  // Component hasn't rendered yet - onSuccess is still async
  await refreshMetadata(id);  // WAIT for cache update

  // Now cache has: {concepts: [...], entities: [...]}

  // Return from onSuccess
  // React Query notifies subscribers
  // Component renders with FRESH metadata in cache
};
```

The key is that React Query waits for `onSuccess` to complete before notifying subscribers of the mutation completion.

---

## Lessons Learned

### 1. Async Operations Need Coordination
- Don't fire-and-forget async operations that affect render
- Either await them or trigger them through established patterns
- Use mutation lifecycle methods correctly

### 2. Cache Keys Must Match Data Structures
- Different data shapes = different cache keys
- Same key with different structures = corruption
- Think about cache contracts

### 3. Multiple Access Patterns Need Separation
- Display queries vs. filtering queries vs. caching logic
- Each pattern should have its own cache key
- Or use a single pattern and derive everything from it

### 4. Metadata Is Harder Than Data
- Data that doesn't change: can cache indefinitely
- Data that's computed on-demand: need polling for race conditions
- Data that has multiple access patterns: need cache isolation
- Metadata has all three!

### 5. Timing Issues Are Hard to Debug
- Non-deterministic reproduction
- DevTools show success but components show failure
- Need comprehensive logging to trace the exact timing
- Sometimes "works on first try, breaks on second" is a timing issue

---

## Verification

To verify these fixes work:

1. **Check the await:** `useBookmarks.ts` line 334 has `await refreshMetadata(id)`
2. **Check cache isolation:** `BookmarkList.tsx` line 66 uses `'bookmark-metadata-for-filtering'` key
3. **Check logging:** Console shows all stages of enrichment and caching
4. **Test behavior:** Metadata appears immediately and persists

The fixes are minimal, focused, and address the root causes without changing the overall architecture.

