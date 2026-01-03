'use client';

import { useGraphStore } from '@/store/graphStore';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export function GraphControls() {
  const { filters, setFilter } = useGraphStore();

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 space-y-3">
      {/* Node type filters */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-gray-700">Show</div>
        <div className="space-y-1">
          {[
            { key: 'bookmarks', label: 'Bookmarks' },
            { key: 'concepts', label: 'Concepts' },
            { key: 'entities', label: 'Entities' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={filters.nodeTypes.includes(key as any)}
                onChange={(e) => {
                  const current = filters.nodeTypes;
                  setFilter(
                    'nodeTypes',
                    e.target.checked
                      ? [...current, key as any]
                      : current.filter((t) => t !== key)
                  );
                }}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-1.5 pt-2 border-t border-gray-200">
        <div className="text-xs font-medium text-gray-700">Legend</div>
        <div className="space-y-1 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-white border border-gray-300 rounded"></div>
            <span>Bookmark</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-50 border border-gray-300 rounded"></div>
            <span>Concept</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
            <span>Entity</span>
          </div>
        </div>
      </div>
    </div>
  );
}
