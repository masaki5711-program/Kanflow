"use client"

import { useId } from "react"
import { Button, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/** Members of the project who can be named for a role (only explicit members: the server refuses anyone else). */
export interface RoleMember {
  id: string
  name: string
}

/** role → chosen member ids. */
export type RoleAssignments = Record<string, string[]>

/** The server's limit per role (estimate-run.schemas.ts). */
export const ROLE_MEMBERS_MAX = 50

interface Props {
  roles: readonly string[]
  members: readonly RoleMember[]
  value: RoleAssignments
  onChange: (next: RoleAssignments) => void
  /** While a run is being made: the choices stay readable and focusable but do not change. */
  busy?: boolean
}

/** Rows of the project's member list (GET /api/projects/:id/members) as pickable members. */
export function toRoleMembers(raw: unknown): RoleMember[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((row: unknown) => {
    if (typeof row !== "object" || row === null) return []
    const m = row as { userId?: unknown; user?: unknown }
    const name = typeof m.user === "object" && m.user !== null ? (m.user as { name?: unknown }).name : undefined
    return typeof m.userId === "string" && typeof name === "string" ? [{ id: m.userId, name }] : []
  })
}

/** The assignments to send: roles of this template only, members of this project only, no empty role. */
export function assignmentsToSend(value: RoleAssignments, roles: readonly string[], members: readonly RoleMember[]): RoleAssignments {
  const known = new Set(members.map((m) => m.id))
  const out: RoleAssignments = {}
  for (const role of roles) {
    const ids = (value[role] ?? []).filter((id) => known.has(id))
    if (ids.length > 0) out[role] = ids
  }
  return out
}

/**
 * 役割ごとの担当 of 「計画を作る」: for each role of the chosen template, the project members who can do it. The
 * levelling then proposes owners among them by their load. A role left empty keeps its work unassigned.
 */
export function RoleAssignmentsField({ roles, members, value, onChange, busy }: Props) {
  const { t } = useLanguage()
  const base = useId()

  function toggle(role: string, memberId: string, on: boolean) {
    if (busy) return
    const current = value[role] ?? []
    const next = on ? [...current.filter((id) => id !== memberId), memberId] : current.filter((id) => id !== memberId)
    onChange({ ...value, [role]: next })
  }

  return (
    <fieldset aria-describedby={`${base}-hint`} className="min-w-0 border-t border-border pt-4 sm:col-span-2">
      <legend className="float-left mb-1 w-full text-body font-semibold text-fg">{t.pesRolesTitle}</legend>
      <p id={`${base}-hint`} className="clear-left mb-3 text-caption text-fg-muted">
        {t.pesRolesHint}
      </p>
      {members.length === 0 ? (
        <p className="text-body text-fg-muted">{t.pesRoleNoMembers}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => {
            const chosen = new Set(value[role] ?? [])
            const full = chosen.size >= ROLE_MEMBERS_MAX
            return (
              <fieldset key={role} className="min-w-0 rounded-ui-sm border border-border bg-surface p-2">
                <legend className="float-left mb-1 flex w-full items-baseline justify-between gap-2 px-1">
                  <span className="min-w-0 break-words text-body font-semibold text-fg">{t.pesRoleMembers.replace("{role}", role)}</span>
                  <span aria-hidden="true" className={cn("shrink-0 text-caption tabular-nums", chosen.size === 0 ? "text-fg-subtle" : "text-primary-active")}>
                    {t.pesRoleChosen.replace("{n}", String(chosen.size))}
                  </span>
                </legend>
                <ul className="clear-left max-h-56 space-y-0.5 overflow-y-auto">
                  {members.map((m) => {
                    const checked = chosen.has(m.id)
                    const locked = busy || (full && !checked)
                    return (
                      <li key={m.id}>
                        <label
                          title={m.name}
                          className={cn(
                            "flex min-h-8 items-center gap-2 rounded-ui-sm px-1.5 py-1 text-body text-fg has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
                            locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface-muted",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-primary"
                            checked={checked}
                            aria-disabled={locked || undefined}
                            onChange={(e) => {
                              if (!locked) toggle(role, m.id, e.target.checked)
                            }}
                          />
                          <span className="min-w-0 break-words">{m.name}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

/** Retry row for a failed load of the roles or the members. */
export function RoleAssignmentsError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage()
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-body text-danger">
      {t.pesRolesFailed}
      <Button size="sm" variant="secondary" onClick={onRetry}>
        {t.errorRetry}
      </Button>
    </div>
  )
}
