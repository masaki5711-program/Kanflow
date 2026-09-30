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
  portfolioColStatus: string
  portfolioColSprint: string
  portfolioColOverdue: string
  portfolioColBacklog: string
  portfolioColVelocity: string
  portfolioColSurveillance: string
  portfolioColPlan: string
  portfolioColLastActivity: string
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
  portfolioColStatus: "状態",
  portfolioColSprint: "実行中のスプリント",
  portfolioColOverdue: "期限切れ",
  portfolioColBacklog: "未完了 PBI",
  portfolioColVelocity: "ベロシティ（直近 3）",
  portfolioColSurveillance: "AI 監視",
  portfolioColPlan: "全体計画",
  portfolioColLastActivity: "最終更新",
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
  portfolioColSection: "Department",
  portfolioColStatus: "Status",
  portfolioColSprint: "Active sprint",
  portfolioColOverdue: "Overdue",
  portfolioColBacklog: "Open PBIs",
  portfolioColVelocity: "Velocity (last 3)",
  portfolioColSurveillance: "AI watch",
  portfolioColPlan: "Master plan",
  portfolioColLastActivity: "Last activity",
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
  portfolioColSection: "Departemen",
  portfolioColStatus: "Status",
  portfolioColSprint: "Sprint aktif",
  portfolioColOverdue: "Terlambat",
  portfolioColBacklog: "PBI terbuka",
  portfolioColVelocity: "Velocity (3 terakhir)",
  portfolioColSurveillance: "Pemantauan AI",
  portfolioColPlan: "Rencana induk",
  portfolioColLastActivity: "Aktivitas terakhir",
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
  portfolioNoReport: "Belum dijalankan",
  portfolioNoPlan: "Tidak ada rencana",
  portfolioPlanDelayed: "{count} terlambat",
  portfolioPlanAtRisk: "{count} berisiko",
  portfolioPlanOnTrack: "Sesuai jadwal",
  portfolioNoActivity: "Tidak ada",
  portfolioEmpty: "Tidak ada proyek untuk ditampilkan.",
  portfolioEmptyFiltered: "Tidak ada proyek yang cocok dengan filter.",
}
