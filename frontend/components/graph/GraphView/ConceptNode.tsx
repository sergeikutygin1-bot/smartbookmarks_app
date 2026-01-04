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

// Size tiers based on occurrence count
function getSizeClass(occurrenceCount?: number): { minWidth: string; padding: string; iconSize: string; fontSize: string } {
  const count = occurrenceCount || 0;

  if (count >= 10) {
    // Even more frequent (10+)
    return { minWidth: 'min-w-[200px]', padding: 'p-4', iconSize: 'w-5 h-5', fontSize: 'text-base' };
  } else if (count >= 3) {
    // More frequent (3-9)
    return { minWidth: 'min-w-[180px]', padding: 'p-3.5', iconSize: 'w-4.5 h-4.5', fontSize: 'text-sm' };
  } else {
    // Default (1-2)
    return { minWidth: 'min-w-[160px]', padding: 'p-3', iconSize: 'w-4 h-4', fontSize: 'text-sm' };
  }
}

export const ConceptNode = memo(({ data, selected }: NodeProps<ConceptNodeData>) => {
  const isHighlighted = (data as any).isHighlighted;
  const sizeClass = getSizeClass(data.occurrenceCount);

  return (
    <div
      className={`border rounded-lg shadow-sm max-w-[240px] transition-all cursor-pointer ${sizeClass.minWidth} ${sizeClass.padding} ${
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
        <Lightbulb className={`${sizeClass.iconSize} text-purple-600 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className={`${sizeClass.fontSize} font-medium text-black truncate`}>
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
