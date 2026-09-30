/**
 * i18n domain: P3 AI extensions — chat history (thread list on the chat
 * page), background AI report jobs (dashboard button chip + reports panel)
 * and the per-project AI surveillance settings (project settings page).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {title} {min} {max} {pct} {name} {count}.
 */
export interface AiExtensionsTranslations {
  // Chat history
  chatThreadsTitle: string
  chatThreadsPrivate: string
  chatNewChat: string
  chatThreadsEmpty: string
  chatThreadsLoadFailed: string
  chatThreadLoadFailed: string
  chatThreadsMore: string
  chatThreadsShow: string
  chatThreadsHide: string
  chatThreadActions: string
  chatThreadRename: string
  chatThreadRenameLabel: string
  chatThreadSave: string
  chatThreadCancel: string
  chatThreadDelete: string
  chatThreadDeleteTitle: string
  chatThreadDeleteConfirm: string
  chatThreadActionFailed: string
  chatThreadCurrent: string
  chatThreadUntitled: string
  // Background AI report jobs
  aiJobStarted: string
  aiJobAlreadyRunning: string
  aiJobStartFailed: string
  aiJobDone: string
  aiJobFailed: string
  aiJobStatusQueued: string
  aiJobStatusRunning: string
  aiJobStatusDone: string
  aiJobStatusFailed: string
  aiJobStatusCancelled: string
  aiJobProgress: string
  aiJobInProgressTitle: string
  aiJobKindProgressReport: string
  aiJobKindSprintReview: string
  aiJobCancel: string
  aiJobCancelFailed: string
  aiJobRequestedBy: string
  // Surveillance settings
  survTitle: string
  survHint: string
  survEnabled: string
  survDisabledNote: string
  survStalledDays: string
  survStalledDaysHint: string
  survStalledTasks: string
  survStalledTasksHint: string
  survCheckDailyScrum: string
  survDailyScrumDays: string
  survDailyScrumDaysHint: string
  survOverCapacity: string
  survOverCapacityHint: string
  survOverdueGrace: string
  survOverdueGraceHint: string
  survNotifyCritical: string
  survRangeError: string
  survResetDefaults: string
  survLoadFailed: string
}

export const ja: AiExtensionsTranslations = {
  chatThreadsTitle: "チャット履歴",
  chatThreadsPrivate: "履歴はあなたにだけ表示されます",
  chatNewChat: "新しいチャット",
  chatThreadsEmpty: "保存されたチャットはまだありません",
  chatThreadsLoadFailed: "チャット履歴を取得できませんでした",
  chatThreadLoadFailed: "チャットを開けませんでした",
  chatThreadsMore: "さらに表示",
  chatThreadsShow: "履歴を表示",
  chatThreadsHide: "履歴を閉じる",
  chatThreadActions: "「{title}」の操作",
  chatThreadRename: "名前を変更",
  chatThreadRenameLabel: "チャット名",
  chatThreadSave: "保存",
  chatThreadCancel: "キャンセル",
  chatThreadDelete: "削除",
  chatThreadDeleteTitle: "チャットを削除",
  chatThreadDeleteConfirm: "「{title}」を削除しますか？ 30 日後に完全に削除されます。",
  chatThreadActionFailed: "チャット履歴を更新できませんでした",
  chatThreadCurrent: "表示中",
  chatThreadUntitled: "（無題のチャット）",
  aiJobStarted: "バックグラウンドで生成中…完了したら通知でお知らせします",
  aiJobAlreadyRunning: "同じレポートを生成中です。完了したら通知でお知らせします",
  aiJobStartFailed: "レポートの生成を開始できませんでした",
  aiJobDone: "AI レポートができました",
  aiJobFailed: "AI レポートを生成できませんでした",
  aiJobStatusQueued: "待機中",
  aiJobStatusRunning: "生成中",
  aiJobStatusDone: "完了",
  aiJobStatusFailed: "失敗",
  aiJobStatusCancelled: "キャンセル済み",
  aiJobProgress: "{pct}%",
  aiJobInProgressTitle: "生成中のレポート",
  aiJobKindProgressReport: "進捗レポート",
  aiJobKindSprintReview: "スプリント完了レビュー",
  aiJobCancel: "キャンセル",
  aiJobCancelFailed: "キャンセルできませんでした",
  aiJobRequestedBy: "{name} さんが依頼",
  survTitle: "AI 監視",
  survHint: "毎日の AI 監視で使う検知のしきい値です。変更は次回の監視から反映されます。PO と管理者が変更できます。",
  survEnabled: "このプロジェクトを AI 監視の対象にする",
  survDisabledNote: "対象外の間は、このプロジェクトの監視レポートは作成されません。",
  survStalledDays: "停滞とみなす日数",
  survStalledDaysHint: "進行中のタスクがこの日数以上更新されないと停滞とみなします（{min}〜{max} 日）",
  survStalledTasks: "停滞タスクの警告件数",
  survStalledTasksHint: "1 つのスプリントで停滞タスクがこの件数以上になると警告します（{min}〜{max} 件）",
  survCheckDailyScrum: "デイリースクラムの記録を確認する",
  survDailyScrumDays: "デイリースクラム未記録の警告日数",
  survDailyScrumDaysHint: "最後の記録からこの日数以上経つと警告します（{min}〜{max} 日）",
  survOverCapacity: "キャパシティ超過の許容率（%）",
  survOverCapacityHint: "投入ポイントがキャパシティをこの割合まで超えても警告しません（{min}〜{max}%）",
  survOverdueGrace: "スプリント期限超過の猶予日数",
  survOverdueGraceHint: "終了日からこの日数を過ぎても未完了タスクが残ると重大として扱います（{min}〜{max} 日）",
  survNotifyCritical: "重大な異常を PO / SM に通知する",
  survRangeError: "{min}〜{max} の整数を入力してください",
  survResetDefaults: "既定値に戻す",
  survLoadFailed: "AI 監視の設定を取得できませんでした",
}

