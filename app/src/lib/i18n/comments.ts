/**
 * i18n domain: comments (+ @mentions) and the per-item change history.
 * Comment thread / composer (`components/comments/`), the PBI detail modal's
 * Details / Comments / History tabs, the sprint-task and IceBox comment buttons.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {count} {max} {name} {actor}.
 */
export interface CommentsTranslations {
  commentsTitle: string
  commentsTabDetails: string
  commentsEmptyTitle: string
  commentsEmptyDescription: string
  commentsPlaceholder: string
  commentsSend: string
  commentsSendHint: string
  commentsEdit: string
  commentsDelete: string
  commentsSave: string
  commentsCancel: string
  commentsEdited: string
  commentsDeletedBody: string
  commentsDeleteConfirmTitle: string
  commentsDeleteConfirmMessage: string
  commentsDeleteDone: string
  commentsPostFailed: string
  commentsSaveFailed: string
  commentsDeleteFailed: string
  commentsLoadFailed: string
  commentsRetry: string
  commentsLoadMore: string
  /** {count} = number of comments. */
  commentsCountLabel: string
  commentsUnreadLabel: string
  /** {name} = task / item name. */
  commentsOpenFor: string
  commentsMentionListLabel: string
  commentsMentionNoMatch: string
  commentsMentionAllName: string
  commentsMentionAllHint: string
  /** {max} = maximum characters. */
  commentsTooLong: string
  commentsUnknownUser: string
  commentsBodyLabel: string
  commentsEditBodyLabel: string
  // History
  historyTitle: string
  historyEmpty: string
  historyLoadMore: string
  historyLoadFailed: string
  /** {actor} = user name (or "system"). */
  historyActionCreate: string
  historyActionUpdate: string
  historyActionDelete: string
  historyActionStatusChange: string
  historyActionAssign: string
  historyActionMove: string
  historyActionRestore: string
  historyActionComment: string
  historySystem: string
  historyChanged: string
  /** PBI detail in edit mode: someone else saved the PBI meanwhile (live update). */
  historyEditedElsewhere: string
  historyEmptyValue: string
  historyFieldProductGoal: string
  /** Emoji reactions (components/reactions/). Placeholders: {emoji} {count}. */
  reactionGroupLabel: string
  reactionAdd: string
  reactionChipAdd: string
  reactionChipRemove: string
  reactionMore: string
  reactionFailed: string
}

