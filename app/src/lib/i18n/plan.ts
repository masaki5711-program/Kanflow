/**
 * i18n domain: Master plan (全体計画) page.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface PlanTranslations {
  // Master Plan (全体計画)
  planTitle: string
  planDesc: string
  planAddItem: string
  planAddChild: string
  planAddMilestone: string
  planEmpty: string
  planNamePlaceholder: string
  planPlannedStart: string
  planPlannedEnd: string
  planActualStart: string
  planActualEnd: string
  planStatus: string
  planStatusNotStarted: string
  planStatusInProgress: string
  planStatusDone: string
  planStatusOnHold: string
  planStatusDelayed: string
  planIsMilestone: string
  planNotes: string
  planZoomDay: string
  planZoomWeek: string
  planZoomMonth: string
  planTodayJump: string
  planProgressLegend: string
  planDelayLegend: string
  planSavedJustNow: string
  planConfirmDelete: string
  planIndent: string
  planOutdent: string
  planMoveUp: string
  planMoveDown: string
  planActualRange: string
  planParent: string
  planRootOption: string
  planExpand: string
  planCollapse: string
  planToday: string
  planZoomLabel: string
  planEditTitle: string
  planDeleted: string
  /** Accessible name of a timeline bar. {name} {start} {end} {pct} {status} */
  planBarLabel: string
  /** Accessible name of a milestone marker. {name} {date} */
  planMilestoneLabel: string
  /** Keyboard help for timeline bars (screen-reader description). */
  planBarKeyboardHint: string
}

export const ja: PlanTranslations = {
  planTitle: "全体計画",
  planDesc: "スプリント・PBI とは独立した長期計画。ステータスから進捗が自動集計されます。",
  planAddItem: "項目を追加",
  planAddChild: "子項目を追加",
  planAddMilestone: "マイルストーン追加",
  planEmpty: "まだ計画項目がありません",
  planNamePlaceholder: "項目名 (例: 設計フェーズ)",
  planPlannedStart: "計画開始",
  planPlannedEnd: "計画終了",
  planActualStart: "実績開始",
  planActualEnd: "実績終了",
  planStatus: "ステータス",
  planStatusNotStarted: "未着手",
  planStatusInProgress: "進行中",
  planStatusDone: "完了",
  planStatusOnHold: "保留",
  planStatusDelayed: "遅延",
  planIsMilestone: "マイルストーン",
  planNotes: "メモ",
  planZoomDay: "日",
  planZoomWeek: "週",
  planZoomMonth: "月",
  planTodayJump: "今日へ",
  planProgressLegend: "進捗",
  planDelayLegend: "遅延",
  planSavedJustNow: "保存しました",
  planConfirmDelete: "この項目(と子)を削除しますか?",
  planIndent: "子に降格",
  planOutdent: "親へ昇格",
  planMoveUp: "上へ移動",
  planMoveDown: "下へ移動",
  planActualRange: "実績: {range}",
  planParent: "親項目",
  planRootOption: "— (最上位)",
  planExpand: "展開する",
  planCollapse: "折りたたむ",
  planToday: "今日",
  planZoomLabel: "表示単位",
  planEditTitle: "計画項目を編集",
  planDeleted: "削除しました",
  planBarLabel: "{name}: {start} 〜 {end}、進捗 {pct}%、{status}",
  planMilestoneLabel: "マイルストーン {name}: {date}",
  planBarKeyboardHint: "Enter で編集。左右矢印キーで 1 日移動、Shift + 左右矢印キーで終了日を 1 日伸縮。上下矢印キーで前後の項目へ移動。",
}