export const en: AiExtensionsTranslations = {
  chatThreadsTitle: "Chat history",
  chatThreadsPrivate: "Only you can see your history",
  chatNewChat: "New chat",
  chatThreadsEmpty: "No saved chats yet",
  chatThreadsLoadFailed: "Could not load the chat history",
  chatThreadLoadFailed: "Could not open the chat",
  chatThreadsMore: "Show more",
  chatThreadsShow: "Show history",
  chatThreadsHide: "Hide history",
  chatThreadActions: "Actions for “{title}”",
  chatThreadRename: "Rename",
  chatThreadRenameLabel: "Chat name",
  chatThreadSave: "Save",
  chatThreadCancel: "Cancel",
  chatThreadDelete: "Delete",
  chatThreadDeleteTitle: "Delete chat",
  chatThreadDeleteConfirm: "Delete “{title}”? It is removed permanently after 30 days.",
  chatThreadActionFailed: "Could not update the chat history",
  chatThreadCurrent: "Open",
  chatThreadUntitled: "(untitled chat)",
  aiJobStarted: "Generating in the background… you will get a notification when it is ready",
  aiJobAlreadyRunning: "This report is already being generated. You will get a notification when it is ready",
  aiJobStartFailed: "Could not start the report",
  aiJobDone: "Your AI report is ready",
  aiJobFailed: "The AI report could not be generated",
  aiJobStatusQueued: "Queued",
  aiJobStatusRunning: "Generating",
  aiJobStatusDone: "Done",
  aiJobStatusFailed: "Failed",
  aiJobStatusCancelled: "Cancelled",
  aiJobProgress: "{pct}%",
  aiJobInProgressTitle: "Reports in progress",
  aiJobKindProgressReport: "Progress report",
  aiJobKindSprintReview: "Sprint completion review",
  aiJobCancel: "Cancel",
  aiJobCancelFailed: "Could not cancel",
  aiJobRequestedBy: "Requested by {name}",
  survTitle: "AI surveillance",
  survHint: "Thresholds of the daily AI surveillance run. Changes apply from the next run. The PO and admins can change them.",
  survEnabled: "Include this project in AI surveillance",
  survDisabledNote: "While excluded, no surveillance reports are created for this project.",
  survStalledDays: "Days until a task counts as stalled",
  survStalledDaysHint: "An in-progress task not updated for this many days is stalled ({min}–{max} days)",
  survStalledTasks: "Stalled tasks before a warning",
  survStalledTasksHint: "Warn when one sprint has at least this many stalled tasks ({min}–{max})",
  survCheckDailyScrum: "Check daily scrum notes",
  survDailyScrumDays: "Days without daily scrum before a warning",
  survDailyScrumDaysHint: "Warn when the last note is at least this many days old ({min}–{max} days)",
  survOverCapacity: "Allowed over-capacity (%)",
  survOverCapacityHint: "Committed points may exceed the capacity by this much without a warning ({min}–{max}%)",
  survOverdueGrace: "Grace days after the sprint end",
  survOverdueGraceHint: "An open sprint with unfinished tasks is critical once this many days past its end date ({min}–{max} days)",
  survNotifyCritical: "Notify the PO / SM of critical issues",
  survRangeError: "Enter a whole number from {min} to {max}",
  survResetDefaults: "Reset to defaults",
  survLoadFailed: "Could not load the AI surveillance settings",
}

