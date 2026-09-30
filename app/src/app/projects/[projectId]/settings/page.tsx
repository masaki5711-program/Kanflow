"use client"

import { useParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button, EmptyState, SkeletonCard, PageHeader } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { DangerZoneSection } from "./danger-zone-section"
import { ProjectTypeSection, TranslationInfoSection } from "./general-sections"
import { MembersSection } from "./members-section"
import { SectionAssignSection } from "./section-assign-section"
import { SprintWorkloadSection } from "./sprint-workload-section"
import {
  toSectionIds,
  toSprintHistory,
  toSprintSettings,
  type Member,
  type ProjectSettingsResponse,
  type SprintHistory,
} from "./settings-types"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

export default function SettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t } = useLanguage()
  useProjectDocumentTitle(t.settingsTitle)
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"

  // Independent requests — issued in parallel.
  const projectQuery = useApiQuery<ProjectSettingsResponse>(`/api/projects/${projectId}`, {
    toastOnError: () => t.settingsLoadFailed,
  })
  const membersQuery = useApiQuery<Member[]>(`/api/projects/${projectId}/members`, {
    parse: (raw) => (Array.isArray(raw) ? (raw as Member[]) : []),
    toastOnError: true,
  })
  const { data: sprintHistory = [] } = useApiQuery<SprintHistory[]>(`/api/projects/${projectId}/sprints`, {
    parse: toSprintHistory,
    toastOnError: true,
  })

  const project = projectQuery.data
  const projectPlaceholder = projectQuery.isLoading ? (
    <SkeletonCard label={t.loading} className="mb-6" />
  ) : (
    <EmptyState
      compact
      className="mb-6"
      title={t.settingsLoadFailed}
      action={
        <Button variant="secondary" onClick={projectQuery.refetch}>
          {t.errorRetry}
        </Button>
      }
    />
  )
  const isPO = (membersQuery.data ?? []).some((m) => m.user.id === session?.user?.id && m.role === "po")

  return (
    <div>
      <PageHeader title={t.settingsTitle} />

      <TranslationInfoSection />
      <ProjectTypeSection projectId={projectId} />

      {/* Both project-backed sections share one placeholder (shown once) until the project loads. */}
      {project ? (
        <>
          {(isAdmin || isPO) && (
            <SectionAssignSection
              key={`sections-${projectId}`}
              projectId={projectId}
              initialSectionIds={toSectionIds(project)}
            />
          )}
          <SprintWorkloadSection
            key={`workload-${projectId}`}
            projectId={projectId}
            initialSettings={toSprintSettings(project)}
            history={sprintHistory}
          />
        </>
      ) : (
        projectPlaceholder
      )}

      <MembersSection projectId={projectId} membersQuery={membersQuery} />
      <DangerZoneSection projectId={projectId} />
    </div>
  )
}
