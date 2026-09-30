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
  /** {name} */
  sprintStartConfirmTitle: string
  /** {period} {pbis} {tasks} {workload} {capacity} — lines separated by a newline escape */
  sprintStartConfirmBody: string
  sprintStartConfirmOver: string
  sprintStartConfirmNoTasks: string
  sprintStartConfirmLabel: string
  /** Success toasts after a status change; {name} */
  sprintStatusChangedActive: string
  sprintStatusChangedReopened: string
  sprintStatusChangedReview: string
  sprintStatusChangedDone: string
  /** Done tasks / all tasks of a sprint (the same number on the dashboard, sprint board and portfolio). */
  sprintCompletionRate: string
  sprintCompletionRateHint: string
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
  sprintAvgScore: "過去{count}スプリントの平均完了ポイント",
  sprintPbImport: "バックログから取り込み（Ready の PBI）",
  sprintSelectedWorkload: "選択負荷",
  sprintNoPbReady: "取り込める PBI がありません",
  sprintNoPbReadyHint: "バックログでアイテムを「Ready」にすると、ここに表示されます",
  sprintNotEntered: "(未入力)",
  sprintCreateWithCount: "作成（{count}件取り込み）",
  sprintWorkload: "業務負荷",
  sprintNoSprints: "スプリントはまだありません",
  sprintDeleteFullConfirm: "このスプリントを削除しますか？関連するタスクも全て削除されます。",
  sprintPbItem: "PBI",
  sprintAddPbi: "PBI を追加",
  sprintAddPbiTitle: "このスプリントに PBI を追加",
  sprintAddPbiSubmit: "選択した PBI を追加",
  sprintAddPbiSearchPlaceholder: "PBI 番号・イニシアティブ・エピック・ユーザーストーリーで検索",
  sprintRemovePbi: "この PBI をスプリントから外す",
  sprintRemovePbiConfirm: "この PBI と紐づく全タスクをスプリントから削除します。続行しますか？",
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
  sprintRemovePbiFailed: "PBI をスプリントから外せませんでした",
  sprintNoSprintsHint: "「スプリント作成」から最初のスプリントを作り、Ready 状態の PBI を取り込みましょう。",
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
  sprintStartConfirmTitle: "スプリント「{name}」を開始しますか？",
  sprintStartConfirmBody: "期間: {period}\nPBI: {pbis} 件 / タスク: {tasks} 件\n負荷: {workload} / キャパシティ {capacity}\n開始するとチーム全員に通知されます。",
  sprintStartConfirmOver: "負荷がキャパシティを超えています。",
  sprintStartConfirmNoTasks: "まだタスクがありません。開始後に追加することもできます。",
  sprintStartConfirmLabel: "開始する",
  sprintStatusChangedActive: "スプリント「{name}」を開始しました。チームに通知しました。",
  sprintStatusChangedReopened: "スプリント「{name}」を実行中に戻しました。",
  sprintStatusChangedReview: "スプリント「{name}」をレビューへ移行しました。",
  sprintStatusChangedDone: "スプリント「{name}」を完了しました。",
  sprintCompletionRate: "スプリント完了率",
  sprintCompletionRateHint: "完了タスク数 ÷ 全タスク数",
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
  sprintAvgScore: "Average completed points of the past {count} sprints",
  sprintPbImport: "Import from backlog (Ready PBIs)",
  sprintSelectedWorkload: "Selected workload",
  sprintNoPbReady: "No PBIs to import",
  sprintNoPbReadyHint: "Items appear here once they are marked Ready in the backlog.",
  sprintNotEntered: "(Not entered)",
  sprintCreateWithCount: "Create ({count} items)",
  sprintWorkload: "Workload",
  sprintNoSprints: "No sprints",
  sprintDeleteFullConfirm: "Delete this sprint? All related tasks will also be deleted.",
  sprintPbItem: "PBI",
  sprintAddPbi: "Add PBI",
  sprintAddPbiTitle: "Add PBIs to this sprint",
  sprintAddPbiSubmit: "Add selected PBIs",
  sprintAddPbiSearchPlaceholder: "Search by PBI number, initiative, epic, user story",
  sprintRemovePbi: "Remove PBI from sprint",
  sprintRemovePbiConfirm: "This removes the PBI and all its tasks from the sprint. Continue?",
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
  sprintRemovePbiFailed: "Could not remove the PBI from the sprint",
  sprintNoSprintsHint: "Use “Create Sprint” to start your first sprint and pull in Ready PBIs.",
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
  sprintStartConfirmTitle: "Start sprint \"{name}\"?",
  sprintStartConfirmBody: "Period: {period}\nPBIs: {pbis} / Tasks: {tasks}\nLoad: {workload} / capacity {capacity}\nThe whole team will be notified.",
  sprintStartConfirmOver: "The load exceeds the capacity.",
  sprintStartConfirmNoTasks: "There are no tasks yet. You can add them after starting.",
  sprintStartConfirmLabel: "Start sprint",
  sprintStatusChangedActive: "Sprint \"{name}\" started. The team has been notified.",
  sprintStatusChangedReopened: "Sprint \"{name}\" is active again.",
  sprintStatusChangedReview: "Sprint \"{name}\" moved to review.",
  sprintStatusChangedDone: "Sprint \"{name}\" completed.",
  sprintCompletionRate: "Sprint completion",
  sprintCompletionRateHint: "Done tasks ÷ all tasks",
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
  sprintAvgScore: "Rata-rata poin selesai dari {count} sprint sebelumnya",
  sprintPbImport: "Impor dari backlog (PBI Siap)",
  sprintSelectedWorkload: "Beban terpilih",
  sprintNoPbReady: "Tidak ada PBI untuk diambil",
  sprintNoPbReadyHint: "Item akan muncul di sini setelah ditandai Ready di backlog.",
  sprintNotEntered: "(Belum diisi)",
  sprintCreateWithCount: "Buat ({count} item)",
  sprintWorkload: "Beban Kerja",
  sprintNoSprints: "Tidak ada sprint",
  sprintDeleteFullConfirm: "Hapus sprint ini? Semua tugas terkait juga akan dihapus.",
  sprintPbItem: "PBI",
  sprintAddPbi: "Tambah PBI",
  sprintAddPbiTitle: "Tambahkan PBI ke sprint ini",
  sprintAddPbiSubmit: "Tambahkan PBI terpilih",
  sprintAddPbiSearchPlaceholder: "Cari berdasarkan nomor PBI, inisiatif, epik, user story",
  sprintRemovePbi: "Keluarkan PBI dari sprint",
  sprintRemovePbiConfirm: "Ini akan mengeluarkan PBI beserta semua tugasnya dari sprint. Lanjutkan?",
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
  sprintRemovePbiFailed: "Gagal mengeluarkan PBI dari sprint",
  sprintNoSprintsHint: "Gunakan “Buat Sprint” untuk memulai sprint pertama dan mengimpor PBI yang siap.",
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
  sprintStartConfirmTitle: "Mulai sprint \"{name}\"?",
  sprintStartConfirmBody: "Periode: {period}\nPBI: {pbis} / Tugas: {tasks}\nBeban: {workload} / kapasitas {capacity}\nSeluruh tim akan diberi tahu.",
  sprintStartConfirmOver: "Beban melebihi kapasitas.",
  sprintStartConfirmNoTasks: "Belum ada tugas. Anda dapat menambahkannya setelah sprint dimulai.",
  sprintStartConfirmLabel: "Mulai sprint",
  sprintStatusChangedActive: "Sprint \"{name}\" dimulai. Tim telah diberi tahu.",
  sprintStatusChangedReopened: "Sprint \"{name}\" aktif kembali.",
  sprintStatusChangedReview: "Sprint \"{name}\" dipindahkan ke tinjauan.",
  sprintStatusChangedDone: "Sprint \"{name}\" selesai.",
  sprintCompletionRate: "Penyelesaian sprint",
  sprintCompletionRateHint: "Tugas selesai ÷ semua tugas",
}
