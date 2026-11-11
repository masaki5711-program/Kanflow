/**
 * i18n domain: API error messages, keyed by the stable `code` the server
 * sends with every error body (`{ error, code }`, see
 * src/services/_shared/error-codes.ts). Used by `localizeApiError`
 * (src/hooks/api-client.ts) so toasts show the user's language instead of the
 * server's Japanese-only `error` text.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise);
 * a new code must also be mapped in API_ERROR_MESSAGE_KEYS.
 */
import type { ApiErrorCode } from "@/services/_shared/error-codes"

export interface ApiErrorsTranslations {
  apiErrUnauthorized: string
  apiErrForbidden: string
  apiErrNotFound: string
  apiErrValidation: string
  apiErrInvalidJson: string
  apiErrConflict: string
  apiErrRateLimited: string
  apiErrPayloadTooLarge: string
  apiErrUnsupportedMedia: string
  apiErrInvalidReference: string
  apiErrInternal: string
  apiErrUpstreamFailed: string
  apiErrServiceUnavailable: string
  apiErrVersionConflict: string
  apiErrVersionConflictReenter: string
  apiErrVersionConflictYourInput: string
  apiErrVersionConflictRestore: string
  apiErrVersionConflictEmpty: string
  apiErrAdminRequired: string
  apiErrWrongPassword: string
  apiErrPasswordTooShort: string
  apiErrEmailTaken: string
  apiErrEmployeeNumberTaken: string
  apiErrCannotDeactivateSelf: string
  apiErrCannotDemoteSelf: string
  apiErrUserNotFound: string
  apiErrUserInactive: string
  apiErrDuplicateName: string
  apiErrInsufficientScope: string
  apiErrProgressPoOnly: string
  apiErrSectionsPoOrAdmin: string
  apiErrSectionNotFound: string
  apiErrMemberExists: string
  apiErrLastPoDemote: string
  apiErrLastPoRemove: string
  apiErrPbiNotFound: string
  apiErrIceboxItemNotFound: string
  apiErrProductGoalNotFound: string
  apiErrReleaseNoPbi: string
  apiErrImprovementNoRequest: string
  apiErrProjectInTrash: string
  apiErrPbiContentRequired: string
  apiErrSprintNotFound: string
  apiErrSprintActiveExists: string
  apiErrPlanItemNotFound: string
  apiErrPlanParentNotFound: string
  apiErrPlanSelfParent: string
  apiErrPlanCycle: string
  apiErrPlanInvalidRange: string
  apiErrPlanParentDatesDerived: string
  apiErrPlanLinkRequiresLeaf: string
  apiErrPlanLinkMilestone: string
  apiErrPlanFollowsPbis: string
  apiErrPlanLinkInvalidPbi: string
  apiErrPlanDependencyCycle: string
  apiErrPlanDependencyInvalid: string
  apiErrPlanDependencyExists: string
  apiErrPbiDependencyCycle: string
  apiErrPbiDependencyInvalid: string
  apiErrPbiDependencyExists: string
  apiErrPlanOwnerNotMember: string
  apiErrPlanDatesIncomplete: string
  apiErrPlanTemplateNotFound: string
  apiErrPlanTemplateBuiltin: string
  apiErrPlanTemplateDeleteForbidden: string
  apiErrPlanTemplateNotBuiltin: string
  apiErrPlanTemplateTooLarge: string
  apiErrPlanTemplateEmpty: string
  apiErrPlanScheduleTooLarge: string
  apiErrPlanScheduleTooDeep: string
  apiErrPlanScheduleInvalid: string
  apiErrPlanProposalTooLarge: string
  apiErrPlanAlreadyLoaded: string
  apiErrPlanRuleInvalid: string
  apiErrPlanRuleNotFound: string
  apiErrPlanRuleChanged: string
  apiErrPlanRuleState: string
  apiErrPlanRulePromotionBlocked: string
  apiErrPlanRuleLimit: string
  apiErrPlanActualsIncomplete: string
  apiErrPlanActualsNotFound: string
  apiErrPlanActualsChanged: string
  apiErrPlanActualsReviewHidden: string
  apiErrPlanActualsUserActive: string
  apiErrPlanActualsCurrent: string
  apiErrPlanRoleAssignmentInvalid: string
  apiErrCapacityOverlap: string
  apiErrCapacityNotFound: string
  apiErrCapacityChanged: string
  apiErrCapacityNotMember: string
  apiErrPlanLoadTooLarge: string
  apiErrPlanEstimateStale: string
  apiErrPlanEstimateRunNotFound: string
  apiErrPlanLineageNotAllowed: string
  apiErrPlanEstimateEvalNotFound: string
  apiErrPlanEstimateEvalChanged: string
  apiErrPlanEstimateEvalNotPassing: string
  apiErrPlanEstimateEvalTooMany: string
  apiErrPlanEstimateParamsNotFound: string
  apiErrPlanEstimateParamsChanged: string
  apiErrPlanEstimateParamsDecided: string
  apiErrPlanEstimateParamsNotPassing: string
  apiErrFileRequired: string
  apiErrFileEmpty: string
  apiErrFileMissing: string
  apiErrInvalidPath: string
  apiErrFolderNotFound: string
  apiErrFolderSelfParent: string
  apiErrFolderCycle: string
  apiErrLinkUrlInvalid: string
  apiErrLinkOnlyField: string
  apiErrTeamChatEmpty: string
  apiErrIceboxTooManyAttachments: string
  apiErrPbiTooManyAttachments: string
  apiErrTeamChatTooLong: string
  apiErrTeamChatTooManyFiles: string
  apiErrTeamChatFileTooLarge: string
  apiErrTeamChatMessageNotFound: string
  apiErrTeamChatMirrorReadonly: string
  apiErrFileTypeMismatch: string
  apiErrStorageQuotaExceeded: string
  apiErrImprovementNeedsStandard: string
  apiErrImprovementNeedsSustainedCheck: string
  apiErrImprovementTargetDirection: string
  apiErrImprovementTooManyPhotos: string
  apiErrImprovementPhotoNotImage: string
  apiErrImprovementTooManyRollouts: string
  apiErrImprovementTooManyChecks: string
  apiErrMilestoneLimitReached: string
  apiErrBoardLimitReached: string
  apiErrBoardSheetLimitReached: string
  apiErrBoardLastSheet: string
  apiErrBoardSheetFull: string
  apiErrBoardWriteTooLarge: string
  apiErrInvalidDate: string
  apiErrGlossarySameLocale: string
  apiErrTranslationFailed: string
  apiErrCollaboraNotEditable: string
  apiErrCollaboraNotConfigured: string
  apiErrCollaboraUnreachable: string
  apiErrCollaboraFailed: string
  apiErrGitProviderUnsupported: string
  apiErrGitstationHostNotAllowed: string
  apiErrGitResyncUnavailable: string
  apiErrGitKnowledgeUnsupported: string
  apiErrGitSourceLocked: string
  apiErrGitApprovalUnavailable: string
  apiErrGitApprovalNoEmployeeNumber: string
  apiErrGitApprovalNotAllowed: string
  apiErrGitApprovalSelf: string
  apiErrGitApprovalStale: string
  apiErrGitApprovalNotConfirmed: string
  apiErrGitApprovalRetry: string
  apiErrGitApprovalIdentity: string
  apiErrGitApprovalConfig: string
  apiErrGitApprovalDifferentUser: string
  apiErrGitApprovalBusy: string
  apiErrGitBindingUnavailable: string
  apiErrGitBindingNotAllowed: string
  apiErrGitBindingConflict: string
  apiErrGitBindingAlready: string
  apiErrGitBindingResolutionFixed: string
  apiErrGitBindingConfig: string
  apiErrMrUrlInvalid: string
  apiErrMrRepositoryNotRegistered: string
  apiErrClaimReleased: string
  apiErrTaskClaimed: string
  apiErrClaimLimitReached: string
  apiErrAcNotFound: string
  apiErrAcLimitReached: string
  apiErrFeedbackRedactionFailed: string
  apiErrFeedbackNoFailure: string
  apiErrLessonNotFound: string
  apiErrLessonState: string
  apiErrScopeInvalid: string
  apiErrScopeTooLarge: string
  apiErrNetwork: string
}

export type ApiErrorMessageKey = keyof ApiErrorsTranslations

