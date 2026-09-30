"use client"

import { Building2, CircleCheck, KeyRound, Pencil, Ban } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Badge, IconButton, cn } from "@/components/ui"
import { CardMenu } from "@/app/projects/[projectId]/backlog/card-menu"
import type { ManagedUser } from "./types"

interface Props {
  user: ManagedUser
  onEdit: () => void
  onResetPassword: () => void
  onToggleActive: () => void
  toggling: boolean
}

/**
 * One user in the admin list (A3-12).
 * - below `sm`: a stacked card — name on its own line (wraps, never "E…"),
 *   email on a full-width line, badges, meta, and one actions menu (⋯).
 * - `sm` and up: a dense row with quiet inline actions; the destructive one
 *   only turns red on hover instead of a solid red button on every row.
 */
export function UserRow({ user, onEdit, onResetPassword, onToggleActive, toggling }: Props) {
  const { t } = useLanguage()
  const roleLabel =
    user.role === "admin" ? t.userRoleAdmin : user.role === "section_manager" ? t.roleSectionManager : t.userRoleMember
  const roleTone = user.role === "admin" ? "primary" : user.role === "section_manager" ? "warning" : "neutral"
  const toggleLabel = user.isActive ? t.userDeactivate : t.userActivate
  const projects = `${user._count.memberships} ${t.userProjects}`

  return (
    <li
      data-testid="user-row"
      className={cn(
        "flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4",
        user.isActive ? "bg-surface" : "bg-surface-muted",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-caption font-semibold text-fg-muted">
          {user.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span data-testid="user-name" className={cn("break-words text-body font-semibold", user.isActive ? "text-fg" : "text-fg-muted")}>
              {user.name}
            </span>
            {user.employeeNumber && <span className="font-mono text-caption text-fg-muted">{user.employeeNumber}</span>}
          </div>
          <div data-testid="user-email" className="break-words text-caption text-fg-muted [overflow-wrap:anywhere]">
            {user.email}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={roleTone} size="sm">{roleLabel}</Badge>
            {!user.isActive && <Badge tone="danger" size="sm">{t.userInactive}</Badge>}
            {/* One badge per section so a long list wraps on phones (P-15). */}
            {user.sections.map((s) => (
              <Badge key={s.id} tone="info" size="sm" data-testid="user-section-badge">
                {s.name}
              </Badge>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-caption text-fg-muted sm:hidden">
            {user.department && <Department name={user.department} />}
            <span>{projects}</span>
          </div>
        </div>
        <div className="shrink-0 sm:hidden" data-testid="user-actions-menu">
          <CardMenu
            portal
            label={`${t.userActionsMenu}: ${user.name}`}
            items={[
              { key: "edit", label: t.edit, icon: <Pencil className="h-4 w-4" />, onSelect: onEdit },
              { key: "reset", label: t.userResetPassword, icon: <KeyRound className="h-4 w-4" />, onSelect: onResetPassword },
              {
                key: "toggle",
                label: toggleLabel,
                disabled: toggling,
                icon: user.isActive ? <Ban className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />,
                onSelect: onToggleActive,
              },
            ]}
          />
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-3 text-caption text-fg-muted sm:flex">
        {user.department && <Department name={user.department} />}
        <span className="w-24 text-right tabular-nums">{projects}</span>
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex" data-testid="user-actions-inline">
        <IconButton label={`${t.edit}: ${user.name}`} icon={<Pencil className="h-4 w-4" />} onClick={onEdit} />
        <IconButton label={`${t.userResetPassword}: ${user.name}`} icon={<KeyRound className="h-4 w-4" />} onClick={onResetPassword} />
        <IconButton
          label={`${toggleLabel}: ${user.name}`}
          icon={user.isActive ? <Ban className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
          variant="ghost"
          className={user.isActive ? "hover:bg-danger-soft hover:text-danger-strong" : undefined}
          loading={toggling}
          onClick={onToggleActive}
        />
      </div>
    </li>
  )
}

function Department({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Building2 aria-hidden className="h-3 w-3" />
      {name}
    </span>
  )
}
