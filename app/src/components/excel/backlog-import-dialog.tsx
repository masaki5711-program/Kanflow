"use client"

import { useState } from "react"
import { Download, FileCheck2, Upload } from "lucide-react"
import { Badge, Button, Field, Modal, buttonClasses, cn, useModalClose, useToast, type BadgeTone } from "@/components/ui"
import { apiFetch, isApiError } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"
import type { ImportRowError } from "@/services/excel/backlog.import"
import type { ImportPreviewRow, ImportResult } from "@/services/excel/backlog.import.service"
import { BACKLOG_FIELDS, backlogHeader, type BacklogField } from "@/services/excel/backlog.headers"
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/services/excel/excel.limits"
import { exportHref } from "./excel-export-button"

interface Props {
  projectId: string
  onClose: () => void
  /** Called after a successful commit (refetch the backlog). */
  onImported: () => void
}

const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((acc, [k, x]) => acc.replaceAll(`{${k}}`, String(x)), s)

/** Pure: one row error as text in the UI language (field names as the workbook headers). */
export function rowErrorText(e: ImportRowError, t: Translations, pt: ProjectTypeLabels): string {
  const label = e.field ? backlogHeader(e.field, t, pt) : ""
  const values = { value: e.value ?? "", label }
  const byCode: Record<ImportRowError["code"], string> = {
    PBI_NOT_FOUND: t.excelImportErrPbiNotFound,
    INVALID_ID: t.excelImportErrInvalidId,
    DUPLICATE_ID: t.excelImportErrDuplicateId,
    INVALID_STATUS: t.excelImportErrInvalidStatus,
    INVALID_POINTS: t.excelImportErrInvalidPoints,
    TOO_LONG: t.excelImportErrTooLong,
    GOAL_NOT_FOUND: t.excelImportErrGoalNotFound,
    EMPTY_STORY: t.excelImportErrEmptyStory,
    INVALID: t.excelImportErrInvalid,
  }
  return fill(byCode[e.code] ?? t.excelImportErrInvalid, values)
}

/** Pure: message for a rejected upload (file-level reasons first, then the generic API text). */
export function uploadErrorText(err: unknown, t: Translations): string {
  const body = isApiError(err) && typeof err.body === "object" && err.body !== null ? (err.body as { reason?: unknown }) : {}
  if (body.reason === "TOO_MANY_ROWS") return fill(t.excelImportErrTooManyRows, { max: IMPORT_MAX_ROWS })
  if (body.reason === "UNREADABLE") return t.excelImportErrUnreadable
  if (body.reason === "NO_HEADER") return t.excelImportErrNoHeader
  return localizeApiError(err, t)
}

/** The preview carried by a commit refused for row errors (400 ROW_ERRORS), else null. */
function previewFromError(err: unknown): ImportResult | null {
  if (!isApiError(err) || typeof err.body !== "object" || err.body === null) return null
  const body = err.body as Partial<ImportResult> & { reason?: string }
  return body.reason === "ROW_ERRORS" && body.rows && body.summary ? { dryRun: true, rows: body.rows, summary: body.summary } : null
}

/** Written fields as the workbook names them (`productGoalId` comes from the goal column). */
function fieldNames(fields: readonly string[], t: Translations, pt: ProjectTypeLabels): string {
  return fields
    .map((f) => (f === "productGoalId" ? "goal" : f))
    .map((f) => ((BACKLOG_FIELDS as readonly string[]).includes(f) ? backlogHeader(f as BacklogField, t, pt) : f))
    .join(", ")
}

const ACTION_TONE: Record<ImportPreviewRow["action"], BadgeTone> = { create: "success", update: "primary", skip: "neutral" }

