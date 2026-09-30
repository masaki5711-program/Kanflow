/**
 * i18n domain: sprint kanban board (`projects/[id]/sprints` → components/board)
 * and the view / filter toolbar shared by the sprint board and list views.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {name} {column} {position} {total} {shown} {count}.
 */
export interface SprintBoardTranslations {
  /** Toolbar region label. */
  sprintBoardToolbar: string
  sprintBoardViewLabel: string
  sprintBoardViewList: string
  sprintBoardViewBoard: string
  sprintBoardSwimlane: string
  sprintBoardSwimlaneNone: string
  sprintBoardSwimlaneAssignee: string
  sprintBoardSwimlanePbi: string
  sprintBoardFilterAssignee: string
  sprintBoardFilterAll: string
  sprintBoardFilterMe: string
  sprintBoardFilterUnassigned: string
  sprintBoardFilterText: string
  sprintBoardFilterTextPlaceholder: string
  sprintBoardFilterClear: string
  /** {shown} of {total} tasks visible while a filter is active. */
  sprintBoardFilterCount: string
  sprintBoardNoMatch: string
  sprintDeepLinkTaskNotFound: string
  sprintDeepLinkSprintNotFound: string
  /** Board region label; {name} = sprint name. */
  sprintBoardLabel: string
  /** Column task count; {count}. */
  sprintBoardColumnCount: string
  sprintBoardEmptyColumn: string
  sprintBoardDropHere: string
  /** aria-roledescription of a card. */
  sprintBoardCardRole: string
  /** Card accessible name; {name} {column}. */
  sprintBoardCardLabel: string
  /** Keyboard instructions (aria-describedby of every card). */
  sprintBoardCardHint: string
  sprintBoardParentPbi: string
  /** Move-to menu button; {name}. */
  sprintBoardMoveTo: string
  sprintBoardMoveToShort: string
  // Live announcements
  sprintBoardPickedUp: string
  sprintBoardOverColumn: string
  sprintBoardDropped: string
  sprintBoardCancelled: string
  /** Phone-only toggle of a long sprint goal (A3-17). */
  sprintGoalShowAll: string
  sprintGoalShowLess: string
}

export const ja: SprintBoardTranslations = {
  sprintBoardToolbar: "表示と絞り込み",
  sprintBoardViewLabel: "表示",
  sprintBoardViewList: "リスト",
  sprintBoardViewBoard: "ボード",
  sprintBoardSwimlane: "スイムレーン",
  sprintBoardSwimlaneNone: "なし",
  sprintBoardSwimlaneAssignee: "担当者別",
  sprintBoardSwimlanePbi: "PBI別",
  sprintBoardFilterAssignee: "担当者",
  sprintBoardFilterAll: "全員",
  sprintBoardFilterMe: "自分",
  sprintBoardFilterUnassigned: "未割り当て",
  sprintBoardFilterText: "タスクを絞り込み",
  sprintBoardFilterTextPlaceholder: "タスク名・PBI・担当者",
  sprintBoardFilterClear: "絞り込みを解除",
  sprintBoardFilterCount: "{total} 件中 {shown} 件のタスクを表示",
  sprintBoardNoMatch: "条件に一致するタスクはありません",
  sprintDeepLinkTaskNotFound: "リンク先のタスクが見つかりません（削除された可能性があります）",
  sprintDeepLinkSprintNotFound: "リンク先のスプリントが見つかりません（削除された可能性があります）",
  sprintBoardLabel: "{name} のカンバンボード",
  sprintBoardColumnCount: "{count} 件",
  sprintBoardEmptyColumn: "タスクなし",
  sprintBoardDropHere: "ここに置く",
  sprintBoardCardRole: "移動できるタスクカード",
  sprintBoardCardLabel: "{name}（{column}）",
  sprintBoardCardHint: "Enter で編集。Space で持ち上げ、左右の矢印キーで列を選び、Space か Enter で置きます。Esc で取り消し。",
  sprintBoardParentPbi: "親PBI",
  sprintBoardMoveTo: "「{name}」の移動先",
  sprintBoardMoveToShort: "移動先",
  sprintBoardPickedUp: "「{name}」を持ち上げました。現在の位置: {column}。",
  sprintBoardOverColumn: "{column} の列（{position} / {total}）",
  sprintBoardDropped: "「{name}」を {column} に移動しました",
  sprintBoardCancelled: "「{name}」の移動を取り消しました",
  sprintGoalShowAll: "ゴールをすべて表示",
  sprintGoalShowLess: "ゴールを折りたたむ",
}

