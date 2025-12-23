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

export const EntityNode = memo(({ data, selected }: NodeProps<EntityNodeData>) => {
  const Icon = entityIcons[data.entityType] || Building2;
  const iconColor = entityColors[data.entityType] || 'text-gray-600';

  return (
    <div
      className={`bg-gray-100 border rounded-lg p-2.5 shadow-sm min-w-[140px] max-w-[200px] transition-all ${
        selected
          ? 'border-orange-500 shadow-md ring-2 ring-orange-500 ring-opacity-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-orange-400"
      />

      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${iconColor} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-black truncate">
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
  prev.data.occurrenceCount === next.data.occurrenceCount
);

EntityNode.displayName = 'EntityNode';