/** Code → message key. Exhaustive: a new code without a message is a compile error. */
export const API_ERROR_MESSAGE_KEYS: Readonly<Record<ApiErrorCode, ApiErrorMessageKey>> = {
  UNAUTHORIZED: "apiErrUnauthorized",
  FORBIDDEN: "apiErrForbidden",
  NOT_FOUND: "apiErrNotFound",
  VALIDATION: "apiErrValidation",
  INVALID_JSON: "apiErrInvalidJson",
  CONFLICT: "apiErrConflict",
  RATE_LIMITED: "apiErrRateLimited",
  PAYLOAD_TOO_LARGE: "apiErrPayloadTooLarge",
  UNSUPPORTED_MEDIA: "apiErrUnsupportedMedia",
  INVALID_REFERENCE: "apiErrInvalidReference",
  INTERNAL: "apiErrInternal",
  UPSTREAM_FAILED: "apiErrUpstreamFailed",
  SERVICE_UNAVAILABLE: "apiErrServiceUnavailable",
  VERSION_CONFLICT: "apiErrVersionConflict",
  ADMIN_REQUIRED: "apiErrAdminRequired",
  WRONG_PASSWORD: "apiErrWrongPassword",
  PASSWORD_TOO_SHORT: "apiErrPasswordTooShort",
  EMAIL_TAKEN: "apiErrEmailTaken",
  EMPLOYEE_NUMBER_TAKEN: "apiErrEmployeeNumberTaken",
  CANNOT_DEACTIVATE_SELF: "apiErrCannotDeactivateSelf",
  CANNOT_DEMOTE_SELF: "apiErrCannotDemoteSelf",
  USER_NOT_FOUND: "apiErrUserNotFound",
  USER_INACTIVE: "apiErrUserInactive",
  DUPLICATE_NAME: "apiErrDuplicateName",
  INSUFFICIENT_SCOPE: "apiErrInsufficientScope",
  PROGRESS_PO_ONLY: "apiErrProgressPoOnly",
  SECTIONS_PO_OR_ADMIN: "apiErrSectionsPoOrAdmin",
  SECTION_NOT_FOUND: "apiErrSectionNotFound",
  MEMBER_EXISTS: "apiErrMemberExists",
  LAST_PO_DEMOTE: "apiErrLastPoDemote",
  LAST_PO_REMOVE: "apiErrLastPoRemove",
  PBI_NOT_FOUND: "apiErrPbiNotFound",
  ICEBOX_ITEM_NOT_FOUND: "apiErrIceboxItemNotFound",
  PRODUCT_GOAL_NOT_FOUND: "apiErrProductGoalNotFound",
  RELEASE_NO_PBI: "apiErrReleaseNoPbi",
  IMPROVEMENT_NO_REQUEST: "apiErrImprovementNoRequest",
  PROJECT_IN_TRASH: "apiErrProjectInTrash",
  PBI_CONTENT_REQUIRED: "apiErrPbiContentRequired",
  SPRINT_NOT_FOUND: "apiErrSprintNotFound",
  SPRINT_ACTIVE_EXISTS: "apiErrSprintActiveExists",
  PLAN_ITEM_NOT_FOUND: "apiErrPlanItemNotFound",
  PLAN_PARENT_NOT_FOUND: "apiErrPlanParentNotFound",
  PLAN_SELF_PARENT: "apiErrPlanSelfParent",
  PLAN_CYCLE: "apiErrPlanCycle",
  PLAN_INVALID_RANGE: "apiErrPlanInvalidRange",
  PLAN_PARENT_DATES_DERIVED: "apiErrPlanParentDatesDerived",
  PLAN_LINK_REQUIRES_LEAF: "apiErrPlanLinkRequiresLeaf",
  PLAN_LINK_MILESTONE: "apiErrPlanLinkMilestone",
  PLAN_FOLLOWS_PBIS: "apiErrPlanFollowsPbis",
  PLAN_LINK_INVALID_PBI: "apiErrPlanLinkInvalidPbi",
  PLAN_DEPENDENCY_CYCLE: "apiErrPlanDependencyCycle",
  PLAN_DEPENDENCY_INVALID: "apiErrPlanDependencyInvalid",
  PLAN_DEPENDENCY_EXISTS: "apiErrPlanDependencyExists",
  PBI_DEPENDENCY_CYCLE: "apiErrPbiDependencyCycle",
  PBI_DEPENDENCY_INVALID: "apiErrPbiDependencyInvalid",
  PBI_DEPENDENCY_EXISTS: "apiErrPbiDependencyExists",
  PLAN_OWNER_NOT_MEMBER: "apiErrPlanOwnerNotMember",
  PLAN_DATES_INCOMPLETE: "apiErrPlanDatesIncomplete",
  PLAN_TEMPLATE_NOT_FOUND: "apiErrPlanTemplateNotFound",
  PLAN_TEMPLATE_BUILTIN: "apiErrPlanTemplateBuiltin",
  PLAN_TEMPLATE_DELETE_FORBIDDEN: "apiErrPlanTemplateDeleteForbidden",
  PLAN_TEMPLATE_NOT_BUILTIN: "apiErrPlanTemplateNotBuiltin",
  PLAN_TEMPLATE_TOO_LARGE: "apiErrPlanTemplateTooLarge",
  PLAN_TEMPLATE_EMPTY: "apiErrPlanTemplateEmpty",
  PLAN_SCHEDULE_TOO_LARGE: "apiErrPlanScheduleTooLarge",
  PLAN_SCHEDULE_TOO_DEEP: "apiErrPlanScheduleTooDeep",
  PLAN_SCHEDULE_INVALID: "apiErrPlanScheduleInvalid",
  PLAN_PROPOSAL_TOO_LARGE: "apiErrPlanProposalTooLarge",
  PLAN_ALREADY_LOADED: "apiErrPlanAlreadyLoaded",
  PLAN_RULE_INVALID: "apiErrPlanRuleInvalid",
  PLAN_RULE_NOT_FOUND: "apiErrPlanRuleNotFound",
  PLAN_RULE_CHANGED: "apiErrPlanRuleChanged",
  PLAN_RULE_STATE: "apiErrPlanRuleState",
  PLAN_RULE_PROMOTION_BLOCKED: "apiErrPlanRulePromotionBlocked",
  PLAN_RULE_LIMIT: "apiErrPlanRuleLimit",
  PLAN_ACTUALS_INCOMPLETE: "apiErrPlanActualsIncomplete",
  PLAN_ACTUALS_NOT_FOUND: "apiErrPlanActualsNotFound",
  PLAN_ACTUALS_CHANGED: "apiErrPlanActualsChanged",
  PLAN_ACTUALS_REVIEW_HIDDEN: "apiErrPlanActualsReviewHidden",
  PLAN_ACTUALS_USER_ACTIVE: "apiErrPlanActualsUserActive",
  PLAN_ACTUALS_CURRENT: "apiErrPlanActualsCurrent",
  PLAN_ROLE_ASSIGNMENT_INVALID: "apiErrPlanRoleAssignmentInvalid",
  CAPACITY_OVERLAP: "apiErrCapacityOverlap",
  CAPACITY_NOT_FOUND: "apiErrCapacityNotFound",
  CAPACITY_CHANGED: "apiErrCapacityChanged",
  CAPACITY_NOT_MEMBER: "apiErrCapacityNotMember",
  PLAN_LOAD_TOO_LARGE: "apiErrPlanLoadTooLarge",
  PLAN_ESTIMATE_STALE: "apiErrPlanEstimateStale",
  PLAN_ESTIMATE_RUN_NOT_FOUND: "apiErrPlanEstimateRunNotFound",
  PLAN_LINEAGE_NOT_ALLOWED: "apiErrPlanLineageNotAllowed",
  PLAN_ESTIMATE_EVAL_NOT_FOUND: "apiErrPlanEstimateEvalNotFound",
  PLAN_ESTIMATE_EVAL_CHANGED: "apiErrPlanEstimateEvalChanged",
  PLAN_ESTIMATE_EVAL_NOT_PASSING: "apiErrPlanEstimateEvalNotPassing",
  PLAN_ESTIMATE_EVAL_TOO_MANY: "apiErrPlanEstimateEvalTooMany",
  PLAN_ESTIMATE_PARAMS_NOT_FOUND: "apiErrPlanEstimateParamsNotFound",
  PLAN_ESTIMATE_PARAMS_CHANGED: "apiErrPlanEstimateParamsChanged",
  PLAN_ESTIMATE_PARAMS_DECIDED: "apiErrPlanEstimateParamsDecided",
  PLAN_ESTIMATE_PARAMS_NOT_PASSING: "apiErrPlanEstimateParamsNotPassing",
  FILE_REQUIRED: "apiErrFileRequired",
  FILE_EMPTY: "apiErrFileEmpty",
  FILE_MISSING: "apiErrFileMissing",
  INVALID_PATH: "apiErrInvalidPath",
  FOLDER_NOT_FOUND: "apiErrFolderNotFound",
  FOLDER_SELF_PARENT: "apiErrFolderSelfParent",
  FOLDER_CYCLE: "apiErrFolderCycle",
  LINK_URL_INVALID: "apiErrLinkUrlInvalid",
  LINK_ONLY_FIELD: "apiErrLinkOnlyField",
  TEAM_CHAT_EMPTY: "apiErrTeamChatEmpty",
  ICEBOX_TOO_MANY_ATTACHMENTS: "apiErrIceboxTooManyAttachments",
  PBI_TOO_MANY_ATTACHMENTS: "apiErrPbiTooManyAttachments",
  TEAM_CHAT_TOO_LONG: "apiErrTeamChatTooLong",
  TEAM_CHAT_TOO_MANY_FILES: "apiErrTeamChatTooManyFiles",
  TEAM_CHAT_FILE_TOO_LARGE: "apiErrTeamChatFileTooLarge",
  TEAM_CHAT_MESSAGE_NOT_FOUND: "apiErrTeamChatMessageNotFound",
  TEAM_CHAT_MIRROR_READONLY: "apiErrTeamChatMirrorReadonly",
  FILE_TYPE_MISMATCH: "apiErrFileTypeMismatch",
  STORAGE_QUOTA_EXCEEDED: "apiErrStorageQuotaExceeded",
  IMPROVEMENT_NEEDS_STANDARD: "apiErrImprovementNeedsStandard",
  IMPROVEMENT_NEEDS_SUSTAINED_CHECK: "apiErrImprovementNeedsSustainedCheck",
  IMPROVEMENT_TARGET_DIRECTION: "apiErrImprovementTargetDirection",
  IMPROVEMENT_TOO_MANY_PHOTOS: "apiErrImprovementTooManyPhotos",
  IMPROVEMENT_PHOTO_NOT_IMAGE: "apiErrImprovementPhotoNotImage",
  IMPROVEMENT_TOO_MANY_ROLLOUTS: "apiErrImprovementTooManyRollouts",
  IMPROVEMENT_TOO_MANY_CHECKS: "apiErrImprovementTooManyChecks",
  MILESTONE_LIMIT_REACHED: "apiErrMilestoneLimitReached",
  BOARD_LIMIT_REACHED: "apiErrBoardLimitReached",
  BOARD_SHEET_LIMIT_REACHED: "apiErrBoardSheetLimitReached",
  BOARD_LAST_SHEET: "apiErrBoardLastSheet",
  BOARD_SHEET_FULL: "apiErrBoardSheetFull",
  BOARD_WRITE_TOO_LARGE: "apiErrBoardWriteTooLarge",
  INVALID_DATE: "apiErrInvalidDate",
  GLOSSARY_SAME_LOCALE: "apiErrGlossarySameLocale",
  TRANSLATION_FAILED: "apiErrTranslationFailed",
  not_editable: "apiErrCollaboraNotEditable",
  wopi_token_missing: "apiErrCollaboraNotConfigured",
  collabora_unreachable: "apiErrCollaboraUnreachable",
  collabora_error: "apiErrCollaboraFailed",
  GIT_PROVIDER_UNSUPPORTED: "apiErrGitProviderUnsupported",
  GITSTATION_HOST_NOT_ALLOWED: "apiErrGitstationHostNotAllowed",
  GIT_RESYNC_UNAVAILABLE: "apiErrGitResyncUnavailable",
  GIT_KNOWLEDGE_UNSUPPORTED: "apiErrGitKnowledgeUnsupported",
  GIT_SOURCE_LOCKED: "apiErrGitSourceLocked",
  GIT_APPROVAL_UNAVAILABLE: "apiErrGitApprovalUnavailable",
  GIT_APPROVAL_NO_EMPLOYEE_NUMBER: "apiErrGitApprovalNoEmployeeNumber",
  GIT_APPROVAL_NOT_ALLOWED: "apiErrGitApprovalNotAllowed",
  GIT_APPROVAL_SELF: "apiErrGitApprovalSelf",
  GIT_APPROVAL_STALE: "apiErrGitApprovalStale",
  GIT_APPROVAL_NOT_CONFIRMED: "apiErrGitApprovalNotConfirmed",
  GIT_APPROVAL_RETRY: "apiErrGitApprovalRetry",
  GIT_APPROVAL_IDENTITY: "apiErrGitApprovalIdentity",
  GIT_APPROVAL_CONFIG: "apiErrGitApprovalConfig",
  GIT_APPROVAL_DIFFERENT_USER: "apiErrGitApprovalDifferentUser",
  GIT_APPROVAL_BUSY: "apiErrGitApprovalBusy",
  GIT_BINDING_UNAVAILABLE: "apiErrGitBindingUnavailable",
  GIT_BINDING_NOT_ALLOWED: "apiErrGitBindingNotAllowed",
  GIT_BINDING_CONFLICT: "apiErrGitBindingConflict",
  GIT_BINDING_ALREADY: "apiErrGitBindingAlready",
  GIT_BINDING_RESOLUTION_FIXED: "apiErrGitBindingResolutionFixed",
  GIT_BINDING_CONFIG: "apiErrGitBindingConfig",
  MR_URL_INVALID: "apiErrMrUrlInvalid",
  MR_REPOSITORY_NOT_REGISTERED: "apiErrMrRepositoryNotRegistered",
  CLAIM_RELEASED: "apiErrClaimReleased",
  TASK_CLAIMED: "apiErrTaskClaimed",
  CLAIM_LIMIT_REACHED: "apiErrClaimLimitReached",
  SCOPE_INVALID: "apiErrScopeInvalid",
  SCOPE_TOO_LARGE: "apiErrScopeTooLarge",
  AC_NOT_FOUND: "apiErrAcNotFound",
  AC_LIMIT_REACHED: "apiErrAcLimitReached",
  FEEDBACK_REDACTION_FAILED: "apiErrFeedbackRedactionFailed",
  FEEDBACK_NO_FAILURE: "apiErrFeedbackNoFailure",
  LESSON_NOT_FOUND: "apiErrLessonNotFound",
  LESSON_STATE: "apiErrLessonState",
  NETWORK_ERROR: "apiErrNetwork",
}

