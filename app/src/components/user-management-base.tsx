"use client"

import { useMemo, useState } from "react"
import { Plus, Users } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { Button, EmptyState, SkeletonLines, useToast, useConfirm, PageHeader } from "@/components/ui"
import { DEPARTMENT_LIST_ID, type ManagedUser, type SectionRef } from "./user-management/types"
import { UserFilters, type UserFilterState } from "./user-management/user-filters"
import { UserFormModal } from "./user-management/user-form-modal"
import { ResetPasswordModal } from "./user-management/reset-password-modal"
import { UserRow } from "./user-management/user-row"
import { useDocumentTitle } from "@/hooks/use-document-title"

interface Props {
  headerExtra?: React.ReactNode
}

const USERS_URL = "/api/users"
const INITIAL_FILTERS: UserFilterState = { query: "", role: "all", status: "active", department: "all" }

/** `null` = create dialog, a user = edit dialog, `undefined` = closed. */
type FormTarget = ManagedUser | null | undefined

function matches(u: ManagedUser, f: UserFilterState): boolean {
  if (f.role !== "all" && u.role !== f.role) return false
  if (f.status === "active" && !u.isActive) return false
  if (f.status === "inactive" && u.isActive) return false
  if (f.department !== "all" && u.department !== f.department) return false
  const q = f.query.trim().toLowerCase()
  if (!q) return true
  return [u.name, u.email, u.employeeNumber ?? "", u.department ?? ""].join(" ").toLowerCase().includes(q)
}

export function UserManagementBase({ headerExtra }: Props) {
  const { t } = useLanguage()
  useDocumentTitle([t.userManagementTitle])
  const confirm = useConfirm()
  const toast = useToast()
  // Independent lists → two parallel queries.
  const usersQuery = useApiQuery<ManagedUser[]>(USERS_URL, { toastOnError: true })
  const sectionsQuery = useApiQuery<SectionRef[]>("/api/admin/sections", { toastOnError: true })
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const sections = (sectionsQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }))

  const [filters, setFilters] = useState<UserFilterState>(INITIAL_FILTERS)
  const [formTarget, setFormTarget] = useState<FormTarget>(undefined)
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null)

  const departments = useMemo(
    () => Array.from(new Set(users.map((u) => u.department).filter((d): d is string => !!d))).sort(),
    [users],
  )
  const filtered = useMemo(() => users.filter((u) => matches(u, filters)), [users, filters])

  const toggleActive = useApiMutation(
    (user: ManagedUser) => apiFetch(`${USERS_URL}/${user.id}`, { method: "PATCH", json: { isActive: !user.isActive } }),
    {
      onMutate: (user) => {
        const prev = usersQuery.data
        usersQuery.mutate((list) => list?.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)))
        return prev
      },
      rollback: (prev) => usersQuery.mutate(prev),
      toastOnError: () => t.errorChangeFailed,
      onSuccess: (_result, user) => toast.success(user.isActive ? t.userDeactivated : t.userActivated),
    },
  )
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggleActive(user: ManagedUser) {
    if (user.isActive) {
      const ok = await confirm({
        title: t.userDeactivate,
        message: t.userDeactivateConfirm.replace("{name}", user.name),
        confirmLabel: t.userDeactivate,
        cancelLabel: t.cancel,
        variant: "danger",
      })
      if (!ok) return
    }
    setTogglingId(user.id)
    await toggleActive.mutate(user)
    setTogglingId(null)
  }

  return (
    <div>
      <PageHeader
        eyebrow={headerExtra}
        title={t.userManagementTitle}
        description={<span aria-live="polite">{`${filtered.length} / ${users.length} ${t.userCount}`}</span>}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget(null)}>
            {t.userAdd}
          </Button>
        }
      />

      <UserFilters value={filters} departments={departments} onChange={setFilters} />

      <datalist id={DEPARTMENT_LIST_ID}>
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {usersQuery.isLoading ? (
        <SkeletonLines lines={6} label={t.loading} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title={t.userNoResults} />
      ) : (
        <ul aria-label={t.userListLabel} className="space-y-3">
          {filtered.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              toggling={togglingId === user.id}
              onEdit={() => setFormTarget(user)}
              onResetPassword={() => setResetTarget(user)}
              onToggleActive={() => void handleToggleActive(user)}
            />
          ))}
        </ul>
      )}

      {formTarget !== undefined && (
        <UserFormModal
          key={formTarget?.id ?? "new"}
          user={formTarget}
          sections={sections}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => {
            setFormTarget(undefined)
            usersQuery.refetch()
          }}
        />
      )}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  )
}
