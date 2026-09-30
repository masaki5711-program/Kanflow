/**
 * i18n domain: Shared buttons/states, error pages, roles, point units, member picker, bilingual-text badges.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface CommonTranslations {
  // Common
  save: string
  saving: string
  saved: string
  cancel: string
  delete: string
  edit: string
  add: string
  create: string
  update: string
  close: string
  confirm: string
  loading: string
  error: string
  success: string
  logout: string
  back: string
  // Header
  appTitle: string
  // Point units
  pointUnitManDay: string
  pointUnitManHour: string
  pointUnitPoints: string
  pointUnitSP: string
  // Roles
  rolePO: string
  roleSM: string
  roleDev: string
  // Both-language text (background AI translation)
  translationPending: string
  translationBusy: string
  translationDone: string
  translationFailed: string
  translationNowHint: string
  translationShowOriginal: string
  translationHideOriginal: string
  translationOriginalLabel: string
  glossaryHint: string
  glossaryHintTitle: string
  view: string
  memberPickerSearchPlaceholder: string
  memberPickerAlreadyAdded: string
  memberPickerSelected: string
  memberPickerAddSelected: string
  memberPickerEmpty: string
  memberPickerSearchLabel: string
  memberPickerRemove: string
  memberPickerRole: string
  memberPickerResults: string
  memberPickerSearchFailed: string
  memberPickerAddFailed: string
  helpTooltipLabel: string
  errorCreationFailed: string
  errorUpdateFailed: string
  errorChangeFailed: string
  errorResetPasswordFailed: string
  // Auth — idle/auto-logout
  sessionTimedOut: string
  // Common UI
  items: string
  editorLoading: string
  editorError: string
  /** Page title of the full-screen document editor. */
  editorTitle: string
  // Error page
  errorPageTitle: string
  errorPageMessage: string
  errorRetry: string
  errorGoHome: string
  notFoundTitle: string
  notFoundMessage: string
  notFoundProjectTitle: string
  notFoundProjectMessage: string
  notFoundBackToProjects: string
}

export const ja: CommonTranslations = {
  save: "保存",
  saving: "保存中...",
  saved: "保存しました",
  cancel: "キャンセル",
  delete: "削除",
  edit: "編集",
  add: "追加",
  create: "作成",
  update: "更新",
  close: "閉じる",
  confirm: "確認",
  loading: "読み込み中...",
  error: "エラー",
  success: "成功",
  logout: "ログアウト",
  back: "戻る",
  appTitle: "Kanflow",
  pointUnitManDay: "人日",
  pointUnitManHour: "人時",
  pointUnitPoints: "ポイント",
  pointUnitSP: "ストーリーポイント (SP)",
  rolePO: "Product Owner",
  roleSM: "Scrum Master",
  roleDev: "Developer",
  translationPending: "翻訳待ち",
  translationBusy: "翻訳中…",
  translationDone: "翻訳完了",
  translationFailed: "翻訳失敗",
  translationNowHint: "クリックで今すぐ翻訳",
  translationShowOriginal: "原文を表示",
  translationHideOriginal: "原文を隠す",
  translationOriginalLabel: "原文",
  glossaryHint: "用語<<訳語>> と書くと翻訳辞書に登録されます",
  glossaryHintTitle: "共有翻訳辞書：誰かの訂正が全員の翻訳に反映されます",
  view: "詳細",
  memberPickerSearchPlaceholder: "名前・メール・従業員番号・所属で検索",
  memberPickerAlreadyAdded: "追加済み",
  memberPickerSelected: "人を選択中",
  memberPickerAddSelected: "選択したメンバーを追加",
  memberPickerEmpty: "2文字以上入力して検索",
  memberPickerSearchLabel: "追加するメンバーを検索",
  memberPickerRemove: "{name} を選択から外す",
  memberPickerRole: "ロール",
  memberPickerResults: "{count} 件見つかりました",
  memberPickerSearchFailed: "ユーザー検索に失敗しました",
  memberPickerAddFailed: "メンバーの追加に失敗しました",
  helpTooltipLabel: "ヘルプ",
  errorCreationFailed: "作成に失敗しました",
  errorUpdateFailed: "更新に失敗しました",
  errorChangeFailed: "変更に失敗しました",
  errorResetPasswordFailed: "パスワードリセットに失敗しました",
  sessionTimedOut: "セッションがタイムアウトしました。再度ログインしてください。",
  items: "件",
  editorLoading: "エディタを読み込み中...",
  editorError: "エディタエラー",
  editorTitle: "ドキュメント編集",
  errorPageTitle: "エラーが発生しました",
  errorPageMessage: "このページの読み込み中にエラーが発生しました。",
  errorRetry: "再試行",
  errorGoHome: "ホームに戻る",
  notFoundTitle: "ページが見つかりません",
  notFoundMessage: "お探しのページは存在しないか、移動または削除された可能性があります。",
  notFoundProjectTitle: "プロジェクトが見つかりません",
  notFoundProjectMessage: "このプロジェクトは存在しないか、閲覧する権限がありません。",
  notFoundBackToProjects: "プロジェクト一覧へ戻る",
}

