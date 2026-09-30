"use client"

import { useState } from "react"
import AiReportsPanel from "@/components/ai-reports-panel"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { EntityI18n } from "@/lib/translation/types"
import { ActiveSprintCard } from "./dashboard/active-sprint-card"
import { ActivityFeed } from "./dashboard/activity-feed"
import { AttachmentsSection } from "./dashboard/attachments-section"
import { DashboardHeader } from "./dashboard/dashboard-header"
import type { DueItem } from "./dashboard/dashboard-summary"
import { DescriptionEditor } from "./dashboard/description-editor"
import { MyProjectTasks } from "./dashboard/my-project-tasks"
import { OverviewCards } from "./dashboard/overview-cards"
import { ProductGoals } from "./dashboard/product-goals"
import { ProgressEditor } from "./dashboard/progress-editor"
import { UpcomingDue } from "./dashboard/upcoming-due"
import type { ActiveSprint, Attachment, DashboardMyTask, Folder, ProductGoal } from "./dashboard/types"
import { Briefcase, ChevronRight } from "lucide-react"

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
  /** My open tasks in this project's planning / active sprints. */
  myTasks?: DashboardMyTask[]
  /** Sprint end + plan items due soon (overdue first). */
  upcomingDue?: DueItem[]
}

/**
 * Project dashboard, ordered by what a member needs first:
 * 1. now — active sprint pulse (dominant), my tasks here, what is due next
 * 2. what happened — activity feed, with counts and goals alongside
 * 3. reference — project description (collapsed) and attachments
 */
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
  myTasks = [],
  upcomingDue = [],
}: DashboardContentProps) {
  const { t } = useLanguage()
  // Shared by the name heading and the description editor: a saved
  // description drops its stale translation until the worker refreshes it.
  const [projectText, setProjectText] = useState<EntityI18n | undefined>(projectI18n)

  return (
    <div className="space-y-6">
      <DashboardHeader projectId={projectId} />

      {/* Autonomous AI reports (surveillance / sprint completion) — hidden until the first report exists */}
      <AiReportsPanel projectId={projectId} />

      <section aria-labelledby="dashboard-project-name" className="space-y-3">
        <div className="flex items-center gap-3">
          <Briefcase aria-hidden="true" className="h-6 w-6 text-primary" />
          <h2 id="dashboard-project-name" className="text-2xl font-bold text-fg">
            <I18nText i18n={projectText} field="name" original={projectName} entity={{ type: "project", id: projectId }} />
          </h2>
        </div>
        <ProgressEditor projectId={projectId} initialProgress={projectProgressPct} canEdit={currentUserRole === "po"} />
      </section>

      {/* Row 1 — now */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <ActiveSprintCard projectId={projectId} sprint={activeSprint} />
        </div>
        <div className="lg:col-span-3">
          <MyProjectTasks projectId={projectId} tasks={myTasks} />
        </div>
        <div className="lg:col-span-3">
          <UpcomingDue projectId={projectId} items={upcomingDue} />
        </div>
      </div>

      {/* Row 2 — what happened, with counts and goals alongside */}
      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ActivityFeed projectId={projectId} />
        </div>
        <aside className="space-y-4 lg:col-span-4" aria-label={projectName}>
          <OverviewCards projectId={projectId} iceboxCount={iceboxCount} backlogCount={backlogCount} sprintCount={sprintCount} />
          <div className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
            <ProductGoals projectId={projectId} initialGoals={productGoals} />
          </div>
        </aside>
      </div>

      {/* Reference — collapsed by default */}
      <details className="group rounded-ui-lg border border-border bg-surface shadow-ui-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-ui-lg px-4 py-3 text-body font-semibold text-fg hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="h-4 w-4 text-fg-muted transition-transform group-open:rotate-90" />
          {t.dashboardProjectDetails}
        </summary>
        <div className="border-t border-border px-4 pt-4">
          <DescriptionEditor projectId={projectId} initialDescription={projectDescription} i18n={projectText} onI18nChange={setProjectText} />
        </div>
      </details>

      <AttachmentsSection projectId={projectId} initialFolders={folders} initialAttachments={attachments} />
    </div>
  )
}
