"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch } from "@/hooks"
import { Button, Field, Input, Modal, Select, useModalClose, useToast } from "@/components/ui"
import { SectionChips } from "./section-chips"
import { validateUserForm, type UserFormErrors } from "./user-form-validation"
import {
  DEPARTMENT_LIST_ID,
  EMPTY_USER_FORM,
  MIN_PASSWORD_LENGTH,
  formFromUser,
  type ManagedUser,
  type SectionRef,
  type UserFormValues,
  type UserRole,
} from "./types"

interface Props {
  /** `null` → create; a user → edit. Only rendered while open. */
  user: ManagedUser | null
  sections: SectionRef[]
  onClose: () => void
  onSaved: () => void
}

const FORM_ID = "user-form"

/** Create / edit user dialog (dirty-guarded). */
export function UserFormModal({ user, sections, onClose, onSaved }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const isEdit = user !== null
  const [initial] = useState<UserFormValues>(() => (user ? formFromUser(user) : EMPTY_USER_FORM))
  const [form, setForm] = useState<UserFormValues>(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<UserFormErrors>({})
  const [saving, setSaving] = useState(false)

  function set<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const errors = validateUserForm(form, isEdit, t)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setError(null)
    setSaving(true)
    const body = {
      name: form.name,
      email: form.email,
      role: form.role,
      employeeNumber: form.employeeNumber || null,
      department: form.department || null,
      sectionIds: form.sectionIds,
    }
    try {
      if (isEdit) {
        await apiFetch(`/api/users/${user.id}`, { method: "PATCH", json: body })
        toast.success(t.userUpdated)
      } else {
        await apiFetch("/api/users", { method: "POST", json: { ...body, password: form.password } })
        toast.success(t.userCreated)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : isEdit ? t.errorUpdateFailed : t.errorCreationFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? t.userEditTitle : t.userCreateTitle}
      description={isEdit ? user.email : undefined}
      size="lg"
      isDirty={JSON.stringify(form) !== JSON.stringify(initial)}
      footer={<Footer saving={saving} submitLabel={isEdit ? t.save : t.create} />}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && (
          <p role="alert" className="rounded-ui-sm bg-danger-soft px-3 py-2 text-body text-danger-strong">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.userName} required error={fieldErrors.name}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder={t.userNamePlaceholder} data-autofocus />
          </Field>
          <Field label={t.userEmail} required error={fieldErrors.email}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="user@example.com" autoComplete="off" />
          </Field>
          <Field label={t.userEmployeeNumber}>
            <Input value={form.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} placeholder={t.userEmployeeNumberPlaceholder} />
          </Field>
          <Field label={t.userDepartment}>
            <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder={t.userDepartmentPlaceholder} list={DEPARTMENT_LIST_ID} />
          </Field>
          {!isEdit && (
            <Field label={t.userInitialPassword} required hint={t.userPasswordMinLength} error={fieldErrors.password}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
            </Field>
          )}
          <Field label={t.userRole}>
            <Select value={form.role} onChange={(e) => set("role", e.target.value as UserRole)}>
              <option value="member">{t.userRoleMember}</option>
              <option value="section_manager">{t.roleSectionManager}</option>
              <option value="admin">{t.userRoleAdmin}</option>
            </Select>
          </Field>
        </div>
        {sections.length > 0 && (
          <SectionChips legend={t.sectionTitle} sections={sections} selected={form.sectionIds} onChange={(ids) => set("sectionIds", ids)} />
        )}
      </form>
    </Modal>
  )
}

function Footer({ saving, submitLabel }: { saving: boolean; submitLabel: string }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>{t.cancel}</Button>
      <Button type="submit" form={FORM_ID} loading={saving}>{submitLabel}</Button>
    </>
  )
}
