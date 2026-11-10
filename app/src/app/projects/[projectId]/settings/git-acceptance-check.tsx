"use client"

import { useId, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { syncMessageText } from "@/lib/git/sync-messages"
import type { GitSettingsDto } from "../git/git-labels"
import { GitTime } from "../git/repo-sync-status"

interface Props {
  checked: boolean
  /** The latest report that failed and has not succeeded since (null = none). */
  error: GitSettingsDto["acceptanceCheckError"]
  disabled: boolean
  onChange: (next: boolean) => void
}

/**
 * GitStation only: the switch that makes Kanflow report the check
 * `kanflow/acceptance` on open merge requests, and — while it is on — the
 * last report GitStation did not take (the same line as a repository's sync error).
 */
export function GitAcceptanceCheck({ checked, error, disabled, onChange }: Props) {
  const { t } = useLanguage()
  const helpId = useId()
  const errorId = useId()
  const [now] = useState(() => new Date())
  // lib/git/__tests__/sync-messages.test.ts holds every language to exactly one {time} in this text.
  const [before, after] = t.gitSetAcceptanceCheckError.split("{time}")

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3 text-body font-medium text-fg">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          className="h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
        {t.gitSetAcceptanceCheck}
      </label>
      <p id={helpId} className="pl-8 text-caption text-fg-muted">
        {t.gitSetAcceptanceCheckHelp}
      </p>
      {error && (
        <div id={errorId} className="flex min-w-0 items-start gap-1.5 pl-8 text-caption text-danger-strong">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 break-words">
            <span className="font-medium">
              {error.at ? (
                <>
                  {before}
                  <GitTime iso={error.at} now={now} />
                  {after}
                </>
              ) : (
                t.gitSetAcceptanceCheckErrorNoTime
              )}
            </span>{" "}
            {/* Known stored messages in the viewer's language; anything else as stored. */}
            {syncMessageText(error.message, t)}
          </p>
        </div>
      )}
    </div>
  )
}
