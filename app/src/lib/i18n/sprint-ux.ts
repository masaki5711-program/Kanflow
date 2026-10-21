/**
 * i18n domain: sprint tab usability pass — status stepper, "my tasks" chip,
 * grouping / density, row menus, inline edit, quick add, current / planning /
 * past tabs. Add a key to the interface AND to ja / en / id below.
 */
export interface SprintUxTranslations {
  sprintUxStepperLabel: string
  /** {n} */
  sprintUxDaysLeft: string
  sprintUxLastDay: string
  sprintUxPeriodOver: string
  /** {n} */
  sprintUxStartsIn: string
  /** {n} */
  sprintUxAttentionUnassigned: string
  /** {n} */
  sprintUxAttentionWaiting: string
  sprintUxAttentionOver: string
  /** {done} {total} {pct} */
  sprintUxProgressSummary: string
  /** {n} */
  sprintUxMyOpen: string
  sprintUxMyOpenNone: string
  sprintUxGroupBy: string
  sprintUxGroupPbi: string
  sprintUxGroupAssignee: string
  sprintUxDensity: string
  sprintUxDensityNormal: string
  sprintUxDensityCompact: string
  /** {name} */
  sprintUxMoreActions: string
  sprintUxEditDetails: string
  /** {pbi} */
  sprintUxQuickAddLabel: string
  sprintUxQuickAddPlaceholder: string
  /** {name} */
  sprintUxRenameTask: string
  /** {name} */
  sprintUxEditHours: string
  /** {name} */
  sprintUxChangeAssignee: string
  sprintUxNoHours: string
  sprintUxTabsLabel: string
  sprintUxTabCurrent: string
  sprintUxTabPlanning: string
  sprintUxTabPast: string
  sprintUxNoCurrent: string
  sprintUxNoPlanning: string
  sprintUxNoPast: string
  /** {done} {total} {pct} {score} */
  sprintUxPastSummary: string
  sprintUxDailyOpenHint: string
}

export const ja: SprintUxTranslations = {
  sprintUxStepperLabel: "スプリントの進行",
  sprintUxDaysLeft: "残り {n} 日",
  sprintUxLastDay: "最終日",
  sprintUxPeriodOver: "期間終了",
  sprintUxStartsIn: "開始まで {n} 日",
  sprintUxAttentionUnassigned: "担当者なし {n} 件",
  sprintUxAttentionWaiting: "依存待ち {n} PBI",
  sprintUxAttentionOver: "キャパシティ超過",
  sprintUxProgressSummary: "タスク {done}/{total}（{pct}%）",
  sprintUxMyOpen: "自分の未完了 {n} 件",
  sprintUxMyOpenNone: "自分の未完了はありません",
  sprintUxGroupBy: "まとめ方",
  sprintUxGroupPbi: "PBI 別",
  sprintUxGroupAssignee: "担当者別",
  sprintUxDensity: "表示密度",
  sprintUxDensityNormal: "標準",
  sprintUxDensityCompact: "コンパクト",
  sprintUxMoreActions: "{name} のその他の操作",
  sprintUxEditDetails: "詳細を編集",
  sprintUxQuickAddLabel: "{pbi} にタスクを追加",
  sprintUxQuickAddPlaceholder: "タスク名を入力して Enter で追加",
  sprintUxRenameTask: "タスク名を編集: {name}",
  sprintUxEditHours: "見積時間を編集: {name}",
  sprintUxChangeAssignee: "担当者を変更: {name}",
  sprintUxNoHours: "見積 -",
  sprintUxTabsLabel: "スプリントの種類",
  sprintUxTabCurrent: "現在",
  sprintUxTabPlanning: "計画中",
  sprintUxTabPast: "過去",
  sprintUxNoCurrent: "進行中のスプリントはありません",
  sprintUxNoPlanning: "計画中のスプリントはありません",
  sprintUxNoPast: "過去のスプリントはまだありません",
  sprintUxPastSummary: "タスク {done}/{total}（{pct}%）· 完了ポイント {score}",
  sprintUxDailyOpenHint: "サイドパネルで開きます",
}

