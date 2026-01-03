'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Lightbulb } from 'lucide-react';

export interface ConceptNodeData {
  id: string;
  name: string;
  occurrenceCount?: number;
  parentConcept?: string;
}

export const ConceptNode = memo(({ data, selected }: NodeProps<ConceptNodeData>) => {
  const isHighlighted = (data as any).isHighlighted;

  return (
    <div
      className={`border rounded-lg p-3 shadow-sm min-w-[160px] max-w-[220px] transition-all cursor-pointer ${
        selected
          ? 'bg-purple-50 border-purple-500 shadow-md ring-2 ring-purple-500 ring-opacity-50'
          : isHighlighted
          ? 'bg-gray-50 border-purple-400 shadow-lg ring-2 ring-purple-300 ring-opacity-60'
          : 'bg-gray-50 border-gray-300 hover:border-purple-400 hover:shadow-md'
      }`}
      title="Click to highlight connected bookmarks"
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-purple-400"
      />

      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-purple-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-black truncate">
            {data.name}
          </div>
          {data.occurrenceCount && data.occurrenceCount > 1 && (
            <div className="text-xs text-gray-500 mt-0.5">
              {data.occurrenceCount} bookmarks
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-purple-400"
      />
    </div>
  );
}, (prev, next) =>
  prev.selected === next.selected &&
  prev.data.name === next.data.name &&
  prev.data.occurrenceCount === next.data.occurrenceCount &&
  (prev.data as any).isHighlighted === (next.data as any).isHighlighted
);

ConceptNode.displayName = 'ConceptNode';
