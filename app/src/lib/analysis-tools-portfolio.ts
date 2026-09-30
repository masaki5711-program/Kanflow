import { prisma } from "@/lib/prisma"
import { isSystemAdmin, type ProjectActor } from "@/lib/authz/policy"
import { LIVE_PBI } from "@/services/_shared/soft-delete"
import { canViewPortfolio as canViewPortfolioScope, portfolioProjectWhere, severityFromMeta } from "@/services/portfolio/portfolio.scope"
import type { ToolDefinition, ToolHandler } from "@/lib/chat-tools-types"
import { daysBetween, isRealTask, iso, now, pct, trunc } from "@/lib/tool-helpers"

/**
 * Portfolio pack (P3): cross-project overview. The only tool that reads
 * OUTSIDE the chat's project, so it authorizes itself from the actor:
 * - system admin      → every live project
 * - section_manager   → live projects of the sections the user belongs to
 * - anyone else / no actor (autonomous agent) → a polite refusal
 */

export const PORTFOLIO_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "portfolio_overview",
      description:
        "Cross-project overview for admins and section managers: per project the active sprint progress, overdue sprint tasks and plan items, and the latest AI surveillance severity. Use for 'how are all our projects doing'.",
      parameters: { type: "object", properties: {} },
    },
  },
]

const PROJECT_CAP = 30

/** May this actor see the portfolio at all? (Same rule as the /portfolio page.) */
export function canViewPortfolio(actor: ProjectActor | undefined): actor is ProjectActor {
  return canViewPortfolioScope(actor)
}

export { severityFromMeta }

export const portfolioHandlers: Record<string, ToolHandler> = {
  async portfolio_overview({ actor }) {
    if (!canViewPortfolio(actor)) {
      return JSON.stringify({
        refused: true,
        reason: "portfolio_overview is available to system admins and section managers only",
        instruction: "Politely tell the user this cross-project view needs the admin or section-manager role, and offer project-level analysis instead.",
      })
    }
    const today = now()
    const projects = await prisma.project.findMany({
      where: portfolioProjectWhere(actor),
      orderBy: { name: "asc" },
      take: PROJECT_CAP + 1,
      select: { id: true, name: true, status: true },
    })
    const capped = projects.length > PROJECT_CAP
    const list = projects.slice(0, PROJECT_CAP)
    const ids = list.map((p) => p.id)
    if (ids.length === 0) return JSON.stringify({ as_of: iso(today), project_count: 0, projects: [] })

    const [sprints, overduePlan, reports] = await Promise.all([
      prisma.sprint.findMany({
        where: { projectId: { in: ids }, status: { in: ["planning", "active"] } },
        orderBy: { startDate: "desc" },
        select: {
          projectId: true, sprintName: true, status: true, endDate: true,
          items: { where: LIVE_PBI, select: { taskName: true, status: true } },
        },
      }),
      prisma.planItem.findMany({
        where: { projectId: { in: ids }, deletedAt: null, plannedEnd: { lt: today }, status: { not: "done" }, progressPct: { lt: 100 } },
        select: { projectId: true },
      }),
      prisma.aiReport.findMany({
        where: { projectId: { in: ids }, trigger: "surveillance" },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: { projectId: true, createdAt: true, meta: true },
      }),
    ])

    const rows = list.map((p) => {
      const own = sprints.filter((s) => s.projectId === p.id)
      const active = own.find((s) => s.status === "active") ?? null
      const activeTasks = active ? active.items.filter(isRealTask) : []
      const done = activeTasks.filter((t) => t.status === "done").length
      const overdueTasks = own
        .filter((s) => s.endDate.getTime() < today.getTime())
        .reduce((n, s) => n + s.items.filter((t) => isRealTask(t) && t.status !== "done").length, 0)
      const latest = reports.find((r) => r.projectId === p.id) ?? null
      return {
        project: trunc(p.name, 60),
        status: p.status,
        active_sprint: active
          ? {
              name: active.sprintName,
              tasks_done: `${done}/${activeTasks.length}`,
              progress_pct: pct(done, activeTasks.length),
              days_remaining: daysBetween(today, active.endDate),
            }
          : null,
        overdue_sprint_tasks: overdueTasks,
        overdue_plan_items: overduePlan.filter((x) => x.projectId === p.id).length,
        last_surveillance: latest ? { date: iso(latest.createdAt), severity: severityFromMeta(latest.meta) } : null,
      }
    })

    return JSON.stringify({
      as_of: iso(today),
      scope: isSystemAdmin(actor) ? "all projects (admin)" : "projects of your sections",
      project_count: rows.length,
      projects: rows,
      note: [
        "overdue_sprint_tasks = unfinished tasks in open sprints past their end date",
        capped ? `capped at ${PROJECT_CAP} projects` : null,
      ].filter(Boolean).join("; "),
    })
  },
}
