/**
 * `kanflow/acceptance` (pure): is the work behind a merge request ready to be accepted in Kanflow?
 *
 * The check looks at the live PBIs a merge request is linked to and answers `success` only when every one of them
 *
 * 1. has a task in an open sprint (planning / active / review) — the work is planned, not done on the side; and
 * 2. has at least one acceptance criterion, each with its way of proof decided (確認の方法).
 *
 * Anything else is `action_required`: something for a person to do in Kanflow, never a judgement of the code.
 * A merge request whose PBIs are all deleted is `action_required` too (the link points at nothing live).
 *
 * The summary is what GitStation shows on the merge request. It is plain Japanese text and names PBIs by key only
 * (PBI-12): no title, no criterion text, no person. Callers never pass a confidential PBI (the merge request is not
 * reported at all — acceptance-check.service).
 */

export type AcceptanceConclusion = "success" | "action_required"

/** The project's Git settings as far as the check goes (git_integration). */
export interface AcceptanceSwitch {
  enabled: boolean
  provider: string
  stationAcceptanceCheck: boolean
}

/** The check is reported only while the integration is on, reads GitStation and has the switch on. */
export function acceptanceCheckInEffect(integration: AcceptanceSwitch | null | undefined): boolean {
  return !!integration && integration.enabled && integration.provider === "gitstation" && integration.stationAcceptanceCheck
}

/**
 * A report row with no failure on it (git_acceptance_report): after a success, when a stored failure no longer
 * applies, and when the token or the integration ID changed — what failed with the old one deserves a fresh attempt.
 */
export const ACCEPTANCE_NO_FAILURE = { lastError: null, lastErrorAt: null, retryAt: null, failures: 0, repositoryWide: false } as const

export interface AcceptancePbi {
  displayId: number
  /** A task of the PBI is in an open sprint. */
  inOpenSprint: boolean
  /** The way of proof of every live acceptance criterion (null = not decided). */
  evidenceKinds: readonly (string | null)[]
}

export interface AcceptanceVerdict {
  conclusion: AcceptanceConclusion
  summary: string
}

/** PBI keys listed per line; the rest is counted ("ほか 3 件"). */
export const SUMMARY_KEY_LIMIT = 20

function keyList(pbis: readonly AcceptancePbi[]): string {
  const keys = pbis.map((p) => `PBI-${p.displayId}`)
  const shown = keys.slice(0, SUMMARY_KEY_LIMIT).join(", ")
  return keys.length > SUMMARY_KEY_LIMIT ? `${shown} ほか ${keys.length - SUMMARY_KEY_LIMIT} 件` : shown
}

/** `pbis`: the live (not deleted) PBIs the merge request is linked to. */
export function evaluateAcceptance(pbis: readonly AcceptancePbi[]): AcceptanceVerdict {
  if (pbis.length === 0) return { conclusion: "action_required", summary: "ひも付いた PBI がすべて削除されています。Kanflow でひも付けを確認してください。" }
  const sorted = [...pbis].sort((a, b) => a.displayId - b.displayId)
  const noTask = sorted.filter((p) => !p.inOpenSprint)
  const noCriteria = sorted.filter((p) => p.evidenceKinds.length === 0)
  const undecided = sorted.filter((p) => p.evidenceKinds.some((k) => !k))
  if (noTask.length === 0 && noCriteria.length === 0 && undecided.length === 0) {
    return {
      conclusion: "success",
      summary: `受入の準備ができています（開いているスプリントにタスクがあり、受入基準ごとに確認の方法が決まっています）。\n確認した PBI: ${keyList(sorted)}`,
    }
  }
  const lines = ["受入の準備が足りません。Kanflow で次を整えてください。"]
  if (noTask.length > 0) lines.push(`開いているスプリントにタスクがない: ${keyList(noTask)}`)
  if (noCriteria.length > 0) lines.push(`受入基準がない: ${keyList(noCriteria)}`)
  if (undecided.length > 0) lines.push(`確認の方法が未定の受入基準がある: ${keyList(undecided)}`)
  lines.push(`確認した PBI: ${keyList(sorted)}`)
  return { conclusion: "action_required", summary: lines.join("\n") }
}