export const ja: CommentsTranslations = {
  commentsTitle: "コメント",
  commentsTabDetails: "詳細",
  commentsEmptyTitle: "コメントはまだありません",
  commentsEmptyDescription: "最初のコメントを書きましょう。@ でメンバーをメンションできます。",
  commentsPlaceholder: "コメントを入力（@ でメンション）",
  commentsSend: "送信",
  commentsSendHint: "Ctrl + Enter で送信",
  commentsEdit: "編集",
  commentsDelete: "削除",
  commentsSave: "保存",
  commentsCancel: "キャンセル",
  commentsEdited: "（編集済み）",
  commentsDeletedBody: "このコメントは削除されました",
  commentsDeleteConfirmTitle: "コメントを削除しますか？",
  commentsDeleteConfirmMessage: "削除したコメントは元に戻せません。",
  commentsDeleteDone: "コメントを削除しました",
  commentsPostFailed: "コメントの投稿に失敗しました",
  commentsSaveFailed: "コメントの保存に失敗しました",
  commentsDeleteFailed: "コメントの削除に失敗しました",
  commentsLoadFailed: "コメントを読み込めませんでした",
  commentsRetry: "再読み込み",
  commentsLoadMore: "さらに表示",
  commentsCountLabel: "コメント {count} 件",
  commentsUnreadLabel: "あなた宛ての未読 {count} 件",
  commentsOpenFor: "コメント: {name}",
  commentsMentionListLabel: "メンション候補",
  commentsMentionNoMatch: "一致するメンバーがいません",
  commentsMentionAllName: "全員",
  commentsMentionAllHint: "プロジェクトの全メンバーに通知",
  commentsTooLong: "{max} 文字以内で入力してください",
  commentsUnknownUser: "不明なユーザー",
  commentsBodyLabel: "新しいコメント",
  commentsEditBodyLabel: "コメントを編集",
  historyTitle: "履歴",
  historyEmpty: "履歴はまだありません",
  historyLoadMore: "さらに表示",
  historyLoadFailed: "履歴を読み込めませんでした",
  historyActionCreate: "{actor} が作成しました",
  historyActionUpdate: "{actor} が更新しました",
  historyActionDelete: "{actor} が削除しました",
  historyActionStatusChange: "{actor} がステータスを変更しました",
  historyActionAssign: "{actor} が担当者を変更しました",
  historyActionMove: "{actor} がスプリント間で移動しました",
  historyActionRestore: "{actor} がゴミ箱から復元しました",
  historyActionComment: "{actor} がコメントしました",
  historySystem: "システム",
  historyChanged: "内容を変更",
  historyEditedElsewhere: "編集中に他の人がこの PBI を更新しました。保存すると、最新の内容との違いが表示されます。",
  historyEmptyValue: "（なし）",
  historyFieldProductGoal: "プロダクトゴール",
  reactionGroupLabel: "リアクション",
  reactionAdd: "リアクションを追加",
  reactionChipAdd: "{emoji} のリアクションを付ける（現在 {count} 件）",
  reactionChipRemove: "{emoji} のリアクションを取り消す（現在 {count} 件）",
  reactionMore: "ほか {count} 人",
  reactionFailed: "リアクションを更新できませんでした",
}

export const en: CommentsTranslations = {
  commentsTitle: "Comments",
  commentsTabDetails: "Details",
  commentsEmptyTitle: "No comments yet",
  commentsEmptyDescription: "Start the conversation. Type @ to mention a member.",
  commentsPlaceholder: "Write a comment (@ to mention)",
  commentsSend: "Send",
  commentsSendHint: "Ctrl + Enter to send",
  commentsEdit: "Edit",
  commentsDelete: "Delete",
  commentsSave: "Save",
  commentsCancel: "Cancel",
  commentsEdited: "(edited)",
  commentsDeletedBody: "This comment was deleted",
  commentsDeleteConfirmTitle: "Delete this comment?",
  commentsDeleteConfirmMessage: "A deleted comment cannot be restored.",
  commentsDeleteDone: "Comment deleted",
  commentsPostFailed: "Could not post the comment",
  commentsSaveFailed: "Could not save the comment",
  commentsDeleteFailed: "Could not delete the comment",
  commentsLoadFailed: "Could not load comments",
  commentsRetry: "Reload",
  commentsLoadMore: "Show more",
  commentsCountLabel: "{count} comments",
  commentsUnreadLabel: "{count} unread for you",
  commentsOpenFor: "Comments: {name}",
  commentsMentionListLabel: "Mention suggestions",
  commentsMentionNoMatch: "No matching members",
  commentsMentionAllName: "all",
  commentsMentionAllHint: "Notify every project member",
  commentsTooLong: "Use at most {max} characters",
  commentsUnknownUser: "Unknown user",
  commentsBodyLabel: "New comment",
  commentsEditBodyLabel: "Edit comment",
  historyTitle: "History",
  historyEmpty: "No history yet",
  historyLoadMore: "Show more",
  historyLoadFailed: "Could not load the history",
  historyActionCreate: "{actor} created this",
  historyActionUpdate: "{actor} updated this",
  historyActionDelete: "{actor} deleted this",
  historyActionStatusChange: "{actor} changed the status",
  historyActionAssign: "{actor} changed the assignee",
  historyActionMove: "{actor} moved this between sprints",
  historyActionRestore: "{actor} restored this from the trash",
  historyActionComment: "{actor} commented",
  historySystem: "System",
  historyChanged: "changed",
  historyEditedElsewhere: "Someone else updated this PBI while you were editing. When you save, the differences from the latest version are shown.",
  historyEmptyValue: "(none)",
  historyFieldProductGoal: "Product goal",
  reactionGroupLabel: "Reactions",
  reactionAdd: "Add reaction",
  reactionChipAdd: "Add {emoji} reaction ({count} so far)",
  reactionChipRemove: "Remove your {emoji} reaction ({count} so far)",
  reactionMore: "and {count} more",
  reactionFailed: "Could not update the reaction",
}

