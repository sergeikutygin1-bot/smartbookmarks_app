"use client";

import { TwoPanel } from "@/components/layout/TwoPanel";
import { Sidebar } from "@/components/bookmarks/Sidebar";
import { NoteEditor } from "@/components/bookmarks/NoteEditor";
import { EnrichmentQueueStatus } from "@/components/bookmarks/EnrichmentQueueStatus";
import { BookmarkErrorBoundary } from "@/components/bookmarks/bookmark-error-boundary";

export default function Home() {
  return (
    <>
      <TwoPanel
        sidebar={<Sidebar />}
        main={
          <BookmarkErrorBoundary>
            <NoteEditor />
          </BookmarkErrorBoundary>
        }
      />

      {/* Global enrichment queue status - floating widget */}
      <EnrichmentQueueStatus />
    </>
  );
}
