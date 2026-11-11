"use client"

import { useLanguage } from "@/lib/language-context"
import { projectFeatures } from "@/lib/project-features"
import { fillTemplate } from "@/lib/fill-template"
import { formatRelative } from "@/lib/format-date"
import { Badge, cn, type BadgeTone } from "@/components/ui"
import { AlertTriangle, Bot, GitBranch } from "lucide-react"
import type { ReactNode } from "react"
import { claimState, initials, shownPaths, type ClaimState, type ScreenClaim, type ScreenMrWarnings, type ScreenOverlap, type ScreenScopeEntry } from "./claim-view"

/** Branches are developer detail: shown only in software projects. */
export function useShowBranch(): boolean {
  return projectFeatures(useLanguage().projectType).workClaimBranch
}

export function useStateLabel(): (state: ClaimState) => string {
  const { t } = useLanguage()
  return (state) => (state === "stale" ? t.workClaimStateStale : state === "staleSoon" ? t.workClaimStateStaleSoon : t.workClaimStateActive)
}

const STATE_TONE: Record<ClaimState, BadgeTone> = { active: "success", staleSoon: "warning", stale: "neutral" }

/** The state as a word (never color only). */
export function ClaimStateBadge({ state }: { state: ClaimState }) {
  const label = useStateLabel()
  return <Badge tone={STATE_TONE[state]} dot data-claim-state={state}>{label(state)}</Badge>
}

/** Initials circle; decorative (the name is always written next to it). */
export function ClaimAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold leading-none text-primary-strong", className)}>
      {initials(name)}
    </span>
  )
}

/** "AI" with the robot icon: visible text, plus a fuller label for screen readers. */
export function AiMarker() {
  const { t } = useLanguage()
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-info-soft px-1.5 text-caption font-medium text-info" title={t.workClaimAiLabel} data-claim-ai="">
      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
      <span aria-hidden="true">{t.workClaimAi}</span>
      <span className="sr-only">{t.workClaimAiLabel}</span>
    </span>
  )
}

export function BranchName({ branch }: { branch: string }) {
  const { t } = useLanguage()
  return (
    <span className="inline-flex min-w-0 items-center gap-0.5 font-mono text-caption text-fg-muted" title={branch} data-claim-branch="">
      <GitBranch className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">{t.workClaimBranch}:</span>
      <span className="truncate">{branch}</span>
    </span>
  )
}

/** One claim on a board card: person, AI marker, branch (software), state / last seen. */
export function ClaimMark({ claim, now, showBranch, wholePbi }: { claim: ScreenClaim; now: Date; showBranch: boolean; wholePbi: boolean }) {
  const { t, language } = useLanguage()
  const stateLabel = useStateLabel()
  const state = claimState(claim, now)
  const seen = formatRelative(claim.heartbeatAt, now, language)
  const sentence = fillTemplate(claim.ai ? t.workClaimMarkLabelAi : t.workClaimMarkLabel, { name: claim.user.name, state: stateLabel(state), time: seen })
  return (
    <li
      data-claim-mark={claim.id}
      data-claim-state={state}
      title={sentence}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-1 py-0.5 text-caption",
        state === "active" && "border-success/40 bg-success-soft/40 text-fg",
        state === "staleSoon" && "border-warning/40 bg-surface text-fg-muted opacity-80",
        state === "stale" && "border-dashed border-border-strong bg-surface-muted text-fg-subtle",
      )}
    >
      <span className="sr-only">{sentence}{wholePbi ? ` — ${t.workClaimWholePbi}` : ""}{showBranch && claim.branch ? ` — ${t.workClaimBranch}: ${claim.branch}` : ""}</span>
      <span aria-hidden="true" className="inline-flex min-w-0 items-center gap-1">
        <ClaimAvatar name={claim.user.name} />
        <span className="max-w-[7rem] truncate">{claim.user.name}</span>
        {claim.ai && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-info-soft px-1 font-medium text-info" data-claim-ai="">
            <Bot className="h-3 w-3" />
            {t.workClaimAi}
          </span>
        )}
        {wholePbi && <span className="whitespace-nowrap text-fg-muted">{t.workClaimWholePbi}</span>}
        {showBranch && claim.branch && (
          <span className="inline-flex min-w-0 items-center gap-0.5 font-mono text-fg-muted" data-claim-branch="">
            <GitBranch className="h-3 w-3 flex-shrink-0" />
            <span className="max-w-[8rem] truncate">{claim.branch}</span>
          </span>
        )}
        <span className="whitespace-nowrap">{state === "active" ? seen : stateLabel(state)}</span>
      </span>
    </li>
  )
}

/** "a、b、c ほか 2 件": the first paths and the rest, in the viewer's language. */
export function usePathList(): (paths: readonly string[], total?: number) => string {
  const { t } = useLanguage()
  return (paths, total) => {
    const { shown, rest } = shownPaths(paths, total)
    const list = shown.join(t.workClaimPathSeparator)
    return rest > 0 ? `${list} ${fillTemplate(t.workClaimMore, { count: rest })}` : list
  }
}

