/**
 * i18n domain: in-app notifications — header bell / panel
 * (`components/notifications/`) and the notification settings on /me.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {count} {actor} {label} {sprint} {start} {end} {date} {title}.
 */
export interface NotificationsTranslations {
  notifBell: string
  notifBellUnread: string
  notifPanelTitle: string
  notifMarkAllRead: string
  notifLoadMore: string
  notifEmpty: string
  notifLoadFailed: string
  notifRetry: string
  notifActionFailed: string
  notifUnread: string
  notifSomeone: string
  notifUntitled: string
  notifAssigned: string
  notifSprintStart: string
  notifSprintEnd: string
  notifDueSoon: string
  notifOverdue: string
  notifSurveillance: string
  notifMentioned: string
  notifComment: string
  notifUnknown: string
  notifSettingsTitle: string
  notifSettingsHint: string
  notifSettingsFailed: string
  notifTypeAssigned: string
  notifTypeMentioned: string
  notifTypeComment: string
  notifTypeDueSoon: string
  notifTypeOverdue: string
  notifTypeSprintStart: string
  notifTypeSprintEnd: string
  notifTypeSurveillance: string
}

export const ja: NotificationsTranslations = {
  notifBell: "通知",
  notifBellUnread: "通知（未読 {count} 件）",
  notifPanelTitle: "通知",
  notifMarkAllRead: "すべて既読",
  notifLoadMore: "もっと見る",
  notifEmpty: "新しい通知はありません",
  notifLoadFailed: "通知を取得できませんでした",
  notifRetry: "再読み込み",
  notifActionFailed: "通知を更新できませんでした",
  notifUnread: "未読",
  notifSomeone: "メンバー",
  notifUntitled: "（タイトルなし）",
  notifAssigned: "{actor} さんが「{label}」の担当者にあなたを設定しました",
  notifSprintStart: "スプリント「{sprint}」が始まりました（{start}〜{end}）",
  notifSprintEnd: "スプリント「{sprint}」が終了しました",
  notifDueSoon: "「{label}」の期限が近づいています（{date}）",
  notifOverdue: "「{label}」の期限を過ぎています（{date}）",
  notifSurveillance: "AI 監視レポート「{title}」で重大な異常が {count} 件見つかりました",
  notifMentioned: "{actor} さんが「{label}」のコメントであなたをメンションしました",
  notifComment: "{actor} さんが「{label}」にコメントしました",
  notifUnknown: "新しいお知らせがあります",
  notifSettingsTitle: "通知設定",
  notifSettingsHint: "ヘッダーのベル（アプリ内通知）で受け取る種類を選べます。変更はすぐに保存されます。",
  notifSettingsFailed: "通知設定を保存できませんでした",
  notifTypeAssigned: "担当者に設定されたとき",
  notifTypeMentioned: "コメントでメンションされたとき",
  notifTypeComment: "担当している項目にコメントが付いたとき",
  notifTypeDueSoon: "担当タスクの期限が近いとき",
  notifTypeOverdue: "担当タスクの期限を過ぎたとき",
  notifTypeSprintStart: "スプリントが始まったとき",
  notifTypeSprintEnd: "スプリントが終了したとき",
  notifTypeSurveillance: "AI 監視で重大な異常が見つかったとき（PO / SM）",
}

export const en: NotificationsTranslations = {
  notifBell: "Notifications",
  notifBellUnread: "Notifications ({count} unread)",
  notifPanelTitle: "Notifications",
  notifMarkAllRead: "Mark all as read",
  notifLoadMore: "Show more",
  notifEmpty: "No new notifications",
  notifLoadFailed: "Could not load notifications",
  notifRetry: "Reload",
  notifActionFailed: "Could not update the notification",
  notifUnread: "Unread",
  notifSomeone: "A member",
  notifUntitled: "(untitled)",
  notifAssigned: "{actor} assigned you to “{label}”",
  notifSprintStart: "Sprint “{sprint}” started ({start} – {end})",
  notifSprintEnd: "Sprint “{sprint}” ended",
  notifDueSoon: "“{label}” is due soon ({date})",
  notifOverdue: "“{label}” is overdue ({date})",
  notifSurveillance: "AI surveillance report “{title}” found {count} critical issue(s)",
  notifMentioned: "{actor} mentioned you in a comment on “{label}”",
  notifComment: "{actor} commented on “{label}”",
  notifUnknown: "You have a new notification",
  notifSettingsTitle: "Notifications",
  notifSettingsHint: "Choose what the header bell (in-app notifications) tells you about. Changes are saved immediately.",
  notifSettingsFailed: "Could not save the notification settings",
  notifTypeAssigned: "When I am assigned",
  notifTypeMentioned: "When I am mentioned in a comment",
  notifTypeComment: "When an item I am responsible for gets a comment",
  notifTypeDueSoon: "When my task is due soon",
  notifTypeOverdue: "When my task is overdue",
  notifTypeSprintStart: "When a sprint starts",
  notifTypeSprintEnd: "When a sprint ends",
  notifTypeSurveillance: "When AI surveillance finds a critical issue (PO / SM)",
}

export const id: NotificationsTranslations = {
  notifBell: "Notifikasi",
  notifBellUnread: "Notifikasi ({count} belum dibaca)",
  notifPanelTitle: "Notifikasi",
  notifMarkAllRead: "Tandai semua sudah dibaca",
  notifLoadMore: "Tampilkan lebih banyak",
  notifEmpty: "Tidak ada notifikasi baru",
  notifLoadFailed: "Notifikasi tidak dapat dimuat",
  notifRetry: "Muat ulang",
  notifActionFailed: "Notifikasi tidak dapat diperbarui",
  notifUnread: "Belum dibaca",
  notifSomeone: "Seorang anggota",
  notifUntitled: "(tanpa judul)",
  notifAssigned: "{actor} menugaskan Anda ke “{label}”",
  notifSprintStart: "Sprint “{sprint}” dimulai ({start} – {end})",
  notifSprintEnd: "Sprint “{sprint}” selesai",
  notifDueSoon: "“{label}” segera jatuh tempo ({date})",
  notifOverdue: "“{label}” sudah lewat tenggat ({date})",
  notifSurveillance: "Laporan pemantauan AI “{title}” menemukan {count} masalah kritis",
  notifMentioned: "{actor} menyebut Anda dalam komentar di “{label}”",
  notifComment: "{actor} mengomentari “{label}”",
  notifUnknown: "Ada notifikasi baru",
  notifSettingsTitle: "Notifikasi",
  notifSettingsHint: "Pilih jenis pemberitahuan yang ditampilkan lonceng di header (notifikasi dalam aplikasi). Perubahan langsung disimpan.",
  notifSettingsFailed: "Pengaturan notifikasi tidak dapat disimpan",
  notifTypeAssigned: "Saat saya ditugaskan",
  notifTypeMentioned: "Saat saya disebut dalam komentar",
  notifTypeComment: "Saat item yang saya tangani mendapat komentar",
  notifTypeDueSoon: "Saat tugas saya mendekati tenggat",
  notifTypeOverdue: "Saat tugas saya melewati tenggat",
  notifTypeSprintStart: "Saat sprint dimulai",
  notifTypeSprintEnd: "Saat sprint selesai",
  notifTypeSurveillance: "Saat pemantauan AI menemukan masalah kritis (PO / SM)",
}
