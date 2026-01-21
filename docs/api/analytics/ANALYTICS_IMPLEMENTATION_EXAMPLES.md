# Analytics Implementation Examples

## Quick Reference Guide with Code Samples

This document provides concrete implementation examples for the Smart Bookmarks analytics framework. Use this as a reference when building individual features.

---

## Table of Contents

1. [Backend: Streak Calculation](#1-backend-streak-calculation)
2. [Backend: Insight Generation](#2-backend-insight-generation)
3. [Backend: Heatmap Data Query](#3-backend-heatmap-data-query)
4. [Frontend: Trend Chart Component](#4-frontend-trend-chart-component)
5. [Frontend: Streak Display](#5-frontend-streak-display)
6. [Frontend: Insight Card](#6-frontend-insight-card)
7. [Redis Caching Patterns](#7-redis-caching-patterns)
8. [A/B Testing Framework](#8-ab-testing-framework)

---

## 1. Backend: Streak Calculation

### File: `backend/src/services/analyticsService.ts`

```typescript
import prisma from '../db/prisma';
import { redis } from '../config/redis';

interface StreakData {
  current: {
    days: number;
    startDate: string;
    endDate: string;
  };
  longest: {
    days: number;
    startDate: string;
    endDate: string;
  };
  freezesRemaining: number;
  nextMilestone: {
    days: number;
    daysRemaining: number;
    progress: number;
  };
}

export async function calculateUserStreak(userId: string): Promise<StreakData> {
  // Check cache first
  const cacheKey = `analytics:${userId}:streak`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Get all distinct save dates, ordered DESC
  const saveDates = await prisma.$queryRaw<Array<{ save_date: Date }>>`
    SELECT DISTINCT DATE(created_at) as save_date
    FROM bookmarks
    WHERE user_id = ${userId}
    ORDER BY save_date DESC
  `;

  if (saveDates.length === 0) {
    const emptyStreak: StreakData = {
      current: { days: 0, startDate: '', endDate: '' },
      longest: { days: 0, startDate: '', endDate: '' },
      freezesRemaining: 2,
      nextMilestone: { days: 7, daysRemaining: 7, progress: 0 },
    };
    await redis.setex(cacheKey, 60, JSON.stringify(emptyStreak)); // 1 min TTL
    return emptyStreak;
  }

  // Calculate current streak
  let currentStreakDays = 1;
  let currentStreakStart = saveDates[0].save_date;
  let currentStreakEnd = saveDates[0].save_date;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastSave = new Date(saveDates[0].save_date);
  lastSave.setHours(0, 0, 0, 0);

  // Check if streak is active (saved today or yesterday)
  const isActive = lastSave >= yesterday;

  if (isActive) {
    for (let i = 1; i < saveDates.length; i++) {
      const currentDate = new Date(saveDates[i - 1].save_date);
      const prevDate = new Date(saveDates[i].save_date);
      const dayDiff = Math.floor(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (dayDiff === 1) {
        // Consecutive days
        currentStreakDays++;
        currentStreakStart = saveDates[i].save_date;
      } else if (dayDiff === 2) {
        // 1-day gap (grace period / freeze)
        const freezeUsed = await checkFreezeAvailable(userId);
        if (freezeUsed) {
          currentStreakDays++;
          currentStreakStart = saveDates[i].save_date;
          await useFreezeToken(userId);
        } else {
          break; // Streak broken
        }
      } else {
        break; // Streak broken
      }
    }
  } else {
    // Streak is broken
    currentStreakDays = 0;
    currentStreakStart = lastSave;
    currentStreakEnd = lastSave;
  }

  // Calculate longest streak (historical)
  const longestStreak = await calculateLongestHistoricalStreak(userId, saveDates);

  // Determine next milestone
  const milestones = [7, 14, 30, 42, 100, 365];
  const nextMilestone = milestones.find((m) => m > currentStreakDays) || 365;

  const streakData: StreakData = {
    current: {
      days: currentStreakDays,
      startDate: currentStreakStart.toISOString().split('T')[0],
      endDate: currentStreakEnd.toISOString().split('T')[0],
    },
    longest: longestStreak,
    freezesRemaining: await getFreezeTokens(userId),
    nextMilestone: {
      days: nextMilestone,
      daysRemaining: nextMilestone - currentStreakDays,
      progress: currentStreakDays / nextMilestone,
    },
  };

  // Cache for 1 minute
  await redis.setex(cacheKey, 60, JSON.stringify(streakData));

  // Check if milestone unlocked
  if (milestones.includes(currentStreakDays)) {
    await unlockMilestone(userId, `streak-${currentStreakDays}-days`);
  }

  return streakData;
}

async function calculateLongestHistoricalStreak(
  userId: string,
  saveDates: Array<{ save_date: Date }>
): Promise<{ days: number; startDate: string; endDate: string }> {
  let longestStreak = 1;
  let longestStart = saveDates[0].save_date;
  let longestEnd = saveDates[0].save_date;

  let currentStreak = 1;
  let currentStart = saveDates[0].save_date;

  for (let i = 1; i < saveDates.length; i++) {
    const currentDate = new Date(saveDates[i - 1].save_date);
    const prevDate = new Date(saveDates[i].save_date);
    const dayDiff = Math.floor(
      (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff === 1) {
      currentStreak++;
    } else {
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
        longestStart = currentStart;
        longestEnd = saveDates[i - 1].save_date;
      }
      currentStreak = 1;
      currentStart = saveDates[i].save_date;
    }
  }

  // Final check
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
    longestEnd = saveDates[saveDates.length - 1].save_date;
  }

  return {
    days: longestStreak,
    startDate: longestStart.toISOString().split('T')[0],
    endDate: longestEnd.toISOString().split('T')[0],
  };
}

async function checkFreezeAvailable(userId: string): Promise<boolean> {
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });
  return (userStreak?.freezesRemaining || 0) > 0;
}

async function useFreezeToken(userId: string): Promise<void> {
  await prisma.userStreak.update({
    where: { userId },
    data: {
      freezesRemaining: { decrement: 1 },
      freezesUsedThisMonth: { increment: 1 },
    },
  });
}

async function getFreezeTokens(userId: string): Promise<number> {
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });
  return userStreak?.freezesRemaining || 2;
}

async function unlockMilestone(userId: string, badgeId: string): Promise<void> {
  try {
    await prisma.userMilestone.create({
      data: {
        userId,
        badgeId,
        unlockedAt: new Date(),
      },
    });

    // Trigger notification (future: webhook or push)
    console.log(`🏆 Milestone unlocked for user ${userId}: ${badgeId}`);
  } catch (error) {
    // Ignore duplicate key errors (milestone already unlocked)
    if ((error as any).code !== 'P2002') {
      throw error;
    }
  }
}
```

---

## 2. Backend: Insight Generation

### File: `backend/src/services/insightEngine.ts`

```typescript
import prisma from '../db/prisma';

interface Insight {
  id: string;
  type: 'milestone' | 'gap' | 'pattern' | 'stale' | 'connection' | 'trend';
  priority: number;
  title: string;
  description: string;
  actionable: boolean;
  actions?: Array<{ label: string; url?: string; type: string }>;
  metadata: Record<string, any>;
  createdAt: string;
  expiresAt: string;
}

export async function generateInsights(userId: string, limit = 10): Promise<Insight[]> {
  const insights: Insight[] = [];

  // 1. Milestone Insights
  const recentMilestones = await prisma.userMilestone.findMany({
    where: {
      userId,
      unlockedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
    orderBy: { unlockedAt: 'desc' },
    take: 3,
  });

  for (const milestone of recentMilestones) {
    insights.push({
      id: `milestone-${milestone.id}`,
      type: 'milestone',
      priority: 0.95,
      title: getMilestoneTitle(milestone.badgeId),
      description: getMilestoneDescription(milestone.badgeId),
      actionable: false,
      metadata: { badgeId: milestone.badgeId },
      createdAt: milestone.unlockedAt.toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 2. Knowledge Gap Insights
  const gaps = await detectKnowledgeGaps(userId);
  for (const gap of gaps.slice(0, 3)) {
    insights.push({
      id: `gap-${gap.conceptId}`,
      type: 'gap',
      priority: 0.72,
      title: `Deepen Your ${gap.conceptName} Knowledge`,
      description: `You have ${gap.currentCount} bookmarks about ${gap.conceptName}. Consider exploring further.`,
      actionable: true,
      actions: [
        {
          label: `Find ${gap.conceptName} Resources`,
          url: `/search?q=${encodeURIComponent(gap.conceptName)}`,
          type: 'navigate',
        },
        { label: 'Dismiss', type: 'dismiss' },
      ],
      metadata: {
        concept: gap.conceptName,
        currentCount: gap.currentCount,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 3. Surprising Connection Insights
  const connections = await detectSurprisingConnections(userId);
  for (const conn of connections.slice(0, 2)) {
    insights.push({
      id: `connection-${conn.bookmarkId}`,
      type: 'connection',
      priority: 0.68,
      title: 'Surprising Connection Detected',
      description: `Your bookmark "${conn.title}" bridges ${conn.clusters.join(', ')} topics.`,
      actionable: true,
      actions: [
        {
          label: 'View in Graph',
          url: `/graph?focus=${conn.bookmarkId}`,
          type: 'navigate',
        },
      ],
      metadata: {
        bookmarkId: conn.bookmarkId,
        bookmarkTitle: conn.title,
        clustersConnected: conn.clusters,
        centralityScore: conn.centralityScore,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 4. Stale Content Insights
  const staleCount = await prisma.bookmark.count({
    where: {
      userId,
      createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      // Has no relationships (orphaned)
      NOT: {
        OR: [
          { relationships_source: { some: {} } },
          { relationships_target: { some: {} } },
        ],
      },
    },
  });

  if (staleCount >= 10) {
    insights.push({
      id: 'stale-orphaned',
      type: 'stale',
      priority: 0.55,
      title: 'Old Bookmarks Need Connections',
      description: `${staleCount} old bookmarks haven't connected to anything. Archive or re-process?`,
      actionable: true,
      actions: [
        { label: 'Review Stale Content', url: '/bookmarks?filter=stale', type: 'navigate' },
        { label: 'Dismiss', type: 'dismiss' },
      ],
      metadata: { staleCount },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Sort by priority and limit
  insights.sort((a, b) => b.priority - a.priority);
  return insights.slice(0, limit);
}

async function detectKnowledgeGaps(userId: string) {
  const gaps = await prisma.$queryRaw<
    Array<{ concept_id: string; concept_name: string; bookmark_count: number }>
  >`
    SELECT
      c.id as concept_id,
      c.name as concept_name,
      COUNT(DISTINCT r.source_id) as bookmark_count
    FROM concepts c
    LEFT JOIN relationships r ON r.target_id = c.id AND r.relationship_type = 'about' AND r.user_id = c.user_id
    WHERE c.user_id = ${userId}
    GROUP BY c.id, c.name
    HAVING COUNT(DISTINCT r.source_id) BETWEEN 1 AND 2
    ORDER BY c.occurrence_count DESC
    LIMIT 10
  `;

  return gaps.map((g) => ({
    conceptId: g.concept_id,
    conceptName: g.concept_name,
    currentCount: Number(g.bookmark_count),
  }));
}

async function detectSurprisingConnections(userId: string) {
  const connections = await prisma.$queryRaw<
    Array<{
      bookmark_id: string;
      title: string;
      centrality_score: number;
      cluster_names: string[];
    }>
  >`
    SELECT
      b.id as bookmark_id,
      b.title,
      b.centrality_score,
      ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as cluster_names
    FROM bookmarks b
    LEFT JOIN relationships r ON (r.source_id = b.id OR r.target_id = b.id) AND r.user_id = b.user_id
    LEFT JOIN concepts c ON r.target_id = c.id AND r.target_type = 'concept'
    WHERE b.user_id = ${userId}
      AND b.centrality_score > 0.7
      AND b.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY b.id, b.title, b.centrality_score
    HAVING COUNT(DISTINCT c.id) >= 3
    ORDER BY b.centrality_score DESC
    LIMIT 5
  `;

  return connections.map((c) => ({
    bookmarkId: c.bookmark_id,
    title: c.title,
    centralityScore: c.centrality_score,
    clusters: c.cluster_names || [],
  }));
}

function getMilestoneTitle(badgeId: string): string {
  const titles: Record<string, string> = {
    'streak-7-days': '7-Day Streak!',
    'streak-30-days': '30-Day Streak! 🔥',
    'streak-42-days': '42-Day Streak! Your Longest Ever',
    'streak-100-days': '100-Day Streak! Legendary!',
    'bookmark-100': 'Century Club',
    'bookmark-500': 'Knowledge Vault',
  };
  return titles[badgeId] || 'New Achievement Unlocked';
}

function getMilestoneDescription(badgeId: string): string {
  const descriptions: Record<string, string> = {
    'streak-7-days': "You've saved content for 7 consecutive days. Great start!",
    'streak-30-days': 'A full month of consistent learning. Keep it going!',
    'streak-42-days': 'This is your personal record! You're building a real habit.',
    'streak-100-days': "You're in the top 1% of users. Incredible dedication!",
    'bookmark-100': "You've saved 100 bookmarks. Your knowledge library is taking shape.",
    'bookmark-500': 'Half a thousand saves! Your collection is truly impressive.',
  };
  return descriptions[badgeId] || 'Congratulations on reaching this milestone!';
}
```

---

## 3. Backend: Heatmap Data Query

### File: `backend/src/routes/analytics.ts`

```typescript
import express, { Request, Response } from 'express';
import prisma from '../db/prisma';
import { authMiddleware } from '../middleware/auth';
import { redis } from '../config/redis';

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/v1/analytics/patterns/saving?days=90
 * Get save time heatmap data (day of week × hour)
 */
router.get('/patterns/saving', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 90;

    // Check cache
    const cacheKey = `analytics:${userId}:heatmap:${days}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const heatmapData = await prisma.$queryRaw<
      Array<{
        day_of_week: number;
        hour: number;
        save_count: number;
        sample_titles: string[];
      }>
    >`
      SELECT
        EXTRACT(DOW FROM created_at)::int as day_of_week,
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*) as save_count,
        ARRAY_AGG(title ORDER BY created_at DESC) FILTER (WHERE rn <= 3) as sample_titles
      FROM (
        SELECT
          created_at,
          title,
          ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(DOW FROM created_at), EXTRACT(HOUR FROM created_at)
            ORDER BY created_at DESC
          ) as rn
        FROM bookmarks
        WHERE user_id = ${userId} AND created_at >= ${startDate}
      ) ranked
      WHERE rn <= 3
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour
    `;

    const totalSaves = heatmapData.reduce((sum, d) => sum + Number(d.save_count), 0);

    const data = heatmapData.map((d) => ({
      dayOfWeek: d.day_of_week,
      hour: d.hour,
      count: Number(d.save_count),
      percentage: (Number(d.save_count) / totalSaves) * 100,
      sampleTitles: d.sample_titles || [],
    }));

    // Find peak time
    const peak = data.reduce((max, d) => (d.count > max.count ? d : max), data[0]);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const result = {
      heatmap: {
        data,
        summary: {
          peakDay: dayNames[peak.dayOfWeek],
          peakHour: peak.hour,
          mostActiveWindow: `${dayNames[peak.dayOfWeek]} ${peak.hour}:00-${peak.hour + 1}:00`,
          totalSaves,
          periodDays: days,
        },
      },
    };

    // Cache for 30 minutes
    await redis.setex(cacheKey, 1800, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error('Error fetching saving patterns:', error);
    res.status(500).json({
      error: 'Failed to fetch saving patterns',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

---

## 4. Frontend: Trend Chart Component

### File: `frontend/components/analytics/TrendChart.tsx`

```typescript
'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area } from 'recharts';

interface TrendData {
  date: string;
  count: number;
  cumulative?: number;
}

interface TrendChartProps {
  data: TrendData[];
  comparisonData?: TrendData[];
  showAverage?: boolean;
  title?: string;
  color?: string;
  height?: number;
}

export function TrendChart({
  data,
  comparisonData,
  showAverage = false,
  title = 'Bookmark Trend',
  color = '#3B82F6',
  height = 300,
}: TrendChartProps) {
  const average = useMemo(() => {
    if (!showAverage || data.length === 0) return 0;
    const sum = data.reduce((acc, d) => acc + d.count, 0);
    return sum / data.length;
  }, [data, showAverage]);

  // Format date for tooltip
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const currentData = payload.find((p: any) => p.dataKey === 'count');
    const compData = payload.find((p: any) => p.dataKey === 'comparisonCount');

    return (
      <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
        <p className="text-sm font-medium text-gray-900">
          {formatDate(currentData?.payload.date)}
        </p>
        <p className="text-sm text-blue-600 mt-1">
          Current: {currentData?.value} saves
        </p>
        {compData && (
          <p className="text-sm text-gray-500 mt-1">
            Previous: {compData?.value} saves
          </p>
        )}
      </div>
    );
  };

  // Merge current and comparison data
  const chartData = useMemo(() => {
    if (!comparisonData) return data;

    return data.map((d, idx) => ({
      ...d,
      comparisonCount: comparisonData[idx]?.count || 0,
    }));
  }, [data, comparisonData]);

  return (
    <div className="w-full">
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#6B7280"
            tick={{ fontSize: 12 }}
          />
          <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />

          {/* Comparison data (previous period) */}
          {comparisonData && (
            <Line
              type="monotone"
              dataKey="comparisonCount"
              stroke="#9CA3AF"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Previous Period"
            />
          )}

          {/* Current data */}
          <Line
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={3}
            dot={{ r: 4, fill: color }}
            activeDot={{ r: 6 }}
            name="Current Period"
          />

          {/* Average line */}
          {showAverage && average > 0 && (
            <line
              x1="0"
              y1={`${100 - (average / Math.max(...data.map((d) => d.count))) * 100}%`}
              x2="100%"
              y2={`${100 - (average / Math.max(...data.map((d) => d.count))) * 100}%`}
              stroke="#F59E0B"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {showAverage && (
        <p className="text-xs text-gray-500 mt-2 text-right">
          Average: {average.toFixed(1)} saves/day
        </p>
      )}
    </div>
  );
}
```

---

## 5. Frontend: Streak Display

### File: `frontend/components/analytics/StreakDisplay.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Flame, Award, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  nextMilestone: {
    days: number;
    daysRemaining: number;
    progress: number;
  };
  freezesRemaining: number;
  className?: string;
}

export function StreakDisplay({
  currentStreak,
  longestStreak,
  nextMilestone,
  freezesRemaining,
  className,
}: StreakDisplayProps) {
  const [animateFlame, setAnimateFlame] = useState(false);

  useEffect(() => {
    setAnimateFlame(true);
    const timeout = setTimeout(() => setAnimateFlame(false), 1000);
    return () => clearTimeout(timeout);
  }, [currentStreak]);

  const isRecord = currentStreak === longestStreak && currentStreak > 0;
  const progressPercentage = nextMilestone.progress * 100;

  return (
    <div className={cn('bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-6', className)}>
      {/* Main Streak Display */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('transition-transform', animateFlame && 'scale-110')}>
            <Flame
              className={cn(
                'w-12 h-12',
                currentStreak > 0 ? 'text-orange-500' : 'text-gray-300'
              )}
              fill={currentStreak > 0 ? 'currentColor' : 'none'}
            />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{currentStreak}</p>
            <p className="text-sm text-gray-600">Day Streak</p>
          </div>
        </div>

        {isRecord && (
          <div className="flex items-center gap-2 bg-yellow-100 px-3 py-1 rounded-full">
            <Award className="w-4 h-4 text-yellow-600" />
            <span className="text-xs font-medium text-yellow-700">Record!</span>
          </div>
        )}
      </div>

      {/* Progress to Next Milestone */}
      {currentStreak > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Progress to {nextMilestone.days}-day milestone</span>
            <span>{nextMilestone.daysRemaining} days to go</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-orange-400 to-red-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Freeze Tokens */}
      <div className="flex items-center justify-between pt-4 border-t border-orange-100">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-500" />
          <span className="text-sm text-gray-700">Freeze Tokens</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-3 h-3 rounded-full border-2',
                i < freezesRemaining
                  ? 'bg-blue-500 border-blue-500'
                  : 'bg-gray-200 border-gray-300'
              )}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {freezesRemaining > 0
          ? `You can miss ${freezesRemaining} day${freezesRemaining > 1 ? 's' : ''} without breaking your streak`
          : 'No freeze tokens remaining. Save today to keep your streak!'}
      </p>

      {/* Longest Streak */}
      <div className="mt-4 pt-4 border-t border-orange-100">
        <p className="text-xs text-gray-600">Longest Streak</p>
        <p className="text-lg font-semibold text-gray-900">{longestStreak} days</p>
      </div>
    </div>
  );
}
```

---

## 6. Frontend: Insight Card

### File: `frontend/components/analytics/InsightCard.tsx`

```typescript
'use client';

import { Lightbulb, TrendingUp, AlertCircle, Sparkles, Link as LinkIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InsightAction {
  label: string;
  url?: string;
  type: 'navigate' | 'dismiss';
}

interface InsightCardProps {
  id: string;
  type: 'milestone' | 'gap' | 'pattern' | 'stale' | 'connection' | 'trend';
  title: string;
  description: string;
  priority: number;
  actionable: boolean;
  actions?: InsightAction[];
  onDismiss?: (insightId: string) => void;
  onAction?: (insightId: string, actionType: string, url?: string) => void;
}

const insightIcons = {
  milestone: Sparkles,
  gap: Lightbulb,
  pattern: TrendingUp,
  stale: AlertCircle,
  connection: LinkIcon,
  trend: TrendingUp,
};

const insightColors = {
  milestone: 'from-purple-50 to-pink-50 border-purple-200',
  gap: 'from-blue-50 to-cyan-50 border-blue-200',
  pattern: 'from-green-50 to-emerald-50 border-green-200',
  stale: 'from-yellow-50 to-orange-50 border-yellow-200',
  connection: 'from-indigo-50 to-violet-50 border-indigo-200',
  trend: 'from-teal-50 to-blue-50 border-teal-200',
};

export function InsightCard({
  id,
  type,
  title,
  description,
  priority,
  actionable,
  actions,
  onDismiss,
  onAction,
}: InsightCardProps) {
  const Icon = insightIcons[type];
  const colorClass = insightColors[type];

  const handleAction = (action: InsightAction) => {
    if (action.type === 'dismiss') {
      onDismiss?.(id);
    } else if (action.type === 'navigate' && action.url) {
      onAction?.(id, action.type, action.url);
      window.location.href = action.url;
    }
  };

  return (
    <div
      className={cn(
        'relative bg-gradient-to-br border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow',
        colorClass
      )}
    >
      {/* Dismiss Button */}
      {onDismiss && (
        <button
          onClick={() => onDismiss(id)}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/50 transition-colors"
          aria-label="Dismiss insight"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      )}

      {/* Icon and Title */}
      <div className="flex items-start gap-3 mb-2">
        <div className="flex-shrink-0 mt-1">
          <Icon className="w-5 h-5 text-gray-700" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 pr-6">{title}</h4>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
      </div>

      {/* Actions */}
      {actionable && actions && actions.length > 0 && (
        <div className="flex gap-2 mt-4">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              variant={action.type === 'dismiss' ? 'ghost' : 'default'}
              size="sm"
              onClick={() => handleAction(action)}
              className={cn(
                action.type === 'dismiss' && 'text-gray-600 hover:text-gray-900'
              )}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {/* Priority Indicator (for debugging, hidden in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-2 right-2 text-xs text-gray-400">
          Priority: {priority.toFixed(2)}
        </div>
      )}
    </div>
  );
}
```

---

## 7. Redis Caching Patterns

### File: `backend/src/utils/cacheHelpers.ts`

```typescript
import { redis } from '../config/redis';

/**
 * Generic cache wrapper with automatic invalidation
 */
export async function cacheWrapper<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`[Cache HIT] ${cacheKey}`);
    return JSON.parse(cached);
  }

  // Cache miss - fetch data
  console.log(`[Cache MISS] ${cacheKey}`);
  const data = await fetchFn();

  // Store in cache
  await redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));

  return data;
}

/**
 * Invalidate analytics cache for a user
 */
export async function invalidateUserAnalyticsCache(userId: string, scope?: string) {
  const patterns = scope
    ? [`analytics:${userId}:${scope}*`]
    : [`analytics:${userId}:*`];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Cache INVALIDATE] Deleted ${keys.length} keys matching ${pattern}`);
    }
  }
}

/**
 * Invalidate cache on bookmark creation
 */
export async function invalidateOnBookmarkCreate(userId: string) {
  await invalidateUserAnalyticsCache(userId, 'summary');
  await invalidateUserAnalyticsCache(userId, 'trend');
  await invalidateUserAnalyticsCache(userId, 'streak');
  await invalidateUserAnalyticsCache(userId, 'distributions');
}

/**
 * Invalidate cache on relationship creation
 */
export async function invalidateOnRelationshipCreate(userId: string) {
  await invalidateUserAnalyticsCache(userId, 'graph_metrics');
  await invalidateUserAnalyticsCache(userId, 'insights');
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  const info = await redis.info('stats');
  const lines = info.split('\r\n');
  const stats: Record<string, string> = {};

  for (const line of lines) {
    const [key, value] = line.split(':');
    if (key && value) {
      stats[key] = value;
    }
  }

  return {
    totalKeys: parseInt(await redis.dbsize()),
    hits: parseInt(stats['keyspace_hits'] || '0'),
    misses: parseInt(stats['keyspace_misses'] || '0'),
    hitRate: (
      (parseInt(stats['keyspace_hits'] || '0') /
        (parseInt(stats['keyspace_hits'] || '0') + parseInt(stats['keyspace_misses'] || '0'))) *
      100
    ).toFixed(2),
  };
}
```

**Usage in Route:**

```typescript
import { cacheWrapper, invalidateOnBookmarkCreate } from '../utils/cacheHelpers';

// In bookmark create endpoint
router.post('/', async (req, res) => {
  const bookmark = await prisma.bookmark.create({ /* ... */ });

  // Invalidate analytics cache
  await invalidateOnBookmarkCreate(req.user!.id);

  res.json(bookmark);
});

// In analytics endpoint
router.get('/summary', async (req, res) => {
  const userId = req.user!.id;

  const summary = await cacheWrapper(
    `analytics:${userId}:summary`,
    300, // 5 minutes
    async () => {
      // Expensive computation here
      return { /* summary data */ };
    }
  );

  res.json(summary);
});
```

---

## 8. A/B Testing Framework

### File: `backend/src/utils/abTesting.ts`

```typescript
import crypto from 'crypto';

/**
 * Stable variant assignment based on user ID hash
 */
export function assignVariant(userId: string, testId: string, variants: string[]): string {
  const hash = crypto.createHash('md5').update(`${userId}:${testId}`).digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  const variantIndex = hashInt % variants.length;
  return variants[variantIndex];
}

/**
 * Check if user is in test group
 */
export function isInTestGroup(userId: string, testId: string, rolloutPercentage: number): boolean {
  const hash = crypto.createHash('md5').update(`${userId}:${testId}`).digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  const bucket = hashInt % 100;
  return bucket < rolloutPercentage;
}

/**
 * Track A/B test event
 */
export async function trackTestEvent(
  userId: string,
  testId: string,
  variant: string,
  eventType: 'impression' | 'click' | 'conversion',
  metadata?: Record<string, any>
) {
  // In production, send to analytics service (e.g., Mixpanel, Amplitude)
  // For now, just log
  console.log(`[A/B Test] ${testId} | ${variant} | ${eventType}`, {
    userId,
    metadata,
    timestamp: new Date().toISOString(),
  });

  // Example: Send to internal analytics table
  // await prisma.abTestEvent.create({
  //   data: { userId, testId, variant, eventType, metadata },
  // });
}
```

**Usage Example:**

```typescript
// In insight generation
import { assignVariant, trackTestEvent } from '../utils/abTesting';

const variant = assignVariant(userId, 'INS-001', ['positive', 'negative']);

let message: string;
if (variant === 'positive') {
  message = "You're on a 3-day streak!";
} else {
  message = "Don't break your 3-day streak!";
}

await trackTestEvent(userId, 'INS-001', variant, 'impression');

return {
  title: message,
  // ...
};
```

**Frontend Tracking:**

```typescript
// components/analytics/InsightCard.tsx
import { useEffect } from 'react';

useEffect(() => {
  // Track insight impression
  fetch('/api/v1/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      testId: 'INS-001',
      variant: 'positive',
      eventType: 'impression',
      insightId: id,
    }),
  });
}, [id]);

const handleAction = (action: InsightAction) => {
  // Track click
  fetch('/api/v1/analytics/track', {
    method: 'POST',
    body: JSON.stringify({
      testId: 'INS-001',
      variant: 'positive',
      eventType: 'click',
      insightId: id,
    }),
  });

  // Perform action
  // ...
};
```

---

## Additional Resources

### Performance Monitoring

```typescript
// backend/src/middleware/performanceMonitoring.ts
export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[SLOW QUERY] ${req.method} ${req.path} took ${duration}ms`);
    }
  });

  next();
}
```

### Error Handling

```typescript
// backend/src/utils/errorHandler.ts
export class AnalyticsError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export function handleAnalyticsError(error: unknown, res: Response) {
  if (error instanceof AnalyticsError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
  }

