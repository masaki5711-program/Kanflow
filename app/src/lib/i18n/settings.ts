/**
 * i18n domain: Project settings page (incl. sprint history table).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface SettingsTranslations {
  // Settings page
  settingsTitle: string
  settingsLanguage: string
  settingsLanguageLabel: string
  settingsTranslationTitle: string
  settingsTranslationDesc: string
  settingsSprintWorkload: string
  settingsDefaultCapacity: string
  settingsDefaultCapacityHint: string
  settingsSprintDuration: string
  /** "{count}" = 1 (singular). */
  settingsWeek: string
  /** "{count}" = 2+ (plural). */
  settingsWeeks: string
  /** "{count}" = 1 (singular). */
  settingsDay: string
  /** "{count}" = 2+ (plural). */
  settingsDays: string
  settingsPointUnit: string
  settingsPointDescription: string
  settingsPointDescriptionPlaceholder: string
  settingsSaveButton: string
  settingsSaved: string
  settingsSprintHistory: string
  settingsSprintHistoryHint: string
  settingsAvgScore: string
  settingsAvgScoreHint: string
  settingsMembers: string
  settingsAddMember: string
  settingsEmail: string
  settingsRole: string
  settingsRemoveMember: string
  settingsRemoveConfirm: string
  settingsAddError: string
  // Sprint history table
  colSprint: string
  colCapacity: string
  colActualScore: string
  colAchievementRate: string
  colDiff: string
  settingsDangerZone: string
  settingsDeleteProject: string
  settingsDeleteProjectWarning: string
  settingsDeleteProjectConfirm: string
  settingsDeleteProjectFailed: string
  settingsSprintCount: string
  settingsSaveFailed: string
  settingsRoleChangeFailed: string
  settingsRemoveFailed: string
  settingsLoadFailed: string
  settingsMembersEmpty: string
  settingsProjectTypeChangeFailed: string
  settingsProjectTypeConfirmTitle: string
  settingsProjectTypeConfirmMessage: string
  settingsProjectTypeConfirmButton: string
  settingsProjectTypeChanged: string
  settingsUnsavedChanges: string
  settingsRoleOf: string
  settingsRemoveMemberOf: string
}

export const ja: SettingsTranslations = {
  settingsTitle: "プロジェクト設定",
  settingsLanguage: "言語設定",
  settingsLanguageLabel: "表示言語",
  settingsTranslationTitle: "自動翻訳",
  settingsTranslationDesc: "入力したテキストは入力した言語のまま保存され、AI が空いている時間にもう一方の言語（日本語⇔インドネシア語）を裏で用意します。表示言語を切り替えると翻訳側が表示され、未翻訳の間は原文に「翻訳待ち」が付きます。",
  settingsSprintWorkload: "スプリント負荷設定",
  settingsDefaultCapacity: "デフォルトキャパシティ（点数上限）",
  settingsDefaultCapacityHint: "新規スプリント作成時の初期値",
  settingsSprintDuration: "スプリント期間",
  settingsWeek: "{count}週間",
  settingsWeeks: "{count}週間",
  settingsDay: "{count}日",
  settingsDays: "{count}日",
  settingsPointUnit: "1点の単位",
  settingsPointDescription: "1点の重みの説明",
  settingsPointDescriptionPlaceholder: "例: 1点 = 開発者1人の1日分の作業量",
  settingsSaveButton: "設定を保存",
  settingsSaved: "保存しました",
  settingsSprintHistory: "過去のスプリント実績（1点の重み把握の参考）",
  settingsSprintHistoryHint: "この値を参考にデフォルトキャパシティを調整してください",
  settingsAvgScore: "スプリントの平均消化点数",
  settingsAvgScoreHint: "この値を参考にデフォルトキャパシティを調整してください",
  settingsMembers: "メンバー一覧",
  settingsAddMember: "メンバー追加",
  settingsEmail: "メールアドレス",
  settingsRole: "役割",
  settingsRemoveMember: "削除",
  settingsRemoveConfirm: "このメンバーを削除しますか？",
  settingsAddError: "追加に失敗しました",
  colSprint: "スプリント",
  colCapacity: "キャパシティ",
  colActualScore: "消化点数",
  colAchievementRate: "達成率",
  colDiff: "差分",
  settingsDangerZone: "危険な操作",
  settingsDeleteProject: "プロジェクトを削除",
  settingsDeleteProjectWarning: "プロジェクトはゴミ箱に移動され、メンバーから見えなくなります。保管期間（既定 30 日）内ならシステム管理者が復元できます。期間を過ぎると全データ（IceBox、バックログ、スプリント、リリース、ファイル）が完全に削除されます。",
  settingsDeleteProjectConfirm: "このプロジェクトをゴミ箱に移動しますか？保管期間内ならシステム管理者に依頼して復元できます。",
  settingsDeleteProjectFailed: "プロジェクトの削除に失敗しました",
  settingsSprintCount: "{count} スプリント",
  settingsSaveFailed: "設定の保存に失敗しました",
  settingsRoleChangeFailed: "役割の変更に失敗しました",
  settingsRemoveFailed: "メンバーの削除に失敗しました",
  settingsLoadFailed: "設定の読み込みに失敗しました",
  settingsMembersEmpty: "メンバーがいません",
  settingsProjectTypeChangeFailed: "プロジェクト種別の変更に失敗しました",
  settingsProjectTypeConfirmTitle: "プロジェクト種別を変更しますか？",
  settingsProjectTypeConfirmMessage: "「{type}」に切り替えると、このプロジェクトの画面上の用語（スプリント・バックログなど）がメンバー全員について切り替わります。データは変更されません。",
  settingsProjectTypeConfirmButton: "変更する",
  settingsProjectTypeChanged: "プロジェクト種別を変更しました",
  settingsUnsavedChanges: "未保存の変更があります",
  settingsRoleOf: "{name} の役割",
  settingsRemoveMemberOf: "{name} を削除",
}

