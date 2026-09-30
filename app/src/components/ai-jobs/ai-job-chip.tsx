"use client"

import { Badge, Spinner } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { describeJobStatus, isJobActive, type AiJobView } from "./ai-job-client"

/** Status chip of a background AI report job (announced politely to screen readers). */
export function AiJobChip({ job, className }: { job: Pick<AiJobView, "status" | "progress">; className?: string }) {
  const { t } = useLanguage()
  const { label, tone } = describeJobStatus(job, t)
  return (
    <span role="status" className={className}>
      <Badge tone={tone} className="inline-flex items-center gap-1.5">
        {isJobActive(job) && <Spinner size="xs" />}
        {label}
      </Badge>
    </span>
  )
}
