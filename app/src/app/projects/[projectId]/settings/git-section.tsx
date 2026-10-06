"use client"

import { useEffect, useId, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button, EmptyState, SkeletonLines, useConfirm, useToast } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { forgetGitState } from "@/components/git-dev/git-client-state"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import type { GitSettingsDto } from "../git/git-labels"
import { GitAddRepository } from "./git-add-repository"
import { GitRepositoryList } from "./git-repository-list"
import { GitTokenField } from "./git-token-field"
import { SettingsCard } from "./settings-card"

/** Anchor of this section (the Git page links here). */
export const GIT_SECTION_ID = "git"

export type GitSettingsPatch = { enabled?: boolean; token?: string | null; autoCompleteOnMerge?: boolean }

/** Response → settings; anything missing reads as "off / not set" so a bad body never shows Git UI. */
export function toGitSettings(raw: unknown): GitSettingsDto {
  const r = raw && typeof raw === "object" ? (raw as Partial<GitSettingsDto>) : {}
  return {
    enabled: r.enabled === true,
    hasToken: r.hasToken === true,
    tokenHint: typeof r.tokenHint === "string" ? r.tokenHint : null,
    autoCompleteOnMerge: r.autoCompleteOnMerge === true,
    repositories: Array.isArray(r.repositories) ? r.repositories : [],
    pollIntervalSec: typeof r.pollIntervalSec === "number" ? r.pollIntervalSec : 180,
  }
}

interface Props {
  projectId: string
  /** PO / SM / admin ("git.configure"); everyone else sees the state read-only. */
  canConfigure: boolean
}

/** Per-project GitLab integration: ON/OFF (default off), token, auto-complete and repositories. */
export function GitSection({ projectId, canConfigure }: Props) {
  const { t } = useLanguage()
  const query = useApiQuery<GitSettingsDto>(`/api/projects/${projectId}/git`, {
    parse: toGitSettings,
    toastOnError: () => t.gitSetLoadFailed,
  })
  // Background syncs / knowledge imports update the repository status lines live.
  useLiveRefetch(query.refetch, { types: ["git"], projectId })
  const anchorRef = useRef<HTMLDivElement>(null)
  const loaded = !!query.data
  // Arriving from the Git page (settings#git): the sections above load late, so scroll once this one has content.
  useEffect(() => {
    if (loaded && window.location.hash === `#${GIT_SECTION_ID}`) anchorRef.current?.scrollIntoView?.({ block: "start" })
  }, [loaded])

  return (
    <div id={GIT_SECTION_ID} ref={anchorRef} className="scroll-mt-20">
      <SettingsCard title={t.gitSetTitle}>
        <p className="mb-4 text-caption text-fg-muted">{t.gitSetIntro}</p>
        {query.data ? (
          <GitSettingsBody
            projectId={projectId}
            settings={query.data}
            canConfigure={canConfigure}
            onSettings={(next) => query.mutate(next)}
            onRepositoriesChanged={query.refetch}
          />
        ) : query.isLoading ? (
          <SkeletonLines lines={3} label={t.loading} />
        ) : (
          <EmptyState
            compact
            title={t.gitSetLoadFailed}
            action={
              <Button variant="secondary" onClick={query.refetch}>
                {t.errorRetry}
              </Button>
            }
          />
        )}
      </SettingsCard>
    </div>
  )
}

interface BodyProps {
  projectId: string
  settings: GitSettingsDto
  canConfigure: boolean
  onSettings: (next: GitSettingsDto) => void
  onRepositoriesChanged: () => void
}

function GitSettingsBody({ projectId, settings, canConfigure, onSettings, onRepositoriesChanged }: BodyProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const helpId = useId()

  // Every setting saves at once: a switch that needs a separate save button is easy to forget.
  const save = useApiMutation(
    (patch: GitSettingsPatch) => apiFetch<unknown>(`/api/projects/${projectId}/git`, { method: "PUT", json: patch }).then(toGitSettings),
    { onSuccess: onSettings, toastOnError: () => t.gitSetSaveFailed },
  )

  async function toggleEnabled(next: boolean) {
    if (!next) {
      const ok = await confirm({
        title: t.gitSetTurnOffTitle,
        message: t.gitSetTurnOffMessage,
        confirmLabel: t.gitSetTurnOffConfirm,
        variant: "warning",
      })
      if (!ok) return
    }
    const result = await save.mutate({ enabled: next })
    if (!result) return
    toast.success(next ? t.gitSetEnabledToast : t.gitSetDisabledToast)
    // Panels / badges cache "off" for a while: forget it so they appear at once.
    forgetGitState(projectId)
    // The sidebar is rendered by the server layout: re-render it so the Git entry appears / disappears.
    router.refresh()
  }

  async function toggleAutoComplete(next: boolean) {
    if (await save.mutate({ autoCompleteOnMerge: next })) toast.success(t.settingsSaved)
  }

  const switchClass = "h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <label className="flex items-center gap-3 text-body font-medium text-fg">
          <input
            type="checkbox"
            role="switch"
            checked={settings.enabled}
            disabled={!canConfigure || save.isPending}
            onChange={(e) => void toggleEnabled(e.target.checked)}
            className={switchClass}
          />
          {t.gitSetEnable}
        </label>
        {settings.enabled && <p className="pl-8 text-caption text-fg-muted">{t.gitSetEnabledNote}</p>}
        {!canConfigure && <p className="pl-8 text-caption text-fg-muted">{t.gitSetReadOnly}</p>}
      </div>

      {settings.enabled && (
        <>
          <GitTokenField
            hasToken={settings.hasToken}
            tokenHint={settings.tokenHint}
            canConfigure={canConfigure}
            onSave={(token) => save.mutateAsync({ token })}
          />

          <div className="space-y-1">
            <label className="flex items-center gap-3 text-body font-medium text-fg">
              <input
                type="checkbox"
                role="switch"
                checked={settings.autoCompleteOnMerge}
                disabled={!canConfigure || save.isPending}
                onChange={(e) => void toggleAutoComplete(e.target.checked)}
                aria-describedby={helpId}
                className={switchClass}
              />
              {t.gitSetAutoComplete}
            </label>
            <p id={helpId} className="pl-8 text-caption text-fg-muted">
              {t.gitSetAutoCompleteHelp}
            </p>
          </div>

          <GitRepositoryList
            projectId={projectId}
            repositories={settings.repositories}
            canConfigure={canConfigure}
            onChanged={onRepositoriesChanged}
          />
          {canConfigure && <GitAddRepository projectId={projectId} hasToken={settings.hasToken} onAdded={onRepositoriesChanged} />}
        </>
      )}
    </div>
  )
}
