import type { BadgeTone } from "@/components/ui"
import { isApiError } from "@/hooks"
import type { Translations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import type { GitOverviewDto } from "@/services/git/git.service"

/**
 * Pure label / tone helpers shared by the settings section and the Git page.
 * Wire types are re-exported from the service as type-only imports (no server code in the bundle).
 */
export type { GitLinkDto, GitOverviewDto, GitRepositoryDto, GitSettingsDto } from "@/services/git/git.service"

/** Merge request state → Japanese-first label and badge tone (unknown states pass through). */
export function mrStateLabel(state: string | null, t: Translations): { label: string; tone: BadgeTone } | null {
  switch (state) {
    case null:
      return null
    case "opened":
      return { label: t.gitMrOpened, tone: "primary" }
    case "merged":
      return { label: t.gitMrMerged, tone: "success" }
    case "closed":
      return { label: t.gitMrClosed, tone: "neutral" }
    case "locked":
      return { label: t.gitMrLocked, tone: "warning" }
    default:
      return { label: state, tone: "neutral" }
  }
}

const PENDING_PIPELINES = new Set(["pending", "created", "waiting_for_resource", "preparing", "scheduled"])

/** GitLab pipeline status → label and tone; the dot never carries meaning alone (text always shown). */
export function pipelineLabel(status: string | null, t: Translations): { label: string; tone: BadgeTone } | null {
  if (!status) return null
  if (status === "success") return { label: t.gitPipelineSuccess, tone: "success" }
  if (status === "failed") return { label: t.gitPipelineFailed, tone: "danger" }
  if (status === "running") return { label: t.gitPipelineRunning, tone: "info" }
  if (PENDING_PIPELINES.has(status)) return { label: t.gitPipelinePending, tone: "warning" }
  if (status === "canceled" || status === "canceling") return { label: t.gitPipelineCanceled, tone: "neutral" }
  if (status === "skipped") return { label: t.gitPipelineSkipped, tone: "neutral" }
  if (status === "manual") return { label: t.gitPipelineManual, tone: "warning" }
  return { label: fillTemplate(t.gitPipelineOther, { status }), tone: "neutral" }
}

export function kindLabel(kind: string, t: Translations): string {
  if (kind === "mr") return t.gitKindMr
  if (kind === "branch") return t.gitKindBranch
  return t.gitKindCommit
}

/**
 * The server's own explanation (connection test / repository refusals are
 * written for the user), else the fallback. `ApiError.message` would be the
 * generic localized text of the error code, which hides the actual reason.
 */
export function serverErrorText(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    const body = err.body as { error?: unknown } | undefined
    if (typeof body?.error === "string" && body.error.trim() !== "") return body.error
  }
  return fallback
}

/** Minutes for "about every N minutes" (at least 1). */
export function pollMinutes(pollIntervalSec: number): number {
  return Math.max(1, Math.round(pollIntervalSec / 60))
}

/** Response → overview; a malformed body reads as "off" (never a half-drawn Git page). */
export function toGitOverview(raw: unknown): GitOverviewDto {
  const r = raw && typeof raw === "object" ? (raw as Partial<GitOverviewDto>) : {}
  return {
    enabled: r.enabled === true,
    repositories: Array.isArray(r.repositories) ? r.repositories : [],
    recent: Array.isArray(r.recent) ? r.recent : [],
    pollIntervalSec: typeof r.pollIntervalSec === "number" ? r.pollIntervalSec : 180,
  }
}
