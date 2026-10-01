/**
 * i18n domain: Top page (home) and project list / create.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ProjectsTranslations {
  projectProgress: string
  projectProgressHint: string
  projectSortUpdated: string
  projectSortFavorite: string
  projectSortNameAsc: string
  projectSortNameDesc: string
  projectSortProgress: string
  projectDensityComfortable: string
  projectDensityCompact: string
  projectSearchPlaceholder: string
  // Top Page (Home)
  topGreeting: string
  topMyTasksDesc: string
  topMyTasksEmpty: string
  topStatTasks: string
  topStatActiveProjects: string
  // Project List
  projectListTitle: string
  projectListCount: string
  projectListEmpty: string
  projectListGetStarted: string
  projectListNoActive: string
  projectCreateTitle: string
  projectCreateButton: string
  projectType: string
  projectName: string
  projectNamePlaceholder: string
  projectDescription: string
  projectDescriptionPlaceholder: string
  projectEditName: string
  projectBackToList: string
  projectOptions: string
  projectCardColor: string
  projectCardColorDefault: string
  projectFavorite: string
  projectFavoriteFailed: string
  projectCreated: string
  projectCreateFailed: string
  projectRenameFailed: string
  projectCardColorFailed: string
  projectCategoryAssignFailed: string
  projectTypeFilterLabel: string
  /** "All types" button of the project-type filter. */
  projectTypeFilterAll: string
  projectSortLabel: string
  projectDensityLabel: string
  projectViewModeLabel: string
  projectNoMatch: string
  projectArchivedSection: string
  projectCountIcebox: string
  projectCountBacklog: string
  projectCountSprints: string
  projectCountAiReports: string
  projectColorGray: string
  projectColorRed: string
  projectColorOrange: string
  projectColorYellow: string
  projectColorGreen: string
  projectColorBlue: string
  projectColorIndigo: string
  projectColorPurple: string
  projectColorPink: string
  projectDateCreated: string
  projectDateUpdated: string
  projectDateArchived: string
  projectDateCreatedFull: string
  projectDateUpdatedFull: string
  projectDateArchivedFull: string
  projectDormantBadge: string
  projectDormantHint: string
  projectSortActivityNewest: string
  projectSortActivityOldest: string
  projectFilterDormantOnly: string
  projectArchiveAction: string
  projectUnarchiveAction: string
  projectArchiveConfirm: string
  projectArchived: string
  projectUnarchived: string
  projectArchiveUndo: string
  projectArchiveFailed: string
  projectUnarchiveFailed: string
  topGreetingWithName: string
  topLanguageLabel: string
  topMyTasksHeading: string
}

