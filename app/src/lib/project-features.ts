
/**
 * Which feature groups a project type shows (W12). Development features (Git
 * panel, work-claim branch, AC → test table, outside-scope warnings) exist only
 * for `software`; `equipment` hides them (process-improvement / general keep what they had) and
 * equipment / process-improvement get the 全体計画 (plan) up front. One place to decide, so components never
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
/** Existing types keep today's behaviour: only the branch stays software-only (as before W12). */
const PROCESS_IMPROVEMENT: ProjectFeatures = { ...SOFTWARE, workClaimBranch: false, planProminent: true }
const GENERAL: ProjectFeatures = { ...SOFTWARE, workClaimBranch: false }
/** Only `equipment` hides the development features (the Git entry still follows the project's own Git integration switch). */
const EQUIPMENT: ProjectFeatures = { gitPanel: false, workClaimBranch: false, acTestTable: false, outsideScopeWarnings: false, planProminent: true }

export function projectFeatures(projectType: string | null | undefined): ProjectFeatures {
  switch (projectType) {
    case "equipment":
      return EQUIPMENT
    case "process_improvement":
      return PROCESS_IMPROVEMENT
    case "general":
      return GENERAL
    default:
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

