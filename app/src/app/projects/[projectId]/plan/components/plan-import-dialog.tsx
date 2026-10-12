"use client"

import { useMemo, useState } from "react"
import { Button, Field, Modal, Select, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { formatShortDate } from "../lib/date-format"
import { parseImportText } from "../lib/import-parse"
import type { PlanItem, Ymd } from "../lib/plan-types"
import { importErrorLabel, type ImportResult } from "../lib/schedule-api"
import { fillTemplate } from "../lib/template"
import { buildFlatTree } from "../lib/tree"

interface Props {
  /** `/api/projects/:id/plan` */
  apiBase: string
  items: readonly PlanItem[]
  members: readonly { id: string; name: string }[]
  today: Ymd
  nameOf: (item: PlanItem) => string
  onClose: () => void
  onImported: () => void
}

const PREVIEW_ROWS = 12
const INDENT = "  "

/** 表から取り込み: paste a table, see how each row is read, import the clean table in one go. */
export function PlanImportDialog({ apiBase, items, members, today, nameOf, onClose, onImported }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const [text, setText] = useState("")
  const [parentId, setParentId] = useState("")
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<ImportResult["errors"]>([])

  const parentOptions = useMemo(
    () => buildFlatTree(items, new Set(), null).filter((r) => !r.item.isMilestone).map((r) => ({ id: r.item.id, label: `${INDENT.repeat(r.depth)}${nameOf(r.item)}` })),
    [items, nameOf],
  )
  const parsed = useMemo(() => parseImportText(text, today, members), [text, today, members])
  const rows = parsed.rows
  const badRows = rows.filter((r) => r.error)
  const canImport = rows.length > 0 && badRows.length === 0 && !busy

  async function submit() {
    setBusy(true)
    setServerErrors([])
    try {
      const res = await apiFetch<ImportResult>(`${apiBase}/import`, {
        method: "POST",
        json: {
          parentId: parentId || null,
          apply: true,
          rows: rows.map((r) => ({ depth: r.depth, name: r.name, plannedStart: r.start, plannedEnd: r.end, ownerId: r.ownerId })),
        },
      })
      if (res.errors.length > 0) {
        setServerErrors(res.errors)
        setBusy(false)
        return
      }
      toast.success(fillTemplate(t.pscImportDone, { n: res.count }))
      onImported()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.pscImportFailed, { title: t.pscImportFailed })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t.pscImportTitle}
      description={t.pscImportDesc}
      isDirty={text.trim() !== "" && !busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => void submit()} disabled={!canImport} loading={busy} data-testid="plan-import-apply">
            {fillTemplate(t.pscImportApply, { n: rows.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.pscImportParent}>
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t.pscImportParentRoot}</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.pscImportPaste}>
          <textarea
            rows={6}
            spellCheck={false}
            value={text}
            placeholder={t.pscImportPlaceholder}
            onChange={(e) => setText(e.target.value)}
            data-autofocus
            data-testid="plan-import-text"
            className="w-full rounded-ui-md border border-border-strong bg-surface px-3 py-2 font-mono text-caption text-fg placeholder:text-fg-subtle focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <div aria-live="polite" className="rounded-ui-md border border-border p-3">
          {rows.length === 0 ? (
            <p className="text-body text-fg-muted">{t.pscImportEmpty}</p>
          ) : (
            <>
              <p className="text-body font-semibold text-fg">{fillTemplate(t.pscImportRows, { n: rows.length })}</p>
              <table className="mt-2 w-full text-caption">
                <thead>
                  <tr className="text-left text-fg-muted">
                    <th className="py-1 pr-2 font-medium">{t.pscImportColName}</th>
                    <th className="py-1 pr-2 font-medium">{t.pscImportColStart}</th>
                    <th className="py-1 pr-2 font-medium">{t.pscImportColEnd}</th>
                    <th className="py-1 font-medium">{t.pscImportColOwner}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <tr key={r.line} className={r.error ? "text-danger" : "text-fg"}>
                      <td className="max-w-0 truncate py-0.5 pr-2" style={{ paddingLeft: r.depth * 12 }} title={r.error ? importErrorLabel(t, r.error) : r.name}>{r.name || "—"}</td>
                      <td className="py-0.5 pr-2 tabular-nums">{r.start ? formatShortDate(r.start, language) : "—"}</td>
                      <td className="py-0.5 pr-2 tabular-nums">{r.end ? formatShortDate(r.end, language) : "—"}</td>
                      <td className="py-0.5">{r.ownerId ? (members.find((m) => m.id === r.ownerId)?.name ?? "") : r.ownerText || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > PREVIEW_ROWS && <p className="mt-1 text-caption text-fg-muted">…</p>}
            </>
          )}
          {badRows.length > 0 && (
            <ul role="alert" className="mt-2 space-y-0.5 text-caption text-danger">
              {badRows.slice(0, PREVIEW_ROWS).map((r) => (
                <li key={r.line}>{fillTemplate(t.pscImportRowError, { row: r.line, reason: importErrorLabel(t, r.error!) })}</li>
              ))}
            </ul>
          )}
          {serverErrors.length > 0 && (
            <ul role="alert" className="mt-2 space-y-0.5 text-caption text-danger">
              {serverErrors.slice(0, PREVIEW_ROWS).map((e) => (
                <li key={`${e.row}-${e.code}`}>{fillTemplate(t.pscImportRowError, { row: rows[e.row - 1]?.line ?? e.row, reason: importErrorLabel(t, e.code) })}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
