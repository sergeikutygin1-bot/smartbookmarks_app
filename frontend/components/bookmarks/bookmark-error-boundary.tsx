'use client'

import { ErrorBoundary } from '@/components/error-boundary'
import { FileQuestion } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

/**
 * Bookmark-specific error boundary
 * Provides a contextual error message for bookmark failures
 * without crashing the entire application
 *
 * @example
 * <BookmarkErrorBoundary>
 *   <BookmarkNote bookmark={selectedBookmark} />
 * </BookmarkErrorBoundary>
 */
export function BookmarkErrorBoundary({ children }: Props) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center h-full p-8">
          <FileQuestion className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load bookmark</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Please select a different bookmark or refresh the page
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
