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
}

export const BookmarkNode = memo(({ data, selected }: NodeProps<BookmarkNodeData>) => {
  return (
    <div
      className={`bg-white border rounded-lg p-3 shadow-sm min-w-[200px] max-w-[280px] transition-all ${
        selected
          ? 'border-blue-500 shadow-md ring-2 ring-blue-500 ring-opacity-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
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
  prev.data.title === next.data.title
);

BookmarkNode.displayName = 'BookmarkNode';
