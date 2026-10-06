/**
 * Security regression net for every project-scoped route handler.
 *
 * The REAL gate (`requireProject` → `auth()` + `prisma.projectMember` /
 * `prisma.projectSection` lookups) runs; only its leaf dependencies are faked.
 * Every service / AI / file module a route imports is replaced by an inert
 * recording fake so we can prove that a refused request never reaches it.
 *
 *   no session         → 401
 *   non-member         → 404 (project existence is not leaked)
 *   unrelated sec. mgr → 404
 *   trashed project    → 404 (even for a PO member)
 *
 * A filesystem sweep asserts the table lists every `route.ts` under
 * `projects/[projectId]`, so a new route cannot silently skip this test.
 */
import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => {
  const AUTHZ_LOOKUPS = new Set(["projectMember.findFirst", "projectSection.findFirst", "project.findFirst"])
  const auth = vi.fn()
  /** Every fake function created for mocked modules, keyed "module:export". */
  const spies = new Map<string, ReturnType<typeof vi.fn>>()

  function spyFor(key: string) {
    let fn = spies.get(key)
    if (!fn) {
      fn = vi.fn(async () => {
        throw new Error(`unexpected call to ${key}`)
      })
      spies.set(key, fn)
    }
    return fn
  }

  /** Module namespace whose every export is a recording spy. */
  function inertModule(name: string, real: Record<string, unknown> = {}) {
    return new Proxy(real, {
      get(target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "__esModule") return undefined
        if (prop in target) return target[prop]
        return spyFor(`${name}:${prop}`)
      },
      has: () => true,
    })
  }

  /** prisma.<model>.<method> → recording spy; authz lookups are driven by the test. */
  const prisma = new Proxy(
    {},
    {
      get(_t, model) {
        if (typeof model !== "string" || model === "then") return undefined
        if (model.startsWith("$")) return spyFor(`prisma:${model}`)
        return new Proxy(
          {},
          {
            get(_t2, method) {
              if (typeof method !== "string" || method === "then") return undefined
              return spyFor(`prisma:${model}.${method}`)
            },
          }
        )
      },
    }
  )

  const noopLog = { debug() {}, info() {}, warn() {}, error() {}, child: () => noopLog }

  return { AUTHZ_LOOKUPS, auth, spies, spyFor, inertModule, prisma, noopLog }
})

vi.mock("@/lib/auth", () => ({ auth: () => h.auth() }))
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/lib/logger", () => ({ logger: h.noopLog }))

