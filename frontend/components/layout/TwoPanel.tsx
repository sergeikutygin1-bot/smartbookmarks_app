"use client";

import { ReactNode } from "react";

interface TwoPanelProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function TwoPanel({ sidebar, main }: TwoPanelProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar - 1/5 width */}
      <aside className="w-1/5 min-w-[280px] max-w-[360px] h-full border-r border-border bg-sidebar overflow-hidden">
        {sidebar}
      </aside>

      {/* Main content - 4/5 width */}
      <main className="flex-1 overflow-hidden">
        {main}
      </main>
    </div>
  );
}
