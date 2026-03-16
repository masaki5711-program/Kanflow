"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { type Language, languageLabels } from "@/lib/i18n"
import { type ProjectType, projectTypeOptions } from "@/lib/project-type-labels"

interface Member {
  id: string
  role: string
  user: { id: string; name: string; email: string }
}

interface SprintSettings {
  defaultCapacity: number
  sprintDurationWeeks: number
  pointUnit: string
  pointDescription: string
}

interface SprintHistory {
  sprintName: string
  capacity: number
  actualScore: number
  status: string
}

const roleColors: Record<string, string> = {
  po: "bg-blue-100 text-blue-800",
  sm: "bg-green-100 text-green-800",
  dev: "bg-gray-100 text-gray-800",
}

export default function SettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt, language, setLanguage, projectType, setProjectType } = useLanguage()

  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("dev")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [sprintSettings, setSprintSettings] = useState<SprintSettings>({
    defaultCapacity: 0,
    sprintDurationWeeks: 1,
    pointUnit: "人日",
    pointDescription: "",
  })
  const [sprintHistory, setSprintHistory] = useState<SprintHistory[]>([])
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [langSaving, setLangSaving] = useState(false)
  const [typeSaving, setTypeSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => { if (Array.isArray(data)) setMembers(data) })
      .catch(() => {})

    fetch(`/api/projects/${projectId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((project) => {
        setSprintSettings({
          defaultCapacity: project.defaultCapacity ?? 0,
          sprintDurationWeeks: project.sprintDurationWeeks ?? 1,
          pointUnit: project.pointUnit ?? "人日",
          pointDescription: project.pointDescription ?? "",
        })
      })
      .catch(() => {})

    fetch(`/api/projects/${projectId}/sprints`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => {
        if (!Array.isArray(data)) return
        setSprintHistory(
          data
            .filter((s: SprintHistory) => s.status === "done" || s.status === "archived")
            .slice(0, 10)
        )
      })
      .catch(() => {})
  }, [projectId])

  async function handleLanguageChange(newLang: Language) {
    setLangSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: newLang }),
      })
      if (res.ok) {
        setLanguage(newLang)
      }
    } finally {
      setLangSaving(false)
    }
  }

  async function handleProjectTypeChange(newType: ProjectType) {
    setTypeSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectType: newType }),
      })
      if (res.ok) {
        setProjectType(newType)
      }
    } finally {
      setTypeSaving(false)
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsLoading(true)
    setSettingsSaved(false)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sprintSettings),
      })
      if (res.ok) {
        setSettingsSaved(true)
        setTimeout(() => setSettingsSaved(false), 3000)
      }
    } finally {
      setSettingsLoading(false)
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t.settingsAddError)
        return
      }
      const newMember = await res.json()
      setMembers((prev) => [...prev, newMember])
      setEmail("")
    } finally {
      setLoading(false)
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    const res = await fetch(
      `/api/projects/${projectId}/members/${memberId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      }
    )
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      )
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm(t.settingsRemoveConfirm)) return
    const res = await fetch(
      `/api/projects/${projectId}/members/${memberId}`,
      { method: "DELETE" }
    )
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    }
  }

  const avgActual =
    sprintHistory.length > 0
      ? Math.round(
          sprintHistory.reduce((sum, s) => sum + s.actualScore, 0) /
            sprintHistory.length
        )
      : null

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t.settingsTitle}</h1>

      {/* Language Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t.settingsLanguage}</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t.settingsLanguageLabel}
          </label>
          <div className="flex gap-3">
            {(Object.keys(languageLabels) as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => handleLanguageChange(lang)}
                disabled={langSaving}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  language === lang
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                } disabled:opacity-50`}
              >
                {languageLabels[lang]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Project Type Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">
          {t.projectType}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {projectTypeOptions.map((opt) => {
            const label = language === "ja" ? opt.labelJa : language === "id" ? opt.labelId : opt.labelEn
            const desc = language === "ja" ? opt.descJa : language === "id" ? opt.descId : opt.descEn
            const isSelected = projectType === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handleProjectTypeChange(opt.value)}
                disabled={typeSaving}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                } disabled:opacity-50`}
              >
                <div className="text-2xl mb-1">
                  {opt.value === "software" ? "💻" : opt.value === "process_improvement" ? "🏭" : "📋"}
                </div>
                <div className={`text-sm font-medium ${isSelected ? "text-blue-700" : "text-gray-700"}`}>
                  {label}
                </div>
                <div className="text-xs text-gray-500 mt-1">{desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sprint Workload Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t.settingsSprintWorkload}</h2>

        {avgActual !== null && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-sm text-blue-800">
              {t.settingsAvgScore}: <strong>{avgActual}</strong>
              {" "}({sprintHistory.length} sprints)
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {t.settingsAvgScoreHint}
            </p>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.settingsDefaultCapacity}
              </label>
              <input
                type="number"
                min={0}
                value={sprintSettings.defaultCapacity}
                onChange={(e) =>
                  setSprintSettings({
                    ...sprintSettings,
                    defaultCapacity: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t.settingsDefaultCapacityHint}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.settingsSprintDuration}
              </label>
              <select
                value={sprintSettings.sprintDurationWeeks}
                onChange={(e) =>
                  setSprintSettings({
                    ...sprintSettings,
                    sprintDurationWeeks: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {w}{t.settingsWeeks}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.settingsPointUnit}
              </label>
              <select
                value={sprintSettings.pointUnit}
                onChange={(e) =>
                  setSprintSettings({
                    ...sprintSettings,
                    pointUnit: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="人日">{t.pointUnitManDay}</option>
                <option value="人時">{t.pointUnitManHour}</option>
                <option value="ポイント">{t.pointUnitPoints}</option>
                <option value="SP">{t.pointUnitSP}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.settingsPointDescription}
              </label>
              <input
                type="text"
                value={sprintSettings.pointDescription}
                onChange={(e) =>
                  setSprintSettings({
                    ...sprintSettings,
                    pointDescription: e.target.value,
                  })
                }
                placeholder={t.settingsPointDescriptionPlaceholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={settingsLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {settingsLoading ? t.saving : t.settingsSaveButton}
            </button>
            {settingsSaved && (
              <span className="text-sm text-green-600">{t.settingsSaved}</span>
            )}
          </div>
        </form>

        {/* Sprint History Table */}
        {sprintHistory.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {t.settingsSprintHistory}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">{t.colSprint}</th>
                  <th className="pb-2 text-right">{t.colCapacity}</th>
                  <th className="pb-2 text-right">{t.colActualScore}</th>
                  <th className="pb-2 text-right">{t.colAchievementRate}</th>
                  <th className="pb-2 text-right">{t.colDiff}</th>
                </tr>
              </thead>
              <tbody>
                {sprintHistory.map((s) => {
                  const rate =
                    s.capacity > 0
                      ? Math.round((s.actualScore / s.capacity) * 100)
                      : 0
                  const diff = s.actualScore - s.capacity
                  return (
                    <tr key={s.sprintName} className="border-b">
                      <td className="py-2">{s.sprintName}</td>
                      <td className="py-2 text-right">{s.capacity}</td>
                      <td className="py-2 text-right">{s.actualScore}</td>
                      <td className="py-2 text-right">{rate}%</td>
                      <td
                        className={`py-2 text-right font-medium ${
                          diff > 0
                            ? "text-green-600"
                            : diff < 0
                            ? "text-red-600"
                            : "text-gray-500"
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t.settingsMembers}</h2>
        <div className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium text-white">
                  {m.user.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {m.user.name}
                  </p>
                  <p className="text-xs text-gray-500">{m.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${
                    roleColors[m.role] ?? "bg-gray-100"
                  }`}
                >
                  <option value="po">{pt.rolePO}</option>
                  <option value="sm">{pt.roleSM}</option>
                  <option value="dev">{pt.roleDev}</option>
                </select>
                <button
                  onClick={() => handleRemove(m.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  {t.settingsRemoveMember}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Member */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">{t.settingsAddMember}</h2>
        <form onSubmit={handleAddMember} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.settingsEmail}
            required
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="dev">{pt.roleDev}</option>
            <option value="sm">{pt.roleSM}</option>
            <option value="po">{pt.rolePO}</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {t.add}
          </button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  )
}
