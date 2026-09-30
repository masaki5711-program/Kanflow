import { envPositiveInt } from "@/lib/ai-gate/config"

/** Pure (no DB) so the worker config / --dry-run can read it. */
export const DEFAULT_MAX_INVESTIGATIONS = 3

/** SURVEILLANCE_MAX_INVESTIGATIONS: agent investigations per surveillance run; positive integer, default 3. */
export function resolveMaxInvestigations(env: Readonly<Record<string, string | undefined>>): number {
  return envPositiveInt(env.SURVEILLANCE_MAX_INVESTIGATIONS, DEFAULT_MAX_INVESTIGATIONS)
}