/** Message key for a server error code, or null for an unknown / missing code. */
export function apiErrorMessageKey(code: string | null | undefined): ApiErrorMessageKey | null {
  if (!code || !Object.prototype.hasOwnProperty.call(API_ERROR_MESSAGE_KEYS, code)) return null
  return API_ERROR_MESSAGE_KEYS[code as ApiErrorCode]
}

export const ja: ApiErrorsTranslations = {
  apiErrUnauthorized: "ログインが必要です。再度ログインしてください",
  apiErrForbidden: "この操作を行う権限がありません",
  apiErrNotFound: "対象が見つかりません（削除された可能性があります）",
  apiErrValidation: "入力値が不正です",
  apiErrInvalidJson: "リクエストの形式が不正です",
  apiErrConflict: "他の変更と競合しました。画面を更新してください",
  apiErrRateLimited: "試行回数が多すぎます。しばらくしてから再度お試しください",
  apiErrPayloadTooLarge: "ファイルサイズが上限を超えています",
  apiErrUnsupportedMedia: "許可されていないファイル形式です",
  apiErrInvalidReference: "参照先の項目が存在しません",
  apiErrInternal: "サーバーでエラーが発生しました",
  apiErrUpstreamFailed: "外部サービスとの通信に失敗しました",
  apiErrServiceUnavailable: "サービスが一時的に利用できません",
  apiErrVersionConflict: "他のユーザーが先に更新しました。最新の内容を読み込みました",
  apiErrVersionConflictReenter: "他のユーザーが先に更新したため、最新の内容に更新しました。変更を再入力してください",
  apiErrVersionConflictYourInput: "保存されなかったあなたの入力",
  apiErrVersionConflictRestore: "自分の入力に戻す",
  apiErrVersionConflictEmpty: "（空欄）",
  apiErrAdminRequired: "管理者権限が必要です",
  apiErrWrongPassword: "現在のパスワードが間違っています",
  apiErrPasswordTooShort: "パスワードは 6〜200 文字で入力してください",
  apiErrEmailTaken: "このメールアドレスは既に使用されています",
  apiErrEmployeeNumberTaken: "この従業員番号は既に使用されています",
  apiErrCannotDeactivateSelf: "自分自身を無効化することはできません",
  apiErrCannotDemoteSelf: "自分自身の管理者権限を外すことはできません",
  apiErrUserNotFound: "ユーザーが見つかりません",
  apiErrUserInactive: "無効化されたユーザーです",
  apiErrDuplicateName: "同じ名前が既に存在します",
  apiErrInsufficientScope: "このトークンにはこの操作の権限（スコープ）がありません",
  apiErrProgressPoOnly: "進捗の編集は PO のみが行えます",
  apiErrSectionsPoOrAdmin: "セクションの変更は PO または管理者が行えます",
  apiErrSectionNotFound: "指定されたセクションが見つかりません",
  apiErrMemberExists: "既にメンバーです",
  apiErrLastPoDemote: "最後のPOを降格することはできません。先に別のメンバーをPOに昇格してください。",
  apiErrLastPoRemove: "最後のPOを削除することはできません。先に別のメンバーをPOに昇格してください。",
  apiErrPbiNotFound: "PBI が見つかりません",
  apiErrIceboxItemNotFound: "IceBox の要望が見つかりません",
  apiErrProductGoalNotFound: "プロダクトゴールが見つかりません",
  apiErrReleaseNoPbi: "該当するPBIがありません",
  apiErrImprovementNoRequest: "該当する改善要望がありません",
  apiErrProjectInTrash: "プロジェクトがゴミ箱にあります。先にプロジェクトを復元してください",
  apiErrPbiContentRequired: "ユーザーストーリーかイニシアティブを入力してください",
  apiErrSprintNotFound: "スプリントが見つかりません",
  apiErrSprintActiveExists: "実行中のスプリントが既にあります。先にそのスプリントを完了してください",
  apiErrPlanItemNotFound: "対象の項目が見つかりません",
  apiErrPlanParentNotFound: "親項目が見つかりません",
  apiErrPlanSelfParent: "自分自身を親にできません",
  apiErrPlanCycle: "循環参照になります",
  apiErrPlanInvalidRange: "開始日は終了日以前にしてください",
  apiErrPlanParentDatesDerived: "子項目を持つ項目の期間は子項目から自動計算されます。子項目の日付を変更してください",
  apiErrPlanLinkRequiresLeaf: "PBI は子項目を持たない項目にのみ紐付けられます",
  apiErrPlanLinkMilestone: "マイルストーンには PBI を紐付けられません",
  apiErrPlanFollowsPbis: "進捗を紐づく PBI に合わせる項目の状態と実績日は、ここからは変更できません",
  apiErrPlanLinkInvalidPbi: "紐付けできない PBI が含まれています（削除済みまたは別プロジェクト）",
  apiErrPlanDependencyCycle: "依存関係が循環します",
  apiErrPlanDependencyInvalid: "この 2 項目の間には依存関係を設定できません（同一項目または親子関係）",
  apiErrPlanDependencyExists: "この依存関係は既に存在します",
  apiErrPbiDependencyCycle: "お互いを待つ関係（循環）になるため設定できません",
  apiErrPbiDependencyInvalid: "同じ PBI どうしには依存関係を設定できません",
  apiErrPbiDependencyExists: "この依存関係は既に設定されています",
  apiErrPlanOwnerNotMember: "担当者はプロジェクトメンバーから選択してください",
  apiErrPlanDatesIncomplete: "開始日と終了日は両方入力するか、両方空にしてください",
  apiErrPlanTemplateNotFound: "テンプレートが見つかりません",
  apiErrPlanTemplateBuiltin: "共通テンプレートは削除できません（デフォルトに戻すことはできます）",
  apiErrPlanTemplateDeleteForbidden: "このテンプレートを削除できるのは作成者または管理者だけです",
  apiErrPlanTemplateNotBuiltin: "デフォルトに戻せるのは共通テンプレートだけです",
  apiErrPlanTemplateTooLarge: "計画が大きすぎるためテンプレートにできません（3階層・200項目まで）",
  apiErrPlanTemplateEmpty: "読み込む・保存する工程がありません",
  apiErrPlanScheduleTooLarge: "計画は 500 件までです",
  apiErrPlanScheduleTooDeep: "計画の階層は 5 段までです",
  apiErrPlanScheduleInvalid: "計画の内容（キー・依存）に誤りがあります",
  apiErrPlanProposalTooLarge: "計画が大きすぎて提案にできません",
  apiErrPlanAlreadyLoaded: "この計画の読み込みは、すでにこのプロジェクトに反映済みです",
  apiErrPlanRuleInvalid: "反省点の規則の内容が正しくありません",
  apiErrPlanRuleNotFound: "反省点の規則が見つかりません",
  apiErrPlanRuleChanged: "反省点の規則が変更されています。読み込み直して、種類と数字を確かめてからやり直してください",
  apiErrPlanRuleState: "反省点の規則の状態が変わっています。読み込み直してからやり直してください",
  apiErrPlanRulePromotionBlocked: "この規則は他のプロジェクトへ広げられません（振り返りから作った規則か、出典が機密です）",
  apiErrPlanRuleLimit: "このプロジェクトの規則（下書きと確定）が上限に達しています。使わない規則を廃止してから書いてください",
  apiErrPlanActualsIncomplete: "実績に確かめてほしい項目があります。一覧を確かめてから確定してください",
  apiErrPlanActualsNotFound: "実績のスナップショットが見つかりません",
  apiErrPlanActualsChanged: "実績のスナップショットが変更されています。読み込み直してからやり直してください",
  apiErrPlanActualsReviewHidden: "機密の PBI を含む項目の提案は採用できません（採用しないことはできます）",
  apiErrPlanActualsUserActive: "在籍中の利用者の実績は仮名化できません",
  apiErrPlanActualsCurrent: "最新の記録は記録ごとには仮名化できません。退職者ごとに行ってください",
  apiErrPlanRoleAssignmentInvalid: "役割に割り当てられるのは、このプロジェクトのメンバーだけです",
  apiErrCapacityOverlap: "同じ人の期間が重なっています",
  apiErrCapacityNotFound: "稼働量の行が見つかりません",
  apiErrCapacityChanged: "稼働量が変更されています。読み込み直してからやり直してください",
  apiErrCapacityNotMember: "選んだ人はこのプロジェクトのメンバーではありません。メンバーから選んでください",
  apiErrPlanLoadTooLarge: "負荷を数える項目が多すぎます。期間を短くしてください",
  apiErrPlanEstimateStale: "この案を作った後に、規則・実績・稼働量などが変わりました。もう一度「計画を作る」から作り直してください",
  apiErrPlanEstimateRunNotFound: "この計画の案が見つかりません",
  apiErrPlanLineageNotAllowed: "この系統の名前は使えません（スケジュールの出典か、このプロジェクトが読み込んだ計画の系統を使ってください）",
  apiErrPlanEstimateEvalNotFound: "この系統の検証の記録がありません",
  apiErrPlanEstimateEvalChanged: "検証の記録が新しくなっています。表示を更新して、もう一度確かめてください",
  apiErrPlanEstimateEvalNotPassing: "この系統の検証は条件を満たしていないため、有効にできません",
  apiErrPlanEstimateEvalTooMany: "系統が多すぎて一度に計算できません",
  apiErrPlanEstimateParamsNotFound: "この系統のパラメータの提案がありません",
  apiErrPlanEstimateParamsChanged: "パラメータの提案が新しくなっています。表示を更新して、もう一度確かめてください",
  apiErrPlanEstimateParamsDecided: "この提案はもう承認または却下されています",
  apiErrPlanEstimateParamsNotPassing: "この提案の検証は条件を満たしていないため、承認できません",
  apiErrFileRequired: "ファイルがありません",
  apiErrFileEmpty: "ファイルが空です",
  apiErrFileMissing: "ファイルが見つかりません",
  apiErrInvalidPath: "パスが不正です",
  apiErrFolderNotFound: "フォルダがありません",
  apiErrFolderSelfParent: "自分自身を親にはできません",
  apiErrFolderCycle: "循環参照になります",
  apiErrLinkUrlInvalid: "http:// または https:// で始まる URL を入力してください",
  apiErrLinkOnlyField: "ファイルの名前や URL はここでは変更できません",
  apiErrTeamChatEmpty: "メッセージを入力するか、ファイルを添付してください",
  apiErrIceboxTooManyAttachments: "添付は 1 件につき 10 個までです",
  apiErrPbiTooManyAttachments: "参考資料の添付は 1 件につき 20 個までです",
  apiErrTeamChatTooLong: "メッセージが長すぎます",
  apiErrTeamChatTooManyFiles: "添付は 1 回に 5 個までです",
  apiErrTeamChatFileTooLarge: "ファイルが大きすぎます（1 ファイル 20MB、合計 50MB まで）。大きなファイルはリンクで共有してください",
  apiErrTeamChatMessageNotFound: "返信先のメッセージがありません",
  apiErrTeamChatMirrorReadonly: "スプリントなどのコメントは元の画面で削除してください",
  apiErrFileTypeMismatch: "ファイルの内容が拡張子と一致しません",
  apiErrStorageQuotaExceeded: "プロジェクトの添付ファイル容量の上限に達しました。不要なファイルを削除してください",
  apiErrImprovementNeedsStandard: "「標準化済み」にするには、先に標準書リンクを入れてください",
  apiErrImprovementNeedsSustainedCheck: "「定着確認済み」にするには、定着確認で「維持できている」を 1 回以上記録してください",
  apiErrImprovementTargetDirection: "目標値が改善前より良くなっていません（「良い方向」を確認してください）",
  apiErrImprovementTooManyPhotos: "写真は改善前・改善後それぞれ 10 枚までです",
  apiErrImprovementPhotoNotImage: "写真には画像ファイルを選んでください",
  apiErrImprovementTooManyRollouts: "横展開先が多すぎます",
  apiErrImprovementTooManyChecks: "定着確認が多すぎます",
  apiErrMilestoneLimitReached: "これ以上追加できません（件数の上限です）",
  apiErrBoardLimitReached: "ボードをこれ以上作れません（件数の上限です）。使わないボードを削除してください",
  apiErrBoardSheetLimitReached: "シートをこれ以上追加できません（件数の上限です）",
  apiErrBoardLastSheet: "最後のシートは削除できません",
  apiErrBoardSheetFull: "このシートにはこれ以上置けません（図形の数の上限です）。新しいシートを使ってください",
  apiErrBoardWriteTooLarge: "一度に保存できる量を超えました",
  apiErrInvalidDate: "日付が不正です",
  apiErrGlossarySameLocale: "翻訳元と翻訳先の言語は別にしてください",
  apiErrTranslationFailed: "翻訳に失敗しました",
  apiErrCollaboraNotEditable: "このファイル形式はCollaboraで編集できません",
  apiErrCollaboraNotConfigured: "オンライン編集が設定されていません。管理者に連絡してください",
  apiErrCollaboraUnreachable: "Collabora Online サーバーに接続できません。ファイルをダウンロードしてローカルのアプリケーションで編集してください。",
  apiErrCollaboraFailed: "Collaboraエディタの起動に失敗しました",
  apiErrGitProviderUnsupported: "この取り込み元には対応していません（対応: GitLab・GitStation）",
  apiErrGitstationHostNotAllowed: "GitStation のホストが許可されていません（管理者に GITSTATION_ALLOWED_HOSTS の設定を依頼してください）",
  apiErrGitResyncUnavailable: "連携 ID かアクセストークンが未設定のため、再同期できません",
  apiErrGitKnowledgeUnsupported: "この取り込み元のリポジトリは、まだ AI の参照資料に使えません",
  apiErrGitSourceLocked: "取り込み元はプロジェクトごとに 1 つです。切り替えるには先にリポジトリを外してください",
  apiErrGitApprovalUnavailable: "この MR はここから承認できません（GitStation の開いている MR だけが対象です）",
  apiErrGitApprovalNoEmployeeNumber: "社員番号が登録されていないため、GitStation で本人として操作できません。管理者に社員番号の登録を依頼してください",
  apiErrGitApprovalNotAllowed: "GitStation でこの MR を承認する権限がありません",
  apiErrGitApprovalSelf: "自分が作った MR は承認できません",
  apiErrGitApprovalStale: "MR が更新されました。新しい内容を見て、もう一度確認してください",
  apiErrGitApprovalNotConfirmed: "GitStation でまだ確認されていません。開いた GitStation の画面でボタンを押してから、もう一度「確認しました」を押してください",
  apiErrGitApprovalRetry: "この確認は使えなくなりました（期限切れ・使用済みなど）。もう一度やり直してください",
  apiErrGitApprovalIdentity: "GitStation がこの利用者の代わりに操作できません（GitStation に一度サインインしているか確かめてください）",
  apiErrGitApprovalConfig: "Git 連携の設定の問題で承認できません。管理者に連絡してください",
  apiErrGitApprovalDifferentUser: "GitStation で確認した人が、Kanflow にサインインしている人と違います。自分の GitStation のアカウントで確認し直してください",
  apiErrGitApprovalBusy: "処理中です。少し待ってください",
  apiErrGitBindingUnavailable: "このプロジェクトでは GitStation のリポジトリを結びつけられません（取り込み元が GitStation で、連携 ID とトークンが設定されている必要があります）",
  apiErrGitBindingNotAllowed: "GitStation でこのリポジトリを結びつける権限がありません（リポジトリの Maintainer 以上が必要です）",
  apiErrGitBindingConflict: "GitStation の結びつけの規則で断られました。コードのリポジトリは 1 つのプロジェクトにだけ、共有の仕様のリポジトリはコードの結びつけと同居できません",
  apiErrGitBindingAlready: "このリポジトリはすでにこの設定でこのプロジェクトに結びついています",
  apiErrGitBindingResolutionFixed: "コードのリポジトリを共有の仕様のリポジトリに変えることはできません。いったん解除してから、共有の仕様として結び直してください",
  apiErrGitBindingConfig: "Git 連携の設定の問題で結びつけを変更できません。管理者に連絡してください",
  apiErrMrUrlInvalid: "マージリクエストの URL ではありません（許可された Git サーバーの …/-/merge_requests/<番号> の形）",
  apiErrMrRepositoryNotRegistered: "このマージリクエストのリポジトリは、このプロジェクトの Git 連携に登録されていません",
  apiErrClaimReleased: "この作業の宣言はすでに解除されています。もう一度宣言してください",
  apiErrTaskClaimed: "このタスクは他の人（または別のセッション）が作業中です",
  apiErrClaimLimitReached: "このプロジェクトで同時に宣言できる作業の上限に達しています。終わった作業を解除してください",
  apiErrAcNotFound: "この受入基準は見つかりません（削除された可能性があります）",
  apiErrAcLimitReached: "この PBI の受入基準が上限に達しています。不要な項目を削除してください",
  apiErrFeedbackRedactionFailed: "報告に認証情報らしい内容が残っているため、保存しませんでした。取り除いてから送り直してください",
  apiErrFeedbackNoFailure: "このセッションに、解決を結び付ける未解決の失敗がありません",
  apiErrLessonNotFound: "この教訓は見つかりません",
  apiErrLessonState: "教訓の状態が変わっています。読み込み直してからやり直してください",
  apiErrScopeInvalid: "触る範囲に使えない書き方があります。リポジトリの中の相対パス（.. や / で始まる形は不可）かモジュール名で書いてください",
  apiErrScopeTooLarge: "触る範囲が多すぎます（1 つの宣言に 200 件まで）。ディレクトリやモジュールでまとめてください",
  apiErrNetwork: "サーバーに接続できません。ネットワークを確認してください",
}

