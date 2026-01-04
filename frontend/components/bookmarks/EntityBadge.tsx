'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Building2, User, Cpu, Package, MapPin, LucideIcon } from 'lucide-react';

const ENTITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: LucideIcon }> = {
  person: {
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-400',
    text: 'text-blue-700',
    icon: User
  },
  company: {
    bg: 'bg-green-50 hover:bg-green-100',
    border: 'border-green-400',
    text: 'text-green-700',
    icon: Building2
  },
  technology: {
    bg: 'bg-orange-50 hover:bg-orange-100',
    border: 'border-orange-400',
    text: 'text-orange-700',
    icon: Cpu
  },
  product: {
    bg: 'bg-pink-50 hover:bg-pink-100',
    border: 'border-pink-400',
    text: 'text-pink-700',
    icon: Package
  },
  location: {
    bg: 'bg-teal-50 hover:bg-teal-100',
    border: 'border-teal-400',
    text: 'text-teal-700',
    icon: MapPin
  }
};

interface EntityBadgeProps {
  entity: {
    id: string;
    name: string;
    entityType: 'person' | 'company' | 'technology' | 'product' | 'location';
  };
  weight?: number;
  onClick?: (entity: EntityBadgeProps['entity']) => void;
  size?: 'compact' | 'default';
  showWeight?: boolean;
  isActive?: boolean;
}

export function EntityBadge({
  entity,
  weight,
  onClick,
  size = 'compact',
  showWeight = false,
  isActive = false
}: EntityBadgeProps) {
  const style = ENTITY_STYLES[entity.entityType] || ENTITY_STYLES.company;
  const Icon = style.icon;

  const sizeClasses = size === 'compact'
    ? 'text-[10px] px-2 py-0.5 h-5'
    : 'text-xs px-3 py-1 h-6';

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation(); // Prevent parent click handlers
      onClick(entity);
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
          ${style.bg} border ${style.border} ${style.text}
          hover:shadow-sm transition-all duration-200
          ${onClick ? 'cursor-pointer' : ''}
          ${isActive ? 'ring-2 ring-opacity-50' : ''}
        `}
        onClick={handleClick}
      >
        <Icon className="h-3 w-3" />
        <span className={size === 'compact' ? 'max-w-[120px] truncate' : ''}>{entity.name}</span>
        {showWeight && weight && (
          <span className="opacity-70 ml-0.5">
            ({Math.round(weight * 100)}%)
          </span>
        )}
      </Badge>
    </motion.div>
  );
}
