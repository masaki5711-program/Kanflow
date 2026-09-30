"use client"

import { BarChart3 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import BurndownChart from "@/components/burndown-chart"
import { PageHeader } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

interface Props {
  projectId: string
}

export function BurndownPageContent({ projectId }: Props) {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.burndownPageTitle)

  return (
    <div>
      <PageHeader
        className="mb-4"
        title={t.burndownPageTitle}
        icon={
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-ui-md bg-primary-soft text-primary-strong">
            <BarChart3 className="w-4 h-4" />
          </span>
        }
      />
      <BurndownChart projectId={projectId} refreshable />
    </div>
  )
}