export const en: ApiErrorsTranslations = {
  apiErrUnauthorized: "You are signed out. Please sign in again",
  apiErrForbidden: "You do not have permission for this action",
  apiErrNotFound: "Not found (it may have been deleted)",
  apiErrValidation: "Invalid input",
  apiErrInvalidJson: "Malformed request",
  apiErrConflict: "Conflicts with another change. Please refresh",
  apiErrRateLimited: "Too many attempts. Please try again later",
  apiErrPayloadTooLarge: "The file exceeds the size limit",
  apiErrUnsupportedMedia: "This file type is not allowed",
  apiErrInvalidReference: "A referenced item does not exist",
  apiErrInternal: "A server error occurred",
  apiErrUpstreamFailed: "Communication with an external service failed",
  apiErrServiceUnavailable: "The service is temporarily unavailable",
  apiErrVersionConflict: "Someone else updated this first. The latest version has been loaded",
  apiErrVersionConflictReenter: "Someone else saved first, so the latest version was loaded. Please enter your changes again",
  apiErrVersionConflictYourInput: "Your unsaved input",
  apiErrVersionConflictRestore: "Restore my input",
  apiErrVersionConflictEmpty: "(empty)",
  apiErrAdminRequired: "Administrator permission is required",
  apiErrWrongPassword: "The current password is incorrect",
  apiErrPasswordTooShort: "The password must be 6-200 characters",
  apiErrEmailTaken: "This email address is already in use",
  apiErrEmployeeNumberTaken: "This employee number is already in use",
  apiErrCannotDeactivateSelf: "You cannot deactivate yourself",
  apiErrCannotDemoteSelf: "You cannot remove your own administrator role",
  apiErrUserNotFound: "User not found",
  apiErrUserInactive: "This user is deactivated",
  apiErrDuplicateName: "The same name already exists",
  apiErrInsufficientScope: "This token does not have the scope for this action",
  apiErrProgressPoOnly: "Only the PO can edit the progress",
  apiErrSectionsPoOrAdmin: "Only the PO or an administrator can change sections",
  apiErrSectionNotFound: "The specified section was not found",
  apiErrMemberExists: "Already a member",
  apiErrLastPoDemote: "You cannot demote the last PO. Promote another member to PO first.",
  apiErrLastPoRemove: "You cannot remove the last PO. Promote another member to PO first.",
  apiErrPbiNotFound: "PBI not found",
  apiErrIceboxItemNotFound: "IceBox request not found",
  apiErrProductGoalNotFound: "Product goal not found",
  apiErrReleaseNoPbi: "No matching PBIs",
  apiErrImprovementNoRequest: "No matching improvement requests",
  apiErrProjectInTrash: "The project is in the trash. Restore the project first",
  apiErrPbiContentRequired: "Enter a user story or an initiative",
  apiErrSprintNotFound: "Sprint not found",
  apiErrSprintActiveExists: "Another sprint is already running. Finish it first",
  apiErrPlanItemNotFound: "Some items were not found",
  apiErrPlanParentNotFound: "Parent item not found",
  apiErrPlanSelfParent: "An item cannot be its own parent",
  apiErrPlanCycle: "This would create a circular reference",
  apiErrPlanInvalidRange: "The start date must be on or before the end date",
  apiErrPlanParentDatesDerived: "The dates of an item with children are calculated from its children. Change the child items instead",
  apiErrPlanLinkRequiresLeaf: "PBIs can only be linked to items without children",
  apiErrPlanLinkMilestone: "PBIs cannot be linked to a milestone",
  apiErrPlanFollowsPbis: "The status and actual dates of an item that follows its linked PBIs cannot be changed from here",
  apiErrPlanLinkInvalidPbi: "Some PBIs cannot be linked (deleted or in another project)",
  apiErrPlanDependencyCycle: "This dependency would create a cycle",
  apiErrPlanDependencyInvalid: "A dependency cannot be set between these items (same item or parent/child)",
  apiErrPlanDependencyExists: "This dependency already exists",
  apiErrPbiDependencyCycle: "These PBIs would wait for each other (a cycle)",
  apiErrPbiDependencyInvalid: "A PBI cannot depend on itself",
  apiErrPbiDependencyExists: "This dependency is already set",
  apiErrPlanOwnerNotMember: "The owner must be a member of the project",
  apiErrPlanDatesIncomplete: "Enter both the start and the end date, or leave both empty",
  apiErrPlanTemplateNotFound: "Template not found",
  apiErrPlanTemplateBuiltin: "Common templates cannot be deleted (you can reset them to the default)",
  apiErrPlanTemplateDeleteForbidden: "Only the creator or an admin can delete this template",
  apiErrPlanTemplateNotBuiltin: "Only common templates can be reset to the default",
  apiErrPlanTemplateTooLarge: "The plan is too large to save as a template (3 levels, 200 items max)",
  apiErrPlanTemplateEmpty: "There are no stages to load or save",
  apiErrPlanScheduleTooLarge: "A schedule has at most 500 items",
  apiErrPlanScheduleTooDeep: "A schedule is at most 5 levels deep",
  apiErrPlanScheduleInvalid: "The schedule has an invalid key or dependency",
  apiErrPlanProposalTooLarge: "The schedule is too large to propose",
  apiErrPlanAlreadyLoaded: "This plan proposal was already loaded into this project",
  apiErrPlanRuleInvalid: "The lesson rule is not valid",
  apiErrPlanRuleNotFound: "Lesson rule not found",
  apiErrPlanRuleChanged: "The lesson rule has changed. Reload, check its kind and numbers, and try again",
  apiErrPlanRuleState: "The lesson rule's state has changed. Reload and try again",
  apiErrPlanRulePromotionBlocked: "This rule cannot be shared with other projects (it comes from a retrospective or cites a confidential source)",
  apiErrPlanRuleLimit: "This project has reached the limit of draft and confirmed rules. Retire rules you no longer use first",
  apiErrPlanActualsIncomplete: "Some items of the actuals need checking. Review the list, then finalize",
  apiErrPlanActualsNotFound: "Actuals snapshot not found",
  apiErrPlanActualsChanged: "The actuals snapshot has changed. Reload and try again",
  apiErrPlanActualsReviewHidden: "A proposal on an item with a confidential PBI cannot be accepted (you can still decline it)",
  apiErrPlanActualsUserActive: "The actuals of an active user cannot be pseudonymised",
  apiErrPlanActualsCurrent: "The latest record cannot be pseudonymised as a whole. Pseudonymise by retired user instead",
  apiErrPlanRoleAssignmentInvalid: "Only members of this project can be assigned to a role",
  apiErrCapacityOverlap: "The period overlaps another one of the same person",
  apiErrCapacityNotFound: "Capacity entry not found",
  apiErrCapacityChanged: "The capacity has changed. Reload and try again",
  apiErrCapacityNotMember: "The selected person is not a member of this project. Pick a member",
  apiErrPlanLoadTooLarge: "Too many items to count the load. Choose a shorter period",
  apiErrPlanEstimateStale: "The rules, actuals or capacity changed after this proposal was made. Make the plan again",
  apiErrPlanEstimateRunNotFound: "This plan proposal was not found",
  apiErrPlanLineageNotAllowed: "This lineage cannot be used (use the schedule source's or one this project already loaded)",
  apiErrPlanEstimateEvalNotFound: "There is no check of this lineage yet",
  apiErrPlanEstimateEvalChanged: "The check has been updated. Reload and look at it again",
  apiErrPlanEstimateEvalNotPassing: "This lineage's check does not meet the conditions, so it cannot be turned on",
  apiErrPlanEstimateEvalTooMany: "There are too many lineages to compute at once",
  apiErrPlanEstimateParamsNotFound: "There is no settings proposal for this lineage",
  apiErrPlanEstimateParamsChanged: "The settings proposal has been updated. Reload and look at it again",
  apiErrPlanEstimateParamsDecided: "This proposal has already been approved or rejected",
  apiErrPlanEstimateParamsNotPassing: "This proposal's check does not meet the conditions, so it cannot be approved",
  apiErrFileRequired: "No file was provided",
  apiErrFileEmpty: "The file is empty",
  apiErrFileMissing: "The file was not found",
  apiErrInvalidPath: "Invalid path",
  apiErrFolderNotFound: "Folder not found",
  apiErrFolderSelfParent: "A folder cannot be its own parent",
  apiErrFolderCycle: "This would create a circular folder structure",
  apiErrLinkUrlInvalid: "Enter a URL starting with http:// or https://",
  apiErrLinkOnlyField: "The name or URL of a file cannot be changed here",
  apiErrTeamChatEmpty: "Type a message or attach a file",
  apiErrIceboxTooManyAttachments: "Up to 10 attachments per request",
  apiErrPbiTooManyAttachments: "Up to 20 reference attachments per PBI",
  apiErrTeamChatTooLong: "The message is too long",
  apiErrTeamChatTooManyFiles: "Up to 5 files per message",
  apiErrTeamChatFileTooLarge: "The file is too large (20 MB per file, 50 MB in total). Share large files as a link",
  apiErrTeamChatMessageNotFound: "The message you are replying to no longer exists",
  apiErrTeamChatMirrorReadonly: "Delete sprint / backlog comments where they were written",
  apiErrFileTypeMismatch: "The file contents do not match its extension",
  apiErrStorageQuotaExceeded: "This project has reached its attachment storage limit. Delete files you no longer need",
  apiErrImprovementNeedsStandard: "Add the standard document link before marking it as standardized",
  apiErrImprovementNeedsSustainedCheck: "Record at least one \"still sustained\" check before marking it as sustained",
  apiErrImprovementTargetDirection: "The target is not better than the baseline (check \"better when\")",
  apiErrImprovementTooManyPhotos: "Up to 10 photos each for before and after",
  apiErrImprovementPhotoNotImage: "Please choose an image file for the photo",
  apiErrImprovementTooManyRollouts: "Too many rollout targets",
  apiErrImprovementTooManyChecks: "Too many sustainment checks",
  apiErrMilestoneLimitReached: "Cannot add more (the limit has been reached)",
  apiErrBoardLimitReached: "Cannot create more boards (the limit has been reached). Delete boards you no longer use",
  apiErrBoardSheetLimitReached: "Cannot add more sheets (the limit has been reached)",
  apiErrBoardLastSheet: "The last sheet cannot be deleted",
  apiErrBoardSheetFull: "This sheet cannot hold more shapes (the limit has been reached). Use a new sheet",
  apiErrBoardWriteTooLarge: "Too much to save at once",
  apiErrInvalidDate: "Invalid date",
  apiErrGlossarySameLocale: "Source and target languages must differ",
  apiErrTranslationFailed: "Translation failed",
  apiErrCollaboraNotEditable: "This file type cannot be edited in Collabora",
  apiErrCollaboraNotConfigured: "Online editing is not configured. Please contact an administrator",
  apiErrCollaboraUnreachable: "Cannot connect to the Collabora Online server. Download the file and edit it locally.",
  apiErrCollaboraFailed: "Failed to start the Collabora editor",
  apiErrGitProviderUnsupported: "This source is not supported (supported: GitLab, GitStation)",
  apiErrGitstationHostNotAllowed: "No GitStation host is allowed (ask the administrator to set GITSTATION_ALLOWED_HOSTS)",
  apiErrGitResyncUnavailable: "Cannot resync: the integration ID or the access token is not set",
  apiErrGitKnowledgeUnsupported: "Repositories of this source cannot be used as AI reference material yet",
  apiErrGitSourceLocked: "A project reads from one source only. Remove its repositories before switching the source",
  apiErrGitApprovalUnavailable: "This merge request cannot be approved from here (only open GitStation merge requests can)",
  apiErrGitApprovalNoEmployeeNumber: "Your employee number is not registered, so GitStation cannot act as you. Ask an administrator to register it",
  apiErrGitApprovalNotAllowed: "You are not allowed to approve this merge request in GitStation",
  apiErrGitApprovalSelf: "You cannot approve your own merge request",
  apiErrGitApprovalStale: "The merge request was updated. Review the new changes and confirm again",
  apiErrGitApprovalNotConfirmed: "Not confirmed in GitStation yet. Press the button on the GitStation page you opened, then press \"I confirmed\" again",
  apiErrGitApprovalRetry: "This confirmation can no longer be used (expired or already used). Please start again",
  apiErrGitApprovalIdentity: "GitStation cannot act for this user (check that you have signed in to GitStation at least once)",
  apiErrGitApprovalConfig: "Approval is not possible because of the Git integration settings. Contact an administrator",
  apiErrGitApprovalDifferentUser: "The person who confirmed in GitStation is not the person signed in to Kanflow. Confirm again with your own GitStation account",
  apiErrGitApprovalBusy: "Already in progress. Please wait a moment",
  apiErrGitBindingUnavailable: "Repositories cannot be bound here (the source must be GitStation, with the integration ID and token set)",
  apiErrGitBindingNotAllowed: "You are not allowed to bind this repository in GitStation (Maintainer or above of the repository is needed)",
  apiErrGitBindingConflict: "GitStation's binding rules refused this. A code repository belongs to one project only, and a shared spec repository cannot be mixed with a code binding",
  apiErrGitBindingAlready: "This repository is already bound to this project with this setting",
  apiErrGitBindingResolutionFixed: "A code repository cannot be changed into a shared spec repository. Unbind it first, then bind it again as shared specs",
  apiErrGitBindingConfig: "The binding cannot be changed because of the Git integration settings. Contact an administrator",
  apiErrMrUrlInvalid: "Not a merge request URL (…/-/merge_requests/<number> on an allowed Git server)",
  apiErrMrRepositoryNotRegistered: "The merge request's repository is not registered in this project's Git integration",
  apiErrClaimReleased: "This work claim was already released. Claim the work again",
  apiErrTaskClaimed: "Someone else (or another session) is already working on this",
  apiErrClaimLimitReached: "You already hold the maximum number of active work claims in this project. Release finished work first",
  apiErrAcNotFound: "This acceptance criterion was not found (it may have been deleted)",
  apiErrAcLimitReached: "This PBI already has the maximum number of acceptance criteria. Delete items you no longer need",
  apiErrFeedbackRedactionFailed: "The report still contains something that looks like a credential, so it was not stored. Remove it and send again",
  apiErrFeedbackNoFailure: "This session has no unresolved failure to attach the resolution to",
  apiErrLessonNotFound: "This lesson was not found",
  apiErrLessonState: "The lesson's state has changed. Reload and try again",
  apiErrScopeInvalid: "An entry of the touched scope cannot be used. Give a relative path inside the repository (no .., not starting with /) or a module name",
  apiErrScopeTooLarge: "The touched scope is too large (at most 200 entries per claim). Group files by directory or module",
  apiErrNetwork: "Cannot reach the server. Please check your network",
}

