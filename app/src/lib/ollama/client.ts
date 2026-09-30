import { gate } from "@/lib/translation/priority-gate"
import { aiLog } from "@/lib/ai-monitor"
import { metricsStore } from "@/lib/metrics/store"
import { OLLAMA_BASE_URL, OLLAMA_MAX_CONCURRENCY } from "./config"
import {
  OllamaAbortedError,
  OllamaHttpError,
  OllamaTimeoutError,
  OllamaUnavailableError,
  abortReasonToError,
  toOllamaError,
  type OllamaError,
} from "./errors"
import { parseNdjson } from "./ndjson"
import { PrioritySemaphore, type Priority, type SemaphoreStatus } from "./semaphore"
import { anySignal, startDeadline } from "./signals"

/**
 * Single transport for every Ollama request made by this process.
 *
 * - Composes the caller's signal (e.g. `request.signal`) with a per-call
 *   timeout, so a browser disconnect or deadline aborts the HTTP request and
 *   Ollama stops generating.
 * - Enforces a process-wide concurrency limit (OLLAMA_MAX_CONCURRENCY);
 *   waiting "user" calls are served before "background" ones.
 * - "user" calls enter the translation priority gate on entry (preempting
 *   background translation) and leave it when the call — including a fully
 *   consumed or cancelled stream — ends. "background" calls do not touch it.
 * - Every failure is one of the typed errors in ./errors.
 */

export type OllamaEndpoint = "chat" | "generate"
export type OllamaPriority = Priority

export interface OllamaRequestOptions {
  endpoint: OllamaEndpoint
  /** Request body; `stream` is set by the client. */
  body: Record<string, unknown>
  stream?: boolean
  signal?: AbortSignal
  timeoutMs: number
  priority: OllamaPriority
  /** Short name for logs, e.g. "chat" or "progress-report". */
  label: string
}

/** Parsed NDJSON chunks of a streaming response. Iterate at most once. */
export interface OllamaStream<T> extends AsyncIterable<T> {
  /** Composite signal (caller + timeout + cancel) governing this request. */
  readonly signal: AbortSignal
  /** Abort the request and release its slot / gate entry (idempotent). */
  cancel(reason?: unknown): void
}

/** Waits for a slot longer than this are logged. */
const QUEUE_LOG_THRESHOLD_MS = 1_000

const g = globalThis as unknown as { __kanflowOllamaSemaphore?: PrioritySemaphore }

function semaphore(): PrioritySemaphore {
  return g.__kanflowOllamaSemaphore ?? (g.__kanflowOllamaSemaphore = new PrioritySemaphore(OLLAMA_MAX_CONCURRENCY))
}

/** Current slot usage, for status panels. */
export function ollamaQueueStatus(): SemaphoreStatus {
  return semaphore().status()
}

/**
 * Replace the process-wide semaphore. Only safe while no request is in
 * flight — intended for tests.
 */
export function configureOllamaConcurrency(max: number): void {
  g.__kanflowOllamaSemaphore = new PrioritySemaphore(max)
}

interface Opened {
  res: Response
  signal: AbortSignal
  cancel: AbortController
  cleanup: () => void
  t0: number
}

function logFailure(opts: OllamaRequestOptions, err: OllamaError, t0: number): void {
  const ms = Date.now() - t0
  if (err instanceof OllamaAbortedError) {
    // Preempted background work is logged by the translation worker itself.
    if (opts.priority === "user") aiLog("OLLAMA_ABORT", `${opts.label}: cancelled after ${ms}ms`)
    return
  }
  const detail = err instanceof OllamaHttpError && err.detail ? ` — ${err.detail}` : ""
  aiLog("OLLAMA_ERROR", `${opts.label}: ${err.code} after ${ms}ms${detail}`)
}