export const id: CommentsTranslations = {
  commentsTitle: "Komentar",
  commentsTabDetails: "Detail",
  commentsEmptyTitle: "Belum ada komentar",
  commentsEmptyDescription: "Mulailah diskusi. Ketik @ untuk menyebut anggota.",
  commentsPlaceholder: "Tulis komentar (@ untuk menyebut)",
  commentsSend: "Kirim",
  commentsSendHint: "Ctrl + Enter untuk mengirim",
  commentsEdit: "Ubah",
  commentsDelete: "Hapus",
  commentsSave: "Simpan",
  commentsCancel: "Batal",
  commentsEdited: "(diubah)",
  commentsDeletedBody: "Komentar ini telah dihapus",
  commentsDeleteConfirmTitle: "Hapus komentar ini?",
  commentsDeleteConfirmMessage: "Komentar yang dihapus tidak dapat dipulihkan.",
  commentsDeleteDone: "Komentar dihapus",
  commentsPostFailed: "Gagal mengirim komentar",
  commentsSaveFailed: "Gagal menyimpan komentar",
  commentsDeleteFailed: "Gagal menghapus komentar",
  commentsLoadFailed: "Gagal memuat komentar",
  commentsRetry: "Muat ulang",
  commentsLoadMore: "Tampilkan lagi",
  commentsCountLabel: "{count} komentar",
  commentsUnreadLabel: "{count} belum dibaca untuk Anda",
  commentsOpenFor: "Komentar: {name}",
  commentsMentionListLabel: "Saran sebutan",
  commentsMentionNoMatch: "Tidak ada anggota yang cocok",
  commentsMentionAllName: "semua",
  commentsMentionAllHint: "Beri tahu semua anggota proyek",
  commentsTooLong: "Maksimal {max} karakter",
  commentsUnknownUser: "Pengguna tidak dikenal",
  commentsBodyLabel: "Komentar baru",
  commentsEditBodyLabel: "Ubah komentar",
  historyTitle: "Riwayat",
  historyEmpty: "Belum ada riwayat",
  historyLoadMore: "Tampilkan lagi",
  historyLoadFailed: "Gagal memuat riwayat",
  historyActionCreate: "{actor} membuat item ini",
  historyActionUpdate: "{actor} memperbarui item ini",
  historyActionDelete: "{actor} menghapus item ini",
  historyActionStatusChange: "{actor} mengubah status",
  historyActionAssign: "{actor} mengubah penanggung jawab",
  historyActionMove: "{actor} memindahkan item ini antar-sprint",
  historyActionRestore: "{actor} memulihkan item ini dari tempat sampah",
  historyActionComment: "{actor} berkomentar",
  historySystem: "Sistem",
  historyChanged: "diubah",
  historyEditedElsewhere: "Orang lain memperbarui PBI ini saat Anda mengedit. Saat menyimpan, perbedaan dengan versi terbaru akan ditampilkan.",
  historyEmptyValue: "(kosong)",
  historyFieldProductGoal: "Tujuan produk",
  reactionGroupLabel: "Reaksi",
  reactionAdd: "Tambah reaksi",
  reactionChipAdd: "Beri reaksi {emoji} (saat ini {count})",
  reactionChipRemove: "Batalkan reaksi {emoji} Anda (saat ini {count})",
  reactionMore: "dan {count} lainnya",
  reactionFailed: "Reaksi tidak dapat diperbarui",
}
