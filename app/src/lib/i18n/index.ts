import type { Language } from "./languages"
import * as common from "./common"
import * as nav from "./nav"
import * as auth from "./auth"
import * as adminGlossary from "./admin-glossary"
import * as adminUsers from "./admin-users"
import * as adminOrg from "./admin-org"
import * as me from "./me"
import * as projects from "./projects"
import * as dashboard from "./dashboard"
import * as icebox from "./icebox"
import * as backlog from "./backlog"
import * as backlogOps from "./backlog-ops"
import * as plan from "./plan"
import * as releases from "./releases"
import * as sprintReview from "./sprint-review"
import * as sprintTasks from "./sprint-tasks"
import * as sprints from "./sprints"
import * as sprintBoard from "./sprint-board"
import * as calendar from "./calendar"
import * as gantt from "./gantt"
import * as report from "./report"
import * as ai from "./ai"
import * as guide from "./guide"
import * as settings from "./settings"
import * as apiErrors from "./api-errors"
import * as trash from "./trash"
import * as comments from "./comments"
import * as search from "./search"
import * as notifications from "./notifications"
import * as insights from "./insights"
import * as aiExtensions from "./ai-extensions"
import * as chatProposals from "./chat-proposals"
import * as excelIo from "./excel-io"
import * as portfolio from "./portfolio"
import * as apiTokens from "./api-tokens"
import * as adminMetrics from "./admin-metrics"
import * as projectOrganize from "./project-organize"
import * as dependencies from "./dependencies"
import * as updates from "./updates"
import * as attachmentLinks from "./attachment-links"
import * as teamChat from "./team-chat"

export * from "./languages"
export * from "./point-units"

/**
 * Full translation dictionary. Composed from one interface per domain file;
 * see ./_new-keys-template.md for which file owns which page area.
 */
export interface Translations
  extends common.CommonTranslations,
    nav.NavTranslations,
    auth.AuthTranslations,
    adminGlossary.AdminGlossaryTranslations,
    adminUsers.AdminUsersTranslations,
    adminOrg.AdminOrgTranslations,
    me.MeTranslations,
    projects.ProjectsTranslations,
    dashboard.DashboardTranslations,
    icebox.IceboxTranslations,
    backlog.BacklogTranslations,
    backlogOps.BacklogOpsTranslations,
    plan.PlanTranslations,
    releases.ReleasesTranslations,
    sprintReview.SprintReviewTranslations,
    sprintTasks.SprintTasksTranslations,
    sprints.SprintsTranslations,
    sprintBoard.SprintBoardTranslations,
    calendar.CalendarTranslations,
    gantt.GanttTranslations,
    report.ReportTranslations,
    ai.AiTranslations,
    guide.GuideTranslations,
    settings.SettingsTranslations,
    apiErrors.ApiErrorsTranslations,
    trash.TrashTranslations,
    comments.CommentsTranslations,
    search.SearchTranslations,
    notifications.NotificationsTranslations,
    insights.InsightsTranslations,
    aiExtensions.AiExtensionsTranslations,
    chatProposals.ChatProposalsTranslations,
    excelIo.ExcelIoTranslations,
    portfolio.PortfolioTranslations,
    apiTokens.ApiTokensTranslations,
    adminMetrics.AdminMetricsTranslations,
    projectOrganize.ProjectOrganizeTranslations,
    dependencies.DependenciesTranslations,
    updates.UpdatesTranslations,
    attachmentLinks.AttachmentLinksTranslations,
    teamChat.TeamChatTranslations {}

/** All domain modules, exported for tests (key-set / completeness checks). */
export const domains = {
  "common": common,
  "nav": nav,
  "auth": auth,
  "admin-glossary": adminGlossary,
  "admin-users": adminUsers,
  "admin-org": adminOrg,
  "me": me,
  "projects": projects,
  "dashboard": dashboard,
  "icebox": icebox,
  "backlog": backlog,
  "backlog-ops": backlogOps,
  "plan": plan,
  "releases": releases,
  "sprint-review": sprintReview,
  "sprint-tasks": sprintTasks,
  "sprints": sprints,
  "sprint-board": sprintBoard,
  "calendar": calendar,
  "gantt": gantt,
  "report": report,
  "ai": ai,
  "guide": guide,
  "settings": settings,
  "api-errors": apiErrors,
  "trash": trash,
  "comments": comments,
  "search": search,
  "notifications": notifications,
  "insights": insights,
  "ai-extensions": aiExtensions,
  "chat-proposals": chatProposals,
  "excel-io": excelIo,
  "portfolio": portfolio,
  "api-tokens": apiTokens,
  "admin-metrics": adminMetrics,
  "project-organize": projectOrganize,
  "dependencies": dependencies,
  "updates": updates,
  "attachment-links": attachmentLinks,
  "team-chat": teamChat,
} as const

