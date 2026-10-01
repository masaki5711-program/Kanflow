"use client"

import { Archive, Moon } from "lucide-react"
import { Button, Modal } from "@/components/ui"
import { pickText } from "@/lib/translation/pick-text"
import { useLanguage } from "@/lib/language-context"
import type { BulkArchivePlan, BulkResult } from "./bulk-archive"
import { dormantDays } from "./dormancy"
import type { Project } from "./types"
import type { BulkProgress } from "./use-bulk-archive"

interface Props {
  open: boolean
  plan: BulkArchivePlan
  now: Date
  progress: BulkProgress | null
  result: BulkResult<Project> | null
  onConfirm: () => void
  onClose: () => void
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

function ProjectNames({ projects, now, testId }: { projects: readonly Project[]; now: Date; testId: string }) {
  const { t, language } = useLanguage()
  return (
    <ul data-testid={testId} className="max-h-60 divide-y divide-border overflow-y-auto rounded-ui-md border border-border">
      {projects.map((p) => {
        const days = dormantDays(p, now)
        return (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-body">
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{pickText(p.i18n, "name", p.name, language).text}</span>
            {days !== null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-caption text-warning-strong">
                <Moon aria-hidden="true" className="h-3 w-3" />
                {fill(t.projectDormantBadge, { days })}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Progress({ progress }: { progress: BulkProgress }) {
  const { t } = useLanguage()
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  const label = fill(t.projectBulkArchiveProgress, { done: progress.done, total: progress.total })
  return (
    <div className="space-y-1.5">
      <p aria-live="polite" className="text-caption font-medium text-fg-muted">
        {label}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Failures({ result }: { result: BulkResult<Project> }) {
  const { t, language } = useLanguage()
  return (
    <div role="alert" className="space-y-2 rounded-ui-md border border-danger/30 bg-danger-soft p-3">
      <p className="text-body font-semibold text-danger-strong">
        {fill(t.projectBulkArchivePartial, { ok: result.succeeded.length, failed: result.failed.length })}
      </p>
      <p className="text-caption font-medium text-danger-strong">{t.projectBulkArchiveFailedList}</p>
      <ul data-testid="bulk-archive-failed" className="list-disc space-y-1 pl-5 text-caption text-danger-strong">
        {result.failed.map(({ item, error }) => (
          <li key={item.id} className="[overflow-wrap:anywhere]">
            {pickText(item.i18n, "name", item.name, language).text}: {error.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Confirm dialog of "archive all dormant projects": lists what will be archived
 * and what is skipped (no permission), shows progress while the batch runs and
 * the failures afterwards (the dialog only stays open when something failed).
 */
export function BulkArchiveDialog({ open, plan, now, progress, result, onConfirm, onClose }: Props) {
  const { t } = useLanguage()
  const running = progress !== null
  const finished = result !== null && !running
  const count = plan.archivable.length

  const footer = finished ? (
    <Button variant="secondary" onClick={onClose}>
      {t.close}
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose} disabled={running}>
        {t.cancel}
      </Button>
      {count > 0 && (
        <Button leftIcon={<Archive aria-hidden="true" className="h-4 w-4" />} loading={running} onClick={onConfirm} data-autofocus>
          {fill(t.projectBulkArchiveConfirm, { count })}
        </Button>
      )}
    </>
  )

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!running) onClose()
      }}
      closeOnEsc={!running}
      hideCloseButton={running}
      title={t.projectBulkArchiveTitle}
      size="md"
      footer={footer}
    >
      <div className="space-y-4">
        {finished && result.failed.length > 0 && <Failures result={result} />}
        {!finished && (
          <>
            {count > 0 ? (
              <section className="space-y-2" aria-label={t.projectBulkArchiveButton}>
                <p className="text-body text-fg">{fill(t.projectBulkArchiveIntro, { count })}</p>
                <ProjectNames projects={plan.archivable} now={now} testId="bulk-archive-targets" />
              </section>
            ) : (
              <p className="text-body text-fg-muted">{t.projectBulkArchiveNone}</p>
            )}
            {plan.skipped.length > 0 && (
              <section className="space-y-2" aria-label={fill(t.projectBulkArchiveSkipped, { count: plan.skipped.length })}>
                <h3 className="text-body font-semibold text-fg">{fill(t.projectBulkArchiveSkipped, { count: plan.skipped.length })}</h3>
                <p className="text-caption text-fg-muted">{t.projectBulkArchiveSkippedHint}</p>
                <ProjectNames projects={plan.skipped} now={now} testId="bulk-archive-skipped" />
              </section>
            )}
            {running && <Progress progress={progress} />}
          </>
        )}
      </div>
    </Modal>
  )
}
