'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUpdateEmail, useChangePassword } from '@/hooks/useProfile';
import { usePasswordValidation } from '@/hooks/usePasswordValidation';
import {
  useAnalyticsSummary,
  useBookmarkTrend,
  useTopEntities,
  useTopConcepts,
  useRecentActivity,
} from '@/hooks/useAnalytics';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { InsightsFeed } from './InsightsFeed';
import { TopItemsList } from './TopItemsList';
import { useBookmarksStore } from '@/store/bookmarksStore';
import { useProfilePanelStore } from '@/store/profilePanelStore';

interface UnifiedProfileViewProps {
  user: any;
}

export default function UnifiedProfileView({ user }: UnifiedProfileViewProps) {
  // Personal details state
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const router = useRouter();
  const { selectBookmark } = useBookmarksStore();
  const { close } = useProfilePanelStore();

  const updateEmailMutation = useUpdateEmail();
  const changePasswordMutation = useChangePassword();
  const passwordValidation = usePasswordValidation(newPassword);

  // Analytics data
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: trendData, isLoading: trendLoading } = useBookmarkTrend(30);
  const { data: entitiesData, isLoading: entitiesLoading } = useTopEntities(10);
  const { data: conceptsData, isLoading: conceptsLoading } = useTopConcepts(10);
  const { data: activityData, isLoading: activityLoading } = useRecentActivity(10);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateEmailMutation.mutateAsync(newEmail);
    setIsEditingEmail(false);
    setNewEmail('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword || !passwordValidation.valid) return;

    await changePasswordMutation.mutateAsync({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleBookmarkClick = (bookmarkId: string) => {
    selectBookmark(bookmarkId);
    close();
    router.push('/');
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Left Sidebar - Account Settings (30%) */}
      <div className="w-[30%] space-y-6 overflow-y-auto">
        {/* Account Information */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h2 className="text-xl font-serif font-semibold mb-4 tracking-tight">
            Account Information
          </h2>

          <div className="space-y-4">
            {/* Email */}
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Email
              </Label>
              {!isEditingEmail ? (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-foreground">{user?.email}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNewEmail(user?.email || '');
                      setIsEditingEmail(true);
                    }}
                    className="text-xs"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleEmailSubmit} className="mt-2 space-y-2">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new.email@example.com"
                    className="text-sm bg-card border-border"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updateEmailMutation.isPending}
                      className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {updateEmailMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingEmail(false);
                        setNewEmail('');
                      }}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Member Since */}
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Member Since
              </Label>
              <p className="text-sm text-foreground mt-2">
                {user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : '-'}
              </p>
            </div>
          </div>
        </Card>

        {/* Password */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h2 className="text-xl font-serif font-semibold mb-4 tracking-tight">
            Password
          </h2>

          {!isChangingPassword ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsChangingPassword(true)}
              className="text-xs"
            >
              Change Password
            </Button>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <Label htmlFor="currentPassword" className="text-xs">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="mt-1 text-sm bg-card border-border"
                />
              </div>

              <div>
                <Label htmlFor="newPassword" className="text-xs">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="mt-1 text-sm bg-card border-border"
                />
                {newPassword && !passwordValidation.valid && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    <p className="font-medium mb-1">Password must have:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {passwordValidation.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-xs">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="mt-1 text-sm bg-card border-border"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    Passwords don't match
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    changePasswordMutation.isPending ||
                    !passwordValidation.valid ||
                    newPassword !== confirmPassword
                  }
                  className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* Subscription */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-serif font-semibold tracking-tight">
                Free Plan
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Current subscription
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                $0
              </div>
              <div className="text-xs text-muted-foreground">
                per month
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4 mb-4">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Features
            </h3>
            <ul className="space-y-1.5">
              {[
                'Unlimited bookmarks',
                'AI enrichment',
                'Knowledge graph',
                'Semantic search',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-primary flex-shrink-0"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs text-foreground">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    disabled
                    size="sm"
                    className="w-full text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium uppercase tracking-wide"
                  >
                    Upgrade Plan
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Premium plans coming soon!</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Card>

        {/* Insights Feed */}
        <InsightsFeed />
      </div>

      {/* Right Main Area - Analytics Dashboard (70%) */}
      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          {summaryLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </>
          ) : (
            <>
              <SummaryCard
                value={summary?.bookmarks || 0}
                label="Bookmarks"
              />
              <SummaryCard
                value={summary?.entities || 0}
                label="Entities"
              />
              <SummaryCard
                value={summary?.concepts || 0}
                label="Concepts"
              />
              <SummaryCard
                value={summary?.relationships || 0}
                label="Links"
              />
            </>
          )}
        </div>

        {/* Bookmark Trend Chart */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h3 className="text-lg font-serif font-semibold mb-4 tracking-tight">
            Activity Over Time
          </h3>
          {trendLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData?.trend || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                  stroke="hsl(var(--muted-foreground))"
                  style={{
                    fontSize: '11px',
                    fontFamily: 'DM Sans',
                  }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  style={{
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={{ fill: '#D97706', r: 3 }}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top Entities and Concepts */}
        <div className="grid grid-cols-2 gap-6">
          <TopItemsList
            title="Top Entities"
            items={entitiesData?.entities || []}
            isLoading={entitiesLoading}
            accentColor="#D97706"
            linkBase="/graph"
          />

          <TopItemsList
            title="Top Concepts"
            items={conceptsData?.concepts || []}
            isLoading={conceptsLoading}
            accentColor="#059669"
            linkBase="/graph"
          />
        </div>

        {/* Recent Activity */}
        <Card className="p-6 bg-card border border-border shadow-sm">
          <h3 className="text-lg font-serif font-semibold mb-4 tracking-tight">
            Recent Activity
          </h3>
          {activityLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {activityData?.bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  onClick={() => handleBookmarkClick(bookmark.id)}
                  className="block p-3 rounded-lg border border-border hover:border-primary transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {bookmark.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {bookmark.domain}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(bookmark.createdAt), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({ value, label }: { value: number; label: string }) {
  return (
    <Card className="p-4 bg-card border border-border shadow-sm hover:shadow-md hover:border-primary transition-all hover:-translate-y-0.5">
      <div className="text-3xl font-semibold mb-1 leading-none" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
    </Card>
  );
}
