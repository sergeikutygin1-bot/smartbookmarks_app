import { useQuery } from '@tanstack/react-query';
import { profileApi } from '@/lib/api';

/**
 * Query key factory for analytics
 */
export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: () => [...analyticsKeys.all, 'summary'] as const,
  trend: (days: number) => [...analyticsKeys.all, 'trend', days] as const,
  topEntities: (limit: number) => [...analyticsKeys.all, 'entities', limit] as const,
  topConcepts: (limit: number) => [...analyticsKeys.all, 'concepts', limit] as const,
  contentTypes: () => [...analyticsKeys.all, 'content-types'] as const,
  recentActivity: (limit: number) => [...analyticsKeys.all, 'activity', limit] as const,
};

/**
 * Get analytics summary (counts)
 */
export function useAnalyticsSummary() {
  return useQuery({
    queryKey: analyticsKeys.summary(),
    queryFn: () => profileApi.getAnalyticsSummary(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get bookmark trend over time
 */
export function useBookmarkTrend(days: number = 30) {
  return useQuery({
    queryKey: analyticsKeys.trend(days),
    queryFn: () => profileApi.getBookmarkTrend(days),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get top entities by occurrence count
 */
export function useTopEntities(limit: number = 10) {
  return useQuery({
    queryKey: analyticsKeys.topEntities(limit),
    queryFn: () => profileApi.getTopEntities(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get top concepts by occurrence count
 */
export function useTopConcepts(limit: number = 10) {
  return useQuery({
    queryKey: analyticsKeys.topConcepts(limit),
    queryFn: () => profileApi.getTopConcepts(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get content type distribution
 */
export function useContentTypeDistribution() {
  return useQuery({
    queryKey: analyticsKeys.contentTypes(),
    queryFn: () => profileApi.getContentTypeDistribution(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get recent activity (recent bookmarks)
 */
export function useRecentActivity(limit: number = 10) {
  return useQuery({
    queryKey: analyticsKeys.recentActivity(limit),
    queryFn: () => profileApi.getRecentActivity(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