const ja: Translations = {
  ...common.ja,
  ...nav.ja,
  ...auth.ja,
  ...adminGlossary.ja,
  ...adminUsers.ja,
  ...adminOrg.ja,
  ...me.ja,
  ...projects.ja,
  ...dashboard.ja,
  ...icebox.ja,
  ...backlog.ja,
  ...backlogOps.ja,
  ...plan.ja,
  ...releases.ja,
  ...sprintReview.ja,
  ...sprintTasks.ja,
  ...sprints.ja,
  ...sprintBoard.ja,
  ...calendar.ja,
  ...gantt.ja,
  ...report.ja,
  ...ai.ja,
  ...guide.ja,
  ...settings.ja,
  ...apiErrors.ja,
  ...trash.ja,
  ...comments.ja,
  ...search.ja,
  ...notifications.ja,
  ...insights.ja,
  ...aiExtensions.ja,
  ...chatProposals.ja,
  ...excelIo.ja,
  ...portfolio.ja,
  ...apiTokens.ja,
  ...adminMetrics.ja,
  ...projectOrganize.ja,
  ...dependencies.ja,
  ...updates.ja,
  ...attachmentLinks.ja,
  ...teamChat.ja,
}

const en: Translations = {
  ...common.en,
  ...nav.en,
  ...auth.en,
  ...adminGlossary.en,
  ...adminUsers.en,
  ...adminOrg.en,
  ...me.en,
  ...projects.en,
  ...dashboard.en,
  ...icebox.en,
  ...backlog.en,
  ...backlogOps.en,
  ...plan.en,
  ...releases.en,
  ...sprintReview.en,
  ...sprintTasks.en,
  ...sprints.en,
  ...sprintBoard.en,
  ...calendar.en,
  ...gantt.en,
  ...report.en,
  ...ai.en,
  ...guide.en,
  ...settings.en,
  ...apiErrors.en,
  ...trash.en,
  ...comments.en,
  ...search.en,
  ...notifications.en,
  ...insights.en,
  ...aiExtensions.en,
  ...chatProposals.en,
  ...excelIo.en,
  ...portfolio.en,
  ...apiTokens.en,
  ...adminMetrics.en,
  ...projectOrganize.en,
  ...dependencies.en,
  ...updates.en,
  ...attachmentLinks.en,
  ...teamChat.en,
}

const id: Translations = {
  ...common.id,
  ...nav.id,
  ...auth.id,
  ...adminGlossary.id,
  ...adminUsers.id,
  ...adminOrg.id,
  ...me.id,
  ...projects.id,
  ...dashboard.id,
  ...icebox.id,
  ...backlog.id,
  ...backlogOps.id,
  ...plan.id,
  ...releases.id,
  ...sprintReview.id,
  ...sprintTasks.id,
  ...sprints.id,
  ...sprintBoard.id,
  ...calendar.id,
  ...gantt.id,
  ...report.id,
  ...ai.id,
  ...guide.id,
  ...settings.id,
  ...apiErrors.id,
  ...trash.id,
  ...comments.id,
  ...search.id,
  ...notifications.id,
  ...insights.id,
  ...aiExtensions.id,
  ...chatProposals.id,
  ...excelIo.id,
  ...portfolio.id,
  ...apiTokens.id,
  ...adminMetrics.id,
  ...projectOrganize.id,
  ...dependencies.id,
  ...updates.id,
  ...attachmentLinks.id,
  ...teamChat.id,
}

const translations: Record<Language, Translations> = { ja, en, id }

export function getTranslations(lang: Language): Translations {
  return translations[lang] ?? translations.ja
}
