"use client"

import { Button, EmptyState, SkeletonLines, cn, useConfirm } from "@/components/ui"
import { MemberPicker } from "@/components/member-picker"
import { apiFetch, useApiMutation, type UseApiQueryResult } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { SettingsCard } from "./settings-card"
import { ROLE_CLASSES, type Member } from "./settings-types"

interface MembersSectionProps {
  projectId: string
  /** Members query owned by the page (it also derives isPO from it). */
  membersQuery: UseApiQueryResult<Member[]>
}

interface RoleVars {
  memberId: string
  role: string
}

export function MembersSection({ projectId, membersQuery }: MembersSectionProps) {
  const { t, pt } = useLanguage()
  const confirm = useConfirm()
  const { data: members = [], isLoading, mutate: setMembers, refetch } = membersQuery
  const memberUrl = (memberId: string) => `/api/projects/${projectId}/members/${memberId}`

  const changeRole = useApiMutation(
    ({ memberId, role }: RoleVars) => apiFetch(memberUrl(memberId), { method: "PATCH", json: { role } }),
    {
      onMutate: ({ memberId, role }) => {
        const prev = members
        setMembers((list) => list?.map((m) => (m.id === memberId ? { ...m, role } : m)))
        return prev
      },
      rollback: (prev) => setMembers(prev),
      toastOnError: () => t.settingsRoleChangeFailed,
    },
  )

  const removeMember = useApiMutation(
    (memberId: string) => apiFetch(memberUrl(memberId), { method: "DELETE" }),
    {
      onMutate: (memberId) => {
        const prev = members
        setMembers((list) => list?.filter((m) => m.id !== memberId))
        return prev
      },
      rollback: (prev) => setMembers(prev),
      toastOnError: () => t.settingsRemoveFailed,
    },
  )

  async function handleRemove(memberId: string) {
    const ok = await confirm({
      message: t.settingsRemoveConfirm,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) removeMember.mutate(memberId)
  }

  return (
    <>
      <SettingsCard title={t.settingsAddMember}>
        <MemberPicker
          projectId={projectId}
          rolePT={{ rolePO: pt.rolePO, roleSM: pt.roleSM, roleDev: pt.roleDev }}
          onAdded={refetch}
        />
      </SettingsCard>

      <SettingsCard
        title={t.settingsMembers}
        aside={<span className="text-caption text-fg-muted">{members.length}</span>}
      >
        {isLoading ? (
          <SkeletonLines lines={3} label={t.loading} />
        ) : members.length === 0 ? (
          <EmptyState compact title={t.settingsMembersEmpty} />
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                onRoleChange={(role) => changeRole.mutate({ memberId: m.id, role })}
                onRemove={() => handleRemove(m.id)}
              />
            ))}
          </ul>
        )}
      </SettingsCard>
    </>
  )
}

interface MemberRowProps {
  member: Member
  onRoleChange: (role: string) => void
  onRemove: () => void
}

function MemberRow({ member: m, onRoleChange, onRemove }: MemberRowProps) {
  const { t, pt } = useLanguage()
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-ui-sm border-b border-border px-3 py-2.5 last:border-0 hover:bg-surface-muted">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-body font-semibold text-fg-muted"
        >
          {m.user.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body font-semibold text-fg">{m.user.name}</span>
            {m.user.employeeNumber && (
              <span className="font-mono text-caption text-fg-muted">{m.user.employeeNumber}</span>
            )}
          </div>
          <div className="flex items-center gap-2 truncate text-caption text-fg-muted">
            <span className="truncate">{m.user.email}</span>
            {m.user.department && <span>· {m.user.department}</span>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={m.role}
          onChange={(e) => onRoleChange(e.target.value)}
          aria-label={t.settingsRoleOf.replace("{name}", m.user.name)}
          className={cn(
            "min-h-8 cursor-pointer rounded-full border-0 px-2 py-1 text-caption font-medium",
            ROLE_CLASSES[m.role] ?? "bg-surface-sunken text-fg",
          )}
        >
          <option value="po">{pt.rolePO}</option>
          <option value="sm">{pt.roleSM}</option>
          <option value="dev">{pt.roleDev}</option>
        </select>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={t.settingsRemoveMemberOf.replace("{name}", m.user.name)}
          className="text-danger"
        >
          {t.settingsRemoveMember}
        </Button>
      </div>
    </li>
  )
}
