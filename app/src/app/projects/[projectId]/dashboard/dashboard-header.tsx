"use client"

import Link from "next/link"
import { useState } from "react"
import { Button, buttonClasses, PageHeader } from "@/components/ui"
import { AIResultModal } from "@/components/ai-result-modal"
import { useLanguage } from "@/lib/language-context"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { FileText, LayoutDashboard } from "lucide-react"

/** Page title with the AI progress-report and printable-report actions. */
export function DashboardHeader({ projectId }: { projectId: string }) {
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.dashboardTitle)
  const [showProgressReport, setShowProgressReport] = useState(false)

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
            <Button variant="secondary" leftIcon={<span aria-hidden="true">🤖</span>} onClick={() => setShowProgressReport(true)}>
              {t.aiProgressReport}
            </Button>
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
