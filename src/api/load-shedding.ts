/**
 * A non-queueing concurrency gate for work that is deliberately lower
 * priority than ordinary API reads. Callers either enter immediately or shed
 * the request; they never wait behind work that could otherwise consume the
 * request pool indefinitely.
 */
export class ConcurrencyGate {
  private active = 0

  constructor(private readonly limit: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.limit) return false
    this.active += 1
    return true
  }

  release(): void {
    this.active -= 1
  }

  /** Issue #272: Guaranteed-release helper that executes `fn` with automatic
   *  cleanup on all exit paths (success, error, synchronous throw). Prevents
   *  capacity leaks when a route handler throws before reaching its manual
   *  `finally` block. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.tryAcquire()) {
      throw new Error('ConcurrencyGate: capacity exhausted')
    }
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}
