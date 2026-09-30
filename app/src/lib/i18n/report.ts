/**
 * i18n domain: Report page and AI report documents.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ReportTranslations {
  aiReportsTitle: string
  aiReportLatest: string
  /** Notice on a report written in another language than the UI ({language} = its name). */
  aiReportWrittenIn: string
  aiReportOlderShow: string
  aiReportOlderHide: string
  aiReportsEmpty: string
  aiReportTriggerSurveillance: string
  aiReportTriggerSprintCompleted: string
  aiReportTriggerProgress: string
  aiReportDocTitle: string
  aiReportFieldDate: string
  aiReportFieldTrigger: string
  aiReportFieldSeverity: string
  aiReportFieldAuthor: string
  aiReportAuthorName: string
  aiReportSectionOverview: string
  aiReportSectionFollowUps: string
  aiReportFollowUpResolved: string
  aiReportFollowUpImproved: string
  aiReportFollowUpUnresolved: string
  aiReportSectionFindings: string
  aiReportSectionMetrics: string
  aiReportSectionCauses: string
  aiReportSectionActions: string
  aiReportSectionOutlook: string
  aiReportMetricLabel: string
  aiReportMetricValue: string
  aiReportSeverityInfo: string
  aiReportSeverityWarning: string
  aiReportSeverityCritical: string
  aiReportPriorityHigh: string
  aiReportPriorityMedium: string
  aiReportPriorityLow: string
  aiReportFooterNote: string
  // Report
  reportTitle: string
  reportGeneratedAt: string
  reportPrint: string
  reportProjectOverview: string
  reportMembers: string
  reportSprintResults: string
  reportActiveSprintDetail: string
  reportBacklogStatus: string
  reportIceboxStatus: string
  reportUpcomingEvents: string
  reportTotalWorkload: string
  reportReadyItems: string
  reportNotReadyItems: string
  reportCompletedItems: string
  reportNoEvents: string
  reportItems: string
  // Report categorization
  reportSectionNow: string
  reportSectionUpcoming: string
  reportSectionHistory: string
  reportNoCurrentSprint: string
  reportDaysRemaining: string
  reportDaysOverdue: string
  reportShowDetails: string
  reportTaskProgress: string
  reportLegacy: string
  reportSprintCount: string
  aiReportCopied: string
  aiReportCopyFailed: string
  aiReportGenerationDone: string
  aiReportLoadFailed: string
}

export const ja: ReportTranslations = {
  aiReportsTitle: "AIからの報告",
  aiReportLatest: "最新",
  aiReportWrittenIn: "このレポートは{language}で作成されています。「進捗レポート生成」で表示言語のレポートを作成できます。",
  aiReportOlderShow: "過去のレポートを表示（{count}件）",
  aiReportOlderHide: "過去のレポートを隠す",
  aiReportsEmpty: "まだ報告はありません。AIが異常検知やスプリント完了時に自動で調査レポートを作成します。",
  aiReportTriggerSurveillance: "定期監視",
  aiReportTriggerSprintCompleted: "スプリント完了",
  aiReportTriggerProgress: "進捗報告",
  aiReportDocTitle: "AI調査報告書",
  aiReportFieldDate: "報告日時",
  aiReportFieldTrigger: "報告区分",
  aiReportFieldSeverity: "総合判定",
  aiReportFieldAuthor: "報告者",
  aiReportAuthorName: "Kanflow AI エージェント",
  aiReportSectionOverview: "概要",
  aiReportSectionFollowUps: "前回指摘の対応状況",
  aiReportFollowUpResolved: "解消済み",
  aiReportFollowUpImproved: "改善中",
  aiReportFollowUpUnresolved: "未対応",
  aiReportSectionFindings: "検知事項",
  aiReportSectionMetrics: "主要指標",
  aiReportSectionCauses: "原因分析",
  aiReportSectionActions: "推奨アクション",
  aiReportSectionOutlook: "今後の見通し",
  aiReportMetricLabel: "項目",
  aiReportMetricValue: "値",
  aiReportSeverityInfo: "情報",
  aiReportSeverityWarning: "注意",
  aiReportSeverityCritical: "重大",
  aiReportPriorityHigh: "優先度: 高",
  aiReportPriorityMedium: "優先度: 中",
  aiReportPriorityLow: "優先度: 低",
  aiReportFooterNote: "本報告書は Kanflow AI エージェントが自動生成しました。数値はプロジェクトデータの集計結果に基づきます。",
  reportTitle: "プロジェクトレポート",
  reportGeneratedAt: "出力日",
  reportPrint: "印刷 / PDF保存",
  reportProjectOverview: "プロジェクト概要",
  reportMembers: "メンバー",
  reportSprintResults: "スプリント実績",
  reportActiveSprintDetail: "実行中スプリント詳細",
  reportBacklogStatus: "プロダクトバックログ状況",
  reportIceboxStatus: "IceBox状況",
  reportUpcomingEvents: "直近のイベント",
  reportTotalWorkload: "合計工数",
  reportReadyItems: "着手可能",
  reportNotReadyItems: "未準備",
  reportCompletedItems: "完了",
  reportNoEvents: "直近のイベントはありません",
  reportItems: "件",
  reportSectionNow: "現在のスプリント",
  reportSectionUpcoming: "今後のスプリント",
  reportSectionHistory: "過去のスプリント",
  reportNoCurrentSprint: "現在進行中のスプリントはありません",
  reportDaysRemaining: "残り",
  reportDaysOverdue: "超過",
  reportShowDetails: "詳細を表示",
  reportTaskProgress: "タスク進捗",
  reportLegacy: "（旧形式）",
  reportSprintCount: "{n} スプリント",
  aiReportCopied: "コピーしました",
  aiReportCopyFailed: "コピーに失敗しました",
  aiReportGenerationDone: "レポートの生成が完了しました",
  aiReportLoadFailed: "AIからの報告の取得に失敗しました",
}

