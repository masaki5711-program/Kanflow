/**
 * i18n domain: Product backlog — daily operations (P1): PBI modal links,
 * URL filters, drag & drop reordering, bulk actions, undo, done-list paging.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface BacklogOpsTranslations {
  // PBI modal
  backlogCopyLink: string
  backlogLinkCopied: string
  backlogLinkCopyFailed: string
  backlogPbiNotFound: string
  backlogWorkloadQuickPick: string
  // Filters (URL state)
  backlogFiltersLabel: string
  backlogFilterStatus: string
  backlogFilterGoal: string
  backlogFilterAll: string
  backlogFilterNone: string
  backlogFilterClear: string
  backlogFilterResult: string
  // Drag & drop reordering
  backlogDragHandle: string
  backlogDragHelp: string
  backlogDragPicked: string
  backlogDragMoved: string
  backlogDragCancelled: string
  backlogMoveToTop: string
  backlogMoveToBottom: string
  backlogMoreActions: string
  // Selection & bulk actions
  backlogSelectMode: string
  backlogSelectModeExit: string
  backlogSelectItem: string
  backlogSelectAllVisible: string
  backlogSelectedCount: string
  backlogClearSelection: string
  backlogSelectHint: string
  backlogBulkActionsLabel: string
  backlogBulkStatus: string
  backlogBulkAddToSprint: string
  backlogBulkAssignPo: string
  backlogBulkChooseSprint: string
  backlogBulkNoSprint: string
  backlogBulkUnassigned: string
  backlogBulkDone: string
  backlogBulkSkipped: string
  backlogBulkFailed: string
  backlogBulkTrashConfirm: string
  // Undo
  backlogTrashedToast: string
  backlogUndo: string
  backlogRestored: string
  backlogRestoreFailed: string
  // Done items
  backlogShowMoreDone: string
  backlogDoneShowing: string
}

export const ja: BacklogOpsTranslations = {
  backlogCopyLink: "リンクをコピー",
  backlogLinkCopied: "リンクをコピーしました",
  backlogLinkCopyFailed: "リンクをコピーできませんでした",
  backlogPbiNotFound: "PBI {ref} が見つかりません（ゴミ箱に移動された可能性があります）",
  backlogWorkloadQuickPick: "ポイントを選ぶ",
  backlogFiltersLabel: "絞り込み",
  backlogFilterStatus: "状態",
  backlogFilterGoal: "プロダクトゴール",
  backlogFilterAll: "すべて",
  backlogFilterNone: "未設定",
  backlogFilterClear: "絞り込みを解除",
  backlogFilterResult: "{shown} / {total} 件を表示中",
  backlogDragHandle: "#{id} を並べ替え",
  backlogDragHelp: "Space で持ち上げ、↑↓ で移動、Space で確定、Esc で取り消し",
  backlogDragPicked: "#{id} を持ち上げました。現在 {pos} / {total} 番目。↑↓ で移動、Space で確定、Esc で取り消し。",
  backlogDragMoved: "#{id}: {pos} / {total} 番目",
  backlogDragCancelled: "並べ替えを取り消しました。#{id} は {pos} 番目のままです",
  backlogMoveToTop: "先頭へ",
  backlogMoveToBottom: "末尾へ",
  backlogMoreActions: "#{id} のその他の操作",
  backlogSelectMode: "選択",
  backlogSelectModeExit: "選択を終了",
  backlogSelectItem: "#{id} を選択",
  backlogSelectAllVisible: "表示中をすべて選択",
  backlogSelectedCount: "{count} 件選択中",
  backlogClearSelection: "選択を解除",
  backlogSelectHint: "Shift+クリックで範囲選択できます",
  backlogBulkActionsLabel: "一括操作",
  backlogBulkStatus: "状態を変更",
  backlogBulkAddToSprint: "スプリントに追加",
  backlogBulkAssignPo: "{po} を割り当て",
  backlogBulkChooseSprint: "スプリントを選択",
  backlogBulkNoSprint: "計画中・進行中のスプリントがありません",
  backlogBulkUnassigned: "（割り当てなし）",
  backlogBulkDone: "{count} 件を更新しました",
  backlogBulkSkipped: "{count} 件は変更されませんでした",
  backlogBulkFailed: "一括操作に失敗しました",
  backlogBulkTrashConfirm: "選択した {count} 件をゴミ箱に移動しますか？すぐに元に戻せます。",
  backlogTrashedToast: "{count} 件をゴミ箱に移動しました",
  backlogUndo: "元に戻す",
  backlogRestored: "{count} 件を元に戻しました",
  backlogRestoreFailed: "元に戻せませんでした。ゴミ箱から復元してください。",
  backlogShowMoreDone: "もっと見る（残り {count} 件）",
  backlogDoneShowing: "新しい順に {shown} / {total} 件を表示",
}

export const en: BacklogOpsTranslations = {
  backlogCopyLink: "Copy link",
  backlogLinkCopied: "Link copied",
  backlogLinkCopyFailed: "Could not copy the link",
  backlogPbiNotFound: "PBI {ref} was not found (it may have been moved to the trash)",
  backlogWorkloadQuickPick: "Pick points",
  backlogFiltersLabel: "Filters",
  backlogFilterStatus: "Status",
  backlogFilterGoal: "Product goal",
  backlogFilterAll: "All",
  backlogFilterNone: "Not set",
  backlogFilterClear: "Clear filters",
  backlogFilterResult: "Showing {shown} of {total}",
  backlogDragHandle: "Reorder #{id}",
  backlogDragHelp: "Space to pick up, ↑↓ to move, Space to drop, Esc to cancel",
  backlogDragPicked: "Picked up #{id}. Position {pos} of {total}. Use ↑↓ to move, Space to drop, Esc to cancel.",
  backlogDragMoved: "#{id}: position {pos} of {total}",
  backlogDragCancelled: "Reorder cancelled. #{id} stays at position {pos}",
  backlogMoveToTop: "Move to top",
  backlogMoveToBottom: "Move to bottom",
  backlogMoreActions: "More actions for #{id}",
  backlogSelectMode: "Select",
  backlogSelectModeExit: "Done selecting",
  backlogSelectItem: "Select #{id}",
  backlogSelectAllVisible: "Select all shown",
  backlogSelectedCount: "{count} selected",
  backlogClearSelection: "Clear selection",
  backlogSelectHint: "Shift+click selects a range",
  backlogBulkActionsLabel: "Bulk actions",
  backlogBulkStatus: "Change status",
  backlogBulkAddToSprint: "Add to sprint",
  backlogBulkAssignPo: "Assign {po}",
  backlogBulkChooseSprint: "Choose a sprint",
  backlogBulkNoSprint: "No planned or active sprint",
  backlogBulkUnassigned: "(Unassigned)",
  backlogBulkDone: "Updated {count} items",
  backlogBulkSkipped: "{count} items were left unchanged",
  backlogBulkFailed: "Bulk action failed",
  backlogBulkTrashConfirm: "Move the {count} selected items to the trash? You can undo right away.",
  backlogTrashedToast: "Moved {count} items to the trash",
  backlogUndo: "Undo",
  backlogRestored: "Restored {count} items",
  backlogRestoreFailed: "Could not undo. Restore the items from the trash.",
  backlogShowMoreDone: "Show more ({count} left)",
  backlogDoneShowing: "Newest first: {shown} of {total}",
}

export const id: BacklogOpsTranslations = {
  backlogCopyLink: "Salin tautan",
  backlogLinkCopied: "Tautan disalin",
  backlogLinkCopyFailed: "Tautan tidak dapat disalin",
  backlogPbiNotFound: "PBI {ref} tidak ditemukan (mungkin sudah dipindahkan ke tempat sampah)",
  backlogWorkloadQuickPick: "Pilih poin",
  backlogFiltersLabel: "Filter",
  backlogFilterStatus: "Status",
  backlogFilterGoal: "Tujuan produk",
  backlogFilterAll: "Semua",
  backlogFilterNone: "Belum diatur",
  backlogFilterClear: "Hapus filter",
  backlogFilterResult: "Menampilkan {shown} dari {total}",
  backlogDragHandle: "Urutkan ulang #{id}",
  backlogDragHelp: "Spasi untuk mengangkat, ↑↓ untuk memindah, Spasi untuk meletakkan, Esc untuk membatalkan",
  backlogDragPicked: "#{id} diangkat. Posisi {pos} dari {total}. Gunakan ↑↓ untuk memindah, Spasi untuk meletakkan, Esc untuk membatalkan.",
  backlogDragMoved: "#{id}: posisi {pos} dari {total}",
  backlogDragCancelled: "Pengurutan dibatalkan. #{id} tetap di posisi {pos}",
  backlogMoveToTop: "Pindah ke paling atas",
  backlogMoveToBottom: "Pindah ke paling bawah",
  backlogMoreActions: "Aksi lain untuk #{id}",
  backlogSelectMode: "Pilih",
  backlogSelectModeExit: "Selesai memilih",
  backlogSelectItem: "Pilih #{id}",
  backlogSelectAllVisible: "Pilih semua yang tampil",
  backlogSelectedCount: "{count} dipilih",
  backlogClearSelection: "Batalkan pilihan",
  backlogSelectHint: "Shift+klik untuk memilih rentang",
  backlogBulkActionsLabel: "Aksi massal",
  backlogBulkStatus: "Ubah status",
  backlogBulkAddToSprint: "Tambahkan ke sprint",
  backlogBulkAssignPo: "Tugaskan {po}",
  backlogBulkChooseSprint: "Pilih sprint",
  backlogBulkNoSprint: "Tidak ada sprint yang direncanakan atau aktif",
  backlogBulkUnassigned: "(Tidak ditugaskan)",
  backlogBulkDone: "{count} item diperbarui",
  backlogBulkSkipped: "{count} item tidak berubah",
  backlogBulkFailed: "Aksi massal gagal",
  backlogBulkTrashConfirm: "Pindahkan {count} item terpilih ke tempat sampah? Anda dapat langsung membatalkannya.",
  backlogTrashedToast: "{count} item dipindahkan ke tempat sampah",
  backlogUndo: "Urungkan",
  backlogRestored: "{count} item dipulihkan",
  backlogRestoreFailed: "Tidak dapat diurungkan. Pulihkan item dari tempat sampah.",
  backlogShowMoreDone: "Tampilkan lagi ({count} tersisa)",
  backlogDoneShowing: "Terbaru dahulu: {shown} dari {total}",
}
