/**
 * i18n domain: IceBox (idea box) page.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface IceboxTranslations {
  // IceBox
  iceboxTitle: string
  /** Explanatory label for the IceBox product term */
  iceboxDescription: string
  iceboxAddRequest: string
  iceboxNewRequest: string
  iceboxRequest: string
  iceboxBackground: string
  iceboxStatusUnreviewed: string
  iceboxStatusReviewed: string
  iceboxStatusCompleted: string
  iceboxStatusFrozen: string
  iceboxMoveToReviewed: string
  iceboxMoveToCompleted: string
  iceboxMoveToFrozen: string
  iceboxMoveToUnreviewed: string
  iceboxEditTitle: string
  iceboxStatus: string
  iceboxPoHearingMemo: string
  iceboxPoReviewMemo: string
  iceboxFreezeReason: string
  iceboxDeleteConfirm: string
  iceboxNoItems: string
  iceboxCount: string
  iceboxAuthorHint: string
  iceboxSearchLabel: string
  iceboxLoadFailed: string
  iceboxCreated: string
  iceboxSaved: string
  iceboxSaveFailed: string
  iceboxStatusChangeFailed: string
  iceboxDeleteFailed: string
  iceboxDeleted: string
  iceboxUploadFailed: string
  iceboxUploading: string
  iceboxAttachmentHint: string
  iceboxAttachmentDelete: string
  iceboxAttachmentDeleteConfirm: string
  iceboxAttachmentPreview: string
  iceboxAttachmentCount: string
}

export const ja: IceboxTranslations = {
  iceboxTitle: "IceBox",
  iceboxDescription: "アイデア置き場（IceBox）",
  iceboxAddRequest: "要望を追加",
  iceboxNewRequest: "新規要望",
  iceboxRequest: "要望・要求",
  iceboxBackground: "課題・背景",
  iceboxStatusUnreviewed: "PO未確認",
  iceboxStatusReviewed: "PO確認済み",
  iceboxStatusCompleted: "完了",
  iceboxStatusFrozen: "凍結",
  iceboxMoveToReviewed: "確認済みへ",
  iceboxMoveToCompleted: "完了へ",
  iceboxMoveToFrozen: "凍結へ",
  iceboxMoveToUnreviewed: "未確認へ戻す",
  iceboxEditTitle: "IceBox項目を編集",
  iceboxStatus: "ステータス",
  iceboxPoHearingMemo: "POヒアリングメモ",
  iceboxPoReviewMemo: "POレビューメモ",
  iceboxFreezeReason: "凍結理由",
  iceboxDeleteConfirm: "この項目を削除しますか？",
  iceboxNoItems: "このステータスの項目はまだありません",
  iceboxCount: "件",
  iceboxAuthorHint: "未入力の場合はあなたの名前が入ります",
  iceboxSearchLabel: "IceBox を検索",
  iceboxLoadFailed: "IceBox を読み込めませんでした",
  iceboxCreated: "要望を追加しました",
  iceboxSaved: "IceBox 項目を更新しました",
  iceboxSaveFailed: "IceBox 項目を保存できませんでした",
  iceboxStatusChangeFailed: "ステータスを変更できませんでした",
  iceboxDeleteFailed: "削除できませんでした",
  iceboxDeleted: "削除しました",
  iceboxUploadFailed: "ファイルをアップロードできませんでした",
  iceboxUploading: "アップロード中…",
  iceboxAttachmentHint: "画像・動画・音声・PDF・Office 文書（最大 200MB、{count}/10 件）",
  iceboxAttachmentDelete: "{name} を削除",
  iceboxAttachmentDeleteConfirm: "添付ファイル「{name}」を削除しますか？この操作は元に戻せません。",
  iceboxAttachmentPreview: "{name} をプレビュー",
  iceboxAttachmentCount: "添付ファイル {n} 件",
}

