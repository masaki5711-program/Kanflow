import type { Translations } from "@/lib/i18n"
import type { GitMergeStateTranslations } from "@/lib/i18n/git-merge-state"
import type { GitMergeStateDto } from "./git-client-state"

/**
 * N4 / N5 (pure): GitStation's merge status and conflict prediction in the viewer's words — each reason's label and
 * the next step (who acts), plan §5.3. GitStation names the reasons (docs/api/merge-status.md: a fixed order that may
 * grow); an unknown name is shown as blocked with its name and "check it in GitStation". `detail` is GitStation's
 * `key=value` text: a few values are shown (approvals, the check name, the discussion count), never interpreted.
 */

type Key = keyof GitMergeStateTranslations

interface ReasonText {
  label: Key
  /** null = a state to show only (no step would change it from Kanflow's side). */
  next: Key | null
}

const REASONS: Readonly<Record<string, ReasonText>> = {
  not_open: { label: "gitMergeReasonNotOpen", next: null },
  draft: { label: "gitMergeReasonDraft", next: "gitMergeNextUndraft" },
  merge_in_progress: { label: "gitMergeReasonMergeInProgress", next: "gitMergeNextWait" },
  source_branch_missing: { label: "gitMergeReasonSourceBranchMissing", next: null },
  mergeability_unknown: { label: "gitMergeReasonMergeabilityUnknown", next: "gitMergeNextWait" },
  conflict: { label: "gitMergeReasonConflict", next: "gitMergeNextRebase" },
  ff_not_possible: { label: "gitMergeReasonFfNotPossible", next: "gitMergeNextRebase" },
  nothing_to_merge: { label: "gitMergeReasonNothingToMerge", next: null },
  approvals_missing: { label: "gitMergeReasonApprovalsMissing", next: "gitMergeNextApprove" },
  codeowner_approval_missing: { label: "gitMergeReasonCodeownerApprovalMissing", next: "gitMergeNextCodeowner" },
  codeowners_invalid: { label: "gitMergeReasonCodeownersInvalid", next: "gitMergeNextMaintainer" },
  required_check_missing: { label: "gitMergeReasonRequiredCheckMissing", next: "gitMergeNextWaitCheck" },
  required_check_stale: { label: "gitMergeReasonRequiredCheckStale", next: "gitMergeNextWaitCheck" },
  required_check_not_successful: { label: "gitMergeReasonRequiredCheckNotSuccessful", next: "gitMergeNextFixCheck" },
  unresolved_discussions: { label: "gitMergeReasonUnresolvedDiscussions", next: "gitMergeNextResolve" },
  work_item_link_missing: { label: "gitMergeReasonWorkItemLinkMissing", next: "gitMergeNextLinkPbi" },
  config_change_needs_maintainer_approval: { label: "gitMergeReasonConfigChange", next: "gitMergeNextMaintainer" },
  changed_paths_unknown: { label: "gitMergeReasonChangedPathsUnknown", next: "gitMergeNextWait" },
}

/** Kanflow's own check (A1): waiting for it means the PBI's acceptance, which is settled in Kanflow. */
const ACCEPTANCE_CHECK = "kanflow/acceptance"

/**
 * GitStation's `detail` (`key=value key=value …`) as a map. A value runs to the next ` <key>=` (GitStation's own
 * reading rule, merge-status.md); a value that itself contains such a pattern may split — only display suffers.
 */
export function parseDetail(detail: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!detail) return out
  const re = /(?:^|\s)([a-z_]+)=/g
  const marks: { key: string; start: number; valueStart: number }[] = []
  for (let m = re.exec(detail); m; m = re.exec(detail)) marks.push({ key: m[1], start: m.index, valueStart: m.index + m[0].length })
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : detail.length
    if (!(mark.key in out)) out[mark.key] = detail.slice(mark.valueStart, end).trim()
  })
  return out
}

export interface BlockerView {
  reason: string
  label: string
  /** Who acts next and what, or null for a state to show only. */
  next: string | null
  /** A short fact from the detail (approvals m/n, the check, the open discussions), else null. */
  fact: string | null
  /** GitStation's detail as sent, else null. */
  detail: string | null
  /** A reason name Kanflow does not know: its detail is shown as text (the only thing that explains it). */
  unknown: boolean
}

/** Pure: one reason as the viewer reads it. */
export function blockerView(blocker: { reason: string; detail: string | null }, t: Translations): BlockerView {
  const known = REASONS[blocker.reason]
  const d = parseDetail(blocker.detail)
  const label = known ? t[known.label] : t.gitMergeReasonUnknown.replace("{name}", blocker.reason)
  let next = known ? (known.next ? t[known.next] : null) : t.gitMergeNextCheckInGitStation
  let fact: string | null = null
  switch (blocker.reason) {
    case "approvals_missing":
      if (d.required && d.counted) fact = t.gitMergeApprovalsCount.replace("{counted}", d.counted).replace("{required}", d.required)
      break
    case "required_check_missing":
    case "required_check_stale":
    case "required_check_not_successful":
      if (d.name) {
        fact = t.gitMergeCheckName.replace("{name}", d.name)
        if (d.name === ACCEPTANCE_CHECK) next = t.gitMergeNextAcceptance
      }
      break
    case "unresolved_discussions":
      if (d.count) fact = t.gitMergeDiscussionsCount.replace("{count}", d.count)
      break
  }
  return { reason: blocker.reason, label, next, fact, detail: blocker.detail, unknown: !known }
}

export type ConflictNote = "none" | "unchecked" | "partial" | null

export interface ConflictView {
  /** The other MRs: predicted conflicts first, then failed trial merges. */
  peers: { iid: number; text: string; draft: boolean; failed: boolean }[]
  /** What the scan says beside the list (none found / not checked / only some checked); null = nothing to add. */
  note: ConflictNote
  stale: boolean
}

/** Pure: the conflict prediction as the viewer reads it (null when it was not read). */
export function conflictView(conflicts: GitMergeStateDto["conflicts"], t: Translations): ConflictView | null {
  if (!conflicts) return null
  const peers = [...conflicts.peers]
    .sort((a, b) => Number(a.outcome !== "conflict") - Number(b.outcome !== "conflict") || a.iid - b.iid)
    .map((p) => {
      const failed = p.outcome !== "conflict"
      const template = failed ? t.gitConflictPeerFailed : p.truncated ? t.gitConflictPeerMore : p.files === 1 ? t.gitConflictPeerOne : t.gitConflictPeer
      const base = template.replace("{iid}", String(p.iid)).replace("{files}", String(p.files))
      // The draft mark is part of the sentence (a separate glyph would be read out on its own).
      return { iid: p.iid, text: p.draft ? t.gitConflictPeerDraftMark.replace("{text}", base) : base, draft: p.draft, failed }
    })
  // "scanned" with no peer is the only state that says none were found; anything else is not a "no".
  const note: ConflictNote =
    conflicts.status === "incomplete" ? "partial" : conflicts.status !== "scanned" ? "unchecked" : peers.length === 0 ? "none" : null
  return { peers, note, stale: conflicts.stale }
}
