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
  apiErrSprintNotFound: string
  apiErrSprintActiveExists: string
  apiErrPlanItemNotFound: string
  apiErrPlanParentNotFound: string
  apiErrPlanSelfParent: string
  apiErrPlanCycle: string
  apiErrFileRequired: string
  apiErrFileEmpty: string
  apiErrFileMissing: string
  apiErrInvalidPath: string
  apiErrFolderNotFound: string
  apiErrFolderSelfParent: string
  apiErrFolderCycle: string
  apiErrInvalidDate: string
  apiErrGlossarySameLocale: string
  apiErrTranslationFailed: string
  apiErrCollaboraNotEditable: string
  apiErrCollaboraNotConfigured: string
  apiErrCollaboraUnreachable: string
  apiErrCollaboraFailed: string
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
  SPRINT_NOT_FOUND: "apiErrSprintNotFound",
  SPRINT_ACTIVE_EXISTS: "apiErrSprintActiveExists",
  PLAN_ITEM_NOT_FOUND: "apiErrPlanItemNotFound",
  PLAN_PARENT_NOT_FOUND: "apiErrPlanParentNotFound",
  PLAN_SELF_PARENT: "apiErrPlanSelfParent",
  PLAN_CYCLE: "apiErrPlanCycle",
  FILE_REQUIRED: "apiErrFileRequired",
  FILE_EMPTY: "apiErrFileEmpty",
  FILE_MISSING: "apiErrFileMissing",
  INVALID_PATH: "apiErrInvalidPath",
  FOLDER_NOT_FOUND: "apiErrFolderNotFound",
  FOLDER_SELF_PARENT: "apiErrFolderSelfParent",
  FOLDER_CYCLE: "apiErrFolderCycle",
  INVALID_DATE: "apiErrInvalidDate",
  GLOSSARY_SAME_LOCALE: "apiErrGlossarySameLocale",
  TRANSLATION_FAILED: "apiErrTranslationFailed",
  not_editable: "apiErrCollaboraNotEditable",
  wopi_token_missing: "apiErrCollaboraNotConfigured",
  collabora_unreachable: "apiErrCollaboraUnreachable",
  collabora_error: "apiErrCollaboraFailed",
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
  apiErrSprintNotFound: "スプリントが見つかりません",
  apiErrSprintActiveExists: "進行中または計画中のスプリントが既にあります",
  apiErrPlanItemNotFound: "対象の項目が見つかりません",
  apiErrPlanParentNotFound: "親項目が見つかりません",
  apiErrPlanSelfParent: "自分自身を親にできません",
  apiErrPlanCycle: "循環参照になります",
  apiErrFileRequired: "ファイルがありません",
  apiErrFileEmpty: "ファイルが空です",
  apiErrFileMissing: "ファイルが見つかりません",
  apiErrInvalidPath: "パスが不正です",
  apiErrFolderNotFound: "フォルダがありません",
  apiErrFolderSelfParent: "自分自身を親にはできません",
  apiErrFolderCycle: "循環参照になります",
  apiErrInvalidDate: "日付が不正です",
  apiErrGlossarySameLocale: "翻訳元と翻訳先の言語は別にしてください",
  apiErrTranslationFailed: "翻訳に失敗しました",
  apiErrCollaboraNotEditable: "このファイル形式はCollaboraで編集できません",
  apiErrCollaboraNotConfigured: "オンライン編集が設定されていません。管理者に連絡してください",
  apiErrCollaboraUnreachable: "Collabora Online サーバーに接続できません。ファイルをダウンロードしてローカルのアプリケーションで編集してください。",
  apiErrCollaboraFailed: "Collaboraエディタの起動に失敗しました",
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
  apiErrSprintNotFound: "Sprint not found",
  apiErrSprintActiveExists: "An active or planned sprint already exists",
  apiErrPlanItemNotFound: "Some items were not found",
  apiErrPlanParentNotFound: "Parent item not found",
  apiErrPlanSelfParent: "An item cannot be its own parent",
  apiErrPlanCycle: "This would create a circular reference",
  apiErrFileRequired: "No file was provided",
  apiErrFileEmpty: "The file is empty",
  apiErrFileMissing: "The file was not found",
  apiErrInvalidPath: "Invalid path",
  apiErrFolderNotFound: "Folder not found",
  apiErrFolderSelfParent: "A folder cannot be its own parent",
  apiErrFolderCycle: "This would create a circular folder structure",
  apiErrInvalidDate: "Invalid date",
  apiErrGlossarySameLocale: "Source and target languages must differ",
  apiErrTranslationFailed: "Translation failed",
  apiErrCollaboraNotEditable: "This file type cannot be edited in Collabora",
  apiErrCollaboraNotConfigured: "Online editing is not configured. Please contact an administrator",
  apiErrCollaboraUnreachable: "Cannot connect to the Collabora Online server. Download the file and edit it locally.",
  apiErrCollaboraFailed: "Failed to start the Collabora editor",
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
  apiErrSprintNotFound: "Sprint tidak ditemukan",
  apiErrSprintActiveExists: "Sudah ada Sprint yang sedang berjalan atau direncanakan",
  apiErrPlanItemNotFound: "Beberapa item tidak ditemukan",
  apiErrPlanParentNotFound: "Item induk tidak ditemukan",
  apiErrPlanSelfParent: "Item tidak dapat menjadi induk bagi dirinya sendiri",
  apiErrPlanCycle: "Tindakan ini akan membuat referensi melingkar",
  apiErrFileRequired: "Tidak ada file yang dikirim",
  apiErrFileEmpty: "File kosong",
  apiErrFileMissing: "File tidak ditemukan",
  apiErrInvalidPath: "Path tidak valid",
  apiErrFolderNotFound: "Folder tidak ditemukan",
  apiErrFolderSelfParent: "Folder tidak dapat menjadi induk bagi dirinya sendiri",
  apiErrFolderCycle: "Tindakan ini akan membuat struktur folder melingkar",
  apiErrInvalidDate: "Tanggal tidak valid",
  apiErrGlossarySameLocale: "Bahasa sumber dan bahasa tujuan harus berbeda",
  apiErrTranslationFailed: "Terjemahan gagal",
  apiErrCollaboraNotEditable: "Jenis file ini tidak dapat diedit di Collabora",
  apiErrCollaboraNotConfigured: "Pengeditan online belum dikonfigurasi. Silakan hubungi administrator",
  apiErrCollaboraUnreachable: "Tidak dapat terhubung ke server Collabora Online. Unduh file dan edit secara lokal.",
  apiErrCollaboraFailed: "Gagal membuka editor Collabora",
  apiErrNetwork: "Tidak dapat terhubung ke server. Periksa jaringan Anda",
}
