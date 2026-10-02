/**
 * i18n domain: files / images in a PBI's 参考資料 (reference material) section
 * (components/pbi-form/attachments/), in the edit form, create modals and read view.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface PbiAttachmentsTranslations {
  pbiAttachLabel: string
  pbiAttachDrop: string
  pbiAttachHint: string
  pbiAttachPendingNote: string
  pbiAttachRemove: string
  pbiAttachDelete: string
  pbiAttachDeleteConfirm: string
  pbiAttachPreview: string
  pbiAttachOpen: string
  pbiAttachUploading: string
  pbiAttachUploadingN: string
  pbiAttachTooMany: string
  pbiAttachTooLarge: string
  pbiAttachFileError: string
  pbiAttachPartialFailed: string
  pbiAttachUploadFailed: string
  pbiAttachDeleteFailed: string
  pbiAttachClearErrors: string
  pbiAttachHistoryField: string
}

export const ja: PbiAttachmentsTranslations = {
  pbiAttachLabel: "参考資料の添付（画像・ファイル）",
  pbiAttachDrop: "クリックして選択、ドラッグ＆ドロップ、または Ctrl+V で貼り付け",
  pbiAttachHint: "画像・動画・音声・PDF・Office 文書など（1 ファイル最大 200MB、{count}/{max} 個）",
  pbiAttachPendingNote: "PBI の保存後にアップロードされます",
  pbiAttachRemove: "{name} を外す",
  pbiAttachDelete: "{name} を削除",
  pbiAttachDeleteConfirm: "添付ファイル「{name}」を削除しますか？この操作は元に戻せません。",
  pbiAttachPreview: "{name} をプレビュー",
  pbiAttachOpen: "{name} を開く（新しいタブ）",
  pbiAttachUploading: "アップロード中…",
  pbiAttachUploadingN: "ファイルをアップロード中…（{n} 個）",
  pbiAttachTooMany: "添付は 1 件につき最大 {max} 個までです",
  pbiAttachTooLarge: "ファイルサイズが上限（200MB）を超えています",
  pbiAttachFileError: "{name}: {message}",
  pbiAttachPartialFailed: "{n} 個のファイルをアップロードできませんでした: {names}",
  pbiAttachUploadFailed: "ファイルをアップロードできませんでした",
  pbiAttachDeleteFailed: "添付ファイルを削除できませんでした",
  pbiAttachClearErrors: "エラー表示を閉じる",
  pbiAttachHistoryField: "参考資料の添付",
}

export const en: PbiAttachmentsTranslations = {
  pbiAttachLabel: "Reference attachments (images, files)",
  pbiAttachDrop: "Click to choose, drag & drop, or paste with Ctrl+V",
  pbiAttachHint: "Images, video, audio, PDF, Office documents and more (max 200 MB per file, {count}/{max})",
  pbiAttachPendingNote: "Uploaded after the PBI is saved",
  pbiAttachRemove: "Remove {name}",
  pbiAttachDelete: "Delete {name}",
  pbiAttachDeleteConfirm: "Delete the attachment \"{name}\"? This cannot be undone.",
  pbiAttachPreview: "Preview {name}",
  pbiAttachOpen: "Open {name} (new tab)",
  pbiAttachUploading: "Uploading…",
  pbiAttachUploadingN: "Uploading files… ({n})",
  pbiAttachTooMany: "Up to {max} attachments per PBI",
  pbiAttachTooLarge: "The file is larger than the 200 MB limit",
  pbiAttachFileError: "{name}: {message}",
  pbiAttachPartialFailed: "{n} file(s) could not be uploaded: {names}",
  pbiAttachUploadFailed: "Could not upload the file",
  pbiAttachDeleteFailed: "Could not delete the attachment",
  pbiAttachClearErrors: "Dismiss errors",
  pbiAttachHistoryField: "Reference attachment",
}

export const id: PbiAttachmentsTranslations = {
  pbiAttachLabel: "Lampiran bahan referensi (gambar, berkas)",
  pbiAttachDrop: "Klik untuk memilih, seret & lepas, atau tempel dengan Ctrl+V",
  pbiAttachHint: "Gambar, video, audio, PDF, dokumen Office, dll. (maks. 200 MB per berkas, {count}/{max})",
  pbiAttachPendingNote: "Diunggah setelah PBI disimpan",
  pbiAttachRemove: "Lepaskan {name}",
  pbiAttachDelete: "Hapus {name}",
  pbiAttachDeleteConfirm: "Hapus lampiran \"{name}\"? Tindakan ini tidak dapat dibatalkan.",
  pbiAttachPreview: "Pratinjau {name}",
  pbiAttachOpen: "Buka {name} (tab baru)",
  pbiAttachUploading: "Mengunggah…",
  pbiAttachUploadingN: "Mengunggah berkas… ({n})",
  pbiAttachTooMany: "Maksimal {max} lampiran per PBI",
  pbiAttachTooLarge: "Ukuran berkas melebihi batas 200 MB",
  pbiAttachFileError: "{name}: {message}",
  pbiAttachPartialFailed: "{n} berkas gagal diunggah: {names}",
  pbiAttachUploadFailed: "Gagal mengunggah berkas",
  pbiAttachDeleteFailed: "Gagal menghapus lampiran",
  pbiAttachClearErrors: "Tutup pesan kesalahan",
  pbiAttachHistoryField: "Lampiran referensi",
}
