/**
 * i18n domain: 担当中 (work claims, W3; 触る範囲 overlap / outside-scope warnings, W4) — the marks on sprint board cards and the
 * 「担当中」 panel of the PBI detail (components/work-claims/). Plain words for
 * non-engineers: a claim is 「担当中」, a heartbeat is 「最後の確認」.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface WorkClaimsTranslations {
  workClaimPanelTitle: string
  workClaimMarksLabel: string
  workClaimEmpty: string
  workClaimAi: string
  workClaimAiLabel: string
  workClaimStateActive: string
  workClaimStateStaleSoon: string
  workClaimStateStale: string
  workClaimWholePbi: string
  workClaimBranch: string
  workClaimSince: string
  workClaimLastSeen: string
  workClaimMarkLabel: string
  workClaimMarkLabelAi: string
  workClaimMore: string
  workClaimRelease: string
  workClaimReleaseLabel: string
  workClaimReleaseConfirmTitle: string
  workClaimReleaseConfirmMessage: string
  workClaimReleased: string
  workClaimReleaseFailed: string
  workClaimLoadFailed: string
  workClaimTruncated: string
  workClaimWarning: string
  workClaimOverlap: string
  workClaimScope: string
  workClaimOutsideScope: string
  workClaimPathSeparator: string
  /** N6: another open MR already changes files of this claim's scope ({pbis} = "（PBI-7）" or ""). */
  workClaimMrOverlap: string
  workClaimMrOverlapPbis: string
  /** Its file list was cut short: more files may overlap. */
  workClaimMrOverlapPartial: string
  /** N6: GitStation predicts this PBI's MR conflicts with another MR. */
  workClaimMrPredicted: string
  /** …with an MR this view does not name. */
  workClaimMrPredictedHidden: string
  workClaimMrPredictionUnchecked: string
  workClaimMrPathsPending: string
  /** The link after an MR warning (opens GitStation in a new tab). */
  workClaimMrOpen: string
  /** The MR data could not be read this time: no warning does not mean none. */
  workClaimMrUnavailable: string
}

export const ja: WorkClaimsTranslations = {
  workClaimPanelTitle: "担当中",
  workClaimMarksLabel: "担当中の人",
  workClaimEmpty: "いま担当中の人はいません",
  workClaimAi: "AI",
  workClaimAiLabel: "AI が作業",
  workClaimStateActive: "作業中",
  workClaimStateStaleSoon: "まもなく失効",
  workClaimStateStale: "失効",
  workClaimWholePbi: "PBI 全体",
  workClaimBranch: "ブランチ",
  workClaimSince: "開始",
  workClaimLastSeen: "最後の確認",
  workClaimMarkLabel: "{name} が担当中（{state}、最後の確認 {time}）",
  workClaimMarkLabelAi: "{name} の AI が担当中（{state}、最後の確認 {time}）",
  workClaimMore: "ほか {count} 件",
  workClaimRelease: "解除",
  workClaimReleaseLabel: "{name} の担当中を解除",
  workClaimReleaseConfirmTitle: "担当中を解除しますか？",
  workClaimReleaseConfirmMessage: "{name} の担当中を解除し、本人に知らせます。作業そのものは止まらないので、先に本人と話してください。",
  workClaimReleased: "担当中を解除しました",
  workClaimReleaseFailed: "担当中を解除できませんでした",
  workClaimLoadFailed: "担当中を読み込めませんでした",
  workClaimTruncated: "新しい {count} 件だけを表示しています",
  workClaimWarning: "注意",
  workClaimOverlap: "{name}さんの作業と範囲が重なっています: {paths}",
  workClaimScope: "触る範囲",
  workClaimOutsideScope: "{mr} は、宣言した範囲の外のファイルも変えています（{count} 件）: {paths}",
  workClaimPathSeparator: "、",
  workClaimMrOverlap: "{mr}{pbis} が、この範囲のファイルを変えています（{count} 件）: {paths}",
  workClaimMrOverlapPbis: "（{pbis}）",
  workClaimMrOverlapPartial: "（{mr} の変更ファイルは途中までしか読めていません）",
  workClaimMrPredicted: "{mr} は {peer} と衝突する見込みです（{files} ファイル）",
  workClaimMrPredictedHidden: "{mr} は別の MR と衝突する見込みです（{files} ファイル）",
  workClaimMrPredictionUnchecked: "{mrs} の衝突の予測は、まだ確かめきれていません（衝突しないとは限りません）",
  workClaimMrPathsPending: "変更ファイルをまだ読んでいない MR が {count} 件あります（次の同期で確かめます）",
  workClaimMrOpen: "{mr} を開く（新しいタブ）",
  workClaimMrUnavailable: "ほかの MR との重なりを今は確かめられませんでした",
}

