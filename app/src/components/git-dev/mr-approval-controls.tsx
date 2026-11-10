"use client"

import { useEffect, useId, useRef, useState } from "react"
import { CheckCircle2, ExternalLink, Undo2 } from "lucide-react"
import { apiFetch, isApiError } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"
import { Badge, Button, buttonClasses, useToast, VisuallyHidden } from "@/components/ui"
import { gitApiBase } from "./git-client-state"
import type { MrApprovalItem } from "./use-mr-approvals"

interface Started {
  attemptId: string
  confirmUrl: string
  intent: "approve" | "unapprove"
}

interface Props {
  projectId: string
  item: MrApprovalItem
  onChanged: () => void
  /**
   * The approval was sent (outcome approved / withdrawn / unchanged). Return true when the caller moves focus itself
   * (e.g. the row is about to leave a list); otherwise focus goes back to this row's button.
   */
  onCompleted?: (outcome: "approved" | "withdrawn" | "unchanged") => boolean
}

/** GitStation's refusal reason as one line (never its raw name). */
function reasonText(reason: string | null, t: ReturnType<typeof useLanguage>["t"]): string {
  if (reason === "self_approval") return t.gitDevApproveReasonSelf
  if (reason === "required_role") return t.gitDevApproveReasonRole
  return t.gitDevApproveReasonOther
}

/**
 * 承認する / 承認を取り消す of one GitStation merge request (plan 11 K4, F-36). The button opens nothing by itself:
 * Kanflow first asks GitStation (as the person) and makes the confirmation, then shows a link to GitStation's
 * confirmation page (a new window — GitStation refuses frames) and 確認しました, which sends the approval once the
 * person pressed there. A refusal shows its reason instead of a button.
 */
export function MrApprovalControls({ projectId, item, onChanged, onCompleted }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const groupId = useId()
  const helpId = useId()
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState<Started | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  /** Focus target when the button is gone after the change (approved → withdraw, or the MR left the list). */
  const rowRef = useRef<HTMLDivElement>(null)

  // The confirmation appears in place of the button: focus its first step.
  useEffect(() => {
    if (started) linkRef.current?.focus()
  }, [started])

  const intent: "approve" | "unapprove" | null = item.approvedByMe ? (item.canUnapprove.allowed ? "unapprove" : null) : item.canApprove.allowed ? "approve" : null
  const refusal = item.approvedByMe ? item.canUnapprove : item.canApprove

  async function start(which: "approve" | "unapprove") {
    setBusy(true)
    setNote(null)
    try {
      const res = await apiFetch<{ attemptId: string; confirmUrl: string }>(`${gitApiBase(projectId)}/mr-approvals/start`, { method: "POST", json: { linkId: item.linkId, intent: which } })
      setStarted({ attemptId: res.attemptId, confirmUrl: res.confirmUrl, intent: which })
    } catch (e) {
      toast.error(`${t.gitDevApproveStartFailed}: ${localizeApiError(e, t)}`)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  function close(refocus = true) {
    setStarted(null)
    setNote(null)
    // Back to where the person was (the row itself when its button is gone).
    if (refocus) requestAnimationFrame(() => (actionRef.current ?? rowRef.current)?.focus())
  }

  async function complete() {
    if (!started || busy) return
    setBusy(true)
    // Cleared first so that the same note, given again, is announced again.
    setNote(null)
    try {
      const res = await apiFetch<{ outcome: string }>(`${gitApiBase(projectId)}/mr-approvals/${encodeURIComponent(started.attemptId)}/complete`, { method: "POST" })
      const outcome = res.outcome === "approved" || res.outcome === "withdrawn" ? res.outcome : "unchanged"
      toast.success(outcome === "approved" ? t.gitDevApproved : outcome === "withdrawn" ? t.gitDevUnapproved : t.gitDevApproveUnchanged)
      const focusHandled = onCompleted?.(outcome) === true
      close(!focusHandled)
      onChanged()
    } catch (e) {
      // Not pressed in GitStation yet: keep the confirmation open and say what to do.
      // A network failure before any answer also keeps it open (the server may still hold the attempt).
      if (!isApiError(e) || e.code === "GIT_APPROVAL_NOT_CONFIRMED" || e.code === "GIT_APPROVAL_BUSY") {
        setNote(localizeApiError(e, t))
      } else {
        toast.error(`${t.gitDevApproveFailed}: ${localizeApiError(e, t)}`)
        close()
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rowRef} tabIndex={-1} className="mt-1 space-y-1 outline-none" data-git-approval={item.iid}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted">
        {item.approvals !== null && <Badge tone="neutral" size="sm">{t.gitDevApprovals.replace("{count}", String(item.approvals))}</Badge>}
        {item.approvedByMe && (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" />
            {t.gitDevApprovedByMe}
          </span>
        )}
        {!started && intent && (
          <Button ref={actionRef} size="sm" variant={intent === "approve" ? "secondary" : "ghost"} loading={busy}
            leftIcon={intent === "approve" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
            aria-label={(intent === "approve" ? t.gitDevApproveLabel : t.gitDevUnapproveLabel).replace("{iid}", String(item.iid))}
            onClick={() => void start(intent)}>
            {intent === "approve" ? t.gitDevApprove : t.gitDevUnapprove}
          </Button>
        )}
        {!started && !intent && refusal.reason && <span data-git-approval-refused={refusal.reason}>{reasonText(refusal.reason, t)}</span>}
      </div>
      {started && (
        <div role="group" aria-labelledby={groupId} className="space-y-1.5 rounded-ui-sm border border-border bg-surface px-2 py-1.5">
          <p id={groupId} className="text-caption font-medium text-fg">{t.gitDevConfirmGroup.replace("{iid}", String(item.iid))}</p>
          <p id={helpId} className="text-caption text-fg-muted">{t.gitDevConfirmHelp}</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* A user gesture on a real link: no pop-up blocker, and no opener for GitStation's page. */}
            <a ref={linkRef} href={started.confirmUrl} aria-describedby={helpId} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              {t.gitDevConfirmOpen}{" "}
              <VisuallyHidden>{t.gitDevConfirmNewWindow}</VisuallyHidden>
            </a>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void complete()}>{t.gitDevConfirmDone}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => close()}>{t.gitDevConfirmCancel}</Button>
          </div>
          <p role="status" className="text-caption text-fg">{note}</p>
        </div>
      )}
    </div>
  )
}
