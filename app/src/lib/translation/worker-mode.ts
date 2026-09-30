import type { TranslationWorkerLocation } from "./types"

/**
 * Where the background translation loop runs (env AI_TRANSLATION_WORKER).
 *
 * - `external` (default, also when unset): only the standalone worker
 *   process (`npm run worker` / Windows service `kanflow-worker`) runs it.
 *   Web processes never do.
 * - `inprocess`: every `next start` process runs it inside Next.js (the
 *   pre-2026-09 behaviour). Legacy values `true` / `1` / `on` map here.
 *   `next dev` additionally needs AI_TRANSLATION_WORKER_IN_DEV=true.
 * - `off`: nobody translates (`false` / `0` / `off` / `disabled`).
 *
 * Unknown values fall back to `external` so a typo never starts a second
 * loop in a web process.
 */

export type TranslationWorkerMode = "external" | "inprocess" | "off"

type WorkerLocation = TranslationWorkerLocation

const LOCATION_NOTES: Readonly<Record<WorkerLocation, string>> = {
  "separate-process":
    "Background translation runs in the separate worker process (kanflow-worker); this web process does not run the loop by design.",
  "this-process": "Background translation runs inside this web process (AI_TRANSLATION_WORKER=inprocess).",
  "not-started": "AI_TRANSLATION_WORKER=inprocess, but the loop was not started in this web process.",
  off: "Background translation is disabled (AI_TRANSLATION_WORKER=off).",
}

/** Where the loop runs, seen from a web process (`startedHere` = loop started in this process). */
export function describeWorkerLocation(
  mode: TranslationWorkerMode,
  startedHere: boolean
): { location: WorkerLocation; note: string } {
  const location: WorkerLocation =
    mode === "off" ? "off" : mode === "external" ? "separate-process" : startedHere ? "this-process" : "not-started"
  return { location, note: LOCATION_NOTES[location] }
}

const INPROCESS = new Set(["inprocess", "in-process", "true", "1", "on", "yes"])
const OFF = new Set(["off", "false", "0", "no", "disabled", "none"])

export function parseWorkerMode(raw: string | undefined): TranslationWorkerMode {
  const v = (raw ?? "").trim().toLowerCase()
  if (INPROCESS.has(v)) return "inprocess"
  if (OFF.has(v)) return "off"
  return "external"
}

function isTruthy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes" || v === "on"
}

export interface InProcessDecision {
  start: boolean
  mode: TranslationWorkerMode
  reason: string
}

/** Should THIS Next.js process start the translation loop? */
export function decideInProcessWorker(env: NodeJS.ProcessEnv): InProcessDecision {
  const mode = parseWorkerMode(env.AI_TRANSLATION_WORKER)
  if (mode === "off") return { start: false, mode, reason: "AI_TRANSLATION_WORKER=off" }
  if (mode === "external") {
    return { start: false, mode, reason: "AI_TRANSLATION_WORKER=external: translations are processed by the kanflow-worker process" }
  }
  if (env.NODE_ENV === "development" && !isTruthy(env.AI_TRANSLATION_WORKER_IN_DEV)) {
    return { start: false, mode, reason: "next dev: set AI_TRANSLATION_WORKER_IN_DEV=true to run the in-process worker" }
  }
  return { start: true, mode, reason: "AI_TRANSLATION_WORKER=inprocess" }
}
