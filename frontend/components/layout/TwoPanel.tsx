"use client";

import { ReactNode } from "react";

interface TwoPanelProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function TwoPanel({ sidebar, main }: TwoPanelProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar Container - with padding for inset effect */}
      <div className="w-1/4 min-w-[320px] max-w-[450px] h-full p-3 flex">
        {/* Sidebar - ChatGPT-style floating panel with rounded corners */}
        <aside className="flex-1 rounded-xl bg-sidebar overflow-hidden shadow-sm border border-border/50">
          {sidebar}
        </aside>
      </div>

      {/* Main content - 4/5 width */}
      <main className="flex-1 overflow-hidden">
        {main}
      </main>
    </div>
  );
}
