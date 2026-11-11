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
  /** MR linked by a developer's AI session (dev:write) instead of found by the sync. */
  gitDevDeclared: string
  gitDevDeclaredTitle: string
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
  gitDevApprovals: string
  gitDevApprovedByMe: string
  gitDevApprove: string
  gitDevUnapprove: string
  gitDevApproveLabel: string
  gitDevUnapproveLabel: string
  gitDevApproveReasonSelf: string
  gitDevApproveReasonRole: string
  gitDevApproveReasonOther: string
  gitDevApproveStateFailed: string
  gitDevApproveNoEmployee: string
  /** Dashboard (自分のタスク): open merge requests the user could approve now. */
  gitDevAwaitingTitle: string
  /** N10 (自分のタスク): the user's open merge requests that cannot merge yet or are predicted to conflict. */
  gitDevMyBlockedTitle: string
  /** Why the MR is listed as the user's: on the branch of their work claim / they are its author. */
  gitDevMyBlockedByBranch: string
  gitDevMyBlockedByAuthor: string
  gitDevConfirmGroup: string
  gitDevConfirmHelp: string
  gitDevConfirmOpen: string
  gitDevConfirmNewWindow: string
  gitDevConfirmDone: string
  gitDevConfirmCancel: string
  gitDevApproved: string
  gitDevUnapproved: string
  gitDevApproveUnchanged: string
  gitDevApproveStartFailed: string
  gitDevApproveFailed: string
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
  gitDevDeclared: "手動でリンク",
  gitDevDeclaredTitle: "開発者（AI セッション）が登録したリンクです。状態は次の同期で更新されます",
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
  gitDevPipelineManual: "対応待ち",
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
  gitDevApprovals: "承認 {count} 件",
  gitDevApprovedByMe: "自分は承認済み",
  gitDevApprove: "承認する",
  gitDevUnapprove: "承認を取り消す",
  gitDevApproveLabel: "!{iid} を承認する",
  gitDevUnapproveLabel: "!{iid} の承認を取り消す",
  gitDevApproveReasonSelf: "自分の MR は承認できません",
  gitDevApproveReasonRole: "承認には GitStation で Developer 以上の役割が必要です",
  gitDevApproveReasonOther: "この MR は今は承認できません",
  gitDevApproveStateFailed: "承認の状態を読み込めませんでした",
  gitDevApproveNoEmployee: "社員番号が未登録のため、ここから MR を承認できません（管理者に登録を依頼してください）",
  gitDevAwaitingTitle: "承認を待っている MR",
  gitDevMyBlockedTitle: "自分の MR で止まっているもの",
  gitDevMyBlockedByBranch: "作業の宣言のブランチ {branch}",
  gitDevMyBlockedByAuthor: "自分が作成",
  gitDevConfirmGroup: "!{iid} の GitStation での確認",
  gitDevConfirmHelp: "GitStation の画面で MR の内容を確かめてボタンを押し、ここに戻って「確認しました」を押してください（10 分で期限切れ）。",
  gitDevConfirmOpen: "GitStation で確認する",
  gitDevConfirmNewWindow: "（新しいウィンドウで開きます）",
  gitDevConfirmDone: "確認しました",
  gitDevConfirmCancel: "やめる",
  gitDevApproved: "承認しました",
  gitDevUnapproved: "承認を取り消しました",
  gitDevApproveUnchanged: "変わりませんでした（すでにその状態です）",
  gitDevApproveStartFailed: "承認を始められませんでした",
  gitDevApproveFailed: "承認できませんでした",
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
  gitDevDeclared: "Linked manually",
  gitDevDeclaredTitle: "Linked by a developer (AI session); its state is updated by the next sync",
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
  gitDevPipelineManual: "waiting for someone to act",
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
  gitDevApprovals: "{count} approval(s)",
  gitDevApprovedByMe: "You approved",
  gitDevApprove: "Approve",
  gitDevUnapprove: "Withdraw approval",
  gitDevApproveLabel: "Approve !{iid}",
  gitDevUnapproveLabel: "Withdraw the approval of !{iid}",
  gitDevApproveReasonSelf: "You cannot approve your own merge request",
  gitDevApproveReasonRole: "Approving needs the Developer role or higher in GitStation",
  gitDevApproveReasonOther: "This merge request cannot be approved now",
  gitDevApproveStateFailed: "Could not load the approval state",
  gitDevApproveNoEmployee: "Your employee number is not registered, so you cannot approve merge requests here (ask an administrator to register it)",
  gitDevAwaitingTitle: "Merge requests awaiting your approval",
  gitDevMyBlockedTitle: "Your merge requests that are stuck",
  gitDevMyBlockedByBranch: "Branch of your work claim: {branch}",
  gitDevMyBlockedByAuthor: "You opened it",
  gitDevConfirmGroup: "Confirming !{iid} in GitStation",
  gitDevConfirmHelp: "Check the merge request on the GitStation page and press its button, then come back and press \"I confirmed\" (expires in 10 minutes).",
  gitDevConfirmOpen: "Confirm in GitStation",
  gitDevConfirmNewWindow: "(opens in a new window)",
  gitDevConfirmDone: "I confirmed",
  gitDevConfirmCancel: "Cancel",
  gitDevApproved: "Approved",
  gitDevUnapproved: "Approval withdrawn",
  gitDevApproveUnchanged: "Nothing changed (it was already so)",
  gitDevApproveStartFailed: "Could not start the approval",
  gitDevApproveFailed: "The approval failed",
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
  gitDevDeclared: "Ditautkan manual",
  gitDevDeclaredTitle: "Ditautkan oleh developer (sesi AI); statusnya diperbarui pada sinkronisasi berikutnya",
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
  gitDevPipelineManual: "menunggu tindakan seseorang",
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
  gitDevApprovals: "{count} persetujuan",
  gitDevApprovedByMe: "Anda sudah menyetujui",
  gitDevApprove: "Setujui",
  gitDevUnapprove: "Tarik persetujuan",
  gitDevApproveLabel: "Setujui !{iid}",
  gitDevUnapproveLabel: "Tarik persetujuan !{iid}",
  gitDevApproveReasonSelf: "Anda tidak dapat menyetujui merge request milik sendiri",
  gitDevApproveReasonRole: "Persetujuan memerlukan peran Developer atau lebih tinggi di GitStation",
  gitDevApproveReasonOther: "Merge request ini tidak dapat disetujui sekarang",
  gitDevApproveStateFailed: "Tidak dapat memuat status persetujuan",
  gitDevApproveNoEmployee: "Nomor karyawan Anda belum terdaftar, sehingga Anda tidak dapat menyetujui merge request di sini (minta administrator untuk mendaftarkannya)",
  gitDevAwaitingTitle: "Merge request yang menunggu persetujuan Anda",
  gitDevMyBlockedTitle: "Merge request Anda yang tertahan",
  gitDevMyBlockedByBranch: "Branch klaim kerja Anda: {branch}",
  gitDevMyBlockedByAuthor: "Anda yang membuatnya",
  gitDevConfirmGroup: "Konfirmasi !{iid} di GitStation",
  gitDevConfirmHelp: "Periksa merge request di halaman GitStation dan tekan tombolnya, lalu kembali dan tekan \"Sudah saya konfirmasi\" (kedaluwarsa dalam 10 menit).",
  gitDevConfirmOpen: "Konfirmasi di GitStation",
  gitDevConfirmNewWindow: "(terbuka di jendela baru)",
  gitDevConfirmDone: "Sudah saya konfirmasi",
  gitDevConfirmCancel: "Batal",
  gitDevApproved: "Disetujui",
  gitDevUnapproved: "Persetujuan ditarik",
  gitDevApproveUnchanged: "Tidak ada perubahan (sudah dalam keadaan itu)",
  gitDevApproveStartFailed: "Tidak dapat memulai persetujuan",
  gitDevApproveFailed: "Persetujuan gagal",
}
