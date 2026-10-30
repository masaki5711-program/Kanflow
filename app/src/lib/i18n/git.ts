/**
 * i18n domain: GitLab integration — the project settings section
 * (settings/git-section.tsx), the sidebar entry and the 開発（Git） page
 * (projects/[id]/git). The PBI 開発 panel and card badges live in git-dev.ts.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GitTranslations {
  gitNavLabel: string
  gitNavDesc: string
  gitStatusSynced: string
  gitStatusNever: string
  gitStatusError: string
  gitOwnToken: string
  gitOpenInGitLab: string
  gitSetTitle: string
  gitSetIntro: string
  gitSetEnable: string
  gitSetEnabledNote: string
  gitSetReadOnly: string
  gitSetTurnOffTitle: string
  gitSetTurnOffMessage: string
  gitSetTurnOffConfirm: string
  gitSetEnabledToast: string
  gitSetDisabledToast: string
  gitSetSaveFailed: string
  gitSetLoadFailed: string
  gitSetToken: string
  gitSetTokenHelp: string
  gitSetTokenSet: string
  gitSetTokenNone: string
  gitSetTokenChange: string
  gitSetTokenRemove: string
  gitSetTokenSave: string
  gitSetTokenSaved: string
  gitSetTokenRemoved: string
  gitSetTokenRemoveTitle: string
  gitSetTokenRemoveMessage: string
  gitSetTokenTooShort: string
  gitSetAutoComplete: string
  gitSetAutoCompleteHelp: string
  gitSetRepos: string
  gitSetReposEmpty: string
  gitSetRepoName: string
  gitSetRepoRenameOf: string
  gitSetRepoRemoveOf: string
  gitSetRepoRemoveTitle: string
  gitSetRepoRemoveMessage: string
  gitSetRepoRemoved: string
  gitSetRepoRenamed: string
  gitSetRepoUpdateFailed: string
  gitSetResync: string
  gitSetResyncOf: string
  gitSetResyncTitle: string
  gitSetResyncMessage: string
  gitSetResyncConfirm: string
  gitSetResyncStarted: string
  gitSetResyncTooSoon: string
  gitSetResyncFailed: string
  gitSetAddTitle: string
  gitSetAddName: string
  gitSetAddNamePlaceholder: string
  gitSetAddUrl: string
  gitSetAddUrlPlaceholder: string
  gitSetAddUrlHint: string
  gitSetAddOwnToken: string
  gitSetAddOwnTokenLabel: string
  gitSetAddTest: string
  gitSetAddTestOk: string
  gitSetAddTestNoBranch: string
  gitSetAddTestFailed: string
  gitSetAddSubmit: string
  gitSetAdded: string
  gitSetAddFailed: string
  gitSetNeedToken: string
  gitPageTitle: string
  gitPageDesc: string
  gitPageOffTitle: string
  gitPageOffDesc: string
  gitPageOffDescConfigure: string
  gitPageOpenSettings: string
  gitPageLoadFailed: string
  gitPageRepos: string
  gitPageNoRepos: string
  gitPageNoReposDesc: string
  gitPageSyncNow: string
  gitPageSyncDone: string
  gitPageSyncPartial: string
  gitPageSyncTooSoon: string
  gitPageSyncFailed: string
  gitPageAutoSync: string
  gitPageHowTitle: string
  gitPageHowBranch: string
  gitPageHowMr: string
  gitPageHowResult: string
  gitPageRecent: string
  gitPageRecentEmpty: string
  gitPageRecentEmptyDesc: string
  gitPageOpenPbi: string
  gitKindMr: string
  gitKindBranch: string
  gitKindCommit: string
  gitMrOpened: string
  gitMrMerged: string
  gitMrClosed: string
  gitMrLocked: string
  gitPipelineSuccess: string
  gitPipelineFailed: string
  gitPipelineRunning: string
  gitPipelinePending: string
  gitPipelineCanceled: string
  gitPipelineSkipped: string
  gitPipelineManual: string
  gitPipelineOther: string
}

export const ja: GitTranslations = {
  gitNavLabel: "開発（Git）",
  gitNavDesc: "GitLab のブランチやマージリクエストと PBI のつながり",
  gitStatusSynced: "最終同期 {time}",
  gitStatusNever: "まだ同期していません",
  gitStatusError: "同期エラー（{time}）",
  gitOwnToken: "専用トークン",
  gitOpenInGitLab: "GitLab で開く（新しいタブ）",
  gitSetTitle: "Git 連携（GitLab）",
  gitSetIntro:
    "システム開発のプロジェクト向けの機能です。GitLab のブランチやマージリクエストを、PBI 番号をもとに自動でひも付けて表示します。オフの間は、Git に関する表示はどこにも出ません。",
  gitSetEnable: "Git 連携を使う",
  gitSetEnabledNote: "オンの間は、サイドバーに「開発（Git）」が追加され、PBI の詳細に開発の状況が表示されます。",
  gitSetReadOnly: "この設定を変更できるのは PO・スクラムマスター・管理者です。",
  gitSetTurnOffTitle: "Git 連携をオフにしますか？",
  gitSetTurnOffMessage:
    "サイドバーの「開発（Git）」と、PBI に表示される開発の状況が見えなくなります。登録したリポジトリや取り込んだデータは残るので、もう一度オンにすればそのまま使えます。",
  gitSetTurnOffConfirm: "オフにする",
  gitSetEnabledToast: "Git 連携をオンにしました",
  gitSetDisabledToast: "Git 連携をオフにしました",
  gitSetSaveFailed: "設定を保存できませんでした",
  gitSetLoadFailed: "Git 連携の設定を読み込めませんでした",
  gitSetToken: "アクセストークン",
  gitSetTokenHelp:
    "GitLab で「グループアクセストークン」または「プロジェクトアクセストークン」を、スコープ read_api（読み取り専用）で作成して貼り付けてください。リポジトリを複数登録するなら、まとめて使えるグループトークンがおすすめです。",
  gitSetTokenSet: "設定済み（••••{hint}）",
  gitSetTokenNone: "未設定",
  gitSetTokenChange: "変更",
  gitSetTokenRemove: "削除",
  gitSetTokenSave: "トークンを保存",
  gitSetTokenSaved: "アクセストークンを保存しました",
  gitSetTokenRemoved: "アクセストークンを削除しました",
  gitSetTokenRemoveTitle: "アクセストークンを削除しますか？",
  gitSetTokenRemoveMessage: "専用トークンを持たないリポジトリは、新しいトークンを設定するまで同期できなくなります。",
  gitSetTokenTooShort: "トークンは 8 文字以上です",
  gitSetAutoComplete: "マージで自動完了",
  gitSetAutoCompleteHelp:
    "PBI にひも付いたマージリクエストが「すべて」マージされたら、実行中のスプリントにあるその PBI の進行中タスクを自動で「完了」にします。",
  gitSetRepos: "リポジトリ",
  gitSetReposEmpty: "まだリポジトリが登録されていません。下のフォームから追加してください。",
  gitSetRepoName: "表示名",
  gitSetRepoRenameOf: "「{name}」の名前を変更",
  gitSetRepoRemoveOf: "「{name}」を削除",
  gitSetRepoRemoveTitle: "リポジトリ「{name}」を削除しますか？",
  gitSetRepoRemoveMessage: "このリポジトリから取り込んだブランチやマージリクエストのひも付けも消えます。GitLab 側のリポジトリには影響しません。",
  gitSetRepoRemoved: "リポジトリを削除しました",
  gitSetRepoRenamed: "名前を変更しました",
  gitSetRepoUpdateFailed: "リポジトリを更新できませんでした",
  gitSetResync: "過去分を再同期",
  gitSetResyncOf: "「{name}」の過去 90 日分を再同期",
  gitSetResyncTitle: "「{name}」の過去 90 日分を再同期しますか？",
  gitSetResyncMessage: "過去 90 日のマージリクエストとコミットを GitLab から読み直し、取りこぼしたひも付けを追加します（すでにあるひも付けはそのままです）。数回の自動同期に分けて進むため、終わるまで数十分かかることがあります。",
  gitSetResyncConfirm: "再同期する",
  gitSetResyncStarted: "再同期を始めました。数回の自動同期で過去 90 日分を読み直します",
  gitSetResyncTooSoon: "少し前に再同期を始めたばかりです。10 分ほど待ってからもう一度お試しください",
  gitSetResyncFailed: "再同期を開始できませんでした",
  gitSetAddTitle: "リポジトリを追加",
  gitSetAddName: "表示名",
  gitSetAddNamePlaceholder: "例: 生産管理 API",
  gitSetAddUrl: "リポジトリの URL",
  gitSetAddUrlPlaceholder: "https://gitlab.example.com/group/project",
  gitSetAddUrlHint: "ブラウザで開いたリポジトリのページの URL を、そのまま貼り付けてください。",
  gitSetAddOwnToken: "このリポジトリだけ別のトークンを使う",
  gitSetAddOwnTokenLabel: "このリポジトリ用のトークン",
  gitSetAddTest: "接続テスト",
  gitSetAddTestOk: "接続できました: {path}（既定のブランチ: {branch}）",
  gitSetAddTestNoBranch: "なし",
  gitSetAddTestFailed: "接続できませんでした: {error}",
  gitSetAddSubmit: "追加",
  gitSetAdded: "リポジトリを追加しました",
  gitSetAddFailed: "リポジトリを追加できませんでした",
  gitSetNeedToken: "先に上のアクセストークンを設定するか、このリポジトリ用のトークンを入力してください。",
  gitPageTitle: "開発（Git）",
  gitPageDesc: "GitLab のブランチ・マージリクエスト・コミットのうち、PBI 番号が入っているものを一覧します。",
  gitPageOffTitle: "Git 連携はオフになっています",
  gitPageOffDesc: "このプロジェクトでは Git 連携を使っていません。",
  gitPageOffDescConfigure: "使う場合は、プロジェクト設定の「Git 連携（GitLab）」でオンにしてください。",
  gitPageOpenSettings: "設定を開く",
  gitPageLoadFailed: "開発の状況を読み込めませんでした",
  gitPageRepos: "リポジトリ",
  gitPageNoRepos: "リポジトリがまだ登録されていません",
  gitPageNoReposDesc: "プロジェクト設定でリポジトリを追加すると、ここに同期の状況が表示されます。",
  gitPageSyncNow: "今すぐ同期",
  gitPageSyncDone: "同期しました（ひも付け {n} 件）",
  gitPageSyncPartial: "一部のリポジトリで同期に失敗しました",
  gitPageSyncTooSoon: "少し前に同期したばかりです。20 秒ほど待ってからもう一度お試しください。",
  gitPageSyncFailed: "同期できませんでした",
  gitPageAutoSync: "自動同期: 約 {n} 分ごと",
  gitPageHowTitle: "使い方",
  gitPageHowBranch: "ブランチ名に PBI 番号を入れます（例: {example}）。",
  gitPageHowMr: "マージリクエストのタイトルやコミットメッセージに「PBI-123」のように書いても、ひも付きます。",
  gitPageHowResult: "数分以内に、その PBI の詳細に開発の状況が表示されます。",
  gitPageRecent: "最近の動き",
  gitPageRecentEmpty: "まだ PBI にひも付いた動きはありません",
  gitPageRecentEmptyDesc: "ブランチ名やマージリクエストのタイトルに PBI 番号を入れると、ここに表示されます。",
  gitPageOpenPbi: "{key} をバックログで開く",
  gitKindMr: "マージリクエスト",
  gitKindBranch: "ブランチ",
  gitKindCommit: "コミット",
  gitMrOpened: "オープン",
  gitMrMerged: "マージ済み",
  gitMrClosed: "クローズ",
  gitMrLocked: "ロック中",
  gitPipelineSuccess: "チェック成功",
  gitPipelineFailed: "チェック失敗",
  gitPipelineRunning: "チェック実行中",
  gitPipelinePending: "チェック待ち",
  gitPipelineCanceled: "チェック中止",
  gitPipelineSkipped: "チェックなし",
  gitPipelineManual: "手動実行待ち",
  gitPipelineOther: "チェック: {status}",
}

export const en: GitTranslations = {
  gitNavLabel: "Development (Git)",
  gitNavDesc: "How GitLab branches and merge requests connect to PBIs",
  gitStatusSynced: "Last synced {time}",
  gitStatusNever: "Not synced yet",
  gitStatusError: "Sync error ({time})",
  gitOwnToken: "Own token",
  gitOpenInGitLab: "Open in GitLab (new tab)",
  gitSetTitle: "Git integration (GitLab)",
  gitSetIntro:
    "For software development projects. Links GitLab branches and merge requests to PBIs automatically by PBI number. While it is off, nothing Git-related is shown anywhere.",
  gitSetEnable: "Use the Git integration",
  gitSetEnabledNote: "While on, the sidebar gains “Development (Git)” and PBI details show their development status.",
  gitSetReadOnly: "Only the PO, Scrum Master or an administrator can change this setting.",
  gitSetTurnOffTitle: "Turn off the Git integration?",
  gitSetTurnOffMessage:
    "“Development (Git)” disappears from the sidebar and PBIs no longer show their development status. Registered repositories and imported data are kept, so turning it back on resumes where you left off.",
  gitSetTurnOffConfirm: "Turn off",
  gitSetEnabledToast: "Git integration turned on",
  gitSetDisabledToast: "Git integration turned off",
  gitSetSaveFailed: "Could not save the setting",
  gitSetLoadFailed: "Could not load the Git integration settings",
  gitSetToken: "Access token",
  gitSetTokenHelp:
    "In GitLab, create a group access token or project access token with the read_api scope (read-only) and paste it here. When you register several repositories, a group token that covers them all is recommended.",
  gitSetTokenSet: "Set (••••{hint})",
  gitSetTokenNone: "Not set",
  gitSetTokenChange: "Change",
  gitSetTokenRemove: "Remove",
  gitSetTokenSave: "Save token",
  gitSetTokenSaved: "Access token saved",
  gitSetTokenRemoved: "Access token removed",
  gitSetTokenRemoveTitle: "Remove the access token?",
  gitSetTokenRemoveMessage: "Repositories without their own token cannot sync until a new token is set.",
  gitSetTokenTooShort: "A token has at least 8 characters",
  gitSetAutoComplete: "Complete on merge",
  gitSetAutoCompleteHelp:
    "When ALL merge requests linked to a PBI are merged, that PBI's in-progress tasks in the active sprint are marked done automatically.",
  gitSetRepos: "Repositories",
  gitSetReposEmpty: "No repositories yet. Add one with the form below.",
  gitSetRepoName: "Display name",
  gitSetRepoRenameOf: "Rename “{name}”",
  gitSetRepoRemoveOf: "Remove “{name}”",
  gitSetRepoRemoveTitle: "Remove the repository “{name}”?",
  gitSetRepoRemoveMessage: "The branches and merge requests linked from this repository are removed too. The repository in GitLab is not affected.",
  gitSetRepoRemoved: "Repository removed",
  gitSetRepoRenamed: "Renamed",
  gitSetRepoUpdateFailed: "Could not update the repository",
  gitSetResync: "Resync history",
  gitSetResyncOf: "Resync the last 90 days of “{name}”",
  gitSetResyncTitle: "Resync the last 90 days of “{name}”?",
  gitSetResyncMessage: "Merge requests and commits of the last 90 days are read from GitLab again and missing links are added (existing links stay as they are). It runs over several automatic syncs and can take some tens of minutes.",
  gitSetResyncConfirm: "Resync",
  gitSetResyncStarted: "Resync started. The next automatic syncs re-read the last 90 days",
  gitSetResyncTooSoon: "A resync was started a moment ago. Please wait about 10 minutes and try again",
  gitSetResyncFailed: "Could not start the resync",
  gitSetAddTitle: "Add a repository",
  gitSetAddName: "Display name",
  gitSetAddNamePlaceholder: "e.g. Production API",
  gitSetAddUrl: "Repository URL",
  gitSetAddUrlPlaceholder: "https://gitlab.example.com/group/project",
  gitSetAddUrlHint: "Paste the URL of the repository page as shown in your browser.",
  gitSetAddOwnToken: "Use a different token for this repository only",
  gitSetAddOwnTokenLabel: "Token for this repository",
  gitSetAddTest: "Test connection",
  gitSetAddTestOk: "Connected: {path} (default branch: {branch})",
  gitSetAddTestNoBranch: "none",
  gitSetAddTestFailed: "Could not connect: {error}",
  gitSetAddSubmit: "Add",
  gitSetAdded: "Repository added",
  gitSetAddFailed: "Could not add the repository",
  gitSetNeedToken: "Set the access token above first, or enter a token for this repository.",
  gitPageTitle: "Development (Git)",
  gitPageDesc: "GitLab branches, merge requests and commits that mention a PBI number.",
  gitPageOffTitle: "The Git integration is off",
  gitPageOffDesc: "This project does not use the Git integration.",
  gitPageOffDescConfigure: "To use it, turn it on under “Git integration (GitLab)” in the project settings.",
  gitPageOpenSettings: "Open settings",
  gitPageLoadFailed: "Could not load the development status",
  gitPageRepos: "Repositories",
  gitPageNoRepos: "No repositories registered yet",
  gitPageNoReposDesc: "Add a repository in the project settings to see its sync status here.",
  gitPageSyncNow: "Sync now",
  gitPageSyncDone: "Synced ({n} links)",
  gitPageSyncPartial: "Some repositories failed to sync",
  gitPageSyncTooSoon: "A sync just ran. Please wait about 20 seconds and try again.",
  gitPageSyncFailed: "Could not sync",
  gitPageAutoSync: "Automatic sync: about every {n} min",
  gitPageHowTitle: "How it works",
  gitPageHowBranch: "Put the PBI number in the branch name (e.g. {example}).",
  gitPageHowMr: "Writing “PBI-123” in a merge request title or commit message links it as well.",
  gitPageHowResult: "Within a few minutes, the PBI's details show its development status.",
  gitPageRecent: "Recent activity",
  gitPageRecentEmpty: "Nothing linked to a PBI yet",
  gitPageRecentEmptyDesc: "Put a PBI number in a branch name or merge request title and it shows up here.",
  gitPageOpenPbi: "Open {key} in the backlog",
  gitKindMr: "Merge request",
  gitKindBranch: "Branch",
  gitKindCommit: "Commit",
  gitMrOpened: "Open",
  gitMrMerged: "Merged",
  gitMrClosed: "Closed",
  gitMrLocked: "Locked",
  gitPipelineSuccess: "Checks passed",
  gitPipelineFailed: "Checks failed",
  gitPipelineRunning: "Checks running",
  gitPipelinePending: "Checks waiting",
  gitPipelineCanceled: "Checks canceled",
  gitPipelineSkipped: "Checks skipped",
  gitPipelineManual: "Waiting for manual run",
  gitPipelineOther: "Checks: {status}",
}

export const id: GitTranslations = {
  gitNavLabel: "Pengembangan (Git)",
  gitNavDesc: "Keterkaitan branch dan merge request GitLab dengan PBI",
  gitStatusSynced: "Terakhir disinkronkan {time}",
  gitStatusNever: "Belum pernah disinkronkan",
  gitStatusError: "Gagal sinkronisasi ({time})",
  gitOwnToken: "Token sendiri",
  gitOpenInGitLab: "Buka di GitLab (tab baru)",
  gitSetTitle: "Integrasi Git (GitLab)",
  gitSetIntro:
    "Untuk proyek pengembangan sistem. Branch dan merge request GitLab ditautkan ke PBI secara otomatis berdasarkan nomor PBI. Selama nonaktif, tidak ada tampilan terkait Git di mana pun.",
  gitSetEnable: "Gunakan integrasi Git",
  gitSetEnabledNote: "Selama aktif, sidebar mendapat menu “Pengembangan (Git)” dan detail PBI menampilkan status pengembangannya.",
  gitSetReadOnly: "Hanya PO, Scrum Master, atau administrator yang dapat mengubah pengaturan ini.",
  gitSetTurnOffTitle: "Nonaktifkan integrasi Git?",
  gitSetTurnOffMessage:
    "Menu “Pengembangan (Git)” hilang dari sidebar dan PBI tidak lagi menampilkan status pengembangan. Repositori dan data yang sudah diambil tetap disimpan, jadi bisa langsung dipakai lagi saat diaktifkan kembali.",
  gitSetTurnOffConfirm: "Nonaktifkan",
  gitSetEnabledToast: "Integrasi Git diaktifkan",
  gitSetDisabledToast: "Integrasi Git dinonaktifkan",
  gitSetSaveFailed: "Pengaturan tidak dapat disimpan",
  gitSetLoadFailed: "Pengaturan integrasi Git tidak dapat dimuat",
  gitSetToken: "Token akses",
  gitSetTokenHelp:
    "Di GitLab, buat token akses grup atau token akses proyek dengan cakupan read_api (hanya baca), lalu tempel di sini. Jika mendaftarkan beberapa repositori, token grup yang mencakup semuanya lebih disarankan.",
  gitSetTokenSet: "Sudah diatur (••••{hint})",
  gitSetTokenNone: "Belum diatur",
  gitSetTokenChange: "Ubah",
  gitSetTokenRemove: "Hapus",
  gitSetTokenSave: "Simpan token",
  gitSetTokenSaved: "Token akses disimpan",
  gitSetTokenRemoved: "Token akses dihapus",
  gitSetTokenRemoveTitle: "Hapus token akses?",
  gitSetTokenRemoveMessage: "Repositori tanpa token sendiri tidak dapat disinkronkan sampai token baru diatur.",
  gitSetTokenTooShort: "Token minimal 8 karakter",
  gitSetAutoComplete: "Selesai otomatis saat merge",
  gitSetAutoCompleteHelp:
    "Jika SEMUA merge request yang tertaut ke sebuah PBI sudah di-merge, tugas PBI tersebut yang sedang dikerjakan di sprint aktif otomatis ditandai selesai.",
  gitSetRepos: "Repositori",
  gitSetReposEmpty: "Belum ada repositori. Tambahkan melalui formulir di bawah.",
  gitSetRepoName: "Nama tampilan",
  gitSetRepoRenameOf: "Ganti nama “{name}”",
  gitSetRepoRemoveOf: "Hapus “{name}”",
  gitSetRepoRemoveTitle: "Hapus repositori “{name}”?",
  gitSetRepoRemoveMessage: "Tautan branch dan merge request dari repositori ini juga dihapus. Repositori di GitLab tidak terpengaruh.",
  gitSetRepoRemoved: "Repositori dihapus",
  gitSetRepoRenamed: "Nama diubah",
  gitSetRepoUpdateFailed: "Repositori tidak dapat diperbarui",
  gitSetResync: "Sinkronkan ulang riwayat",
  gitSetResyncOf: "Sinkronkan ulang 90 hari terakhir “{name}”",
  gitSetResyncTitle: "Sinkronkan ulang 90 hari terakhir “{name}”?",
  gitSetResyncMessage: "Merge request dan commit 90 hari terakhir dibaca ulang dari GitLab dan tautan yang terlewat ditambahkan (tautan yang sudah ada tetap). Proses berjalan dalam beberapa sinkronisasi otomatis dan dapat memakan waktu puluhan menit.",
  gitSetResyncConfirm: "Sinkronkan ulang",
  gitSetResyncStarted: "Sinkronisasi ulang dimulai. Sinkronisasi otomatis berikutnya membaca ulang 90 hari terakhir",
  gitSetResyncTooSoon: "Sinkronisasi ulang baru saja dimulai. Tunggu sekitar 10 menit lalu coba lagi",
  gitSetResyncFailed: "Sinkronisasi ulang tidak dapat dimulai",
  gitSetAddTitle: "Tambah repositori",
  gitSetAddName: "Nama tampilan",
  gitSetAddNamePlaceholder: "mis. API Produksi",
  gitSetAddUrl: "URL repositori",
  gitSetAddUrlPlaceholder: "https://gitlab.example.com/group/project",
  gitSetAddUrlHint: "Tempel URL halaman repositori persis seperti yang tampil di browser.",
  gitSetAddOwnToken: "Gunakan token lain khusus untuk repositori ini",
  gitSetAddOwnTokenLabel: "Token untuk repositori ini",
  gitSetAddTest: "Uji koneksi",
  gitSetAddTestOk: "Terhubung: {path} (branch bawaan: {branch})",
  gitSetAddTestNoBranch: "tidak ada",
  gitSetAddTestFailed: "Tidak dapat terhubung: {error}",
  gitSetAddSubmit: "Tambah",
  gitSetAdded: "Repositori ditambahkan",
  gitSetAddFailed: "Repositori tidak dapat ditambahkan",
  gitSetNeedToken: "Atur token akses di atas terlebih dahulu, atau masukkan token untuk repositori ini.",
  gitPageTitle: "Pengembangan (Git)",
  gitPageDesc: "Branch, merge request, dan commit GitLab yang menyebut nomor PBI.",
  gitPageOffTitle: "Integrasi Git nonaktif",
  gitPageOffDesc: "Proyek ini tidak menggunakan integrasi Git.",
  gitPageOffDescConfigure: "Untuk menggunakannya, aktifkan “Integrasi Git (GitLab)” di pengaturan proyek.",
  gitPageOpenSettings: "Buka pengaturan",
  gitPageLoadFailed: "Status pengembangan tidak dapat dimuat",
  gitPageRepos: "Repositori",
  gitPageNoRepos: "Belum ada repositori terdaftar",
  gitPageNoReposDesc: "Tambahkan repositori di pengaturan proyek untuk melihat status sinkronisasinya di sini.",
  gitPageSyncNow: "Sinkronkan sekarang",
  gitPageSyncDone: "Sinkronisasi selesai ({n} tautan)",
  gitPageSyncPartial: "Sebagian repositori gagal disinkronkan",
  gitPageSyncTooSoon: "Sinkronisasi baru saja dijalankan. Tunggu sekitar 20 detik lalu coba lagi.",
  gitPageSyncFailed: "Sinkronisasi gagal",
  gitPageAutoSync: "Sinkronisasi otomatis: sekitar setiap {n} menit",
  gitPageHowTitle: "Cara pakai",
  gitPageHowBranch: "Sertakan nomor PBI di nama branch (mis. {example}).",
  gitPageHowMr: "Menulis “PBI-123” di judul merge request atau pesan commit juga akan menautkannya.",
  gitPageHowResult: "Dalam beberapa menit, detail PBI tersebut menampilkan status pengembangannya.",
  gitPageRecent: "Aktivitas terbaru",
  gitPageRecentEmpty: "Belum ada aktivitas yang tertaut ke PBI",
  gitPageRecentEmptyDesc: "Sertakan nomor PBI di nama branch atau judul merge request agar muncul di sini.",
  gitPageOpenPbi: "Buka {key} di backlog",
  gitKindMr: "Merge request",
  gitKindBranch: "Branch",
  gitKindCommit: "Commit",
  gitMrOpened: "Terbuka",
  gitMrMerged: "Sudah di-merge",
  gitMrClosed: "Ditutup",
  gitMrLocked: "Terkunci",
  gitPipelineSuccess: "Pemeriksaan berhasil",
  gitPipelineFailed: "Pemeriksaan gagal",
  gitPipelineRunning: "Pemeriksaan berjalan",
  gitPipelinePending: "Pemeriksaan menunggu",
  gitPipelineCanceled: "Pemeriksaan dibatalkan",
  gitPipelineSkipped: "Pemeriksaan dilewati",
  gitPipelineManual: "Menunggu dijalankan manual",
  gitPipelineOther: "Pemeriksaan: {status}",
}
