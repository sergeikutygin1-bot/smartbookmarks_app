'use client';

import { useProfile } from '@/hooks/useProfile';
import { useProfileStore } from '@/store/profileStore';
import { Skeleton } from '@/components/ui/skeleton';
import PersonalDetailsSection from '@/components/profile/PersonalDetailsSection';
import AnalyticsDashboard from '@/components/profile/AnalyticsDashboard';
import TariffSection from '@/components/profile/TariffSection';

export default function ProfilePage() {
  const { data: user, isLoading } = useProfile();
  const { activeSection, setActiveSection } = useProfileStore();

  const tabs = [
    { id: 'personal' as const, label: 'Personal Details' },
    { id: 'analytics' as const, label: 'Analytics' },
    { id: 'tariff' as const, label: 'Subscription' },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Skeleton className="h-12 w-64 mb-2" />
        <Skeleton className="h-6 w-96 mb-8" />
        <div className="flex gap-8 mb-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-32" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0F0F0F]">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-4xl font-semibold mb-2"
            style={{ fontFamily: 'Crimson Pro, serif', letterSpacing: '-0.02em' }}
          >
            Profile Settings
          </h1>
          <p className="text-base text-[#6B6B6B] dark:text-[#A3A3A3]">
            Manage your account details and view your analytics
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-8 border-b border-[#E5E5E5] dark:border-[#2A2A2A] mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`
                relative px-0 py-4 text-base font-medium transition-colors
                ${
                  activeSection === tab.id
                    ? 'text-[#1A1A1A] dark:text-[#F5F5F5]'
                    : 'text-[#6B6B6B] dark:text-[#A3A3A3] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5]'
                }
              `}
            >
              {tab.label}
              {activeSection === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D97706] dark:bg-[#FBBF24]"
                  style={{ animation: 'slideIn 0.2s ease-out' }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Content Sections */}
        <div
          className="transition-opacity duration-300"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          {activeSection === 'personal' && <PersonalDetailsSection user={user} />}
          {activeSection === 'analytics' && <AnalyticsDashboard />}
          {activeSection === 'tariff' && <TariffSection />}
        </div>
      </div>

      {/* Inline styles for animations */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
