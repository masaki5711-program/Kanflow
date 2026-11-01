"use client"

import { useId, useMemo } from "react"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime, formatRelative } from "@/lib/format-date"
import { apiFetch, useApiMutation } from "@/hooks"
import { Button, cn, useConfirm } from "@/components/ui"
import { claimState, overlapsOf, type ScreenClaim, type ScreenOutsideScope } from "./claim-view"
import { AiMarker, BranchName, ClaimAvatar, ClaimStateBadge, OverlapWarning, ScopeLine, usePathList, useShowBranch, WarningLine } from "./claim-parts"
import { useNow, useWorkClaims } from "./use-work-claims"

interface Props {
  projectId: string
  pbiId: string
  className?: string
}

/**
 * The 「担当中」 panel of a PBI (W3): who works on it (person, AI marker, branch in
 * software projects, since, last seen, expired flag), its 触る範囲 and one warning line per
 * overlapping claim, and one line per open MR that changes files outside the declared scope
 * (W4; warnings only). A PO / SM / admin (`canModerate`
 * from the server) may release a claim after a confirm; everyone else reads only.
 * Renders nothing while loading; outside software projects also nothing when empty.
 */
export function PbiClaimsPanel({ projectId, pbiId, className }: Props) {
  const { t } = useLanguage()
  const headingId = useId()
  const showBranch = useShowBranch()
  const scope = useMemo(() => ({ pbiId }), [pbiId])
  const { data, error, refetch } = useWorkClaims(projectId, scope)
  const now = useNow()

  if (!data && error) {
    return <p role="alert" className={cn("rounded-ui-sm bg-surface-muted px-2 py-1.5 text-caption text-fg-muted", className)}>{t.workClaimLoadFailed}</p>
  }
  if (!data) return null
  if (data.data.length === 0 && !showBranch) return null

  return (
    <section aria-labelledby={headingId} className={cn("space-y-2 rounded-ui-md border border-border p-3", className)} data-pbi-claims-panel="">
      <h3 id={headingId} className="text-body font-semibold text-fg">{t.workClaimPanelTitle}</h3>
      {data.data.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.workClaimEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.data.map((claim) => (
            <ClaimRow key={claim.id} projectId={projectId} claim={claim} now={now} showBranch={showBranch}
              canModerate={data.canModerate} onReleased={refetch} />
          ))}
        </ul>
      )}
      {data.outsideScope.length > 0 && (
        <div className="space-y-1" data-claim-outside-scope="">
          {data.outsideScope.map((mr) => <OutsideScopeLine key={mr.linkId} mr={mr} />)}
        </div>
      )}
      {data.truncated && <p className="text-caption text-fg-subtle">{fillTemplate(t.workClaimTruncated, { count: data.limit ?? data.data.length })}</p>}
    </section>
  )
}

function ClaimRow({ projectId, claim, now, showBranch, canModerate, onReleased }: {
  projectId: string
  claim: ScreenClaim
  now: Date
  showBranch: boolean
  canModerate: boolean
  onReleased: () => void
}) {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const state = claimState(claim, now)
  const release = useApiMutation(
    () => apiFetch(`/api/projects/${projectId}/dev/claims/${encodeURIComponent(claim.id)}/release`, { method: "POST" }),
    { toastOnSuccess: t.workClaimReleased, toastOnError: () => t.workClaimReleaseFailed, onSuccess: onReleased },
  )

  async function onRelease() {
    const ok = await confirm({
      title: t.workClaimReleaseConfirmTitle,
      message: fillTemplate(t.workClaimReleaseConfirmMessage, { name: claim.user.name }),
      confirmLabel: t.workClaimRelease,
      variant: "warning",
    })
    if (ok) await release.mutate(undefined)
  }

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0" data-claim-row={claim.id} data-claim-state={state}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ClaimAvatar name={claim.user.name} />
          <span className="truncate text-body font-medium text-fg">{claim.user.name}</span>
          {claim.ai && <AiMarker />}
          <ClaimStateBadge state={state} />
        </div>
        <p className="min-w-0 truncate text-caption text-fg-muted">
          {claim.task ? (claim.task.name || "—") : t.workClaimWholePbi}
        </p>
        {showBranch && claim.branch && <BranchName branch={claim.branch} />}
        {showBranch && claim.scope && <ScopeLine scope={claim.scope} scopeCount={claim.scopeCount} />}
        {overlapsOf(claim).map((o) => <OverlapWarning key={o.claimId} overlap={o} />)}
        <dl className="flex flex-wrap gap-x-3 text-caption text-fg-muted">
          <div className="flex gap-1">
            <dt>{t.workClaimSince}:</dt>
            <dd><time dateTime={claim.startedAt}>{formatDateTime(claim.startedAt, language)}</time></dd>
          </div>
          <div className="flex gap-1">
            <dt>{t.workClaimLastSeen}:</dt>
            <dd><time dateTime={claim.heartbeatAt} title={formatDateTime(claim.heartbeatAt, language)}>{formatRelative(claim.heartbeatAt, now, language)}</time></dd>
          </div>
        </dl>
      </div>
      {canModerate && (
        <Button size="sm" variant="secondary" loading={release.isPending} aria-label={fillTemplate(t.workClaimReleaseLabel, { name: claim.user.name })}
          onClick={() => void onRelease()}>
          {t.workClaimRelease}
        </Button>
      )}
    </li>
  )
}

/** "!12 は、宣言した範囲の外のファイルも変えています（3 件）: a、b、c" — the MR as a link. */
function OutsideScopeLine({ mr }: { mr: ScreenOutsideScope }) {
  const { t } = useLanguage()
  const pathList = usePathList()
  const text = fillTemplate(t.workClaimOutsideScope, { mr: `!${mr.ref}`, count: mr.count, paths: pathList(mr.paths, mr.count) })
  // The sync stores https URLs only (git-links safeUrl); anything else is shown without a link.
  if (!/^https:\/\//i.test(mr.url)) return <WarningLine text={text} data-outside-scope={mr.linkId} />
  return (
    <a href={mr.url} target="_blank" rel="noopener noreferrer" className="block rounded-ui-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1">
      <WarningLine text={text} data-outside-scope={mr.linkId} />
    </a>
  )
}
