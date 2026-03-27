import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCopyFeedback } from '../useCopyFeedback'

describe('useCopyFeedback', () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.useFakeTimers()
    writeTextMock.mockClear().mockResolvedValue(undefined)
    // Mock clipboard API via defineProperty (clipboard is read-only getter)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with copied = false', () => {
    const { copied } = useCopyFeedback()
    expect(copied.value).toBe(false)
  })

  it('sets copied to true after successful copy', async () => {
    const { copied, copyWithFeedback } = useCopyFeedback()
    await copyWithFeedback('hello')
    expect(copied.value).toBe(true)
  })

  it('calls navigator.clipboard.writeText', async () => {
    const { copyWithFeedback } = useCopyFeedback()
    await copyWithFeedback('test text')
    expect(writeTextMock).toHaveBeenCalledWith('test text')
  })

  it('returns true on success', async () => {
    const { copyWithFeedback } = useCopyFeedback()
    const result = await copyWithFeedback('hello')
    expect(result).toBe(true)
  })

  it('resets copied after delay', async () => {
    const { copied, copyWithFeedback } = useCopyFeedback(1000)
    await copyWithFeedback('hello')
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(copied.value).toBe(false)
  })

  it('uses default 1500ms delay', async () => {
    const { copied, copyWithFeedback } = useCopyFeedback()
    await copyWithFeedback('hello')
    vi.advanceTimersByTime(1499)
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(copied.value).toBe(false)
  })

  it('returns false on clipboard failure', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('denied'))
    const { copied, copyWithFeedback } = useCopyFeedback()
    const result = await copyWithFeedback('hello')
    expect(result).toBe(false)
    expect(copied.value).toBe(false)
  })

  it('clears previous timer on rapid copies', async () => {
    const { copied, copyWithFeedback } = useCopyFeedback(1000)
    await copyWithFeedback('first')
    vi.advanceTimersByTime(500)
    await copyWithFeedback('second')
    // After 500ms more (total 1000ms from first, 500ms from second)
    vi.advanceTimersByTime(500)
    expect(copied.value).toBe(true) // second timer not expired yet
    vi.advanceTimersByTime(500)
    expect(copied.value).toBe(false) // now it's expired
  })
})