export const en: ReportTranslations = {
  aiReportsTitle: "AI Reports",
  aiReportLatest: "Latest",
  aiReportWrittenIn: "This report was written in {language}. Use “Progress Report” to create one in your language.",
  aiReportOlderShow: "Show older reports ({count})",
  aiReportOlderHide: "Hide older reports",
  aiReportsEmpty: "No reports yet. The AI automatically investigates anomalies and completed sprints.",
  aiReportTriggerSurveillance: "Surveillance",
  aiReportTriggerSprintCompleted: "Sprint completed",
  aiReportTriggerProgress: "Progress report",
  aiReportDocTitle: "AI Investigation Report",
  aiReportFieldDate: "Reported at",
  aiReportFieldTrigger: "Category",
  aiReportFieldSeverity: "Overall assessment",
  aiReportFieldAuthor: "Author",
  aiReportAuthorName: "Kanflow AI Agent",
  aiReportSectionOverview: "Overview",
  aiReportSectionFollowUps: "Follow-up on previous findings",
  aiReportFollowUpResolved: "Resolved",
  aiReportFollowUpImproved: "Improved",
  aiReportFollowUpUnresolved: "Unresolved",
  aiReportSectionFindings: "Findings",
  aiReportSectionMetrics: "Key metrics",
  aiReportSectionCauses: "Cause analysis",
  aiReportSectionActions: "Recommended actions",
  aiReportSectionOutlook: "Outlook",
  aiReportMetricLabel: "Item",
  aiReportMetricValue: "Value",
  aiReportSeverityInfo: "Info",
  aiReportSeverityWarning: "Warning",
  aiReportSeverityCritical: "Critical",
  aiReportPriorityHigh: "Priority: High",
  aiReportPriorityMedium: "Priority: Medium",
  aiReportPriorityLow: "Priority: Low",
  aiReportFooterNote: "This report was generated automatically by the Kanflow AI Agent. Numbers are based on aggregated project data.",
  reportTitle: "Project Report",
  reportGeneratedAt: "Generated",
  reportPrint: "Print / Save PDF",
  reportProjectOverview: "Project Overview",
  reportMembers: "Members",
  reportSprintResults: "Sprint Results",
  reportActiveSprintDetail: "Active Sprint Detail",
  reportBacklogStatus: "Product Backlog Status",
  reportIceboxStatus: "IceBox Status",
  reportUpcomingEvents: "Upcoming Events",
  reportTotalWorkload: "Total Workload",
  reportReadyItems: "Ready",
  reportNotReadyItems: "Not Ready",
  reportCompletedItems: "Completed",
  reportNoEvents: "No upcoming events",
  reportItems: "items",
  reportSectionNow: "Current Sprint",
  reportSectionUpcoming: "Upcoming Sprints",
  reportSectionHistory: "Past Sprints",
  reportNoCurrentSprint: "No sprint is currently in progress",
  reportDaysRemaining: "days left",
  reportDaysOverdue: "days overdue",
  reportShowDetails: "Show details",
  reportTaskProgress: "Task progress",
  reportLegacy: "(legacy)",
  reportSprintCount: "{n} sprints",
  aiReportCopied: "Copied to clipboard",
  aiReportCopyFailed: "Copy failed",
  aiReportGenerationDone: "Report generation finished",
  aiReportLoadFailed: "Failed to load AI reports",
}

