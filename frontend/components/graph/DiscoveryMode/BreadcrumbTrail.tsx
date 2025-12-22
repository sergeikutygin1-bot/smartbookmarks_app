'use client';

import { ChevronRight, Home, FileText, Lightbulb, Building2 } from 'lucide-react';

interface PathNode {
  id: string;
  type: 'bookmark' | 'concept' | 'entity';
  name: string;
}

interface BreadcrumbTrailProps {
  path: PathNode[];
  onNodeClick: (index: number) => void;
  onReset: () => void;
}

const nodeIcons = {
  bookmark: FileText,
  concept: Lightbulb,
  entity: Building2,
};

const nodeColors = {
  bookmark: 'text-blue-600',
  concept: 'text-purple-600',
  entity: 'text-green-600',
};

export function BreadcrumbTrail({ path, onNodeClick, onReset }: BreadcrumbTrailProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Home button */}
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-gray-600 hover:text-gray-900"
        title="Back to start"
      >
        <Home className="w-4 h-4" />
      </button>

      <ChevronRight className="w-4 h-4 text-gray-400" />

      {/* Breadcrumb items */}
      <div className="flex items-center gap-2 flex-wrap">
        {path.map((node, index) => {
          const Icon = nodeIcons[node.type];
          const color = nodeColors[node.type];
          const isLast = index === path.length - 1;

          return (
            <div key={`${node.type}-${node.id}-${index}`} className="flex items-center gap-2">
              <button
                onClick={() => onNodeClick(index)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
                  isLast
                    ? 'bg-gray-100 text-black font-medium'
                    : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900'
                }`}
                disabled={isLast}
              >
                <Icon className={`w-3.5 h-3.5 ${isLast ? color : 'text-gray-500'}`} />
                <span className="text-sm max-w-[200px] truncate">{node.name}</span>
              </button>

              {!isLast && <ChevronRight className="w-4 h-4 text-gray-400" />}
            </div>
          );
        })}
      </div>

      {/* Path depth indicator */}
      {path.length > 1 && (
        <div className="ml-auto text-xs text-gray-500">
          Depth: {path.length - 1} {path.length === 2 ? 'hop' : 'hops'}
        </div>
      )}
    </div>
  );
}
