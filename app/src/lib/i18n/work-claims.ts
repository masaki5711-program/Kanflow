/**
 * i18n domain: 担当中 (work claims, W3) — the marks on sprint board cards and the
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
}
