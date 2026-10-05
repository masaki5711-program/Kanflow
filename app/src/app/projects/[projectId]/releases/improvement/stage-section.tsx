"use client"

import { Flag } from "lucide-react"
import { cn } from "@/components/ui"
import { KAIZEN_STAGES, type KaizenStage } from "@/lib/improvement/constants"
import { stageLabel } from "@/lib/improvement/labels"
import { useLanguage } from "@/lib/language-context"
import { SectionFrame } from "./section-frame"
import { stageStyle } from "./stage-style"

interface Props {
  stage: string
  /** 標準書リンク entered (saved or in the form). */
  hasStandardLink: boolean
  /** At least one 定着確認 recorded as 維持できている. */
  hasSustainedCheck: boolean
  canManage: boolean
  saving: boolean
  onSelect: (stage: KaizenStage) => void
}

/** 段階: one button per stage; 標準化済み / 定着確認済み stay disabled (with the reason) until their evidence exists. */
export function StageSection({ stage, hasStandardLink, hasSustainedCheck, canManage, saving, onSelect }: Props) {
  const { t } = useLanguage()
  const blockedReason = (s: KaizenStage): string | null => {
    if (s === stage) return null
    if (s === "standardized" && !hasStandardLink) return t.kzStageNeedsLink
    if (s === "sustained" && !hasSustainedCheck) return t.kzStageNeedsCheck
    return null
  }

  return (
    <SectionFrame title={t.kzSectionStage} icon={<Flag aria-hidden="true" className="h-5 w-5 text-primary" />}>
      <div role="group" aria-label={t.kzStageChange} className="flex flex-wrap gap-2">
        {KAIZEN_STAGES.map((s) => {
          const on = s === stage
          const reason = blockedReason(s)
          const reasonId = reason ? `stage-reason-${s}` : undefined
          return (
            <span key={s} className="flex flex-col">
              <button
                type="button"
                aria-pressed={on}
                aria-describedby={reasonId}
                disabled={!canManage || saving || reason !== null}
                onClick={() => !on && onSelect(s)}
                className={cn(
                  "min-h-11 rounded-ui-md border px-3 text-body font-medium transition-colors disabled:cursor-not-allowed",
                  on ? `${stageStyle(s).chip} border-transparent ring-2 ring-primary` : "border-border bg-surface text-fg hover:border-border-strong",
                  !on && reason && "opacity-60",
                )}
              >
                {stageLabel(s, t)}
              </button>
              {reason && canManage && (
                <span id={reasonId} className="mt-0.5 max-w-40 text-caption text-fg-muted">{reason}</span>
              )}
            </span>
          )
        })}
      </div>
    </SectionFrame>
  )
}
