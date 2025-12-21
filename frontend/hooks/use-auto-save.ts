import { useState, useEffect, useRef } from 'react'
import { useDebounce } from './use-debounce'

export interface UseAutoSaveOptions {
  /** Debounce delay in ms (default: 500) */
  delay?: number
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean
  /** Callback when save starts */
  onSaveStart?: () => void
  /** Callback when save succeeds */
  onSaveSuccess?: () => void
  /** Callback when save fails */
  onSaveError?: (error: unknown) => void
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Auto-saves data after a debounced delay
 *
 * @param data - The data to auto-save (will be JSON-stringified for comparison)
 * @param onSave - Async function to save data
 * @param options - Configuration options
 * @returns Current save status
 *
 * @example
 * ```tsx
 * const [formData, setFormData] = useState({ title: '', content: '' })
 *
 * const saveStatus = useAutoSave(
 *   formData,
 *   async (data) => {
 *     await updateBookmark(bookmarkId, data)
 *   },
 *   { delay: 500 }
 * )
 *
 * // Show status in UI
 * {saveStatus === 'saving' && <span>Saving...</span>}
 * {saveStatus === 'saved' && <span>Saved ✓</span>}
 * {saveStatus === 'error' && <span>Failed to save</span>}
 * ```
 *
 * @example
 * ```tsx
 * // With lifecycle callbacks
 * const saveStatus = useAutoSave(
 *   formData,
 *   saveData,
 *   {
 *     delay: 1000,
 *     enabled: isDirty, // Only save when form is dirty
 *     onSaveStart: () => console.log('Saving...'),
 *     onSaveSuccess: () => toast.success('Saved!'),
 *     onSaveError: (error) => toast.error('Failed to save'),
 *   }
 * )
 * ```
 */
export function useAutoSave<T>(
  data: T,
  onSave: (data: T) => Promise<void>,
  options: UseAutoSaveOptions = {}
): AutoSaveStatus {
  const {
    delay = 500,
    enabled = true,
    onSaveStart,
    onSaveSuccess,
    onSaveError,
  } = options

  const debouncedData = useDebounce(data, delay)
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const isFirstRender = useRef(true)
  const previousDataRef = useRef<T>(debouncedData)
  const isSavingRef = useRef(false)

  useEffect(() => {
    // Skip first render (don't save initial data)
    if (isFirstRender.current) {
      isFirstRender.current = false
      previousDataRef.current = debouncedData
      return
    }

    // Skip if disabled
    if (!enabled) {
      return
    }

    // Skip if data hasn't changed (deep comparison via JSON)
    const currentDataStr = JSON.stringify(debouncedData)
    const previousDataStr = JSON.stringify(previousDataRef.current)

    if (currentDataStr === previousDataStr) {
      return
    }

    // Skip if already saving (prevent concurrent saves)
    if (isSavingRef.current) {
      return
    }

    // Save data
    const save = async () => {
      isSavingRef.current = true
      setStatus('saving')
      onSaveStart?.()

      try {
        await onSave(debouncedData)
        setStatus('saved')
        onSaveSuccess?.()
        previousDataRef.current = debouncedData

        // Reset to idle after 2 seconds (for clean UI)
        setTimeout(() => {
          setStatus('idle')
        }, 2000)
      } catch (error) {
        setStatus('error')
        onSaveError?.(error)
        // Keep error status (don't auto-reset)
      } finally {
        isSavingRef.current = false
      }
    }

    save()
  }, [debouncedData, enabled, onSave, onSaveStart, onSaveSuccess, onSaveError])

  return status
}
