import type { ComponentType } from "react"
import {
  BookOpen,
  CalendarDays,
  ChartGantt,
  FileText,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  Map as MapIcon,
  MessageSquare,
  Rocket,
  Settings,
  Trash2,
  TrendingDown,
  Zap,
} from "lucide-react"
import type { Translations } from "@/lib/i18n"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"

export interface SidebarNavItem {
  href: string
  label: string
  description: string
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  /** Exact match only (the dashboard is the project root). */
  exact?: boolean
}

export interface SidebarNavGroup {
  id: string
  label: string | null
  items: SidebarNavItem[]
}

export interface SidebarNavOptions {
  /** Add the project trash entry (only for users with the "trash.manage" permission). */
  showTrash?: boolean
}

/**
 * Sidebar information architecture. Groups follow the work flow:
 * idea → backlog → sprint, then planning views, analysis, and the rest.
 */
export function buildSidebarGroups(
  projectId: string,
  t: Translations,
  pt: ProjectTypeLabels,
  options: SidebarNavOptions = {},
): SidebarNavGroup[] {
  const base = `/projects/${projectId}`
  const trash: SidebarNavItem[] = options.showTrash
    ? [{ href: `${base}/trash`, label: t.trashTitle, description: t.trashNavDescription, Icon: Trash2 }]
    : []
  return [
    {
      id: "home",
      label: null,
      items: [
        { href: base, label: t.navDashboard, description: t.navDescDashboard, Icon: LayoutDashboard, exact: true },
      ],
    },
    {
      id: "flow",
      label: t.navGroupFlow,
      items: [
        { href: `${base}/icebox`, label: pt.navIcebox, description: t.iceboxDescription, Icon: Lightbulb },
        { href: `${base}/backlog`, label: pt.navBacklog, description: t.navDescBacklog, Icon: ListOrdered },
        { href: `${base}/sprints`, label: pt.navSprints, description: t.navDescSprints, Icon: Zap },
      ],
    },
    {
      id: "plan",
      label: t.navGroupPlan,
      items: [
        { href: `${base}/plan`, label: t.planTitle, description: t.navDescPlan, Icon: MapIcon },
        { href: `${base}/releases`, label: pt.navReleases, description: t.navDescReleases, Icon: Rocket },
        { href: `${base}/gantt`, label: t.ganttTitle, description: t.navDescGantt, Icon: ChartGantt },
        { href: `${base}/calendar`, label: t.calendarTitle, description: t.navDescCalendar, Icon: CalendarDays },
      ],
    },
    {
      id: "insights",
      label: t.navGroupInsights,
      items: [
        { href: `${base}/burndown`, label: t.burndownPageTitle, description: t.navDescBurndown, Icon: TrendingDown },
        { href: `${base}/report`, label: t.reportTitle, description: t.navDescReport, Icon: FileText },
        { href: `${base}/chat`, label: t.chatTitle, description: t.navDescChat, Icon: MessageSquare },
      ],
    },
    {
      id: "other",
      label: t.navGroupOther,
      items: [
        { href: `${base}/guide`, label: t.guideTitle, description: t.navDescGuide, Icon: BookOpen },
        { href: `${base}/settings`, label: t.navSettings, description: t.navDescSettings, Icon: Settings },
        ...trash,
      ],
    },
  ]
}

export function isNavItemActive(pathname: string, item: Pick<SidebarNavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
