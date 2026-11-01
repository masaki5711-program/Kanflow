/**
 * Stable, machine-readable API error codes (`{ error, code }` bodies).
 * The frontend localizes known codes (src/lib/i18n/api-errors.ts) and falls
 * back to the legacy `error` message otherwise. Dependency-free so client
 * code may import the type.
 *
 * Never rename a code: clients match on it. Add new ones at the end of a group.
 */
export const API_ERROR_CODES = [
  // Generic (one per HTTP failure class)
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "INVALID_JSON",
  "CONFLICT",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "INVALID_REFERENCE",
  "INTERNAL",
  "UPSTREAM_FAILED",
  "SERVICE_UNAVAILABLE",
  /** Optimistic lock: the row changed since the client loaded it (body carries `current`). */
  "VERSION_CONFLICT",
  // Auth / admin / account
  "ADMIN_REQUIRED",
  "WRONG_PASSWORD",
  "PASSWORD_TOO_SHORT",
  "EMAIL_TAKEN",
  "EMPLOYEE_NUMBER_TAKEN",
  "CANNOT_DEACTIVATE_SELF",
  "CANNOT_DEMOTE_SELF",
  "USER_NOT_FOUND",
  "USER_INACTIVE",
  "DUPLICATE_NAME",
  /** API token: the token lacks the scope for the action (the owner's role may still allow it). */
  "INSUFFICIENT_SCOPE",
  // Project / members
  "PROGRESS_PO_ONLY",
  "SECTIONS_PO_OR_ADMIN",
  "SECTION_NOT_FOUND",
  "MEMBER_EXISTS",
  "LAST_PO_DEMOTE",
  "LAST_PO_REMOVE",
  // Backlog / icebox / goals / releases
  "PBI_NOT_FOUND",
  "ICEBOX_ITEM_NOT_FOUND",
  "PRODUCT_GOAL_NOT_FOUND",
  "RELEASE_NO_PBI",
  "IMPROVEMENT_NO_REQUEST",
  "PROJECT_IN_TRASH",
  /** A new PBI needs a user story or an initiative (the text the backlog list shows as its title). */
  "PBI_CONTENT_REQUIRED",
  // Sprints
  "SPRINT_NOT_FOUND",
  "SPRINT_ACTIVE_EXISTS",
  // Plan
  "PLAN_ITEM_NOT_FOUND",
  "PLAN_PARENT_NOT_FOUND",
  "PLAN_SELF_PARENT",
  "PLAN_CYCLE",
  "PLAN_INVALID_RANGE",
  "PLAN_PARENT_DATES_DERIVED",
  "PLAN_LINK_REQUIRES_LEAF",
  "PLAN_LINK_MILESTONE",
  "PLAN_LINK_INVALID_PBI",
  "PLAN_DEPENDENCY_CYCLE",
  "PLAN_DEPENDENCY_INVALID",
  "PLAN_DEPENDENCY_EXISTS",
  "PBI_DEPENDENCY_CYCLE",
  "PBI_DEPENDENCY_INVALID",
  "PBI_DEPENDENCY_EXISTS",
  "PLAN_OWNER_NOT_MEMBER",
  /** A non-milestone plan item has both planned dates or neither (日程未定). */
  "PLAN_DATES_INCOMPLETE",
  // Plan templates
  "PLAN_TEMPLATE_NOT_FOUND",
  /** Built-in (共通) templates cannot be deleted, only reset to the default. */
  "PLAN_TEMPLATE_BUILTIN",
  /** Only the creator or an admin may delete a user template. */
  "PLAN_TEMPLATE_DELETE_FORBIDDEN",
  /** Reset to default exists for built-in templates only. */
  "PLAN_TEMPLATE_NOT_BUILTIN",
  /** The plan tree is too large / too deep to save as a template. */
  "PLAN_TEMPLATE_TOO_LARGE",
  /** Nothing to load / save (every stage excluded, or an empty plan). */
  "PLAN_TEMPLATE_EMPTY",
  /** A base schedule (W12) is over 500 items / 5 levels, or has a bad key or dependency. */
  "PLAN_SCHEDULE_TOO_LARGE",
  "PLAN_SCHEDULE_TOO_DEEP",
  "PLAN_SCHEDULE_INVALID",
  /** The base-schedule proposal is too big to keep in a chat thread. */
  "PLAN_PROPOSAL_TOO_LARGE",
  // Files / folders
  "FILE_REQUIRED",
  "FILE_EMPTY",
  "FILE_MISSING",
  "INVALID_PATH",
  "FOLDER_NOT_FOUND",
  "FOLDER_SELF_PARENT",
  "FOLDER_CYCLE",
  "LINK_URL_INVALID",
  "LINK_ONLY_FIELD",
  "TEAM_CHAT_EMPTY",
  "ICEBOX_TOO_MANY_ATTACHMENTS",
  "PBI_TOO_MANY_ATTACHMENTS",
  "TEAM_CHAT_TOO_LONG",
  "TEAM_CHAT_TOO_MANY_FILES",
  "TEAM_CHAT_FILE_TOO_LARGE",
  "TEAM_CHAT_MESSAGE_NOT_FOUND",
  "TEAM_CHAT_MIRROR_READONLY",
  "FILE_TYPE_MISMATCH",
  "STORAGE_QUOTA_EXCEEDED",
  // 改善成果ボード (process_improvement)
  "IMPROVEMENT_NEEDS_STANDARD",
  "IMPROVEMENT_NEEDS_SUSTAINED_CHECK",
  "IMPROVEMENT_TARGET_DIRECTION",
  "IMPROVEMENT_TOO_MANY_PHOTOS",
  "IMPROVEMENT_PHOTO_NOT_IMAGE",
  "IMPROVEMENT_TOO_MANY_ROLLOUTS",
  "IMPROVEMENT_TOO_MANY_CHECKS",
  // マイルストーン・検収ボード (general)
  "MILESTONE_LIMIT_REACHED",
  // Dates / glossary / translation
  "INVALID_DATE",
  "GLOSSARY_SAME_LOCALE",
  "TRANSLATION_FAILED",
  // Collabora editor (legacy lowercase codes kept for existing clients)
  "not_editable",
  "wopi_token_missing",
  "collabora_unreachable",
  "collabora_error",
  // Git integration
  /** The settings name a source (provider) Kanflow cannot read (only "gitlab" today). */
  "GIT_PROVIDER_UNSUPPORTED",
  /** One ingestion source per project: the provider cannot change while repositories exist. */
  "GIT_SOURCE_LOCKED",
  /** dev:write MR link: not a merge request URL (https://<allowed host>/<group>/<repo>/-/merge_requests/<iid>). */
  "MR_URL_INVALID",
  /** dev:write MR link: the MR's repository is not registered in this project's (enabled) Git integration. */
  "MR_REPOSITORY_NOT_REGISTERED",
  /** dev:write work claim: the claim was released (start a new one instead of a heartbeat). */
  "CLAIM_RELEASED",
  /** dev:write work claim: another user / session holds an active claim on the target (body: `holders`). */
  "TASK_CLAIMED",
  /** dev:write work claim: the user already holds DEV_CLAIM_MAX_OPEN_PER_USER active claims in the project. */
  "CLAIM_LIMIT_REACHED",
  /** dev:write 触る範囲 (W4): an entry is not a usable relative path / module name (message names the entry). */
  "SCOPE_INVALID",
  /** dev:write 触る範囲 (W4): more than 200 distinct entries for one claim. */
  "SCOPE_TOO_LARGE",
  /** 受入基準 (W5): no live criterion with this number on the PBI (also a deleted one). */
  "AC_NOT_FOUND",
  /** 受入基準 (W5): the PBI already has the maximum number of live criteria. */
  "AC_LIMIT_REACHED",
  /** フィードバックの輪 (W11): the report still contains something that looks like a credential after redaction; it was not stored. */
  "FEEDBACK_REDACTION_FAILED",
  /** フィードバックの輪 (W11): no unresolved failure of this session (and token) to attach the resolution to. */
  "FEEDBACK_NO_FAILURE",
  /** フィードバックの輪 (W11): no lesson with this id, or the caller may not see it. */
  "LESSON_NOT_FOUND",
  /** フィードバックの輪 (W11): the lesson is not in a state that allows this change (e.g. systemize needs a confirmed lesson). */
  "LESSON_STATE",
  // Client-side only (set by apiFetch, never sent by the server)
  "NETWORK_ERROR",
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** Generic code for an HTTP status (used when a thrower gives none). */
export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "VALIDATION"
    case 401:
      return "UNAUTHORIZED"
    case 403:
      return "FORBIDDEN"
    case 404:
      return "NOT_FOUND"
    case 409:
      return "CONFLICT"
    case 413:
      return "PAYLOAD_TOO_LARGE"
    case 415:
      return "UNSUPPORTED_MEDIA"
    case 429:
      return "RATE_LIMITED"
    case 502:
      return "UPSTREAM_FAILED"
    case 503:
      return "SERVICE_UNAVAILABLE"
    default:
      return status >= 500 ? "INTERNAL" : "VALIDATION"
  }
}
