import { useState, useEffect } from 'react'

/**
 * Debounces a value by delaying updates
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 500ms)
 * @returns The debounced value
 *
 * @example
 * ```tsx
 * const [searchQuery, setSearchQuery] = useState('')
 * const debouncedSearch = useDebounce(searchQuery, 500)
 *
 * useEffect(() => {
 *   // This runs 500ms after user stops typing
 *   performSearch(debouncedSearch)
 * }, [debouncedSearch])
 * ```
 *
 * @example
 * ```tsx
 * // Custom delay
 * const debouncedValue = useDebounce(inputValue, 1000) // 1 second delay
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up the timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clean up the timeout if value changes before delay completes
    // This prevents memory leaks and ensures only the latest value is used
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
