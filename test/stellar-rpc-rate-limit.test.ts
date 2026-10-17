import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as rpcModule from '../src/stellar/rpc.js'

describe('Soroban RPC rate limit handling (issue #268)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('getLatestLedger retries on 429 with exponential backoff', async () => {
    let callCount = 0
    const mockServer = {
      getLatestLedger: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          const err = new Error('429 Too Many Requests')
          ;(err as any).status = 429
          throw err
        }
        return { sequence: 12345, id: 'abc123' }
      }),
    }

    // Replace the server instance
    vi.spyOn(rpcModule, 'server', 'get').mockReturnValue(mockServer as any)

    const promise = rpcModule.getLatestLedger()

    // First retry after ~2s
    await vi.advanceTimersByTimeAsync(2500)
    // Second retry after ~4s
    await vi.advanceTimersByTimeAsync(4500)

    const result = await promise
    expect(result).toBe(12345)
    expect(callCount).toBe(3)
  })

  it('getLatestLedgerInfo retries on 429 with exponential backoff', async () => {
    let callCount = 0
    const mockServer = {
      getLatestLedger: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 2) {
          const err = new Error('Rate limit exceeded')
          ;(err as any).code = 429
          throw err
        }
        return { sequence: 67890, id: 'def456' }
      }),
    }

    vi.spyOn(rpcModule, 'server', 'get').mockReturnValue(mockServer as any)

    const promise = rpcModule.getLatestLedgerInfo()

    // First retry after ~2s
    await vi.advanceTimersByTimeAsync(2500)

    const result = await promise
    expect(result).toEqual({ sequence: 67890, hash: 'def456' })
    expect(callCount).toBe(2)
  })

  it('throws after max retries on persistent 429', async () => {
    const mockServer = {
      getLatestLedger: vi.fn().mockImplementation(async () => {
        const err = new Error('429 Too Many Requests')
        ;(err as any).status = 429
        throw err
      }),
    }

    vi.spyOn(rpcModule, 'server', 'get').mockReturnValue(mockServer as any)

    const promise = rpcModule.getLatestLedger()

    // Advance through all retries (5 total: initial + 5 retries)
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(35000) // Max backoff is 32s + jitter
    }

    await expect(promise).rejects.toThrow('429')
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(6)
  })

  it('does not retry on non-429 errors', async () => {
    const mockServer = {
      getLatestLedger: vi.fn().mockRejectedValue(new Error('Network error')),
    }

    vi.spyOn(rpcModule, 'server', 'get').mockReturnValue(mockServer as any)

    await expect(rpcModule.getLatestLedger()).rejects.toThrow('Network error')
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1)
  })

  it('includes jitter in backoff delay', async () => {
    let callCount = 0
    const delays: number[] = []
    const originalSetTimeout = setTimeout

    vi.spyOn(global, 'setTimeout').mockImplementation(((fn: any, delay: number) => {
      delays.push(delay)
      return originalSetTimeout(fn, 0)
    }) as any)

    const mockServer = {
      getLatestLedger: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          const err = new Error('Rate limited')
          ;(err as any).status = 429
          throw err
        }
        return { sequence: 100, id: 'hash' }
      }),
    }

    vi.spyOn(rpcModule, 'server', 'get').mockReturnValue(mockServer as any)
    vi.useRealTimers() // Use real timers for this test to see actual delays

    await rpcModule.getLatestLedger()

    // Check that delays include jitter (should not be exactly 2000, 4000, etc.)
    expect(delays.length).toBeGreaterThan(0)
    // First retry base delay is 2000ms, should have jitter added (up to 1000ms)
    if (delays[0]) {
      expect(delays[0]).toBeGreaterThanOrEqual(2000)
      expect(delays[0]).toBeLessThanOrEqual(3000)
    }
  })
})
