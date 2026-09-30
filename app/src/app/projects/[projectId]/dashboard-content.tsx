"use client"

import { useState } from "react"
import AiReportsPanel from "@/components/ai-reports-panel"
import { I18nText } from "@/components/i18n-text"
import type { EntityI18n } from "@/lib/translation/types"
import { ActiveSprintCard } from "./dashboard/active-sprint-card"
import { AttachmentsSection } from "./dashboard/attachments-section"
import { DashboardHeader } from "./dashboard/dashboard-header"
import { DescriptionEditor } from "./dashboard/description-editor"
import { OverviewCards } from "./dashboard/overview-cards"
import { ProductGoals } from "./dashboard/product-goals"
import { ProgressEditor } from "./dashboard/progress-editor"
import type { ActiveSprint, Attachment, Folder, ProductGoal } from "./dashboard/types"
import { Briefcase } from "lucide-react"

interface DashboardContentProps {
  projectId: string
  projectName: string
  projectDescription: string | null
  /** Both-language text of the project (name / description). */
  projectI18n?: EntityI18n
  productGoals: ProductGoal[]
  folders: Folder[]
  attachments: Attachment[]
  iceboxCount: number
  backlogCount: number
  sprintCount: number
  projectProgressPct: number
  currentUserRole: string
  activeSprint: ActiveSprint | null
}

export function DashboardContent({
  projectId,
  projectName,
  projectDescription,
  projectI18n,
  productGoals,
  folders,
  attachments,
  iceboxCount,
  backlogCount,
  sprintCount,
  projectProgressPct,
  currentUserRole,
  activeSprint,
}: DashboardContentProps) {
  // Shared by the name heading and the description editor: a saved
  // description drops its stale translation until the worker refreshes it.
  const [projectText, setProjectText] = useState<EntityI18n | undefined>(projectI18n)

  return (
    <div className="space-y-6">
      <DashboardHeader projectId={projectId} />

      {/* Autonomous AI reports (surveillance / sprint completion) — hidden until the first report exists */}
      <AiReportsPanel projectId={projectId} />

      <section aria-labelledby="dashboard-project-name" className="bg-surface rounded-ui-lg border border-border shadow-ui-sm overflow-hidden">
        <div aria-hidden="true" className="h-[3px] bg-primary" />
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <Briefcase className="w-6 h-6 text-primary" />
            <h2 id="dashboard-project-name" className="text-2xl font-bold text-fg">
              <I18nText i18n={projectText} field="name" original={projectName} entity={{ type: "project", id: projectId }} />
            </h2>
          </div>
          <ProgressEditor projectId={projectId} initialProgress={projectProgressPct} canEdit={currentUserRole === "po"} />
          <DescriptionEditor
            projectId={projectId}
            initialDescription={projectDescription}
            i18n={projectText}
            onI18nChange={setProjectText}
          />
          <ProductGoals projectId={projectId} initialGoals={productGoals} />
        </div>
      </section>

      <OverviewCards projectId={projectId} iceboxCount={iceboxCount} backlogCount={backlogCount} sprintCount={sprintCount} />

      <ActiveSprintCard projectId={projectId} sprint={activeSprint} />

      <AttachmentsSection projectId={projectId} initialFolders={folders} initialAttachments={attachments} />
    </div>
  )
}