export const en: CommonTranslations = {
  save: "Save",
  saving: "Saving...",
  saved: "Saved",
  cancel: "Cancel",
  delete: "Delete",
  edit: "Edit",
  add: "Add",
  create: "Create",
  update: "Update",
  close: "Close",
  confirm: "Confirm",
  loading: "Loading...",
  error: "Error",
  success: "Success",
  logout: "Logout",
  back: "Back",
  appTitle: "Kanflow",
  pointUnitManDay: "Man-days",
  pointUnitManHour: "Man-hours",
  pointUnitPoints: "Points",
  pointUnitSP: "Story Points (SP)",
  rolePO: "Product Owner",
  roleSM: "Scrum Master",
  roleDev: "Developer",
  translationPending: "Translation pending",
  translationBusy: "Translating…",
  translationDone: "Translated",
  translationFailed: "Translation failed",
  translationNowHint: "Click to translate now",
  translationShowOriginal: "Show original",
  translationHideOriginal: "Hide original",
  translationOriginalLabel: "Original",
  glossaryHint: "Write term<<translation>> to register it in the translation glossary",
  glossaryHintTitle: "Shared translation glossary: one person's correction applies to everyone's translations",
  view: "View",
  memberPickerSearchPlaceholder: "Search by name, email, employee ID, or department",
  memberPickerAlreadyAdded: "Already added",
  memberPickerSelected: "selected",
  memberPickerAddSelected: "Add selected members",
  memberPickerEmpty: "Type at least 2 characters to search",
  memberPickerSearchLabel: "Search members to add",
  memberPickerRemove: "Remove {name} from selection",
  memberPickerRole: "Role",
  memberPickerResults: "{count} found",
  memberPickerSearchFailed: "User search failed",
  memberPickerAddFailed: "Failed to add members",
  helpTooltipLabel: "Help",
  errorCreationFailed: "Creation failed",
  errorUpdateFailed: "Update failed",
  errorChangeFailed: "Change failed",
  errorResetPasswordFailed: "Password reset failed",
  sessionTimedOut: "Your session has timed out. Please log in again.",
  items: "items",
  editorLoading: "Loading editor...",
  editorError: "Editor error",
  editorTitle: "Document editor",
  errorPageTitle: "An error occurred",
  errorPageMessage: "An error occurred while loading this page.",
  errorRetry: "Retry",
  errorGoHome: "Go Home",
  notFoundTitle: "Page not found",
  notFoundMessage: "The page you are looking for does not exist or may have been moved or deleted.",
  notFoundProjectTitle: "Project not found",
  notFoundProjectMessage: "This project does not exist or you do not have access to it.",
  notFoundBackToProjects: "Back to projects",
}

export const id: CommonTranslations = {
  save: "Simpan",
  saving: "Menyimpan...",
  saved: "Tersimpan",
  cancel: "Batal",
  delete: "Hapus",
  edit: "Edit",
  add: "Tambah",
  create: "Buat",
  update: "Perbarui",
  close: "Tutup",
  confirm: "Konfirmasi",
  loading: "Memuat...",
  error: "Error",
  success: "Berhasil",
  logout: "Keluar",
  back: "Kembali",
  appTitle: "Kanflow",
  pointUnitManDay: "Hari-orang",
  pointUnitManHour: "Jam-orang",
  pointUnitPoints: "Poin",
  pointUnitSP: "Story Points (SP)",
  rolePO: "Product Owner",
  roleSM: "Scrum Master",
  roleDev: "Developer",
  translationPending: "Menunggu terjemahan",
  translationBusy: "Menerjemahkan…",
  translationDone: "Diterjemahkan",
  translationFailed: "Terjemahan gagal",
  translationNowHint: "Klik untuk menerjemahkan sekarang",
  translationShowOriginal: "Tampilkan teks asli",
  translationHideOriginal: "Sembunyikan teks asli",
  translationOriginalLabel: "Teks asli",
  glossaryHint: "Tulis istilah<<terjemahan>> untuk mendaftarkannya ke kamus terjemahan",
  glossaryHintTitle: "Kamus terjemahan bersama: koreksi satu orang berlaku untuk terjemahan semua orang",
  view: "Lihat",
  memberPickerSearchPlaceholder: "Cari berdasarkan nama, email, nomor karyawan, atau departemen",
  memberPickerAlreadyAdded: "Sudah ditambahkan",
  memberPickerSelected: "dipilih",
  memberPickerAddSelected: "Tambahkan anggota terpilih",
  memberPickerEmpty: "Ketik minimal 2 karakter untuk mencari",
  memberPickerSearchLabel: "Cari anggota yang akan ditambahkan",
  memberPickerRemove: "Hapus {name} dari pilihan",
  memberPickerRole: "Peran",
  memberPickerResults: "{count} ditemukan",
  memberPickerSearchFailed: "Pencarian pengguna gagal",
  memberPickerAddFailed: "Gagal menambahkan anggota",
  helpTooltipLabel: "Bantuan",
  errorCreationFailed: "Gagal membuat",
  errorUpdateFailed: "Gagal memperbarui",
  errorChangeFailed: "Gagal mengubah",
  errorResetPasswordFailed: "Gagal mereset kata sandi",
  sessionTimedOut: "Sesi Anda telah berakhir. Silakan masuk kembali.",
  items: "item",
  editorLoading: "Memuat editor...",
  editorError: "Error editor",
  editorTitle: "Editor dokumen",
  errorPageTitle: "Terjadi kesalahan",
  errorPageMessage: "Terjadi kesalahan saat memuat halaman ini.",
  errorRetry: "Coba Lagi",
  errorGoHome: "Ke Beranda",
  notFoundTitle: "Halaman tidak ditemukan",
  notFoundMessage: "Halaman yang Anda cari tidak ada atau mungkin telah dipindahkan atau dihapus.",
  notFoundProjectTitle: "Proyek tidak ditemukan",
  notFoundProjectMessage: "Proyek ini tidak ada atau Anda tidak memiliki akses ke proyek ini.",
  notFoundBackToProjects: "Kembali ke daftar proyek",
}