export const en: SprintBoardTranslations = {
  sprintBoardToolbar: "View and filters",
  sprintBoardViewLabel: "View",
  sprintBoardViewList: "List",
  sprintBoardViewBoard: "Board",
  sprintBoardSwimlane: "Swimlanes",
  sprintBoardSwimlaneNone: "None",
  sprintBoardSwimlaneAssignee: "By assignee",
  sprintBoardSwimlanePbi: "By PBI",
  sprintBoardFilterAssignee: "Assignee",
  sprintBoardFilterAll: "Everyone",
  sprintBoardFilterMe: "Me",
  sprintBoardFilterUnassigned: "Unassigned",
  sprintBoardFilterText: "Filter tasks",
  sprintBoardFilterTextPlaceholder: "Task, PBI or assignee",
  sprintBoardFilterClear: "Clear filters",
  sprintBoardFilterCount: "Showing {shown} of {total} tasks",
  sprintBoardNoMatch: "No tasks match the filters",
  sprintDeepLinkTaskNotFound: "The linked task was not found (it may have been deleted)",
  sprintDeepLinkSprintNotFound: "The linked sprint was not found (it may have been deleted)",
  sprintBoardLabel: "Kanban board of {name}",
  sprintBoardColumnCount: "{count} tasks",
  sprintBoardEmptyColumn: "No tasks",
  sprintBoardDropHere: "Drop here",
  sprintBoardCardRole: "movable task card",
  sprintBoardCardLabel: "{name} ({column})",
  sprintBoardCardHint: "Press Enter to edit. Press Space to pick up, Left and Right arrows to choose a column, Space or Enter to drop, Escape to cancel.",
  sprintBoardParentPbi: "Parent PBI",
  sprintBoardMoveTo: "Move “{name}” to…",
  sprintBoardMoveToShort: "Move to",
  sprintBoardPickedUp: "Picked up “{name}”. Now over the {column}.",
  sprintBoardOverColumn: "{column} column ({position} of {total})",
  sprintBoardDropped: "Moved “{name}” to {column}",
  sprintBoardCancelled: "Move of “{name}” cancelled",
  sprintGoalShowAll: "Show the whole goal",
  sprintGoalShowLess: "Show less of the goal",
}

export const id: SprintBoardTranslations = {
  sprintBoardToolbar: "Tampilan dan filter",
  sprintBoardViewLabel: "Tampilan",
  sprintBoardViewList: "Daftar",
  sprintBoardViewBoard: "Papan",
  sprintBoardSwimlane: "Jalur",
  sprintBoardSwimlaneNone: "Tidak ada",
  sprintBoardSwimlaneAssignee: "Per penanggung jawab",
  sprintBoardSwimlanePbi: "Per PBI",
  sprintBoardFilterAssignee: "Penanggung jawab",
  sprintBoardFilterAll: "Semua",
  sprintBoardFilterMe: "Saya",
  sprintBoardFilterUnassigned: "Belum ditugaskan",
  sprintBoardFilterText: "Saring tugas",
  sprintBoardFilterTextPlaceholder: "Tugas, PBI, atau penanggung jawab",
  sprintBoardFilterClear: "Hapus filter",
  sprintBoardFilterCount: "Menampilkan {shown} dari {total} tugas",
  sprintBoardNoMatch: "Tidak ada tugas yang cocok dengan filter",
  sprintDeepLinkTaskNotFound: "Tugas yang ditautkan tidak ditemukan (mungkin sudah dihapus)",
  sprintDeepLinkSprintNotFound: "Sprint yang ditautkan tidak ditemukan (mungkin sudah dihapus)",
  sprintBoardLabel: "Papan kanban {name}",
  sprintBoardColumnCount: "{count} tugas",
  sprintBoardEmptyColumn: "Tidak ada tugas",
  sprintBoardDropHere: "Letakkan di sini",
  sprintBoardCardRole: "kartu tugas yang dapat dipindahkan",
  sprintBoardCardLabel: "{name} ({column})",
  sprintBoardCardHint: "Tekan Enter untuk mengedit. Tekan Spasi untuk mengangkat, panah Kiri dan Kanan untuk memilih kolom, Spasi atau Enter untuk meletakkan, Escape untuk membatalkan.",
  sprintBoardParentPbi: "PBI induk",
  sprintBoardMoveTo: "Pindahkan “{name}” ke…",
  sprintBoardMoveToShort: "Pindahkan ke",
  sprintBoardPickedUp: "“{name}” diangkat. Posisi saat ini: {column}.",
  sprintBoardOverColumn: "Kolom {column} ({position} dari {total})",
  sprintBoardDropped: "“{name}” dipindahkan ke {column}",
  sprintBoardCancelled: "Pemindahan “{name}” dibatalkan",
  sprintGoalShowAll: "Tampilkan seluruh tujuan",
  sprintGoalShowLess: "Ringkas tujuan",
}
