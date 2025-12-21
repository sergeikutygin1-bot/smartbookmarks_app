import { renderHook, waitFor } from '@testing-library/react'
import { useAutoSave } from '../use-auto-save'

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should not save on first render', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    renderHook(() => useAutoSave({ foo: 'bar' }, onSave))

    jest.advanceTimersByTime(500)

    expect(onSave).not.toHaveBeenCalled()
  })

  it('should save after data changes and delay', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 500 }),
      { initialProps: { data: { title: 'initial' } } }
    )

    expect(result.current).toBe('idle')

    // Change data
    rerender({ data: { title: 'updated' } })

    // Advance timers to trigger debounce
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ title: 'updated' })
      expect(result.current).toBe('saved')
    })
  })

  it('should return correct status during save lifecycle', async () => {
    const onSave = jest.fn().mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 100))
    })

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 500 }),
      { initialProps: { data: { title: 'initial' } } }
    )

    // Initially idle
    expect(result.current).toBe('idle')

    // Change data
    rerender({ data: { title: 'updated' } })

    // After debounce, should be saving
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('saving')
    })

    // After save completes, should be saved
    jest.advanceTimersByTime(100)

    await waitFor(() => {
      expect(result.current).toBe('saved')
    })

    // After 2 seconds, should reset to idle
    jest.advanceTimersByTime(2000)

    await waitFor(() => {
      expect(result.current).toBe('idle')
    })
  })

  it('should not save when enabled is false', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { enabled: false }),
      { initialProps: { data: { title: 'initial' } } }
    )

    rerender({ data: { title: 'updated' } })
    jest.advanceTimersByTime(500)

    expect(onSave).not.toHaveBeenCalled()
  })

  it('should toggle enabled flag correctly', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ data, enabled }) => useAutoSave(data, onSave, { enabled }),
      { initialProps: { data: { title: 'initial' }, enabled: false } }
    )

    // Change data while disabled
    rerender({ data: { title: 'updated' }, enabled: false })
    jest.advanceTimersByTime(500)
    expect(onSave).not.toHaveBeenCalled()

    // Enable and change data
    rerender({ data: { title: 'final' }, enabled: true })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ title: 'final' })
    })
  })

  it('should handle save errors', async () => {
    const error = new Error('Save failed')
    const onSave = jest.fn().mockRejectedValue(error)
    const onSaveError = jest.fn()

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { onSaveError }),
      { initialProps: { data: { title: 'initial' } } }
    )

    rerender({ data: { title: 'updated' } })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('error')
      expect(onSaveError).toHaveBeenCalledWith(error)
    })
  })

  it('should keep error status without auto-reset', async () => {
    const error = new Error('Save failed')
    const onSave = jest.fn().mockRejectedValue(error)

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave),
      { initialProps: { data: { title: 'initial' } } }
    )

    rerender({ data: { title: 'updated' } })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('error')
    })

    // Wait 5 seconds - error status should persist
    jest.advanceTimersByTime(5000)
    expect(result.current).toBe('error')
  })

  it('should call lifecycle callbacks in correct order', async () => {
    const callOrder: string[] = []
    const onSave = jest.fn().mockResolvedValue(undefined)
    const onSaveStart = jest.fn(() => callOrder.push('start'))
    const onSaveSuccess = jest.fn(() => callOrder.push('success'))

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { onSaveStart, onSaveSuccess }),
      { initialProps: { data: { title: 'initial' } } }
    )

    rerender({ data: { title: 'updated' } })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(onSaveStart).toHaveBeenCalled()
      expect(onSaveSuccess).toHaveBeenCalled()
      expect(callOrder).toEqual(['start', 'success'])
    })
  })

  it('should not save if data has not changed', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 500 }),
      { initialProps: { data: { title: 'same' } } }
    )

    // "Change" to the same value
    rerender({ data: { title: 'same' } })
    jest.advanceTimersByTime(500)

    expect(onSave).not.toHaveBeenCalled()
  })

  it('should detect deep changes in objects', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 500 }),
      { initialProps: { data: { user: { name: 'John', age: 30 } } } }
    )

    // Change nested property
    rerender({ data: { user: { name: 'John', age: 31 } } })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ user: { name: 'John', age: 31 } })
    })
  })

  it('should work with custom delay', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 1000 }),
      { initialProps: { data: { title: 'initial' } } }
    )

    rerender({ data: { title: 'updated' } })

    // Should not save after 500ms
    jest.advanceTimersByTime(500)
    expect(onSave).not.toHaveBeenCalled()

    // Should save after 1000ms
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled()
    })
  })

  it('should prevent concurrent saves', async () => {
    let resolveFirstSave: (() => void) | undefined

    const onSave = jest.fn().mockImplementation(() => {
      return new Promise(resolve => {
        resolveFirstSave = resolve as () => void
      })
    })

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 100 }),
      { initialProps: { data: { title: 'initial' } } }
    )

    // First change
    rerender({ data: { title: 'first' } })
    jest.advanceTimersByTime(100)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })

    // Second change while first is still saving
    rerender({ data: { title: 'second' } })
    jest.advanceTimersByTime(100)

    // Should not call onSave again (still saving first)
    expect(onSave).toHaveBeenCalledTimes(1)

    // Complete first save
    resolveFirstSave!()

    await waitFor(() => {
      // After first save completes, still should not have called onSave again
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  it('should handle array data correctly', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave, { delay: 500 }),
      { initialProps: { data: ['item1', 'item2'] } }
    )

    rerender({ data: ['item1', 'item2', 'item3'] })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(['item1', 'item2', 'item3'])
    })
  })

  it('should reset to idle 2 seconds after successful save', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave(data, onSave),
      { initialProps: { data: { title: 'initial' } } }
    )

    rerender({ data: { title: 'updated' } })
    jest.advanceTimersByTime(500)

    await waitFor(() => {
      expect(result.current).toBe('saved')
    })

    // After 1 second, should still be saved
    jest.advanceTimersByTime(1000)
    expect(result.current).toBe('saved')

    // After 2 seconds total, should be idle
    jest.advanceTimersByTime(1000)

    await waitFor(() => {
      expect(result.current).toBe('idle')
    })
  })
})
