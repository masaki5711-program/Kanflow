
/**
 * Which feature groups a project type shows (W12). Development features (Git
 * panel, work-claim branch, AC → test table, outside-scope warnings) exist only
 * for `software`; equipment / process-improvement / general projects get the
 * 全体計画 (plan) up front instead. One place to decide, so components never
 * compare `projectType` strings themselves.
 */
export interface ProjectFeatures {
  /** 開発（Git） entry / panel. */
  gitPanel: boolean
  /** Branch name and 触る範囲 on a work claim. */
  workClaimBranch: boolean
  /** Acceptance criteria ↔ test correspondence table. */
  acTestTable: boolean
  /** "MR changes files outside the declared scope" warnings. */
  outsideScopeWarnings: boolean
  /** 全体計画 first in the menu (and the dashboard). */
  planProminent: boolean
}

const SOFTWARE: ProjectFeatures = { gitPanel: true, workClaimBranch: true, acTestTable: true, outsideScopeWarnings: true, planProminent: false }
const NON_SOFTWARE: ProjectFeatures = { gitPanel: false, workClaimBranch: false, acTestTable: false, outsideScopeWarnings: false, planProminent: true }
/** `general` keeps the plan in its usual place (it is not a plan-driven type). */
const GENERAL: ProjectFeatures = { ...NON_SOFTWARE, planProminent: false }

export function projectFeatures(projectType: string | null | undefined): ProjectFeatures {
  switch (projectType) {
    case "equipment":
    case "process_improvement":
      return NON_SOFTWARE
    case "general":
      return GENERAL
    default:
      // software, and anything unknown: the long-standing behaviour.
      return SOFTWARE
  }
}

/** Default evidence kind of a new acceptance criterion, by project type (W12). */
export function defaultEvidenceKind(projectType: string | null | undefined): "test" | "inspection" | "measurement" | null {
  switch (projectType) {
    case "software":
      return "test"
    case "equipment":
      return "inspection"
    case "process_improvement":
      return "measurement"
    default:
      return null
  }
}