export const id: ApiErrorsTranslations = {
  apiErrUnauthorized: "Sesi Anda telah berakhir. Silakan masuk kembali",
  apiErrForbidden: "Anda tidak memiliki izin untuk tindakan ini",
  apiErrNotFound: "Data tidak ditemukan (mungkin sudah dihapus)",
  apiErrValidation: "Input tidak valid",
  apiErrInvalidJson: "Format permintaan tidak valid",
  apiErrConflict: "Bertabrakan dengan perubahan lain. Silakan muat ulang halaman",
  apiErrRateLimited: "Terlalu banyak percobaan. Silakan coba lagi nanti",
  apiErrPayloadTooLarge: "Ukuran file melebihi batas",
  apiErrUnsupportedMedia: "Jenis file ini tidak diizinkan",
  apiErrInvalidReference: "Item yang dirujuk tidak ada",
  apiErrInternal: "Terjadi kesalahan pada server",
  apiErrUpstreamFailed: "Komunikasi dengan layanan eksternal gagal",
  apiErrServiceUnavailable: "Layanan sementara tidak tersedia",
  apiErrVersionConflict: "Pengguna lain sudah memperbarui lebih dulu. Versi terbaru telah dimuat",
  apiErrVersionConflictReenter: "Pengguna lain menyimpan lebih dulu, jadi versi terbaru dimuat. Masukkan kembali perubahan Anda",
  apiErrVersionConflictYourInput: "Masukan Anda yang belum tersimpan",
  apiErrVersionConflictRestore: "Pulihkan masukan saya",
  apiErrVersionConflictEmpty: "(kosong)",
  apiErrAdminRequired: "Diperlukan hak akses administrator",
  apiErrWrongPassword: "Kata sandi saat ini salah",
  apiErrPasswordTooShort: "Kata sandi harus 6-200 karakter",
  apiErrEmailTaken: "Alamat email ini sudah digunakan",
  apiErrEmployeeNumberTaken: "Nomor karyawan ini sudah digunakan",
  apiErrCannotDeactivateSelf: "Anda tidak dapat menonaktifkan akun Anda sendiri",
  apiErrCannotDemoteSelf: "Anda tidak dapat mencabut hak administrator Anda sendiri",
  apiErrUserNotFound: "Pengguna tidak ditemukan",
  apiErrUserInactive: "Pengguna ini telah dinonaktifkan",
  apiErrDuplicateName: "Nama yang sama sudah ada",
  apiErrInsufficientScope: "Token ini tidak memiliki cakupan untuk tindakan ini",
  apiErrProgressPoOnly: "Hanya PO yang dapat mengubah progres",
  apiErrSectionsPoOrAdmin: "Hanya PO atau administrator yang dapat mengubah seksi",
  apiErrSectionNotFound: "Seksi yang ditentukan tidak ditemukan",
  apiErrMemberExists: "Sudah menjadi anggota",
  apiErrLastPoDemote: "PO terakhir tidak dapat diturunkan. Angkat anggota lain menjadi PO terlebih dahulu.",
  apiErrLastPoRemove: "PO terakhir tidak dapat dihapus. Angkat anggota lain menjadi PO terlebih dahulu.",
  apiErrPbiNotFound: "PBI tidak ditemukan",
  apiErrIceboxItemNotFound: "Permintaan IceBox tidak ditemukan",
  apiErrProductGoalNotFound: "Tujuan produk tidak ditemukan",
  apiErrReleaseNoPbi: "Tidak ada PBI yang sesuai",
  apiErrImprovementNoRequest: "Tidak ada permintaan perbaikan yang sesuai",
  apiErrProjectInTrash: "Proyek ada di tempat sampah. Pulihkan proyek terlebih dahulu",
  apiErrPbiContentRequired: "Isi user story atau inisiatif",
  apiErrSprintNotFound: "Sprint tidak ditemukan",
  apiErrSprintActiveExists: "Sudah ada Sprint yang sedang berjalan. Selesaikan dulu",
  apiErrPlanItemNotFound: "Beberapa item tidak ditemukan",
  apiErrPlanParentNotFound: "Item induk tidak ditemukan",
  apiErrPlanSelfParent: "Item tidak dapat menjadi induk bagi dirinya sendiri",
  apiErrPlanCycle: "Tindakan ini akan membuat referensi melingkar",
  apiErrPlanInvalidRange: "Tanggal mulai harus sama dengan atau sebelum tanggal selesai",
  apiErrPlanParentDatesDerived: "Tanggal item yang memiliki sub-item dihitung dari sub-itemnya. Ubah tanggal sub-item",
  apiErrPlanLinkRequiresLeaf: "PBI hanya dapat ditautkan ke item tanpa sub-item",
  apiErrPlanLinkMilestone: "PBI tidak dapat ditautkan ke milestone",
  apiErrPlanFollowsPbis: "Status dan tanggal aktual item yang mengikuti PBI tertaut tidak dapat diubah dari sini",
  apiErrPlanLinkInvalidPbi: "Beberapa PBI tidak dapat ditautkan (dihapus atau di proyek lain)",
  apiErrPlanDependencyCycle: "Dependensi ini akan membuat siklus",
  apiErrPlanDependencyInvalid: "Dependensi tidak dapat diatur antara item ini (item yang sama atau induk/anak)",
  apiErrPlanDependencyExists: "Dependensi ini sudah ada",
  apiErrPbiDependencyCycle: "PBI ini akan saling menunggu (siklus)",
  apiErrPbiDependencyInvalid: "PBI tidak dapat bergantung pada dirinya sendiri",
  apiErrPbiDependencyExists: "Dependensi ini sudah diatur",
  apiErrPlanOwnerNotMember: "Penanggung jawab harus anggota proyek",
  apiErrPlanDatesIncomplete: "Isi tanggal mulai dan selesai, atau kosongkan keduanya",
  apiErrPlanTemplateNotFound: "Templat tidak ditemukan",
  apiErrPlanTemplateBuiltin: "Templat umum tidak dapat dihapus (dapat dikembalikan ke default)",
  apiErrPlanTemplateDeleteForbidden: "Hanya pembuat atau admin yang dapat menghapus templat ini",
  apiErrPlanTemplateNotBuiltin: "Hanya templat umum yang dapat dikembalikan ke default",
  apiErrPlanTemplateTooLarge: "Rencana terlalu besar untuk disimpan sebagai templat (maks. 3 tingkat, 200 item)",
  apiErrPlanTemplateEmpty: "Tidak ada tahapan untuk dimuat atau disimpan",
  apiErrPlanScheduleTooLarge: "Jadwal maksimal 500 item",
  apiErrPlanScheduleTooDeep: "Jadwal maksimal 5 tingkat",
  apiErrPlanScheduleInvalid: "Jadwal memiliki kunci atau ketergantungan yang tidak valid",
  apiErrPlanProposalTooLarge: "Jadwal terlalu besar untuk diusulkan",
  apiErrPlanAlreadyLoaded: "Usulan rencana ini sudah dimuat ke proyek ini",
  apiErrPlanRuleInvalid: "Aturan pelajaran tidak valid",
  apiErrPlanRuleNotFound: "Aturan pelajaran tidak ditemukan",
  apiErrPlanRuleChanged: "Aturan pelajaran telah berubah. Muat ulang, periksa jenis dan angkanya, lalu coba lagi",
  apiErrPlanRuleState: "Status aturan pelajaran telah berubah. Muat ulang lalu coba lagi",
  apiErrPlanRulePromotionBlocked: "Aturan ini tidak dapat dibagikan ke proyek lain (berasal dari retrospektif atau mengutip sumber rahasia)",
  apiErrPlanRuleLimit: "Proyek ini telah mencapai batas aturan draf dan terkonfirmasi. Nonaktifkan aturan yang tidak dipakai terlebih dahulu",
  apiErrPlanActualsIncomplete: "Beberapa item realisasi perlu diperiksa. Tinjau daftarnya, lalu finalkan",
  apiErrPlanActualsNotFound: "Snapshot realisasi tidak ditemukan",
  apiErrPlanActualsChanged: "Snapshot realisasi telah berubah. Muat ulang lalu coba lagi",
  apiErrPlanActualsReviewHidden: "Usulan pada item dengan PBI rahasia tidak dapat diterima (masih dapat ditolak)",
  apiErrPlanActualsUserActive: "Realisasi pengguna yang masih aktif tidak dapat disamarkan",
  apiErrPlanActualsCurrent: "Catatan terbaru tidak dapat disamarkan sekaligus. Samarkan per pengguna yang sudah keluar",
  apiErrPlanRoleAssignmentInvalid: "Hanya anggota proyek ini yang dapat ditugaskan ke suatu peran",
  apiErrCapacityOverlap: "Periodenya tumpang tindih dengan periode lain dari orang yang sama",
  apiErrCapacityNotFound: "Data kapasitas tidak ditemukan",
  apiErrCapacityChanged: "Kapasitas telah berubah. Muat ulang lalu coba lagi",
  apiErrCapacityNotMember: "Orang yang dipilih bukan anggota proyek ini. Pilih salah satu anggota",
  apiErrPlanLoadTooLarge: "Terlalu banyak item untuk menghitung beban. Pilih periode yang lebih pendek",
  apiErrPlanEstimateStale: "Aturan, data aktual, atau kapasitas berubah setelah usulan ini dibuat. Buat rencananya lagi",
  apiErrPlanEstimateRunNotFound: "Usulan rencana ini tidak ditemukan",
  apiErrPlanLineageNotAllowed: "Nama lini ini tidak dapat dipakai (pakai lini dari sumber jadwal atau yang sudah dimuat proyek ini)",
  apiErrPlanEstimateEvalNotFound: "Belum ada pengujian untuk lini ini",
  apiErrPlanEstimateEvalChanged: "Hasil pengujian sudah diperbarui. Muat ulang dan periksa lagi",
  apiErrPlanEstimateEvalNotPassing: "Pengujian lini ini tidak memenuhi syarat, sehingga tidak dapat diaktifkan",
  apiErrPlanEstimateEvalTooMany: "Terlalu banyak lini untuk dihitung sekaligus",
  apiErrPlanEstimateParamsNotFound: "Belum ada usulan parameter untuk lini ini",
  apiErrPlanEstimateParamsChanged: "Usulan parameter sudah diperbarui. Muat ulang dan periksa lagi",
  apiErrPlanEstimateParamsDecided: "Usulan ini sudah disetujui atau ditolak",
  apiErrPlanEstimateParamsNotPassing: "Pengujian usulan ini tidak memenuhi syarat, sehingga tidak dapat disetujui",
  apiErrFileRequired: "Tidak ada file yang dikirim",
  apiErrFileEmpty: "File kosong",
  apiErrFileMissing: "File tidak ditemukan",
  apiErrInvalidPath: "Path tidak valid",
  apiErrFolderNotFound: "Folder tidak ditemukan",
  apiErrFolderSelfParent: "Folder tidak dapat menjadi induk bagi dirinya sendiri",
  apiErrFolderCycle: "Tindakan ini akan membuat struktur folder melingkar",
  apiErrLinkUrlInvalid: "Masukkan URL yang diawali http:// atau https://",
  apiErrLinkOnlyField: "Nama atau URL file tidak dapat diubah di sini",
  apiErrTeamChatEmpty: "Ketik pesan atau lampirkan berkas",
  apiErrIceboxTooManyAttachments: "Maksimal 10 lampiran per permintaan",
  apiErrPbiTooManyAttachments: "Maksimal 20 lampiran referensi per PBI",
  apiErrTeamChatTooLong: "Pesan terlalu panjang",
  apiErrTeamChatTooManyFiles: "Maksimal 5 berkas per pesan",
  apiErrTeamChatFileTooLarge: "Berkas terlalu besar (20 MB per berkas, total 50 MB). Bagikan berkas besar sebagai tautan",
  apiErrTeamChatMessageNotFound: "Pesan yang dibalas sudah tidak ada",
  apiErrTeamChatMirrorReadonly: "Hapus komentar sprint/backlog di tempat aslinya",
  apiErrFileTypeMismatch: "Isi file tidak sesuai dengan ekstensinya",
  apiErrStorageQuotaExceeded: "Proyek ini telah mencapai batas penyimpanan lampiran. Hapus file yang tidak diperlukan",
  apiErrImprovementNeedsStandard: "Isi tautan dokumen standar terlebih dahulu sebelum menandai sebagai sudah distandarkan",
  apiErrImprovementNeedsSustainedCheck: "Catat minimal satu pengecekan \"masih terjaga\" sebelum menandai sebagai sudah terjaga",
  apiErrImprovementTargetDirection: "Target tidak lebih baik dari kondisi awal (periksa \"lebih baik jika\")",
  apiErrImprovementTooManyPhotos: "Maksimal 10 foto masing-masing untuk sebelum dan sesudah",
  apiErrImprovementPhotoNotImage: "Pilih file gambar untuk foto",
  apiErrImprovementTooManyRollouts: "Terlalu banyak tujuan penerapan",
  apiErrImprovementTooManyChecks: "Terlalu banyak pengecekan",
  apiErrMilestoneLimitReached: "Tidak dapat menambah lagi (batas jumlah tercapai)",
  apiErrBoardLimitReached: "Tidak dapat membuat papan lagi (batas jumlah tercapai). Hapus papan yang tidak dipakai",
  apiErrBoardSheetLimitReached: "Tidak dapat menambah lembar lagi (batas jumlah tercapai)",
  apiErrBoardLastSheet: "Lembar terakhir tidak dapat dihapus",
  apiErrBoardSheetFull: "Lembar ini tidak dapat memuat bentuk lagi (batas jumlah tercapai). Gunakan lembar baru",
  apiErrBoardWriteTooLarge: "Terlalu banyak untuk disimpan sekaligus",
  apiErrInvalidDate: "Tanggal tidak valid",
  apiErrGlossarySameLocale: "Bahasa sumber dan bahasa tujuan harus berbeda",
  apiErrTranslationFailed: "Terjemahan gagal",
  apiErrCollaboraNotEditable: "Jenis file ini tidak dapat diedit di Collabora",
  apiErrCollaboraNotConfigured: "Pengeditan online belum dikonfigurasi. Silakan hubungi administrator",
  apiErrCollaboraUnreachable: "Tidak dapat terhubung ke server Collabora Online. Unduh file dan edit secara lokal.",
  apiErrCollaboraFailed: "Gagal membuka editor Collabora",
  apiErrGitProviderUnsupported: "Sumber ini tidak didukung (didukung: GitLab, GitStation)",
  apiErrGitstationHostNotAllowed: "Tidak ada host GitStation yang diizinkan (minta administrator mengatur GITSTATION_ALLOWED_HOSTS)",
  apiErrGitResyncUnavailable: "Tidak dapat sinkron ulang: ID integrasi atau token akses belum diatur",
  apiErrGitKnowledgeUnsupported: "Repositori dari sumber ini belum dapat dipakai sebagai bahan referensi AI",
  apiErrGitSourceLocked: "Satu proyek hanya membaca dari satu sumber. Hapus repositorinya terlebih dahulu sebelum mengganti sumber",
  apiErrGitApprovalUnavailable: "Merge request ini tidak dapat disetujui dari sini (hanya merge request GitStation yang terbuka)",
  apiErrGitApprovalNoEmployeeNumber: "Nomor karyawan Anda belum terdaftar, sehingga GitStation tidak dapat bertindak atas nama Anda. Minta administrator untuk mendaftarkannya",
  apiErrGitApprovalNotAllowed: "Anda tidak diizinkan menyetujui merge request ini di GitStation",
  apiErrGitApprovalSelf: "Anda tidak dapat menyetujui merge request milik sendiri",
  apiErrGitApprovalStale: "Merge request telah diperbarui. Tinjau perubahan baru lalu konfirmasi lagi",
  apiErrGitApprovalNotConfirmed: "Belum dikonfirmasi di GitStation. Tekan tombol di halaman GitStation yang Anda buka, lalu tekan \"Sudah saya konfirmasi\" lagi",
  apiErrGitApprovalRetry: "Konfirmasi ini tidak dapat digunakan lagi (kedaluwarsa atau sudah dipakai). Silakan mulai lagi",
  apiErrGitApprovalIdentity: "GitStation tidak dapat bertindak untuk pengguna ini (pastikan Anda pernah masuk ke GitStation)",
  apiErrGitApprovalConfig: "Persetujuan tidak dapat dilakukan karena pengaturan integrasi Git. Hubungi administrator",
  apiErrGitApprovalDifferentUser: "Orang yang mengonfirmasi di GitStation bukan orang yang masuk ke Kanflow. Konfirmasi lagi dengan akun GitStation Anda sendiri",
  apiErrGitApprovalBusy: "Sedang diproses. Mohon tunggu sebentar",
  apiErrGitBindingUnavailable: "Repositori tidak dapat dihubungkan di sini (sumber harus GitStation, dengan ID integrasi dan token yang sudah diatur)",
  apiErrGitBindingNotAllowed: "Anda tidak diizinkan menghubungkan repositori ini di GitStation (diperlukan peran Maintainer atau lebih tinggi pada repositori)",
  apiErrGitBindingConflict: "Ditolak oleh aturan pengikatan GitStation. Repositori kode hanya untuk satu proyek, dan repositori spesifikasi bersama tidak dapat dicampur dengan pengikatan kode",
  apiErrGitBindingAlready: "Repositori ini sudah terhubung ke proyek ini dengan pengaturan ini",
  apiErrGitBindingResolutionFixed: "Repositori kode tidak dapat diubah menjadi repositori spesifikasi bersama. Lepaskan dulu, lalu hubungkan lagi sebagai spesifikasi bersama",
  apiErrGitBindingConfig: "Pengikatan tidak dapat diubah karena pengaturan integrasi Git. Hubungi administrator",
  apiErrMrUrlInvalid: "Bukan URL merge request (…/-/merge_requests/<nomor> pada server Git yang diizinkan)",
  apiErrMrRepositoryNotRegistered: "Repositori merge request ini tidak terdaftar di integrasi Git proyek ini",
  apiErrClaimReleased: "Klaim pekerjaan ini sudah dilepas. Klaim pekerjaan lagi",
  apiErrTaskClaimed: "Orang lain (atau sesi lain) sedang mengerjakan ini",
  apiErrClaimLimitReached: "Anda sudah memegang jumlah maksimum klaim pekerjaan aktif di proyek ini. Lepaskan pekerjaan yang selesai terlebih dahulu",
  apiErrAcNotFound: "Kriteria penerimaan ini tidak ditemukan (mungkin sudah dihapus)",
  apiErrAcLimitReached: "PBI ini sudah mencapai jumlah maksimum kriteria penerimaan. Hapus butir yang tidak diperlukan",
  apiErrFeedbackRedactionFailed: "Laporan masih memuat sesuatu yang tampak seperti kredensial, jadi tidak disimpan. Hapus lalu kirim ulang",
  apiErrFeedbackNoFailure: "Sesi ini tidak memiliki kegagalan yang belum terselesaikan untuk dikaitkan dengan solusi",
  apiErrLessonNotFound: "Pelajaran ini tidak ditemukan",
  apiErrLessonState: "Status pelajaran telah berubah. Muat ulang lalu coba lagi",
  apiErrScopeInvalid: "Ada entri cakupan yang tidak dapat dipakai. Tulis path relatif di dalam repositori (tanpa .., tidak diawali /) atau nama modul",
  apiErrScopeTooLarge: "Cakupan terlalu besar (maksimal 200 entri per klaim). Kelompokkan file per direktori atau modul",
  apiErrNetwork: "Tidak dapat terhubung ke server. Periksa jaringan Anda",
}
