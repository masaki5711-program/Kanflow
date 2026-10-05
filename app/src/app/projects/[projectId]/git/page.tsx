"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { GitBranch, Lightbulb } from "lucide-react"
import { Button, EmptyState, PageHeader, SkeletonCard, buttonClasses } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { suggestBranchName } from "@/lib/git/pbi-keys"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { GitActivityList } from "./git-activity-list"
import { toGitOverview, type GitOverviewDto } from "./git-labels"
import { GitRepoStatus } from "./git-repo-status"
import { useCanConfigureGit } from "./use-can-configure-git"

/** 開発（Git）: repository sync status, how to link work to PBIs, and the latest linked activity. */
export default function GitPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t } = useLanguage()
  useProjectDocumentTitle(t.gitPageTitle)
  const canConfigure = useCanConfigureGit(projectId)
  const settingsHref = canConfigure ? `/projects/${projectId}/settings#git` : null
  const query = useApiQuery<GitOverviewDto>(`/api/projects/${projectId}/git/overview`, {
    parse: toGitOverview,
    toastOnError: () => t.gitPageLoadFailed,
  })
  const data = query.data

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.gitPageTitle} description={data?.enabled ? t.gitPageDesc : undefined} />
      {!data ? (
        query.isLoading ? (
          <SkeletonCard label={t.loading} />
        ) : (
          <EmptyState
            title={t.gitPageLoadFailed}
            action={
              <Button variant="secondary" onClick={query.refetch}>
                {t.errorRetry}
              </Button>
            }
          />
        )
      ) : !data.enabled ? (
        <EmptyState
          icon={<GitBranch className="h-8 w-8" />}
          headingLevel={2}
          title={t.gitPageOffTitle}
          description={settingsHref ? `${t.gitPageOffDesc} ${t.gitPageOffDescConfigure}` : t.gitPageOffDesc}
          action={
            settingsHref && (
              <Link href={settingsHref} className={buttonClasses({ variant: "primary" })}>
                {t.gitPageOpenSettings}
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          <GitRepoStatus
            projectId={projectId}
            repositories={data.repositories}
            pollIntervalSec={data.pollIntervalSec}
            settingsHref={settingsHref}
            onSynced={query.refetch}
          />
          <GitHowTo />
          <GitActivityList projectId={projectId} items={data.recent} />
        </div>
      )}
    </div>
  )
}

function GitHowTo() {
  const { t } = useLanguage()
  const example = suggestBranchName(123, "login form")
  const [before, after] = t.gitPageHowBranch.split("{example}")
  return (
    <section aria-labelledby="git-howto-heading" className="rounded-ui-md border border-info/30 bg-info-soft p-4 sm:p-5">
      <h2 id="git-howto-heading" className="mb-2 flex items-center gap-2 text-body font-semibold text-fg">
        <Lightbulb aria-hidden="true" className="h-4 w-4 text-info" />
        {t.gitPageHowTitle}
      </h2>
      <ol className="list-decimal space-y-1 pl-5 text-caption text-fg">
        <li>
          {before}
          <code className="break-all rounded-ui-sm bg-surface px-1 py-0.5 font-mono">{example}</code>
          {after}
        </li>
        <li>{t.gitPageHowMr}</li>
        <li>{t.gitPageHowResult}</li>
      </ol>
    </section>
  )
}
