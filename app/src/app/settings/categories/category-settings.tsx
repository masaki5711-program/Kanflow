"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, Plus, Tag, Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useConfirm, PageHeader } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  SkeletonLines,
  useModalClose,
  useToast,
} from "@/components/ui"
import type { Translations } from "@/lib/i18n"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { CategoryDto } from "@/types/api"

type Category = CategoryDto

interface CategoryForm {
  name: string
  color: string
}

const COLORS: { value: string; dot: string; label: keyof Translations }[] = [
  { value: "gray", dot: "bg-gray-400", label: "categoryColorGray" },
  { value: "red", dot: "bg-red-500", label: "categoryColorRed" },
  { value: "orange", dot: "bg-orange-500", label: "categoryColorOrange" },
  { value: "yellow", dot: "bg-yellow-500", label: "categoryColorYellow" },
  { value: "green", dot: "bg-green-500", label: "categoryColorGreen" },
  { value: "blue", dot: "bg-blue-500", label: "categoryColorBlue" },
  { value: "indigo", dot: "bg-indigo-500", label: "categoryColorIndigo" },
  { value: "purple", dot: "bg-purple-500", label: "categoryColorPurple" },
  { value: "pink", dot: "bg-pink-500", label: "categoryColorPink" },
]

const dotOf = (color: string) => COLORS.find((c) => c.value === color)?.dot ?? "bg-gray-400"
const EMPTY_FORM: CategoryForm = { name: "", color: "blue" }
const CATEGORIES_URL = "/api/user/categories"

export function CategorySettings() {
  const { t } = useLanguage()
  useDocumentTitle([t.categorySettingsTitle])
  const confirm = useConfirm()
  const toast = useToast()
  const { data: categories = [], isLoading, refetch } = useApiQuery<Category[]>(CATEGORIES_URL, { toastOnError: true })

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initial, setInitial] = useState<CategoryForm>(EMPTY_FORM)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function openForm(cat: Category | null) {
    const next = cat ? { name: cat.name, color: cat.color } : EMPTY_FORM
    setEditingId(cat?.id ?? null)
    setInitial(next)
    setForm(next)
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || saving) return
    setError(null)
    setSaving(true)
    try {
      await apiFetch(editingId ? `${CATEGORIES_URL}/${editingId}` : CATEGORIES_URL, { method: editingId ? "PATCH" : "POST", json: form })
      setOpen(false)
      toast.success(t.saved)
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : editingId ? t.errorUpdateFailed : t.errorCreationFailed)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(cat: Category) {
    const ok = await confirm({ title: cat.name, message: t.categoryDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    try {
      await apiFetch(`${CATEGORIES_URL}/${cat.id}`, { method: "DELETE" })
      toast.success(t.categoryDeleted)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error)
    }
  }

  return (
    <div>
      <PageHeader
        className="mb-8"
        eyebrow={
          <Link href="/" className="text-body font-normal text-fg-muted hover:text-primary">
            {t.projectBackToList}
          </Link>
        }
        title={t.categorySettingsTitle}
        description={t.categorySettingsDesc}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            {t.categoryNew}
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonLines lines={4} label={t.loading} />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-6 w-6" />}
          title={t.categoryEmpty}
          description={t.categoryEmptyDesc}
          action={<Button onClick={() => openForm(null)}>{t.categoryNew}</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between gap-3 bg-surface rounded-ui-lg border border-border shadow-ui-sm px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span aria-hidden className={`w-3 h-3 shrink-0 rounded-full ${dotOf(cat.color)}`} />
                <span className="text-body font-semibold text-fg truncate">{cat.name}</span>
                <span className="text-caption text-fg-muted shrink-0">{`${cat.assignments.length} ${t.categoryProjects}`}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton label={`${t.edit}: ${cat.name}`} icon={<Pencil className="h-4 w-4" />} size="sm" onClick={() => openForm(cat)} />
                <IconButton label={`${t.delete}: ${cat.name}`} icon={<Trash2 className="h-4 w-4" />} size="sm" variant="danger" onClick={() => handleDelete(cat)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 p-4 bg-info-soft rounded-ui-md">
        <p className="text-body text-info">{t.categoryHelpText}</p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? t.categoryEdit : t.categoryNew}
        isDirty={JSON.stringify(form) !== JSON.stringify(initial)}
        footer={<FormFooter saving={saving} disabled={!form.name.trim()} submitLabel={editingId ? t.save : t.create} />}
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label={t.categoryCategory} required error={error ?? undefined}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={50}
              placeholder={t.categoryNamePlaceholder}
              data-autofocus
            />
          </Field>
          <fieldset>
            <legend className="text-body font-medium text-fg mb-2">{t.categoryColor}</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm({ ...form, color: c.value })}
                  aria-label={t[c.label] as string}
                  title={t[c.label] as string}
                  aria-pressed={form.color === c.value}
                  className={`w-8 h-8 rounded-full ${c.dot} ${form.color === c.value ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                />
              ))}
            </div>
          </fieldset>
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
      <Button type="submit" form="category-form" loading={saving} disabled={disabled}>{submitLabel}</Button>
    </>
  )
}
