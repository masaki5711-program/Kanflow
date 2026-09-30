/**
 * i18n domain: "insights" surfaces — the project dashboard's top rows
 * (sprint pulse, my tasks, upcoming due, activity feed), the home page KPIs /
 * inline task status / lazy archived list, the burndown sprint selector and
 * the velocity chart, and the IceBox undo toast.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface InsightsTranslations {
  // Dashboard — active sprint pulse
  dashboardPulseDaysLeft: string
  dashboardPulseEndsToday: string
  dashboardPulseOverdue: string
  dashboardPulseProgress: string
  dashboardPulseSparkline: string
  dashboardPulseOpenBurndown: string
  // Dashboard — my tasks in this project
  dashboardMyTasksTitle: string
  dashboardMyTasksEmpty: string
  dashboardMyTasksMore: string
  // Dashboard — upcoming due
  dashboardDueTitle: string
  dashboardDueEmpty: string
  dashboardDueSprintEnd: string
  dashboardDueMilestone: string
  dashboardDuePlanItem: string
  dashboardDueOverdue: string
  dashboardDueToday: string
  dashboardDueInDays: string
  // Dashboard — activity feed
  dashboardFeedTitle: string
  dashboardFeedEmpty: string
  dashboardFeedLoadFailed: string
  dashboardFeedRetry: string
  dashboardFeedLoadMore: string
  dashboardFeedEntityPbi: string
  dashboardFeedEntitySprintTask: string
  dashboardFeedEntitySprint: string
  dashboardFeedEntityIcebox: string
  dashboardFeedEntityGoal: string
  dashboardFeedEntityRelease: string
  dashboardFeedEntityPlanItem: string
  dashboardFeedEntityMember: string
  dashboardFeedEntityProject: string
  dashboardFeedCreate: string
  /** A member joining the project ("create" of a member entry). */
  dashboardFeedMemberAdd: string
  dashboardFeedUpdate: string
  dashboardFeedDelete: string
  dashboardFeedStatusChange: string
  dashboardFeedAssign: string
  dashboardFeedMove: string
  dashboardFeedRestore: string
  dashboardFeedComment: string
  dashboardFeedStatusTo: string
  dashboardProjectDetails: string
  // Home — KPIs, inline task status, archived projects
  topKpiOpen: string
  topKpiOverdue: string
  topKpiDueThisWeek: string
  topKpiRefinement: string
  topKpiReview: string
  topKpiSprintCompletion: string
  topKpiTasksDone: string
  topKpiNoActiveSprint: string
  topKpiNoTasksHint: string
  topTaskOverdueBadge: string
  topTaskDueSoonBadge: string
  topTaskDueOn: string
  topTaskStatusLabel: string
  topTaskStatusFailed: string
  topTaskReview: string
  topArchivedLoadFailed: string
  topRetry: string
  // Burndown — sprint selector
  burndownSprintSelect: string
  burndownSprintAll: string
  // Velocity chart
  velocityTitle: string
  velocityDescription: string
  velocityAverage: string
  velocityAverageLegend: string
  velocityCompleted: string
  velocityCapacity: string
  velocityEmpty: string
  velocityChartLabel: string
  velocityTableCaption: string
  velocitySprintColumn: string
  // IceBox — undo after "move to trash"
  iceboxUndo: string
}

