/**
 * i18n domain: Sprint review / retrospective (KPT) / archive.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface SprintReviewTranslations {
  sprintReviewDialogTitle: string
  sprintReviewComment: string
  sprintReviewCommentPlaceholder: string
  sprintRetrospectiveMemo: string
  sprintRetrospectiveMemoPlaceholder: string
  sprintKptKeep: string
  sprintKptKeepPlaceholder: string
  sprintKptProblem: string
  sprintKptProblemPlaceholder: string
  sprintKptTry: string
  sprintKptTryPlaceholder: string
  sprintRetrospectiveOther: string
  sprintRetrospectiveOtherPlaceholder: string
  sprintStatusChangeConfirm: string
  sprintSubmitAndChangeStatus: string
  sprintStatusArchived: string
  sprintArchive: string
  sprintUnarchive: string
  sprintArchivedSprints: string
  sprintShowArchived: string
  sprintHideArchived: string
  sprintActualScore: string
  /** Tooltip explaining how completed points are counted. */
  sprintActualScoreHint: string
  sprintReviewLegacyLabel: string
  sprintReviewLegacyReadOnly: string
  sprintKptAiSuggestionHeader: string
}

export const ja: SprintReviewTranslations = {
  sprintReviewDialogTitle: "スプリントステータス変更",
  sprintReviewComment: "レビューコメント",
  sprintReviewCommentPlaceholder: "スプリントレビューの結果・フィードバックを記入...",
  sprintRetrospectiveMemo: "振り返りメモ",
  sprintRetrospectiveMemoPlaceholder: "KPT（Keep/Problem/Try）や改善点を記入...",
  sprintKptKeep: "Keep（継続すること）",
  sprintKptKeepPlaceholder: "うまく行っていること、継続したい良い習慣を記入...",
  sprintKptProblem: "Problem（課題）",
  sprintKptProblemPlaceholder: "問題点・困ったこと・改善すべき点を記入...",
  sprintKptTry: "Try（次に試すこと）",
  sprintKptTryPlaceholder: "次のスプリントで試したいこと・改善アクションを記入...",
  sprintRetrospectiveOther: "その他メモ",
  sprintRetrospectiveOtherPlaceholder: "KPTに収まらない所感やメモを記入...",
  sprintStatusChangeConfirm: "ステータスを変更しますか？",
  sprintSubmitAndChangeStatus: "保存してステータス変更",
  sprintStatusArchived: "アーカイブ",
  sprintArchive: "アーカイブ",
  sprintUnarchive: "アーカイブ解除",
  sprintArchivedSprints: "アーカイブ済みスプリント",
  sprintShowArchived: "アーカイブ済みを表示",
  sprintHideArchived: "アーカイブ済みを非表示",
  sprintActualScore: "完了ポイント",
  sprintActualScoreHint: "全タスクが完了した PBI のポイント合計（ベロシティと同じ基準）",
  sprintReviewLegacyLabel: "旧形式",
  sprintReviewLegacyReadOnly: "旧形式・読み取り専用",
  sprintKptAiSuggestionHeader: "--- AI 提案 ---",
}

export const en: SprintReviewTranslations = {
  sprintReviewDialogTitle: "Change Sprint Status",
  sprintReviewComment: "Review Comment",
  sprintReviewCommentPlaceholder: "Enter sprint review results and feedback...",
  sprintRetrospectiveMemo: "Retrospective Memo",
  sprintRetrospectiveMemoPlaceholder: "Enter KPT (Keep/Problem/Try) or improvements...",
  sprintKptKeep: "Keep (What's working)",
  sprintKptKeepPlaceholder: "Good habits and things that are going well...",
  sprintKptProblem: "Problem (Issues)",
  sprintKptProblemPlaceholder: "Pain points, blockers, things to improve...",
  sprintKptTry: "Try (Next actions)",
  sprintKptTryPlaceholder: "Experiments and improvements for the next sprint...",
  sprintRetrospectiveOther: "Other Notes",
  sprintRetrospectiveOtherPlaceholder: "Freeform notes that don't fit into KPT...",
  sprintStatusChangeConfirm: "Change status?",
  sprintSubmitAndChangeStatus: "Save & Change Status",
  sprintStatusArchived: "Archived",
  sprintArchive: "Archive",
  sprintUnarchive: "Unarchive",
  sprintArchivedSprints: "Archived Sprints",
  sprintShowArchived: "Show Archived",
  sprintHideArchived: "Hide Archived",
  sprintActualScore: "Completed points",
  sprintActualScoreHint: "Points of the PBIs whose tasks are all done (same basis as velocity)",
  sprintReviewLegacyLabel: "legacy",
  sprintReviewLegacyReadOnly: "legacy · read-only",
  sprintKptAiSuggestionHeader: "--- AI suggestion ---",
}

export const id: SprintReviewTranslations = {
  sprintReviewDialogTitle: "Ubah Status Sprint",
  sprintReviewComment: "Komentar Review",
  sprintReviewCommentPlaceholder: "Masukkan hasil review sprint dan umpan balik...",
  sprintRetrospectiveMemo: "Memo Retrospektif",
  sprintRetrospectiveMemoPlaceholder: "Masukkan KPT (Keep/Problem/Try) atau perbaikan...",
  sprintKptKeep: "Keep (Yang berjalan baik)",
  sprintKptKeepPlaceholder: "Kebiasaan baik dan hal-hal yang berjalan lancar...",
  sprintKptProblem: "Problem (Masalah)",
  sprintKptProblemPlaceholder: "Masalah, hambatan, hal yang perlu diperbaiki...",
  sprintKptTry: "Try (Aksi berikutnya)",
  sprintKptTryPlaceholder: "Eksperimen dan perbaikan untuk sprint berikutnya...",
  sprintRetrospectiveOther: "Catatan Lain",
  sprintRetrospectiveOtherPlaceholder: "Catatan bebas yang tidak termasuk KPT...",
  sprintStatusChangeConfirm: "Ubah status?",
  sprintSubmitAndChangeStatus: "Simpan & Ubah Status",
  sprintStatusArchived: "Diarsipkan",
  sprintArchive: "Arsipkan",
  sprintUnarchive: "Batalkan Arsip",
  sprintArchivedSprints: "Sprint yang Diarsipkan",
  sprintShowArchived: "Tampilkan Arsip",
  sprintHideArchived: "Sembunyikan Arsip",
  sprintActualScore: "Poin selesai",
  sprintActualScoreHint: "Poin PBI yang semua tugasnya selesai (dasar yang sama dengan velocity)",
  sprintReviewLegacyLabel: "format lama",
  sprintReviewLegacyReadOnly: "format lama · hanya baca",
  sprintKptAiSuggestionHeader: "--- Saran AI ---",
}
