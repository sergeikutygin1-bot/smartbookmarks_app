"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ReactNode, useState, useEffect } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Show cached data immediately, refetch in background (stale-while-revalidate)
            staleTime: 1000 * 60 * 5,        // Data fresh for 5 minutes
            gcTime: 1000 * 60 * 60 * 24,     // Keep in cache 24 hours (formerly cacheTime)

            // Stale-while-revalidate pattern
            refetchOnWindowFocus: true,      // Refresh when user returns to tab
            refetchOnReconnect: true,        // Refresh after offline
            refetchOnMount: false,           // Don't refetch if data is fresh

            // Retry with exponential backoff
            retry: 3,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
        },
      })
  );

  // Set up persistence to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: 'smartbookmarks-cache',
        serialize: (data) => JSON.stringify(data),
        deserialize: (data) => {
          const parsed = JSON.parse(data);

          // Transform bookmarks to convert date strings back to Date objects
          if (parsed?.clientState?.queries) {
            parsed.clientState.queries.forEach((query: any) => {
              if (query?.state?.data) {
                const data = query.state.data;

                // Handle array of bookmarks
                if (Array.isArray(data)) {
                  data.forEach((bookmark: any) => {
                    if (bookmark?.createdAt) bookmark.createdAt = new Date(bookmark.createdAt);
                    if (bookmark?.updatedAt) bookmark.updatedAt = new Date(bookmark.updatedAt);
                    if (bookmark?.processedAt) bookmark.processedAt = bookmark.processedAt ? new Date(bookmark.processedAt) : null;
                  });
                }
                // Handle single bookmark
                else if (data?.createdAt) {
                  data.createdAt = new Date(data.createdAt);
                  data.updatedAt = new Date(data.updatedAt);
                  data.processedAt = data.processedAt ? new Date(data.processedAt) : null;
                }
              }
            });
          }

          return parsed;
        },
      });

      persistQueryClient({
        queryClient,
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
      });
    }
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
