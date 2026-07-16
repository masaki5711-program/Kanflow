"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"

type UserRole = "admin" | "section_manager" | "member"

interface SectionRef {
  id: string
  name: string
}

interface User {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  employeeNumber: string | null
  department: string | null
  _count: { memberships: number }
  sections: SectionRef[]
}

interface CreateForm {
  name: string
  email: string
  password: string
  role: UserRole
  employeeNumber: string
  department: string
  sectionIds: string[]
}

interface EditForm {
  name: string
  email: string
  role: UserRole
  employeeNumber: string
  department: string
  sectionIds: string[]
}

interface Props {
  headerExtra?: React.ReactNode
}

export function UserManagementBase({ headerExtra }: Props) {
  const { t } = useLanguage()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateForm>({
    name: "",
    email: "",
    password: "",
    role: "member",
    employeeNumber: "",
    department: "",
    sectionIds: [],
  })
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    email: "",
    role: "member",
    employeeNumber: "",
    department: "",
    sectionIds: [],
  })
  const [sections, setSections] = useState<SectionRef[]>([])
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users")
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [])

  const fetchSections = useCallback(async () => {
    const res = await fetch("/api/admin/sections")
    if (res.ok) {
      const data: SectionRef[] = await res.json()
      setSections(data.map((s) => ({ id: s.id, name: s.name })))
    }
  }, [])

  useEffect(() => { fetchUsers(); fetchSections() }, [fetchUsers, fetchSections])

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const u of users) {
      if (u.department) set.add(u.department)
    }
    return Array.from(set).sort()
  }, [users])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false
      if (statusFilter === "active" && !u.isActive) return false
      if (statusFilter === "inactive" && u.isActive) return false
      if (departmentFilter !== "all" && u.department !== departmentFilter) return false
      if (q.length > 0) {
        const hay = [u.name, u.email, u.employeeNumber ?? "", u.department ?? ""].join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [users, searchQuery, roleFilter, statusFilter, departmentFilter])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          employeeNumber: form.employeeNumber || null,
          department: form.department || null,
          sectionIds: form.sectionIds,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(typeof data?.error === "string" ? data.error : t.errorCreationFailed)
        return
      }
      setForm({ name: "", email: "", password: "", role: "member", employeeNumber: "", department: "", sectionIds: [] })
      setShowCreate(false)
      fetchUsers()
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(userId: string) {
    setError("")
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          employeeNumber: editForm.employeeNumber || null,
          department: editForm.department || null,
          sectionIds: editForm.sectionIds,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(typeof data?.error === "string" ? data.error : t.errorUpdateFailed)
        return
      }
      setEditingId(null)
      fetchUsers()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user: User) {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(typeof data?.error === "string" ? data.error : t.errorChangeFailed)
      return
    }
    fetchUsers()
  }

  async function handleResetPassword(userId: string) {
    if (!newPassword || newPassword.length < 6) {
      setError(t.userPasswordMinError)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      if (!res.ok) {
        setError(t.errorResetPasswordFailed)
        return
      }
      setResetPasswordId(null)
      setNewPassword("")
    } finally {
      setSaving(false)
    }
  }

  function startEdit(user: User) {
    setEditingId(user.id)
    const role: UserRole =
      user.role === "admin" || user.role === "section_manager" || user.role === "member"
        ? user.role
        : "member"
    setEditForm({
      name: user.name,
      email: user.email,
      role,
      employeeNumber: user.employeeNumber ?? "",
      department: user.department ?? "",
      sectionIds: user.sections.map((s) => s.id),
    })
    setError("")
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">{t.loading}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          {headerExtra}
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.userManagementTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {`${filtered.length} / ${users.length} ${t.userCount}`}
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setError("") }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 text-sm font-medium shadow-sm shadow-blue-500/25 hover:shadow-md transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          {t.userAdd}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[280px] relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.userSearchPlaceholder}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "all" | UserRole)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          <option value="all">{t.userFilterRoleAll}</option>
          <option value="admin">{t.userRoleAdmin}</option>
          <option value="section_manager">{t.roleSectionManager}</option>
          <option value="member">{t.userRoleMember}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          <option value="all">{t.userFilterStatusAll}</option>
          <option value="active">{t.userFilterActive}</option>
          <option value="inactive">{t.userFilterInactive}</option>
        </select>
        {departments.length > 0 && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="all">{`${t.userDepartment} — ${t.userFilterStatusAll}`}</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {error}
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t.userCreateTitle}</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userName}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder={t.userNamePlaceholder}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userEmail}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="user@example.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userEmployeeNumber}</label>
                <input
                  type="text"
                  value={form.employeeNumber}
                  onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })}
                  placeholder={t.userEmployeeNumberPlaceholder}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userDepartment}</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder={t.userDepartmentPlaceholder}
                  list="kf-department-list"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userInitialPassword}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder={t.userPasswordMinLength}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userRole}</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="member">{t.userRoleMember}</option>
                  <option value="section_manager">{t.roleSectionManager}</option>
                  <option value="admin">{t.userRoleAdmin}</option>
                </select>
              </div>
            </div>
            {sections.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.sectionTitle}</label>
                <div className="flex flex-wrap gap-2">
                  {sections.map((s) => {
                    const checked = form.sectionIds.includes(s.id)
                    return (
                      <label
                        key={s.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                          checked
                            ? "bg-blue-50 border-blue-300 text-blue-700"
                            : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.sectionIds, s.id]
                              : form.sectionIds.filter((id) => id !== s.id)
                            setForm({ ...form, sectionIds: next })
                          }}
                        />
                        {s.name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm">
                {t.create}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm font-medium">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      <datalist id="kf-department-list">
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 bg-white rounded-2xl border border-gray-100">
          {t.userNoResults}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => (
            <div
              key={user.id}
              className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${
                !user.isActive ? "opacity-60" : ""
              }`}
            >
              {editingId === user.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t.userName}</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t.userEmail}</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t.userEmployeeNumber}</label>
                      <input
                        type="text"
                        value={editForm.employeeNumber}
                        onChange={(e) => setEditForm({ ...editForm, employeeNumber: e.target.value })}
                        placeholder={t.userEmployeeNumberPlaceholder}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t.userDepartment}</label>
                      <input
                        type="text"
                        value={editForm.department}
                        onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                        placeholder={t.userDepartmentPlaceholder}
                        list="kf-department-list"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t.userRole}</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option value="member">{t.userRoleMember}</option>
                        <option value="section_manager">{t.roleSectionManager}</option>
                        <option value="admin">{t.userRoleAdmin}</option>
                      </select>
                    </div>
                  </div>
                  {sections.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t.sectionTitle}</label>
                      <div className="flex flex-wrap gap-2">
                        {sections.map((s) => {
                          const checked = editForm.sectionIds.includes(s.id)
                          return (
                            <label
                              key={s.id}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                                checked
                                  ? "bg-blue-50 border-blue-300 text-blue-700"
                                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...editForm.sectionIds, s.id]
                                    : editForm.sectionIds.filter((id) => id !== s.id)
                                  setEditForm({ ...editForm, sectionIds: next })
                                }}
                              />
                              {s.name}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(user.id)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                      {t.save}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              ) : resetPasswordId === user.id ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">{`${user.name} ${t.userResetPasswordFor}`}</p>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t.userNewPasswordPlaceholder}
                        minLength={6}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
                      />
                    </div>
                    <button onClick={() => handleResetPassword(user.id)} disabled={saving} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-50">
                      {t.userReset}
                    </button>
                    <button onClick={() => { setResetPasswordId(null); setNewPassword("") }} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                      {user.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">{user.name}</span>
                        {user.employeeNumber && (
                          <span className="text-xs text-gray-400 font-mono">{user.employeeNumber}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          user.role === "admin"
                            ? "bg-purple-50 text-purple-700"
                            : user.role === "section_manager"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-gray-50 text-gray-600"
                        }`}>
                          {user.role === "admin"
                            ? t.userRoleAdmin
                            : user.role === "section_manager"
                            ? t.roleSectionManager
                            : t.userRoleMember}
                        </span>
                        {user.sections.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            {user.sections.map((s) => s.name).join(" / ")}
                          </span>
                        )}
                        {!user.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                            {t.userInactive}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{user.email}</span>
                        {user.department && (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd"/>
                            </svg>
                            {user.department}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400 mr-2">
                      {`${user._count.memberships} ${t.userProjects}`}
                    </span>
                    <button
                      onClick={() => startEdit(user)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                      title={t.edit}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => { setResetPasswordId(user.id); setNewPassword(""); setError("") }}
                      className="p-2 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-all"
                      title={t.userResetPassword}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`p-2 rounded-lg transition-all ${
                        user.isActive
                          ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                          : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                      }`}
                      title={user.isActive ? t.userDeactivate : t.userActivate}
                    >
                      {user.isActive ? (
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
