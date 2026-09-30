/**
 * i18n domain: Sprint tasks, daily scrum, burndown.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface SprintTasksTranslations {
  taskNamePlaceholder: string
  taskHoursPlaceholder: string
  sprintTasks: string
  sprintAddTask: string
  sprintTaskName: string
  sprintAssignee: string
  sprintEstimatedHours: string
  // Burndown
  burndownTitle: string
  burndownShow: string
  burndownHide: string
  sprintTaskCompleteTitle: string
  sprintTaskCompleteHint: string
  sprintTaskCompleteSkip: string
  sprintTaskCompletionComment: string
  sprintTaskCompletionCommentPlaceholder: string
  completionToIceboxToggle: string
  completionToIceboxPlaceholder: string
  completionToIceboxSent: string
  burndownPlan: string
  burndownIdeal: string
  burndownActual: string
  burndownTotal: string
  /** Task count in a burndown sprint band; {count}. */
  burndownBandTaskCount: string
  burndownRemainingTasks: string
  burndownCompleted: string
  // Task status
  taskTodo: string
  taskInProgress: string
  taskDone: string
  sprintTaskEdit: string
  sprintDailyScrum: string
  sprintDailyScrumAdd: string
  sprintDailyScrumEmpty: string
  sprintDailyScrumDatePlaceholder: string
  sprintDailyScrumContentPlaceholder: string
  sprintDailyScrumDeleteConfirm: string
  sprintDailyScrumArchive: string
  sprintDailyScrumUnarchive: string
  sprintDailyScrumArchived: string
  sprintNoTasksYet: string
  sprintEstimatedHoursShort: string
  sprintActualHoursShort: string
  /** Unit of task estimate / actual hours (not the project point unit). */
  sprintHoursUnit: string
  /** PBI task line (S-20): {done} {total} {hours}; tasks are counted, estimates are hours. */
  sprintPbiTaskSummary: string
  sprintNoTaskName: string
  sprintAddTaskShort: string
  sprintNoTasks: string
  sprintStatusClickToggle: string
  sprintDeleteTaskConfirm: string
  burndownOpenPage: string
  burndownPageTitle: string
  sprintTaskNeedsPbiFirst: string
  sprintTaskPbiDetail: string
  sprintTaskPbiEditable: string
  sprintTaskPbiReadOnly: string
  sprintTaskPbiUnsaved: string
  sprintTaskPbiSaveFailed: string
  sprintTaskBulkAdded: string
  sprintTaskStatusFailed: string
  sprintTaskDeleteFailed: string
  sprintTaskCommentSaveFailed: string
  sprintTaskIceboxFailed: string
  sprintTaskEditNamed: string
  sprintTaskDeleteNamed: string
  sprintTaskEditComment: string
  sprintDailyScrumContentLabel: string
  sprintDailyScrumSaveFailed: string
  burndownToday: string
  burndownEmpty: string
  burndownChartLabel: string
  burndownRefresh: string
  burndownScrollRegion: string
}

