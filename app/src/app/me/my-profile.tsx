"use client"

import { useEffect, useState, useCallback } from "react"
import { useLanguage } from "@/lib/language-context"

interface ProfileData {
  id: string
  name: string
  email: string
  employeeNumber: string | null
  department: string | null
  role: string
  language: string
}

export function MyProfile() {
  const { t } = useLanguage()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [form, setForm] = useState({ name: "", employeeNumber: "", department: "" })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/user/profile")
    if (!res.ok) return
    const data: ProfileData = await res.json()
    setProfile(data)
    setForm({
      name: data.name,
      employeeNumber: data.employeeNumber ?? "",
      department: data.department ?? "",
    })
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (profileSaving) return
    setProfileSaving(true)
    setProfileSaved(false)
    setProfileError(null)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          employeeNumber: form.employeeNumber.trim() || null,
          department: form.department.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        setProfileError(typeof err?.error === "string" ? err.error : t.error)
        return
      }
      const updated: ProfileData = await res.json()
      setProfile(updated)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwSaving) return
    setPwError(null)
    setPwSuccess(null)
    if (pwForm.next !== pwForm.confirm) {
      setPwError(t.myProfilePasswordMismatch)
      return
    }
    if (pwForm.next.length < 6) {
      setPwError(t.userPasswordMinError)
      return
    }
    setPwSaving(true)
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pwForm.current,
          newPassword: pwForm.next,
        }),
      })
      if (!res.ok) {
        if (res.status === 401) setPwError(t.myProfilePasswordWrong)
        else {
          const err = await res.json().catch(() => null)
          setPwError(typeof err?.error === "string" ? err.error : t.error)
        }
        return
      }
      setPwForm({ current: "", next: "", confirm: "" })
      setPwSuccess(t.myProfilePasswordChanged)
      setTimeout(() => setPwSuccess(null), 3000)
    } finally {
      setPwSaving(false)
    }
  }

  if (!profile) {
    return <p className="text-sm text-gray-400 py-8 text-center">{t.loading}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
          <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t.myProfileTitle}</h1>
      </div>

      {/* Read-only basic info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          {t.userName} / {t.userEmail}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">{t.userEmail}</p>
            <p className="text-sm font-medium text-gray-800">{profile.email}</p>
            <p className="text-[11px] text-gray-400 mt-1">変更は管理者へ</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">{t.userRole}</p>
            <p className="text-sm font-medium text-gray-800">
              {profile.role === "admin" ? t.userRoleAdmin
                : profile.role === "section_manager" ? t.roleSectionManager
                : t.userRoleMember}
            </p>
          </div>
        </div>
      </div>

      {/* Profile editor */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {t.myProfileTitle}
          </h2>
          {profileSaved && (
            <span className="text-xs text-emerald-600 font-medium">{t.myProfileSaved}</span>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.userName}</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.myProfileEmployeeNumber}
          </label>
          <input
            type="text"
            value={form.employeeNumber}
            onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })}
            maxLength={50}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.myProfileDepartment}
          </label>
          <input
            type="text"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        {profileError && <p className="text-sm text-red-500">{profileError}</p>}
        <div>
          <button
            type="submit"
            disabled={profileSaving || !form.name.trim()}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {profileSaving ? t.saving : t.save}
          </button>
        </div>
      </form>

      {/* Password change */}
      <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {t.myProfilePasswordSection}
          </h2>
          {pwSuccess && (
            <span className="text-xs text-emerald-600 font-medium">{pwSuccess}</span>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.myProfileCurrentPassword}
          </label>
          <input
            type="password"
            value={pwForm.current}
            onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t.myProfileNewPassword}
            </label>
            <input
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t.myProfileNewPasswordConfirm}
            </label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
        {pwError && <p className="text-sm text-red-500">{pwError}</p>}
        <div>
          <button
            type="submit"
            disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {pwSaving ? t.saving : t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