// Services
vi.mock("@/services/projects/projects.service", () => h.inertModule("projects.service"))
vi.mock("@/services/backlog/backlog.service", () => h.inertModule("backlog.service"))
vi.mock("@/services/backlog/backlog.bulk", () => h.inertModule("backlog.bulk"))
vi.mock("@/services/backlog/backlog.dependencies", () => h.inertModule("backlog.dependencies"))
vi.mock("@/services/backlog/backlog.attachments", () => h.inertModule("backlog.attachments"))
vi.mock("@/services/updates/updates.service", () => h.inertModule("updates.service"))
vi.mock("@/services/team-chat/team-chat.service", () => h.inertModule("team-chat.service"))
vi.mock("@/services/sprints/sprints.service", () => h.inertModule("sprints.service"))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => h.inertModule("sprint-backlog.service"))
vi.mock("@/services/releases/releases.service", () => h.inertModule("releases.service"))
vi.mock("@/services/improvements/improvements.service", () => h.inertModule("improvements.service"))
vi.mock("@/services/improvements/improvements.rollouts", () => h.inertModule("improvements.rollouts"))
vi.mock("@/services/improvements/improvements.checks", () => h.inertModule("improvements.checks"))
vi.mock("@/services/improvements/improvements.photos", () => h.inertModule("improvements.photos"))
vi.mock("@/services/excel/improvement.export", () => h.inertModule("improvement.export"))
vi.mock("@/services/milestones/milestones.service", () => h.inertModule("milestones.service"))
vi.mock("@/services/milestones/milestones.checks", () => h.inertModule("milestones.checks"))
vi.mock("@/services/milestones/milestones.punch", () => h.inertModule("milestones.punch"))
vi.mock("@/services/milestones/milestones.documents", () => h.inertModule("milestones.documents"))
vi.mock("@/services/milestones/milestones.budget", () => h.inertModule("milestones.budget"))
vi.mock("@/services/excel/milestone.export", () => h.inertModule("milestone.export"))
vi.mock("@/services/plan/plan.service", () => h.inertModule("plan.service"))
vi.mock("@/services/plan/plan.links", () => h.inertModule("plan.links"))
vi.mock("@/services/plan/plan.schedule", () => h.inertModule("plan.schedule"))
vi.mock("@/services/plan/plan.export", () => h.inertModule("plan.export", { XLSX_MIME: "x", contentDisposition: () => "" }))
vi.mock("@/services/plan-templates/plan-templates.apply", () => h.inertModule("plan-templates.apply"))
vi.mock("@/services/attachments/attachments.service", () => h.inertModule("attachments.service"))
vi.mock("@/services/icebox/icebox.service", () => h.inertModule("icebox.service"))
vi.mock("@/services/members/members.service", () => h.inertModule("members.service"))
vi.mock("@/services/goals/goals.service", () => h.inertModule("goals.service"))
vi.mock("@/services/events/events.service", () => h.inertModule("events.service"))
vi.mock("@/services/daily-scrums/daily-scrums.service", () => h.inertModule("daily-scrums.service"))
vi.mock("@/services/ai-reports/ai-reports.service", () => h.inertModule("ai-reports.service"))
vi.mock("@/services/activity/activity.service", () => h.inertModule("activity.service"))
vi.mock("@/services/comments/comments.service", () => h.inertModule("comments.service"))
vi.mock("@/services/trash/trash.service", () => h.inertModule("trash.service"))
vi.mock("@/services/chat-threads/chat-threads.service", () => h.inertModule("chat-threads.service"))
vi.mock("@/services/ai-jobs/ai-jobs.service", () => h.inertModule("ai-jobs.service"))
vi.mock("@/services/surveillance-settings/surveillance-settings.service", () => h.inertModule("surveillance-settings.service"))
vi.mock("@/services/git/git.service", () => h.inertModule("git.service"))
vi.mock("@/services/git/git-sync", () => h.inertModule("git-sync"))
vi.mock("@/services/git/repo-index-runner", () => h.inertModule("repo-index-runner"))
vi.mock("@/services/git/repo-knowledge.service", () => h.inertModule("repo-knowledge.service"))
vi.mock("@/services/git/repo-search", () => h.inertModule("repo-search"))
vi.mock("@/lib/repo-knowledge-tools", () => h.inertModule("repo-knowledge-tools", { REPO_KNOWLEDGE_TOOL_DEFS: [], REPO_KNOWLEDGE_GUIDE: { ja: "", en: "", id: "" } }))

// AI / file / network modules
vi.mock("@/lib/ollama", () => h.inertModule("ollama"))
vi.mock("@/lib/ollama/prime", () => h.inertModule("ollama/prime"))
vi.mock("@/lib/ai-analysis", () => h.inertModule("ai-analysis"))
vi.mock("@/lib/ai-monitor", () => h.inertModule("ai-monitor"))
vi.mock("@/lib/project-context", () => h.inertModule("project-context", { CHAT_SYSTEM_PROMPT: "" }))
vi.mock("@/lib/chat-tools", () => h.inertModule("chat-tools", { CHAT_TOOLS: [] }))
vi.mock("@/lib/analysis-tools", () => h.inertModule("analysis-tools", { analysisHandlers: {} }))
vi.mock("@/lib/attachment-extractor", () => h.inertModule("attachment-extractor"))
vi.mock("@/lib/collabora", () => h.inertModule("collabora"))
vi.mock("@/lib/wopi-token", () => h.inertModule("wopi-token"))

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
type RouteModule = Record<string, unknown>