export const en: SettingsTranslations = {
  settingsTitle: "Project Settings",
  settingsLanguage: "Language Settings",
  settingsLanguageLabel: "Display Language",
  settingsTranslationTitle: "Automatic translation",
  settingsTranslationDesc: "Text is stored in the language it was typed in; while the AI is idle it prepares the other language (Japanese ⇔ Indonesian) in the background. Switching the display language shows the translated side; until then the original is shown with a \"pending\" badge.",
  settingsSprintWorkload: "Sprint Workload Settings",
  settingsDefaultCapacity: "Default Capacity (Point Limit)",
  settingsDefaultCapacityHint: "Initial value when creating new sprints",
  settingsSprintDuration: "Sprint Duration",
  settingsWeek: "{count} week",
  settingsWeeks: "{count} weeks",
  settingsDay: "{count} day",
  settingsDays: "{count} days",
  settingsPointUnit: "Point Unit",
  settingsPointDescription: "Point Weight Description",
  settingsPointDescriptionPlaceholder: "e.g., 1 point = 1 developer-day of work",
  settingsSaveButton: "Save Settings",
  settingsSaved: "Saved",
  settingsSprintHistory: "Past Sprint Results (Reference for Point Weight)",
  settingsSprintHistoryHint: "Use this value to adjust the default capacity",
  settingsAvgScore: "Average Sprint Score",
  settingsAvgScoreHint: "Use this value to adjust the default capacity",
  settingsMembers: "Members",
  settingsAddMember: "Add Member",
  settingsEmail: "Email Address",
  settingsRole: "Role",
  settingsRemoveMember: "Remove",
  settingsRemoveConfirm: "Remove this member?",
  settingsAddError: "Failed to add member",
  colSprint: "Sprint",
  colCapacity: "Capacity",
  colActualScore: "Actual Score",
  colAchievementRate: "Achievement Rate",
  colDiff: "Diff",
  settingsDangerZone: "Danger zone",
  settingsDeleteProject: "Delete project",
  settingsDeleteProjectWarning: "The project is moved to the trash and hidden from its members. A system admin can restore it within the retention period (30 days by default). After that, all project data (IceBox, backlog, sprints, releases, files) is deleted permanently.",
  settingsDeleteProjectConfirm: "Move this project to the trash? A system admin can restore it within the retention period.",
  settingsDeleteProjectFailed: "Failed to delete the project",
  settingsSprintCount: "{count} sprints",
  settingsSaveFailed: "Failed to save settings",
  settingsRoleChangeFailed: "Failed to change the role",
  settingsRemoveFailed: "Failed to remove the member",
  settingsLoadFailed: "Failed to load settings",
  settingsMembersEmpty: "No members yet",
  settingsProjectTypeChangeFailed: "Failed to change the project type",
  settingsProjectTypeConfirmTitle: "Change the project type?",
  settingsProjectTypeConfirmMessage: "Switching to \"{type}\" changes the terminology (sprint, backlog, …) of this project for every member. No data is changed.",
  settingsProjectTypeConfirmButton: "Change",
  settingsProjectTypeChanged: "Project type changed",
  settingsUnsavedChanges: "You have unsaved changes",
  settingsRoleOf: "Role of {name}",
  settingsRemoveMemberOf: "Remove {name}",
}

