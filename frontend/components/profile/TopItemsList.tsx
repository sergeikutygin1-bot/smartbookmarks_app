'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useProfilePanelStore } from '@/store/profilePanelStore';

interface TopItem {
  id: string;
  name: string;
  occurrenceCount: number;
}

interface TopItemsListProps {
  title: string;
  items: TopItem[];
  isLoading: boolean;
  accentColor?: string;
  linkBase?: string;
}

export function TopItemsList({
  title,
  items = [],
  isLoading,
  accentColor = 'hsl(var(--primary))',
  linkBase,
}: TopItemsListProps) {
  const { close } = useProfilePanelStore();

  if (isLoading) {
    return (
      <Card className="p-6 bg-card border border-border shadow-sm">
        <h3 className="text-lg font-serif font-semibold mb-4 tracking-tight">
          {title}
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-6 bg-card border border-border shadow-sm">
        <h3 className="text-lg font-serif font-semibold mb-4 tracking-tight">
          {title}
        </h3>
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No data yet</p>
        </div>
      </Card>
    );
  }

  const maxCount = Math.max(...items.map((item) => item.occurrenceCount));

  return (
    <Card className="p-6 bg-card border border-border shadow-sm">
      <h3 className="text-lg font-serif font-semibold mb-4 tracking-tight">
        {title}
      </h3>

      <div className="space-y-3">
        {items.slice(0, 5).map((item) => {
          const percentage = (item.occurrenceCount / maxCount) * 100;
          const ItemWrapper = linkBase ? Link : 'div';
          const wrapperProps = linkBase
            ? { href: `${linkBase}/${item.id}`, onClick: close }
            : {};

          return (
            <ItemWrapper
              key={item.id}
              {...wrapperProps}
              className="block group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {item.name}
                </span>
                <span className="text-xs text-muted-foreground font-mono tabular-nums ml-2">
                  {item.occurrenceCount}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: accentColor,
                  }}
                />
              </div>
            </ItemWrapper>
          );
        })}
      </div>

      {items.length > 5 && (
        <div className="mt-4 text-center">
          <span className="text-xs text-muted-foreground">
            Showing top 5 of {items.length} total
          </span>
        </div>
      )}
    </Card>
  );
}
