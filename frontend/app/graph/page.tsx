'use client';

import { GraphCanvas } from '@/components/graph/GraphView/GraphCanvas';

export default function GraphPage() {
  return (
    <div className="h-screen w-full bg-white">
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-semibold text-black">Knowledge Graph</h1>
          <p className="text-sm text-gray-600 mt-1">
            Explore connections between your bookmarks
          </p>
        </div>
      </div>

      {/* Graph Content */}
      <div className="h-[calc(100vh-100px)]">
        <GraphCanvas />
      </div>
    </div>
  );
}