interface RouteCase {
  /** Path relative to `src/app/api/projects/[projectId]` (for the fs sweep). */
  file: string
  load: () => Promise<RouteModule>
  params: Record<string, string>
}

const P = "proj-1"
const ROUTES: RouteCase[] = [
  { file: "route.ts", load: () => import("@/app/api/projects/[projectId]/route"), params: {} },
  { file: "activity/route.ts", load: () => import("@/app/api/projects/[projectId]/activity/route"), params: {} },
  { file: "activity/[entityType]/[entityId]/route.ts", load: () => import("@/app/api/projects/[projectId]/activity/[entityType]/[entityId]/route"), params: { entityType: "pbi", entityId: "pbi-1" } },
  { file: "comments/route.ts", load: () => import("@/app/api/projects/[projectId]/comments/route"), params: {} },
  { file: "comments/counts/route.ts", load: () => import("@/app/api/projects/[projectId]/comments/counts/route"), params: {} },
  { file: "comments/read/route.ts", load: () => import("@/app/api/projects/[projectId]/comments/read/route"), params: {} },
  { file: "comments/[commentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/comments/[commentId]/route"), params: { commentId: "c-1" } },
  { file: "ai-reports/route.ts", load: () => import("@/app/api/projects/[projectId]/ai-reports/route"), params: {} },
  { file: "ai/generate-pbi-field/route.ts", load: () => import("@/app/api/projects/[projectId]/ai/generate-pbi-field/route"), params: {} },
  { file: "ai/progress-report/route.ts", load: () => import("@/app/api/projects/[projectId]/ai/progress-report/route"), params: {} },
  { file: "ai/jobs/route.ts", load: () => import("@/app/api/projects/[projectId]/ai/jobs/route"), params: {} },
  { file: "ai/jobs/[jobId]/route.ts", load: () => import("@/app/api/projects/[projectId]/ai/jobs/[jobId]/route"), params: { jobId: "job-1" } },
  { file: "surveillance-settings/route.ts", load: () => import("@/app/api/projects/[projectId]/surveillance-settings/route"), params: {} },
  { file: "attachments/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/route"), params: {} },
  { file: "attachments/links/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/links/route"), params: {} },
  { file: "attachments/[attachmentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/[attachmentId]/route"), params: { attachmentId: "att-1" } },
  { file: "attachments/[attachmentId]/editor-config/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/[attachmentId]/editor-config/route"), params: { attachmentId: "att-1" } },
  { file: "backlog/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/route"), params: {} },
  { file: "backlog/reorder/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/reorder/route"), params: {} },
  { file: "backlog/bulk/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/bulk/route"), params: {} },
  { file: "backlog/dependencies/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/dependencies/route"), params: {} },
  { file: "backlog/dependencies/[dependencyId]/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/dependencies/[dependencyId]/route"), params: { dependencyId: "dep-1" } },
  { file: "backlog/export/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/export/route"), params: {} },
  { file: "backlog/import/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/import/route"), params: {} },
  { file: "backlog/import/template/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/import/template/route"), params: {} },
  { file: "backlog/[itemId]/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/[itemId]/route"), params: { itemId: "pbi-1" } },
  { file: "backlog/[itemId]/ai/invest-review/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/[itemId]/ai/invest-review/route"), params: { itemId: "pbi-1" } },
  { file: "backlog/[itemId]/attachments/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/[itemId]/attachments/route"), params: { itemId: "pbi-1" } },
  { file: "backlog/[itemId]/attachments/[attachmentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/[itemId]/attachments/[attachmentId]/route"), params: { itemId: "pbi-1", attachmentId: "att-1" } },
  { file: "burndown/route.ts", load: () => import("@/app/api/projects/[projectId]/burndown/route"), params: {} },
  { file: "chat/route.ts", load: () => import("@/app/api/projects/[projectId]/chat/route"), params: {} },
  { file: "chat/threads/route.ts", load: () => import("@/app/api/projects/[projectId]/chat/threads/route"), params: {} },
  { file: "chat/threads/[threadId]/route.ts", load: () => import("@/app/api/projects/[projectId]/chat/threads/[threadId]/route"), params: { threadId: "th-1" } },
  { file: "chat/threads/[threadId]/proposals/[proposalId]/route.ts", load: () => import("@/app/api/projects/[projectId]/chat/threads/[threadId]/proposals/[proposalId]/route"), params: { threadId: "th-1", proposalId: "prop_1" } },
  { file: "events/route.ts", load: () => import("@/app/api/projects/[projectId]/events/route"), params: {} },
  { file: "events/[eventId]/route.ts", load: () => import("@/app/api/projects/[projectId]/events/[eventId]/route"), params: { eventId: "ev-1" } },
  { file: "favorite/route.ts", load: () => import("@/app/api/projects/[projectId]/favorite/route"), params: {} },
  { file: "folders/route.ts", load: () => import("@/app/api/projects/[projectId]/folders/route"), params: {} },
  { file: "git/route.ts", load: () => import("@/app/api/projects/[projectId]/git/route"), params: {} },
  { file: "git/knowledge/route.ts", load: () => import("@/app/api/projects/[projectId]/git/knowledge/route"), params: {} },
  { file: "git/links/route.ts", load: () => import("@/app/api/projects/[projectId]/git/links/route"), params: {} },
  { file: "git/overview/route.ts", load: () => import("@/app/api/projects/[projectId]/git/overview/route"), params: {} },
  { file: "git/repositories/route.ts", load: () => import("@/app/api/projects/[projectId]/git/repositories/route"), params: {} },
  { file: "git/repositories/[repoId]/route.ts", load: () => import("@/app/api/projects/[projectId]/git/repositories/[repoId]/route"), params: { repoId: "repo-1" } },
  { file: "git/repositories/[repoId]/index/route.ts", load: () => import("@/app/api/projects/[projectId]/git/repositories/[repoId]/index/route"), params: { repoId: "repo-1" } },
  { file: "git/summary/route.ts", load: () => import("@/app/api/projects/[projectId]/git/summary/route"), params: {} },
  { file: "git/sync/route.ts", load: () => import("@/app/api/projects/[projectId]/git/sync/route"), params: {} },
  { file: "git/test/route.ts", load: () => import("@/app/api/projects/[projectId]/git/test/route"), params: {} },
  { file: "folders/[folderId]/route.ts", load: () => import("@/app/api/projects/[projectId]/folders/[folderId]/route"), params: { folderId: "f-1" } },
  { file: "goals/route.ts", load: () => import("@/app/api/projects/[projectId]/goals/route"), params: {} },
  { file: "goals/[goalId]/route.ts", load: () => import("@/app/api/projects/[projectId]/goals/[goalId]/route"), params: { goalId: "g-1" } },
  { file: "icebox/export/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/export/route"), params: {} },
  { file: "icebox/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/route"), params: {} },
  { file: "icebox/[itemId]/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/route"), params: { itemId: "ice-1" } },
  { file: "icebox/[itemId]/ai/generate-pbi-draft/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/ai/generate-pbi-draft/route"), params: { itemId: "ice-1" } },
  { file: "icebox/[itemId]/attachments/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/attachments/route"), params: { itemId: "ice-1" } },
  { file: "icebox/[itemId]/attachments/[attachmentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/attachments/[attachmentId]/route"), params: { itemId: "ice-1", attachmentId: "att-1" } },
  { file: "members/route.ts", load: () => import("@/app/api/projects/[projectId]/members/route"), params: {} },
  { file: "members/[memberId]/route.ts", load: () => import("@/app/api/projects/[projectId]/members/[memberId]/route"), params: { memberId: "m-1" } },
  { file: "plan/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/route"), params: {} },
  { file: "plan/reorder/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/reorder/route"), params: {} },
  { file: "plan/[itemId]/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/[itemId]/route"), params: { itemId: "plan-1" } },
  { file: "plan/[itemId]/links/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/[itemId]/links/route"), params: { itemId: "plan-1" } },
  { file: "plan/linkable-pbis/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/linkable-pbis/route"), params: {} },
  { file: "plan/baseline/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/baseline/route"), params: {} },
  { file: "plan/dependencies/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/dependencies/route"), params: {} },
  { file: "plan/dependencies/[dependencyId]/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/dependencies/[dependencyId]/route"), params: { dependencyId: "dep-1" } },
  { file: "plan/export/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/export/route"), params: {} },
  { file: "plan/schedule-from/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/schedule-from/route"), params: {} },
  { file: "plan/templates/apply/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/templates/apply/route"), params: {} },
  { file: "plan/templates/applications/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/templates/applications/route"), params: {} },
  { file: "plan/templates/save/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/templates/save/route"), params: {} },
  { file: "releases/route.ts", load: () => import("@/app/api/projects/[projectId]/releases/route"), params: {} },
  { file: "releases/import/route.ts", load: () => import("@/app/api/projects/[projectId]/releases/import/route"), params: {} },
  { file: "releases/[id]/route.ts", load: () => import("@/app/api/projects/[projectId]/releases/[id]/route"), params: { id: "rel-1" } },
  { file: "improvements/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/route"), params: {} },
  { file: "improvements/summary/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/summary/route"), params: {} },
  { file: "improvements/export/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/export/route"), params: {} },
  { file: "improvements/[id]/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/route"), params: { id: "rel-1" } },
  { file: "improvements/[id]/rollouts/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/rollouts/route"), params: { id: "rel-1" } },
  { file: "improvements/[id]/rollouts/reorder/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/rollouts/reorder/route"), params: { id: "rel-1" } },
  { file: "improvements/[id]/rollouts/[rolloutId]/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/rollouts/[rolloutId]/route"), params: { id: "rel-1", rolloutId: "ro-1" } },
  { file: "improvements/[id]/checks/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/checks/route"), params: { id: "rel-1" } },
  { file: "improvements/[id]/checks/[checkId]/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/checks/[checkId]/route"), params: { id: "rel-1", checkId: "chk-1" } },
  { file: "improvements/[id]/photos/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/photos/route"), params: { id: "rel-1" } },
  { file: "improvements/[id]/photos/[photoId]/route.ts", load: () => import("@/app/api/projects/[projectId]/improvements/[id]/photos/[photoId]/route"), params: { id: "rel-1", photoId: "ph-1" } },
  { file: "milestones/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/route"), params: {} },
  { file: "milestones/settings/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/settings/route"), params: {} },
  { file: "milestones/export/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/export/route"), params: {} },
  { file: "milestones/stages/[planItemId]/checklist/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/stages/[planItemId]/checklist/route"), params: { planItemId: "pl-1" } },
  { file: "milestones/checks/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/checks/route"), params: {} },
  { file: "milestones/checks/[checkId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/checks/[checkId]/route"), params: { checkId: "ac-1" } },
  { file: "milestones/punch/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/punch/route"), params: {} },
  { file: "milestones/punch/[punchId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/punch/[punchId]/route"), params: { punchId: "pu-1" } },
  { file: "milestones/punch/[punchId]/photos/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/punch/[punchId]/photos/route"), params: { punchId: "pu-1" } },
  { file: "milestones/punch/[punchId]/photos/[photoId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/punch/[punchId]/photos/[photoId]/route"), params: { punchId: "pu-1", photoId: "pp-1" } },
  { file: "milestones/documents/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/documents/route"), params: {} },
  { file: "milestones/documents/[documentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/documents/[documentId]/route"), params: { documentId: "hd-1" } },
  { file: "milestones/documents/[documentId]/files/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/documents/[documentId]/files/route"), params: { documentId: "hd-1" } },
  { file: "milestones/documents/[documentId]/files/[fileId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/documents/[documentId]/files/[fileId]/route"), params: { documentId: "hd-1", fileId: "hf-1" } },
  { file: "milestones/budget/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/budget/route"), params: {} },
  { file: "milestones/budget/[lineId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/budget/[lineId]/route"), params: { lineId: "bl-1" } },
  { file: "milestones/metrics/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/metrics/route"), params: {} },
  { file: "milestones/metrics/[metricId]/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/metrics/[metricId]/route"), params: { metricId: "mm-1" } },
  { file: "milestones/metrics/[metricId]/points/route.ts", load: () => import("@/app/api/projects/[projectId]/milestones/metrics/[metricId]/points/route"), params: { metricId: "mm-1" } },
  { file: "sprints/export/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/export/route"), params: {} },
  { file: "sprints/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/route"), params: {} },
  { file: "sprints/[sprintId]/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/ai/retro-synthesis/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/ai/retro-synthesis/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/daily-scrums/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/daily-scrums/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/daily-scrums/[noteId]/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/daily-scrums/[noteId]/route"), params: { sprintId: "s-1", noteId: "n-1" } },
  { file: "sprints/[sprintId]/pbis/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/pbis/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/tasks/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/tasks/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/tasks/[taskId]/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/tasks/[taskId]/route"), params: { sprintId: "s-1", taskId: "t-1" } },
  { file: "talk/attachments/[attachmentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/talk/attachments/[attachmentId]/route"), params: { attachmentId: "tca-1" } },
  { file: "talk/messages/route.ts", load: () => import("@/app/api/projects/[projectId]/talk/messages/route"), params: {} },
  { file: "talk/messages/[messageId]/route.ts", load: () => import("@/app/api/projects/[projectId]/talk/messages/[messageId]/route"), params: { messageId: "msg-1" } },
  { file: "talk/read/route.ts", load: () => import("@/app/api/projects/[projectId]/talk/read/route"), params: {} },
  { file: "updates/route.ts", load: () => import("@/app/api/projects/[projectId]/updates/route"), params: {} },
  { file: "updates/seen/route.ts", load: () => import("@/app/api/projects/[projectId]/updates/seen/route"), params: {} },
  { file: "trash/route.ts", load: () => import("@/app/api/projects/[projectId]/trash/route"), params: {} },
  { file: "trash/[entityType]/[id]/route.ts", load: () => import("@/app/api/projects/[projectId]/trash/[entityType]/[id]/route"), params: { entityType: "backlog_item", id: "pbi-1" } },
  { file: "trash/[entityType]/[id]/restore/route.ts", load: () => import("@/app/api/projects/[projectId]/trash/[entityType]/[id]/restore/route"), params: { entityType: "backlog_item", id: "pbi-1" } },
  { file: "velocity/route.ts", load: () => import("@/app/api/projects/[projectId]/velocity/route"), params: {} },
]

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

