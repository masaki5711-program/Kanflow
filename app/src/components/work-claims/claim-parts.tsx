"use client"

import { useLanguage } from "@/lib/language-context"
import { formatRelative } from "@/lib/format-date"
import { Badge, cn, type BadgeTone } from "@/components/ui"
import { Bot, GitBranch } from "lucide-react"
import { claimState, initials, type ClaimState, type ScreenClaim } from "./claim-view"

/** Branches are developer detail: shown only in software projects. */
export function useShowBranch(): boolean {
  return useLanguage().projectType === "software"
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
  const sentence = (claim.ai ? t.workClaimMarkLabelAi : t.workClaimMarkLabel)
    .replace("{name}", claim.user.name)
    .replace("{state}", stateLabel(state))
    .replace("{time}", seen)
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
