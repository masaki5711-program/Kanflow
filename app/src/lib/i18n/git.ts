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
  gitSyncFailed: string
  gitSyncCursorInvalid: string
  gitSyncStationTruncated: string
  gitSyncStationHostNotAllowed: string
  gitSyncStationNotBound: string
  gitSyncStationHeld: string
  gitSyncStationQuarantined: string
  gitSyncStationNoIntegration: string
  gitSyncStationAuth: string
  gitSyncStationForbidden: string
  gitSyncStationNotFound: string
  gitSyncStationGone: string
  gitSyncStationRateLimited: string
  gitSyncStationUnavailable: string
  gitSyncStationNetwork: string
  gitSyncStationInvalidResponse: string
  gitSyncStationHttp: string
  gitSyncAcceptanceRefused: string
  gitSyncAcceptanceCommitMissing: string
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
  gitSetProvider: string
  gitSetProviderGitlab: string
  gitSetProviderGitstation: string
  gitSetProviderLocked: string
  gitSetStationIntegration: string
  gitSetStationIntegrationHelp: string
  gitSetStationIntegrationSave: string
  gitSetStationIntegrationMissing: string
  gitSetAutoCompleteHelp: string
  gitSetAcceptanceCheck: string
  gitSetAcceptanceCheckHelp: string
  gitSetAcceptanceCheckError: string
  gitSetAcceptanceCheckErrorNoTime: string
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
  gitSyncFailed: "同期中にエラーが発生しました",
  gitSyncCursorInvalid: "同期位置の記録を読み取れません。リポジトリの「過去分を再同期」でやり直してください。",
  gitSyncStationTruncated: "GitStation の状態の取り直しが、1 回に読める上限を超えました。管理者に連絡してください。",
  gitSyncStationHostNotAllowed: "GitStation のホストが許可されていません（GITSTATION_ALLOWED_HOSTS）。管理者に連絡してください。",
  gitSyncStationNotBound: "このリポジトリは GitStation でこのプロジェクトだけに結び付けられていません。GitStation の管理者に、このプロジェクトへの結び付けを依頼してください（結び付けが戻ると状態を取り直します）。",
  gitSyncStationHeld: "リポジトリを確かめられない・書き込めないものがあったため、イベントの履歴の位置を進めていません。次回の同期でやり直します。",
  gitSyncStationQuarantined: "このリポジトリは 3 回続けて書き込めなかったため、いったん外しました（他のリポジトリは進みます）。状態は後で取り直します。",
  gitSyncStationNoIntegration: "GitStation の連携 ID が設定されていません。チーム設定の Git 連携で入れてください。",
  gitSyncStationAuth: "GitStation がトークンを拒否しました（無効または期限切れ）。連携のサービスアカウントの新しいトークンを設定してください。",
  gitSyncStationForbidden: "連携のサービスアカウントに、このリポジトリを読む権限がありません。GitStation で連携にリポジトリを結び付けてください。",
  gitSyncStationNotFound: "リポジトリか連携が GitStation に見つからないか、この連携からは見えません。URL と連携 ID を確認してください。",
  gitSyncStationGone: "GitStation のイベントの履歴の位置が無効になりました。状態を取り直します（次回の同期）。",
  gitSyncStationRateLimited: "GitStation の利用制限に達しました。次回の同期で再試行します。",
  gitSyncStationUnavailable: "GitStation が一時的に利用できません。次回の同期で再試行します。",
  gitSyncStationNetwork: "GitStation に接続できませんでした。次回の同期で再試行します。",
  gitSyncStationInvalidResponse: "GitStation から想定外の応答がありました。次回の同期で再試行します（続く場合は管理者に連絡してください）。",
  gitSyncStationHttp: "GitStation がエラーを返しました（{status}）。次回の同期で再試行します。",
  gitSyncAcceptanceRefused:
    "GitStation がチェックの報告を拒否しました。GitStation の管理者に、連携のサービスアカウントへこのリポジトリの kanflow チェックを報告する許可（check-grants）と、Developer 以上の権限を依頼してください。",
  gitSyncAcceptanceCommitMissing: "チェックの報告先のコミットが GitStation に見つかりませんでした。次回の同期でやり直します。",
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
  gitSetProvider: "取り込み元",
  gitSetProviderGitlab: "GitLab",
  gitSetProviderGitstation: "GitStation",
  gitSetProviderLocked: "リポジトリが登録されている間は、取り込み元を変更できません（先にリポジトリを外してください）。",
  gitSetStationIntegration: "GitStation の連携 ID",
  gitSetStationIntegrationHelp: "GitStation の管理者が連携を登録したときの ID です。アクセストークンには、その連携のサービスアカウントのトークンを入れてください。",
  gitSetStationIntegrationSave: "連携 ID を保存",
  gitSetStationIntegrationMissing: "連携 ID が未設定です。設定するまで同期できません。",
  gitSetAutoComplete: "マージで自動完了",
  gitSetAutoCompleteHelp:
    "PBI にひも付いたマージリクエストが「すべて」マージされたら、実行中のスプリントにあるその PBI の進行中タスクを自動で「完了」にします。",
  gitSetAcceptanceCheck: "受入の準備を GitStation に報告",
  gitSetAcceptanceCheckHelp:
    "PBI にひも付いた開いているマージリクエストごとに、チェック「kanflow/acceptance」を GitStation に報告します。ひも付いた PBI のすべてに、開いているスプリントのタスクがあり、受入基準が 1 つ以上あって、そのすべてに確認の方法が決まっていれば「成功」、足りなければ「対応が必要」になります。報告するだけで、マージを止めるかどうかは GitStation 側の設定です。機密の PBI にひも付いたマージリクエストは報告しません。",
  gitSetAcceptanceCheckError: "報告できませんでした（{time}）",
  gitSetAcceptanceCheckErrorNoTime: "報告できませんでした",
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
  gitSyncFailed: "An error occurred during the sync.",
  gitSyncCursorInvalid: "The stored sync position cannot be read. Use “Resync history” on the repository to start over.",
  gitSyncStationTruncated: "GitStation lists more than Kanflow reads at once, so the state cannot be re-read. Contact an administrator.",
  gitSyncStationHostNotAllowed: "The GitStation host is not allowed (GITSTATION_ALLOWED_HOSTS). Contact an administrator.",
  gitSyncStationNotBound: "In GitStation this repository is not bound to this project alone. Ask the GitStation administrator to bind it (its state is re-read once it is).",
  gitSyncStationHeld: "Some repositories could not be checked or written, so the event history position was not advanced. The next sync tries again.",
  gitSyncStationQuarantined: "This repository could not be written 3 times in a row and is set aside (the others go on); its state is re-read later.",
  gitSyncStationNoIntegration: "The GitStation integration ID is not set. Enter it under Git integration in the project's Settings.",
  gitSyncStationAuth: "GitStation rejected the token (invalid or expired). Set a new token of the integration's service account.",
  gitSyncStationForbidden: "The integration's service account is not allowed to read this repository. Bind the repository to the integration in GitStation.",
  gitSyncStationNotFound: "The repository or the integration was not found in GitStation, or this integration cannot see it. Check the URL and the integration ID.",
  gitSyncStationGone: "The position in GitStation's event history is no longer valid. The state is re-read at the next sync.",
  gitSyncStationRateLimited: "GitStation's rate limit was reached. The next sync tries again.",
  gitSyncStationUnavailable: "GitStation is temporarily unavailable. The next sync tries again.",
  gitSyncStationNetwork: "Could not connect to GitStation. The next sync tries again.",
  gitSyncStationInvalidResponse: "GitStation gave an unexpected answer. The next sync tries again (contact an administrator if it continues).",
  gitSyncStationHttp: "GitStation returned an error ({status}). The next sync tries again.",
  gitSyncAcceptanceRefused:
    "GitStation refused the check report. Ask GitStation's administrator to allow the integration's service account to report kanflow checks for this repository (check-grants) and to give it Developer access or higher.",
  gitSyncAcceptanceCommitMissing: "The commit to report on was not found in GitStation. It is tried again at the next sync.",
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
  gitSetProvider: "Source",
  gitSetProviderGitlab: "GitLab",
  gitSetProviderGitstation: "GitStation",
  gitSetProviderLocked: "The source cannot change while repositories are registered (remove them first).",
  gitSetStationIntegration: "GitStation integration ID",
  gitSetStationIntegrationHelp: "The ID GitStation's administrator gave the integration. Use the integration's service-account token as the access token.",
  gitSetStationIntegrationSave: "Save integration ID",
  gitSetStationIntegrationMissing: "The integration ID is not set. Nothing is synced until it is.",
  gitSetAutoComplete: "Complete on merge",
  gitSetAutoCompleteHelp:
    "When ALL merge requests linked to a PBI are merged, that PBI's in-progress tasks in the active sprint are marked done automatically.",
  gitSetAcceptanceCheck: "Report acceptance readiness to GitStation",
  gitSetAcceptanceCheckHelp:
    "For every open merge request linked to PBIs, the check \"kanflow/acceptance\" is reported to GitStation. It is \"success\" when every linked PBI has a task in an open sprint and at least one acceptance criterion, all with a decided way of proof, and \"action required\" otherwise. It only reports: whether a merge waits for it is set in GitStation. Merge requests linked to a confidential PBI are not reported.",
  gitSetAcceptanceCheckError: "Could not report ({time})",
  gitSetAcceptanceCheckErrorNoTime: "Could not report",
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
  gitSyncFailed: "Terjadi kesalahan saat sinkronisasi.",
  gitSyncCursorInvalid: "Posisi sinkronisasi yang tersimpan tidak dapat dibaca. Gunakan “Sinkronkan ulang riwayat” pada repositori untuk mengulang.",
  gitSyncStationTruncated: "GitStation mencantumkan lebih banyak dari yang dapat dibaca Kanflow sekaligus, sehingga statusnya tidak dapat dibaca ulang. Hubungi administrator.",
  gitSyncStationHostNotAllowed: "Host GitStation tidak diizinkan (GITSTATION_ALLOWED_HOSTS). Hubungi administrator.",
  gitSyncStationNotBound: "Di GitStation repositori ini tidak terikat hanya ke proyek ini. Minta administrator GitStation untuk mengikatnya (statusnya dibaca ulang setelah terikat).",
  gitSyncStationHeld: "Beberapa repositori tidak dapat diperiksa atau ditulis, sehingga posisi riwayat peristiwa tidak dimajukan. Sinkronisasi berikutnya mencoba lagi.",
  gitSyncStationQuarantined: "Repositori ini gagal ditulis 3 kali berturut-turut dan disisihkan (yang lain tetap berjalan); statusnya dibaca ulang nanti.",
  gitSyncStationNoIntegration: "ID integrasi GitStation belum diatur. Isi di bagian integrasi Git pada Pengaturan proyek.",
  gitSyncStationAuth: "GitStation menolak token (tidak valid atau kedaluwarsa). Atur token baru dari akun layanan integrasi.",
  gitSyncStationForbidden: "Akun layanan integrasi tidak berhak membaca repositori ini. Ikat repositori ke integrasi di GitStation.",
  gitSyncStationNotFound: "Repositori atau integrasi tidak ditemukan di GitStation, atau tidak terlihat dari integrasi ini. Periksa URL dan ID integrasi.",
  gitSyncStationGone: "Posisi riwayat peristiwa GitStation tidak berlaku lagi. Statusnya dibaca ulang pada sinkronisasi berikutnya.",
  gitSyncStationRateLimited: "Batas penggunaan GitStation tercapai. Sinkronisasi berikutnya mencoba lagi.",
  gitSyncStationUnavailable: "GitStation sementara tidak tersedia. Sinkronisasi berikutnya mencoba lagi.",
  gitSyncStationNetwork: "Tidak dapat terhubung ke GitStation. Sinkronisasi berikutnya mencoba lagi.",
  gitSyncStationInvalidResponse: "GitStation memberi jawaban yang tidak terduga. Sinkronisasi berikutnya mencoba lagi (hubungi administrator jika berlanjut).",
  gitSyncStationHttp: "GitStation mengembalikan kesalahan ({status}). Sinkronisasi berikutnya mencoba lagi.",
  gitSyncAcceptanceRefused:
    "GitStation menolak laporan pemeriksaan. Minta administrator GitStation mengizinkan akun layanan integrasi melaporkan pemeriksaan kanflow untuk repositori ini (check-grants) dan memberinya akses Developer atau lebih tinggi.",
  gitSyncAcceptanceCommitMissing: "Commit tujuan laporan tidak ditemukan di GitStation. Akan dicoba lagi pada sinkronisasi berikutnya.",
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
  gitSetProvider: "Sumber",
  gitSetProviderGitlab: "GitLab",
  gitSetProviderGitstation: "GitStation",
  gitSetProviderLocked: "Sumber tidak dapat diubah selama masih ada repositori terdaftar (hapus repositori terlebih dahulu).",
  gitSetStationIntegration: "ID integrasi GitStation",
  gitSetStationIntegrationHelp: "ID yang diberikan administrator GitStation saat mendaftarkan integrasi. Gunakan token akun layanan integrasi sebagai token akses.",
  gitSetStationIntegrationSave: "Simpan ID integrasi",
  gitSetStationIntegrationMissing: "ID integrasi belum diatur. Tidak ada sinkronisasi sampai diatur.",
  gitSetAutoComplete: "Selesai otomatis saat merge",
  gitSetAutoCompleteHelp:
    "Jika SEMUA merge request yang tertaut ke sebuah PBI sudah di-merge, tugas PBI tersebut yang sedang dikerjakan di sprint aktif otomatis ditandai selesai.",
  gitSetAcceptanceCheck: "Laporkan kesiapan penerimaan ke GitStation",
  gitSetAcceptanceCheckHelp:
    "Untuk setiap merge request terbuka yang tertaut ke PBI, pemeriksaan \"kanflow/acceptance\" dilaporkan ke GitStation. Hasilnya \"berhasil\" jika setiap PBI yang tertaut memiliki tugas di sprint yang terbuka dan minimal satu kriteria penerimaan, dan cara pembuktian semua kriteria itu sudah ditentukan; jika belum, hasilnya \"perlu tindakan\". Ini hanya laporan: apakah merge menunggu pemeriksaan ini diatur di GitStation. Merge request yang tertaut ke PBI rahasia tidak dilaporkan.",
  gitSetAcceptanceCheckError: "Gagal melaporkan ({time})",
  gitSetAcceptanceCheckErrorNoTime: "Gagal melaporkan",
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
