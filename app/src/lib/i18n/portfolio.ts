/**
 * i18n domain: department portfolio (P4, `/portfolio`) — the cross-project
 * table for system admins and section managers, its KPI strip, filters and
 * the header link.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {days} {count} {points} {done} {planned} {date} {shown} {total} {column}.
 */
export interface PortfolioTranslations {
  portfolioNav: string
  portfolioTitle: string
  portfolioDescription: string
  portfolioScopeAll: string
  portfolioScopeSections: string
  /** {date} */
  portfolioAsOf: string
  /** {count} */
  portfolioCapped: string
  portfolioKpiProjects: string
  portfolioKpiActiveSprints: string
  portfolioKpiAttention: string
  portfolioKpiOverdue: string
  portfolioKpiDelayedPlan: string
  portfolioKpiCritical: string
  portfolioFiltersLabel: string
  portfolioFilterSection: string
  portfolioFilterStatus: string
  portfolioFilterAll: string
  portfolioAttentionOnly: string
  portfolioFilterClear: string
  /** {shown} {total} */
  portfolioResultCount: string
  portfolioTableCaption: string
  portfolioColProject: string
  portfolioColSection: string
  portfolioColSprint: string
  portfolioColOverdue: string
  portfolioColBacklog: string
  portfolioColVelocity: string
  portfolioColSurveillance: string
  portfolioColPlan: string
  portfolioColLastActivity: string
  /** Header tooltips (the headers themselves are short). */
  portfolioColProjectHint: string
  portfolioColSectionHint: string
  portfolioColSprintHint: string
  portfolioColOverdueHint: string
  portfolioColBacklogHint: string
  portfolioColVelocityHint: string
  portfolioColSurveillanceHint: string
  portfolioColPlanHint: string
  portfolioColLastActivityHint: string
  portfolioNoSection: string
  portfolioStatusActive: string
  portfolioStatusArchived: string
  portfolioAttentionBadge: string
  portfolioNoSprint: string
  /** {days} */
  portfolioDaysLeft: string
  portfolioDaysOverdue: string
  portfolioLastDay: string
  /** {done} {planned} = completed / committed points of the active sprint. */
  portfolioSprintPoints: string
  /** {count} open PBIs, {points} their points. */
  portfolioOpenPbis: string
  portfolioBurndownLabel: string
  portfolioVelocityNone: string
  portfolioVelocityUp: string
  portfolioVelocityDown: string
  portfolioVelocityFlat: string
  portfolioSeverityCritical: string
  portfolioSeverityWarning: string
  portfolioSeverityNone: string
  portfolioNoReport: string
  portfolioNoPlan: string
  /** {count} */
  portfolioPlanDelayed: string
  portfolioPlanAtRisk: string
  portfolioPlanOnTrack: string
  portfolioNoActivity: string
  portfolioEmpty: string
  portfolioEmptyFiltered: string
}