export const en: IceboxTranslations = {
  iceboxTitle: "IceBox",
  iceboxDescription: "Idea box (IceBox)",
  iceboxAddRequest: "Add Request",
  iceboxNewRequest: "New Request",
  iceboxRequest: "Request",
  iceboxBackground: "Background / Context",
  iceboxStatusUnreviewed: "PO Unreviewed",
  iceboxStatusReviewed: "PO Reviewed",
  iceboxStatusCompleted: "Completed",
  iceboxStatusFrozen: "Frozen",
  iceboxMoveToReviewed: "Mark Reviewed",
  iceboxMoveToCompleted: "Mark Completed",
  iceboxMoveToFrozen: "Freeze",
  iceboxMoveToUnreviewed: "Back to Unreviewed",
  iceboxEditTitle: "Edit IceBox Item",
  iceboxStatus: "Status",
  iceboxPoHearingMemo: "PO Hearing Memo",
  iceboxPoReviewMemo: "PO Review Memo",
  iceboxFreezeReason: "Freeze Reason",
  iceboxDeleteConfirm: "Delete this item?",
  iceboxNoItems: "Nothing in this status yet",
  iceboxCount: "items",
  iceboxAuthorHint: "Leave blank to use your name",
  iceboxSearchLabel: "Search the IceBox",
  iceboxLoadFailed: "Could not load the IceBox",
  iceboxCreated: "Request added",
  iceboxSaved: "IceBox item updated",
  iceboxSaveFailed: "Could not save the IceBox item",
  iceboxStatusChangeFailed: "Could not change the status",
  iceboxDeleteFailed: "Could not delete",
  iceboxDeleted: "Deleted",
  iceboxUploadFailed: "Could not upload the file",
  iceboxUploading: "Uploading…",
  iceboxAttachmentHint: "Images, video, audio, PDF, Office documents (max 200 MB, {count}/10)",
  iceboxAttachmentDelete: "Delete {name}",
  iceboxAttachmentDeleteConfirm: "Delete the attachment \"{name}\"? This cannot be undone.",
  iceboxAttachmentPreview: "Preview {name}",
  iceboxAttachmentCount: "{n} attachments",
}

export const id: IceboxTranslations = {
  iceboxTitle: "IceBox",
  iceboxDescription: "Kotak Ide (IceBox)",
  iceboxAddRequest: "Tambah Permintaan",
  iceboxNewRequest: "Permintaan Baru",
  iceboxRequest: "Permintaan",
  iceboxBackground: "Latar Belakang",
  iceboxStatusUnreviewed: "Belum Ditinjau PO",
  iceboxStatusReviewed: "Ditinjau PO",
  iceboxStatusCompleted: "Selesai",
  iceboxStatusFrozen: "Dibekukan",
  iceboxMoveToReviewed: "Tandai Ditinjau",
  iceboxMoveToCompleted: "Tandai Selesai",
  iceboxMoveToFrozen: "Bekukan",
  iceboxMoveToUnreviewed: "Kembali Belum Ditinjau",
  iceboxEditTitle: "Edit Item IceBox",
  iceboxStatus: "Status",
  iceboxPoHearingMemo: "Memo Hearing PO",
  iceboxPoReviewMemo: "Memo Review PO",
  iceboxFreezeReason: "Alasan Pembekuan",
  iceboxDeleteConfirm: "Hapus item ini?",
  iceboxNoItems: "Belum ada item dengan status ini",
  iceboxCount: "item",
  iceboxAuthorHint: "Kosongkan untuk memakai nama Anda",
  iceboxSearchLabel: "Cari di IceBox",
  iceboxLoadFailed: "IceBox tidak dapat dimuat",
  iceboxCreated: "Permintaan ditambahkan",
  iceboxSaved: "Item IceBox diperbarui",
  iceboxSaveFailed: "Item IceBox tidak dapat disimpan",
  iceboxStatusChangeFailed: "Status tidak dapat diubah",
  iceboxDeleteFailed: "Tidak dapat dihapus",
  iceboxDeleted: "Dihapus",
  iceboxUploadFailed: "Berkas tidak dapat diunggah",
  iceboxUploading: "Mengunggah…",
  iceboxAttachmentHint: "Gambar, video, audio, PDF, dokumen Office (maks. 200 MB, {count}/10)",
  iceboxAttachmentDelete: "Hapus {name}",
  iceboxAttachmentDeleteConfirm: "Hapus lampiran \"{name}\"? Tindakan ini tidak dapat dibatalkan.",
  iceboxAttachmentPreview: "Pratinjau {name}",
  iceboxAttachmentCount: "{n} lampiran",
}
