/**
 * i18n domain: in-app notifications — header bell / panel
 * (`components/notifications/`) and the notification settings on /me.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {count} {actor} {label} {sprint} {start} {end} {date} {title} {kind}.
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
  notifAiReportReady: string
  notifAiReportFailed: string
  notifImprovementCheckDue: string
  notifMentioned: string
  notifComment: string
  notifUnknown: string
  notifSettingsTitle: string
  notifSettingsHint: string
  notifSettingsFailed: string
  desktopNotifyTitle: string
  desktopNotifyHint: string
  desktopNotifyEnable: string
  desktopNotifyDisable: string
  desktopNotifyOn: string
  desktopNotifyBlocked: string
  desktopNotifyUnsupported: string
  desktopNotifyChat: string
  desktopNotifyChatFrom: string
  notifTypeAssigned: string
  notifTypeMentioned: string
  notifTypeComment: string
  notifTypeDueSoon: string
  notifTypeOverdue: string
  notifTypeSprintStart: string
  notifTypeSprintEnd: string
  notifTypeSurveillance: string
  notifTypeAiReportReady: string
  notifTypeAiReportFailed: string
  notifTypeImprovementCheckDue: string
  notifTabsLabel: string
  notifTabAll: string
  notifTabPersonal: string
  notifTabOther: string
  notifMentionTag: string
  notifEmptyPersonal: string
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
  notifAiReportReady: "AI レポート「{title}」ができました",
  notifAiReportFailed: "AI レポート（{kind}）を生成できませんでした",
  notifImprovementCheckDue: "定着確認の期限です：{label}（{kind}・{date}）",
  notifMentioned: "{actor} さんが「{label}」のコメントであなたをメンションしました",
  notifComment: "{actor} さんが「{label}」にコメントしました",
  notifUnknown: "新しいお知らせがあります",
  notifSettingsTitle: "通知設定",
  notifSettingsHint: "ヘッダーのベル（アプリ内通知）で受け取る種類を選べます。変更はすぐに保存されます。",
  notifSettingsFailed: "通知設定を保存できませんでした",
  desktopNotifyTitle: "デスクトップ通知",
  desktopNotifyHint: "Kanflow を別のタブやアプリの陰で開いている間に、新しい通知やチャットをデスクトップに表示します。この端末のこのブラウザだけの設定です。",
  desktopNotifyEnable: "通知をオンにする",
  desktopNotifyDisable: "通知をオフにする",
  desktopNotifyOn: "オン（通知は Kanflow のタブを開いている間だけ届きます）",
  desktopNotifyBlocked: "ブラウザで通知がブロックされています。アドレスバーの鍵アイコンから通知を許可してください。",
  desktopNotifyUnsupported: "このブラウザはデスクトップ通知に対応していません。",
  desktopNotifyChat: "新しいチャットメッセージ",
  desktopNotifyChatFrom: "{name} さんからチャットが届きました",
  notifTypeAssigned: "担当者に設定されたとき",
  notifTypeMentioned: "コメントでメンションされたとき",
  notifTypeComment: "担当している項目にコメントが付いたとき",
  notifTypeDueSoon: "担当タスクの期限が近いとき",
  notifTypeOverdue: "担当タスクの期限を過ぎたとき",
  notifTypeSprintStart: "スプリントが始まったとき",
  notifTypeSprintEnd: "スプリントが終了したとき",
  notifTypeSurveillance: "AI 監視で重大な異常が見つかったとき（PO / SM）",
  notifTypeAiReportReady: "依頼した AI レポートができたとき",
  notifTypeAiReportFailed: "依頼した AI レポートの生成に失敗したとき",
  notifTypeImprovementCheckDue: "改善成果の定着確認の期限が来たとき（改善オーナー）",
  notifTabsLabel: "通知の絞り込み",
  notifTabAll: "すべて",
  notifTabPersonal: "メンション・自分宛",
  notifTabOther: "その他",
  notifMentionTag: "メンション",
  notifEmptyPersonal: "自分宛の新しい通知はありません",
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
  notifAiReportReady: "Your AI report “{title}” is ready",
  notifAiReportFailed: "Your AI report ({kind}) could not be generated",
  notifImprovementCheckDue: "A sustainment check is due: {label} ({kind}, {date})",
  notifMentioned: "{actor} mentioned you in a comment on “{label}”",
  notifComment: "{actor} commented on “{label}”",
  notifUnknown: "You have a new notification",
  notifSettingsTitle: "Notifications",
  notifSettingsHint: "Choose what the header bell (in-app notifications) tells you about. Changes are saved immediately.",
  notifSettingsFailed: "Could not save the notification settings",
  desktopNotifyTitle: "Desktop notifications",
  desktopNotifyHint: "Show new notifications and chat messages on your desktop while Kanflow is open behind another tab or app. This applies to this browser on this device only.",
  desktopNotifyEnable: "Turn on notifications",
  desktopNotifyDisable: "Turn off notifications",
  desktopNotifyOn: "On (notifications arrive only while a Kanflow tab is open)",
  desktopNotifyBlocked: "Notifications are blocked in your browser. Allow them from the lock icon in the address bar.",
  desktopNotifyUnsupported: "This browser does not support desktop notifications.",
  desktopNotifyChat: "New chat message",
  desktopNotifyChatFrom: "New chat message from {name}",
  notifTypeAssigned: "When I am assigned",
  notifTypeMentioned: "When I am mentioned in a comment",
  notifTypeComment: "When an item I am responsible for gets a comment",
  notifTypeDueSoon: "When my task is due soon",
  notifTypeOverdue: "When my task is overdue",
  notifTypeSprintStart: "When a sprint starts",
  notifTypeSprintEnd: "When a sprint ends",
  notifTypeSurveillance: "When AI surveillance finds a critical issue (PO / SM)",
  notifTypeAiReportReady: "When an AI report I requested is ready",
  notifTypeAiReportFailed: "When an AI report I requested fails",
  notifTypeImprovementCheckDue: "When a sustainment check of an improvement is due (improvement owner)",
  notifTabsLabel: "Filter notifications",
  notifTabAll: "All",
  notifTabPersonal: "Mentions & for me",
  notifTabOther: "Other",
  notifMentionTag: "Mention",
  notifEmptyPersonal: "Nothing addressed to you",
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
  notifAiReportReady: "Laporan AI “{title}” sudah siap",
  notifAiReportFailed: "Laporan AI ({kind}) tidak dapat dibuat",
  notifImprovementCheckDue: "Pengecekan keberlanjutan jatuh tempo: {label} ({kind}, {date})",
  notifMentioned: "{actor} menyebut Anda dalam komentar di “{label}”",
  notifComment: "{actor} mengomentari “{label}”",
  notifUnknown: "Ada notifikasi baru",
  notifSettingsTitle: "Notifikasi",
  notifSettingsHint: "Pilih jenis pemberitahuan yang ditampilkan lonceng di header (notifikasi dalam aplikasi). Perubahan langsung disimpan.",
  notifSettingsFailed: "Pengaturan notifikasi tidak dapat disimpan",
  desktopNotifyTitle: "Notifikasi desktop",
  desktopNotifyHint: "Tampilkan notifikasi dan pesan chat baru di desktop saat Kanflow terbuka di balik tab atau aplikasi lain. Hanya berlaku untuk browser ini di perangkat ini.",
  desktopNotifyEnable: "Aktifkan notifikasi",
  desktopNotifyDisable: "Matikan notifikasi",
  desktopNotifyOn: "Aktif (notifikasi hanya masuk saat tab Kanflow terbuka)",
  desktopNotifyBlocked: "Notifikasi diblokir di browser. Izinkan lewat ikon gembok di address bar.",
  desktopNotifyUnsupported: "Browser ini tidak mendukung notifikasi desktop.",
  desktopNotifyChat: "Pesan chat baru",
  desktopNotifyChatFrom: "Pesan chat baru dari {name}",
  notifTypeAssigned: "Saat saya ditugaskan",
  notifTypeMentioned: "Saat saya disebut dalam komentar",
  notifTypeComment: "Saat item yang saya tangani mendapat komentar",
  notifTypeDueSoon: "Saat tugas saya mendekati tenggat",
  notifTypeOverdue: "Saat tugas saya melewati tenggat",
  notifTypeSprintStart: "Saat sprint dimulai",
  notifTypeSprintEnd: "Saat sprint selesai",
  notifTypeSurveillance: "Saat pemantauan AI menemukan masalah kritis (PO / SM)",
  notifTypeAiReportReady: "Saat laporan AI yang saya minta sudah siap",
  notifTypeAiReportFailed: "Saat laporan AI yang saya minta gagal dibuat",
  notifTypeImprovementCheckDue: "Saat pengecekan keberlanjutan perbaikan jatuh tempo (pemilik perbaikan)",
  notifTabsLabel: "Saring notifikasi",
  notifTabAll: "Semua",
  notifTabPersonal: "Sebutan & untuk saya",
  notifTabOther: "Lainnya",
  notifMentionTag: "Sebutan",
  notifEmptyPersonal: "Tidak ada notifikasi untuk Anda",
}
