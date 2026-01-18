'use client';

import { TwoPanel } from './TwoPanel';
import { Sidebar } from '@/components/bookmarks/Sidebar';
import { MainContent } from './MainContent';
import { EnrichmentQueueStatus } from '@/components/bookmarks/EnrichmentQueueStatus';
import { ProfilePanel } from '@/components/profile/ProfilePanel';

export function UnifiedLayout() {
  return (
    <>
      <TwoPanel sidebar={<Sidebar />} main={<MainContent />} />
      <EnrichmentQueueStatus />
      <ProfilePanel />
    </>
  );
}