export const ja: SprintTasksTranslations = {
  taskNamePlaceholder: "例: API実装、画面デザイン",
  taskHoursPlaceholder: "例: 4",
  sprintTasks: "タスク",
  sprintAddTask: "タスク追加",
  sprintTaskName: "タスク名",
  sprintAssignee: "担当者",
  sprintEstimatedHours: "見積時間",
  burndownTitle: "バーンダウンチャート",
  burndownShow: "バーンダウン表示",
  burndownHide: "バーンダウン非表示",
  sprintTaskCompleteTitle: "タスク完了",
  sprintTaskCompleteHint: "完了内容や所感を記録（任意）",
  sprintTaskCompleteSkip: "コメント無しで完了",
  sprintTaskCompletionComment: "完了コメント",
  sprintTaskCompletionCommentPlaceholder: "実施内容・気づきなどを記入…",
  completionToIceboxToggle: "Iceboxにも追加(発見した問題・残課題など)",
  completionToIceboxPlaceholder: "Iceboxへ送る内容を入力(空欄なら送信しません)",
  completionToIceboxSent: "Iceboxに追加しました",
  burndownPlan: "計画（稼働日）",
  burndownIdeal: "理想（全日）",
  burndownActual: "実績",
  burndownTotal: "全{count}件",
  burndownBandTaskCount: "{count}件",
  burndownRemainingTasks: "残タスク数 (件)",
  burndownCompleted: "件完了",
  taskTodo: "未着手",
  taskInProgress: "進行中",
  taskDone: "完了",
  sprintTaskEdit: "タスク編集",
  sprintDailyScrum: "デイリースクラム",
  sprintDailyScrumAdd: "デイリースクラムを追加",
  sprintDailyScrumEmpty: "まだ記録がありません。毎日の進捗・困りごと・次の24時間のプランを記入してください。",
  sprintDailyScrumDatePlaceholder: "実施日",
  sprintDailyScrumContentPlaceholder: "今日やったこと / 明日やること / 困っていること …",
  sprintDailyScrumDeleteConfirm: "このデイリースクラム記録を削除しますか？",
  sprintDailyScrumArchive: "アーカイブ",
  sprintDailyScrumUnarchive: "復元",
  sprintDailyScrumArchived: "アーカイブ済み",
  sprintNoTasksYet: "タスクがまだありません",
  sprintEstimatedHoursShort: "見積時間",
  sprintActualHoursShort: "実績時間",
  sprintHoursUnit: "h",
  sprintPbiTaskSummary: "タスク {done}/{total} 件 · 見積 {hours}h",
  sprintNoTaskName: "(タスク名なし)",
  sprintAddTaskShort: "タスク追加",
  sprintNoTasks: "タスクがありません",
  sprintStatusClickToggle: "現在: {status} (クリックで切替)",
  sprintDeleteTaskConfirm: "このタスクを削除しますか？",
  burndownOpenPage: "バーンダウンを開く",
  burndownPageTitle: "バーンダウンチャート",
  sprintTaskNeedsPbiFirst: "まず PBアイテムを取り込んでからタスクを追加してください。",
  sprintTaskPbiDetail: "PBI 詳細",
  sprintTaskPbiEditable: "編集可",
  sprintTaskPbiReadOnly: "参照のみ",
  sprintTaskPbiUnsaved: "未保存の変更あり",
  sprintTaskPbiSaveFailed: "PBIの保存に失敗しました",
  sprintTaskBulkAdded: "{count}件のタスクを追加しました",
  sprintTaskStatusFailed: "タスクのステータス更新に失敗しました",
  sprintTaskDeleteFailed: "タスクの削除に失敗しました",
  sprintTaskCommentSaveFailed: "完了コメントの保存に失敗しました",
  sprintTaskIceboxFailed: "Iceboxへの追加に失敗しました",
  sprintTaskEditNamed: "タスク「{name}」を編集",
  sprintTaskDeleteNamed: "タスク「{name}」を削除",
  sprintTaskEditComment: "完了コメントを編集",
  sprintDailyScrumContentLabel: "内容",
  sprintDailyScrumSaveFailed: "デイリースクラムの保存に失敗しました",
  burndownToday: "今日",
  burndownEmpty: "バーンダウンを表示できるデータがまだありません",
  burndownChartLabel: "バーンダウンチャート：全{total}件中 残り{remaining}件",
  burndownRefresh: "バーンダウンを再読み込み",
  burndownScrollRegion: "バーンダウンチャート（横スクロール可）",
}

