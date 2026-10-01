/**
 * i18n domain: dependencies ("this must finish before that can start") —
 * PBI dependencies (backlog card chips, PBI detail section, picker, sprint
 * picker badge) and the master-plan chart's drag-to-link / arrow removal.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface DependenciesTranslations {
  // PBI detail section
  depSectionTitle: string
  depSectionHint: string
  depBlockedByTitle: string
  depBlockedByHint: string
  depBlockingTitle: string
  depBlockingHint: string
  depNone: string
  depAddBlockedBy: string
  depAddBlocking: string
  depRemove: string
  depStatusDone: string
  depStatusWaiting: string
  // Picker
  depPickBlockedByTitle: string
  depPickBlockedByDesc: string
  depPickBlockingTitle: string
  depPickBlockingDesc: string
  depPickSearch: string
  depPickNoMatches: string
  depPickBlockedCycle: string
  depPickBlockedExisting: string
  // Toasts
  depAdded: string
  depRemoved: string
  depAddFailed: string
  depRemoveFailed: string
  // Backlog card / sprint picker
  depChipWaitingOne: string
  depChipWaitingMany: string
  depChipWaitingTitle: string
  depChipReady: string
  depChipReadyTitle: string
  depChipBlocking: string
  depChipBlockingTitle: string
  depOrderWarning: string
  depMoveBelow: string
  depMovedBelow: string
  // Master plan chart
  depPlanConnector: string
  depPlanDragHint: string
  depPlanDropHere: string
  depPlanArrowTitle: string
  depPlanRemoveTitle: string
  depPlanRemoveMessage: string
  depPlanLegendHow: string
  depPlanChain: string
}

export const ja: DependenciesTranslations = {
  depSectionTitle: "依存関係（作業の順番）",
  depSectionHint: "「これが終わらないと始められない」PBI どうしをつなぎます。変更はすぐに保存されます。",
  depBlockedByTitle: "先に終わらせる PBI",
  depBlockedByHint: "これらが完了するまで、この PBI は着手できません",
  depBlockingTitle: "この PBI を待っている PBI",
  depBlockingHint: "この PBI が完了すると着手できるようになります",
  depNone: "なし",
  depAddBlockedBy: "先に終わらせる PBI を追加",
  depAddBlocking: "待っている PBI を追加",
  depRemove: "依存関係を外す: {name}",
  depStatusDone: "完了",
  depStatusWaiting: "未完了",
  depPickBlockedByTitle: "先に終わらせる PBI を選択",
  depPickBlockedByDesc: "「{name}」より先に完了している必要がある PBI を選んでください",
  depPickBlockingTitle: "後に行う PBI を選択",
  depPickBlockingDesc: "「{name}」が完了してから着手する PBI を選んでください",
  depPickSearch: "番号・タイトルで検索",
  depPickNoMatches: "該当する PBI はありません",
  depPickBlockedCycle: "お互いを待つ関係になるため選べません",
  depPickBlockedExisting: "設定済み",
  depAdded: "依存関係を追加しました",
  depRemoved: "依存関係を外しました",
  depAddFailed: "依存関係の追加に失敗しました",
  depRemoveFailed: "依存関係の削除に失敗しました",
  depChipWaitingOne: "#{id} の完了待ち",
  depChipWaitingMany: "#{id} ほか {n} 件の完了待ち",
  depChipWaitingTitle: "先に終わらせる PBI（未完了）: {list}",
  depChipReady: "先行 PBI 完了・着手可",
  depChipReadyTitle: "先に終わらせる PBI はすべて完了しています: {list}",
  depChipBlocking: "{n} 件がこの PBI を待っています",
  depChipBlockingTitle: "この PBI の完了を待っている PBI: {list}",
  depOrderWarning: "完了待ちの #{id} より上に並んでいます",
  depMoveBelow: "#{id} の下へ移動",
  depMovedBelow: "#{id} の下へ移動しました",
  depPlanConnector: "ドラッグして、後に行う項目につなぐ",
  depPlanDragHint: "つなぐ先のバーの上で離してください（Esc で取り消し）",
  depPlanDropHere: "後に行う項目:「{to}」",
  depPlanArrowTitle: "「{from}」→「{to}」（クリックで削除）",
  depPlanRemoveTitle: "依存関係を削除しますか？",
  depPlanRemoveMessage: "「{from}」が終わってから「{to}」を始める、というつながりを削除します。",
  depPlanLegendHow: "バー右端の ● を別のバーへドラッグすると依存関係（先に終わらせる → 後に始める）をつなげます。矢印をクリックすると削除できます。",
  depPlanChain: "選択中の項目の前後のつながりを強調",
}

export const en: DependenciesTranslations = {
  depSectionTitle: "Dependencies (work order)",
  depSectionHint: "Connect PBIs that cannot start until another one is finished. Changes are saved immediately.",
  depBlockedByTitle: "Finish first",
  depBlockedByHint: "This PBI cannot start until these are completed",
  depBlockingTitle: "Waiting for this PBI",
  depBlockingHint: "These can start once this PBI is completed",
  depNone: "None",
  depAddBlockedBy: "Add a PBI to finish first",
  depAddBlocking: "Add a waiting PBI",
  depRemove: "Remove dependency: {name}",
  depStatusDone: "Done",
  depStatusWaiting: "Not done",
  depPickBlockedByTitle: "Choose a PBI to finish first",
  depPickBlockedByDesc: "Choose the PBI that must be completed before \"{name}\"",
  depPickBlockingTitle: "Choose a PBI that follows",
  depPickBlockingDesc: "Choose the PBI that starts after \"{name}\" is completed",
  depPickSearch: "Search by number or title",
  depPickNoMatches: "No matching PBIs",
  depPickBlockedCycle: "Would wait on each other",
  depPickBlockedExisting: "Already set",
  depAdded: "Dependency added",
  depRemoved: "Dependency removed",
  depAddFailed: "Could not add the dependency",
  depRemoveFailed: "Could not remove the dependency",
  depChipWaitingOne: "Waiting for #{id}",
  depChipWaitingMany: "Waiting for #{id} and {n} more",
  depChipWaitingTitle: "Must finish first (not done): {list}",
  depChipReady: "Prerequisites done — ready to start",
  depChipReadyTitle: "Every PBI to finish first is completed: {list}",
  depChipBlocking: "{n} waiting for this",
  depChipBlockingTitle: "Waiting for this PBI: {list}",
  depOrderWarning: "Ranked above #{id}, which it is waiting for",
  depMoveBelow: "Move below #{id}",
  depMovedBelow: "Moved below #{id}",
  depPlanConnector: "Drag to connect to the item that follows",
  depPlanDragHint: "Release on the bar to connect (Esc to cancel)",
  depPlanDropHere: "Follows: \"{to}\"",
  depPlanArrowTitle: "\"{from}\" → \"{to}\" (click to remove)",
  depPlanRemoveTitle: "Remove this dependency?",
  depPlanRemoveMessage: "\"{to}\" will no longer wait for \"{from}\" to finish.",
  depPlanLegendHow: "Drag the ● at the end of a bar onto another bar to connect them (finish first → start after). Click an arrow to remove it.",
  depPlanChain: "Highlights the chain before and after the selected item",
}

export const id: DependenciesTranslations = {
  depSectionTitle: "Ketergantungan (urutan kerja)",
  depSectionHint: "Hubungkan PBI yang tidak dapat dimulai sebelum PBI lain selesai. Perubahan langsung disimpan.",
  depBlockedByTitle: "Diselesaikan lebih dulu",
  depBlockedByHint: "PBI ini tidak dapat dimulai sebelum PBI berikut selesai",
  depBlockingTitle: "Menunggu PBI ini",
  depBlockingHint: "PBI berikut dapat dimulai setelah PBI ini selesai",
  depNone: "Tidak ada",
  depAddBlockedBy: "Tambah PBI yang diselesaikan lebih dulu",
  depAddBlocking: "Tambah PBI yang menunggu",
  depRemove: "Hapus ketergantungan: {name}",
  depStatusDone: "Selesai",
  depStatusWaiting: "Belum selesai",
  depPickBlockedByTitle: "Pilih PBI yang diselesaikan lebih dulu",
  depPickBlockedByDesc: "Pilih PBI yang harus selesai sebelum \"{name}\"",
  depPickBlockingTitle: "Pilih PBI berikutnya",
  depPickBlockingDesc: "Pilih PBI yang dimulai setelah \"{name}\" selesai",
  depPickSearch: "Cari berdasarkan nomor atau judul",
  depPickNoMatches: "Tidak ada PBI yang cocok",
  depPickBlockedCycle: "Akan saling menunggu",
  depPickBlockedExisting: "Sudah diatur",
  depAdded: "Ketergantungan ditambahkan",
  depRemoved: "Ketergantungan dihapus",
  depAddFailed: "Gagal menambahkan ketergantungan",
  depRemoveFailed: "Gagal menghapus ketergantungan",
  depChipWaitingOne: "Menunggu #{id}",
  depChipWaitingMany: "Menunggu #{id} dan {n} lainnya",
  depChipWaitingTitle: "Harus selesai lebih dulu (belum selesai): {list}",
  depChipReady: "Prasyarat selesai — siap dimulai",
  depChipReadyTitle: "Semua PBI yang harus selesai lebih dulu sudah selesai: {list}",
  depChipBlocking: "{n} menunggu PBI ini",
  depChipBlockingTitle: "Menunggu PBI ini: {list}",
  depOrderWarning: "Berada di atas #{id}, yang sedang ditunggunya",
  depMoveBelow: "Pindahkan ke bawah #{id}",
  depMovedBelow: "Dipindahkan ke bawah #{id}",
  depPlanConnector: "Seret untuk menghubungkan ke item berikutnya",
  depPlanDragHint: "Lepaskan di atas bar tujuan (Esc untuk batal)",
  depPlanDropHere: "Berikutnya: \"{to}\"",
  depPlanArrowTitle: "\"{from}\" → \"{to}\" (klik untuk menghapus)",
  depPlanRemoveTitle: "Hapus ketergantungan ini?",
  depPlanRemoveMessage: "\"{to}\" tidak lagi menunggu \"{from}\" selesai.",
  depPlanLegendHow: "Seret ● di ujung bar ke bar lain untuk menghubungkannya (selesai dulu → mulai sesudahnya). Klik panah untuk menghapusnya.",
  depPlanChain: "Menyorot rantai sebelum dan sesudah item yang dipilih",
}
