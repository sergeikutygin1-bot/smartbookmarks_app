'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useInsights } from '@/hooks/useInsights';
import { useProfilePanelStore } from '@/store/profilePanelStore';

export function InsightsFeed() {
  const { insights, isLoading } = useInsights();
  const { close } = useProfilePanelStore();

  if (isLoading) {
    return (
      <Card className="p-6 bg-card border border-border shadow-sm">
        <h2 className="text-lg font-serif font-semibold mb-4 tracking-tight">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border border-border shadow-sm">
      <h2 className="text-lg font-serif font-semibold mb-4 tracking-tight">
        Recent Activity
      </h2>

      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-accent/5 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Simple icon based on type */}
              <div className="flex-shrink-0 mt-0.5">
                {insight.type === 'milestone' && (
                  <span className="text-lg">🎯</span>
                )}
                {insight.type === 'alert' && (
                  <span className="text-lg">⚡</span>
                )}
                {insight.type === 'tip' && (
                  <span className="text-lg">💡</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-relaxed">
                  {insight.message}
                </p>

                {insight.actionLabel && insight.actionHref && (
                  <Link
                    href={insight.actionHref}
                    onClick={close}
                    className="inline-block mt-2 text-xs text-primary hover:underline"
                  >
                    {insight.actionLabel} →
                  </Link>
                )}
              </div>

              {insight.timestamp && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(insight.timestamp)}
                </span>
              )}
            </div>
          </div>
        ))}

        {insights.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No activity yet</p>
            <p className="text-xs mt-1">Start saving bookmarks to see insights here</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}