interface HandlerCase {
  name: string
  method: string
  handler: Handler
  params: Record<string, string>
}

async function collectHandlers(): Promise<HandlerCase[]> {
  const out: HandlerCase[] = []
  for (const route of ROUTES) {
    const mod = await route.load()
    for (const method of METHODS) {
      const handler = mod[method]
      if (typeof handler === "function") {
        out.push({ name: `${method} ${route.file}`, method, handler: handler as Handler, params: route.params })
      }
    }
  }
  return out
}

const HANDLERS = await collectHandlers()

function buildRequest(method: string): Request {
  const url = `http://localhost/api/projects/${P}/x`
  if (method === "GET") return new Request(url)
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "x", name: "x", role: "po", orderedIds: ["a"] }),
  })
}

function call(c: HandlerCase): Promise<Response> {
  return c.handler(buildRequest(c.method), { params: Promise.resolve({ projectId: P, ...c.params }) })
}

/** Everything invoked other than the two authz lookups. */
function dataCalls(): string[] {
  return [...h.spies.entries()]
    .filter(([key, fn]) => fn.mock.calls.length > 0 && !h.AUTHZ_LOOKUPS.has(key.replace(/^prisma:/, "")))
    .map(([key]) => key)
}

const memberFindFirst = h.spyFor("prisma:projectMember.findFirst")
const sectionFindFirst = h.spyFor("prisma:projectSection.findFirst")
const projectFindFirst = h.spyFor("prisma:project.findFirst")

