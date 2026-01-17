'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ViewModeSwitcher } from './ViewModeSwitcher';
import { ViewMode, useViewModeStore } from '@/store/viewModeStore';
import { NoteEditor } from '@/components/bookmarks/NoteEditor';
import { GraphCanvas } from '@/components/graph/GraphView/GraphCanvas';
import { BookmarkErrorBoundary } from '@/components/bookmarks/bookmark-error-boundary';

const transition = {
  type: 'tween',
  ease: 'easeInOut',
  duration: 0.3,
};

const variants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export function MainContent() {
  const { mode, setMode } = useViewModeStore();

  const handleModeChange = (newMode: ViewMode) => {
    setMode(newMode);

    // Announce mode change for accessibility
    const announcement = `Switched to ${newMode === 'note' ? 'Note' : 'Graph'} Mode`;
    const liveRegion = document.getElementById('mode-announcer');
    if (liveRegion) {
      liveRegion.textContent = announcement;
    }
  };

  // Keyboard shortcuts for mode switching
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + 1: Switch to Note Mode
      if (isCtrlOrCmd && event.key === '1') {
        event.preventDefault();
        handleModeChange('note');
      }

      // Cmd/Ctrl + 2: Switch to Graph Mode
      if (isCtrlOrCmd && event.key === '2') {
        event.preventDefault();
        handleModeChange('graph');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Mode Switcher */}
      <div className="absolute top-4 left-6 z-10">
        <ViewModeSwitcher mode={mode} onChange={handleModeChange} />
      </div>

      {/* Accessibility: Live region for mode announcements */}
      <div
        id="mode-announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Main Content Area */}
      <div id="main-content-area" className="w-full h-full">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'note' ? (
            <motion.div
              key="note-mode"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="w-full h-full"
            >
              <BookmarkErrorBoundary>
                <NoteEditor />
              </BookmarkErrorBoundary>
            </motion.div>
          ) : (
            <motion.div
              key="graph-mode"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="w-full h-full"
            >
              <GraphCanvas />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