export const en: WorkClaimsTranslations = {
  workClaimPanelTitle: "Working now",
  workClaimMarksLabel: "Who is working on this",
  workClaimEmpty: "Nobody is working on this right now",
  workClaimAi: "AI",
  workClaimAiLabel: "Done by an AI",
  workClaimStateActive: "Active",
  workClaimStateStaleSoon: "Expiring soon",
  workClaimStateStale: "Expired",
  workClaimWholePbi: "Whole PBI",
  workClaimBranch: "Branch",
  workClaimSince: "Since",
  workClaimLastSeen: "Last seen",
  workClaimMarkLabel: "{name} is working on this ({state}, last seen {time})",
  workClaimMarkLabelAi: "{name}'s AI is working on this ({state}, last seen {time})",
  workClaimMore: "+{count} more",
  workClaimRelease: "Release",
  workClaimReleaseLabel: "Release {name}'s claim",
  workClaimReleaseConfirmTitle: "Release this claim?",
  workClaimReleaseConfirmMessage: "{name}'s claim ends and they are told. Their work itself does not stop, so talk to them first.",
  workClaimReleased: "Claim released",
  workClaimReleaseFailed: "Could not release the claim",
  workClaimLoadFailed: "Could not load who is working on this",
  workClaimTruncated: "Showing the latest {count} only",
  workClaimWarning: "Warning",
  workClaimOverlap: "Overlaps with {name}'s work: {paths}",
  workClaimScope: "Touched scope",
  workClaimOutsideScope: "{mr} also changes {count} files outside the declared scope: {paths}",
  workClaimPathSeparator: ", ",
  workClaimMrOverlap: "{mr}{pbis} already changes files in this scope ({count}): {paths}",
  workClaimMrOverlapPbis: " ({pbis})",
  workClaimMrOverlapPartial: "(only part of {mr}'s changed files could be read)",
  workClaimMrPredicted: "{mr} is predicted to conflict with {peer} (files: {files})",
  workClaimMrPredictedHidden: "{mr} is predicted to conflict with another merge request (files: {files})",
  workClaimMrPredictionUnchecked: "The conflict prediction for {mrs} is not complete yet (a conflict is still possible)",
  workClaimMrPathsPending: "Merge requests whose changed files are not read yet: {count} (checked at the next sync)",
  workClaimMrOpen: "Open {mr} (new tab)",
  workClaimMrUnavailable: "Overlaps with other merge requests could not be checked right now",
}

export const id: WorkClaimsTranslations = {
  workClaimPanelTitle: "Sedang dikerjakan",
  workClaimMarksLabel: "Yang sedang mengerjakan",
  workClaimEmpty: "Belum ada yang sedang mengerjakan ini",
  workClaimAi: "AI",
  workClaimAiLabel: "Dikerjakan oleh AI",
  workClaimStateActive: "Aktif",
  workClaimStateStaleSoon: "Segera kedaluwarsa",
  workClaimStateStale: "Kedaluwarsa",
  workClaimWholePbi: "Seluruh PBI",
  workClaimBranch: "Branch",
  workClaimSince: "Sejak",
  workClaimLastSeen: "Terakhir terlihat",
  workClaimMarkLabel: "{name} sedang mengerjakan ini ({state}, terakhir terlihat {time})",
  workClaimMarkLabelAi: "AI milik {name} sedang mengerjakan ini ({state}, terakhir terlihat {time})",
  workClaimMore: "+{count} lainnya",
  workClaimRelease: "Lepaskan",
  workClaimReleaseLabel: "Lepaskan klaim {name}",
  workClaimReleaseConfirmTitle: "Lepaskan klaim ini?",
  workClaimReleaseConfirmMessage: "Klaim {name} berakhir dan ia diberi tahu. Pekerjaannya sendiri tidak berhenti, jadi bicarakan dulu dengannya.",
  workClaimReleased: "Klaim dilepaskan",
  workClaimReleaseFailed: "Klaim tidak dapat dilepaskan",
  workClaimLoadFailed: "Tidak dapat memuat siapa yang sedang mengerjakan",
  workClaimTruncated: "Hanya menampilkan {count} terbaru",
  workClaimWarning: "Peringatan",
  workClaimOverlap: "Cakupannya bertumpang tindih dengan pekerjaan {name}: {paths}",
  workClaimScope: "Cakupan yang diubah",
  workClaimOutsideScope: "{mr} juga mengubah {count} file di luar cakupan yang dinyatakan: {paths}",
  workClaimPathSeparator: ", ",
  workClaimMrOverlap: "{mr}{pbis} sudah mengubah {count} file dalam cakupan ini: {paths}",
  workClaimMrOverlapPbis: " ({pbis})",
  workClaimMrOverlapPartial: "(hanya sebagian file yang diubah {mr} yang terbaca)",
  workClaimMrPredicted: "{mr} diperkirakan berkonflik dengan {peer} ({files} file)",
  workClaimMrPredictedHidden: "{mr} diperkirakan berkonflik dengan merge request lain ({files} file)",
  workClaimMrPredictionUnchecked: "Prediksi konflik untuk {mrs} belum lengkap (konflik masih mungkin terjadi)",
  workClaimMrPathsPending: "File yang diubah oleh {count} merge request belum dibaca (diperiksa pada sinkronisasi berikutnya)",
  workClaimMrOpen: "Buka {mr} (tab baru)",
  workClaimMrUnavailable: "Tumpang tindih dengan merge request lain tidak dapat diperiksa saat ini",
}
