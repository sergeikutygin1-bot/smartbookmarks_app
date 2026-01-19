'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useProfilePanelStore } from '@/store/profilePanelStore';
import { useProfile } from '@/hooks/useProfile';
import { Skeleton } from '@/components/ui/skeleton';
import UnifiedProfileView from './UnifiedProfileView';

export function ProfilePanel() {
  const { isOpen, close } = useProfilePanelStore();
  const { data: user, isLoading } = useProfile();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          />

          {/* Profile Panel */}
          <motion.div
            className="fixed left-0 top-0 w-full h-full z-50 flex"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Outer container with padding (creates floating effect) */}
            <div className="h-full w-full p-3 flex">
              {/* Inner panel with rounded corners and shadow */}
              <aside className="
                flex-1
                rounded-2xl
                bg-sidebar
                shadow-xl
                border border-border/50
                overflow-hidden
              ">
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="flex-shrink-0 px-6 py-5 border-b border-sidebar-border flex items-center justify-between">
                    <h1 className="text-2xl font-serif font-semibold text-foreground">
                      Profile Settings
                    </h1>
                    <button
                      onClick={close}
                      className="
                        p-2 rounded-lg
                        hover:bg-sidebar-accent
                        transition-colors duration-200
                      "
                      aria-label="Close profile"
                    >
                      <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-hidden p-6 bg-background">
                    {isLoading ? (
                      <div className="flex gap-6 h-full">
                        <div className="w-[30%] space-y-4">
                          <Skeleton className="h-48 w-full" />
                          <Skeleton className="h-48 w-full" />
                          <Skeleton className="h-48 w-full" />
                        </div>
                        <div className="flex-1 space-y-4">
                          <div className="grid grid-cols-4 gap-4">
                            {[1, 2, 3, 4].map((i) => (
                              <Skeleton key={i} className="h-24" />
                            ))}
                          </div>
                          <Skeleton className="h-64 w-full" />
                          <div className="grid grid-cols-2 gap-4">
                            <Skeleton className="h-64" />
                            <Skeleton className="h-64" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <UnifiedProfileView user={user} />
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
