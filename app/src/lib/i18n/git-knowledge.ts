/**
 * i18n domain: repository knowledge base for the AI chat
 * ("AI の参照資料として使う") — the switch / folder filter / index status in the settings Git
 * section, the status on the 開発（Git） page and the hint chip on the AI chat.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GitKnowledgeTranslations {
  gitKbSwitch: string
  gitKbSwitchHelp: string
  gitKbOnTitle: string
  gitKbOnMessage: string
  gitKbOnConfirm: string
  gitKbOffTitle: string
  gitKbOffMessage: string
  gitKbOffConfirm: string
  gitKbEnabledToast: string
  gitKbDisabledToast: string
  gitKbSaveFailed: string
  gitKbFilter: string
  gitKbFilterHelp: string
  gitKbFilterSave: string
  gitKbFilterSaved: string
  gitKbStatusIndexed: string
  gitKbStatusIndexing: string
  gitKbStatusPending: string
  gitKbStatusError: string
  gitKbReindex: string
  gitKbReindexOf: string
  gitKbReindexStarted: string
  gitKbReindexTooSoon: string
  gitKbReindexBusy: string
  gitKbReindexFailed: string
  chatKbHint: string
  chatKbHintTitle: string
}

export const ja: GitKnowledgeTranslations = {
  gitKbSwitch: "AI の参照資料として使う",
  gitKbSwitchHelp: "オンにすると、このリポジトリの文書やコードを取り込み、プロジェクトの AI チャットが質問に答えるときの資料にします（読み取りのみ）。",
  gitKbOnTitle: "「{name}」を AI の参照資料にしますか？",
  gitKbOnMessage:
    "このリポジトリの文書とコードを Kanflow に取り込みます。GitLab の権限がないメンバーも含め、このプロジェクトの全メンバーが AI を通じて内容を見られるようになります。" +
    "秘密情報のファイル（.env、鍵、認証情報など）は自動で除外しますが、メンバーに見せて問題ない内容か確認してください。",
  gitKbOnConfirm: "参照資料にする",
  gitKbOffTitle: "AI の参照資料をやめますか？",
  gitKbOffMessage: "取り込んだ内容はすぐに削除され、AI はこのリポジトリを参照できなくなります。もう一度オンにすると取り込み直します。",
  gitKbOffConfirm: "やめる",
  gitKbEnabledToast: "AI の参照資料にしました。取り込みを始めます",
  gitKbDisabledToast: "AI の参照資料をやめました",
  gitKbSaveFailed: "保存できませんでした",
  gitKbFilter: "取り込むフォルダ（任意）",
  gitKbFilterHelp: "例: docs/, specs/ — カンマか改行で区切ります。空欄ならリポジトリ全体です。画像・バイナリ・大きなファイル・秘密情報のファイルは自動で除外します。",
  gitKbFilterSave: "フォルダを保存",
  gitKbFilterSaved: "取り込むフォルダを保存しました。取り込み直します",
  gitKbStatusIndexed: "AI の参照資料: {n} ファイル・最終取り込み {time}",
  gitKbStatusIndexing: "取り込み中…",
  gitKbStatusPending: "取り込み待ち（次回の同期で続きを取り込みます）",
  gitKbStatusError: "取り込みエラー（{time}）",
  gitKbReindex: "今すぐ取り込む",
  gitKbReindexOf: "「{name}」を今すぐ取り込む",
  gitKbReindexStarted: "取り込みを始めました。終わると表示が更新されます",
  gitKbReindexTooSoon: "少し前に取り込んだばかりです。しばらく待ってから押してください",
  gitKbReindexBusy: "別のリポジトリを取り込み中です。少し待ってからもう一度押してください",
  gitKbReindexFailed: "取り込みを開始できませんでした",
  chatKbHint: "仕様書リポジトリを参照できます",
  chatKbHintTitle: "AI が参照できるリポジトリ: {names}",
}

export const en: GitKnowledgeTranslations = {
  gitKbSwitch: "Use as AI reference material",
  gitKbSwitchHelp: "When on, this repository's documents and code are imported so the project's AI chat can answer questions from them (read-only).",
  gitKbOnTitle: "Use \"{name}\" as AI reference material?",
  gitKbOnMessage:
    "The repository's documents and code are imported into Kanflow. Every member of this project — including people without access to it in GitLab — will be able to see its content through the AI. " +
    "Secret files (.env, keys, credentials …) are excluded automatically, but make sure the content is fine to share with the members.",
  gitKbOnConfirm: "Use as reference",
  gitKbOffTitle: "Stop using it as AI reference material?",
  gitKbOffMessage: "The imported content is deleted right away and the AI can no longer read this repository. Turning it on again re-imports it.",
  gitKbOffConfirm: "Stop",
  gitKbEnabledToast: "Now AI reference material. Import started",
  gitKbDisabledToast: "No longer AI reference material",
  gitKbSaveFailed: "Could not save",
  gitKbFilter: "Folders to import (optional)",
  gitKbFilterHelp: "e.g. docs/, specs/ — separated by commas or new lines. Empty = the whole repository. Images, binaries, large files and secret files are always skipped.",
  gitKbFilterSave: "Save folders",
  gitKbFilterSaved: "Folders saved. Re-importing",
  gitKbStatusIndexed: "AI reference: {n} files · last import {time}",
  gitKbStatusIndexing: "Importing…",
  gitKbStatusPending: "Waiting to import (continues with the next sync)",
  gitKbStatusError: "Import error ({time})",
  gitKbReindex: "Import now",
  gitKbReindexOf: "Import \"{name}\" now",
  gitKbReindexStarted: "Import started. The status updates when it is done",
  gitKbReindexTooSoon: "Imported a moment ago. Please wait a little before trying again",
  gitKbReindexBusy: "Another repository is being imported. Please try again shortly",
  gitKbReindexFailed: "Could not start the import",
  chatKbHint: "Can refer to the specification repository",
  chatKbHintTitle: "Repositories the AI can read: {names}",
}

export const id: GitKnowledgeTranslations = {
  gitKbSwitch: "Gunakan sebagai bahan referensi AI",
  gitKbSwitchHelp: "Jika aktif, dokumen dan kode repositori ini diimpor agar chat AI proyek dapat menjawab pertanyaan berdasarkan isinya (hanya baca).",
  gitKbOnTitle: "Gunakan \"{name}\" sebagai bahan referensi AI?",
  gitKbOnMessage:
    "Dokumen dan kode repositori ini akan diimpor ke Kanflow. Semua anggota proyek ini — termasuk yang tidak punya akses di GitLab — dapat melihat isinya melalui AI. " +
    "File rahasia (.env, kunci, kredensial, dll.) dikecualikan otomatis, tetapi pastikan isinya boleh dilihat oleh anggota.",
  gitKbOnConfirm: "Jadikan referensi",
  gitKbOffTitle: "Berhenti menggunakannya sebagai referensi AI?",
  gitKbOffMessage: "Isi yang diimpor langsung dihapus dan AI tidak dapat lagi membaca repositori ini. Mengaktifkannya lagi akan mengimpor ulang.",
  gitKbOffConfirm: "Hentikan",
  gitKbEnabledToast: "Sekarang menjadi referensi AI. Impor dimulai",
  gitKbDisabledToast: "Tidak lagi menjadi referensi AI",
  gitKbSaveFailed: "Gagal menyimpan",
  gitKbFilter: "Folder yang diimpor (opsional)",
  gitKbFilterHelp: "mis. docs/, specs/ — pisahkan dengan koma atau baris baru. Kosong = seluruh repositori. Gambar, biner, file besar, dan file rahasia selalu dilewati.",
  gitKbFilterSave: "Simpan folder",
  gitKbFilterSaved: "Folder disimpan. Mengimpor ulang",
  gitKbStatusIndexed: "Referensi AI: {n} file · impor terakhir {time}",
  gitKbStatusIndexing: "Sedang mengimpor…",
  gitKbStatusPending: "Menunggu impor (dilanjutkan pada sinkronisasi berikutnya)",
  gitKbStatusError: "Kesalahan impor ({time})",
  gitKbReindex: "Impor sekarang",
  gitKbReindexOf: "Impor \"{name}\" sekarang",
  gitKbReindexStarted: "Impor dimulai. Status diperbarui setelah selesai",
  gitKbReindexTooSoon: "Baru saja diimpor. Tunggu sebentar sebelum mencoba lagi",
  gitKbReindexBusy: "Repositori lain sedang diimpor. Coba lagi sebentar lagi",
  gitKbReindexFailed: "Gagal memulai impor",
  chatKbHint: "Dapat merujuk repositori spesifikasi",
  chatKbHintTitle: "Repositori yang dapat dibaca AI: {names}",
}
