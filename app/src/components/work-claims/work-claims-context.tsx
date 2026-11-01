"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { claimsForCard, indexClaims, overlapsOf, type ClaimIndex } from "./claim-view"
import { ClaimMark, OverlapWarning, useShowBranch } from "./claim-parts"
import { useNow, useWorkClaims } from "./use-work-claims"

interface BoardClaims {
  index: ClaimIndex
  now: Date
}

const WorkClaimsContext = createContext<BoardClaims | null>(null)

/** Marks shown per card before "+n more". */
export const MARKS_PER_CARD = 2

/**
 * 担当中 marks of one sprint's cards: ONE request for every claim of the sprint
 * (no per-card reads); cards render `TaskClaimMarks`, which reads this context, so the
 * memoized cards need no new props. Nothing renders while loading or on error.
 */
export function WorkClaimsProvider({ projectId, sprintId, children }: { projectId: string; sprintId: string; children: ReactNode }) {
  const scope = useMemo(() => ({ sprintId }), [sprintId])
  const { data } = useWorkClaims(projectId, scope)
  const now = useNow()
  const claims = data?.data
  const index = useMemo(() => indexClaims(claims ?? []), [claims])
  const value = useMemo(() => (claims && claims.length > 0 ? { index, now } : null), [claims, index, now])
  return <WorkClaimsContext.Provider value={value}>{children}</WorkClaimsContext.Provider>
}

/**
 * The claims of one task card: its own and its PBI's whole-PBI ones (nothing outside a provider
 * or without claims). Under the marks, one warning line when a claim's 触る範囲 overlaps another
 * active claim (W4: the first overlap; "+n more" for the rest).
 */
export function TaskClaimMarks({ taskId, pbiId }: { taskId: string; pbiId: string }) {
  const board = useContext(WorkClaimsContext)
  const { t } = useLanguage()
  const showBranch = useShowBranch()
  if (!board) return null
  const items = claimsForCard(board.index, taskId, pbiId)
  if (items.length === 0) return null
  const shown = items.slice(0, MARKS_PER_CARD)
  const rest = items.length - shown.length
  const overlaps = dedupeOverlaps(items.flatMap(({ claim }) => overlapsOf(claim)))
  return (
    <>
      <ul aria-label={t.workClaimMarksLabel} className="mt-2 flex flex-wrap items-center gap-1" data-claim-marks="">
        {shown.map(({ claim, wholePbi }) => (
          <ClaimMark key={claim.id} claim={claim} now={board.now} showBranch={showBranch} wholePbi={wholePbi} />
        ))}
        {rest > 0 && <li className="text-caption text-fg-muted">{t.workClaimMore.replace("{count}", String(rest))}</li>}
      </ul>
      {overlaps[0] && (
        <div className="mt-1 space-y-0.5" data-claim-overlaps="">
          <OverlapWarning overlap={overlaps[0]} />
          {overlaps.length > 1 && <p className="text-caption text-warning-strong">{t.workClaimMore.replace("{count}", String(overlaps.length - 1))}</p>}
        </div>
      )}
    </>
  )
}

/** One warning per other claim (two claims of a card may overlap the same third one). */
function dedupeOverlaps<T extends { claimId: string }>(overlaps: readonly T[]): T[] {
  const seen = new Set<string>()
  return overlaps.filter((o) => !seen.has(o.claimId) && (seen.add(o.claimId), true))
}