export const en: SprintUxTranslations = {
  sprintUxStepperLabel: "Sprint progress",
  sprintUxDaysLeft: "{n} day(s) left",
  sprintUxLastDay: "Last day",
  sprintUxPeriodOver: "Period over",
  sprintUxStartsIn: "Starts in {n} day(s)",
  sprintUxAttentionUnassigned: "{n} unassigned",
  sprintUxAttentionWaiting: "{n} PBI(s) waiting",
  sprintUxAttentionOver: "Over capacity",
  sprintUxProgressSummary: "Tasks {done}/{total} ({pct}%)",
  sprintUxMyOpen: "My open tasks: {n}",
  sprintUxMyOpenNone: "You have no open tasks",
  sprintUxGroupBy: "Group by",
  sprintUxGroupPbi: "PBI",
  sprintUxGroupAssignee: "Assignee",
  sprintUxDensity: "Density",
  sprintUxDensityNormal: "Normal",
  sprintUxDensityCompact: "Compact",
  sprintUxMoreActions: "More actions for {name}",
  sprintUxEditDetails: "Edit details",
  sprintUxQuickAddLabel: "Add a task to {pbi}",
  sprintUxQuickAddPlaceholder: "Type a task name and press Enter",
  sprintUxRenameTask: "Rename task: {name}",
  sprintUxEditHours: "Edit estimate: {name}",
  sprintUxChangeAssignee: "Change assignee: {name}",
  sprintUxNoHours: "Est. -",
  sprintUxTabsLabel: "Sprint kind",
  sprintUxTabCurrent: "Current",
  sprintUxTabPlanning: "Planning",
  sprintUxTabPast: "Past",
  sprintUxNoCurrent: "No sprint is running",
  sprintUxNoPlanning: "No sprint is being planned",
  sprintUxNoPast: "No past sprints yet",
  sprintUxPastSummary: "Tasks {done}/{total} ({pct}%) · completed points {score}",
  sprintUxDailyOpenHint: "Opens in a side panel",
}

export const id: SprintUxTranslations = {
  sprintUxStepperLabel: "Kemajuan sprint",
  sprintUxDaysLeft: "Sisa {n} hari",
  sprintUxLastDay: "Hari terakhir",
  sprintUxPeriodOver: "Periode berakhir",
  sprintUxStartsIn: "Mulai dalam {n} hari",
  sprintUxAttentionUnassigned: "{n} belum ditugaskan",
  sprintUxAttentionWaiting: "{n} PBI menunggu",
  sprintUxAttentionOver: "Melebihi kapasitas",
  sprintUxProgressSummary: "Tugas {done}/{total} ({pct}%)",
  sprintUxMyOpen: "Tugas saya yang belum selesai: {n}",
  sprintUxMyOpenNone: "Tidak ada tugas Anda yang belum selesai",
  sprintUxGroupBy: "Kelompokkan",
  sprintUxGroupPbi: "PBI",
  sprintUxGroupAssignee: "Penanggung jawab",
  sprintUxDensity: "Kepadatan",
  sprintUxDensityNormal: "Normal",
  sprintUxDensityCompact: "Ringkas",
  sprintUxMoreActions: "Tindakan lain untuk {name}",
  sprintUxEditDetails: "Ubah detail",
  sprintUxQuickAddLabel: "Tambah tugas ke {pbi}",
  sprintUxQuickAddPlaceholder: "Ketik nama tugas lalu tekan Enter",
  sprintUxRenameTask: "Ubah nama tugas: {name}",
  sprintUxEditHours: "Ubah estimasi: {name}",
  sprintUxChangeAssignee: "Ganti penanggung jawab: {name}",
  sprintUxNoHours: "Est. -",
  sprintUxTabsLabel: "Jenis sprint",
  sprintUxTabCurrent: "Saat ini",
  sprintUxTabPlanning: "Perencanaan",
  sprintUxTabPast: "Lalu",
  sprintUxNoCurrent: "Tidak ada sprint yang berjalan",
  sprintUxNoPlanning: "Tidak ada sprint dalam perencanaan",
  sprintUxNoPast: "Belum ada sprint sebelumnya",
  sprintUxPastSummary: "Tugas {done}/{total} ({pct}%) · poin selesai {score}",
  sprintUxDailyOpenHint: "Dibuka di panel samping",
}