export const ja: ProjectsTranslations = {
  projectProgress: "プロジェクト進捗",
  projectProgressHint: "このプロジェクトの全スプリントタスクのうち、完了済みタスクの割合。",
  projectSortUpdated: "更新日順",
  projectSortFavorite: "お気に入り順",
  projectSortNameAsc: "名前昇順 (A→Z)",
  projectSortNameDesc: "名前降順 (Z→A)",
  projectSortProgress: "進捗の高い順",
  projectDensityComfortable: "標準表示",
  projectDensityCompact: "コンパクト",
  projectSearchPlaceholder: "プロジェクト名・説明・メンバー名で検索",
  topGreeting: "おかえりなさい",
  topMyTasksDesc: "進行中スプリントで自分に割り当てられたタスク",
  topMyTasksEmpty: "現在割り当てられているスプリントタスクはありません",
  topStatTasks: "進行中タスク",
  topStatActiveProjects: "アクティブなプロジェクト",
  projectListTitle: "プロジェクト一覧",
  projectListCount: "件のアクティブなプロジェクト",
  projectListEmpty: "プロジェクトがありません",
  projectListGetStarted: "プロジェクトを作成して始めましょう",
  projectListNoActive: "アクティブなプロジェクトがありません",
  projectCreateTitle: "プロジェクト作成",
  projectCreateButton: "新規プロジェクト",
  projectType: "プロジェクトタイプ",
  projectName: "プロジェクト名",
  projectNamePlaceholder: "プロジェクト名を入力",
  projectDescription: "説明",
  projectDescriptionPlaceholder: "プロジェクトの概要を入力（任意）",
  projectEditName: "プロジェクト名を編集",
  projectBackToList: "← プロジェクト一覧",
  projectOptions: "オプション",
  projectCardColor: "カードの色",
  projectCardColorDefault: "標準",
  projectFavorite: "お気に入り",
  projectFavoriteFailed: "お気に入りの更新に失敗しました",
  projectCreated: "プロジェクトを作成しました",
  projectCreateFailed: "プロジェクトの作成に失敗しました",
  projectRenameFailed: "プロジェクト名の変更に失敗しました",
  projectCardColorFailed: "カードの色を変更できませんでした",
  projectCategoryAssignFailed: "カテゴリの割り当てを変更できませんでした",
  projectTypeFilterLabel: "プロジェクトタイプで絞り込み",
  projectTypeFilterAll: "すべてのタイプ",
  projectSortLabel: "並び替え",
  projectDensityLabel: "表示密度",
  projectViewModeLabel: "表示方法",
  projectNoMatch: "条件に一致するプロジェクトはありません",
  projectArchivedSection: "アーカイブ済みプロジェクト",
  projectCountIcebox: "IceBox の件数",
  projectCountBacklog: "バックログの件数",
  projectCountSprints: "スプリント数",
  projectCountAiReports: "AI レポート数",
  projectColorGray: "グレー",
  projectColorRed: "レッド",
  projectColorOrange: "オレンジ",
  projectColorYellow: "イエロー",
  projectColorGreen: "グリーン",
  projectColorBlue: "ブルー",
  projectColorIndigo: "インディゴ",
  projectColorPurple: "パープル",
  projectColorPink: "ピンク",
  projectDateCreated: "作成 {date}",
  projectDateUpdated: "更新 {date}",
  projectDateArchived: "アーカイブ {date}",
  projectDateCreatedFull: "作成日時: {date}",
  projectDateUpdatedFull: "最終更新: {date}",
  projectDateArchivedFull: "アーカイブ日時: {date}",
  projectDormantBadge: "休眠 {days}日",
  projectDormantHint: "{days}日間更新がありません — アーカイブを検討してください",
  projectSortActivityNewest: "最終更新が新しい順",
  projectSortActivityOldest: "最終更新が古い順",
  projectFilterDormantOnly: "休眠中のみ",
  projectArchiveAction: "アーカイブへ移動",
  projectUnarchiveAction: "アーカイブから戻す",
  projectArchiveConfirm: "「{name}」をアーカイブへ移動しますか？ メンバーの一覧から非表示になり、アーカイブ欄に移ります。いつでも戻せます。",
  projectArchived: "アーカイブへ移動しました",
  projectUnarchived: "アーカイブから戻しました",
  projectArchiveUndo: "元に戻す",
  projectArchiveFailed: "アーカイブへの移動に失敗しました",
  projectUnarchiveFailed: "アーカイブから戻せませんでした",
  topGreetingWithName: "おかえりなさい、{name}さん",
  topLanguageLabel: "表示言語",
  topMyTasksHeading: "スプリントの担当タスク",
}