export const ja: PortfolioTranslations = {
  portfolioNav: "ポートフォリオ",
  portfolioTitle: "部門ポートフォリオ",
  portfolioDescription: "担当部門のプロジェクトの状況を一覧で確認できます。列見出しで並べ替えられます。",
  portfolioScopeAll: "すべてのプロジェクト（管理者）",
  portfolioScopeSections: "所属部門のプロジェクト",
  portfolioAsOf: "{date} 時点",
  portfolioCapped: "プロジェクトが多いため、先頭 {count} 件のみ表示しています",
  portfolioKpiProjects: "プロジェクト",
  portfolioKpiActiveSprints: "実行中のスプリント",
  portfolioKpiAttention: "要注意",
  portfolioKpiOverdue: "期限切れタスク",
  portfolioKpiDelayedPlan: "遅延している計画項目",
  portfolioKpiCritical: "監視アラート（重大）",
  portfolioFiltersLabel: "絞り込み",
  portfolioFilterSection: "部門",
  portfolioFilterStatus: "状態",
  portfolioFilterAll: "すべて",
  portfolioAttentionOnly: "要注意のみ",
  portfolioFilterClear: "条件をクリア",
  portfolioResultCount: "{total} 件中 {shown} 件を表示",
  portfolioTableCaption: "プロジェクト別の状況",
  portfolioColProject: "プロジェクト",
  portfolioColSection: "部門",
  portfolioColSprint: "実行中スプリント",
  portfolioColOverdue: "期限切れ",
  portfolioColBacklog: "未完了PBI",
  portfolioColVelocity: "ベロシティ",
  portfolioColSurveillance: "AI監視",
  portfolioColPlan: "計画進捗",
  portfolioColLastActivity: "最終更新",
  portfolioColProjectHint: "プロジェクト名（要注意・アーカイブの印付き）",
  portfolioColSectionHint: "担当部門",
  portfolioColSprintHint: "実行中のスプリント：残り日数、スプリント完了率（完了タスク ÷ 全タスク）、残タスクの推移、完了ポイント",
  portfolioColOverdueHint: "終了日を過ぎたスプリントの未完了タスク数",
  portfolioColBacklogHint: "未完了の PBI 数と合計ポイント",
  portfolioColVelocityHint: "直近 3 スプリントの完了ポイントと傾向",
  portfolioColSurveillanceHint: "最新の AI 監視レポートの重大度",
  portfolioColPlanHint: "計画進捗：全体計画の最上位項目を期間で加重した進捗（ダッシュボードと同じ値）と、遅延・要注意の項目数",
  portfolioColLastActivityHint: "最後の更新からの経過時間",
  portfolioNoSection: "部門なし",
  portfolioStatusActive: "進行中",
  portfolioStatusArchived: "アーカイブ",
  portfolioAttentionBadge: "要注意",
  portfolioNoSprint: "スプリントなし",
  portfolioDaysLeft: "残り {days} 日",
  portfolioDaysOverdue: "{days} 日超過",
  portfolioLastDay: "最終日",
  portfolioSprintPoints: "完了 {done} / {planned} pt",
  portfolioOpenPbis: "{count} 件・{points} pt",
  portfolioBurndownLabel: "残タスクの推移",
  portfolioVelocityNone: "実績なし",
  portfolioVelocityUp: "上昇",
  portfolioVelocityDown: "低下",
  portfolioVelocityFlat: "横ばい",
  portfolioSeverityCritical: "重大",
  portfolioSeverityWarning: "警告",
  portfolioSeverityNone: "問題なし",
  portfolioNoReport: "未実施",
  portfolioNoPlan: "計画なし",
  portfolioPlanDelayed: "遅延 {count}",
  portfolioPlanAtRisk: "要注意 {count}",
  portfolioPlanOnTrack: "順調",
  portfolioNoActivity: "記録なし",
  portfolioEmpty: "表示できるプロジェクトがありません。",
  portfolioEmptyFiltered: "条件に合うプロジェクトがありません。",
}

export const en: PortfolioTranslations = {
  portfolioNav: "Portfolio",
  portfolioTitle: "Department portfolio",
  portfolioDescription: "How the projects of your departments are doing, at a glance. Sort by any column header.",
  portfolioScopeAll: "All projects (admin)",
  portfolioScopeSections: "Projects of your departments",
  portfolioAsOf: "As of {date}",
  portfolioCapped: "Showing the first {count} projects only",
  portfolioKpiProjects: "Projects",
  portfolioKpiActiveSprints: "Active sprints",
  portfolioKpiAttention: "Need attention",
  portfolioKpiOverdue: "Overdue tasks",
  portfolioKpiDelayedPlan: "Delayed plan items",
  portfolioKpiCritical: "Critical AI alerts",
  portfolioFiltersLabel: "Filters",
  portfolioFilterSection: "Department",
  portfolioFilterStatus: "Status",
  portfolioFilterAll: "All",
  portfolioAttentionOnly: "Needs attention only",
  portfolioFilterClear: "Clear filters",
  portfolioResultCount: "Showing {shown} of {total}",
  portfolioTableCaption: "Status by project",
  portfolioColProject: "Project",
  portfolioColSection: "Dept.",
  portfolioColSprint: "Active sprint",
  portfolioColOverdue: "Overdue",
  portfolioColBacklog: "Open PBIs",
  portfolioColVelocity: "Velocity",
  portfolioColSurveillance: "AI watch",
  portfolioColPlan: "Plan progress",
  portfolioColLastActivity: "Updated",
  portfolioColProjectHint: "Project name (with attention / archived tags)",
  portfolioColSectionHint: "Department",
  portfolioColSprintHint: "Active sprint: days left, sprint completion (done tasks ÷ all tasks), remaining-task trend, completed points",
  portfolioColOverdueHint: "Unfinished tasks of sprints past their end date",
  portfolioColBacklogHint: "Open PBIs and their total points",
  portfolioColVelocityHint: "Completed points of the last 3 sprints and the trend",
  portfolioColSurveillanceHint: "Severity of the latest AI watch report",
  portfolioColPlanHint: "Plan progress: top-level master-plan items weighted by duration (same value as the dashboard), plus delayed / at-risk items",
  portfolioColLastActivityHint: "Time since the last activity",
  portfolioNoSection: "No department",
  portfolioStatusActive: "Active",
  portfolioStatusArchived: "Archived",
  portfolioAttentionBadge: "Attention",
  portfolioNoSprint: "No sprint",
  portfolioDaysLeft: "{days} days left",
  portfolioDaysOverdue: "{days} days over",
  portfolioLastDay: "Last day",
  portfolioSprintPoints: "Done {done} / {planned} pt",
  portfolioOpenPbis: "{count} · {points} pt",
  portfolioBurndownLabel: "Remaining tasks",
  portfolioVelocityNone: "No data",
  portfolioVelocityUp: "Rising",
  portfolioVelocityDown: "Falling",
  portfolioVelocityFlat: "Steady",
  portfolioSeverityCritical: "Critical",
  portfolioSeverityWarning: "Warning",
  portfolioSeverityNone: "OK",
  portfolioNoReport: "Not run",
  portfolioNoPlan: "No plan",
  portfolioPlanDelayed: "{count} delayed",
  portfolioPlanAtRisk: "{count} at risk",
  portfolioPlanOnTrack: "On track",
  portfolioNoActivity: "None",
  portfolioEmpty: "There are no projects to show.",
  portfolioEmptyFiltered: "No project matches the filters.",
}

