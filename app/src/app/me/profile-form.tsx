"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useUnsavedChangesGuard } from "@/hooks"
import { Button, Field, Input, useToast } from "@/components/ui"

export interface ProfileData {
  id: string
  name: string
  email: string
  employeeNumber: string | null
  department: string | null
  role: string
  language: string
}

interface Props {
  profile: ProfileData
  onSaved: (profile: ProfileData) => void
}

function toForm(p: ProfileData) {
  return { name: p.name, employeeNumber: p.employeeNumber ?? "", department: p.department ?? "" }
}

/** Editable name / employee number / department. */
export function ProfileForm({ profile, onSaved }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [saved, setSaved] = useState(() => toForm(profile))
  const [form, setForm] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = JSON.stringify(form) !== JSON.stringify(saved)
  useUnsavedChangesGuard(isDirty)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const updated = await apiFetch<ProfileData>("/api/user/profile", {
        method: "PATCH",
        json: {
          name: form.name.trim(),
          employeeNumber: form.employeeNumber.trim() || null,
          department: form.department.trim() || null,
        },
      })
      const next = toForm(updated)
      setSaved(next)
      setForm(next)
      onSaved(updated)
      toast.success(t.myProfileSaved)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="profile-edit"
      className="bg-surface rounded-ui-lg border border-border shadow-ui-sm p-6 space-y-4"
    >
      <h2 id="profile-edit" className="text-body font-semibold text-fg-muted uppercase tracking-wider">
        {t.myProfileTitle}
      </h2>
      <Field label={t.userName} required error={error ?? undefined}>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} autoComplete="name" />
      </Field>
      <Field label={t.myProfileEmployeeNumber}>
        <Input value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} maxLength={50} />
      </Field>
      <Field label={t.myProfileDepartment}>
        <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} maxLength={100} autoComplete="organization" />
      </Field>
      <Button type="submit" loading={saving} disabled={!form.name.trim() || !isDirty}>
        {t.save}
      </Button>
    </form>
  )
}
