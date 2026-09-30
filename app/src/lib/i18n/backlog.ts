/**
 * i18n domain: Product backlog page.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface BacklogTranslations {
  // Backlog
  backlogTitle: string
  backlogAddItem: string
  backlogWho: string
  backlogWhat: string
  backlogWhy: string
  backlogInitiative: string
  backlogEpic: string
  backlogWorkloadScore: string
  backlogPriority: string
  backlogUserStory: string
  backlogStatusReady: string
  backlogStatusNotReady: string
  backlogStatusCompleted: string
  backlogMoveToCompleted: string
  backlogMoveToReady: string
  backlogReturnToReady: string
  backlogMoveToNotReady: string
  backlogUserStoryPlaceholder: string
  backlogReadyHint: string
  backlogNotReadyHint: string
  backlogCompletedHint: string
  backlogCompletedDate: string
  backlogShowCompleted: string
  backlogHideCompleted: string
  backlogInSprintBadge: string
  // Backlog — icebox reuse warning
  backlogIceboxAlreadyUsedTitle: string
  backlogIceboxAlreadyUsedBody: string
  backlogIceboxAlreadyUsedTag: string
  backlogIceboxReuseAnyway: string
  backlogSectionReadyTitle: string
  backlogSectionNotReadyTitle: string
  backlogMoveUp: string
  backlogMoveDown: string
  backlogMovedAnnounce: string
  backlogReorderFailed: string
  backlogStatusChangeFailed: string
  backlogSaveFailed: string
  backlogSaved: string
  backlogDeleteConfirm: string
  backlogDeleteFailed: string
  backlogDeleted: string
  backlogLoadFailed: string
  backlogRoleLoadFailed: string
  backlogRetry: string
  backlogSearchLabel: string
  backlogIceboxNoneOption: string
  backlogWritingRules: string
  backlogUserStoryFormat: string
  backlogExampleLabel: string
  backlogAcceptanceCriteriaPlaceholder: string
  backlogFibonacciScale: string
  backlogAiStop: string
  backlogIceboxChip: string
  backlogPoNote: string
  backlogNotReadyReason: string
  backlogReferenceDoc: string
  backlogDetailTitle: string
  backlogDraftLabel: string
  backlogAddPbiTabExisting: string
  backlogAddPbiTabNew: string
  backlogAddPbiNewHint: string
  backlogAddPbiSelectedCount: string
  backlogAddPbiSelect: string
}

export const ja: BacklogTranslations = {
  backlogTitle: "プロダクトバックログ",
  backlogAddItem: "PBI追加",
  backlogWho: "誰が",
  backlogWhat: "何を",
  backlogWhy: "なぜ",
  backlogInitiative: "イニシアティブ",
  backlogEpic: "エピック",
  backlogWorkloadScore: "工数",
  backlogPriority: "優先度",
  backlogUserStory: "ユーザーストーリー",
  backlogStatusReady: "着手可能",
  backlogStatusNotReady: "未準備",
  backlogStatusCompleted: "完了",
  backlogMoveToCompleted: "完了にする",
  backlogMoveToReady: "着手可能に移動する",
  backlogReturnToReady: "着手可能に戻す",
  backlogMoveToNotReady: "未準備に戻す",
  backlogUserStoryPlaceholder: "プロジェクトマネージャーとして、チームの進捗をリアルタイムで確認したい。それは遅延リスクを早期に発見できるからだ。",
  backlogReadyHint: "次スプリントに取り込む候補。ユーザーストーリー・受入条件・工数が揃った PBI が並びます。",
  backlogNotReadyHint: "まだ詳細が固まっていない・見積り前の PBI。精緻化（リファインメント）を経て Ready に移動します。",
  backlogCompletedHint: "スプリントで完了した PBI。履歴として保持し、統計やレポートに使います。",
  backlogCompletedDate: "完了日",
  backlogShowCompleted: "完了済みを表示",
  backlogHideCompleted: "完了済みを非表示",
  backlogInSprintBadge: "スプリント着手中",
  backlogIceboxAlreadyUsedTitle: "この IceBox 項目は既に使用されています",
  backlogIceboxAlreadyUsedBody: "既存の PBI で参照されています。同じ IceBox 項目をこの PBI でも使用しますか？",
  backlogIceboxAlreadyUsedTag: "使用中",
  backlogIceboxReuseAnyway: "それでも使用する",
  backlogSectionReadyTitle: "Ready（着手可能）",
  backlogSectionNotReadyTitle: "Not Ready（未準備）",
  backlogMoveUp: "#{id} を上へ移動",
  backlogMoveDown: "#{id} を下へ移動",
  backlogMovedAnnounce: "#{id} を {pos} 番目に移動しました",
  backlogReorderFailed: "並び替えを保存できませんでした。元の順序に戻しました。",
  backlogStatusChangeFailed: "ステータスを変更できませんでした",
  backlogSaveFailed: "PBI を保存できませんでした",
  backlogSaved: "PBI を保存しました",
  backlogDeleteConfirm: "この PBI をゴミ箱に移動しますか？ゴミ箱から復元できます。",
  backlogDeleteFailed: "PBI を削除できませんでした",
  backlogDeleted: "PBI を削除しました",
  backlogLoadFailed: "プロダクトバックログを読み込めませんでした",
  backlogRoleLoadFailed: "あなたの権限を確認できなかったため、編集操作を一時的に無効にしています。",
  backlogRetry: "再試行",
  backlogSearchLabel: "バックログを検索",
  backlogIceboxNoneOption: "（選択しない）",
  backlogWritingRules: "記入ルール",
  backlogUserStoryFormat: "＜{who}＞として、＜{what}＞したい。それは＜{why}＞だからだ。",
  backlogExampleLabel: "例",
  backlogAcceptanceCriteriaPlaceholder: "・〇〇できること\n・△△の場合は××する",
  backlogFibonacciScale: "フィボナッチスケール",
  backlogAiStop: "生成を停止",
  backlogIceboxChip: "元の要望: {text}",
  backlogPoNote: "PO メモ",
  backlogNotReadyReason: "未準備の理由",
  backlogReferenceDoc: "参考資料",
  backlogDetailTitle: "PBI の詳細",
  backlogDraftLabel: "案 {n}",
  backlogAddPbiTabExisting: "既存から選ぶ",
  backlogAddPbiTabNew: "新規作成",
  backlogAddPbiNewHint: "作成された PBI は自動的に「Ready」になり、バックログ一覧にも表示されます。",
  backlogAddPbiSelectedCount: "{n} 件選択中",
  backlogAddPbiSelect: "#{id} を選択",
}

export const en: BacklogTranslations = {
  backlogTitle: "Product Backlog",
  backlogAddItem: "Add PBI",
  backlogWho: "Who",
  backlogWhat: "What",
  backlogWhy: "Why",
  backlogInitiative: "Initiative",
  backlogEpic: "Epic",
  backlogWorkloadScore: "Workload",
  backlogPriority: "Priority",
  backlogUserStory: "User Story",
  backlogStatusReady: "Ready",
  backlogStatusNotReady: "Not Ready",
  backlogStatusCompleted: "Completed",
  backlogMoveToCompleted: "Mark Completed",
  backlogMoveToReady: "Move to Ready",
  backlogReturnToReady: "Move back to Ready",
  backlogMoveToNotReady: "Move to Not Ready",
  backlogUserStoryPlaceholder: "As a project manager, I want to track team progress in real time, so that I can detect delay risks early.",
  backlogReadyHint: "Candidates to pull into the next sprint. These PBIs have user story, acceptance criteria, and effort estimates.",
  backlogNotReadyHint: "PBIs still being refined or not yet estimated. They move to Ready after refinement.",
  backlogCompletedHint: "PBIs completed in past sprints. Kept for history, metrics, and reports.",
  backlogCompletedDate: "Completed",
  backlogShowCompleted: "Show Completed",
  backlogHideCompleted: "Hide Completed",
  backlogInSprintBadge: "In active sprint",
  backlogIceboxAlreadyUsedTitle: "This IceBox item is already in use",
  backlogIceboxAlreadyUsedBody: "Another PBI already references this IceBox item. Use it for this PBI as well?",
  backlogIceboxAlreadyUsedTag: "in use",
  backlogIceboxReuseAnyway: "Use anyway",
  backlogSectionReadyTitle: "Ready",
  backlogSectionNotReadyTitle: "Not Ready",
  backlogMoveUp: "Move #{id} up",
  backlogMoveDown: "Move #{id} down",
  backlogMovedAnnounce: "Moved #{id} to position {pos}",
  backlogReorderFailed: "Could not save the new order. The previous order was restored.",
  backlogStatusChangeFailed: "Could not change the status",
  backlogSaveFailed: "Could not save the PBI",
  backlogSaved: "PBI saved",
  backlogDeleteConfirm: "Move this PBI to the trash? You can restore it from the trash.",
  backlogDeleteFailed: "Could not delete the PBI",
  backlogDeleted: "PBI deleted",
  backlogLoadFailed: "Could not load the product backlog",
  backlogRoleLoadFailed: "Your permissions could not be verified, so editing is temporarily disabled.",
  backlogRetry: "Retry",
  backlogSearchLabel: "Search the backlog",
  backlogIceboxNoneOption: "(None)",
  backlogWritingRules: "How to write it",
  backlogUserStoryFormat: "As a <{who}>, I want <{what}>, so that <{why}>.",
  backlogExampleLabel: "Example",
  backlogAcceptanceCriteriaPlaceholder: "• Users can …\n• When …, the system …",
  backlogFibonacciScale: "Fibonacci scale",
  backlogAiStop: "Stop generating",
  backlogIceboxChip: "Source request: {text}",
  backlogPoNote: "PO note",
  backlogNotReadyReason: "Why it is not ready",
  backlogReferenceDoc: "Reference",
  backlogDetailTitle: "PBI details",
  backlogDraftLabel: "Draft {n}",
  backlogAddPbiTabExisting: "Pick from backlog",
  backlogAddPbiTabNew: "Create new",
  backlogAddPbiNewHint: "The new PBI is set to \"Ready\" automatically and also appears in the backlog.",
  backlogAddPbiSelectedCount: "{n} selected",
  backlogAddPbiSelect: "Select #{id}",
}

export const id: BacklogTranslations = {
  backlogTitle: "Backlog Produk",
  backlogAddItem: "Tambah PBI",
  backlogWho: "Siapa",
  backlogWhat: "Apa",
  backlogWhy: "Mengapa",
  backlogInitiative: "Inisiatif",
  backlogEpic: "Epik",
  backlogWorkloadScore: "Beban Kerja",
  backlogPriority: "Prioritas",
  backlogUserStory: "User Story",
  backlogStatusReady: "Siap",
  backlogStatusNotReady: "Belum Siap",
  backlogStatusCompleted: "Selesai",
  backlogMoveToCompleted: "Tandai Selesai",
  backlogMoveToReady: "Pindahkan ke Siap",
  backlogReturnToReady: "Kembali ke Siap",
  backlogMoveToNotReady: "Kembali ke Belum Siap",
  backlogUserStoryPlaceholder: "Sebagai manajer proyek, saya ingin memantau progres tim secara real-time, agar dapat mendeteksi risiko keterlambatan lebih awal.",
  backlogReadyHint: "Kandidat untuk ditarik ke sprint berikutnya. PBI yang sudah memiliki user story, kriteria penerimaan, dan estimasi upaya.",
  backlogNotReadyHint: "PBI yang masih diperjelas atau belum diestimasi. Akan pindah ke Siap setelah refinement.",
  backlogCompletedHint: "PBI yang diselesaikan di sprint sebelumnya. Disimpan untuk riwayat, metrik, dan laporan.",
  backlogCompletedDate: "Tanggal Selesai",
  backlogShowCompleted: "Tampilkan Selesai",
  backlogHideCompleted: "Sembunyikan Selesai",
  backlogInSprintBadge: "Sedang dikerjakan di sprint",
  backlogIceboxAlreadyUsedTitle: "Item IceBox ini sudah digunakan",
  backlogIceboxAlreadyUsedBody: "PBI lain sudah merujuk item IceBox ini. Gunakan juga untuk PBI ini?",
  backlogIceboxAlreadyUsedTag: "digunakan",
  backlogIceboxReuseAnyway: "Tetap gunakan",
  backlogSectionReadyTitle: "Ready (Siap)",
  backlogSectionNotReadyTitle: "Not Ready (Belum Siap)",
  backlogMoveUp: "Pindahkan #{id} ke atas",
  backlogMoveDown: "Pindahkan #{id} ke bawah",
  backlogMovedAnnounce: "#{id} dipindahkan ke posisi {pos}",
  backlogReorderFailed: "Urutan baru tidak dapat disimpan. Urutan sebelumnya dikembalikan.",
  backlogStatusChangeFailed: "Status tidak dapat diubah",
  backlogSaveFailed: "PBI tidak dapat disimpan",
  backlogSaved: "PBI disimpan",
  backlogDeleteConfirm: "Pindahkan PBI ini ke tempat sampah? Anda dapat memulihkannya dari tempat sampah.",
  backlogDeleteFailed: "PBI tidak dapat dihapus",
  backlogDeleted: "PBI dihapus",
  backlogLoadFailed: "Backlog produk tidak dapat dimuat",
  backlogRoleLoadFailed: "Hak akses Anda tidak dapat diverifikasi, sehingga pengeditan dinonaktifkan sementara.",
  backlogRetry: "Coba lagi",
  backlogSearchLabel: "Cari di backlog",
  backlogIceboxNoneOption: "(Tidak ada)",
  backlogWritingRules: "Cara penulisan",
  backlogUserStoryFormat: "Sebagai <{who}>, saya ingin <{what}>, agar <{why}>.",
  backlogExampleLabel: "Contoh",
  backlogAcceptanceCriteriaPlaceholder: "• Pengguna dapat …\n• Jika …, sistem …",
  backlogFibonacciScale: "Skala Fibonacci",
  backlogAiStop: "Hentikan pembuatan",
  backlogIceboxChip: "Permintaan asal: {text}",
  backlogPoNote: "Catatan PO",
  backlogNotReadyReason: "Alasan belum siap",
  backlogReferenceDoc: "Referensi",
  backlogDetailTitle: "Detail PBI",
  backlogDraftLabel: "Draf {n}",
  backlogAddPbiTabExisting: "Pilih dari backlog",
  backlogAddPbiTabNew: "Buat baru",
  backlogAddPbiNewHint: "PBI baru otomatis berstatus \"Ready\" dan juga muncul di backlog.",
  backlogAddPbiSelectedCount: "{n} dipilih",
  backlogAddPbiSelect: "Pilih #{id}",
}
