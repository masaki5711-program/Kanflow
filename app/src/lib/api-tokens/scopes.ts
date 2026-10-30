import type { ProjectAction } from "@/lib/authz/policy"

/**
 * Personal access token scopes (pure, client-safe).
 *
 * A scope only opens a door the owner already has: a request is allowed when
 * the token carries the scope **and** the owner's project role allows the
 * action (`can(actor, action)`, docs/authorization.md). A dev's token with
 * `backlog:write` still gets 403 on PBI creation.
 *
 * `read` (project.view) is part of every token. Never rename a scope: it is
 * stored in ApiToken.scopes (JSON array, VARCHAR(191)).
 */
export const API_TOKEN_SCOPES = [
  "read",
  "backlog:write",
  "backlog:reorder",
  "sprint:write",
  "task:write",
  "comment:write",
  "icebox:write",
  "daily:write",
  "write:dev",
] as const
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]

/** The project action each scope stands for. */
export const SCOPE_ACTION: Record<ApiTokenScope, ProjectAction> = {
  read: "project.view",
  "backlog:write": "backlog.write",
  "backlog:reorder": "backlog.reorder",
  "sprint:write": "sprint.manage",
  "task:write": "task.write",
  "comment:write": "comment.write",
  "icebox:write": "icebox.write",
  "daily:write": "dailyScrum.write",
  // Named after the plan (GitStation docs/plan/06 §4.1), unlike the "<area>:write" scopes above.
  "write:dev": "dev.write",
}

/** Ready-made scope sets for the token form. */
export const API_TOKEN_SCOPE_PRESETS = {
  readOnly: ["read"],
  developer: ["read", "task:write", "comment:write", "icebox:write", "daily:write", "write:dev"],
  all: API_TOKEN_SCOPES,
} as const satisfies Record<string, readonly ApiTokenScope[]>

export function isApiTokenScope(value: unknown): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly unknown[]).includes(value)
}

/** Known scopes only, `read` always included, deduplicated, in canonical order. */
export function normalizeScopes(scopes: readonly unknown[]): ApiTokenScope[] {
  const wanted = new Set<unknown>(["read", ...scopes])
  return API_TOKEN_SCOPES.filter((s) => wanted.has(s))
}

/** The scope a token needs for a project action, or null when no token may do it. */
export function scopeForAction(action: ProjectAction): ApiTokenScope | null {
  const hit = API_TOKEN_SCOPES.find((s) => SCOPE_ACTION[s] === action)
  return hit ?? null
}
