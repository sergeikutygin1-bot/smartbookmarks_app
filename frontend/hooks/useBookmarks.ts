import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '@/lib/api';
import { Bookmark } from '@/store/bookmarksStore';

/**
 * Query key factory for bookmarks
 */
export const bookmarksKeys = {
  all: ['bookmarks'] as const,
  lists: () => [...bookmarksKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...bookmarksKeys.lists(), filters] as const,
  details: () => [...bookmarksKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookmarksKeys.details(), id] as const,
};

/**
 * Fetch all bookmarks
 */
export function useBookmarks() {
  return useQuery({
    queryKey: bookmarksKeys.lists(),
    queryFn: () => bookmarksApi.getAll(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Fetch a single bookmark by ID
 */
export function useBookmark(id: string) {
  return useQuery({
    queryKey: bookmarksKeys.detail(id),
    queryFn: () => bookmarksApi.getById(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Create a new bookmark with optimistic updates
 */
export function useCreateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { url: string; title?: string }) => bookmarksApi.create(data),
    onMutate: async (newBookmarkData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });

      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());

      // Optimistically update with temporary ID
      const optimisticBookmark: Bookmark = {
        id: 'temp-' + Date.now(),
        url: newBookmarkData.url,
        title: newBookmarkData.title || newBookmarkData.url,
        domain: new URL(newBookmarkData.url).hostname.replace('www.', ''),
        contentType: 'other',
        tags: [],
        summary: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      queryClient.setQueryData<Bookmark[]>(
        bookmarksKeys.lists(),
        (old) => [optimisticBookmark, ...(old || [])]
      );

      return { previousBookmarks };
    },
    onError: (err, newBookmark, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
    },
  });
}

/**
 * Update a bookmark with optimistic updates
 */
export function useUpdateBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Bookmark> }) =>
      bookmarksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.detail(id) });

      // Snapshot previous values
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());
      const previousBookmark = queryClient.getQueryData<Bookmark>(bookmarksKeys.detail(id));

      // Optimistically update lists
      queryClient.setQueryData<Bookmark[]>(bookmarksKeys.lists(), (old) =>
        old?.map((bookmark) =>
          bookmark.id === id
            ? { ...bookmark, ...data, updatedAt: new Date() }
            : bookmark
        )
      );

      // Optimistically update single bookmark
      if (previousBookmark) {
        queryClient.setQueryData<Bookmark>(bookmarksKeys.detail(id), {
          ...previousBookmark,
          ...data,
          updatedAt: new Date(),
        });
      }

      return { previousBookmarks, previousBookmark };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
      if (context?.previousBookmark) {
        queryClient.setQueryData(bookmarksKeys.detail(id), context.previousBookmark);
      }
    },
    onSuccess: (data, { id }) => {
      // Update cache with server response
      queryClient.setQueryData(bookmarksKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
    },
  });
}

/**
 * Delete a bookmark with optimistic updates
 */
export function useDeleteBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bookmarksApi.delete(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarksKeys.lists() });

      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(bookmarksKeys.lists());

      // Optimistically remove from list
      queryClient.setQueryData<Bookmark[]>(
        bookmarksKeys.lists(),
        (old) => old?.filter((bookmark) => bookmark.id !== id)
      );

      return { previousBookmarks };
    },
    onError: (err, id, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarksKeys.lists(), context.previousBookmarks);
      }
    },
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: bookmarksKeys.lists() });
    },
  });
}
