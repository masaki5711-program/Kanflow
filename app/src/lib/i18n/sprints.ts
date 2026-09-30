/**
 * i18n domain: Sprint list / create / edit, PBI import.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface SprintsTranslations {
  // Sprint
  sprintTitle: string
  sprintCreate: string
  sprintName: string
  sprintGoal: string
  sprintStartDate: string
  sprintEndDate: string
  sprintCapacity: string
  sprintStatus: string
  sprintStatusPlanning: string
  sprintStatusActive: string
  sprintStatusReview: string
  sprintStatusDone: string
  sprintDeleteConfirm: string
  sprintEditMenu: string
  sprintEditTitle: string
  // Sprint extended
  sprintNewSprint: string
  sprintAvgScore: string
  sprintPbImport: string
  sprintSelectedWorkload: string
  sprintNoPbReady: string
  sprintNoPbReadyHint: string
  sprintNotEntered: string
  sprintCreateWithCount: string
  sprintWorkload: string
  sprintNoSprints: string
  sprintDeleteFullConfirm: string
  sprintPbItem: string
  sprintAddPbi: string
  sprintAddPbiTitle: string
  sprintAddPbiSubmit: string
  sprintAddPbiSearchPlaceholder: string
  sprintRemovePbi: string
  sprintRemovePbiConfirm: string
  sprintSelect: string
  sprintUnassigned: string
  sprintUpdateFailed: string
  sprintAddFailed: string
  // Sprint creation guard + Burndown page navigation
  sprintCreateBlocked: string
  sprintCreated: string
  sprintCreateFailed: string
  sprintSaved: string
  sprintDeleted: string
  sprintDeleteFailed: string
  sprintStatusUpdateFailed: string
  sprintRemovePbiFailed: string
  sprintNoSprintsHint: string
  sprintMoveToStatus: string
  sprintToggleDetails: string
  sprintDeleteNamed: string
  sprintEditConflictNotice: string
  sprintCompleteCheckTitle: string
  sprintCompleteUnfinished: string
  sprintCompleteAllDone: string
  sprintCompleteArchiveNote: string
  sprintCompleteCarryOverNote: string
  sprintProgressLoadPct: string
  sprintProgressDoneTasks: string
}

export const ja: SprintsTranslations = {
  sprintTitle: "スプリント",
  sprintCreate: "スプリント作成",
  sprintName: "スプリント名",
  sprintGoal: "スプリントゴール",
  sprintStartDate: "開始日",
  sprintEndDate: "終了日",
  sprintCapacity: "キャパシティ",
  sprintStatus: "ステータス",
  sprintStatusPlanning: "計画中",
  sprintStatusActive: "実行中",
  sprintStatusReview: "レビュー",
  sprintStatusDone: "完了",
  sprintDeleteConfirm: "このスプリントを削除しますか？",
  sprintEditMenu: "スプリント編集",
  sprintEditTitle: "スプリント編集",
  sprintNewSprint: "新規スプリント",
  sprintAvgScore: "過去{count}スプリントの平均消化点数",
  sprintPbImport: "PBから取り込み（Ready項目）",
  sprintSelectedWorkload: "選択負荷",
  sprintNoPbReady: "取り込めるPBアイテムがありません",
  sprintNoPbReadyHint: "バックログでアイテムを「Ready」にすると、ここに表示されます",
  sprintNotEntered: "(未入力)",
  sprintCreateWithCount: "作成（{count}件取り込み）",
  sprintWorkload: "業務負荷",
  sprintNoSprints: "スプリントはまだありません",
  sprintDeleteFullConfirm: "このスプリントを削除しますか？関連するタスクも全て削除されます。",
  sprintPbItem: "PBアイテム",
  sprintAddPbi: "PBアイテムを追加",
  sprintAddPbiTitle: "このスプリントに PBアイテムを追加",
  sprintAddPbiSubmit: "選択したPBを追加",
  sprintAddPbiSearchPlaceholder: "PB番号・Initiative・Epic・ユーザーストーリーで検索",
  sprintRemovePbi: "このPBをスプリントから外す",
  sprintRemovePbiConfirm: "このPBと紐づく全タスクをスプリントから削除します。続行しますか？",
  sprintSelect: "選択",
  sprintUnassigned: "未割当",
  sprintUpdateFailed: "更新失敗",
  sprintAddFailed: "追加失敗",
  sprintCreateBlocked: "進行中または計画中のスプリントがあるため作成できません",
  sprintCreated: "スプリントを作成しました",
  sprintCreateFailed: "スプリントの作成に失敗しました",
  sprintSaved: "スプリントを更新しました",
  sprintDeleted: "スプリントを削除しました",
  sprintDeleteFailed: "スプリントの削除に失敗しました",
  sprintStatusUpdateFailed: "スプリントのステータス変更に失敗しました",
  sprintRemovePbiFailed: "PBをスプリントから外せませんでした",
  sprintNoSprintsHint: "「スプリント作成」から最初のスプリントを作り、Ready状態のPBを取り込みましょう。",
  sprintMoveToStatus: "「{status}」へ移行",
  sprintToggleDetails: "「{name}」の詳細を開閉",
  sprintDeleteNamed: "スプリント「{name}」を削除",
  sprintEditConflictNotice: "他のユーザーが先に更新したため、最新の内容を読み込みました。内容を確認し、必要なら変更し直してから保存してください。",
  sprintCompleteCheckTitle: "完了前の確認",
  sprintCompleteUnfinished: "未完了のタスクが {tasks} 件、未完了のPBIが {pbis} 件あります。",
  sprintCompleteAllDone: "すべてのタスクが完了しています。",
  sprintCompleteArchiveNote: "完了するとスプリントはアーカイブされ、AIによるスプリントレビューが自動で作成されます。",
  sprintCompleteCarryOverNote: "未完了のPBIはバックログに「Ready」のまま残り、次のスプリントに取り込めます。未完了のタスクはアーカイブされたスプリントに残ります。",
  sprintProgressLoadPct: "（容量の{pct}%）",
  sprintProgressDoneTasks: "完了タスク {done}/{total}（{pct}%）",
}

export const en: SprintsTranslations = {
  sprintTitle: "Sprints",
  sprintCreate: "Create Sprint",
  sprintName: "Sprint Name",
  sprintGoal: "Sprint Goal",
  sprintStartDate: "Start Date",
  sprintEndDate: "End Date",
  sprintCapacity: "Capacity",
  sprintStatus: "Status",
  sprintStatusPlanning: "Planning",
  sprintStatusActive: "Active",
  sprintStatusReview: "Review",
  sprintStatusDone: "Done",
  sprintDeleteConfirm: "Delete this sprint?",
  sprintEditMenu: "Edit Sprint",
  sprintEditTitle: "Edit Sprint",
  sprintNewSprint: "New Sprint",
  sprintAvgScore: "Average score from past {count} sprints",
  sprintPbImport: "Import from PB (Ready items)",
  sprintSelectedWorkload: "Selected workload",
  sprintNoPbReady: "No PB items to import",
  sprintNoPbReadyHint: "Items appear here once they are marked Ready in the backlog.",
  sprintNotEntered: "(Not entered)",
  sprintCreateWithCount: "Create ({count} items)",
  sprintWorkload: "Workload",
  sprintNoSprints: "No sprints",
  sprintDeleteFullConfirm: "Delete this sprint? All related tasks will also be deleted.",
  sprintPbItem: "PB Item",
  sprintAddPbi: "Add PB item",
  sprintAddPbiTitle: "Add PB items to this sprint",
  sprintAddPbiSubmit: "Add selected PBs",
  sprintAddPbiSearchPlaceholder: "Search by PB number, initiative, epic, user story",
  sprintRemovePbi: "Remove PB from sprint",
  sprintRemovePbiConfirm: "This removes the PB and all its tasks from the sprint. Continue?",
  sprintSelect: "Select",
  sprintUnassigned: "Unassigned",
  sprintUpdateFailed: "Update failed",
  sprintAddFailed: "Add failed",
  sprintCreateBlocked: "Cannot create — an active or planning sprint already exists",
  sprintCreated: "Sprint created",
  sprintCreateFailed: "Failed to create the sprint",
  sprintSaved: "Sprint updated",
  sprintDeleted: "Sprint deleted",
  sprintDeleteFailed: "Failed to delete the sprint",
  sprintStatusUpdateFailed: "Failed to change the sprint status",
  sprintRemovePbiFailed: "Could not remove the PB from the sprint",
  sprintNoSprintsHint: "Use “Create Sprint” to start your first sprint and pull in Ready PB items.",
  sprintMoveToStatus: "Move to {status}",
  sprintToggleDetails: "Show or hide details of {name}",
  sprintDeleteNamed: "Delete sprint {name}",
  sprintEditConflictNotice: "Someone else saved this first, so the latest values were loaded. Review them, re-apply your changes if needed, then save again.",
  sprintCompleteCheckTitle: "Before you complete",
  sprintCompleteUnfinished: "{tasks} unfinished task(s) and {pbis} unfinished PBI(s) remain.",
  sprintCompleteAllDone: "All tasks are done.",
  sprintCompleteArchiveNote: "Completing archives the sprint and starts an automatic AI sprint review.",
  sprintCompleteCarryOverNote: "Unfinished PBIs stay in the backlog as Ready and can be pulled into the next sprint. Unfinished tasks stay in the archived sprint.",
  sprintProgressLoadPct: "({pct}% of capacity)",
  sprintProgressDoneTasks: "Tasks done {done}/{total} ({pct}%)",
}

export const id: SprintsTranslations = {
  sprintTitle: "Sprint",
  sprintCreate: "Buat Sprint",
  sprintName: "Nama Sprint",
  sprintGoal: "Tujuan Sprint",
  sprintStartDate: "Tanggal Mulai",
  sprintEndDate: "Tanggal Selesai",
  sprintCapacity: "Kapasitas",
  sprintStatus: "Status",
  sprintStatusPlanning: "Perencanaan",
  sprintStatusActive: "Aktif",
  sprintStatusReview: "Review",
  sprintStatusDone: "Selesai",
  sprintDeleteConfirm: "Hapus sprint ini?",
  sprintEditMenu: "Sunting Sprint",
  sprintEditTitle: "Sunting Sprint",
  sprintNewSprint: "Sprint Baru",
  sprintAvgScore: "Rata-rata skor dari {count} sprint sebelumnya",
  sprintPbImport: "Impor dari PB (Item Siap)",
  sprintSelectedWorkload: "Beban terpilih",
  sprintNoPbReady: "Tidak ada item PB untuk diambil",
  sprintNoPbReadyHint: "Item akan muncul di sini setelah ditandai Ready di backlog.",
  sprintNotEntered: "(Belum diisi)",
  sprintCreateWithCount: "Buat ({count} item)",
  sprintWorkload: "Beban Kerja",
  sprintNoSprints: "Tidak ada sprint",
  sprintDeleteFullConfirm: "Hapus sprint ini? Semua tugas terkait juga akan dihapus.",
  sprintPbItem: "Item PB",
  sprintAddPbi: "Tambah item PB",
  sprintAddPbiTitle: "Tambahkan item PB ke sprint ini",
  sprintAddPbiSubmit: "Tambahkan PB terpilih",
  sprintAddPbiSearchPlaceholder: "Cari berdasarkan nomor PB, initiative, epic, user story",
  sprintRemovePbi: "Hapus PB dari sprint",
  sprintRemovePbiConfirm: "Ini akan menghapus PB beserta semua tugasnya dari sprint. Lanjutkan?",
  sprintSelect: "Pilih",
  sprintUnassigned: "Belum ditugaskan",
  sprintUpdateFailed: "Gagal memperbarui",
  sprintAddFailed: "Gagal menambahkan",
  sprintCreateBlocked: "Tidak bisa membuat — sprint aktif atau perencanaan sudah ada",
  sprintCreated: "Sprint berhasil dibuat",
  sprintCreateFailed: "Gagal membuat sprint",
  sprintSaved: "Sprint berhasil diperbarui",
  sprintDeleted: "Sprint berhasil dihapus",
  sprintDeleteFailed: "Gagal menghapus sprint",
  sprintStatusUpdateFailed: "Gagal mengubah status sprint",
  sprintRemovePbiFailed: "Gagal mengeluarkan PB dari sprint",
  sprintNoSprintsHint: "Gunakan “Buat Sprint” untuk memulai sprint pertama dan mengimpor item PB yang siap.",
  sprintMoveToStatus: "Pindahkan ke {status}",
  sprintToggleDetails: "Tampilkan atau sembunyikan detail {name}",
  sprintDeleteNamed: "Hapus sprint {name}",
  sprintEditConflictNotice: "Pengguna lain menyimpan lebih dulu, jadi nilai terbaru telah dimuat. Periksa, terapkan kembali perubahan Anda bila perlu, lalu simpan lagi.",
  sprintCompleteCheckTitle: "Sebelum menyelesaikan",
  sprintCompleteUnfinished: "Masih ada {tasks} tugas dan {pbis} PBI yang belum selesai.",
  sprintCompleteAllDone: "Semua tugas sudah selesai.",
  sprintCompleteArchiveNote: "Menyelesaikan akan mengarsipkan sprint dan memulai tinjauan sprint AI secara otomatis.",
  sprintCompleteCarryOverNote: "PBI yang belum selesai tetap di backlog sebagai Siap dan dapat dimasukkan ke sprint berikutnya. Tugas yang belum selesai tetap di sprint yang diarsipkan.",
  sprintProgressLoadPct: "({pct}% dari kapasitas)",
  sprintProgressDoneTasks: "Tugas selesai {done}/{total} ({pct}%)",
}
