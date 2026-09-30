/**
 * i18n domain: trash (soft delete). Project trash page (`projects/[id]/trash`),
 * its sidebar entry, the admin project trash (`/admin/trash`) and the shared
 * "move to trash" wording of delete confirmations.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {days} {name} {pbi} {icebox} {sprints} {date}.
 */
export interface TrashTranslations {
  trashTitle: string
  trashNavDescription: string
  /** Page intro; {days} = retention period. */
  trashDescription: string
  trashEmptyTitle: string
  trashEmptyDescription: string
  trashMoveToTrash: string
  trashRestore: string
  trashDeleteForever: string
  trashTypePbi: string
  trashTypeIcebox: string
  trashUntitled: string
  /** {name} = user who deleted it. */
  trashDeletedBy: string
  trashUnknownUser: string
  trashDeletedAt: string
  /** {date} = scheduled permanent deletion. */
  trashPurgeAt: string
  trashConfirmPurgeTitle: string
  /** {name} = item label. */
  trashConfirmPurgeMessage: string
  trashConfirmRestoreTitle: string
  trashRestored: string
  trashPurged: string
  trashRestoreFailed: string
  trashPurgeFailed: string
  trashLoadFailed: string
  trashListLabel: string
  // Admin project trash
  trashAdminMenu: string
  trashAdminTitle: string
  /** {days} = retention period. */
  trashAdminDescription: string
  trashAdminEmptyTitle: string
  trashAdminEmptyDescription: string
  /** {pbi} {icebox} {sprints} = live child counts. */
  trashAdminCounts: string
  /** {name} = project name. */
  trashAdminConfirmPurgeMessage: string
  /** {name} = project name. */
  trashAdminConfirmRestoreMessage: string
}

export const ja: TrashTranslations = {
  trashTitle: "ゴミ箱",
  trashNavDescription: "削除した PBI・IceBox 項目の復元",
  trashDescription: "削除した PBI と IceBox 項目は {days} 日間ここに保管され、その後完全に削除されます。それまでは復元できます。",
  trashEmptyTitle: "ゴミ箱は空です",
  trashEmptyDescription: "削除した PBI や IceBox 項目はここに表示され、復元できます。",
  trashMoveToTrash: "ゴミ箱に移動",
  trashRestore: "復元",
  trashDeleteForever: "完全に削除",
  trashTypePbi: "PBI",
  trashTypeIcebox: "IceBox",
  trashUntitled: "（無題）",
  trashDeletedBy: "削除した人: {name}",
  trashUnknownUser: "不明なユーザー",
  trashDeletedAt: "削除日時",
  trashPurgeAt: "{date} に完全削除",
  trashConfirmPurgeTitle: "完全に削除しますか？",
  trashConfirmPurgeMessage: "「{name}」を完全に削除します。添付ファイルと翻訳も削除され、元に戻せません。",
  trashConfirmRestoreTitle: "復元しますか？",
  trashRestored: "復元しました",
  trashPurged: "完全に削除しました",
  trashRestoreFailed: "復元に失敗しました",
  trashPurgeFailed: "完全削除に失敗しました",
  trashLoadFailed: "ゴミ箱を読み込めませんでした",
  trashListLabel: "ゴミ箱の項目",
  trashAdminMenu: "プロジェクトのゴミ箱",
  trashAdminTitle: "プロジェクトのゴミ箱",
  trashAdminDescription: "削除されたプロジェクトは {days} 日間ここに保管され、その後すべてのデータとファイルが完全に削除されます。",
  trashAdminEmptyTitle: "削除されたプロジェクトはありません",
  trashAdminEmptyDescription: "PO がプロジェクトを削除すると、ここから復元できます。",
  trashAdminCounts: "PBI {pbi} 件 / IceBox {icebox} 件 / スプリント {sprints} 件",
  trashAdminConfirmPurgeMessage: "プロジェクト「{name}」を完全に削除します。すべてのデータ・ファイル・翻訳が失われ、元に戻せません。",
  trashAdminConfirmRestoreMessage: "プロジェクト「{name}」を復元します。メンバーから再び見えるようになります。",
}