export const ja: InsightsTranslations = {
  dashboardPulseDaysLeft: "残り {days} 日",
  dashboardPulseEndsToday: "今日が最終日",
  dashboardPulseOverdue: "終了日を {days} 日超過",
  dashboardPulseProgress: "{done}/{total} タスク完了",
  dashboardPulseSparkline: "スプリントのバーンダウン: {total} タスク中 残り {remaining}",
  dashboardPulseOpenBurndown: "バーンダウンを見る",
  dashboardMyTasksTitle: "このプロジェクトの自分のタスク",
  dashboardMyTasksEmpty: "担当しているタスクはありません",
  dashboardMyTasksMore: "ほか {count} 件をスプリントで見る",
  dashboardDueTitle: "期限が近いもの",
  dashboardDueEmpty: "14 日以内の期限はありません",
  dashboardDueSprintEnd: "スプリント終了",
  dashboardDueMilestone: "マイルストーン",
  dashboardDuePlanItem: "計画項目",
  dashboardDueOverdue: "期限切れ",
  dashboardDueToday: "今日",
  dashboardDueInDays: "{days} 日後",
  dashboardFeedTitle: "最近のアクティビティ",
  dashboardFeedEmpty: "まだアクティビティはありません",
  dashboardFeedLoadFailed: "アクティビティを取得できませんでした",
  dashboardFeedRetry: "再読み込み",
  dashboardFeedLoadMore: "さらに表示",
  dashboardFeedEntityPbi: "PBI",
  dashboardFeedEntitySprintTask: "タスク",
  dashboardFeedEntitySprint: "スプリント",
  dashboardFeedEntityIcebox: "IceBox アイテム",
  dashboardFeedEntityGoal: "プロダクトゴール",
  dashboardFeedEntityRelease: "リリース項目",
  dashboardFeedEntityPlanItem: "計画項目",
  dashboardFeedEntityMember: "メンバー",
  dashboardFeedEntityProject: "プロジェクト",
  dashboardFeedCreate: "{actor} が{entity}を作成しました",
  dashboardFeedMemberAdd: "{actor} が{entity}を追加しました",
  dashboardFeedUpdate: "{actor} が{entity}を更新しました",
  dashboardFeedDelete: "{actor} が{entity}を削除しました",
  dashboardFeedStatusChange: "{actor} が{entity}のステータスを変更しました",
  dashboardFeedAssign: "{actor} が{entity}の担当者を変更しました",
  dashboardFeedMove: "{actor} が{entity}を移動しました",
  dashboardFeedRestore: "{actor} が{entity}を復元しました",
  dashboardFeedComment: "{actor} が{entity}にコメントしました",
  dashboardFeedStatusTo: "→ {status}",
  dashboardProjectDetails: "プロジェクトの説明",
  topKpiOpen: "未完了のタスク",
  topKpiOverdue: "期限切れ",
  topKpiDueThisWeek: "今週が期限",
  topKpiRefinement: "リファインメント待ち PBI",
  topKpiReview: "レビュー待ちスプリント",
  topKpiSprintCompletion: "今スプリントの完了率",
  topKpiTasksDone: "{done}/{total} タスク完了",
  topKpiNoActiveSprint: "実行中のスプリントはありません",
  topKpiNoTasksHint: "担当中のタスクはありません。スプリントでタスクを担当すると、ここに件数が表示されます。",
  topTaskOverdueBadge: "期限切れ",
  topTaskDueSoonBadge: "まもなく期限",
  topTaskDueOn: "期限 {date}",
  topTaskStatusLabel: "「{task}」のステータス",
  topTaskStatusFailed: "ステータスを変更できませんでした",
  topTaskReview: "レビュー中",
  topArchivedLoadFailed: "アーカイブ済みプロジェクトを取得できませんでした",
  topRetry: "再試行",
  burndownSprintSelect: "対象スプリント",
  burndownSprintAll: "全スプリント（プロジェクト全体）",
  velocityTitle: "ベロシティ",
  velocityDescription: "直近 {count} スプリントの完了ポイント",
  velocityAverage: "平均 {value}",
  velocityAverageLegend: "平均",
  velocityCompleted: "完了ポイント",
  velocityCapacity: "キャパシティ",
  velocityEmpty: "完了したスプリントがまだありません",
  velocityChartLabel: "ベロシティ: 直近 {count} スプリント、平均 {average}",
  velocityTableCaption: "スプリント別の完了ポイントとキャパシティ",
  velocitySprintColumn: "スプリント",
  iceboxUndo: "元に戻す",
}

