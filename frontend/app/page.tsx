"use client";

import { useState } from "react";
import { TwoPanel } from "@/components/layout/TwoPanel";
import { Sidebar } from "@/components/bookmarks/Sidebar";
import { NoteEditor } from "@/components/bookmarks/NoteEditor";
import { CreateBookmarkDialog } from "@/components/bookmarks/CreateBookmarkDialog";

export default function Home() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <>
      <TwoPanel
        sidebar={<Sidebar onCreateClick={() => setIsCreateDialogOpen(true)} />}
        main={<NoteEditor onCreateClick={() => setIsCreateDialogOpen(true)} />}
      />

      <CreateBookmarkDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </>
  );
}
