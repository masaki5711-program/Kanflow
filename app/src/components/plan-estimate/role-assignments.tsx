"use client"

import { useId } from "react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/** Members of the project who can be named for a role (only explicit members: the server refuses anyone else). */
export interface RoleMember {
  id: string
  name: string
}

/** role → chosen member ids. */
export type RoleAssignments = Record<string, string[]>

interface Props {
  roles: readonly string[]
  members: readonly RoleMember[]
  value: RoleAssignments
  onChange: (next: RoleAssignments) => void
  disabled?: boolean
}

/** Rows of the project's member list (GET /api/projects/:id/members) as pickable members. */
export function toRoleMembers(raw: unknown): RoleMember[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((m: { userId?: unknown; user?: { name?: unknown } }) =>
    typeof m?.userId === "string" && typeof m.user?.name === "string" ? [{ id: m.userId, name: m.user.name }] : [],
  )
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
export function RoleAssignmentsField({ roles, members, value, onChange, disabled }: Props) {
  const { t } = useLanguage()
  const base = useId()

  function toggle(role: string, memberId: string, on: boolean) {
    const current = value[role] ?? []
    const next = on ? [...current.filter((id) => id !== memberId), memberId] : current.filter((id) => id !== memberId)
    onChange({ ...value, [role]: next })
  }

  return (
    <fieldset className="min-w-0 space-y-3 rounded-ui-md border border-border bg-surface-muted/40 p-3 sm:col-span-2">
      <legend className="px-1 text-body font-semibold text-fg">{t.pesRolesTitle}</legend>
      <p id={`${base}-hint`} className="text-caption text-fg-muted">
        {t.pesRolesHint}
      </p>
      {members.length === 0 ? (
        <p className="text-caption text-fg-subtle">{t.pesRoleNoMembers}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => {
            const chosen = new Set(value[role] ?? [])
            return (
              <fieldset key={role} aria-describedby={`${base}-hint`} className="min-w-0 rounded-ui-sm border border-border bg-surface p-2">
                <legend className="px-1 text-caption font-semibold text-fg">
                  {t.pesRoleMembers.replace("{role}", role)}
                  <span className="ml-1.5 font-normal text-fg-subtle">({chosen.size})</span>
                </legend>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                  {members.map((m) => (
                    <li key={m.id}>
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-ui-sm px-1.5 text-body text-fg hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={chosen.has(m.id)}
                          disabled={disabled}
                          onChange={(e) => toggle(role, m.id, e.target.checked)}
                        />
                        <span className="min-w-0 truncate">{m.name}</span>
                      </label>
                    </li>
                  ))}
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
    <div role="alert" className="flex flex-wrap items-center gap-2 text-body text-danger sm:col-span-2">
      {t.pesRolesFailed}
      <Button size="sm" variant="secondary" onClick={onRetry}>
        {t.errorRetry}
      </Button>
    </div>
  )
}