export const id: ReportTranslations = {
  aiReportsTitle: "Laporan dari AI",
  aiReportLatest: "Terbaru",
  aiReportWrittenIn: "Laporan ini ditulis dalam {language}. Gunakan “Laporan Progres” untuk membuatnya dalam bahasa Anda.",
  aiReportOlderShow: "Tampilkan laporan lama ({count})",
  aiReportOlderHide: "Sembunyikan laporan lama",
  aiReportsEmpty: "Belum ada laporan. AI otomatis menyelidiki anomali dan sprint yang selesai.",
  aiReportTriggerSurveillance: "Pemantauan rutin",
  aiReportTriggerSprintCompleted: "Sprint selesai",
  aiReportTriggerProgress: "Laporan progres",
  aiReportDocTitle: "Laporan Investigasi AI",
  aiReportFieldDate: "Tanggal laporan",
  aiReportFieldTrigger: "Kategori",
  aiReportFieldSeverity: "Penilaian keseluruhan",
  aiReportFieldAuthor: "Pelapor",
  aiReportAuthorName: "Agen AI Kanflow",
  aiReportSectionOverview: "Ringkasan",
  aiReportSectionFollowUps: "Tindak lanjut temuan sebelumnya",
  aiReportFollowUpResolved: "Terselesaikan",
  aiReportFollowUpImproved: "Membaik",
  aiReportFollowUpUnresolved: "Belum ditangani",
  aiReportSectionFindings: "Temuan",
  aiReportSectionMetrics: "Metrik utama",
  aiReportSectionCauses: "Analisis penyebab",
  aiReportSectionActions: "Tindakan yang disarankan",
  aiReportSectionOutlook: "Prospek",
  aiReportMetricLabel: "Item",
  aiReportMetricValue: "Nilai",
  aiReportSeverityInfo: "Info",
  aiReportSeverityWarning: "Peringatan",
  aiReportSeverityCritical: "Kritis",
  aiReportPriorityHigh: "Prioritas: Tinggi",
  aiReportPriorityMedium: "Prioritas: Sedang",
  aiReportPriorityLow: "Prioritas: Rendah",
  aiReportFooterNote: "Laporan ini dibuat otomatis oleh Agen AI Kanflow. Angka didasarkan pada agregasi data proyek.",
  reportTitle: "Laporan Proyek",
  reportGeneratedAt: "Dibuat",
  reportPrint: "Cetak / Simpan PDF",
  reportProjectOverview: "Ringkasan Proyek",
  reportMembers: "Anggota",
  reportSprintResults: "Hasil Sprint",
  reportActiveSprintDetail: "Detail Sprint Aktif",
  reportBacklogStatus: "Status Backlog Produk",
  reportIceboxStatus: "Status IceBox",
  reportUpcomingEvents: "Acara Mendatang",
  reportTotalWorkload: "Total Beban Kerja",
  reportReadyItems: "Siap",
  reportNotReadyItems: "Belum Siap",
  reportCompletedItems: "Selesai",
  reportNoEvents: "Tidak ada acara mendatang",
  reportItems: "item",
  reportSectionNow: "Sprint Saat Ini",
  reportSectionUpcoming: "Sprint Mendatang",
  reportSectionHistory: "Sprint Lampau",
  reportNoCurrentSprint: "Tidak ada sprint yang sedang berjalan",
  reportDaysRemaining: "hari tersisa",
  reportDaysOverdue: "hari lewat batas",
  reportShowDetails: "Tampilkan detail",
  reportTaskProgress: "Progres tugas",
  reportLegacy: "(format lama)",
  reportSprintCount: "{n} sprint",
  aiReportCopied: "Disalin ke papan klip",
  aiReportCopyFailed: "Gagal menyalin",
  aiReportGenerationDone: "Pembuatan laporan selesai",
  aiReportLoadFailed: "Gagal memuat laporan dari AI",
}
