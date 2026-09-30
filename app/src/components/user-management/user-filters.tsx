"use client"

import { Search } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Input, Select } from "@/components/ui"
import type { UserRole } from "./types"

export type RoleFilter = "all" | UserRole
export type StatusFilter = "all" | "active" | "inactive"

export interface UserFilterState {
  query: string
  role: RoleFilter
  status: StatusFilter
  department: string
}

interface Props {
  value: UserFilterState
  departments: string[]
  onChange: (next: UserFilterState) => void
}

/** Search box + role / status / department selects. */
export function UserFilters({ value, departments, onChange }: Props) {
  const { t } = useLanguage()
  const set = <K extends keyof UserFilterState>(key: K, v: UserFilterState[K]) => onChange({ ...value, [key]: v })

  return (
    <div role="search" className="bg-surface rounded-ui-lg border border-border shadow-ui-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
      <div className="flex-1 min-w-[240px] relative">
        <Search aria-hidden className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          type="search"
          value={value.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder={t.userSearchPlaceholder}
          aria-label={t.userSearchLabel}
          className="pl-9"
        />
      </div>
      <Select aria-label={t.userFilterRoleLabel} className="w-auto" value={value.role} onChange={(e) => set("role", e.target.value as RoleFilter)}>
        <option value="all">{t.userFilterRoleAll}</option>
        <option value="admin">{t.userRoleAdmin}</option>
        <option value="section_manager">{t.roleSectionManager}</option>
        <option value="member">{t.userRoleMember}</option>
      </Select>
      <Select aria-label={t.userFilterStatusLabel} className="w-auto" value={value.status} onChange={(e) => set("status", e.target.value as StatusFilter)}>
        <option value="all">{t.userFilterStatusAll}</option>
        <option value="active">{t.userFilterActive}</option>
        <option value="inactive">{t.userFilterInactive}</option>
      </Select>
      {departments.length > 0 && (
        <Select aria-label={t.userFilterDepartmentLabel} className="w-auto" value={value.department} onChange={(e) => set("department", e.target.value)}>
          <option value="all">{`${t.userDepartment} — ${t.userFilterStatusAll}`}</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
      )}
    </div>
  )
}