export const en: InsightsTranslations = {
  dashboardPulseDaysLeft: "{days} days left",
  dashboardPulseEndsToday: "Last day today",
  dashboardPulseOverdue: "{days} days past the end date",
  dashboardPulseProgress: "{done}/{total} tasks done",
  dashboardPulseSparkline: "Sprint burndown: {remaining} of {total} tasks remaining",
  dashboardPulseOpenBurndown: "Open burndown",
  dashboardMyTasksTitle: "My tasks in this project",
  dashboardMyTasksEmpty: "No tasks assigned to you",
  dashboardMyTasksMore: "See {count} more in the sprint",
  dashboardDueTitle: "Coming up",
  dashboardDueEmpty: "Nothing due in the next 14 days",
  dashboardDueSprintEnd: "Sprint ends",
  dashboardDueMilestone: "Milestone",
  dashboardDuePlanItem: "Plan item",
  dashboardDueOverdue: "Overdue",
  dashboardDueToday: "Today",
  dashboardDueInDays: "in {days} days",
  dashboardFeedTitle: "Recent activity",
  dashboardFeedEmpty: "No activity yet",
  dashboardFeedLoadFailed: "Could not load the activity",
  dashboardFeedRetry: "Reload",
  dashboardFeedLoadMore: "Show more",
  dashboardFeedEntityPbi: "PBI",
  dashboardFeedEntitySprintTask: "task",
  dashboardFeedEntitySprint: "sprint",
  dashboardFeedEntityIcebox: "IceBox item",
  dashboardFeedEntityGoal: "product goal",
  dashboardFeedEntityRelease: "release item",
  dashboardFeedEntityPlanItem: "plan item",
  dashboardFeedEntityMember: "member",
  dashboardFeedEntityProject: "project",
  dashboardFeedCreate: "{actor} created {entity}",
  dashboardFeedMemberAdd: "{actor} added {entity}",
  dashboardFeedUpdate: "{actor} updated {entity}",
  dashboardFeedDelete: "{actor} deleted {entity}",
  dashboardFeedStatusChange: "{actor} changed the status of {entity}",
  dashboardFeedAssign: "{actor} changed the assignee of {entity}",
  dashboardFeedMove: "{actor} moved {entity}",
  dashboardFeedRestore: "{actor} restored {entity}",
  dashboardFeedComment: "{actor} commented on {entity}",
  dashboardFeedStatusTo: "→ {status}",
  dashboardProjectDetails: "Project description",
  topKpiOpen: "Open tasks",
  topKpiOverdue: "Overdue",
  topKpiDueThisWeek: "Due this week",
  topKpiRefinement: "PBIs awaiting refinement",
  topKpiReview: "Sprints awaiting review",
  topKpiSprintCompletion: "Current sprint done",
  topKpiTasksDone: "{done} of {total} tasks done",
  topKpiNoActiveSprint: "No sprint is running",
  topKpiNoTasksHint: "You have no open tasks. Counts appear here once you take on tasks in a sprint.",
  topTaskOverdueBadge: "Overdue",
  topTaskDueSoonBadge: "Due soon",
  topTaskDueOn: "Due {date}",
  topTaskStatusLabel: "Status of \"{task}\"",
  topTaskStatusFailed: "Could not change the status",
  topTaskReview: "In review",
  topArchivedLoadFailed: "Could not load the archived projects",
  topRetry: "Retry",
  burndownSprintSelect: "Sprint",
  burndownSprintAll: "All sprints (whole project)",
  velocityTitle: "Velocity",
  velocityDescription: "Completed points of the last {count} sprints",
  velocityAverage: "Average {value}",
  velocityAverageLegend: "Average",
  velocityCompleted: "Completed points",
  velocityCapacity: "Capacity",
  velocityEmpty: "No finished sprints yet",
  velocityChartLabel: "Velocity: last {count} sprints, average {average}",
  velocityTableCaption: "Completed points and capacity per sprint",
  velocitySprintColumn: "Sprint",
  iceboxUndo: "Undo",
}