function PreviewTable({ rows }: { rows: readonly ImportPreviewRow[] }) {
  const { t, pt } = useLanguage()
  const actionLabel = { create: t.excelImportActionCreate, update: t.excelImportActionUpdate, skip: t.excelImportActionSkip }
  return (
    <div className="max-h-[50vh] overflow-auto rounded-ui-md border border-border">
      <table className="w-full border-collapse text-left text-body">
        <thead className="sticky top-0 bg-surface-muted text-caption font-semibold text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2">{t.excelImportRowCol}</th>
            <th scope="col" className="px-3 py-2">{t.excelImportActionCol}</th>
            <th scope="col" className="px-3 py-2">{t.excelImportDetailCol}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const failed = r.errors.length > 0
            return (
              <tr key={r.rowNumber} className={cn("border-t border-border align-top", failed && "bg-danger-soft/40")}>
                <td className="px-3 py-2 tabular-nums text-fg-muted">{r.rowNumber}</td>
                <td className="px-3 py-2">
                  <Badge tone={failed ? "danger" : ACTION_TONE[r.action]} size="sm">
                    {failed ? t.excelImportActionError : actionLabel[r.action]}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="text-fg">
                    {r.displayId !== null && <span className="mr-1.5 font-mono text-caption text-fg-muted">#{r.displayId}</span>}
                    {r.label}
                  </div>
                  {failed ? (
                    <ul className="mt-1 list-disc pl-5 text-caption text-danger-strong">
                      {r.errors.map((e, i) => (
                        <li key={i}>{rowErrorText(e, t, pt)}</li>
                      ))}
                    </ul>
                  ) : (
                    r.fields.length > 0 && <div className="mt-0.5 text-caption text-fg-muted">{fieldNames(r.fields, t, pt)}</div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface FooterProps {
  canCheck: boolean
  canImport: boolean
  busy: boolean
  preview: boolean
  onCheck: () => void
  onImport: () => void
  onBack: () => void
}

function Footer({ canCheck, canImport, busy, preview, onCheck, onImport, onBack }: FooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={preview ? onBack : close} disabled={busy}>
        {preview ? t.excelImportBack : t.cancel}
      </Button>
      {preview ? (
        <Button onClick={onImport} loading={busy} disabled={!canImport} leftIcon={<Upload className="h-4 w-4" />}>
          {t.excelImportRun}
        </Button>
      ) : (
        <Button onClick={onCheck} loading={busy} disabled={!canCheck} leftIcon={<FileCheck2 className="h-4 w-4" />}>
          {t.excelImportCheck}
        </Button>
      )}
    </>
  )
}

function PreviewStep({ result, canImport }: { result: ImportResult; canImport: boolean }) {
  const { t } = useLanguage()
  const s = result.summary
  return (
    <div className="space-y-3">
      <p role="status" className="text-body font-medium text-fg">
        {fill(t.excelImportSummary, { create: s.create, update: s.update, skip: s.skip, error: s.error })}
      </p>
      {s.error > 0 && (
        <p role="alert" className="rounded-ui-md border border-danger/30 bg-danger-soft px-3 py-2 text-body text-danger-strong">
          {t.excelImportHasErrors}
        </p>
      )}
      {s.error === 0 && !canImport && <p className="text-body text-fg-muted">{t.excelImportNothing}</p>}
      <PreviewTable rows={result.rows} />
    </div>
  )
}

/** Backlog Excel import: choose a file → preview (dry run) with row errors → import. */
export function BacklogImportDialog({ projectId, onClose, onImported }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/api/projects/${projectId}/backlog/import`

  function choose(next: File | null) {
    setPreview(null)
    setError(next && next.size > IMPORT_MAX_BYTES ? localizeApiError({ code: "PAYLOAD_TOO_LARGE" }, t) : null)
    setFile(next)
  }

  async function send(dryRun: boolean): Promise<ImportResult> {
    const body = new FormData()
    body.set("file", file as File)
    return apiFetch<ImportResult>(`${base}${dryRun ? "?dryRun=1" : ""}`, { method: "POST", body })
  }

  async function check() {
    setBusy(true)
    setError(null)
    try {
      setPreview(await send(true))
    } catch (err) {
      setError(uploadErrorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    setBusy(true)
    try {
      const result = await send(false)
      toast.success(fill(t.excelImportDone, { create: result.created ?? 0, update: result.updated ?? 0 }))
      onImported()
      onClose()
    } catch (err) {
      const refused = previewFromError(err)
      if (refused) setPreview(refused)
      else toast.error(uploadErrorText(err, t), { title: t.excelImportFailed })
    } finally {
      setBusy(false)
    }
  }

  const s = preview?.summary
  const canImport = !!s && s.error === 0 && s.create + s.update > 0
  return (
    <Modal
      open
      onClose={onClose}
      title={t.excelImportTitle}
      description={t.excelImportDescription}
      size="lg"
      isDirty={!!file}
      footer={
        <Footer canCheck={!!file && !error} canImport={canImport} busy={busy} preview={!!preview}
          onCheck={() => void check()} onImport={() => void commit()} onBack={() => setPreview(null)} />
      }
    >
      {!preview ? (
        <div className="space-y-4">
          <a href={exportHref(`${base}/template`, language)} download className={buttonClasses({ variant: "link" })}>
            <Download aria-hidden className="h-4 w-4" />
            {t.excelImportTemplate}
          </a>
          <Field label={t.excelImportChooseFile} hint={fill(t.excelImportFileHint, { size: IMPORT_MAX_BYTES / 1024 / 1024, max: IMPORT_MAX_ROWS })} error={error ?? undefined}>
            {(control) => (
              <input
                {...control}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
                className="block w-full text-body text-fg file:mr-3 file:min-h-9 file:rounded-ui-sm file:border file:border-border-strong file:bg-surface file:px-3 file:text-body file:font-medium file:text-fg hover:file:bg-surface-muted"
              />
            )}
          </Field>
        </div>
      ) : (
        <PreviewStep result={preview} canImport={canImport} />
      )}
    </Modal>
  )
}
