"use client"

import { Building2, CircleCheck, KeyRound, Pencil, Ban } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Badge, IconButton } from "@/components/ui"
import type { ManagedUser } from "./types"

interface Props {
  user: ManagedUser
  onEdit: () => void
  onResetPassword: () => void
  onToggleActive: () => void
  toggling: boolean
}

/** One user card in the admin list. */
export function UserRow({ user, onEdit, onResetPassword, onToggleActive, toggling }: Props) {
  const { t } = useLanguage()
  const roleLabel =
    user.role === "admin" ? t.userRoleAdmin : user.role === "section_manager" ? t.roleSectionManager : t.userRoleMember
  const roleTone = user.role === "admin" ? "primary" : user.role === "section_manager" ? "warning" : "neutral"

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-4 bg-surface rounded-ui-lg border border-border shadow-ui-sm p-5 ${
        user.isActive ? "" : "bg-surface-muted"
      }`}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div aria-hidden className="w-10 h-10 rounded-full bg-surface-sunken flex items-center justify-center text-body font-semibold text-fg-muted shrink-0">
          {user.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-body font-semibold truncate ${user.isActive ? "text-fg" : "text-fg-muted"}`}>{user.name}</span>
            {user.employeeNumber && <span className="text-caption text-fg-muted font-mono">{user.employeeNumber}</span>}
            <Badge tone={roleTone} size="sm">{roleLabel}</Badge>
            {user.sections.length > 0 && (
              <Badge tone="info" size="sm">{user.sections.map((s) => s.name).join(" / ")}</Badge>
            )}
            {!user.isActive && <Badge tone="danger" size="sm">{t.userInactive}</Badge>}
          </div>
          <div className="text-caption text-fg-muted mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="break-all">{user.email}</span>
            {user.department && (
              <span className="inline-flex items-center gap-1">
                <Building2 aria-hidden className="w-3 h-3" />
                {user.department}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-caption text-fg-muted mr-2">{`${user._count.memberships} ${t.userProjects}`}</span>
        <IconButton label={`${t.edit}: ${user.name}`} icon={<Pencil className="h-4 w-4" />} onClick={onEdit} />
        <IconButton label={`${t.userResetPassword}: ${user.name}`} icon={<KeyRound className="h-4 w-4" />} onClick={onResetPassword} />
        <IconButton
          label={`${user.isActive ? t.userDeactivate : t.userActivate}: ${user.name}`}
          icon={user.isActive ? <Ban className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
          variant={user.isActive ? "danger" : "ghost"}
          loading={toggling}
          onClick={onToggleActive}
        />
      </div>
    </li>
  )
}
