/**
 * Who sees the cross-project portfolio, and which projects. Shared by the
 * portfolio page / API and the chat's `portfolio_overview` tool so the rule
 * lives in one place:
 * - system admin    → every live project
 * - section_manager → live projects assigned to a section the user belongs to
 * - anyone else     → nothing (403)
 */
import type { Prisma } from "@/generated/prisma/client"
import type { Severity } from "./portfolio.types"

export interface PortfolioViewer {
  userId: string
  /** User.role ("admin" | "section_manager" | "member"). */
  systemRole: string
}

export function canViewPortfolio(viewer: PortfolioViewer | null | undefined): viewer is PortfolioViewer {
  return !!viewer && (viewer.systemRole === "admin" || viewer.systemRole === "section_manager")
}

/** `ProjectWhereInput` of the projects the viewer's portfolio covers (call only when canViewPortfolio). */
export function portfolioProjectWhere(viewer: PortfolioViewer): Prisma.ProjectWhereInput {
  const base = { deletedAt: null }
  if (viewer.systemRole === "admin") return base
  return { ...base, sections: { some: { section: { users: { some: { userId: viewer.userId } } } } } }
}

/** Pure: highest anomaly severity recorded in a surveillance report's meta JSON. */
export function severityFromMeta(meta: string | null): Severity {
  if (!meta) return "none"
  try {
    const parsed = JSON.parse(meta) as { anomalies?: Array<{ severity?: unknown }> }
    const list = Array.isArray(parsed.anomalies) ? parsed.anomalies : []
    if (list.some((a) => a?.severity === "critical")) return "critical"
    if (list.some((a) => a?.severity === "warning")) return "warning"
    return "none"
  } catch {
    return "none"
  }
}