describe("project-scoped routes: authz table", () => {
  beforeEach(() => {
    for (const fn of h.spies.values()) fn.mockClear()
    h.auth.mockReset()
    memberFindFirst.mockReset().mockResolvedValue(null)
    sectionFindFirst.mockReset().mockResolvedValue(null)
    projectFindFirst.mockReset().mockResolvedValue({ id: P })
  })

  it("covers every route.ts under projects/[projectId]", () => {
    const root = path.resolve(__dirname, "../projects/[projectId]")
    const onDisk = (fs.readdirSync(root, { recursive: true }) as string[])
      .map((p) => p.split(path.sep).join("/"))
      .filter((p) => p.endsWith("route.ts") && !p.includes("__tests__"))
      .sort()
    expect(ROUTES.map((r) => r.file).sort()).toEqual(onDisk)
  })

  it("found a handler for every route", () => {
    expect(HANDLERS.length).toBeGreaterThanOrEqual(ROUTES.length)
  })

  it("positive control: an allowed member reaches the service (detector is live)", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", name: "U", role: "member" } })
    memberFindFirst.mockResolvedValue({ role: "dev" })
    const c = HANDLERS.find((x) => x.name === "GET backlog/route.ts")!
    const res = await call(c)
    expect(res.status).toBe(500) // inert fake throws → mapped to 500
    expect(dataCalls()).toEqual(["backlog.service:listBacklog"])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 401 without a session", async (_n, c) => {
    h.auth.mockResolvedValue(null)
    const res = await call(c)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" })
    expect(memberFindFirst).not.toHaveBeenCalled()
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 401 for a session without user id", async (_n, c) => {
    h.auth.mockResolvedValue({ user: { name: "ghost" } })
    const res = await call(c)
    expect(res.status).toBe(401)
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 404 for a non-member", async (_n, c) => {
    h.auth.mockResolvedValue({ user: { id: "outsider", name: "O", role: "member" } })
    const res = await call(c)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" })
    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { projectId: P, userId: "outsider" },
      select: { role: true },
    })
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))(
    "%s → 404 for a section manager of an unrelated section",
    async (_n, c) => {
      h.auth.mockResolvedValue({ user: { id: "sm-other", name: "S", role: "section_manager" } })
      const res = await call(c)
      expect(res.status).toBe(404)
      expect(sectionFindFirst).toHaveBeenCalledWith({
        where: { projectId: P, section: { users: { some: { userId: "sm-other" } } } },
        select: { sectionId: true },
      })
      expect(dataCalls()).toEqual([])
    }
  )
})

describe("project-scoped routes: trashed project", () => {
  beforeEach(() => {
    for (const fn of h.spies.values()) fn.mockClear()
    h.auth.mockReset()
    memberFindFirst.mockReset().mockResolvedValue({ role: "po" })
    sectionFindFirst.mockReset().mockResolvedValue(null)
    projectFindFirst.mockReset().mockResolvedValue(null)
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 404 for a PO member when the project is in the trash", async (_n, c) => {
    h.auth.mockResolvedValue({ user: { id: "po-1", name: "P", role: "member" } })
    const res = await call(c)
    expect(res.status).toBe(404)
    expect(projectFindFirst).toHaveBeenCalledWith({ where: { id: P, deletedAt: null }, select: { id: true } })
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 404 for an admin when the project is in the trash", async (_n, c) => {
    h.auth.mockResolvedValue({ user: { id: "adm", name: "A", role: "admin" } })
    const res = await call(c)
    expect(res.status).toBe(404)
    expect(dataCalls()).toEqual([])
  })
})
