/**
 * i18n domain: 教訓 (feedback loop, W11; components/feedback/, app/feedback/) — the Lessons screen:
 * lessons learned from reported failures, their states (draft / confirmed / systemized / retired),
 * the confirm / retire / systemize actions, the failure history of a signature and the dashboard numbers.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface FeedbackTranslations {
  feedbackTitle: string
  feedbackNav: string
  feedbackIntro: string
  feedbackLoadFailed: string
  feedbackEmpty: string
  feedbackSearchLabel: string
  feedbackSearchPlaceholder: string
  feedbackStateLabel: string
  feedbackStateAll: string
  feedbackStateDraft: string
  feedbackStateConfirmed: string
  feedbackStateSystemized: string
  feedbackStateRetired: string
  feedbackScopeGlobal: string
  feedbackScopeTech: string
  feedbackScopeProject: string
  feedbackHits: string
  feedbackLastSeen: string
  feedbackNeverSeen: string
  feedbackResolvedCount: string
  feedbackConfidentialBadge: string
  feedbackCause: string
  feedbackFix: string
  feedbackVerify: string
  feedbackEvidence: string
  feedbackSystemizedRefLabel: string
  feedbackNoFix: string
  feedbackConfirm: string
  feedbackRetire: string
  feedbackSystemize: string
  feedbackConfirmAria: string
  feedbackRetireAria: string
  feedbackSystemizeAria: string
  feedbackConfirmed: string
  feedbackRetired: string
  feedbackSystemized: string
  feedbackActionFailed: string
  feedbackRetireTitle: string
  feedbackRetireMessage: string
  feedbackSystemizeTitle: string
  feedbackSystemizeHint: string
  feedbackSystemizeKind: string
  feedbackKindPbi: string
  feedbackKindGate: string
  feedbackKindTest: string
  feedbackSystemizeRef: string
  feedbackSave: string
  feedbackCancel: string
  feedbackHistory: string
  feedbackHistoryShow: string
  feedbackHistoryEmpty: string
  feedbackHistoryLoadFailed: string
  feedbackHistoryResolved: string
  feedbackHistoryRepeat: string
  feedbackMetricsTitle: string
  feedbackMetricReports: string
  feedbackMetricRecurrence: string
  feedbackMetricResolveWith: string
  feedbackMetricResolveWithout: string
  feedbackMetricSystemized: string
  feedbackMetricMinutes: string
  feedbackMetricNone: string
  feedbackTopFailures: string
  feedbackTopCount: string
  feedbackNoLesson: string
  feedbackTruncated: string
}

export const ja: FeedbackTranslations = {
  feedbackTitle: "教訓（フィードバックの輪）",
  feedbackNav: "教訓",
  feedbackIntro: "AI やCI が報告した失敗と、その直し方の記録です。保守担当・SM が確認した教訓だけが、AI セッションに返されます。",
  feedbackLoadFailed: "教訓を読み込めませんでした",
  feedbackEmpty: "該当する教訓はありません",
  feedbackSearchLabel: "検索",
  feedbackSearchPlaceholder: "症状・直し方・エラーコード",
  feedbackStateLabel: "状態",
  feedbackStateAll: "すべて",
  feedbackStateDraft: "下書き",
  feedbackStateConfirmed: "確認済み",
  feedbackStateSystemized: "仕組み化済み",
  feedbackStateRetired: "廃止",
  feedbackScopeGlobal: "全体",
  feedbackScopeTech: "技術: {name}",
  feedbackScopeProject: "プロジェクト: {id}",
  feedbackHits: "{n} 回",
  feedbackLastSeen: "最後に見た日: {date}",
  feedbackNeverSeen: "まだ見ていません",
  feedbackResolvedCount: "解決 {n} 回",
  feedbackConfidentialBadge: "機密（AI には返しません）",
  feedbackCause: "原因",
  feedbackFix: "直し方",
  feedbackVerify: "確かめるコマンド",
  feedbackEvidence: "根拠",
  feedbackSystemizedRefLabel: "仕組み化: {ref}",
  feedbackNoFix: "直し方はまだありません",
  feedbackConfirm: "確認する",
  feedbackRetire: "廃止する",
  feedbackSystemize: "仕組み化する",
  feedbackConfirmAria: "教訓を確認する: {symptom}",
  feedbackRetireAria: "教訓を廃止する: {symptom}",
  feedbackSystemizeAria: "教訓を仕組み化する: {symptom}",
  feedbackConfirmed: "教訓を確認しました",
  feedbackRetired: "教訓を廃止しました",
  feedbackSystemized: "教訓を仕組み化済みにしました",
  feedbackActionFailed: "教訓を更新できませんでした",
  feedbackRetireTitle: "教訓を廃止しますか？",
  feedbackRetireMessage: "廃止すると AI セッションには返しません。あとから「確認する」で戻せます。",
  feedbackSystemizeTitle: "仕組み化の記録",
  feedbackSystemizeHint: "この教訓を防ぐ PBI・ゲート・テストへのリンクが必要です",
  feedbackSystemizeKind: "種類",
  feedbackKindPbi: "PBI",
  feedbackKindGate: "ゲート",
  feedbackKindTest: "テスト",
  feedbackSystemizeRef: "リンクまたは名前",
  feedbackSave: "保存",
  feedbackCancel: "キャンセル",
  feedbackHistory: "この署名の失敗の履歴",
  feedbackHistoryShow: "履歴を見る",
  feedbackHistoryEmpty: "表示できる失敗はありません",
  feedbackHistoryLoadFailed: "履歴を読み込めませんでした",
  feedbackHistoryResolved: "解決: {summary}",
  feedbackHistoryRepeat: "{n} 件をまとめて記録",
  feedbackMetricsTitle: "直近 {days} 日の集計",
  feedbackMetricReports: "失敗の報告",
  feedbackMetricRecurrence: "再発率（2 回目以降 / 全体）",
  feedbackMetricResolveWith: "解決までの時間（教訓あり）",
  feedbackMetricResolveWithout: "解決までの時間（教訓なし）",
  feedbackMetricSystemized: "仕組み化の割合",
  feedbackMetricMinutes: "{n} 分（{count} 件）",
  feedbackMetricNone: "データなし",
  feedbackTopFailures: "よく起きる失敗",
  feedbackTopCount: "{n} 回",
  feedbackNoLesson: "教訓なし",
  feedbackTruncated: "件数が多いため一部だけ表示しています。検索で絞り込んでください",
}

export const en: FeedbackTranslations = {
  feedbackTitle: "Lessons (feedback loop)",
  feedbackNav: "Lessons",
  feedbackIntro: "Failures reported by AI sessions and CI, and how they were fixed. Only lessons a maintainer or SM has confirmed are given back to AI sessions.",
  feedbackLoadFailed: "Could not load the lessons",
  feedbackEmpty: "No lessons match",
  feedbackSearchLabel: "Search",
  feedbackSearchPlaceholder: "Symptom, fix or error code",
  feedbackStateLabel: "State",
  feedbackStateAll: "All",
  feedbackStateDraft: "Draft",
  feedbackStateConfirmed: "Confirmed",
  feedbackStateSystemized: "Systemized",
  feedbackStateRetired: "Retired",
  feedbackScopeGlobal: "Global",
  feedbackScopeTech: "Tech: {name}",
  feedbackScopeProject: "Project: {id}",
  feedbackHits: "{n} hits",
  feedbackLastSeen: "Last seen: {date}",
  feedbackNeverSeen: "Not seen yet",
  feedbackResolvedCount: "{n} fixes",
  feedbackConfidentialBadge: "Confidential (never shown to AI)",
  feedbackCause: "Cause",
  feedbackFix: "Fix",
  feedbackVerify: "Verify with",
  feedbackEvidence: "Evidence",
  feedbackSystemizedRefLabel: "Systemized as: {ref}",
  feedbackNoFix: "No fix yet",
  feedbackConfirm: "Confirm",
  feedbackRetire: "Retire",
  feedbackSystemize: "Systemize",
  feedbackConfirmAria: "Confirm lesson: {symptom}",
  feedbackRetireAria: "Retire lesson: {symptom}",
  feedbackSystemizeAria: "Systemize lesson: {symptom}",
  feedbackConfirmed: "Lesson confirmed",
  feedbackRetired: "Lesson retired",
  feedbackSystemized: "Lesson marked as systemized",
  feedbackActionFailed: "Could not update the lesson",
  feedbackRetireTitle: "Retire this lesson?",
  feedbackRetireMessage: "It will no longer be given to AI sessions. You can bring it back with Confirm.",
  feedbackSystemizeTitle: "Record the systemization",
  feedbackSystemizeHint: "A link to the PBI, gate or test that now guards against this is required",
  feedbackSystemizeKind: "Kind",
  feedbackKindPbi: "PBI",
  feedbackKindGate: "Gate",
  feedbackKindTest: "Test",
  feedbackSystemizeRef: "Link or name",
  feedbackSave: "Save",
  feedbackCancel: "Cancel",
  feedbackHistory: "Failure history of this signature",
  feedbackHistoryShow: "Show history",
  feedbackHistoryEmpty: "No failures to show",
  feedbackHistoryLoadFailed: "Could not load the history",
  feedbackHistoryResolved: "Fixed: {summary}",
  feedbackHistoryRepeat: "{n} reports folded",
  feedbackMetricsTitle: "Last {days} days",
  feedbackMetricReports: "Failure reports",
  feedbackMetricRecurrence: "Recurrence rate (2nd or later / all)",
  feedbackMetricResolveWith: "Time to resolve (with a lesson)",
  feedbackMetricResolveWithout: "Time to resolve (no lesson)",
  feedbackMetricSystemized: "Systemized share",
  feedbackMetricMinutes: "{n} min ({count})",
  feedbackMetricNone: "No data",
  feedbackTopFailures: "Most frequent failures",
  feedbackTopCount: "{n} times",
  feedbackNoLesson: "no lesson",
  feedbackTruncated: "Only part of the list is shown. Narrow it down with the search",
}

export const id: FeedbackTranslations = {
  feedbackTitle: "Pelajaran (siklus umpan balik)",
  feedbackNav: "Pelajaran",
  feedbackIntro: "Kegagalan yang dilaporkan sesi AI dan CI beserta cara memperbaikinya. Hanya pelajaran yang dikonfirmasi pemelihara atau SM yang diberikan kembali ke sesi AI.",
  feedbackLoadFailed: "Pelajaran tidak dapat dimuat",
  feedbackEmpty: "Tidak ada pelajaran yang cocok",
  feedbackSearchLabel: "Cari",
  feedbackSearchPlaceholder: "Gejala, perbaikan atau kode error",
  feedbackStateLabel: "Status",
  feedbackStateAll: "Semua",
  feedbackStateDraft: "Draf",
  feedbackStateConfirmed: "Terkonfirmasi",
  feedbackStateSystemized: "Tersistem",
  feedbackStateRetired: "Dihentikan",
  feedbackScopeGlobal: "Global",
  feedbackScopeTech: "Teknologi: {name}",
  feedbackScopeProject: "Proyek: {id}",
  feedbackHits: "{n} kali",
  feedbackLastSeen: "Terakhir terlihat: {date}",
  feedbackNeverSeen: "Belum terlihat",
  feedbackResolvedCount: "{n} perbaikan",
  feedbackConfidentialBadge: "Rahasia (tidak diberikan ke AI)",
  feedbackCause: "Penyebab",
  feedbackFix: "Perbaikan",
  feedbackVerify: "Verifikasi dengan",
  feedbackEvidence: "Bukti",
  feedbackSystemizedRefLabel: "Disistemkan sebagai: {ref}",
  feedbackNoFix: "Belum ada perbaikan",
  feedbackConfirm: "Konfirmasi",
  feedbackRetire: "Hentikan",
  feedbackSystemize: "Sistemkan",
  feedbackConfirmAria: "Konfirmasi pelajaran: {symptom}",
  feedbackRetireAria: "Hentikan pelajaran: {symptom}",
  feedbackSystemizeAria: "Sistemkan pelajaran: {symptom}",
  feedbackConfirmed: "Pelajaran dikonfirmasi",
  feedbackRetired: "Pelajaran dihentikan",
  feedbackSystemized: "Pelajaran ditandai tersistem",
  feedbackActionFailed: "Pelajaran tidak dapat diperbarui",
  feedbackRetireTitle: "Hentikan pelajaran ini?",
  feedbackRetireMessage: "Tidak akan diberikan lagi ke sesi AI. Dapat dikembalikan dengan Konfirmasi.",
  feedbackSystemizeTitle: "Catat sistematisasi",
  feedbackSystemizeHint: "Diperlukan tautan ke PBI, gate, atau tes yang kini mencegah hal ini",
  feedbackSystemizeKind: "Jenis",
  feedbackKindPbi: "PBI",
  feedbackKindGate: "Gate",
  feedbackKindTest: "Tes",
  feedbackSystemizeRef: "Tautan atau nama",
  feedbackSave: "Simpan",
  feedbackCancel: "Batal",
  feedbackHistory: "Riwayat kegagalan tanda tangan ini",
  feedbackHistoryShow: "Lihat riwayat",
  feedbackHistoryEmpty: "Tidak ada kegagalan untuk ditampilkan",
  feedbackHistoryLoadFailed: "Riwayat tidak dapat dimuat",
  feedbackHistoryResolved: "Diperbaiki: {summary}",
  feedbackHistoryRepeat: "{n} laporan digabung",
  feedbackMetricsTitle: "{days} hari terakhir",
  feedbackMetricReports: "Laporan kegagalan",
  feedbackMetricRecurrence: "Tingkat kekambuhan (ke-2 dst / semua)",
  feedbackMetricResolveWith: "Waktu penyelesaian (dengan pelajaran)",
  feedbackMetricResolveWithout: "Waktu penyelesaian (tanpa pelajaran)",
  feedbackMetricSystemized: "Porsi tersistem",
  feedbackMetricMinutes: "{n} mnt ({count})",
  feedbackMetricNone: "Tidak ada data",
  feedbackTopFailures: "Kegagalan tersering",
  feedbackTopCount: "{n} kali",
  feedbackNoLesson: "tanpa pelajaran",
  feedbackTruncated: "Hanya sebagian daftar yang ditampilkan. Persempit dengan pencarian",
}