export const id: InsightsTranslations = {
  dashboardPulseDaysLeft: "Sisa {days} hari",
  dashboardPulseEndsToday: "Hari terakhir hari ini",
  dashboardPulseOverdue: "Lewat {days} hari dari tanggal akhir",
  dashboardPulseProgress: "{done}/{total} tugas selesai",
  dashboardPulseSparkline: "Burndown sprint: sisa {remaining} dari {total} tugas",
  dashboardPulseOpenBurndown: "Buka burndown",
  dashboardMyTasksTitle: "Tugas saya di proyek ini",
  dashboardMyTasksEmpty: "Tidak ada tugas yang ditugaskan kepada Anda",
  dashboardMyTasksMore: "Lihat {count} lainnya di sprint",
  dashboardDueTitle: "Segera jatuh tempo",
  dashboardDueEmpty: "Tidak ada tenggat dalam 14 hari ke depan",
  dashboardDueSprintEnd: "Sprint berakhir",
  dashboardDueMilestone: "Tonggak",
  dashboardDuePlanItem: "Item rencana",
  dashboardDueOverdue: "Terlambat",
  dashboardDueToday: "Hari ini",
  dashboardDueInDays: "{days} hari lagi",
  dashboardFeedTitle: "Aktivitas terbaru",
  dashboardFeedEmpty: "Belum ada aktivitas",
  dashboardFeedLoadFailed: "Gagal memuat aktivitas",
  dashboardFeedRetry: "Muat ulang",
  dashboardFeedLoadMore: "Tampilkan lebih banyak",
  dashboardFeedEntityPbi: "PBI",
  dashboardFeedEntitySprintTask: "tugas",
  dashboardFeedEntitySprint: "sprint",
  dashboardFeedEntityIcebox: "item IceBox",
  dashboardFeedEntityGoal: "tujuan produk",
  dashboardFeedEntityRelease: "item rilis",
  dashboardFeedEntityPlanItem: "item rencana",
  dashboardFeedEntityMember: "anggota",
  dashboardFeedEntityProject: "proyek",
  dashboardFeedCreate: "{actor} membuat {entity}",
  dashboardFeedMemberAdd: "{actor} menambahkan {entity}",
  dashboardFeedUpdate: "{actor} memperbarui {entity}",
  dashboardFeedDelete: "{actor} menghapus {entity}",
  dashboardFeedStatusChange: "{actor} mengubah status {entity}",
  dashboardFeedAssign: "{actor} mengubah penanggung jawab {entity}",
  dashboardFeedMove: "{actor} memindahkan {entity}",
  dashboardFeedRestore: "{actor} memulihkan {entity}",
  dashboardFeedComment: "{actor} mengomentari {entity}",
  dashboardFeedStatusTo: "→ {status}",
  dashboardProjectDetails: "Deskripsi proyek",
  topKpiOpen: "Tugas terbuka",
  topKpiOverdue: "Terlambat",
  topKpiDueThisWeek: "Jatuh tempo minggu ini",
  topKpiRefinement: "PBI menunggu penyempurnaan",
  topKpiReview: "Sprint menunggu tinjauan",
  topKpiSprintCompletion: "Penyelesaian sprint ini",
  topKpiTasksDone: "{done} dari {total} tugas selesai",
  topKpiNoActiveSprint: "Tidak ada sprint yang berjalan",
  topKpiNoTasksHint: "Anda tidak memiliki tugas terbuka. Jumlahnya akan muncul di sini setelah Anda mengambil tugas di sprint.",
  topTaskOverdueBadge: "Terlambat",
  topTaskDueSoonBadge: "Segera jatuh tempo",
  topTaskDueOn: "Tenggat {date}",
  topTaskStatusLabel: "Status \"{task}\"",
  topTaskStatusFailed: "Gagal mengubah status",
  topTaskReview: "Dalam tinjauan",
  topArchivedLoadFailed: "Gagal memuat proyek yang diarsipkan",
  topRetry: "Coba lagi",
  burndownSprintSelect: "Sprint",
  burndownSprintAll: "Semua sprint (seluruh proyek)",
  velocityTitle: "Velositas",
  velocityDescription: "Poin selesai dari {count} sprint terakhir",
  velocityAverage: "Rata-rata {value}",
  velocityAverageLegend: "Rata-rata",
  velocityCompleted: "Poin selesai",
  velocityCapacity: "Kapasitas",
  velocityEmpty: "Belum ada sprint yang selesai",
  velocityChartLabel: "Velositas: {count} sprint terakhir, rata-rata {average}",
  velocityTableCaption: "Poin selesai dan kapasitas per sprint",
  velocitySprintColumn: "Sprint",
  iceboxUndo: "Urungkan",
}
