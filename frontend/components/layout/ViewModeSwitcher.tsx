'use client';

import { motion } from 'framer-motion';
import { FileText, Network } from 'lucide-react';
import { ViewMode } from '@/store/viewModeStore';

interface ViewModeSwitcherProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeSwitcher({ mode, onChange }: ViewModeSwitcherProps) {
  const modes: { value: ViewMode; label: string; icon: typeof FileText }[] = [
    { value: 'note', label: 'Note', icon: FileText },
    { value: 'graph', label: 'Graph', icon: Network },
  ];

  return (
    <div
      role="tablist"
      aria-label="View mode switcher"
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border shadow-sm backdrop-blur-sm"
    >
      {modes.map(({ value, label, icon: Icon }) => {
        const isActive = mode === value;

        return (
          <motion.button
            key={value}
            role="tab"
            aria-selected={isActive}
            aria-controls="main-content-area"
            onClick={() => onChange(value)}
            className={`
              relative px-4 py-2 rounded-lg
              text-sm font-medium
              transition-all duration-200
              flex items-center gap-2
              ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'hover:bg-background/80 text-muted-foreground'
              }
            `}
            whileHover={!isActive ? { scale: 1.02 } : {}}
            whileTap={{ scale: 0.98 }}
          >
            <Icon className="h-4 w-4" />
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}
