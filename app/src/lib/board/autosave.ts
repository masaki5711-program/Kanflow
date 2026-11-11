/**
 * Autosave of the ボード editor, without React: when to save, one request at a time, and what the user is
 * told. A failed save is never dropped: the state says "failed", the unsaved elements stay in the changed
 * set (doc.ts) and the save is tried again — after a growing delay, on the next change, or when the user
 * presses retry.
 */

export type SaveStatus = "saved" | "pending" | "saving" | "failed"

/** Thrown by `save` to say that trying the same request again cannot help (refused, not a lost connection). */
export class PermanentSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermanentSaveError"
  }
}

export interface AutosaveTimers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

export interface AutosaveOptions {
  /** Sends everything that is unsaved; rejects when it could not be saved. */
  save: () => Promise<void>
  /** Is there anything unsaved right now? */
  hasChanges: () => boolean
  onStatus: (status: SaveStatus, error: unknown) => void
  /** Quiet time after the last change before saving (plan §4.3: about 0.3 s). */
  debounceMs?: number
  /** Waits before the automatic retries; the last one repeats. */
  retryDelaysMs?: readonly number[]
  timers?: AutosaveTimers
}

export interface Autosave {
  /** The document changed. */
  changed: () => void
  /** Saves now (retry button, leaving the sheet). Resolves true when nothing is left unsaved. */
  flush: () => Promise<boolean>
  status: () => SaveStatus
  dispose: () => void
}

export const AUTOSAVE_DEBOUNCE_MS = 300
export const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000]

const DEFAULT_TIMERS: AutosaveTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS
  const retryDelays = options.retryDelaysMs ?? AUTOSAVE_RETRY_DELAYS_MS
  const timers = options.timers ?? DEFAULT_TIMERS

  let status: SaveStatus = "saved"
  let timer: unknown = null
  let inFlight: Promise<boolean> | null = null
  let failures = 0
  let disposed = false

  function setStatus(next: SaveStatus, error: unknown = null) {
    status = next
    if (!disposed) options.onStatus(next, error)
  }

  function cancelTimer() {
    if (timer !== null) timers.clear(timer)
    timer = null
  }

  function schedule(ms: number) {
    cancelTimer()
    timer = timers.set(() => {
      timer = null
      void run()
    }, ms)
  }

  /** One save attempt. Resolves true when the attempt succeeded. */
  function run(): Promise<boolean> {
    if (inFlight) return inFlight
    if (!options.hasChanges()) {
      failures = 0
      if (status !== "saved") setStatus("saved")
      return Promise.resolve(true)
    }
    setStatus("saving")
    const attempt = options.save().then(
      () => {
        inFlight = null
        failures = 0
        if (disposed) return true
        if (options.hasChanges()) {
          // Changed again while the request was on its way.
          setStatus("pending")
          schedule(debounceMs)
        } else {
          setStatus("saved")
        }
        return true
      },
      (error: unknown) => {
        inFlight = null
        failures += 1
        if (disposed) return false
        setStatus("failed", error)
        if (!(error instanceof PermanentSaveError)) {
          schedule(retryDelays[Math.min(failures, retryDelays.length) - 1] ?? 30_000)
        }
        return false
      },
    )
    inFlight = attempt
    return attempt
  }

  return {
    changed() {
      if (disposed || inFlight) return
      // While a failed save waits for its retry, a change does not cut the wait short (the backoff would be lost
      // during an outage); the retry sends this change too. A refused save has no retry: the change is sent.
      if (status === "failed" && timer !== null) return
      if (status !== "failed") setStatus("pending")
      schedule(debounceMs)
    },
    async flush() {
      cancelTimer()
      // A change made while a request is on its way needs one more round; a few rounds are plenty.
      for (let round = 0; round < 5; round++) {
        if (!(await run())) return false
        cancelTimer()
        if (!options.hasChanges()) return true
      }
      return !options.hasChanges()
    },
    status: () => status,
    dispose() {
      disposed = true
      cancelTimer()
    },
  }
}
