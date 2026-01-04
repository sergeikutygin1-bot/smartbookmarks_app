'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ExternalLink } from 'lucide-react';

export interface BookmarkNodeData {
  id: string;
  title: string;
  url: string;
  domain?: string;
  contentType?: string;
  isHighlighted?: boolean;
  isOverlap?: boolean;
}

export const BookmarkNode = memo(({ data, selected }: NodeProps<BookmarkNodeData>) => {
  const isHighlighted = data.isHighlighted;
  const isOverlap = data.isOverlap;

  return (
    <div
      className={`border rounded-lg p-4 shadow-md min-w-[220px] max-w-[300px] transition-all ${
        selected
          ? 'bg-blue-50 border-blue-500 shadow-lg ring-2 ring-blue-500 ring-opacity-50'
          : isOverlap
          ? 'bg-amber-50 border-amber-500 shadow-xl ring-4 ring-amber-400 ring-opacity-70'
          : isHighlighted
          ? 'bg-white border-blue-400 shadow-lg ring-2 ring-blue-300 ring-opacity-60'
          : 'bg-white border-gray-300 hover:border-gray-400 hover:shadow-md'
      }`}
      title={isOverlap ? 'Connected to multiple concepts/entities (overlap)' : undefined}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-gray-400"
      />

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-black truncate mb-1">
            {data.title}
          </div>
          {data.domain && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ExternalLink className="w-3 h-3" />
              <span className="truncate">{data.domain}</span>
            </div>
          )}
          {data.contentType && (
            <div className="mt-1">
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                {data.contentType}
              </span>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-gray-400"
      />
    </div>
  );
}, (prev, next) =>
  prev.selected === next.selected &&
  prev.data.title === next.data.title &&
  prev.data.isHighlighted === next.data.isHighlighted &&
  prev.data.isOverlap === next.data.isOverlap
);

BookmarkNode.displayName = 'BookmarkNode';