export const id: AiExtensionsTranslations = {
  chatThreadsTitle: "Riwayat chat",
  chatThreadsPrivate: "Hanya Anda yang dapat melihat riwayat Anda",
  chatNewChat: "Chat baru",
  chatThreadsEmpty: "Belum ada chat yang tersimpan",
  chatThreadsLoadFailed: "Riwayat chat tidak dapat dimuat",
  chatThreadLoadFailed: "Chat tidak dapat dibuka",
  chatThreadsMore: "Tampilkan lebih banyak",
  chatThreadsShow: "Tampilkan riwayat",
  chatThreadsHide: "Tutup riwayat",
  chatThreadActions: "Tindakan untuk “{title}”",
  chatThreadRename: "Ganti nama",
  chatThreadRenameLabel: "Nama chat",
  chatThreadSave: "Simpan",
  chatThreadCancel: "Batal",
  chatThreadDelete: "Hapus",
  chatThreadDeleteTitle: "Hapus chat",
  chatThreadDeleteConfirm: "Hapus “{title}”? Chat dihapus permanen setelah 30 hari.",
  chatThreadActionFailed: "Riwayat chat tidak dapat diperbarui",
  chatThreadCurrent: "Dibuka",
  chatThreadUntitled: "(chat tanpa judul)",
  aiJobStarted: "Sedang dibuat di latar belakang… Anda akan menerima notifikasi setelah selesai",
  aiJobAlreadyRunning: "Laporan ini sedang dibuat. Anda akan menerima notifikasi setelah selesai",
  aiJobStartFailed: "Pembuatan laporan tidak dapat dimulai",
  aiJobDone: "Laporan AI Anda sudah siap",
  aiJobFailed: "Laporan AI tidak dapat dibuat",
  aiJobStatusQueued: "Menunggu",
  aiJobStatusRunning: "Sedang dibuat",
  aiJobStatusDone: "Selesai",
  aiJobStatusFailed: "Gagal",
  aiJobStatusCancelled: "Dibatalkan",
  aiJobProgress: "{pct}%",
  aiJobInProgressTitle: "Laporan yang sedang dibuat",
  aiJobKindProgressReport: "Laporan progres",
  aiJobKindSprintReview: "Tinjauan penyelesaian sprint",
  aiJobCancel: "Batalkan",
  aiJobCancelFailed: "Tidak dapat dibatalkan",
  aiJobRequestedBy: "Diminta oleh {name}",
  survTitle: "Pemantauan AI",
  survHint: "Ambang batas pemantauan AI harian. Perubahan berlaku mulai pemantauan berikutnya. PO dan admin dapat mengubahnya.",
  survEnabled: "Sertakan proyek ini dalam pemantauan AI",
  survDisabledNote: "Selama tidak disertakan, laporan pemantauan untuk proyek ini tidak dibuat.",
  survStalledDays: "Hari sampai tugas dianggap macet",
  survStalledDaysHint: "Tugas yang sedang dikerjakan dan tidak diperbarui selama jumlah hari ini dianggap macet ({min}–{max} hari)",
  survStalledTasks: "Jumlah tugas macet sebelum peringatan",
  survStalledTasksHint: "Beri peringatan jika satu sprint memiliki setidaknya sebanyak ini tugas macet ({min}–{max})",
  survCheckDailyScrum: "Periksa catatan daily scrum",
  survDailyScrumDays: "Hari tanpa daily scrum sebelum peringatan",
  survDailyScrumDaysHint: "Beri peringatan jika catatan terakhir setidaknya berumur sebanyak ini hari ({min}–{max} hari)",
  survOverCapacity: "Batas kelebihan kapasitas (%)",
  survOverCapacityHint: "Poin yang dimasukkan boleh melebihi kapasitas sebesar ini tanpa peringatan ({min}–{max}%)",
  survOverdueGrace: "Hari tenggang setelah akhir sprint",
  survOverdueGraceHint: "Sprint terbuka dengan tugas belum selesai dianggap kritis setelah lewat sebanyak ini hari dari tanggal akhirnya ({min}–{max} hari)",
  survNotifyCritical: "Beri tahu PO / SM tentang masalah kritis",
  survRangeError: "Masukkan bilangan bulat dari {min} sampai {max}",
  survResetDefaults: "Kembalikan ke bawaan",
  survLoadFailed: "Pengaturan pemantauan AI tidak dapat dimuat",
}
