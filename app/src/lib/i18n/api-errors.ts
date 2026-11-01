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
  apiErrInvalidDate: string
  apiErrGlossarySameLocale: string
  apiErrTranslationFailed: string
  apiErrCollaboraNotEditable: string
  apiErrCollaboraNotConfigured: string
  apiErrCollaboraUnreachable: string
  apiErrCollaboraFailed: string
  apiErrGitProviderUnsupported: string
  apiErrGitSourceLocked: string
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
  INVALID_DATE: "apiErrInvalidDate",
  GLOSSARY_SAME_LOCALE: "apiErrGlossarySameLocale",
  TRANSLATION_FAILED: "apiErrTranslationFailed",
  not_editable: "apiErrCollaboraNotEditable",
  wopi_token_missing: "apiErrCollaboraNotConfigured",
  collabora_unreachable: "apiErrCollaboraUnreachable",
  collabora_error: "apiErrCollaboraFailed",
  GIT_PROVIDER_UNSUPPORTED: "apiErrGitProviderUnsupported",
  GIT_SOURCE_LOCKED: "apiErrGitSourceLocked",
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
  apiErrInvalidDate: "日付が不正です",
  apiErrGlossarySameLocale: "翻訳元と翻訳先の言語は別にしてください",
  apiErrTranslationFailed: "翻訳に失敗しました",
  apiErrCollaboraNotEditable: "このファイル形式はCollaboraで編集できません",
  apiErrCollaboraNotConfigured: "オンライン編集が設定されていません。管理者に連絡してください",
  apiErrCollaboraUnreachable: "Collabora Online サーバーに接続できません。ファイルをダウンロードしてローカルのアプリケーションで編集してください。",
  apiErrCollaboraFailed: "Collaboraエディタの起動に失敗しました",
  apiErrGitProviderUnsupported: "この取り込み元には対応していません（現在は GitLab のみ）",
  apiErrGitSourceLocked: "取り込み元はプロジェクトごとに 1 つです。切り替えるには先にリポジトリを外してください",
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
  apiErrInvalidDate: "Invalid date",
  apiErrGlossarySameLocale: "Source and target languages must differ",
  apiErrTranslationFailed: "Translation failed",
  apiErrCollaboraNotEditable: "This file type cannot be edited in Collabora",
  apiErrCollaboraNotConfigured: "Online editing is not configured. Please contact an administrator",
  apiErrCollaboraUnreachable: "Cannot connect to the Collabora Online server. Download the file and edit it locally.",
  apiErrCollaboraFailed: "Failed to start the Collabora editor",
  apiErrGitProviderUnsupported: "This source is not supported (currently GitLab only)",
  apiErrGitSourceLocked: "A project reads from one source only. Remove its repositories before switching the source",
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
  apiErrInvalidDate: "Tanggal tidak valid",
  apiErrGlossarySameLocale: "Bahasa sumber dan bahasa tujuan harus berbeda",
  apiErrTranslationFailed: "Terjemahan gagal",
  apiErrCollaboraNotEditable: "Jenis file ini tidak dapat diedit di Collabora",
  apiErrCollaboraNotConfigured: "Pengeditan online belum dikonfigurasi. Silakan hubungi administrator",
  apiErrCollaboraUnreachable: "Tidak dapat terhubung ke server Collabora Online. Unduh file dan edit secara lokal.",
  apiErrCollaboraFailed: "Gagal membuka editor Collabora",
  apiErrGitProviderUnsupported: "Sumber ini tidak didukung (saat ini hanya GitLab)",
  apiErrGitSourceLocked: "Satu proyek hanya membaca dari satu sumber. Hapus repositorinya terlebih dahulu sebelum mengganti sumber",
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
