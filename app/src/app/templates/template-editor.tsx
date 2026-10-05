"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft, Copy, LayoutTemplate, RotateCcw, Trash2 } from "lucide-react"
import { Badge, Button, EmptyState, Field, Input, PageHeader, SkeletonLines, Textarea } from "@/components/ui"
import { useDocumentTitle, useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import { VisibilityField } from "@/components/plan-templates/visibility-field"
import type { FormError } from "./lib/editor-state"
import { StageTreeEditor } from "./stage-tree-editor"
import { TemplateExtrasEditor } from "./template-extras-editor"
import { TemplateHistory } from "./template-history"
import { useTemplateEditor } from "./use-template-editor"

function errorText(t: Translations, e: FormError | null): string | null {
  switch (e) {
    case "name":
      return t.tplNameRequired
    case "stagesRequired":
      return t.tplStagesRequired
    case "stageName":
      return t.tplStageNameRequired
    case "tooMany":
      return t.tplLimitReached
    default:
      return null
  }
}

/** /templates/new and /templates/[id]: the template editor (stages, 検収 settings, history). */
export function TemplateEditor({ id }: { id: string | null }) {
  const { t } = useLanguage()
  const ed = useTemplateEditor(id)
  const { template, form, set } = ed
  useUnsavedChangesGuard(ed.dirty)
  useDocumentTitle([template?.name ?? t.tplEditorTitleNew, t.tplLibraryTitle])

  if (ed.loading) return <SkeletonLines lines={8} label={t.loading} />
  if (ed.notFound) {
    return <EmptyState title={t.tplNotFound} action={<Link href="/templates" className="text-primary hover:underline">{t.tplBack}</Link>} />
  }
  const message = errorText(t, ed.error)
  const nameMissing = ed.error === "name"

  return (
    <div className="space-y-4">
      <Link href="/templates" className="inline-flex min-h-8 items-center gap-1 text-caption font-medium text-primary hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.tplBack}
      </Link>
      <PageHeader
        className="mb-0"
        title={template ? template.name : t.tplEditorTitleNew}
        description={template?.isBuiltin ? t.tplLibraryDesc : undefined}
        icon={
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-ui-md bg-primary-soft text-primary-strong">
            <LayoutTemplate className="h-5 w-5" />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {template?.isBuiltin && <Badge tone="info">{t.tplBuiltinBadge}</Badge>}
            {template?.isBuiltin && (
              <Button variant="secondary" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => void ed.reset()} disabled={ed.busy} data-testid="tpl-reset">
                {t.tplResetDefault}
              </Button>
            )}
            {template && (
              <Button variant="secondary" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void ed.duplicate()}>
                {t.tplDuplicate}
              </Button>
            )}
            {template?.canDelete && (
              <Button variant="danger" size="sm" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void ed.remove()}>
                {t.tplDelete}
              </Button>
            )}
            <Button size="sm" onClick={() => void ed.save()} loading={ed.busy} disabled={!ed.dirty && !!template} data-testid="tpl-save">
              {t.tplSave}
            </Button>
          </div>
        }
      />

      {ed.conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-ui-md border border-warning/30 bg-warning-soft px-3 py-2 text-body text-warning-hover">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <strong>{t.tplConflictTitle}</strong> {t.tplConflictMessage}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void ed.reload()}>{t.tplConflictReload}</Button>
        </div>
      )}
      {message && !nameMissing && <p role="alert" className="rounded-ui-sm bg-danger-soft px-3 py-2 text-caption text-danger-strong">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-4 rounded-ui-lg border border-border bg-surface p-4">
            <Field label={t.tplName} required error={nameMissing ? message : undefined}>
              <Input value={form.name} maxLength={255} onChange={(e) => set("name", e.target.value)} data-testid="tpl-name" />
            </Field>
            <Field label={t.tplDescription}>
              <Textarea value={form.description} maxLength={2000} rows={2} onChange={(e) => set("description", e.target.value)} />
            </Field>
            {template?.isBuiltin ? (
              <p className="text-caption text-fg-muted">{t.tplBuiltinShared}</p>
            ) : (
              <VisibilityField value={form.visibility} onChange={(v) => set("visibility", v)} disabled={!!template && !template.canChangeVisibility} name="tpl-editor-visibility" />
            )}
          </section>
          <section aria-labelledby="tpl-stages-title" className="space-y-2 rounded-ui-lg border border-border bg-surface p-4">
            <h2 id="tpl-stages-title" className="text-body font-semibold text-fg">{t.tplStages}</h2>
            <p className="text-caption text-fg-muted">{t.tplStagesHint}</p>
            <StageTreeEditor stages={form.stages} onChange={(stages) => set("stages", stages)} disabled={ed.busy} />
          </section>
          <TemplateExtrasEditor form={form} set={set} disabled={ed.busy} />
        </div>
        {template && (
          <aside className="min-w-0">
            <TemplateHistory templateId={template.id} version={template.version} />
          </aside>
        )}
      </div>
    </div>
  )
}
