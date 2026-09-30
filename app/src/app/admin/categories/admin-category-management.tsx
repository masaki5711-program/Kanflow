"use client"

import { useState } from "react"
import { Pencil, Plus, Tag, Trash2 } from "lucide-react"
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
  Select,
  SkeletonLines,
  useModalClose,
  useToast,
} from "@/components/ui"
import type { Translations } from "@/lib/i18n"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { SectionRefDto } from "@/types/api"

type SectionRef = SectionRefDto

interface AdminCategory {
  id: string
  name: string
  color: string
  sortOrder: number
  sectionId: string | null
  section: SectionRef | null
  _count: { assignments: number }
}

interface CategoryForm {
  name: string
  color: string
  sortOrder: number
  sectionId: string
}

type ColorKey = "gray" | "blue" | "green" | "amber" | "rose" | "violet" | "cyan"

const COLOR_OPTIONS: { value: ColorKey; dot: string; label: keyof Translations }[] = [
  { value: "gray", dot: "bg-gray-400", label: "categoryColorGray" },
  { value: "blue", dot: "bg-blue-500", label: "categoryColorBlue" },
  { value: "green", dot: "bg-emerald-500", label: "categoryColorGreen" },
  { value: "amber", dot: "bg-amber-500", label: "categoryColorAmber" },
  { value: "rose", dot: "bg-rose-500", label: "categoryColorRose" },
  { value: "violet", dot: "bg-violet-500", label: "categoryColorViolet" },
  { value: "cyan", dot: "bg-cyan-500", label: "categoryColorCyan" },
]

const dotOf = (color: string) => COLOR_OPTIONS.find((c) => c.value === color)?.dot ?? "bg-gray-400"

const EMPTY_FORM: CategoryForm = { name: "", color: "gray", sortOrder: 0, sectionId: "" }
const CATEGORIES_URL = "/api/admin/categories"

export function AdminCategoryManagement() {
  const { t } = useLanguage()
  useDocumentTitle([t.categoryAdminTitle])
  const confirm = useConfirm()
  const toast = useToast()
  // Independent requests → fetched in parallel by two queries.
  const sectionsQuery = useApiQuery<SectionRef[]>("/api/admin/sections", { toastOnError: true })
  const categoriesQuery = useApiQuery<AdminCategory[]>(CATEGORIES_URL, { toastOnError: true })
  const sections = sectionsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const isLoading = sectionsQuery.isLoading || categoriesQuery.isLoading

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initial, setInitial] = useState<CategoryForm>(EMPTY_FORM)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function openForm(c: AdminCategory | null) {
    const next = c ? { name: c.name, color: c.color, sortOrder: c.sortOrder, sectionId: c.sectionId ?? "" } : EMPTY_FORM
    setEditingId(c?.id ?? null)
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
      await apiFetch(editingId ? `${CATEGORIES_URL}/${editingId}` : CATEGORIES_URL, {
        method: editingId ? "PATCH" : "POST",
        json: {
          name: form.name.trim(),
          color: form.color,
          sortOrder: form.sortOrder,
          sectionId: form.sectionId === "" ? null : form.sectionId,
        },
      })
      setOpen(false)
      toast.success(t.saved)
      categoriesQuery.refetch()
    } catch (err) {
      setError(isApiError(err) && err.status === 409 ? t.sectionDuplicateName : err instanceof Error ? err.message : t.error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: AdminCategory) {
    const ok = await confirm({ title: c.name, message: t.categoryDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    try {
      await apiFetch(`${CATEGORIES_URL}/${c.id}`, { method: "DELETE" })
      toast.success(t.categoryDeleted)
      categoriesQuery.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error)
    }
  }

  // Group categories: global first, then by section.
  const grouped: { key: string; title: string; categories: AdminCategory[] }[] = []
  const globalCats = categories.filter((c) => c.sectionId === null)
  if (globalCats.length || categories.length === 0) {
    grouped.push({ key: "global", title: t.categoryScopeGlobal, categories: globalCats })
  }
  for (const s of sections) {
    grouped.push({ key: s.id, title: s.name, categories: categories.filter((c) => c.sectionId === s.id) })
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)

  return (
    <div>
      <PageHeader
        title={t.categoryAdminTitle}
        description={t.categoryAdminDesc}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            {t.categoryAdd}
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonLines lines={6} label={t.loading} />
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <section key={g.key} aria-labelledby={`cat-group-${g.key}`}>
              <div className="flex items-center gap-2 mb-2">
                <h2 id={`cat-group-${g.key}`} className="text-body font-semibold text-fg">{g.title}</h2>
                <span className="text-caption text-fg-muted">({g.categories.length})</span>
              </div>
              {g.categories.length === 0 ? (
                <EmptyState compact headingLevel={3} icon={<Tag className="h-5 w-5" />} title={t.categoryGroupEmpty} />
              ) : (
                <ul className="bg-surface rounded-ui-md border border-border divide-y divide-border">
                  {g.categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span aria-hidden className={`w-2.5 h-2.5 shrink-0 rounded-full ${dotOf(c.color)}`} />
                        <span className="text-body font-medium text-fg truncate">{c.name}</span>
                        <span className="text-caption text-fg-muted shrink-0">
                          {c._count.assignments} {t.categoryProjects}
                        </span>
                      </div>
                      <div className="flex shrink-0">
                        <IconButton label={`${t.edit}: ${c.name}`} icon={<Pencil className="h-4 w-4" />} size="sm" onClick={() => openForm(c)} />
                        <IconButton label={`${t.delete}: ${c.name}`} icon={<Trash2 className="h-4 w-4" />} size="sm" variant="danger" onClick={() => handleDelete(c)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? t.categoryEdit : t.categoryAdd}
        isDirty={isDirty}
        footer={<FormFooter saving={saving} disabled={!form.name.trim()} submitLabel={editingId ? t.update : t.add} />}
      >
        <form id="admin-category-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.categoryName} required error={error ?? undefined}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} data-autofocus />
            </Field>
            <Field label={t.categoryScope}>
              <Select value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
                <option value="">{t.categoryScopeGlobal}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-body font-medium text-fg mb-2">{t.categoryColor}</legend>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  aria-label={t[c.label] as string}
                  title={t[c.label] as string}
                  aria-pressed={form.color === c.value}
                  onClick={() => setForm({ ...form, color: c.value })}
                  className={`w-8 h-8 rounded-full ${c.dot} ${form.color === c.value ? "ring-2 ring-offset-2 ring-fg-muted" : ""}`}
                />
              ))}
            </div>
          </fieldset>
          <Field label={t.categorySortOrder}>
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
      <Button type="submit" form="admin-category-form" loading={saving} disabled={disabled}>{submitLabel}</Button>
    </>
  )
}
