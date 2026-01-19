import { useMemo } from 'react';
import { useAnalyticsSummary } from './useAnalytics';

interface Insight {
  id: string;
  type: 'milestone' | 'alert' | 'tip';
  message: string;
  actionLabel?: string;
  actionHref?: string;
  timestamp?: Date;
}

export function useInsights() {
  const { data: summary } = useAnalyticsSummary();

  const insights = useMemo(() => {
    if (!summary) return [];

    const insights: Insight[] = [];

    // Milestone: First bookmark
    if (summary.bookmarks === 1) {
      insights.push({
        id: 'first-bookmark',
        type: 'milestone',
        message: '🎉 You saved your first bookmark!',
        timestamp: new Date(),
      });
    }

    // Milestone: 5 bookmarks
    if (summary.bookmarks === 5) {
      insights.push({
        id: '5-bookmarks',
        type: 'milestone',
        message: '🎯 Nice! You have 5 bookmarks saved',
        timestamp: new Date(),
      });
    }

    // Milestone: 10 bookmarks
    if (summary.bookmarks >= 10) {
      insights.push({
        id: '10-bookmarks',
        type: 'milestone',
        message: '⭐ Great work! You reached 10 bookmarks',
        timestamp: new Date(),
      });
    }

    // Tip: Encourage more bookmarks if low count
    if (summary.bookmarks < 5) {
      insights.push({
        id: 'add-more',
        type: 'tip',
        message: 'Save more bookmarks to unlock AI-powered insights',
        actionLabel: 'Add Bookmark',
        actionHref: '/',
      });
    }

    // Alert: Entities discovered
    if (summary.entities > 0) {
      insights.push({
        id: 'entities-found',
        type: 'milestone',
        message: `AI discovered ${summary.entities} ${summary.entities === 1 ? 'entity' : 'entities'} in your bookmarks`,
        actionLabel: 'View Graph',
        actionHref: '/graph',
      });
    }

    // Alert: Concepts discovered
    if (summary.concepts > 0) {
      insights.push({
        id: 'concepts-found',
        type: 'milestone',
        message: `Found ${summary.concepts} ${summary.concepts === 1 ? 'concept' : 'concepts'} across your content`,
        actionLabel: 'Explore',
        actionHref: '/graph',
      });
    }

    // Tip: Knowledge graph growing
    if (summary.relationships > 5) {
      insights.push({
        id: 'graph-growing',
        type: 'tip',
        message: `Your knowledge graph has ${summary.relationships} connections`,
        actionLabel: 'View Graph',
        actionHref: '/graph',
      });
    }

    // Return most recent insights (limit to 5)
    return insights.slice(0, 5);
  }, [summary]);

  return { insights, isLoading: !summary };
}
