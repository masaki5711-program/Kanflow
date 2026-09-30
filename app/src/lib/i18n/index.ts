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
import * as plan from "./plan"
import * as releases from "./releases"
import * as sprintReview from "./sprint-review"
import * as sprintTasks from "./sprint-tasks"
import * as sprints from "./sprints"
import * as calendar from "./calendar"
import * as gantt from "./gantt"
import * as report from "./report"
import * as ai from "./ai"
import * as guide from "./guide"
import * as settings from "./settings"
import * as apiErrors from "./api-errors"

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
    plan.PlanTranslations,
    releases.ReleasesTranslations,
    sprintReview.SprintReviewTranslations,
    sprintTasks.SprintTasksTranslations,
    sprints.SprintsTranslations,
    calendar.CalendarTranslations,
    gantt.GanttTranslations,
    report.ReportTranslations,
    ai.AiTranslations,
    guide.GuideTranslations,
    settings.SettingsTranslations,
    apiErrors.ApiErrorsTranslations {}

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
  "plan": plan,
  "releases": releases,
  "sprint-review": sprintReview,
  "sprint-tasks": sprintTasks,
  "sprints": sprints,
  "calendar": calendar,
  "gantt": gantt,
  "report": report,
  "ai": ai,
  "guide": guide,
  "settings": settings,
  "api-errors": apiErrors,
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
  ...plan.ja,
  ...releases.ja,
  ...sprintReview.ja,
  ...sprintTasks.ja,
  ...sprints.ja,
  ...calendar.ja,
  ...gantt.ja,
  ...report.ja,
  ...ai.ja,
  ...guide.ja,
  ...settings.ja,
  ...apiErrors.ja,
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
  ...plan.en,
  ...releases.en,
  ...sprintReview.en,
  ...sprintTasks.en,
  ...sprints.en,
  ...calendar.en,
  ...gantt.en,
  ...report.en,
  ...ai.en,
  ...guide.en,
  ...settings.en,
  ...apiErrors.en,
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
  ...plan.id,
  ...releases.id,
  ...sprintReview.id,
  ...sprintTasks.id,
  ...sprints.id,
  ...calendar.id,
  ...gantt.id,
  ...report.id,
  ...ai.id,
  ...guide.id,
  ...settings.id,
  ...apiErrors.id,
}

const translations: Record<Language, Translations> = { ja, en, id }

export function getTranslations(lang: Language): Translations {
  return translations[lang] ?? translations.ja
}
