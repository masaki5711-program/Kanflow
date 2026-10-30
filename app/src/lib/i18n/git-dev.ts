/**
 * i18n domain: GitLab development info on PBIs (components/git-dev/) — the
 * 「開発」 panel of the PBI detail and the MR / pipeline badges on task and
 * PBI cards. Settings and the Git page live in ./git.ts.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GitDevTranslations {
  gitDevTitle: string
  gitDevCopyKey: string
  gitDevCopyBranch: string
  gitDevCopyCommand: string
  gitDevBranchLabel: string
  gitDevCopied: string
  gitDevCopyFailed: string
  gitDevSync: string
  gitDevSynced: string
  gitDevSyncPartial: string
  gitDevSyncTooSoon: string
  gitDevSyncFailed: string
  gitDevLoadFailed: string
  gitDevSectionMrs: string
  gitDevSectionBranches: string
  gitDevBranchGone: string
  gitDevBranchGoneTitle: string
  gitDevSectionCommits: string
  gitDevMrOpened: string
  gitDevMrMerged: string
  gitDevMrClosed: string
  gitDevPipeline: string
  gitDevPipelineSuccess: string
  gitDevPipelineFailed: string
  gitDevPipelineRunning: string
  gitDevPipelinePending: string
  gitDevPipelineCanceled: string
  gitDevPipelineSkipped: string
  gitDevPipelineManual: string
  gitDevOpenInGitLab: string
  gitDevShowMore: string
  gitDevEmpty: string
  gitDevEmptyHint: string
  gitDevNoRepos: string
  gitDevBadgeOpenMrs: string
  gitDevBadgeMerged: string
  gitDevBadgeBranches: string
  gitNavBadge: string
  gitDevBadgeShortOpen: string
  gitDevBadgeShortMerged: string
  gitDevBadgeShortBranches: string
  gitDevListSeparator: string
}

export const ja: GitDevTranslations = {
  gitDevTitle: "開発",
  gitDevCopyKey: "{key} をコピー",
  gitDevCopyBranch: "ブランチ名をコピー",
  gitDevCopyCommand: "コマンドをコピー",
  gitDevBranchLabel: "ブランチを作るとき",
  gitDevCopied: "コピーしました",
  gitDevCopyFailed: "コピーできませんでした",
  gitDevSync: "今すぐ更新",
  gitDevSynced: "GitLab の最新の情報を取り込みました",
  gitDevSyncPartial: "一部のリポジトリを更新できませんでした。設定画面でエラー内容を確認してください",
  gitDevSyncTooSoon: "少し前に更新したばかりです。20 秒ほど待ってからもう一度お試しください",
  gitDevSyncFailed: "更新できませんでした",
  gitDevLoadFailed: "開発情報を読み込めませんでした",
  gitDevSectionMrs: "マージリクエスト",
  gitDevSectionBranches: "ブランチ",
  gitDevBranchGone: "削除済み",
  gitDevBranchGoneTitle: "GitLab でこのブランチが削除されました（{date}）",
  gitDevSectionCommits: "コミット",
  gitDevMrOpened: "オープン",
  gitDevMrMerged: "マージ済み",
  gitDevMrClosed: "クローズ",
  gitDevPipeline: "パイプライン: {status}",
  gitDevPipelineSuccess: "成功",
  gitDevPipelineFailed: "失敗",
  gitDevPipelineRunning: "実行中",
  gitDevPipelinePending: "待機中",
  gitDevPipelineCanceled: "キャンセル",
  gitDevPipelineSkipped: "スキップ",
  gitDevPipelineManual: "手動実行待ち",
  gitDevOpenInGitLab: "{title} を GitLab で開く（新しいタブ）",
  gitDevShowMore: "さらに表示（残り {count} 件）",
  gitDevEmpty: "この PBI に紐づくブランチ・マージリクエスト・コミットはまだありません。",
  gitDevEmptyHint: "ブランチ名、マージリクエストのタイトル、コミットメッセージのどれかに「{key}」を入れると、ここに表示されます。",
  gitDevNoRepos: "リポジトリがまだ登録されていません。PO または SM がプロジェクト設定の Git 連携でリポジトリを登録すると、ここに表示されます。",
  gitDevBadgeOpenMrs: "マージリクエスト {count} 件オープン",
  gitDevBadgeMerged: "マージ済み",
  gitDevBadgeBranches: "ブランチ {count} 件",
  gitNavBadge: "新着マージリクエスト {n} 件",
  gitDevBadgeShortOpen: "MR {count} 件",
  gitDevBadgeShortMerged: "MR マージ済み",
  gitDevBadgeShortBranches: "ブランチ {count}",
  gitDevListSeparator: "、",
}

export const en: GitDevTranslations = {
  gitDevTitle: "Development",
  gitDevCopyKey: "Copy {key}",
  gitDevCopyBranch: "Copy branch name",
  gitDevCopyCommand: "Copy command",
  gitDevBranchLabel: "Creating a branch",
  gitDevCopied: "Copied",
  gitDevCopyFailed: "Could not copy",
  gitDevSync: "Refresh now",
  gitDevSynced: "Fetched the latest from GitLab",
  gitDevSyncPartial: "Some repositories could not be refreshed. See the settings page for the error.",
  gitDevSyncTooSoon: "Refreshed a moment ago. Please wait about 20 seconds and try again.",
  gitDevSyncFailed: "Could not refresh",
  gitDevLoadFailed: "Could not load the development info",
  gitDevSectionMrs: "Merge requests",
  gitDevSectionBranches: "Branches",
  gitDevBranchGone: "Deleted",
  gitDevBranchGoneTitle: "This branch was deleted in GitLab ({date})",
  gitDevSectionCommits: "Commits",
  gitDevMrOpened: "Open",
  gitDevMrMerged: "Merged",
  gitDevMrClosed: "Closed",
  gitDevPipeline: "Pipeline: {status}",
  gitDevPipelineSuccess: "passed",
  gitDevPipelineFailed: "failed",
  gitDevPipelineRunning: "running",
  gitDevPipelinePending: "pending",
  gitDevPipelineCanceled: "canceled",
  gitDevPipelineSkipped: "skipped",
  gitDevPipelineManual: "waiting for manual action",
  gitDevOpenInGitLab: "Open {title} in GitLab (new tab)",
  gitDevShowMore: "Show more ({count} left)",
  gitDevEmpty: "No branches, merge requests or commits are linked to this PBI yet.",
  gitDevEmptyHint: "Put \"{key}\" in a branch name, a merge request title or a commit message and it shows up here.",
  gitDevNoRepos: "No repositories are registered yet. They show up here once a PO or SM registers repositories under Git integration in the project settings.",
  gitDevBadgeOpenMrs: "{count} open merge request(s)",
  gitDevBadgeMerged: "Merged",
  gitDevBadgeBranches: "{count} branch(es)",
  gitDevBadgeShortOpen: "{count} MR",
  gitNavBadge: "{n} new merge request(s)",
  gitDevBadgeShortMerged: "MR merged",
  gitDevBadgeShortBranches: "{count} branch",
  gitDevListSeparator: ", ",
}

export const id: GitDevTranslations = {
  gitDevTitle: "Pengembangan",
  gitDevCopyKey: "Salin {key}",
  gitDevCopyBranch: "Salin nama branch",
  gitDevCopyCommand: "Salin perintah",
  gitDevBranchLabel: "Saat membuat branch",
  gitDevCopied: "Disalin",
  gitDevCopyFailed: "Tidak dapat menyalin",
  gitDevSync: "Perbarui sekarang",
  gitDevSynced: "Data terbaru dari GitLab sudah diambil",
  gitDevSyncPartial: "Beberapa repositori tidak dapat diperbarui. Lihat halaman pengaturan untuk detail error.",
  gitDevSyncTooSoon: "Baru saja diperbarui. Tunggu sekitar 20 detik lalu coba lagi.",
  gitDevSyncFailed: "Tidak dapat memperbarui",
  gitDevLoadFailed: "Info pengembangan tidak dapat dimuat",
  gitDevSectionMrs: "Merge request",
  gitDevSectionBranches: "Branch",
  gitDevBranchGone: "Dihapus",
  gitDevBranchGoneTitle: "Branch ini telah dihapus di GitLab ({date})",
  gitDevSectionCommits: "Commit",
  gitDevMrOpened: "Terbuka",
  gitDevMrMerged: "Sudah di-merge",
  gitDevMrClosed: "Ditutup",
  gitDevPipeline: "Pipeline: {status}",
  gitDevPipelineSuccess: "berhasil",
  gitDevPipelineFailed: "gagal",
  gitDevPipelineRunning: "berjalan",
  gitDevPipelinePending: "menunggu",
  gitDevPipelineCanceled: "dibatalkan",
  gitDevPipelineSkipped: "dilewati",
  gitDevPipelineManual: "menunggu tindakan manual",
  gitDevOpenInGitLab: "Buka {title} di GitLab (tab baru)",
  gitDevShowMore: "Tampilkan lagi ({count} tersisa)",
  gitDevEmpty: "Belum ada branch, merge request, atau commit yang terhubung ke PBI ini.",
  gitDevEmptyHint: "Tulis \"{key}\" di nama branch, judul merge request, atau pesan commit, maka akan muncul di sini.",
  gitDevNoRepos: "Belum ada repositori yang terdaftar. Akan muncul di sini setelah PO atau SM mendaftarkan repositori di integrasi Git pada pengaturan proyek.",
  gitDevBadgeOpenMrs: "{count} merge request terbuka",
  gitDevBadgeMerged: "Sudah di-merge",
  gitDevBadgeBranches: "{count} branch",
  gitDevBadgeShortOpen: "{count} MR",
  gitNavBadge: "{n} merge request baru",
  gitDevBadgeShortMerged: "MR di-merge",
  gitDevBadgeShortBranches: "{count} branch",
  gitDevListSeparator: ", ",
}