export const en: SprintTasksTranslations = {
  taskNamePlaceholder: "e.g., API implementation, UI design",
  taskHoursPlaceholder: "e.g., 4",
  sprintTasks: "Tasks",
  sprintAddTask: "Add Task",
  sprintTaskName: "Task Name",
  sprintAssignee: "Assignee",
  sprintEstimatedHours: "Estimated Hours",
  burndownTitle: "Burndown Chart",
  burndownShow: "Show Burndown",
  burndownHide: "Hide Burndown",
  sprintTaskCompleteTitle: "Task Completed",
  sprintTaskCompleteHint: "Optionally note what was done",
  sprintTaskCompleteSkip: "Done without comment",
  sprintTaskCompletionComment: "Completion comment",
  sprintTaskCompletionCommentPlaceholder: "What was done, observations, etc.…",
  completionToIceboxToggle: "Also add to Icebox (issues found, remaining work, etc.)",
  completionToIceboxPlaceholder: "Type the item to send to Icebox (leave blank to skip)",
  completionToIceboxSent: "Added to Icebox",
  burndownPlan: "Plan (Working Days)",
  burndownIdeal: "Ideal (All Days)",
  burndownActual: "Actual",
  burndownTotal: "Total {count}",
  burndownBandTaskCount: "{count} tasks",
  burndownRemainingTasks: "Remaining Tasks",
  burndownCompleted: " completed",
  taskTodo: "To Do",
  taskInProgress: "In Progress",
  taskDone: "Done",
  sprintTaskEdit: "Edit Task",
  sprintDailyScrum: "Daily Scrum",
  sprintDailyScrumAdd: "Add Daily Scrum note",
  sprintDailyScrumEmpty: "No notes yet. Record daily progress, blockers, and the plan for the next 24 hours.",
  sprintDailyScrumDatePlaceholder: "Date",
  sprintDailyScrumContentPlaceholder: "What was done / What is next / Impediments …",
  sprintDailyScrumDeleteConfirm: "Delete this Daily Scrum note?",
  sprintDailyScrumArchive: "Archive",
  sprintDailyScrumUnarchive: "Restore",
  sprintDailyScrumArchived: "Archived",
  sprintNoTasksYet: "No tasks yet",
  sprintEstimatedHoursShort: "Estimated",
  sprintActualHoursShort: "Actual",
  sprintHoursUnit: "h",
  sprintPbiTaskSummary: "Tasks {done}/{total} · est. {hours} h",
  sprintNoTaskName: "(No task name)",
  sprintAddTaskShort: "Add task",
  sprintNoTasks: "No tasks",
  sprintStatusClickToggle: "Current: {status} (Click to toggle)",
  sprintDeleteTaskConfirm: "Delete this task?",
  burndownOpenPage: "Open burndown",
  burndownPageTitle: "Burndown Chart",
  sprintTaskNeedsPbiFirst: "Add a PB item to this sprint first, then add tasks.",
  sprintTaskPbiDetail: "PBI details",
  sprintTaskPbiEditable: "editable",
  sprintTaskPbiReadOnly: "read-only",
  sprintTaskPbiUnsaved: "Unsaved changes",
  sprintTaskPbiSaveFailed: "Failed to save the PBI",
  sprintTaskBulkAdded: "Added {count} tasks",
  sprintTaskStatusFailed: "Failed to update the task status",
  sprintTaskDeleteFailed: "Failed to delete the task",
  sprintTaskCommentSaveFailed: "Failed to save the completion comment",
  sprintTaskIceboxFailed: "Failed to add to Icebox",
  sprintTaskEditNamed: "Edit task {name}",
  sprintTaskDeleteNamed: "Delete task {name}",
  sprintTaskEditComment: "Edit completion comment",
  sprintDailyScrumContentLabel: "Notes",
  sprintDailyScrumSaveFailed: "Failed to save the Daily Scrum note",
  burndownToday: "Today",
  burndownEmpty: "Not enough data to draw the burndown yet",
  burndownChartLabel: "Burndown chart: {remaining} of {total} tasks remaining",
  burndownRefresh: "Reload burndown",
  burndownScrollRegion: "Burndown chart (scrolls horizontally)",
}

