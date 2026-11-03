"use client"

import { useEffect, useId, useState } from "react"
import { X } from "lucide-react"
import { Badge, Button, Field, IconButton, Input, Select, SkeletonLines, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import type { AttributeView } from "./types"

const KINDS = ["equipment", "process", "tag"] as const

/**
 * 設備・工程・タグ of the project (matching input of the estimate). PO / SM edit; everyone with access reads. Adding
 * and removing are announced (polite) and keep keyboard focus in place; nothing is stored until Save.
 */
export function AttributesEditor({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const toast = useToast()
  const headingId = useId()
  const refId = useId()
  const url = `/api/projects/${projectId}/attributes`
  const { data, isLoading, error: loadError, refetch } = useApiQuery<{ attributes: AttributeView[]; canEdit: boolean }>(url)
  const [list, setList] = useState<AttributeView[]>([])
  const [kind, setKind] = useState<AttributeView["kind"]>("equipment")
  const [ref, setRef] = useState("")
  const [refError, setRefError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data && !dirty) setList(data.attributes)
  }, [data, dirty])

  const kindLabel = (k: AttributeView["kind"]) => (k === "equipment" ? t.pacAttrKindEquipment : k === "process" ? t.pacAttrKindProcess : t.pacAttrKindTag)
  const canEdit = data?.canEdit ?? false

  function add() {
    const value = ref.trim()
    if (!value) return setRefError(t.pacAttrEmptyName)
    if (list.some((a) => a.kind === kind && a.ref === value)) return setRefError(t.pacAttrDuplicate)
    setList((l) => [...l, { kind, ref: value }])
    setRef("")
    setRefError(null)
    setDirty(true)
    setStatus(fillTemplate(t.pacAttrAdded, { name: value }))
  }

  function remove(a: AttributeView) {
    setList((l) => l.filter((x) => !(x.kind === a.kind && x.ref === a.ref)))
    setDirty(true)
    setStatus(fillTemplate(t.pacAttrRemoved, { name: a.ref }))
    // The focused button disappears: keep the user in the editor.
    requestAnimationFrame(() => document.getElementById(refId)?.focus())
  }

  async function save() {
    if (busy || !dirty) return
    setBusy(true)
    try {
      const res = await apiFetch<{ attributes: AttributeView[] }>(url, { method: "PUT", json: { attributes: list } })
      setList(res.attributes)
      setDirty(false)
      toast.success(t.pacAttrSaved)
      refetch()
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <div>
        <h2 id={headingId} className="text-title font-semibold text-fg">
          {t.pacAttributesTitle}
        </h2>
        <p className="mt-0.5 text-caption text-fg-muted">{t.pacAttributesHint}</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {isLoading && !data ? (
        <SkeletonLines lines={2} label={t.loading} />
      ) : loadError && !data ? (
        <div className="flex items-center gap-3">
          <p className="text-body text-fg-muted">{t.pacAttributesLoadFailed}</p>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            {t.errorRetry}
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-body text-fg-muted">{t.pacAttributesEmpty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((a) => (
            <li key={`${a.kind}:${a.ref}`} className="inline-flex items-center gap-1">
              <Badge tone="info" className="whitespace-normal text-left [overflow-wrap:anywhere]">
                {fillTemplate(t.pacAttrChip, { kind: kindLabel(a.kind), name: a.ref })}
              </Badge>
              {canEdit && (
                <IconButton size="sm" variant="ghost" label={fillTemplate(t.pacAttrRemove, { kind: kindLabel(a.kind), name: a.ref })} icon={<X className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => remove(a)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Field label={t.pacAttrKind} className="sm:w-40">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AttributeView["kind"])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={refId} label={t.pacAttrRef} error={refError ?? undefined} className="sm:flex-1">
            <Input
              value={ref}
              maxLength={200}
              onChange={(e) => {
                setRef(e.target.value)
                setRefError(null)
              }}
            />
          </Field>
          <div className="flex gap-2 sm:pt-6">
            <Button type="submit" variant="secondary">
              {t.pacAttrAdd}
            </Button>
            <Button type="button" onClick={() => void save()} aria-disabled={busy || !dirty || undefined} aria-busy={busy || undefined}>
              {t.pacAttrSave}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
