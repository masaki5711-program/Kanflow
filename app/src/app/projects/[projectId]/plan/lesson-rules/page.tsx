"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, NotebookPen, Plus } from "lucide-react"
import { Button, EmptyState, PageHeader, SkeletonCard, useConfirm, useToast } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { PromotionDialog } from "@/components/plan-lesson-rules/promotion-dialog"
import { RuleCard } from "@/components/plan-lesson-rules/rule-card"
import { useFocusAfterReload } from "@/components/plan-lesson-rules/use-focus-after-reload"
import { RuleEditor, type RuleEditorSubmit } from "@/components/plan-lesson-rules/rule-editor"
import type { LessonRuleView, ProjectLessonRulesResponse } from "@/components/plan-lesson-rules/types"
import { useRuleSummary } from "@/components/plan-lesson-rules/use-rule-summary"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"

/** Which editor is open: a new draft, or the draft with this id (resolved from the latest list on every render). */
type Editor = { ruleId: string | null } | null

/**
 * 反省点の規則 of one project (plan 12 E3): write drafts, confirm them one at a time with the sentence and numbers
 * on screen, retire them, and (PO) ask an admin to share one with other projects.
 */
export default function LessonRulesPage() {
  const projectId = useParams().projectId as string
  const { t } = useLanguage()
  useProjectDocumentTitle(t.plrTitle)
  const toast = useToast()
  const confirm = useConfirm()
  const summaryOf = useRuleSummary()
  const url = `/api/projects/${projectId}/plan/lesson-rules`
  const { data, isLoading, error, refetch } = useApiQuery<ProjectLessonRulesResponse>(url, { toastOnError: () => t.plrLoadFailed })
  const [editor, setEditor] = useState<Editor>(null)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const requestFocus = useFocusAfterReload(data, editor !== null || promotingId !== null)

  const rules = data?.rules ?? []
  const byId = (id: string | null) => (id ? (rules.find((r) => r.id === id) ?? null) : null)
  const editingRule = byId(editor?.ruleId ?? null)
  const promoting = byId(promotingId)
  const perms = data?.permissions ?? { draft: false, confirm: false, requestPromotion: false }
  const groups = [
    { state: "draft" as const, title: t.plrSectionDraft },
    { state: "confirmed" as const, title: t.plrSectionConfirmed },
    { state: "retired" as const, title: t.plrSectionRetired },
  ].map((g) => ({ ...g, rules: rules.filter((r) => r.state === g.state) }))

  /**
   * One action on one rule. Always reloads (after a 409 the screen shows the rule as it is now). Focus goes to the
   * rule's card once the reloaded list rendered — except when the action came from a dialog that stays open because
   * it failed: focus then stays in the dialog.
   */
  async function run(id: string, action: () => Promise<unknown>, done: string, fromDialog = false): Promise<boolean> {
    if (busyId) return false
    setBusyId(id)
    let focusId: string | null = id === "new" ? null : id
    let ok = false
    try {
      const result = await action()
      if (id === "new" && result && typeof result === "object" && "id" in result && typeof result.id === "string") focusId = result.id
      toast.success(done)
      ok = true
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      if (ok || !fromDialog) requestFocus(focusId)
      refetch()
      setBusyId(null)
    }
    return ok
  }

  async function saveDraft(value: RuleEditorSubmit) {
    const rule = editingRule
    const ok = await run(
      rule?.id ?? "new",
      () =>
        rule
          ? apiFetch(`${url}/${rule.id}`, { method: "PATCH", json: { version: rule.version, kind: value.kind, params: value.params, quote: value.quote } })
          : apiFetch<{ id: string }>(url, {
              method: "POST",
              json: { kind: value.kind, params: value.params, quote: value.quote, ...(value.sourceSprintId ? { sourceSprintId: value.sourceSprintId } : {}) },
            }),
      t.plrSaved,
      true,
    )
    // Close only the editor that saved (the user may have cancelled it and opened another one meanwhile).
    const savedKey = rule?.id ?? null
    if (ok) setEditor((cur) => (cur && cur.ruleId === savedKey ? null : cur))
  }

  async function confirmRule(rule: LessonRuleView) {
    // The dialog repeats the sentence with its numbers; the request repeats them too, so the server refuses a draft
    // that changed in between (PLAN_RULE_CHANGED).
    if (busyId) return
    const yes = await confirm({ title: t.plrConfirmTitle, message: `${summaryOf(rule.kind, rule.params)}\n\n${t.plrConfirmBody}`, confirmLabel: t.plrConfirmAction, variant: "info" })
    if (!yes) return
    await run(rule.id, () => apiFetch(`${url}/${rule.id}/confirm`, { method: "POST", json: { version: rule.version, kind: rule.kind, params: rule.params } }), t.plrConfirmed)
  }

  async function retireRule(rule: LessonRuleView) {
    if (busyId) return
    const yes = await confirm({ title: t.plrRetireTitle, message: `${summaryOf(rule.kind, rule.params)}\n\n${t.plrRetireBody}`, confirmLabel: t.plrRetire, variant: "danger" })
    if (!yes) return
    await run(rule.id, () => apiFetch(`${url}/${rule.id}/retire`, { method: "POST", json: { version: rule.version } }), t.plrRetired)
  }

  async function requestPromotion(rule: LessonRuleView, filters: { lineage: string | null; projectType: string | null }) {
    const ok = await run(rule.id, () => apiFetch(`${url}/${rule.id}/promotion`, { method: "POST", json: { version: rule.version, ...filters } }), t.plrPromotionRequested, true)
    if (ok) setPromotingId((cur) => (cur === rule.id ? null : cur))
  }

  function actionsFor(rule: LessonRuleView) {
    if (rule.scope !== "project") return null
    const busy = busyId !== null
    const buttons = []
    // Order: quiet actions first, the primary one (confirm) last, next to the edge the eye lands on.
    if (rule.state !== "retired" && perms.confirm)
      buttons.push(
        <Button key="retire" size="sm" variant="ghost" onClick={() => void retireRule(rule)} aria-disabled={busy || undefined}>
          {t.plrRetire}
        </Button>,
      )
    if (rule.state === "draft" && perms.draft)
      buttons.push(
        <Button key="edit" size="sm" variant="secondary" onClick={() => !busy && setEditor({ ruleId: rule.id })} aria-disabled={busy || undefined}>
          {t.plrEdit}
        </Button>,
      )
    if (rule.state === "confirmed" && perms.requestPromotion && !rule.promotionRequest && !rule.fromRetrospective && !rule.sourceConfidential)
      buttons.push(
        <Button key="promote" size="sm" variant="secondary" onClick={() => !busy && setPromotingId(rule.id)} aria-disabled={busy || undefined}>
          {t.plrRequestPromotion}
        </Button>,
      )
    if (rule.state === "draft" && perms.confirm)
      buttons.push(
        <Button key="confirm" size="sm" onClick={() => void confirmRule(rule)} aria-disabled={busy || undefined}>
          {t.plrConfirm}
        </Button>,
      )
    return buttons.length ? buttons : null
  }

  function promotionNote(rule: LessonRuleView): string | null {
    if (rule.state !== "confirmed" || rule.scope !== "project" || !perms.requestPromotion || rule.promotionRequest) return null
    if (rule.fromRetrospective) return t.plrPromotionBlockedRetro
    if (rule.sourceConfidential) return t.plrPromotionBlockedConfidential
    return null
  }

  const newButton = (primary: boolean) =>
    perms.draft && (
      <Button
        variant={primary ? "primary" : "secondary"}
        leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
        aria-disabled={busyId !== null || undefined}
        onClick={() => busyId === null && setEditor({ ruleId: null })}
      >
        {t.plrNew}
      </Button>
    )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/projects/${projectId}/plan`} className="inline-flex items-center gap-1 rounded-ui-sm text-body text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.plrBackToPlan}
      </Link>
      <PageHeader title={t.plrTitle} description={t.plrDescription} icon={<NotebookPen className="h-6 w-6" />} actions={rules.length > 0 && newButton(true)} />

      {isLoading && !data ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only" role="status">
            {t.loading}
          </span>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error && !data ? (
        <EmptyState headingLevel={2} title={t.plrLoadFailed} action={<Button onClick={() => void refetch()}>{t.errorRetry}</Button>} />
      ) : rules.length === 0 ? (
        <EmptyState headingLevel={2} icon={<NotebookPen className="h-8 w-8" />} title={t.plrEmptyTitle} description={t.plrEmptyBody} action={newButton(true)} />
      ) : (
        groups
          .filter((g) => g.rules.length > 0)
          .map((g) => (
            <section key={g.state} aria-labelledby={`plr-${g.state}`} className="space-y-3">
              <h2 id={`plr-${g.state}`} className="flex items-baseline gap-2 text-title font-semibold text-fg">
                {g.title}
                <span className="text-caption font-normal text-fg-muted">{g.rules.length}</span>
              </h2>
              <ul className="space-y-3">
                {g.rules.map((rule) => (
                  <li key={rule.id}>
                    <RuleCard rule={rule} busy={busyId === rule.id} actions={actionsFor(rule)} meta={promotionNote(rule)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}

      {editor && (editor.ruleId === null || editingRule) && (
        <RuleEditor
          key={editor.ruleId ?? "new"}
          open
          rule={editingRule}
          sprints={data?.sprints ?? []}
          busy={busyId !== null}
          onClose={() => setEditor(null)}
          onSubmit={(v) => void saveDraft(v)}
        />
      )}
      {promoting && (
        <PromotionDialog
          rule={promoting}
          lineages={data?.lineages ?? []}
          projectType={data?.projectType ?? "software"}
          busy={busyId !== null}
          onClose={() => setPromotingId(null)}
          onSubmit={(f) => void requestPromotion(promoting, f)}
        />
      )}
    </div>
  )
}