export const id: SprintTasksTranslations = {
  taskNamePlaceholder: "misalnya: Implementasi API, Desain UI",
  taskHoursPlaceholder: "misalnya: 4",
  sprintTasks: "Tugas",
  sprintAddTask: "Tambah Tugas",
  sprintTaskName: "Nama Tugas",
  sprintAssignee: "Penanggung Jawab",
  sprintEstimatedHours: "Estimasi Jam",
  burndownTitle: "Grafik Burndown",
  burndownShow: "Tampilkan Burndown",
  burndownHide: "Sembunyikan Burndown",
  sprintTaskCompleteTitle: "Tugas Selesai",
  sprintTaskCompleteHint: "Catat apa yang telah dikerjakan (opsional)",
  sprintTaskCompleteSkip: "Selesai tanpa komentar",
  sprintTaskCompletionComment: "Komentar penyelesaian",
  sprintTaskCompletionCommentPlaceholder: "Apa yang dilakukan, catatan, dsb…",
  completionToIceboxToggle: "Tambahkan ke Icebox juga (masalah ditemukan, sisa pekerjaan, dll.)",
  completionToIceboxPlaceholder: "Isi item yang akan dikirim ke Icebox (kosong untuk lewati)",
  completionToIceboxSent: "Ditambahkan ke Icebox",
  burndownPlan: "Rencana (Hari Kerja)",
  burndownIdeal: "Ideal (Semua Hari)",
  burndownActual: "Aktual",
  burndownTotal: "Total {count}",
  burndownBandTaskCount: "{count} tugas",
  burndownRemainingTasks: "Sisa Tugas",
  burndownCompleted: " selesai",
  taskTodo: "Belum Mulai",
  taskInProgress: "Sedang Berjalan",
  taskDone: "Selesai",
  sprintTaskEdit: "Edit Tugas",
  sprintDailyScrum: "Daily Scrum",
  sprintDailyScrumAdd: "Tambah catatan Daily Scrum",
  sprintDailyScrumEmpty: "Belum ada catatan. Catat kemajuan harian, hambatan, dan rencana 24 jam berikutnya.",
  sprintDailyScrumDatePlaceholder: "Tanggal",
  sprintDailyScrumContentPlaceholder: "Apa yang sudah dikerjakan / Rencana berikutnya / Hambatan …",
  sprintDailyScrumDeleteConfirm: "Hapus catatan Daily Scrum ini?",
  sprintDailyScrumArchive: "Arsipkan",
  sprintDailyScrumUnarchive: "Pulihkan",
  sprintDailyScrumArchived: "Diarsipkan",
  sprintNoTasksYet: "Belum ada tugas",
  sprintEstimatedHoursShort: "Estimasi",
  sprintActualHoursShort: "Aktual",
  sprintHoursUnit: "jam",
  sprintPbiTaskSummary: "Tugas {done}/{total} · estimasi {hours} jam",
  sprintNoTaskName: "(Tanpa nama tugas)",
  sprintAddTaskShort: "Tambah tugas",
  sprintNoTasks: "Tidak ada tugas",
  sprintStatusClickToggle: "Saat ini: {status} (Klik untuk mengganti)",
  sprintDeleteTaskConfirm: "Hapus tugas ini?",
  burndownOpenPage: "Buka burndown",
  burndownPageTitle: "Grafik Burndown",
  sprintTaskNeedsPbiFirst: "Tambahkan item PB ke sprint ini terlebih dahulu, lalu tambahkan tugas.",
  sprintTaskPbiDetail: "Detail PBI",
  sprintTaskPbiEditable: "dapat disunting",
  sprintTaskPbiReadOnly: "hanya baca",
  sprintTaskPbiUnsaved: "Ada perubahan yang belum disimpan",
  sprintTaskPbiSaveFailed: "Gagal menyimpan PBI",
  sprintTaskBulkAdded: "{count} tugas berhasil ditambahkan",
  sprintTaskStatusFailed: "Gagal memperbarui status tugas",
  sprintTaskDeleteFailed: "Gagal menghapus tugas",
  sprintTaskCommentSaveFailed: "Gagal menyimpan komentar penyelesaian",
  sprintTaskIceboxFailed: "Gagal menambahkan ke Icebox",
  sprintTaskEditNamed: "Sunting tugas {name}",
  sprintTaskDeleteNamed: "Hapus tugas {name}",
  sprintTaskEditComment: "Sunting komentar penyelesaian",
  sprintDailyScrumContentLabel: "Isi catatan",
  sprintDailyScrumSaveFailed: "Gagal menyimpan catatan Daily Scrum",
  burndownToday: "Hari ini",
  burndownEmpty: "Belum ada cukup data untuk menampilkan grafik burndown",
  burndownChartLabel: "Grafik burndown: {remaining} dari {total} tugas tersisa",
  burndownRefresh: "Muat ulang burndown",
  burndownScrollRegion: "Grafik burndown (dapat digulir ke samping)",
}