export const en: ProjectsTranslations = {
  projectProgress: "Project progress",
  projectProgressHint: "Percentage of completed tasks across all sprints in this project.",
  projectSortUpdated: "Updated (newest)",
  projectSortFavorite: "Favorites first",
  projectSortNameAsc: "Name A→Z",
  projectSortNameDesc: "Name Z→A",
  projectSortProgress: "Progress (high → low)",
  projectDensityComfortable: "Comfortable",
  projectDensityCompact: "Compact",
  projectSearchPlaceholder: "Search project name, description, or member",
  topGreeting: "Welcome back",
  topMyTasksDesc: "Your tasks across active sprints",
  topMyTasksEmpty: "No sprint tasks assigned to you right now",
  topStatTasks: "Tasks in progress",
  topStatActiveProjects: "Active projects",
  projectListTitle: "Projects",
  projectListCount: "active projects",
  projectListEmpty: "No projects",
  projectListGetStarted: "Create a project to get started",
  projectListNoActive: "No active projects",
  projectCreateTitle: "Create Project",
  projectCreateButton: "New Project",
  projectType: "Project Type",
  projectName: "Project Name",
  projectNamePlaceholder: "Enter project name",
  projectDescription: "Description",
  projectDescriptionPlaceholder: "Enter project overview (optional)",
  projectEditName: "Edit project name",
  projectBackToList: "← Projects",
  projectOptions: "Options",
  projectCardColor: "Card color",
  projectCardColorDefault: "Default",
  projectFavorite: "Favorite",
  projectFavoriteFailed: "Failed to update favorite",
  projectCreated: "Project created",
  projectCreateFailed: "Failed to create the project",
  projectRenameFailed: "Failed to rename the project",
  projectCardColorFailed: "Failed to change the card color",
  projectCategoryAssignFailed: "Failed to update the category assignment",
  projectTypeFilterLabel: "Filter by project type",
  projectTypeFilterAll: "All types",
  projectSortLabel: "Sort by",
  projectDensityLabel: "Display density",
  projectViewModeLabel: "View mode",
  projectNoMatch: "No projects match your filters",
  projectArchivedSection: "Archived projects",
  projectCountIcebox: "IceBox items",
  projectCountBacklog: "Backlog items",
  projectCountSprints: "Sprints",
  projectCountAiReports: "AI reports",
  projectColorGray: "Gray",
  projectColorRed: "Red",
  projectColorOrange: "Orange",
  projectColorYellow: "Yellow",
  projectColorGreen: "Green",
  projectColorBlue: "Blue",
  projectColorIndigo: "Indigo",
  projectColorPurple: "Purple",
  projectColorPink: "Pink",
  projectDateCreated: "Created {date}",
  projectDateUpdated: "Updated {date}",
  projectDateArchived: "Archived {date}",
  projectDateCreatedFull: "Created: {date}",
  projectDateUpdatedFull: "Last updated: {date}",
  projectDateArchivedFull: "Archived: {date}",
  projectDormantBadge: "Dormant {days}d",
  projectDormantHint: "No updates for {days} days — consider archiving it",
  projectSortActivityNewest: "Last updated (newest)",
  projectSortActivityOldest: "Last updated (oldest)",
  projectFilterDormantOnly: "Dormant only",
  projectArchiveAction: "Move to archive",
  projectUnarchiveAction: "Restore from archive",
  projectArchiveConfirm: "Move \"{name}\" to the archive? It is hidden from the members' project list and moves to the archived section. You can restore it at any time.",
  projectArchived: "Moved to the archive",
  projectUnarchived: "Restored from the archive",
  projectArchiveUndo: "Undo",
  projectArchiveFailed: "Could not move the project to the archive",
  projectUnarchiveFailed: "Could not restore the project from the archive",
  topGreetingWithName: "Welcome back, {name}",
  topLanguageLabel: "Display language",
  topMyTasksHeading: "My sprint tasks",
}

