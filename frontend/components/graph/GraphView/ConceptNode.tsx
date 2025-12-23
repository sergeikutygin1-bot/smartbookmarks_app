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
  return (
    <div
      className={`bg-gray-50 border rounded-lg p-3 shadow-sm min-w-[160px] max-w-[220px] transition-all ${
        selected
          ? 'border-purple-500 shadow-md ring-2 ring-purple-500 ring-opacity-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
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
  prev.data.occurrenceCount === next.data.occurrenceCount
);

ConceptNode.displayName = 'ConceptNode';