export const en: PlanTranslations = {
  planTitle: "Master Plan",
  planDesc: "Long-term plan independent of sprints and PBIs. Progress is auto-aggregated from item status.",
  planAddItem: "Add item",
  planAddChild: "Add child",
  planAddMilestone: "Add milestone",
  planEmpty: "No plan items yet",
  planNamePlaceholder: "Item name (e.g. Design phase)",
  planPlannedStart: "Planned start",
  planPlannedEnd: "Planned end",
  planActualStart: "Actual start",
  planActualEnd: "Actual end",
  planStatus: "Status",
  planStatusNotStarted: "Not started",
  planStatusInProgress: "In progress",
  planStatusDone: "Done",
  planStatusOnHold: "On hold",
  planStatusDelayed: "Delayed",
  planIsMilestone: "Milestone",
  planNotes: "Notes",
  planZoomDay: "Day",
  planZoomWeek: "Week",
  planZoomMonth: "Month",
  planTodayJump: "Today",
  planProgressLegend: "Progress",
  planDelayLegend: "Delayed",
  planSavedJustNow: "Saved",
  planConfirmDelete: "Delete this item (and its children)?",
  planIndent: "Demote",
  planOutdent: "Promote",
  planMoveUp: "Move up",
  planMoveDown: "Move down",
  planActualRange: "Actual: {range}",
  planParent: "Parent item",
  planRootOption: "— (top level)",
  planExpand: "Expand",
  planCollapse: "Collapse",
  planToday: "Today",
  planZoomLabel: "Zoom level",
  planEditTitle: "Edit plan item",
  planDeleted: "Deleted",
  planBarLabel: "{name}: {start} to {end}, {pct}% complete, {status}",
  planMilestoneLabel: "Milestone {name}: {date}",
  planBarKeyboardHint: "Press Enter to edit. Left/Right arrow moves by one day; Shift + Left/Right arrow changes the end date by one day. Up/Down arrow moves to the previous/next item.",
}

export const id: PlanTranslations = {
  planTitle: "Rencana Induk",
  planDesc: "Rencana jangka panjang independen dari sprint dan PBI. Progres otomatis dihitung dari status item.",
  planAddItem: "Tambah item",
  planAddChild: "Tambah anak",
  planAddMilestone: "Tambah tonggak",
  planEmpty: "Belum ada item rencana",
  planNamePlaceholder: "Nama item (mis. Fase desain)",
  planPlannedStart: "Mulai rencana",
  planPlannedEnd: "Akhir rencana",
  planActualStart: "Mulai aktual",
  planActualEnd: "Akhir aktual",
  planStatus: "Status",
  planStatusNotStarted: "Belum mulai",
  planStatusInProgress: "Sedang berjalan",
  planStatusDone: "Selesai",
  planStatusOnHold: "Ditunda",
  planStatusDelayed: "Terlambat",
  planIsMilestone: "Tonggak",
  planNotes: "Catatan",
  planZoomDay: "Hari",
  planZoomWeek: "Minggu",
  planZoomMonth: "Bulan",
  planTodayJump: "Hari ini",
  planProgressLegend: "Progres",
  planDelayLegend: "Terlambat",
  planSavedJustNow: "Tersimpan",
  planConfirmDelete: "Hapus item ini (dan anaknya)?",
  planIndent: "Turunkan",
  planOutdent: "Naikkan",
  planMoveUp: "Pindah ke atas",
  planMoveDown: "Pindah ke bawah",
  planActualRange: "Aktual: {range}",
  planParent: "Item induk",
  planRootOption: "— (tingkat teratas)",
  planExpand: "Bentangkan",
  planCollapse: "Ciutkan",
  planToday: "Hari ini",
  planZoomLabel: "Skala tampilan",
  planEditTitle: "Edit item rencana",
  planDeleted: "Dihapus",
  planBarLabel: "{name}: {start} s.d. {end}, progres {pct}%, {status}",
  planMilestoneLabel: "Milestone {name}: {date}",
  planBarKeyboardHint: "Tekan Enter untuk mengedit. Panah kiri/kanan menggeser satu hari; Shift + panah kiri/kanan mengubah tanggal selesai satu hari. Panah atas/bawah pindah ke item sebelumnya/berikutnya.",
}
