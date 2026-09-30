/**
 * i18n domain: Gantt chart.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GanttTranslations {
  ganttTitle: string
  ganttToday: string
  ganttNoData: string
  ganttNoDataHint: string
  ganttGoToSprints: string
  ganttZoomLabel: string
  ganttZoomWeek: string
  ganttZoom2Weeks: string
  ganttZoomMonth: string
  /** Short weekday labels, Sunday first. */
  ganttWeekdays: string[]
  /** `{n}` = number of sprints */
  ganttSprintCount: string
  /** `{n}` = number of tasks */
  ganttTaskCount: string
  ganttCompletion: string
  ganttColumnHeader: string
  /** `{pct}` = percent */
  ganttPercentDone: string
  /** `{actual}` / `{estimated}` hours */
  ganttHours: string
  ganttAssignee: string
  ganttPeriod: string
  ganttEvents: string
  ganttTimelineLabel: string
  ganttLoadFailed: string
  ganttShowList: string
  ganttHideList: string
}

export const ja: GanttTranslations = {
  ganttTitle: "ガントチャート",
  ganttToday: "今日",
  ganttNoData: "表示するスプリント・タスクがありません",
  ganttNoDataHint: "スプリントを作成してタスクを追加すると、ここにタイムラインが表示されます。",
  ganttGoToSprints: "スプリントを作成する",
  ganttZoomLabel: "表示倍率",
  ganttZoomWeek: "週",
  ganttZoom2Weeks: "2週",
  ganttZoomMonth: "月",
  ganttWeekdays: ["日", "月", "火", "水", "木", "金", "土"],
  ganttSprintCount: "{n} スプリント",
  ganttTaskCount: "{n} タスク",
  ganttCompletion: "完了率",
  ganttColumnHeader: "タスク / スプリント",
  ganttPercentDone: "{pct}% 完了",
  ganttHours: "{actual}/{estimated}時間",
  ganttAssignee: "担当",
  ganttPeriod: "期間",
  ganttEvents: "イベント",
  ganttTimelineLabel: "タイムライン",
  ganttLoadFailed: "ガントチャートのデータを読み込めませんでした",
  ganttShowList: "タスク一覧を表示",
  ganttHideList: "タスク一覧を隠す",
}

export const en: GanttTranslations = {
  ganttTitle: "Gantt Chart",
  ganttToday: "Today",
  ganttNoData: "No sprints or tasks to display",
  ganttNoDataHint: "Create a sprint and add tasks to see them on the timeline.",
  ganttGoToSprints: "Create a sprint",
  ganttZoomLabel: "Zoom",
  ganttZoomWeek: "Week",
  ganttZoom2Weeks: "2 Weeks",
  ganttZoomMonth: "Month",
  ganttWeekdays: ["S", "M", "T", "W", "T", "F", "S"],
  ganttSprintCount: "{n} sprints",
  ganttTaskCount: "{n} tasks",
  ganttCompletion: "Completion",
  ganttColumnHeader: "Task / Sprint",
  ganttPercentDone: "{pct}% done",
  ganttHours: "{actual}/{estimated}h",
  ganttAssignee: "Assignee",
  ganttPeriod: "Period",
  ganttEvents: "Events",
  ganttTimelineLabel: "Timeline",
  ganttLoadFailed: "Could not load the Gantt chart data",
  ganttShowList: "Show task list",
  ganttHideList: "Hide task list",
}

export const id: GanttTranslations = {
  ganttTitle: "Diagram Gantt",
  ganttToday: "Hari Ini",
  ganttNoData: "Tidak ada sprint atau tugas untuk ditampilkan",
  ganttNoDataHint: "Buat sprint dan tambahkan tugas untuk melihatnya di linimasa.",
  ganttGoToSprints: "Buat sprint",
  ganttZoomLabel: "Skala tampilan",
  ganttZoomWeek: "Minggu",
  ganttZoom2Weeks: "2 Minggu",
  ganttZoomMonth: "Bulan",
  ganttWeekdays: ["M", "S", "S", "R", "K", "J", "S"],
  ganttSprintCount: "{n} sprint",
  ganttTaskCount: "{n} tugas",
  ganttCompletion: "Tingkat penyelesaian",
  ganttColumnHeader: "Tugas / Sprint",
  ganttPercentDone: "{pct}% selesai",
  ganttHours: "{actual}/{estimated} jam",
  ganttAssignee: "Penanggung jawab",
  ganttPeriod: "Periode",
  ganttEvents: "Acara",
  ganttTimelineLabel: "Linimasa",
  ganttLoadFailed: "Gagal memuat data diagram Gantt",
  ganttShowList: "Tampilkan daftar tugas",
  ganttHideList: "Sembunyikan daftar tugas",
}
