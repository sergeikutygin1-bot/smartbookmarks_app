import { renderHook, waitFor } from '@testing-library/react'
import { useDebounce } from '../use-debounce'

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500))
    expect(result.current).toBe('hello')
  })

  it('should debounce value changes with default delay', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'initial' } }
    )

    expect(result.current).toBe('initial')

    // Change value
    rerender({ value: 'updated' })

    // Should still be initial (debounce not elapsed)
    expect(result.current).toBe('initial')

    // Fast-forward time by default delay (500ms)
    jest.advanceTimersByTime(500)

    // Should now be updated
    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })

  it('should debounce value changes with custom delay', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 1000 } }
    )

    expect(result.current).toBe('initial')

    // Change value
    rerender({ value: 'updated', delay: 1000 })

    // Should still be initial after 500ms
    jest.advanceTimersByTime(500)
    expect(result.current).toBe('initial')

    // Should update after 1000ms total
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })

  it('should cancel previous timeout when value changes rapidly', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'first' } }
    )

    // Change to 'second'
    rerender({ value: 'second' })
    jest.advanceTimersByTime(300) // Only 300ms

    // Change to 'third' before first timeout completes
    rerender({ value: 'third' })
    jest.advanceTimersByTime(500) // Full 500ms from 'third'

    await waitFor(() => {
      // Should skip 'second' and go directly to 'third'
      expect(result.current).toBe('third')
    })
  })

  it('should handle multiple rapid changes correctly', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'v1' } }
    )

    // Rapidly change values
    rerender({ value: 'v2' })
    jest.advanceTimersByTime(100)

    rerender({ value: 'v3' })
    jest.advanceTimersByTime(100)

    rerender({ value: 'v4' })
    jest.advanceTimersByTime(100)

    rerender({ value: 'v5' })
    jest.advanceTimersByTime(500) // Wait full delay from last change

    await waitFor(() => {
      // Should only get the last value
      expect(result.current).toBe('v5')
    })
  })

  it('should work with different data types', async () => {
    // Test with number
    const { result: numberResult, rerender: numberRerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 1 } }
    )

    numberRerender({ value: 2 })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(numberResult.current).toBe(2)
    })

    // Test with object
    const { result: objectResult, rerender: objectRerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: { foo: 'bar' } } }
    )

    objectRerender({ value: { foo: 'baz' } })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(objectResult.current).toEqual({ foo: 'baz' })
    })

    // Test with array
    const { result: arrayResult, rerender: arrayRerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: [1, 2, 3] } }
    )

    arrayRerender({ value: [4, 5, 6] })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(arrayResult.current).toEqual([4, 5, 6])
    })
  })

  it('should update delay dynamically', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    // Change value with 500ms delay
    rerender({ value: 'updated', delay: 500 })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })

    // Change value with 1000ms delay
    rerender({ value: 'final', delay: 1000 })
    jest.advanceTimersByTime(500)
    expect(result.current).toBe('updated') // Still old value

    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('final')
    })
  })

  it('should cleanup timeout on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

    const { unmount } = renderHook(() => useDebounce('test', 500))

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })
})
