'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Lightbulb } from 'lucide-react';

interface ConceptBadgeProps {
  concept: {
    id: string;
    name: string;
  };
  weight?: number;
  onClick?: (concept: ConceptBadgeProps['concept']) => void;
  size?: 'compact' | 'default';
  showWeight?: boolean;
  isActive?: boolean;
}

export function ConceptBadge({
  concept,
  weight,
  onClick,
  size = 'compact',
  showWeight = false,
  isActive = false
}: ConceptBadgeProps) {
  const sizeClasses = size === 'compact'
    ? 'text-[10px] px-2 py-0.5 h-5'
    : 'text-xs px-3 py-1 h-6';

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation(); // Prevent parent click handlers
      onClick(concept);
    }
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Badge
        className={`
          ${sizeClasses}
          flex items-center gap-1 flex-shrink-0 rounded-md
          bg-purple-50 border border-purple-400 text-purple-700
          hover:bg-purple-100 hover:shadow-sm
          transition-all duration-200
          ${onClick ? 'cursor-pointer' : ''}
          ${isActive ? 'ring-2 ring-purple-500 ring-opacity-50' : ''}
        `}
        onClick={handleClick}
      >
        <Lightbulb className="h-3 w-3" />
        <span className={size === 'compact' ? 'max-w-[120px] truncate' : ''}>{concept.name}</span>
        {showWeight && weight && (
          <span className="opacity-70 ml-0.5">
            ({Math.round(weight * 100)}%)
          </span>
        )}
      </Badge>
    </motion.div>
  );
}
