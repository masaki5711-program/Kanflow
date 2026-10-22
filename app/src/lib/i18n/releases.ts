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
  releaseGitLabel: string
  releaseGitTagged: string
  releaseGitUntagged: string
  releaseGitProgress: string
  releaseGitPending: string
  releaseGitUnplanned: string
  releaseGitMarkReleased: string
  releaseGitMarkConfirm: string
  releaseGitPendingWarn: string
  releaseGitNote: string
  releaseGitNoteTitle: string
  releaseGitNoteCopy: string
  releaseGitNoteCopied: string
  releaseGitNoteAi: string
  releaseGitNoteGitlab: string
  releaseGitNoteLoadFailed: string
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
  releaseGitLabel: "Git の状況",
  releaseGitTagged: "タグ {tag}（{date}）",
  releaseGitUntagged: "未タグ",
  releaseGitProgress: "マージ済み {merged} / {planned} 件",
  releaseGitPending: "未マージ: {list}",
  releaseGitUnplanned: "計画外のマージ {n} 件",
  releaseGitMarkReleased: "タグ済み → リリース済みにする",
  releaseGitMarkConfirm: "{n} 件をリリース済みにします。リリース日とノートは GitLab の値を使います。",
  releaseGitPendingWarn: "未マージの PBI が {n} 件あります。",
  releaseGitNote: "リリースノート",
  releaseGitNoteTitle: "{version} のリリースノート",
  releaseGitNoteCopy: "コピー",
  releaseGitNoteCopied: "コピーしました",
  releaseGitNoteAi: "AI で要約",
  releaseGitNoteGitlab: "GitLab のリリース説明",
  releaseGitNoteLoadFailed: "リリースノートを読み込めませんでした",
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
  releaseGitLabel: "Git status",
  releaseGitTagged: "Tag {tag} ({date})",
  releaseGitUntagged: "Not tagged yet",
  releaseGitProgress: "{merged} of {planned} merged",
  releaseGitPending: "Not merged: {list}",
  releaseGitUnplanned: "{n} merged but not planned",
  releaseGitMarkReleased: "Tagged → mark as released",
  releaseGitMarkConfirm: "Mark {n} items as released, using the date and notes from GitLab.",
  releaseGitPendingWarn: "{n} PBI(s) are not merged yet.",
  releaseGitNote: "Release notes",
  releaseGitNoteTitle: "Release notes for {version}",
  releaseGitNoteCopy: "Copy",
  releaseGitNoteCopied: "Copied",
  releaseGitNoteAi: "Summarize with AI",
  releaseGitNoteGitlab: "GitLab release description",
  releaseGitNoteLoadFailed: "Could not load the release notes",
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
  releaseGitLabel: "Status Git",
  releaseGitTagged: "Tag {tag} ({date})",
  releaseGitUntagged: "Belum di-tag",
  releaseGitProgress: "{merged} dari {planned} sudah di-merge",
  releaseGitPending: "Belum di-merge: {list}",
  releaseGitUnplanned: "{n} di-merge di luar rencana",
  releaseGitMarkReleased: "Sudah di-tag → tandai dirilis",
  releaseGitMarkConfirm: "Tandai {n} item sebagai dirilis dengan tanggal dan catatan dari GitLab.",
  releaseGitPendingWarn: "{n} PBI belum di-merge.",
  releaseGitNote: "Catatan rilis",
  releaseGitNoteTitle: "Catatan rilis {version}",
  releaseGitNoteCopy: "Salin",
  releaseGitNoteCopied: "Tersalin",
  releaseGitNoteAi: "Ringkas dengan AI",
  releaseGitNoteGitlab: "Deskripsi rilis GitLab",
  releaseGitNoteLoadFailed: "Gagal memuat catatan rilis",
}