export const id: SettingsTranslations = {
  settingsTitle: "Pengaturan Proyek",
  settingsLanguage: "Pengaturan Bahasa",
  settingsLanguageLabel: "Bahasa Tampilan",
  settingsTranslationTitle: "Terjemahan otomatis",
  settingsTranslationDesc: "Teks disimpan dalam bahasa yang diketik; saat AI menganggur, bahasa lainnya (Jepang ⇔ Indonesia) disiapkan di latar belakang. Mengganti bahasa tampilan menampilkan sisi terjemahan; sebelum itu teks asli ditampilkan dengan tanda \"menunggu terjemahan\".",
  settingsSprintWorkload: "Pengaturan Beban Sprint",
  settingsDefaultCapacity: "Kapasitas Default (Batas Poin)",
  settingsDefaultCapacityHint: "Nilai awal saat membuat sprint baru",
  settingsSprintDuration: "Durasi Sprint",
  settingsWeek: "{count} minggu",
  settingsWeeks: "{count} minggu",
  settingsDay: "{count} hari",
  settingsDays: "{count} hari",
  settingsPointUnit: "Satuan Poin",
  settingsPointDescription: "Deskripsi Bobot Poin",
  settingsPointDescriptionPlaceholder: "contoh: 1 poin = 1 hari kerja developer",
  settingsSaveButton: "Simpan Pengaturan",
  settingsSaved: "Tersimpan",
  settingsSprintHistory: "Riwayat Sprint (Referensi Bobot Poin)",
  settingsSprintHistoryHint: "Gunakan nilai ini untuk menyesuaikan kapasitas default",
  settingsAvgScore: "Rata-rata Skor Sprint",
  settingsAvgScoreHint: "Gunakan nilai ini untuk menyesuaikan kapasitas default",
  settingsMembers: "Anggota",
  settingsAddMember: "Tambah Anggota",
  settingsEmail: "Alamat Email",
  settingsRole: "Peran",
  settingsRemoveMember: "Hapus",
  settingsRemoveConfirm: "Hapus anggota ini?",
  settingsAddError: "Gagal menambahkan anggota",
  colSprint: "Sprint",
  colCapacity: "Kapasitas",
  colActualScore: "Skor Aktual",
  colAchievementRate: "Tingkat Pencapaian",
  colDiff: "Selisih",
  settingsDangerZone: "Zona berbahaya",
  settingsDeleteProject: "Hapus proyek",
  settingsDeleteProjectWarning: "Proyek dipindahkan ke tempat sampah dan disembunyikan dari anggotanya. Admin sistem dapat memulihkannya selama masa simpan (bawaan 30 hari). Setelah itu semua data proyek (IceBox, backlog, sprint, rilis, berkas) dihapus secara permanen.",
  settingsDeleteProjectConfirm: "Pindahkan proyek ini ke tempat sampah? Admin sistem dapat memulihkannya selama masa simpan.",
  settingsDeleteProjectFailed: "Gagal menghapus proyek",
  settingsSprintCount: "{count} sprint",
  settingsSaveFailed: "Gagal menyimpan pengaturan",
  settingsRoleChangeFailed: "Gagal mengubah peran",
  settingsRemoveFailed: "Gagal menghapus anggota",
  settingsLoadFailed: "Gagal memuat pengaturan",
  settingsMembersEmpty: "Belum ada anggota",
  settingsProjectTypeChangeFailed: "Gagal mengubah jenis proyek",
  settingsProjectTypeConfirmTitle: "Ubah jenis proyek?",
  settingsProjectTypeConfirmMessage: "Beralih ke \"{type}\" akan mengubah istilah (sprint, backlog, …) proyek ini untuk semua anggota. Data tidak diubah.",
  settingsProjectTypeConfirmButton: "Ubah",
  settingsProjectTypeChanged: "Jenis proyek diubah",
  settingsUnsavedChanges: "Ada perubahan yang belum disimpan",
  settingsRoleOf: "Peran {name}",
  settingsRemoveMemberOf: "Hapus {name}",
}
