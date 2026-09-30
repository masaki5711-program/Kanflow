/**
 * i18n domain: Releases page.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ReleasesTranslations {
  // Release
  releaseTitle: string
  // Release extras
  releaseDeleteConfirm: string
  releaseDeleteFailed: string
  releaseBulkConfirm: string
  releaseUpdateFailed: string
  releaseNoItems: string
  releaseNoItemsDesc: string
  releaseNoCompletedItems: string
  releasePlanSuffix: string
  releaseActualSuffix: string
  releaseImportFailed: string
  releaseSaveFailed: string
  releaseLoadFailed: string
  releaseLoadCompletedFailed: string
  releaseBulkDone: string
  releaseImported: string
}

export const ja: ReleasesTranslations = {
  releaseTitle: "リリース",
  releaseDeleteConfirm: "この項目を削除しますか？",
  releaseDeleteFailed: "削除に失敗しました",
  releaseBulkConfirm: "件を一括でリリース済みにしますか？",
  releaseUpdateFailed: "件の更新に失敗しました",
  releaseNoItems: "リリース項目はまだありません",
  releaseNoItemsDesc: "上のボタンからバックログの完了項目を取り込んでください",
  releaseNoCompletedItems: "取り込み可能な完了済み項目がありません",
  releasePlanSuffix: "（計画）",
  releaseActualSuffix: "（実績）",
  releaseImportFailed: "取り込みに失敗しました",
  releaseSaveFailed: "保存に失敗しました",
  releaseLoadFailed: "リリース項目の読み込みに失敗しました",
  releaseLoadCompletedFailed: "完了済み項目の読み込みに失敗しました",
  releaseBulkDone: "{count} 件をリリース済みにしました",
  releaseImported: "{count} 件を取り込みました",
}

export const en: ReleasesTranslations = {
  releaseTitle: "Releases",
  releaseDeleteConfirm: "Delete this item?",
  releaseDeleteFailed: "Delete failed",
  releaseBulkConfirm: "items to Released?",
  releaseUpdateFailed: "updates failed",
  releaseNoItems: "No release items yet",
  releaseNoItemsDesc: "Import completed backlog items using the button above",
  releaseNoCompletedItems: "No completed items available for import",
  releasePlanSuffix: " (Plan)",
  releaseActualSuffix: " (Actual)",
  releaseImportFailed: "Import failed",
  releaseSaveFailed: "Save failed",
  releaseLoadFailed: "Failed to load release items",
  releaseLoadCompletedFailed: "Failed to load completed items",
  releaseBulkDone: "Marked {count} items as released",
  releaseImported: "Imported {count} items",
}

export const id: ReleasesTranslations = {
  releaseTitle: "Rilis",
  releaseDeleteConfirm: "Hapus item ini?",
  releaseDeleteFailed: "Gagal menghapus",
  releaseBulkConfirm: "item ke Dirilis?",
  releaseUpdateFailed: "pembaruan gagal",
  releaseNoItems: "Belum ada item rilis",
  releaseNoItemsDesc: "Impor item backlog yang selesai menggunakan tombol di atas",
  releaseNoCompletedItems: "Tidak ada item selesai yang tersedia untuk diimpor",
  releasePlanSuffix: " (Rencana)",
  releaseActualSuffix: " (Aktual)",
  releaseImportFailed: "Gagal mengimpor",
  releaseSaveFailed: "Gagal menyimpan",
  releaseLoadFailed: "Gagal memuat item rilis",
  releaseLoadCompletedFailed: "Gagal memuat item yang selesai",
  releaseBulkDone: "{count} item ditandai sebagai dirilis",
  releaseImported: "{count} item berhasil diimpor",
}
