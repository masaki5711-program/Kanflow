"use client"

import Link from "next/link"
import { useState } from "react"
import { Button, buttonClasses, PageHeader } from "@/components/ui"
import { AIResultModal } from "@/components/ai-result-modal"
import { AiJobChip } from "@/components/ai-jobs/ai-job-chip"
import { useAiReportJob } from "@/components/ai-jobs/use-ai-job"
import { useLanguage } from "@/lib/language-context"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { FileText, LayoutDashboard } from "lucide-react"

/**
 * Page title with the AI progress-report and printable-report actions.
 *
 * The progress report is generated in the background (AiJob, worker or
 * in-process runner): the button shows a status chip and the requester gets
 * a notification when it is ready; the report appears in the AI reports
 * panel. Without a job runner (503 ai_jobs_disabled) it falls back to the
 * streaming modal. Hidden for users without `ai.use` (section managers, A3-13).
 */
export function DashboardHeader({ projectId, canUseAi = true }: { projectId: string; canUseAi?: boolean }) {
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.dashboardTitle)
  const [showProgressReport, setShowProgressReport] = useState(false)
  const reportJob = useAiReportJob({ projectId, onFallback: () => setShowProgressReport(true) })

  return (
    <>
      <PageHeader
        className="mb-0"
        title={t.dashboardTitle}
        icon={
          <span className="block p-2 bg-primary rounded-ui-md text-primary-fg shadow-ui-md">
            <LayoutDashboard className="w-6 h-6" />
          </span>
        }
        actions={
          <>
            {canUseAi && reportJob.job && <AiJobChip job={reportJob.job} />}
            {canUseAi && (
              <Button
                variant="secondary"
                leftIcon={<span aria-hidden="true">🤖</span>}
                loading={reportJob.starting}
                disabled={reportJob.active}
                onClick={() => void reportJob.start()}
              >
                {t.aiProgressReport}
              </Button>
            )}
            <Link href={`/projects/${projectId}/report`} className={buttonClasses({ variant: "primary" })}>
              <FileText className="w-4 h-4" />
              {t.reportTitle}
            </Link>
          </>
        }
      />
      {showProgressReport && (
        <AIResultModal
          title={t.aiProgressReportTitle}
          fetchUrl={`/api/projects/${projectId}/ai/progress-report`}
          fetchBody={{ lang: language }}
          structured
          triggerLabel={t.aiReportTriggerProgress}
          onClose={() => setShowProgressReport(false)}
        />
      )}
    </>
  )
}
