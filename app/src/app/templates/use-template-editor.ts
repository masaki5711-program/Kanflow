"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useConfirm, useToast } from "@/components/ui"
import { apiFetch, isApiError } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { TEMPLATES_API, type PlanTemplateDto } from "@/components/plan-templates/template-groups"
import { contentFromForm, emptyForm, formFromTemplate, validateTemplateForm, type FormError, type TemplateForm } from "./lib/editor-state"

/** Comparable snapshot of what a save would send. */
const snapshot = (f: TemplateForm) => JSON.stringify({ n: f.name.trim(), d: f.description.trim(), v: f.visibility, c: contentFromForm(f) })

/**
 * Template editor data flow: load, edit (immutable form), save (PUT with the
 * loaded version; 409 → conflict flag, nothing overwritten), reset to the
 * default, duplicate and delete. `id` null = a new template (POST on save).
 */
export function useTemplateEditor(id: string | null) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const router = useRouter()
  const [template, setTemplate] = useState<PlanTemplateDto | null>(null)
  const [form, setForm] = useState<TemplateForm>(emptyForm)
  const [baseline, setBaseline] = useState(() => snapshot(emptyForm()))
  const [loading, setLoading] = useState(id !== null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<FormError | null>(null)

  const adopt = useCallback((dto: PlanTemplateDto) => {
    const next = formFromTemplate(dto)
    setTemplate(dto)
    setForm(next)
    setBaseline(snapshot(next))
    setConflict(false)
    setError(null)
  }, [])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      adopt(await apiFetch<PlanTemplateDto>(`${TEMPLATES_API}/${id}`))
    } catch (err) {
      if (isApiError(err) && err.status === 404) setNotFound(true)
      else toast.error(err instanceof Error ? err.message : t.tplLoadListFailed)
    } finally {
      setLoading(false)
    }
  }, [adopt, id, t, toast])

  useEffect(() => {
    void load()
  }, [load])

  const set = useCallback(<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm((f) => ({ ...f, [key]: value })), [])
  const dirty = useMemo(() => snapshot(form) !== baseline, [form, baseline])

  const fail = (err: unknown, title: string) => {
    if (isApiError(err) && err.code === "VERSION_CONFLICT") setConflict(true)
    else toast.error(err instanceof Error && err.message ? err.message : title, { title })
  }

  async function save() {
    const problem = validateTemplateForm(form)
    setError(problem)
    if (problem) return
    setBusy(true)
    const body = { name: form.name.trim(), description: form.description.trim() || null, visibility: form.visibility, content: contentFromForm(form) }
    try {
      if (!template) {
        const created = await apiFetch<PlanTemplateDto>(TEMPLATES_API, { method: "POST", json: body })
        setBaseline(snapshot(form))
        toast.success(t.tplSavedEdit)
        router.replace(`/templates/${created.id}`)
        return
      }
      adopt(await apiFetch<PlanTemplateDto>(`${TEMPLATES_API}/${template.id}`, { method: "PUT", json: { ...body, version: template.version } }))
      toast.success(t.tplSavedEdit)
    } catch (err) {
      fail(err, t.tplSaveFailed)
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    if (!template) return
    const ok = await confirm({ title: t.tplResetConfirmTitle, message: t.tplResetConfirmMessage, confirmLabel: t.tplResetDefault, cancelLabel: t.cancel, variant: "warning" })
    if (!ok) return
    setBusy(true)
    try {
      adopt(await apiFetch<PlanTemplateDto>(`${TEMPLATES_API}/${template.id}/reset`, { method: "POST", json: { version: template.version } }))
      toast.success(t.tplResetDone)
    } catch (err) {
      fail(err, t.tplSaveFailed)
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    if (!template) return
    try {
      const copy = await apiFetch<PlanTemplateDto>(`${TEMPLATES_API}/${template.id}/duplicate`, { method: "POST", json: {} })
      toast.success(fillTemplate(t.tplDuplicated, { name: copy.name }))
      router.push(`/templates/${copy.id}`)
    } catch (err) {
      fail(err, t.tplSaveFailed)
    }
  }

  async function remove() {
    if (!template) return
    const ok = await confirm({ title: fillTemplate(t.tplDeleteConfirmTitle, { name: template.name }), message: t.tplDeleteConfirmMessage, confirmLabel: t.tplDelete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    try {
      await apiFetch(`${TEMPLATES_API}/${template.id}`, { method: "DELETE" })
      toast.success(t.tplDeleted)
      router.push("/templates")
    } catch (err) {
      fail(err, t.tplSaveFailed)
    }
  }

  return { template, form, set, dirty, loading, notFound, busy, conflict, error, save, reset, duplicate, remove, reload: load }
}