/** A one-line warning: icon (decorative) + "注意:" for screen readers + the sentence. Never blocks anything. */
export function WarningLine({ text, className, ...data }: { text: string; className?: string } & Record<`data-${string}`, string>) {
  const { t } = useLanguage()
  return (
    <p className={cn("flex min-w-0 items-start gap-1 rounded-ui-sm bg-warning-soft px-1.5 py-0.5 text-caption text-warning-strong", className)} title={text} {...data}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        <span className="sr-only">{t.workClaimWarning}: </span>
        {text}
      </span>
    </p>
  )
}

/** 触る範囲 (W4): "〇〇さんの作業と範囲が重なっています: <paths>". */
export function OverlapWarning({ overlap, className }: { overlap: ScreenOverlap; className?: string }) {
  const { t } = useLanguage()
  const pathList = usePathList()
  const text = fillTemplate(t.workClaimOverlap, { name: overlap.user.name, paths: pathList(overlap.paths, overlap.pathCount) })
  return <WarningLine text={text} className={className} data-claim-overlap={overlap.claimId} />
}

/**
 * A warning about an MR, then a short link that names its purpose ("!9 を開く（新しいタブ）") — the sentence itself is
 * not a link (a whole warning as a link name says nothing about where it goes). No link for a non-https URL (the
 * sync stores https only).
 */
function MrWarning({ url, mrRef, children }: { url: string | null; mrRef: string; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <div className="space-y-0.5">
      {children}
      {url && /^https:\/\//i.test(url) && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-5 inline-block rounded-sm text-caption font-medium text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {fillTemplate(t.workClaimMrOpen, { mr: `!${mrRef}` })}
        </a>
      )}
    </div>
  )
}

/**
 * N6: what the Git sync knows against a claim — other open MRs that already change files of its scope (fact), the
 * PBI's MRs predicted to conflict (GitStation's trial merge), and what is not checked yet. Warnings only.
 */
export function MrWarningLines({ warnings }: { warnings: ScreenMrWarnings }) {
  const { t } = useLanguage()
  const pathList = usePathList()
  const pbiList = (pbis: readonly number[]) => (pbis.length > 0 ? fillTemplate(t.workClaimMrOverlapPbis, { pbis: pbis.map((n) => `PBI-${n}`).join(t.workClaimPathSeparator) }) : "")
  return (
    <div className="space-y-0.5" data-claim-mr-warnings="">
      {warnings.mergeRequestOverlaps.map((o) => {
        const text = fillTemplate(t.workClaimMrOverlap, { mr: `!${o.ref}`, pbis: pbiList(o.pbis), count: o.count, paths: pathList(o.paths, o.count) })
        const full = o.complete ? text : `${text} ${fillTemplate(t.workClaimMrOverlapPartial, { mr: `!${o.ref}` })}`
        return (
          <MrWarning key={`o-${o.repository}-${o.ref}`} url={o.url} mrRef={o.ref}>
            <WarningLine text={full} data-claim-mr-overlap={o.ref} />
          </MrWarning>
        )
      })}
      {warnings.predictedConflicts.map((c, i) => {
        const text = c.peer
          ? fillTemplate(t.workClaimMrPredicted, { mr: `!${c.ref}`, peer: `!${c.peer.ref}${pbiList(c.peer.pbis)}`, files: c.files })
          : fillTemplate(t.workClaimMrPredictedHidden, { mr: `!${c.ref}`, files: c.files })
        return (
          <MrWarning key={`p-${c.ref}-${c.peer?.ref ?? i}`} url={c.url} mrRef={c.ref}>
            <WarningLine text={text} data-claim-mr-predicted={c.ref} />
          </MrWarning>
        )
      })}
      {warnings.predictionUnchecked.length > 0 && (
        <p className="text-caption text-fg-muted" data-claim-mr-unchecked="">
          {fillTemplate(t.workClaimMrPredictionUnchecked, { mrs: warnings.predictionUnchecked.map((r) => `!${r}`).join(t.workClaimPathSeparator) })}
        </p>
      )}
      {warnings.mergeRequestsUnavailable === true && <p className="text-caption text-fg-muted" data-claim-mr-unavailable="">{t.workClaimMrUnavailable}</p>}
      {(warnings.changedPathsPending ?? 0) > 0 && (
        <p className="text-caption text-fg-subtle" data-claim-mr-pending="">{fillTemplate(t.workClaimMrPathsPending, { count: warnings.changedPathsPending ?? 0 })}</p>
      )}
    </div>
  )
}

/** The declared scope of a claim as one line (modules and paths as written). */
export function ScopeLine({ scope, scopeCount }: { scope: readonly ScreenScopeEntry[]; scopeCount?: number }) {
  const { t } = useLanguage()
  const pathList = usePathList()
  if (scope.length === 0) return null
  return (
    <p className="min-w-0 truncate font-mono text-caption text-fg-muted" title={scope.map((e) => e.value).join("\n")} data-claim-scope="">
      <span className="font-sans">{t.workClaimScope}: </span>
      {pathList(scope.map((e) => e.value), scopeCount)}
    </p>
  )
}