export const en: TrashTranslations = {
  trashTitle: "Trash",
  trashNavDescription: "Restore deleted PBIs and IceBox items",
  trashDescription: "Deleted PBIs and IceBox items stay here for {days} days and are then deleted permanently. You can restore them until then.",
  trashEmptyTitle: "The trash is empty",
  trashEmptyDescription: "Deleted PBIs and IceBox items appear here and can be restored.",
  trashMoveToTrash: "Move to trash",
  trashRestore: "Restore",
  trashDeleteForever: "Delete permanently",
  trashTypePbi: "PBI",
  trashTypeIcebox: "IceBox",
  trashUntitled: "(untitled)",
  trashDeletedBy: "Deleted by {name}",
  trashUnknownUser: "unknown user",
  trashDeletedAt: "Deleted at",
  trashPurgeAt: "Deleted permanently on {date}",
  trashConfirmPurgeTitle: "Delete permanently?",
  trashConfirmPurgeMessage: "\"{name}\" will be deleted permanently, including attachments and translations. This cannot be undone.",
  trashConfirmRestoreTitle: "Restore?",
  trashRestored: "Restored",
  trashPurged: "Deleted permanently",
  trashRestoreFailed: "Failed to restore",
  trashPurgeFailed: "Failed to delete permanently",
  trashLoadFailed: "Could not load the trash",
  trashListLabel: "Items in the trash",
  trashAdminMenu: "Project trash",
  trashAdminTitle: "Project trash",
  trashAdminDescription: "Deleted projects stay here for {days} days. After that, all their data and files are deleted permanently.",
  trashAdminEmptyTitle: "No deleted projects",
  trashAdminEmptyDescription: "When a PO deletes a project, you can restore it here.",
  trashAdminCounts: "{pbi} PBIs / {icebox} IceBox items / {sprints} sprints",
  trashAdminConfirmPurgeMessage: "Project \"{name}\" will be deleted permanently with all its data, files and translations. This cannot be undone.",
  trashAdminConfirmRestoreMessage: "Project \"{name}\" will be restored and visible to its members again.",
}

export const id: TrashTranslations = {
  trashTitle: "Tempat Sampah",
  trashNavDescription: "Pulihkan PBI dan item IceBox yang dihapus",
  trashDescription: "PBI dan item IceBox yang dihapus disimpan di sini selama {days} hari, lalu dihapus secara permanen. Sampai saat itu Anda dapat memulihkannya.",
  trashEmptyTitle: "Tempat sampah kosong",
  trashEmptyDescription: "PBI dan item IceBox yang dihapus muncul di sini dan dapat dipulihkan.",
  trashMoveToTrash: "Pindahkan ke tempat sampah",
  trashRestore: "Pulihkan",
  trashDeleteForever: "Hapus permanen",
  trashTypePbi: "PBI",
  trashTypeIcebox: "IceBox",
  trashUntitled: "(tanpa judul)",
  trashDeletedBy: "Dihapus oleh {name}",
  trashUnknownUser: "pengguna tidak dikenal",
  trashDeletedAt: "Dihapus pada",
  trashPurgeAt: "Dihapus permanen pada {date}",
  trashConfirmPurgeTitle: "Hapus secara permanen?",
  trashConfirmPurgeMessage: "\"{name}\" akan dihapus secara permanen, termasuk lampiran dan terjemahan. Tindakan ini tidak dapat dibatalkan.",
  trashConfirmRestoreTitle: "Pulihkan?",
  trashRestored: "Berhasil dipulihkan",
  trashPurged: "Dihapus secara permanen",
  trashRestoreFailed: "Gagal memulihkan",
  trashPurgeFailed: "Gagal menghapus secara permanen",
  trashLoadFailed: "Tidak dapat memuat tempat sampah",
  trashListLabel: "Item di tempat sampah",
  trashAdminMenu: "Tempat sampah proyek",
  trashAdminTitle: "Tempat sampah proyek",
  trashAdminDescription: "Proyek yang dihapus disimpan di sini selama {days} hari. Setelah itu semua data dan berkasnya dihapus secara permanen.",
  trashAdminEmptyTitle: "Tidak ada proyek yang dihapus",
  trashAdminEmptyDescription: "Jika PO menghapus proyek, Anda dapat memulihkannya di sini.",
  trashAdminCounts: "{pbi} PBI / {icebox} item IceBox / {sprints} sprint",
  trashAdminConfirmPurgeMessage: "Proyek \"{name}\" akan dihapus secara permanen beserta semua data, berkas, dan terjemahannya. Tindakan ini tidak dapat dibatalkan.",
  trashAdminConfirmRestoreMessage: "Proyek \"{name}\" akan dipulihkan dan kembali terlihat oleh anggotanya.",
}
