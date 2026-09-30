"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch } from "@/hooks"
import { Button, Field, Input, Modal, useModalClose, useToast } from "@/components/ui"
import { MIN_PASSWORD_LENGTH, type ManagedUser } from "./types"

interface Props {
  user: ManagedUser
  onClose: () => void
}

const FORM_ID = "reset-password-form"

/** Admin sets a new password for another user. */
export function ResetPasswordModal({ user, onClose }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.userPasswordMinError)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await apiFetch(`/api/users/${user.id}/reset-password`, { method: "POST", json: { password } })
      toast.success(t.userPasswordResetDone)
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.errorResetPasswordFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t.userResetPassword}
      description={`${user.name} ${t.userResetPasswordFor}`}
      isDirty={password.length > 0}
      footer={<Footer saving={saving} />}
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <Field label={t.myProfileNewPassword} required hint={t.userPasswordMinLength} error={error ?? undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.userNewPasswordPlaceholder}
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            data-autofocus
          />
        </Field>
      </form>
    </Modal>
  )
}

function Footer({ saving }: { saving: boolean }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>{t.cancel}</Button>
      <Button type="submit" form={FORM_ID} variant="danger" loading={saving}>{t.userReset}</Button>
    </>
  )
}
