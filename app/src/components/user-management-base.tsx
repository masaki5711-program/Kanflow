"use client"

import { useState, useEffect, useCallback } from "react"
import { useLanguage } from "@/lib/language-context"

interface User {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  _count: { memberships: number }
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
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" })
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "member" })
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users")
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(typeof data.error === "string" ? data.error : t.errorCreationFailed)
        return
      }
      setForm({ name: "", email: "", password: "", role: "member" })
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
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(typeof data.error === "string" ? data.error : t.errorUpdateFailed)
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
      const data = await res.json()
      setError(typeof data.error === "string" ? data.error : t.errorChangeFailed)
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
    setEditForm({ name: user.name, email: user.email, role: user.role })
    setError("")
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">{t.loading}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          {headerExtra}
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.userManagementTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{`${users.length} ${t.userCount}`}</p>
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

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-6">
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
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="member">{t.userRoleMember}</option>
                  <option value="admin">{t.userRoleAdmin}</option>
                </select>
              </div>
            </div>
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

      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${
              !user.isActive ? "opacity-50" : ""
            }`}
          >
            {editingId === user.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
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
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.userRole}</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="member">{t.userRoleMember}</option>
                      <option value="admin">{t.userRoleAdmin}</option>
                    </select>
                  </div>
                </div>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
                    {user.name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{user.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.role === "admin"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-gray-50 text-gray-600"
                      }`}>
                        {user.role === "admin" ? t.userRoleAdmin : t.userRoleMember}
                      </span>
                      {!user.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                          {t.userInactive}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
    </div>
  )
}
