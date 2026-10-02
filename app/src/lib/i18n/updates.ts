/**
 * i18n domain: "what's new" — the dashboard's new-updates panel, unread
 * badges on the top page's project cards / mention list and the sidebar dot.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface UpdatesTranslations {
  updatesTitle: string
  updatesSince: string
  updatesSinceFirst: string
  updatesMarkSeen: string
  updatesMarkedSeen: string
  updatesMarkSeenFailed: string
  updatesForYou: string
  updatesForYouEmpty: string
  updatesByOthers: string
  updatesByOthersEmpty: string
  updatesByOthersMore: string
  updatesAllCaughtUp: string
  updatesNewBadge: string
  updatesLoadFailed: string
  updatesCardNew: string
  updatesCardMentions: string
  updatesCardUnread: string
  updatesSidebarBadge: string
  updatesHomeMentionsTitle: string
  updatesHomeMentionsEmpty: string
  updatesHomeMentionsAll: string
}

export const ja: UpdatesTranslations = {
  updatesTitle: "新着・あなた宛て",
  updatesSince: "前回の確認（{date}）以降",
  updatesSinceFirst: "直近 7 日間",
  updatesMarkSeen: "すべて確認済みにする",
  updatesMarkedSeen: "確認済みにしました",
  updatesMarkSeenFailed: "確認済みにできませんでした",
  updatesForYou: "あなた宛て（未読）",
  updatesForYouEmpty: "未読のメンション・通知はありません",
  updatesByOthers: "メンバーの更新",
  updatesByOthersEmpty: "新しい更新はありません",
  updatesByOthersMore: "ほか {n} 件は下の「最近のアクティビティ」で確認できます",
  updatesAllCaughtUp: "新しいメッセージや更新はありません。すべて確認済みです。",
  updatesNewBadge: "NEW",
  updatesLoadFailed: "新着情報を読み込めませんでした",
  updatesCardNew: "新着 {n}",
  updatesCardMentions: "あなた宛てメンション {n} 件",
  updatesCardUnread: "未読の通知 {n} 件",
  updatesSidebarBadge: "新着 {n} 件",
  updatesHomeMentionsTitle: "あなた宛ての未読メッセージ",
  updatesHomeMentionsEmpty: "未読のメンション・コメントはありません",
  updatesHomeMentionsAll: "通知をすべて見る",
}

export const en: UpdatesTranslations = {
  updatesTitle: "What's new for you",
  updatesSince: "Since your last check ({date})",
  updatesSinceFirst: "Last 7 days",
  updatesMarkSeen: "Mark all as seen",
  updatesMarkedSeen: "Marked as seen",
  updatesMarkSeenFailed: "Could not mark as seen",
  updatesForYou: "For you (unread)",
  updatesForYouEmpty: "No unread mentions or notifications",
  updatesByOthers: "Updates by members",
  updatesByOthersEmpty: "No new updates",
  updatesByOthersMore: "{n} more in \"Recent activity\" below",
  updatesAllCaughtUp: "No new messages or updates. You're all caught up.",
  updatesNewBadge: "NEW",
  updatesLoadFailed: "Could not load what's new",
  updatesCardNew: "{n} new",
  updatesCardMentions: "{n} mentions for you",
  updatesCardUnread: "{n} unread notifications",
  updatesSidebarBadge: "{n} new",
  updatesHomeMentionsTitle: "Unread messages for you",
  updatesHomeMentionsEmpty: "No unread mentions or comments",
  updatesHomeMentionsAll: "See all notifications",
}

export const id: UpdatesTranslations = {
  updatesTitle: "Terbaru untuk Anda",
  updatesSince: "Sejak pemeriksaan terakhir ({date})",
  updatesSinceFirst: "7 hari terakhir",
  updatesMarkSeen: "Tandai semua sudah dilihat",
  updatesMarkedSeen: "Ditandai sudah dilihat",
  updatesMarkSeenFailed: "Gagal menandai sudah dilihat",
  updatesForYou: "Untuk Anda (belum dibaca)",
  updatesForYouEmpty: "Tidak ada sebutan atau notifikasi yang belum dibaca",
  updatesByOthers: "Pembaruan dari anggota",
  updatesByOthersEmpty: "Tidak ada pembaruan baru",
  updatesByOthersMore: "{n} lainnya di \"Aktivitas terbaru\" di bawah",
  updatesAllCaughtUp: "Tidak ada pesan atau pembaruan baru. Semua sudah dilihat.",
  updatesNewBadge: "BARU",
  updatesLoadFailed: "Gagal memuat yang terbaru",
  updatesCardNew: "{n} baru",
  updatesCardMentions: "{n} sebutan untuk Anda",
  updatesCardUnread: "{n} notifikasi belum dibaca",
  updatesSidebarBadge: "{n} baru",
  updatesHomeMentionsTitle: "Pesan untuk Anda yang belum dibaca",
  updatesHomeMentionsEmpty: "Tidak ada sebutan atau komentar yang belum dibaca",
  updatesHomeMentionsAll: "Lihat semua notifikasi",
}