export const id: ProjectsTranslations = {
  projectProgress: "Progres proyek",
  projectProgressHint: "Persentase tugas yang selesai di seluruh sprint dalam proyek ini.",
  projectSortUpdated: "Terbaru diperbarui",
  projectSortFavorite: "Favorit di atas",
  projectSortNameAsc: "Nama A→Z",
  projectSortNameDesc: "Nama Z→A",
  projectSortProgress: "Progres (tinggi → rendah)",
  projectDensityComfortable: "Nyaman",
  projectDensityCompact: "Kompak",
  projectSearchPlaceholder: "Cari nama proyek, deskripsi, atau anggota",
  topGreeting: "Selamat datang kembali",
  topMyTasksDesc: "Tugas Anda di sprint yang sedang berjalan",
  topMyTasksEmpty: "Belum ada tugas sprint yang ditugaskan untuk Anda",
  topStatTasks: "Tugas sedang dikerjakan",
  topStatActiveProjects: "Proyek aktif",
  projectListTitle: "Daftar Proyek",
  projectListCount: "proyek aktif",
  projectListEmpty: "Tidak ada proyek",
  projectListGetStarted: "Buat proyek untuk memulai",
  projectListNoActive: "Tidak ada proyek aktif",
  projectCreateTitle: "Buat Proyek",
  projectCreateButton: "Proyek Baru",
  projectType: "Tipe Proyek",
  projectName: "Nama Proyek",
  projectNamePlaceholder: "Masukkan nama proyek",
  projectDescription: "Deskripsi",
  projectDescriptionPlaceholder: "Masukkan ringkasan proyek (opsional)",
  projectEditName: "Edit nama proyek",
  projectBackToList: "← Daftar Proyek",
  projectOptions: "Opsi",
  projectCardColor: "Warna kartu",
  projectCardColorDefault: "Bawaan",
  projectFavorite: "Favorit",
  projectFavoriteFailed: "Gagal memperbarui favorit",
  projectCreated: "Proyek dibuat",
  projectCreateFailed: "Gagal membuat proyek",
  projectRenameFailed: "Gagal mengganti nama proyek",
  projectCardColorFailed: "Gagal mengubah warna kartu",
  projectCategoryAssignFailed: "Gagal memperbarui penetapan kategori",
  projectTypeFilterLabel: "Saring menurut tipe proyek",
  projectTypeFilterAll: "Semua tipe",
  projectSortLabel: "Urutkan",
  projectDensityLabel: "Kepadatan tampilan",
  projectViewModeLabel: "Mode tampilan",
  projectNoMatch: "Tidak ada proyek yang cocok dengan filter",
  projectArchivedSection: "Proyek yang diarsipkan",
  projectCountIcebox: "Item IceBox",
  projectCountBacklog: "Item backlog",
  projectCountSprints: "Jumlah Sprint",
  projectCountAiReports: "Laporan AI",
  projectColorGray: "Abu-abu",
  projectColorRed: "Merah",
  projectColorOrange: "Oranye",
  projectColorYellow: "Kuning",
  projectColorGreen: "Hijau",
  projectColorBlue: "Biru",
  projectColorIndigo: "Nila",
  projectColorPurple: "Ungu",
  projectColorPink: "Merah muda",
  projectDateCreated: "Dibuat {date}",
  projectDateUpdated: "Diperbarui {date}",
  projectDateArchived: "Diarsipkan {date}",
  projectDateCreatedFull: "Dibuat: {date}",
  projectDateUpdatedFull: "Terakhir diperbarui: {date}",
  projectDateArchivedFull: "Diarsipkan: {date}",
  projectDormantBadge: "Tidak aktif {days} hari",
  projectDormantHint: "Tidak ada pembaruan selama {days} hari — pertimbangkan untuk mengarsipkannya",
  projectSortActivityNewest: "Terakhir diperbarui (terbaru)",
  projectSortActivityOldest: "Terakhir diperbarui (terlama)",
  projectFilterDormantOnly: "Hanya yang tidak aktif",
  projectArchiveAction: "Pindahkan ke arsip",
  projectUnarchiveAction: "Kembalikan dari arsip",
  projectArchiveConfirm: "Pindahkan \"{name}\" ke arsip? Proyek disembunyikan dari daftar proyek anggota dan dipindahkan ke bagian arsip. Anda dapat mengembalikannya kapan saja.",
  projectArchived: "Dipindahkan ke arsip",
  projectUnarchived: "Dikembalikan dari arsip",
  projectArchiveUndo: "Urungkan",
  projectArchiveFailed: "Gagal memindahkan proyek ke arsip",
  projectUnarchiveFailed: "Gagal mengembalikan proyek dari arsip",
  topGreetingWithName: "Selamat datang kembali, {name}",
  topLanguageLabel: "Bahasa tampilan",
  topMyTasksHeading: "Tugas Sprint saya",
}