async function open(opts: OllamaRequestOptions, stream: boolean): Promise<Opened> {
  const t0 = Date.now()
  const deadline = startDeadline(opts.timeoutMs, () => new OllamaTimeoutError(opts.timeoutMs))
  const cancel = new AbortController()
  const signal = anySignal([opts.signal, deadline.signal, cancel.signal])

  if (signal.aborted) {
    deadline.clear()
    const err = abortReasonToError(signal.reason)
    logFailure(opts, err, t0)
    throw err
  }

  const releaseGate = opts.priority === "user" ? gate.beginHigh() : () => {}
  let releaseSlot: () => void = () => {}
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    signal.removeEventListener("abort", cleanup)
    deadline.clear()
    releaseSlot()
    releaseGate()
  }
  // Free the slot as soon as the request is aborted, even if the consumer
  // never touches the stream again.
  signal.addEventListener("abort", cleanup, { once: true })

  try {
    const waitT0 = Date.now()
    const slot = await semaphore().acquire(opts.priority, signal)
    releaseSlot = slot
    if (cleaned) slot()
    const waited = Date.now() - waitT0
    metricsStore().recordAiWait(opts.priority, waited)
    if (waited >= QUEUE_LOG_THRESHOLD_MS) {
      aiLog("OLLAMA_QUEUE", `${opts.label}: waited ${waited}ms for a slot (${opts.priority})`)
    }

    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE_URL}/api/${opts.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opts.body, stream }),
        signal,
      })
    } catch (err) {
      throw toOllamaError(err, signal)
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new OllamaHttpError(res.status, detail)
    }
    return { res, signal, cancel, cleanup, t0 }
  } catch (err) {
    cleanup()
    const mapped = toOllamaError(err, signal)
    logFailure(opts, mapped, t0)
    throw mapped
  }
}

async function requestJson<T>(opts: OllamaRequestOptions): Promise<T> {
  const { res, signal, cleanup, t0 } = await open(opts, false)
  try {
    return (await res.json()) as T
  } catch (err) {
    const mapped = toOllamaError(err, signal, (e) =>
      e instanceof SyntaxError ? new OllamaHttpError(res.status, "invalid JSON response") : new OllamaUnavailableError({ cause: e })
    )
    logFailure(opts, mapped, t0)
    throw mapped
  } finally {
    cleanup()
  }
}

async function requestStream<T>(opts: OllamaRequestOptions): Promise<OllamaStream<T>> {
  const { res, signal, cancel, cleanup, t0 } = await open(opts, true)
  const body = res.body
  if (!body) {
    cleanup()
    const err = new OllamaHttpError(res.status, "empty response body")
    logFailure(opts, err, t0)
    throw err
  }

  async function* iterate(): AsyncGenerator<T, void, undefined> {
    try {
      yield* parseNdjson<T>(body!, signal)
    } catch (err) {
      const mapped = toOllamaError(err, signal)
      logFailure(opts, mapped, t0)
      throw mapped
    } finally {
      cleanup()
    }
  }

  let iterator: AsyncGenerator<T, void, undefined> | undefined
  return {
    signal,
    cancel(reason?: unknown) {
      if (!cancel.signal.aborted) cancel.abort(reason ?? new OllamaAbortedError())
      cleanup()
    },
    [Symbol.asyncIterator]() {
      if (iterator) throw new Error("OllamaStream can only be iterated once")
      iterator = iterate()
      return iterator
    },
  }
}

/**
 * Send one request to Ollama.
 * - `stream: true` resolves once response headers arrive, with an iterable of
 *   parsed NDJSON chunks (the slot and gate entry are held until the stream
 *   ends, is cancelled, or its signal aborts).
 * - otherwise resolves with the parsed JSON body.
 * Rejects with OllamaTimeoutError / OllamaUnavailableError /
 * OllamaAbortedError / OllamaHttpError.
 */
export function ollamaRequest<T = unknown>(opts: OllamaRequestOptions & { stream: true }): Promise<OllamaStream<T>>
export function ollamaRequest<T = unknown>(opts: OllamaRequestOptions & { stream?: false }): Promise<T>
export function ollamaRequest<T = unknown>(opts: OllamaRequestOptions): Promise<T | OllamaStream<T>> {
  return opts.stream ? requestStream<T>(opts) : requestJson<T>(opts)
}
