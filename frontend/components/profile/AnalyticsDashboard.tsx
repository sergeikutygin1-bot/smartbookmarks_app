'use client';

import {
  useAnalyticsSummary,
  useBookmarkTrend,
  useTopEntities,
  useTopConcepts,
  useContentTypeDistribution,
  useRecentActivity,
} from '@/hooks/useAnalytics';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import Link from 'next/link';

const COLORS = ['#D97706', '#059669', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B'];

export default function AnalyticsDashboard() {
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: trendData, isLoading: trendLoading } = useBookmarkTrend(30);
  const { data: entitiesData, isLoading: entitiesLoading } = useTopEntities(10);
  const { data: conceptsData, isLoading: conceptsLoading } = useTopConcepts(10);
  const { data: contentData, isLoading: contentLoading } = useContentTypeDistribution();
  const { data: activityData, isLoading: activityLoading } = useRecentActivity(10);

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </>
        ) : (
          <>
            <SummaryCard
              value={summary?.bookmarks || 0}
              label="Total Bookmarks"
              trend="+12% this week"
            />
            <SummaryCard
              value={summary?.entities || 0}
              label="Entities"
              trend="+8% this week"
            />
            <SummaryCard
              value={summary?.concepts || 0}
              label="Concepts"
              trend="+5% this week"
            />
            <SummaryCard
              value={summary?.relationships || 0}
              label="Relationships"
              trend="+15% this week"
            />
          </>
        )}
      </div>

      {/* Bookmark Trend Chart */}
      <Card className="p-6 bg-card border border-border shadow-sm">
        <h3 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
          Bookmarks Over Time
        </h3>
        {trendLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData?.trend || []}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border, #E5E5E5)"
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => format(new Date(value), 'MMM d')}
                stroke="hsl(var(--muted-foreground))"
                style={{
                  fontSize: '11px',
                  fontFamily: 'DM Sans',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                style={{
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#D97706"
                strokeWidth={3}
                dot={{ fill: '#D97706', r: 4 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Top Entities and Concepts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Entities */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h3 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
            Top Entities
          </h3>
          {entitiesLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={entitiesData?.entities || []}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border, #E5E5E5)"
                  opacity={0.3}
                />
                <XAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  width={100}
                  style={{ fontSize: '11px' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                />
                <Bar dataKey="occurrenceCount" fill="#D97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top Concepts */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h3 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
            Top Concepts
          </h3>
          {conceptsLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={conceptsData?.concepts || []}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border, #E5E5E5)"
                  opacity={0.3}
                />
                <XAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  width={100}
                  style={{ fontSize: '11px' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                />
                <Bar dataKey="occurrenceCount" fill="#059669" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Content Type Distribution and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Type Distribution */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h3 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
            Content Types
          </h3>
          {contentLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={contentData?.distribution || []}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.type} (${entry.count})`}
                >
                  {(contentData?.distribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h3 className="text-2xl font-serif font-semibold mb-6 tracking-tight">
            Recent Activity
          </h3>
          {activityLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {activityData?.bookmarks.map((bookmark) => (
                <Link
                  key={bookmark.id}
                  href={`/bookmarks/${bookmark.id}`}
                  className="block p-3 rounded-lg border border-border hover:border-primary transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {bookmark.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {bookmark.domain}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(bookmark.createdAt), 'MMM d, yyyy')}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  value,
  label,
  trend,
}: {
  value: number;
  label: string;
  trend: string;
}) {
  return (
    <Card className="p-6 bg-card border border-border shadow-sm hover:shadow-md hover:border-primary transition-all hover:-translate-y-0.5">
      <div className="text-4xl font-semibold mb-2 leading-none" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {value.toLocaleString()}
      </div>
      <div className="text-sm uppercase tracking-wide text-muted-foreground font-medium mb-1">
        {label}
      </div>
      <div className="text-xs text-primary font-medium">{trend}</div>
    </Card>
  );
}