export const id: PortfolioTranslations = {
  portfolioNav: "Portofolio",
  portfolioTitle: "Portofolio departemen",
  portfolioDescription: "Kondisi proyek di departemen Anda dalam satu tabel. Urutkan dengan mengeklik judul kolom.",
  portfolioScopeAll: "Semua proyek (admin)",
  portfolioScopeSections: "Proyek departemen Anda",
  portfolioAsOf: "Per {date}",
  portfolioCapped: "Hanya {count} proyek pertama yang ditampilkan",
  portfolioKpiProjects: "Proyek",
  portfolioKpiActiveSprints: "Sprint aktif",
  portfolioKpiAttention: "Perlu perhatian",
  portfolioKpiOverdue: "Tugas terlambat",
  portfolioKpiDelayedPlan: "Item rencana terlambat",
  portfolioKpiCritical: "Peringatan AI kritis",
  portfolioFiltersLabel: "Filter",
  portfolioFilterSection: "Departemen",
  portfolioFilterStatus: "Status",
  portfolioFilterAll: "Semua",
  portfolioAttentionOnly: "Hanya yang perlu perhatian",
  portfolioFilterClear: "Hapus filter",
  portfolioResultCount: "Menampilkan {shown} dari {total}",
  portfolioTableCaption: "Kondisi per proyek",
  portfolioColProject: "Proyek",
  portfolioColSection: "Dept.",
  portfolioColSprint: "Sprint aktif",
  portfolioColOverdue: "Terlambat",
  portfolioColBacklog: "PBI",
  portfolioColVelocity: "Velocity",
  portfolioColSurveillance: "Pantau AI",
  portfolioColPlan: "Rencana",
  portfolioColLastActivity: "Terakhir",
  portfolioColProjectHint: "Nama proyek (dengan tanda perlu perhatian / arsip)",
  portfolioColSectionHint: "Departemen",
  portfolioColSprintHint: "Sprint aktif: sisa hari, penyelesaian sprint (tugas selesai ÷ semua tugas), tren sisa tugas, poin selesai",
  portfolioColOverdueHint: "Tugas belum selesai pada sprint yang melewati tanggal akhir",
  portfolioColBacklogHint: "PBI terbuka dan total poinnya",
  portfolioColVelocityHint: "Poin selesai 3 sprint terakhir dan trennya",
  portfolioColSurveillanceHint: "Tingkat laporan pemantauan AI terbaru",
  portfolioColPlanHint: "Progres rencana: item teratas rencana induk dibobot durasi (nilai yang sama dengan dasbor), serta item terlambat / berisiko",
  portfolioColLastActivityHint: "Waktu sejak aktivitas terakhir",
  portfolioNoSection: "Tanpa departemen",
  portfolioStatusActive: "Aktif",
  portfolioStatusArchived: "Diarsipkan",
  portfolioAttentionBadge: "Perhatian",
  portfolioNoSprint: "Tidak ada sprint",
  portfolioDaysLeft: "Sisa {days} hari",
  portfolioDaysOverdue: "Lewat {days} hari",
  portfolioLastDay: "Hari terakhir",
  portfolioSprintPoints: "Selesai {done} / {planned} pt",
  portfolioOpenPbis: "{count} · {points} pt",
  portfolioBurndownLabel: "Sisa tugas",
  portfolioVelocityNone: "Belum ada data",
  portfolioVelocityUp: "Naik",
  portfolioVelocityDown: "Turun",
  portfolioVelocityFlat: "Stabil",
  portfolioSeverityCritical: "Kritis",
  portfolioSeverityWarning: "Peringatan",
  portfolioSeverityNone: "Aman",
  portfolioNoReport: "Belum ada",
  portfolioNoPlan: "Tidak ada rencana",
  portfolioPlanDelayed: "{count} terlambat",
  portfolioPlanAtRisk: "{count} berisiko",
  portfolioPlanOnTrack: "Sesuai jadwal",
  portfolioNoActivity: "Tidak ada",
  portfolioEmpty: "Tidak ada proyek untuk ditampilkan.",
  portfolioEmptyFiltered: "Tidak ada proyek yang cocok dengan filter.",
}
