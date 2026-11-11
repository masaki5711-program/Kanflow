/**
 * i18n domain (N4 / N5): why an open GitStation merge request cannot merge yet, who acts next, and its predicted
 * conflicts — the PBI's 開発 panel and the card badge (components/git-dev/merge-state.tsx). GitStation names the
 * reasons (docs/api/merge-status.md, a fixed vocabulary that may grow); the label and the next step are Kanflow's
 * (docs/integration/gitstation-operations-plan.md §5.3). An unknown name is shown as blocked, with its name.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GitMergeStateTranslations {
  gitMergeBlockedTitle: string
  gitMergeReady: string
  gitMergeCheckedAt: string
  gitMergeReasonUnknown: string
  gitMergeReasonNotOpen: string
  gitMergeReasonDraft: string
  gitMergeReasonMergeInProgress: string
  gitMergeReasonSourceBranchMissing: string
  gitMergeReasonMergeabilityUnknown: string
  gitMergeReasonConflict: string
  gitMergeReasonFfNotPossible: string
  gitMergeReasonNothingToMerge: string
  gitMergeReasonApprovalsMissing: string
  gitMergeReasonCodeownerApprovalMissing: string
  gitMergeReasonCodeownersInvalid: string
  gitMergeReasonRequiredCheckMissing: string
  gitMergeReasonRequiredCheckStale: string
  gitMergeReasonRequiredCheckNotSuccessful: string
  gitMergeReasonUnresolvedDiscussions: string
  gitMergeReasonWorkItemLinkMissing: string
  gitMergeReasonConfigChange: string
  gitMergeReasonChangedPathsUnknown: string
  gitMergeNextUndraft: string
  gitMergeNextRebase: string
  gitMergeNextApprove: string
  gitMergeNextCodeowner: string
  gitMergeNextWaitCheck: string
  gitMergeNextAcceptance: string
  gitMergeNextFixCheck: string
  gitMergeNextResolve: string
  gitMergeNextLinkPbi: string
  gitMergeNextMaintainer: string
  gitMergeNextWait: string
  gitMergeNextCheckInGitStation: string
  gitMergeApprovalsCount: string
  gitMergeCheckName: string
  gitMergeDiscussionsCount: string
  gitConflictTitle: string
  gitConflictPeer: string
  gitConflictPeerMore: string
  gitConflictPeerFailed: string
  gitConflictNone: string
  gitConflictUnchecked: string
  gitConflictPartial: string
  gitConflictStale: string
  gitConflictNote: string
  gitDevBadgeBlocked: string
  gitDevBadgeConflicts: string
  gitMergeNextPrefix: string
  gitMergeFact: string
  gitConflictPeerOne: string
  gitConflictPeerDraftMark: string
  gitDevBadgeBlockedOne: string
  gitDevBadgeConflictsOne: string
}

export const ja: GitMergeStateTranslations = {
  gitMergeBlockedTitle: "マージを止めているもの",
  gitMergeReady: "マージできる状態です",
  gitMergeCheckedAt: "{time}に確認",
  gitMergeReasonUnknown: "止まっている（{name}）",
  gitMergeReasonNotOpen: "開いていない",
  gitMergeReasonDraft: "下書き",
  gitMergeReasonMergeInProgress: "マージの途中",
  gitMergeReasonSourceBranchMissing: "元のブランチが無い",
  gitMergeReasonMergeabilityUnknown: "マージできるか確認中",
  gitMergeReasonConflict: "対象のブランチと衝突している",
  gitMergeReasonFfNotPossible: "早送りでマージできない",
  gitMergeReasonNothingToMerge: "マージする変更が無い",
  gitMergeReasonApprovalsMissing: "承認が足りない",
  gitMergeReasonCodeownerApprovalMissing: "持ち主（CODEOWNERS）の承認が無い",
  gitMergeReasonCodeownersInvalid: "CODEOWNERS に誤りがある",
  gitMergeReasonRequiredCheckMissing: "必須の検査の報告が無い",
  gitMergeReasonRequiredCheckStale: "必須の検査が古い版のもの",
  gitMergeReasonRequiredCheckNotSuccessful: "必須の検査が通っていない",
  gitMergeReasonUnresolvedDiscussions: "解決していない議論がある",
  gitMergeReasonWorkItemLinkMissing: "PBI が結ばれていない",
  gitMergeReasonConfigChange: "設定の変更に Maintainer の承認が要る",
  gitMergeReasonChangedPathsUnknown: "変更したファイルを確認中",
  gitMergeNextUndraft: "作者が下書きを解除する",
  gitMergeNextRebase: "作者が対象のブランチを取り込む（リベース）",
  gitMergeNextApprove: "承認できる人が承認する",
  gitMergeNextCodeowner: "持ち主が承認する",
  gitMergeNextWaitCheck: "検査の報告を待つ",
  gitMergeNextAcceptance: "Kanflow で受け入れ条件を整える（スプリント・受け入れ）",
  gitMergeNextFixCheck: "作者が検査を直す",
  gitMergeNextResolve: "作者とレビューした人が議論を解決する",
  gitMergeNextLinkPbi: "作者が PBI を結ぶ",
  gitMergeNextMaintainer: "Maintainer が承認する、または CODEOWNERS を直す",
  gitMergeNextWait: "GitStation が確かめるのを待つ",
  gitMergeNextCheckInGitStation: "GitStation で確かめる",
  gitMergeApprovalsCount: "承認 {counted}/{required}",
  gitMergeCheckName: "検査 {name}",
  gitMergeDiscussionsCount: "{count} 件",
  gitConflictTitle: "衝突の予測",
  gitConflictPeer: "!{iid} と {files} ファイル",
  gitConflictPeerMore: "!{iid} と {files} ファイル以上",
  gitConflictPeerFailed: "!{iid} とは試しのマージができなかった",
  gitConflictNone: "ほかの MR との衝突は予測されていません",
  gitConflictUnchecked: "衝突はまだ確かめられていません",
  gitConflictPartial: "一部の MR だけを確かめた結果です",
  gitConflictStale: "前の版で確かめた結果です",
  gitConflictNote: "GitStation の試しのマージによる予測です。予測が無くても衝突しないとは限りません",
  gitDevBadgeBlocked: "{count} 件の MR がマージを止められている",
  gitDevBadgeConflicts: "{count} 件の MR に衝突の予測",
  gitMergeNextPrefix: "次: ",
  gitMergeFact: "（{fact}）",
  gitConflictPeerOne: "!{iid} と 1 ファイル",
  gitConflictPeerDraftMark: "{text}（下書き）",
  gitDevBadgeBlockedOne: "1 件の MR がマージを止められている",
  gitDevBadgeConflictsOne: "1 件の MR に衝突の予測",
}

export const en: GitMergeStateTranslations = {
  gitMergeBlockedTitle: "What blocks the merge",
  gitMergeReady: "Ready to merge",
  gitMergeCheckedAt: "checked {time}",
  gitMergeReasonUnknown: "Blocked ({name})",
  gitMergeReasonNotOpen: "Not open",
  gitMergeReasonDraft: "Draft",
  gitMergeReasonMergeInProgress: "Merge in progress",
  gitMergeReasonSourceBranchMissing: "Source branch is missing",
  gitMergeReasonMergeabilityUnknown: "Checking whether it can merge",
  gitMergeReasonConflict: "Conflicts with the target branch",
  gitMergeReasonFfNotPossible: "Cannot fast-forward",
  gitMergeReasonNothingToMerge: "Nothing to merge",
  gitMergeReasonApprovalsMissing: "Not enough approvals",
  gitMergeReasonCodeownerApprovalMissing: "Code owner approval missing",
  gitMergeReasonCodeownersInvalid: "CODEOWNERS has an error",
  gitMergeReasonRequiredCheckMissing: "A required check has not reported",
  gitMergeReasonRequiredCheckStale: "A required check is for an older version",
  gitMergeReasonRequiredCheckNotSuccessful: "A required check has not passed",
  gitMergeReasonUnresolvedDiscussions: "Unresolved discussions",
  gitMergeReasonWorkItemLinkMissing: "No PBI linked",
  gitMergeReasonConfigChange: "A settings change needs a Maintainer's approval",
  gitMergeReasonChangedPathsUnknown: "Checking the changed files",
  gitMergeNextUndraft: "The author marks it ready",
  gitMergeNextRebase: "The author brings in the target branch (rebase)",
  gitMergeNextApprove: "Someone who can approve approves it",
  gitMergeNextCodeowner: "A code owner approves it",
  gitMergeNextWaitCheck: "Wait for the check to report",
  gitMergeNextAcceptance: "Settle the acceptance in Kanflow (sprint, acceptance criteria)",
  gitMergeNextFixCheck: "The author fixes the check",
  gitMergeNextResolve: "The author and reviewers resolve the discussions",
  gitMergeNextLinkPbi: "The author links the PBI",
  gitMergeNextMaintainer: "A Maintainer approves it or fixes CODEOWNERS",
  gitMergeNextWait: "Wait while GitStation checks",
  gitMergeNextCheckInGitStation: "Check it in GitStation",
  gitMergeApprovalsCount: "approvals {counted}/{required}",
  gitMergeCheckName: "check {name}",
  gitMergeDiscussionsCount: "{count} open",
  gitConflictTitle: "Predicted conflicts",
  gitConflictPeer: "{files} files in conflict with !{iid}",
  gitConflictPeerMore: "{files}+ files in conflict with !{iid}",
  gitConflictPeerFailed: "the trial merge with !{iid} could not run",
  gitConflictNone: "No conflict with other MRs is predicted",
  gitConflictUnchecked: "Conflicts have not been checked yet",
  gitConflictPartial: "Only some MRs were checked",
  gitConflictStale: "Checked on an earlier version",
  gitConflictNote: "Predicted by GitStation's trial merges. No prediction does not guarantee no conflict",
  gitDevBadgeBlocked: "{count} MRs blocked from merging",
  gitDevBadgeConflicts: "{count} MRs with predicted conflicts",
  gitMergeNextPrefix: "Next: ",
  gitMergeFact: " ({fact})",
  gitConflictPeerOne: "1 file in conflict with !{iid}",
  gitConflictPeerDraftMark: "{text} (draft)",
  gitDevBadgeBlockedOne: "1 MR blocked from merging",
  gitDevBadgeConflictsOne: "1 MR with predicted conflicts",
}

export const id: GitMergeStateTranslations = {
  gitMergeBlockedTitle: "Yang menahan merge",
  gitMergeReady: "Siap di-merge",
  gitMergeCheckedAt: "dicek {time}",
  gitMergeReasonUnknown: "Tertahan ({name})",
  gitMergeReasonNotOpen: "Tidak terbuka",
  gitMergeReasonDraft: "Draf",
  gitMergeReasonMergeInProgress: "Merge sedang berjalan",
  gitMergeReasonSourceBranchMissing: "Branch sumber tidak ada",
  gitMergeReasonMergeabilityUnknown: "Sedang dicek apakah bisa di-merge",
  gitMergeReasonConflict: "Konflik dengan branch tujuan",
  gitMergeReasonFfNotPossible: "Tidak bisa fast-forward",
  gitMergeReasonNothingToMerge: "Tidak ada perubahan untuk di-merge",
  gitMergeReasonApprovalsMissing: "Persetujuan kurang",
  gitMergeReasonCodeownerApprovalMissing: "Persetujuan pemilik kode (CODEOWNERS) belum ada",
  gitMergeReasonCodeownersInvalid: "CODEOWNERS berisi kesalahan",
  gitMergeReasonRequiredCheckMissing: "Pemeriksaan wajib belum melapor",
  gitMergeReasonRequiredCheckStale: "Pemeriksaan wajib untuk versi lama",
  gitMergeReasonRequiredCheckNotSuccessful: "Pemeriksaan wajib belum lulus",
  gitMergeReasonUnresolvedDiscussions: "Ada diskusi yang belum selesai",
  gitMergeReasonWorkItemLinkMissing: "PBI belum ditautkan",
  gitMergeReasonConfigChange: "Perubahan pengaturan perlu persetujuan Maintainer",
  gitMergeReasonChangedPathsUnknown: "Sedang mengecek file yang berubah",
  gitMergeNextUndraft: "Penulis mencabut status draf",
  gitMergeNextRebase: "Penulis mengambil branch tujuan (rebase)",
  gitMergeNextApprove: "Orang yang berwenang menyetujuinya",
  gitMergeNextCodeowner: "Pemilik kode menyetujuinya",
  gitMergeNextWaitCheck: "Tunggu laporan pemeriksaan",
  gitMergeNextAcceptance: "Rapikan penerimaan di Kanflow (sprint, kriteria penerimaan)",
  gitMergeNextFixCheck: "Penulis memperbaiki pemeriksaan",
  gitMergeNextResolve: "Penulis dan peninjau menyelesaikan diskusi",
  gitMergeNextLinkPbi: "Penulis menautkan PBI",
  gitMergeNextMaintainer: "Maintainer menyetujui atau memperbaiki CODEOWNERS",
  gitMergeNextWait: "Tunggu GitStation selesai mengecek",
  gitMergeNextCheckInGitStation: "Cek di GitStation",
  gitMergeApprovalsCount: "persetujuan {counted}/{required}",
  gitMergeCheckName: "pemeriksaan {name}",
  gitMergeDiscussionsCount: "{count} terbuka",
  gitConflictTitle: "Prediksi konflik",
  gitConflictPeer: "dengan !{iid}: {files} file",
  gitConflictPeerMore: "dengan !{iid}: {files}+ file",
  gitConflictPeerFailed: "dengan !{iid}: uji merge tidak bisa dijalankan",
  gitConflictNone: "Tidak ada prediksi konflik dengan MR lain",
  gitConflictUnchecked: "Konflik belum dicek",
  gitConflictPartial: "Hanya sebagian MR yang dicek",
  gitConflictStale: "Dicek pada versi sebelumnya",
  gitConflictNote: "Prediksi dari uji merge GitStation. Tanpa prediksi bukan berarti pasti tanpa konflik",
  gitDevBadgeBlocked: "{count} MR tertahan untuk di-merge",
  gitDevBadgeConflicts: "{count} MR dengan prediksi konflik",
  gitMergeNextPrefix: "Berikutnya: ",
  gitMergeFact: " ({fact})",
  gitConflictPeerOne: "dengan !{iid}: 1 file",
  gitConflictPeerDraftMark: "{text} (draf)",
  gitDevBadgeBlockedOne: "1 MR tertahan untuk di-merge",
  gitDevBadgeConflictsOne: "1 MR dengan prediksi konflik",
}
