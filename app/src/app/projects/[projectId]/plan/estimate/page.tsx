"use client"

import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { ArrowLeft, Wand2 } from "lucide-react"
import { Button, EmptyState, PageHeader, SkeletonTable } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { EstimateCard } from "@/components/plan-estimate/estimate-card"
import { EstimateEvidence } from "@/components/plan-estimate/estimate-evidence"
import { EstimateForm } from "@/components/plan-estimate/estimate-form"
import type { RunCard } from "@/components/plan-estimate/types"
import { useApiQuery } from "@/hooks"
import { isApiError, localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"

/**
 * 計画を作る (plan 12 E5): make a proposal from a template with the actuals, the confirmed lesson rules and the load
 * redistribution; read its card and evidence; load it into the master plan. ?run=<id> opens an existing run (the
 * link an agent gets from MCP propose_plan_from_actuals).
 */
function EstimateContent() {
  const projectId = useParams().projectId as string
  const search = useSearchParams()
  const router = useRouter()
  const { t } = useLanguage()
  useProjectDocumentTitle(t.pesTitle)
  const runId = search.get("run")
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const card = useApiQuery<RunCard>(runId ? `/api/projects/${projectId}/plan/estimate-runs/${encodeURIComponent(runId)}` : null)
  // After making a run here, the card's heading takes focus once it has rendered (and says the proposal is ready).
  const [created, setCreated] = useState<string | null>(null)
  const focused = useRef<string | null>(null)
  const ready = card.data && created === card.data.runId ? t.pesReady : ""
  useEffect(() => {
    if (card.data && created === card.data.runId && focused.current !== created) {
      focused.current = created
      document.getElementById("pes-card-title")?.focus()
    }
  }, [card.data, created])
  const notFound = isApiError(card.error) && card.error.status === 404

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/projects/${projectId}/plan`} className="inline-flex items-center gap-1 rounded-ui-sm text-body text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.pesBackToPlan}
      </Link>
      <PageHeader title={t.pesTitle} description={t.pesDescription} icon={<Wand2 className="h-6 w-6" />} />
      <p className="sr-only" role="status">
        {ready}
      </p>

      <EstimateForm
        projectId={projectId}
        onCreated={(id) => {
          setEvidenceOpen(false)
          setCreated(id)
          router.replace(`/projects/${projectId}/plan/estimate?run=${encodeURIComponent(id)}`)
        }}
      />

      {runId &&
        (card.isLoading && !card.data ? (
          <SkeletonTable label={t.loading} />
        ) : card.error && !card.data ? (
          <EmptyState
            compact
            headingLevel={2}
            title={notFound ? localizeApiError(card.error, t) : t.pesLoadFailed}
            action={notFound ? undefined : <Button size="sm" onClick={() => void card.refetch()}>{t.errorRetry}</Button>}
          />
        ) : card.data ? (
          <>
            <EstimateCard
              key={card.data.runId}
              projectId={projectId}
              card={card.data}
              evidenceOpen={evidenceOpen}
              onToggleEvidence={() => setEvidenceOpen((o) => !o)}
              onLoaded={() => router.push(`/projects/${projectId}/plan`)}
              onStale={() => void card.refetch()}
            />
            {evidenceOpen && (
              <section id="pes-evidence" aria-labelledby="pes-evidence-title" className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
                <h2 id="pes-evidence-title" className="text-title font-semibold text-fg">
                  {t.pesEvidenceTitle}
                </h2>
                <EstimateEvidence projectId={projectId} runId={card.data.runId} />
              </section>
            )}
          </>
        ) : null)}
    </div>
  )
}

export default function EstimatePage() {
  return (
    <Suspense>
      <EstimateContent />
    </Suspense>
  )
}