  console.error('Unexpected analytics error:', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
```

---

## Testing Examples

### Backend Unit Test

```typescript
// backend/src/services/__tests__/analyticsService.test.ts
import { calculateUserStreak } from '../analyticsService';
import prisma from '../../db/prisma';

jest.mock('../../db/prisma');

describe('calculateUserStreak', () => {
  it('should calculate 7-day streak correctly', async () => {
    const userId = 'test-user-id';
    const mockDates = [
      { save_date: new Date('2026-01-19') },
      { save_date: new Date('2026-01-18') },
      { save_date: new Date('2026-01-17') },
      { save_date: new Date('2026-01-16') },
      { save_date: new Date('2026-01-15') },
      { save_date: new Date('2026-01-14') },
      { save_date: new Date('2026-01-13') },
    ];

    (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockDates);

    const result = await calculateUserStreak(userId);

    expect(result.current.days).toBe(7);
    expect(result.nextMilestone.days).toBe(14);
  });
});
```

### Frontend Component Test

```typescript
// frontend/components/analytics/__tests__/StreakDisplay.test.tsx
import { render, screen } from '@testing-library/react';
import { StreakDisplay } from '../StreakDisplay';

describe('StreakDisplay', () => {
  it('should display current streak', () => {
    render(
      <StreakDisplay
        currentStreak={7}
        longestStreak={10}
        nextMilestone={{ days: 14, daysRemaining: 7, progress: 0.5 }}
        freezesRemaining={2}
      />
    );

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Day Streak')).toBeInTheDocument();
  });

  it('should show record badge when current equals longest', () => {
    render(
      <StreakDisplay
        currentStreak={10}
        longestStreak={10}
        nextMilestone={{ days: 14, daysRemaining: 4, progress: 0.71 }}
        freezesRemaining={2}
      />
    );

    expect(screen.getByText('Record!')).toBeInTheDocument();
  });
});
```

---

This implementation guide provides production-ready code examples for all major analytics features. Use these as templates and adapt them to your specific requirements.
