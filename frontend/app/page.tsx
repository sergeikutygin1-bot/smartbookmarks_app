"use client";

import { TwoPanel } from "@/components/layout/TwoPanel";
import { Sidebar } from "@/components/bookmarks/Sidebar";
import { NoteEditor } from "@/components/bookmarks/NoteEditor";
import { EnrichmentQueueStatus } from "@/components/bookmarks/EnrichmentQueueStatus";

export default function Home() {
  return (
    <>
      <TwoPanel sidebar={<Sidebar />} main={<NoteEditor />} />

      {/* Global enrichment queue status - floating widget */}
      <EnrichmentQueueStatus />
    </>
  );
}
