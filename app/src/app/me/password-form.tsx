"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, isApiError } from "@/hooks"
import { Button, Field, Input, useToast } from "@/components/ui"
import { MIN_PASSWORD_LENGTH } from "@/services/users/users.schemas"

const EMPTY = { current: "", next: "", confirm: "" }

/** Change own password (current + new + confirmation). */
export function PasswordForm() {
  const { t } = useLanguage()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    if (form.next !== form.confirm) {
      setError(t.myProfilePasswordMismatch)
      return
    }
    if (form.next.length < MIN_PASSWORD_LENGTH) {
      setError(t.userPasswordMinError)
      return
    }
    setSaving(true)
    try {
      await apiFetch("/api/user/password", {
        method: "POST",
        json: { currentPassword: form.current, newPassword: form.next },
      })
      setForm(EMPTY)
      toast.success(t.myProfilePasswordChanged)
    } catch (err) {
      setError(isApiError(err) && err.status === 401 ? t.myProfilePasswordWrong : err instanceof Error ? err.message : t.error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="profile-password"
      className="bg-surface rounded-ui-lg border border-border shadow-ui-sm p-6 space-y-4"
    >
      <h2 id="profile-password" className="text-body font-semibold text-fg-muted uppercase tracking-wider">
        {t.myProfilePasswordSection}
      </h2>
      <Field label={t.myProfileCurrentPassword} required>
        <Input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoComplete="current-password" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={t.myProfileNewPassword} required hint={t.userPasswordMinLength}>
          <Input type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </Field>
        <Field label={t.myProfileNewPasswordConfirm} required error={error ?? undefined}>
          <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </Field>
      </div>
      <Button type="submit" loading={saving} disabled={!form.current || !form.next || !form.confirm}>
        {t.save}
      </Button>
    </form>
  )
}
