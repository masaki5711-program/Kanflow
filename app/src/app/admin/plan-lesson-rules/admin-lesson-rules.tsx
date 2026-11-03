"use client"

import { useState } from "react"
import Link from "next/link"
import { Button, EmptyState, PageHeader, SkeletonCard, useConfirm, useToast } from "@/components/ui"
import { RuleCard, useFilterLabel } from "@/components/plan-lesson-rules/rule-card"
import { useFocusAfterReload } from "@/components/plan-lesson-rules/use-focus-after-reload"
import type { AdminLessonRuleView } from "@/components/plan-lesson-rules/types"
import { useRuleSummary } from "@/components/plan-lesson-rules/use-rule-summary"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"

const PENDING_ID = "plr-admin-pending"
const SHARED_ID = "plr-admin-shared"

/**
 * /admin/plan-lesson-rules: promotion requests (confirm one at a time with the sentence, the numbers AND the
 * requested reach shown, or reject) and the shared rules (retire; a rule paused because a source became
 * confidential is marked).
 */
export function AdminLessonRules() {
  const { t } = useLanguage()
  useDocumentTitle([t.plrAdminTitle])
  const toast = useToast()
  const confirm = useConfirm()
  const filterLabel = useFilterLabel()
  const summaryOf = useRuleSummary()
  const { data, isLoading, error, refetch } = useApiQuery<{ rules: AdminLessonRuleView[] }>("/api/admin/plan-lesson-rules", { toastOnError: () => t.plrLoadFailed })
  const [busyId, setBusyId] = useState<string | null>(null)
  const requestFocus = useFocusAfterReload(data, false)

  const rules = data?.rules ?? []
  const pending = rules.filter((r) => r.scope === "project" && r.promotionRequest)
  const shared = rules.filter((r) => r.scope === "shared")

  async function run(id: string, sectionId: string, action: () => Promise<unknown>, done: string) {
    if (busyId) return
    setBusyId(id)
    try {
      await action()
      toast.success(done)
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      // The card may move (approve → shared) or vanish (reject): focus it once the reloaded list rendered, else the
      // section heading.
      requestFocus(id, sectionId)
      refetch()
      setBusyId(null)
    }
  }

  const reachOf = (rule: AdminLessonRuleView) => filterLabel(rule.promotionRequest?.lineage ?? null, rule.promotionRequest?.projectType ?? null)

  async function approve(rule: AdminLessonRuleView) {
    if (busyId || !rule.promotionRequest) return
    const request = rule.promotionRequest
    const yes = await confirm({
      title: t.plrAdminApproveTitle,
      message: `${summaryOf(rule.kind, rule.params)}\n${fillTemplate(t.plrAdminRequestedScope, { filters: reachOf(rule) })}\n\n${t.plrAdminApproveBody}`,
      confirmLabel: t.plrAdminApprove,
      variant: "warning",
    })
    if (!yes) return
    await run(
      rule.id,
      SHARED_ID,
      () =>
        apiFetch(`/api/admin/plan-lesson-rules/${rule.id}/promotion`, {
          method: "POST",
          json: { decision: "confirm", version: rule.version, kind: rule.kind, params: rule.params, lineage: request.lineage, projectType: request.projectType },
        }),
      t.plrAdminApproved,
    )
  }

  const reject = (rule: AdminLessonRuleView) =>
    run(rule.id, PENDING_ID, () => apiFetch(`/api/admin/plan-lesson-rules/${rule.id}/promotion`, { method: "POST", json: { decision: "reject", version: rule.version } }), t.plrAdminRejected)

  async function retire(rule: AdminLessonRuleView) {
    if (busyId) return
    const yes = await confirm({ title: t.plrRetireTitle, message: `${summaryOf(rule.kind, rule.params)}\n\n${t.plrRetireBody}`, confirmLabel: t.plrRetire, variant: "danger" })
    if (!yes) return
    await run(rule.id, SHARED_ID, () => apiFetch(`/api/admin/plan-lesson-rules/${rule.id}/retire`, { method: "POST", json: { version: rule.version } }), t.plrRetired)
  }

  const source = (rule: AdminLessonRuleView) => (
    <Link
      href={`/projects/${rule.sourceProjectId}/plan/lesson-rules`}
      className="rounded-ui-sm underline-offset-2 [overflow-wrap:anywhere] hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {fillTemplate(t.plrAdminSource, { name: rule.sourceProjectName })}
    </Link>
  )
  const busy = busyId !== null

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title={t.plrAdminTitle} description={t.plrAdminDescription} />

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
      ) : (
        <>
          <section aria-labelledby={PENDING_ID} className="space-y-3">
            <h2 id={PENDING_ID} className="flex items-baseline gap-2 rounded-ui-sm text-title font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t.plrAdminPending}
              <span className="text-caption font-normal text-fg-muted">{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
              <EmptyState compact headingLevel={3} title={t.plrAdminPendingEmpty} />
            ) : (
              <ul className="space-y-3">
                {pending.map((rule) => (
                  <li key={rule.id}>
                    <RuleCard
                      rule={rule}
                      busy={busyId === rule.id}
                      meta={
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {source(rule)}
                          <span className="font-medium text-fg">{fillTemplate(t.plrAdminRequestedScope, { filters: reachOf(rule) })}</span>
                        </span>
                      }
                      actions={
                        <>
                          <Button size="sm" variant="secondary" onClick={() => void reject(rule)} aria-disabled={busy || undefined}>
                            {t.plrAdminReject}
                          </Button>
                          <Button size="sm" onClick={() => void approve(rule)} aria-disabled={busy || undefined}>
                            {t.plrAdminApprove}
                          </Button>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby={SHARED_ID} className="space-y-3">
            <h2 id={SHARED_ID} className="flex items-baseline gap-2 rounded-ui-sm text-title font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t.plrAdminShared}
              <span className="text-caption font-normal text-fg-muted">{shared.length}</span>
            </h2>
            {shared.length === 0 ? (
              <EmptyState compact headingLevel={3} title={t.plrAdminSharedEmpty} />
            ) : (
              <ul className="space-y-3">
                {shared.map((rule) => (
                  <li key={rule.id}>
                    <RuleCard
                      rule={rule}
                      busy={busyId === rule.id}
                      meta={
                        <span className="flex flex-col gap-1">
                          {source(rule)}
                          {rule.suspended && <span className="text-danger">{t.plrAdminSuspendedHint}</span>}
                        </span>
                      }
                      actions={
                        rule.state === "confirmed" && (
                          <Button size="sm" variant="ghost" onClick={() => void retire(rule)} aria-disabled={busy || undefined}>
                            {t.plrRetire}
                          </Button>
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
