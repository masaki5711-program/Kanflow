/**
 * i18n domain: admin metrics dashboard (`admin/metrics/`).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AdminMetricsTranslations {
  metricsAdminMenu: string
  metricsTitle: string
  metricsDescription: string
  metricsLoadFailed: string
  metricsUpdatedAt: string
  metricsRefresh: string
  metricsAutoRefresh: string
  metricsUptime: string
  metricsRequestsPerMin: string
  metricsErrorRate: string
  metricsP95: string
  metricsLast5m: string
  metricsDbLatency: string
  metricsDbDown: string
  metricsWorker: string
  metricsWorkerOk: string
  metricsWorkerStale: string
  metricsWorkerAbsent: string
  metricsWorkerInProcess: string
  metricsSecondsAgo: string
  metricsSlowRoutes: string
  metricsSlowRoutesEmpty: string
  metricsColRoute: string
  metricsColMethod: string
  metricsColCount: string
  metricsColErrors: string
  metricsColP50: string
  metricsColP95: string
  metricsColMax: string
  metricsAiQueue: string
  metricsAiActive: string
  metricsAiQueued: string
  metricsAiWaitP95: string
  metricsAiJobsQueued: string
  metricsAiJobsRunning: string
  metricsTranslationBacklog: string
  metricsTranslationPending: string
  metricsTranslationOldest: string
  metricsTrafficChart: string
  metricsHistoryEmpty: string
  metricsNotAvailable: string
  metricsProcessNote: string
}

export const ja: AdminMetricsTranslations = {
  metricsAdminMenu: "メトリクス",
  metricsTitle: "メトリクス",
  metricsDescription: "API の応答時間・エラー率、AI キュー、翻訳バックログ、ワーカー、DB の状態です。グラフは 5 分ごとのスナップショット（過去 24 時間）です。",
  metricsLoadFailed: "メトリクスの取得に失敗しました",
  metricsUpdatedAt: "更新: {time}",
  metricsRefresh: "再読み込み",
  metricsAutoRefresh: "表示中は 30 秒ごとに自動更新",
  metricsUptime: "稼働時間",
  metricsRequestsPerMin: "リクエスト / 分",
  metricsErrorRate: "エラー率 (5xx)",
  metricsP95: "応答時間 p95",
  metricsLast5m: "直近 5 分",
  metricsDbLatency: "DB 応答",
  metricsDbDown: "DB に接続できません",
  metricsWorker: "ワーカー",
  metricsWorkerOk: "稼働中",
  metricsWorkerStale: "応答なし",
  metricsWorkerAbsent: "停止",
  metricsWorkerInProcess: "Web 内で実行（別プロセス不要）",
  metricsSecondsAgo: "{sec} 秒前",
  metricsSlowRoutes: "遅いルート（p95 順）",
  metricsSlowRoutesEmpty: "まだリクエストが記録されていません。",
  metricsColRoute: "ルート",
  metricsColMethod: "メソッド",
  metricsColCount: "件数",
  metricsColErrors: "5xx",
  metricsColP50: "p50",
  metricsColP95: "p95",
  metricsColMax: "最大",
  metricsAiQueue: "AI キュー",
  metricsAiActive: "実行中",
  metricsAiQueued: "待機中",
  metricsAiWaitP95: "待ち時間 p95",
  metricsAiJobsQueued: "レポートジョブ待ち",
  metricsAiJobsRunning: "レポートジョブ実行中",
  metricsTranslationBacklog: "翻訳バックログ",
  metricsTranslationPending: "未翻訳",
  metricsTranslationOldest: "最古の待ち",
  metricsTrafficChart: "リクエスト数と p95（過去 24 時間）",
  metricsHistoryEmpty: "スナップショットはまだありません（5 分ごとに記録されます）。",
  metricsNotAvailable: "—",
  metricsProcessNote: "現在値はこの Web プロセス（PID {pid}）のものです。",
}

export const en: AdminMetricsTranslations = {
  metricsAdminMenu: "Metrics",
  metricsTitle: "Metrics",
  metricsDescription: "API latency and error rate, the AI queue, translation backlog, worker and database health. Charts show 5-minute snapshots of the last 24 hours.",
  metricsLoadFailed: "Could not load metrics",
  metricsUpdatedAt: "Updated {time}",
  metricsRefresh: "Refresh",
  metricsAutoRefresh: "Refreshes every 30 s while visible",
  metricsUptime: "Uptime",
  metricsRequestsPerMin: "Requests / min",
  metricsErrorRate: "Error rate (5xx)",
  metricsP95: "Latency p95",
  metricsLast5m: "last 5 min",
  metricsDbLatency: "DB latency",
  metricsDbDown: "Database unreachable",
  metricsWorker: "Worker",
  metricsWorkerOk: "Running",
  metricsWorkerStale: "Not responding",
  metricsWorkerAbsent: "Stopped",
  metricsWorkerInProcess: "Runs in the web app (no separate process)",
  metricsSecondsAgo: "{sec} s ago",
  metricsSlowRoutes: "Slowest routes (by p95)",
  metricsSlowRoutesEmpty: "No requests recorded yet.",
  metricsColRoute: "Route",
  metricsColMethod: "Method",
  metricsColCount: "Count",
  metricsColErrors: "5xx",
  metricsColP50: "p50",
  metricsColP95: "p95",
  metricsColMax: "Max",
  metricsAiQueue: "AI queue",
  metricsAiActive: "Running",
  metricsAiQueued: "Waiting",
  metricsAiWaitP95: "Wait p95",
  metricsAiJobsQueued: "Report jobs queued",
  metricsAiJobsRunning: "Report jobs running",
  metricsTranslationBacklog: "Translation backlog",
  metricsTranslationPending: "Pending",
  metricsTranslationOldest: "Oldest waiting",
  metricsTrafficChart: "Requests and p95 (last 24 h)",
  metricsHistoryEmpty: "No snapshots yet (one is recorded every 5 minutes).",
  metricsNotAvailable: "—",
  metricsProcessNote: "Live values are from this web process (PID {pid}).",
}

export const id: AdminMetricsTranslations = {
  metricsAdminMenu: "Metrik",
  metricsTitle: "Metrik",
  metricsDescription: "Waktu respons dan tingkat galat API, antrean AI, antrean terjemahan, worker, dan kondisi basis data. Grafik menampilkan cuplikan 5 menit selama 24 jam terakhir.",
  metricsLoadFailed: "Gagal memuat metrik",
  metricsUpdatedAt: "Diperbarui {time}",
  metricsRefresh: "Muat ulang",
  metricsAutoRefresh: "Diperbarui tiap 30 detik saat terlihat",
  metricsUptime: "Waktu aktif",
  metricsRequestsPerMin: "Permintaan / menit",
  metricsErrorRate: "Tingkat galat (5xx)",
  metricsP95: "Waktu respons p95",
  metricsLast5m: "5 menit terakhir",
  metricsDbLatency: "Respons DB",
  metricsDbDown: "Basis data tidak terjangkau",
  metricsWorker: "Worker",
  metricsWorkerOk: "Berjalan",
  metricsWorkerStale: "Tidak merespons",
  metricsWorkerAbsent: "Berhenti",
  metricsWorkerInProcess: "Berjalan di aplikasi web (tanpa proses terpisah)",
  metricsSecondsAgo: "{sec} detik lalu",
  metricsSlowRoutes: "Rute paling lambat (menurut p95)",
  metricsSlowRoutesEmpty: "Belum ada permintaan yang tercatat.",
  metricsColRoute: "Rute",
  metricsColMethod: "Metode",
  metricsColCount: "Jumlah",
  metricsColErrors: "5xx",
  metricsColP50: "p50",
  metricsColP95: "p95",
  metricsColMax: "Maks",
  metricsAiQueue: "Antrean AI",
  metricsAiActive: "Berjalan",
  metricsAiQueued: "Menunggu",
  metricsAiWaitP95: "Tunggu p95",
  metricsAiJobsQueued: "Tugas laporan menunggu",
  metricsAiJobsRunning: "Tugas laporan berjalan",
  metricsTranslationBacklog: "Antrean terjemahan",
  metricsTranslationPending: "Tertunda",
  metricsTranslationOldest: "Terlama menunggu",
  metricsTrafficChart: "Permintaan dan p95 (24 jam terakhir)",
  metricsHistoryEmpty: "Belum ada cuplikan (dicatat setiap 5 menit).",
  metricsNotAvailable: "—",
  metricsProcessNote: "Nilai langsung berasal dari proses web ini (PID {pid}).",
}
