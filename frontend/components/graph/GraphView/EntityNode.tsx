'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Building2, User, Cpu, Package, MapPin } from 'lucide-react';

export interface EntityNodeData {
  id: string;
  name: string;
  entityType: 'person' | 'company' | 'technology' | 'product' | 'location';
  occurrenceCount?: number;
}

const entityIcons = {
  person: User,
  company: Building2,
  technology: Cpu,
  product: Package,
  location: MapPin,
};

const entityColors = {
  person: 'text-blue-600',
  company: 'text-green-600',
  technology: 'text-orange-600',
  product: 'text-pink-600',
  location: 'text-teal-600',
};

const entityBgColors = {
  person: 'bg-blue-50',
  company: 'bg-green-50',
  technology: 'bg-orange-50',
  product: 'bg-pink-50',
  location: 'bg-teal-50',
};

const entityBorderColors = {
  person: 'border-blue-500 ring-blue-500',
  company: 'border-green-500 ring-green-500',
  technology: 'border-orange-500 ring-orange-500',
  product: 'border-pink-500 ring-pink-500',
  location: 'border-teal-500 ring-teal-500',
};

const entityHighlightColors = {
  person: 'border-blue-400 ring-blue-300',
  company: 'border-green-400 ring-green-300',
  technology: 'border-orange-400 ring-orange-300',
  product: 'border-pink-400 ring-pink-300',
  location: 'border-teal-400 ring-teal-300',
};

// Size tiers based on occurrence count
function getSizeClass(occurrenceCount?: number): { minWidth: string; padding: string; iconSize: string; fontSize: string } {
  const count = occurrenceCount || 0;

  if (count >= 10) {
    // Even more frequent (10+)
    return { minWidth: 'min-w-[180px]', padding: 'p-3.5', iconSize: 'w-4.5 h-4.5', fontSize: 'text-sm' };
  } else if (count >= 3) {
    // More frequent (3-9)
    return { minWidth: 'min-w-[160px]', padding: 'p-3', iconSize: 'w-4 h-4', fontSize: 'text-xs' };
  } else {
    // Default (1-2)
    return { minWidth: 'min-w-[140px]', padding: 'p-2.5', iconSize: 'w-3.5 h-3.5', fontSize: 'text-xs' };
  }
}

export const EntityNode = memo(({ data, selected }: NodeProps<EntityNodeData>) => {
  const Icon = entityIcons[data.entityType] || Building2;
  const iconColor = entityColors[data.entityType] || 'text-gray-600';
  const bgColor = entityBgColors[data.entityType] || 'bg-gray-50';
  const borderColor = entityBorderColors[data.entityType] || 'border-gray-500 ring-gray-500';
  const highlightColor = entityHighlightColors[data.entityType] || 'border-gray-400 ring-gray-300';
  const isHighlighted = (data as any).isHighlighted;
  const sizeClass = getSizeClass(data.occurrenceCount);

  return (
    <div
      className={`border rounded-lg shadow-sm max-w-[220px] transition-all cursor-pointer ${sizeClass.minWidth} ${sizeClass.padding} ${
        selected
          ? `${bgColor} ${borderColor} shadow-md ring-2 ring-opacity-50`
          : isHighlighted
          ? `bg-gray-100 ${highlightColor} shadow-lg ring-2 ring-opacity-60`
          : 'bg-gray-100 border-gray-300 hover:border-gray-400 hover:shadow-md'
      }`}
      title="Click to highlight connected bookmarks"
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-orange-400"
      />

      <div className="flex items-center gap-2">
        <Icon className={`${sizeClass.iconSize} ${iconColor} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className={`${sizeClass.fontSize} font-medium text-black truncate`}>
            {data.name}
          </div>
          {data.occurrenceCount && data.occurrenceCount > 1 && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {data.occurrenceCount}x
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-orange-400"
      />
    </div>
  );
}, (prev, next) =>
  prev.selected === next.selected &&
  prev.data.name === next.data.name &&
  prev.data.occurrenceCount === next.data.occurrenceCount &&
  (prev.data as any).isHighlighted === (next.data as any).isHighlighted
);

EntityNode.displayName = 'EntityNode';
