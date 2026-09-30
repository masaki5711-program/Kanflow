"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2, Layers } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useConfirm, PageHeader } from "@/components/ui"
import { apiFetch, isApiError, useApiQuery } from "@/hooks"
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  SkeletonTable,
  Textarea,
  VisuallyHidden,
  useModalClose,
  useToast,
} from "@/components/ui"
import { useDocumentTitle } from "@/hooks/use-document-title"

interface Section {
  id: string
  name: string
  description: string | null
  sortOrder: number
  _count: { users: number; projects: number; categories: number }
}

interface SectionForm {
  name: string
  description: string
  sortOrder: number
}

const EMPTY_FORM: SectionForm = { name: "", description: "", sortOrder: 0 }
const SECTIONS_URL = "/api/admin/sections"

export function SectionManagement() {
  const { t } = useLanguage()
  useDocumentTitle([t.sectionAdminTitle])
  const confirm = useConfirm()
  const toast = useToast()
  const { data: sections = [], isLoading, refetch } = useApiQuery<Section[]>(SECTIONS_URL, { toastOnError: true })

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initial, setInitial] = useState<SectionForm>(EMPTY_FORM)
  const [form, setForm] = useState<SectionForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openForm(s: Section | null) {
    const next = s ? { name: s.name, description: s.description ?? "", sortOrder: s.sortOrder } : EMPTY_FORM
    setEditingId(s?.id ?? null)
    setInitial(next)
    setForm(next)
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(editingId ? `${SECTIONS_URL}/${editingId}` : SECTIONS_URL, {
        method: editingId ? "PATCH" : "POST",
        json: { name: form.name.trim(), description: form.description.trim() || null, sortOrder: form.sortOrder },
      })
      setOpen(false)
      toast.success(t.saved)
      refetch()
    } catch (err) {
      setError(isApiError(err) && err.status === 409 ? t.sectionDuplicateName : err instanceof Error ? err.message : t.error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Section) {
    const ok = await confirm({ title: s.name, message: t.sectionDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    try {
      await apiFetch(`${SECTIONS_URL}/${s.id}`, { method: "DELETE" })
      toast.success(t.sectionDeleted)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error)
    }
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)

  return (
    <div>
      <PageHeader
        title={t.sectionAdminTitle}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            {t.sectionAdd}
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonTable rows={4} columns={5} label={t.loading} />
      ) : sections.length === 0 ? (
        <EmptyState icon={<Layers className="h-6 w-6" />} title={t.sectionEmpty} />
      ) : (
        <div className="bg-surface rounded-ui-md border border-border overflow-x-auto">
          <table className="w-full text-body">
            <caption>
              <VisuallyHidden>{t.sectionTableCaption}</VisuallyHidden>
            </caption>
            <thead className="bg-surface-muted text-caption text-fg-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-2 text-left">{t.sectionName}</th>
                <th scope="col" className="px-4 py-2 text-left">{t.sectionDescription}</th>
                <th scope="col" className="px-4 py-2 text-center">{t.sectionUserCount}</th>
                <th scope="col" className="px-4 py-2 text-center">{t.sectionProjectCount}</th>
                <th scope="col" className="px-4 py-2 text-center">{t.sectionCategoryCount}</th>
                <th scope="col" className="px-4 py-2 text-center">{t.sectionSortOrder}</th>
                <th scope="col" className="px-4 py-2 text-right">{t.sectionActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sections.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-fg">{s.name}</th>
                  <td className="px-4 py-3 text-fg-muted max-w-[280px] truncate" title={s.description ?? undefined}>
                    {s.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">{s._count.users}</td>
                  <td className="px-4 py-3 text-center">{s._count.projects}</td>
                  <td className="px-4 py-3 text-center">{s._count.categories}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{s.sortOrder}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <IconButton label={`${t.edit}: ${s.name}`} icon={<Pencil className="h-4 w-4" />} size="sm" onClick={() => openForm(s)} />
                    <IconButton label={`${t.sectionDelete}: ${s.name}`} icon={<Trash2 className="h-4 w-4" />} size="sm" variant="danger" onClick={() => handleDelete(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? t.sectionEdit : t.sectionAdd}
        isDirty={isDirty}
        footer={<FormFooter saving={saving} disabled={!form.name.trim()} submitLabel={editingId ? t.update : t.add} />}
      >
        <form id="section-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label={t.sectionName} required error={error ?? undefined}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} data-autofocus />
          </Field>
          <Field label={t.sectionDescription}>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={500} />
          </Field>
          <Field label={t.sectionSortOrder}>
            <Input type="number" className="w-32" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} />
          </Field>
        </form>
      </Modal>
    </div>
  )
}

function FormFooter({ saving, disabled, submitLabel }: { saving: boolean; disabled: boolean; submitLabel: string }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>{t.cancel}</Button>
      <Button type="submit" form="section-form" loading={saving} disabled={disabled}>{submitLabel}</Button>
    </>
  )
}
