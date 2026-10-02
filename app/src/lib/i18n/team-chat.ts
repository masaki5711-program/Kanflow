/**
 * i18n domain: project team chat (チームチャット) — messages, mentions,
 * Teams-style replies (also posted to the sprint / backlog thread), files.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface TeamChatTranslations {
  talkTitle: string
  talkNavDesc: string
  talkDescription: string
  talkTabAll: string
  talkTabForMe: string
  talkEmpty: string
  talkEmptyForMe: string
  talkLoadOlder: string
  talkUnreadDivider: string
  talkForYouTag: string
  talkReplyToYouTag: string
  talkReply: string
  talkDelete: string
  talkDeleteConfirm: string
  talkDeleted: string
  talkReplyingTo: string
  talkReplyCancel: string
  talkReplyAlsoThread: string
  talkPostedToThread: string
  talkFromSource: string
  talkSourcePbi: string
  talkSourceTask: string
  talkSourceIcebox: string
  talkQuoteDeleted: string
  talkQuoteFiles: string
  talkComposerLabel: string
  talkSend: string
  talkAttach: string
  talkAttachHint: string
  talkRemoveFile: string
  talkTooManyFiles: string
  talkFileTooLarge: string
  talkTotalTooLarge: string
  talkSendFailed: string
  talkLoadFailed: string
  talkJumpLatest: string
  talkNewMessages: string
  talkSidebarBadge: string
  talkSidebarForYou: string
  talkEdited: string
  talkOpenFile: string
}

export const ja: TeamChatTranslations = {
  talkTitle: "チームチャット",
  talkNavDesc: "プロジェクト全体の会話（スプリントのコメントも表示）",
  talkDescription: "プロジェクトメンバー全員の会話です。スプリント・バックログ・IceBox に書かれたコメントもここに流れます。@ でメンションできます。",
  talkTabAll: "すべて",
  talkTabForMe: "あなた宛て",
  talkEmpty: "まだメッセージはありません。最初のメッセージを送ってみましょう。",
  talkEmptyForMe: "あなた宛てのメッセージはありません",
  talkLoadOlder: "以前のメッセージを読み込む",
  talkUnreadDivider: "ここから未読",
  talkForYouTag: "@あなた宛て",
  talkReplyToYouTag: "あなたへの返信",
  talkReply: "返信",
  talkDelete: "削除",
  talkDeleteConfirm: "このメッセージを削除しますか？",
  talkDeleted: "メッセージを削除しました",
  talkReplyingTo: "{name} さんへの返信",
  talkReplyCancel: "返信をやめる",
  talkReplyAlsoThread: "この返信は「{source}」のコメントにも書き込まれます",
  talkPostedToThread: "「{source}」のコメントにも投稿済み",
  talkFromSource: "{source} のコメント",
  talkSourcePbi: "PBI {label}",
  talkSourceTask: "タスク「{label}」",
  talkSourceIcebox: "IceBox {label}",
  talkQuoteDeleted: "（削除されたメッセージ）",
  talkQuoteFiles: "📎 {n} 件",
  talkComposerLabel: "メッセージ（@ でメンション、Ctrl+Enter で送信）",
  talkSend: "送信",
  talkAttach: "ファイルを添付",
  talkAttachHint: "画像・ファイルは 1 回に 5 個、1 ファイル 20MB まで（ドラッグ＆ドロップ・Ctrl+V で貼り付けも可）",
  talkRemoveFile: "{name} を外す",
  talkTooManyFiles: "添付は 1 回に 5 個までです",
  talkFileTooLarge: "「{name}」は大きすぎます（1 ファイル 20MB まで）。大きなファイルはダッシュボードのリンクなどで共有してください",
  talkTotalTooLarge: "添付ファイルの合計が大きすぎます（合計 50MB まで）",
  talkSendFailed: "送信できませんでした",
  talkLoadFailed: "メッセージを読み込めませんでした",
  talkJumpLatest: "最新のメッセージへ",
  talkNewMessages: "新しいメッセージ {n} 件",
  talkSidebarBadge: "未読 {n} 件",
  talkSidebarForYou: "あなた宛ての未読 {n} 件",
  talkEdited: "（編集済み）",
  talkOpenFile: "{name} を開く",
}

export const en: TeamChatTranslations = {
  talkTitle: "Team chat",
  talkNavDesc: "Project-wide conversation (sprint comments included)",
  talkDescription: "The conversation of all project members. Comments written in sprints, the backlog and IceBox also appear here. Use @ to mention someone.",
  talkTabAll: "All",
  talkTabForMe: "For you",
  talkEmpty: "No messages yet. Send the first one.",
  talkEmptyForMe: "No messages for you",
  talkLoadOlder: "Load earlier messages",
  talkUnreadDivider: "Unread from here",
  talkForYouTag: "@For you",
  talkReplyToYouTag: "Reply to you",
  talkReply: "Reply",
  talkDelete: "Delete",
  talkDeleteConfirm: "Delete this message?",
  talkDeleted: "Message deleted",
  talkReplyingTo: "Replying to {name}",
  talkReplyCancel: "Cancel reply",
  talkReplyAlsoThread: "This reply is also posted to the comments of \"{source}\"",
  talkPostedToThread: "Also posted to the comments of \"{source}\"",
  talkFromSource: "Comment on {source}",
  talkSourcePbi: "PBI {label}",
  talkSourceTask: "task \"{label}\"",
  talkSourceIcebox: "IceBox {label}",
  talkQuoteDeleted: "(deleted message)",
  talkQuoteFiles: "📎 {n}",
  talkComposerLabel: "Message (@ to mention, Ctrl+Enter to send)",
  talkSend: "Send",
  talkAttach: "Attach files",
  talkAttachHint: "Up to 5 images / files per message, 20 MB each (drag & drop or paste with Ctrl+V)",
  talkRemoveFile: "Remove {name}",
  talkTooManyFiles: "Up to 5 files per message",
  talkFileTooLarge: "\"{name}\" is too large (20 MB per file). Share large files as a link on the dashboard",
  talkTotalTooLarge: "The files are too large in total (50 MB per message)",
  talkSendFailed: "Could not send",
  talkLoadFailed: "Could not load the messages",
  talkJumpLatest: "Jump to latest",
  talkNewMessages: "{n} new messages",
  talkSidebarBadge: "{n} unread",
  talkSidebarForYou: "{n} unread for you",
  talkEdited: "(edited)",
  talkOpenFile: "Open {name}",
}

export const id: TeamChatTranslations = {
  talkTitle: "Obrolan tim",
  talkNavDesc: "Percakapan seluruh proyek (termasuk komentar sprint)",
  talkDescription: "Percakapan semua anggota proyek. Komentar di sprint, backlog, dan IceBox juga muncul di sini. Gunakan @ untuk menyebut seseorang.",
  talkTabAll: "Semua",
  talkTabForMe: "Untuk Anda",
  talkEmpty: "Belum ada pesan. Kirim pesan pertama.",
  talkEmptyForMe: "Tidak ada pesan untuk Anda",
  talkLoadOlder: "Muat pesan sebelumnya",
  talkUnreadDivider: "Belum dibaca mulai di sini",
  talkForYouTag: "@Untuk Anda",
  talkReplyToYouTag: "Balasan untuk Anda",
  talkReply: "Balas",
  talkDelete: "Hapus",
  talkDeleteConfirm: "Hapus pesan ini?",
  talkDeleted: "Pesan dihapus",
  talkReplyingTo: "Membalas {name}",
  talkReplyCancel: "Batal membalas",
  talkReplyAlsoThread: "Balasan ini juga dikirim ke komentar \"{source}\"",
  talkPostedToThread: "Juga dikirim ke komentar \"{source}\"",
  talkFromSource: "Komentar pada {source}",
  talkSourcePbi: "PBI {label}",
  talkSourceTask: "tugas \"{label}\"",
  talkSourceIcebox: "IceBox {label}",
  talkQuoteDeleted: "(pesan dihapus)",
  talkQuoteFiles: "📎 {n}",
  talkComposerLabel: "Pesan (@ untuk menyebut, Ctrl+Enter untuk mengirim)",
  talkSend: "Kirim",
  talkAttach: "Lampirkan berkas",
  talkAttachHint: "Maksimal 5 gambar/berkas per pesan, 20 MB per berkas (seret & lepas atau tempel dengan Ctrl+V)",
  talkRemoveFile: "Hapus {name}",
  talkTooManyFiles: "Maksimal 5 berkas per pesan",
  talkFileTooLarge: "\"{name}\" terlalu besar (20 MB per berkas). Bagikan berkas besar sebagai tautan di dasbor",
  talkTotalTooLarge: "Total berkas terlalu besar (50 MB per pesan)",
  talkSendFailed: "Gagal mengirim",
  talkLoadFailed: "Gagal memuat pesan",
  talkJumpLatest: "Ke pesan terbaru",
  talkNewMessages: "{n} pesan baru",
  talkSidebarBadge: "{n} belum dibaca",
  talkSidebarForYou: "{n} belum dibaca untuk Anda",
  talkEdited: "(diedit)",
  talkOpenFile: "Buka {name}",
}
