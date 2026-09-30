import path from "path"
import { fork } from "node:child_process"
import { createWorkerPool, type PoolOutcome, type WorkerLike, type WorkerPool } from "./worker-pool"
import {
  EXTRACT_TIMEOUT_MS,
  MAX_CHARS,
  MAX_CONCURRENT_EXTRACTIONS,
  MAX_QUEUED_EXTRACTIONS,
  type WorkerFormat,
} from "./formats"

export interface ExtractJob {
  format: WorkerFormat
  filePath: string
}

export interface WorkerText {
  text: string
  /** The worker clipped the raw text before sending it back. */
  clipped: boolean
}

/** Heap cap per extraction process so a hostile/huge document cannot exhaust host memory. */
const WORKER_MAX_OLD_SPACE_MB = 1024

/** Env vars the parser process needs; secrets (DB URL, auth keys) are deliberately not passed. */
const INHERITED_ENV_KEYS = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LANG"]

/**
 * The worker lives outside the Next.js bundle (see workers/extract-worker.cjs),
 * resolved from the app root, which is the cwd for both `next dev` and `next start`.
 *
 * It runs in a forked child process rather than worker_threads: pdf-parse v2
 * loads the native @napi-rs/canvas addon, which segfaults the entire process
 * when a worker thread shuts down.
 */
export function extractWorkerPath(): string {
  return path.join(process.cwd(), "workers", "extract-worker.cjs")
}

export function parseWorkerMessage(msg: unknown): PoolOutcome<WorkerText> {
  if (!msg || typeof msg !== "object") return { ok: false, error: "malformed worker response" }
  const m = msg as Record<string, unknown>
  if (m.ok === true && typeof m.text === "string") {
    return { ok: true, value: { text: m.text, clipped: m.clipped === true } }
  }
  if (m.ok === false) {
    return { ok: false, error: typeof m.error === "string" ? m.error : "unknown worker error" }
  }
  return { ok: false, error: "malformed worker response" }
}

function workerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV }
  for (const key of INHERITED_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return env
}

function spawnExtractWorker(job: ExtractJob): WorkerLike {
  const child = fork(extractWorkerPath(), [], {
    cwd: process.cwd(),
    env: workerEnv(),
    // Do not inherit the server's execArgv (e.g. --inspect under next dev).
    execArgv: [`--max-old-space-size=${WORKER_MAX_OLD_SPACE_MB}`],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  })
  child.send({ format: job.format, filePath: job.filePath, maxChars: MAX_CHARS }, (err) => {
    if (err) child.kill()
  })
  return {
    on: (event: "message" | "error" | "exit", listener: (arg: never) => void) =>
      child.on(event, listener as (...args: unknown[]) => void),
    terminate: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    },
  } as WorkerLike
}

// One pool per server process. Stored on globalThis so Next.js dev HMR
// re-evaluating this module does not create extra pools (and extra concurrency).
const globalForPool = globalThis as unknown as {
  kanflowExtractPool?: WorkerPool<ExtractJob, WorkerText>
}

function getPool(): WorkerPool<ExtractJob, WorkerText> {
  if (!globalForPool.kanflowExtractPool) {
    globalForPool.kanflowExtractPool = createWorkerPool<ExtractJob, WorkerText>({
      maxConcurrent: MAX_CONCURRENT_EXTRACTIONS,
      maxQueue: MAX_QUEUED_EXTRACTIONS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
      spawn: spawnExtractWorker,
      parseMessage: parseWorkerMessage,
    })
  }
  return globalForPool.kanflowExtractPool
}

/** Runs a CPU-heavy parser off the main event loop, in a separate process. Never rejects. */
export function runExtraction(job: ExtractJob): Promise<PoolOutcome<WorkerText>> {
  return getPool().run(job)
}
