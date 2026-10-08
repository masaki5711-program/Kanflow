/**
 * i18n domain: 改善成果ボード (improvement results board) of process_improvement
 * projects — /projects/[id]/releases (releases/improvement/**), its detail
 * dialog and the A3 QC-story Excel export (services/excel/improvement.export.ts).
 * Plain wording for factory staff; 'id' = Bahasa Indonesia for the YMMA floor.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ImprovementTranslations {
  kzBoardTitle: string
  kzBoardDesc: string
  kzReadOnly: string
  kzEmptyTitle: string
  kzEmptyDesc: string
  kzColumnEmpty: string
  kzDeferredSection: string
  kzStageMeasuring: string
  kzStageStandardized: string
  kzStageDeploying: string
  kzStageSustained: string
  kzStageDeferred: string
  kzStageMeasuringHint: string
  kzStageStandardizedHint: string
  kzStageDeployingHint: string
  kzStageSustainedHint: string
  kzStageDeferredHint: string
  kzSumEffect: string
  kzSumEffectUnit: string
  kzSumStandardized: string
  kzSumRollout: string
  kzSumItems: string
  kzSumByStage: string
  kzUsd: string
  kzUsdPerYear: string
  kzNone: string
  kzBefore: string
  kzAfter: string
  kzTarget: string
  kzAchievement: string
  kzWorsened: string
  kzNoMetric: string
  kzRolloutProgress: string
  kzNextCheck: string
  kzCheckOverdueOn: string
  kzPhotoCount: string
  kzOpenDetail: string
  kzDialogTitle: string
  kzSectionEffect: string
  kzSectionPhotos: string
  kzSectionStandard: string
  kzSectionRollout: string
  kzSectionChecks: string
  kzSectionMemo: string
  kzSectionStage: string
  kzMetricCategory: string
  kzCatNone: string
  kzCatTime: string
  kzCatQuality: string
  kzCatCost: string
  kzCatSafety: string
  kzCatOther: string
  kzMetricName: string
  kzMetricNamePlaceholder: string
  kzMetricUnit: string
  kzMetricUnitPlaceholder: string
  kzDirection: string
  kzDirDecrease: string
  kzDirIncrease: string
  kzAnnualEffect: string
  kzAnnualEffectHint: string
  kzSpaceSaved: string
  kzSpaceSavedHint: string
  kzSumSpace: string
  kzSqm: string
  kzNumberInvalid: string
  kzTargetDirectionWarn: string
  kzSaveEffect: string
  kzSaved: string
  kzSaveFailed: string
  kzPhotoBefore: string
  kzPhotoAfter: string
  kzPhotoDrop: string
  kzPhotoHint: string
  kzPhotoNone: string
  kzPhotoOpen: string
  kzPhotoDelete: string
  kzPhotoDeleteConfirm: string
  kzPhotoUploading: string
  kzPhotoUploaded: string
  kzPhotoUploadFailed: string
  kzPhotoNotImage: string
  kzPhotoTooMany: string
  kzStandardLink: string
  kzStandardLinkHint: string
  kzStandardizedAt: string
  kzOpenLink: string
  kzRolloutTarget: string
  kzRolloutPlaceholder: string
  kzRolloutAdd: string
  kzRolloutNone: string
  kzRolloutRemove: string
  kzRolloutStatusOf: string
  kzRolloutTodo: string
  kzRolloutDoing: string
  kzRolloutDone: string
  kzRolloutMoveUp: string
  kzRolloutMoveDown: string
  kzReleaseDate: string
  kzReleaseDateHint: string
  kzCheck1m: string
  kzCheck3m: string
  kzCheckCustom: string
  kzCheckDue: string
  kzCheckPending: string
  kzCheckOverdue: string
  kzCheckSustained: string
  kzCheckRegressed: string
  kzCheckNote: string
  kzCheckNotePlaceholder: string
  kzCheckRecordedBy: string
  kzCheckUndo: string
  kzCheckAddDate: string
  kzCheckAdd: string
  kzCheckDelete: string
  kzCheckNone: string
  kzCheckRecorded: string
  kzStageChange: string
  kzStageNeedsLink: string
  kzStageNeedsCheck: string
  kzStageChanged: string
  kzDelete: string
  kzExportTitle: string
  kzXlsSummarySheet: string
  kzXlsReportTitle: string
  kzXlsProject: string
  kzXlsCreated: string
  kzXlsOwner: string
  kzXlsTheme: string
  kzXlsCurrent: string
  kzXlsGoal: string
  kzXlsCountermeasure: string
  kzXlsEffect: string
  kzXlsStandard: string
  kzXlsRollout: string
  kzXlsChecks: string
  kzXlsStage: string
  kzXlsMetric: string
  kzXlsUnit: string
  kzXlsTotal: string
  kzXlsPhotos: string
  kzXlsReportNote: string
  kzXlsResult: string
  kzXlsCheckedBy: string
}

export const ja: ImprovementTranslations = {
  kzBoardTitle: "改善成果ボード",
  kzBoardDesc: "改善の効果（改善前 → 改善後）・標準化・横展開・定着確認をまとめて見られます",
  kzReadOnly: "閲覧と定着確認・横展開の状況の記録ができます（効果や段階の編集は改善オーナーが行います）",
  kzEmptyTitle: "改善成果はまだありません",
  kzEmptyDesc: "「改善バックログから取り込み」で、終わった改善を取り込みましょう",
  kzColumnEmpty: "なし",
  kzDeferredSection: "延期（{n} 件）",
  kzStageMeasuring: "効果確認中",
  kzStageStandardized: "標準化済み",
  kzStageDeploying: "横展開中",
  kzStageSustained: "定着確認済み",
  kzStageDeferred: "延期",
  kzStageMeasuringHint: "改善後の数値を測っているところ",
  kzStageStandardizedHint: "標準書を改訂し、やり方を決めた",
  kzStageDeployingHint: "ほかのライン・工場に広げているところ",
  kzStageSustainedHint: "時間がたっても元に戻っていないことを確認した",
  kzStageDeferredHint: "いったん止めているもの",
  kzSumEffect: "効果金額の合計",
  kzSumEffectUnit: "ドル/年",
  kzSumStandardized: "標準化済み",
  kzSumRollout: "横展開の完了率",
  kzSumItems: "改善の件数",
  kzSumByStage: "段階ごとの件数",
  kzUsd: "${value}",
  kzUsdPerYear: "${value}/年",
  kzNone: "—",
  kzBefore: "改善前",
  kzAfter: "改善後",
  kzTarget: "目標",
  kzAchievement: "達成率",
  kzWorsened: "悪化",
  kzNoMetric: "効果の数値がまだ入っていません",
  kzRolloutProgress: "横展開 {done}/{total}",
  kzNextCheck: "次の定着確認 {date}",
  kzCheckOverdueOn: "定着確認の期限切れ {date}",
  kzPhotoCount: "写真 {n} 枚",
  kzOpenDetail: "{title} の詳細を開く",
  kzDialogTitle: "改善成果の詳細",
  kzSectionEffect: "効果",
  kzSectionPhotos: "写真",
  kzSectionStandard: "標準化",
  kzSectionRollout: "横展開",
  kzSectionChecks: "定着確認",
  kzSectionMemo: "改善オーナーメモ",
  kzSectionStage: "段階",
  kzMetricCategory: "指標の種類",
  kzCatNone: "選んでください",
  kzCatTime: "時間",
  kzCatQuality: "品質",
  kzCatCost: "コスト",
  kzCatSafety: "安全",
  kzCatOther: "その他",
  kzMetricName: "指標名",
  kzMetricNamePlaceholder: "例：段取り時間",
  kzMetricUnit: "単位",
  kzMetricUnitPlaceholder: "例：分",
  kzDirection: "良い方向",
  kzDirDecrease: "少ないほど良い",
  kzDirIncrease: "多いほど良い",
  kzAnnualEffect: "効果金額（ドル/年）",
  kzAnnualEffectHint: "わかる場合だけ入れてください",
  kzSpaceSaved: "スペース削減（m²）",
  kzSpaceSavedHint: "削減した面積だけを入れます。金額への換算は今後対応予定です",
  kzSumSpace: "スペース削減の合計",
  kzSqm: "{value} m²",
  kzNumberInvalid: "数字で入れてください",
  kzTargetDirectionWarn: "目標が改善前より良くなっていません。「良い方向」を確かめてください",
  kzSaveEffect: "効果を保存",
  kzSaved: "保存しました",
  kzSaveFailed: "保存できませんでした",
  kzPhotoBefore: "改善前",
  kzPhotoAfter: "改善後",
  kzPhotoDrop: "クリックで選ぶ・ドラッグ＆ドロップ・Ctrl+V で貼り付け",
  kzPhotoHint: "{count}/{max} 枚",
  kzPhotoNone: "写真はまだありません",
  kzPhotoOpen: "{name} を大きく表示（新しいタブ）",
  kzPhotoDelete: "{name} を削除",
  kzPhotoDeleteConfirm: "写真「{name}」を削除しますか？元に戻せません。",
  kzPhotoUploading: "写真をアップロードしています…",
  kzPhotoUploaded: "写真を追加しました",
  kzPhotoUploadFailed: "{name}: アップロードできませんでした（{message}）",
  kzPhotoNotImage: "{name} は画像ではありません",
  kzPhotoTooMany: "写真は {max} 枚までです",
  kzStandardLink: "標準書リンク",
  kzStandardLinkHint: "作業標準書・手順書の保存場所（URL）。入れると「標準化済み」にできます",
  kzStandardizedAt: "標準化した日",
  kzOpenLink: "標準書を開く（新しいタブ）",
  kzRolloutTarget: "横展開先",
  kzRolloutPlaceholder: "例：第2ライン、YMMA 工場",
  kzRolloutAdd: "追加",
  kzRolloutNone: "横展開先はまだありません",
  kzRolloutRemove: "{name} を外す",
  kzRolloutStatusOf: "{name} の状況",
  kzRolloutTodo: "未着手",
  kzRolloutDoing: "実施中",
  kzRolloutDone: "完了",
  kzRolloutMoveUp: "{name} を上へ",
  kzRolloutMoveDown: "{name} を下へ",
  kzReleaseDate: "展開日",
  kzReleaseDateHint: "展開日を入れると、1 か月後と 3 か月後の定着確認が自動でできます",
  kzCheck1m: "1 か月後",
  kzCheck3m: "3 か月後",
  kzCheckCustom: "追加の確認",
  kzCheckDue: "期限 {date}",
  kzCheckPending: "まだ確認していません",
  kzCheckOverdue: "期限切れ",
  kzCheckSustained: "維持できている",
  kzCheckRegressed: "元に戻った",
  kzCheckNote: "メモ",
  kzCheckNotePlaceholder: "見た内容（任意）",
  kzCheckRecordedBy: "{name}・{date} に記録",
  kzCheckUndo: "記録を取り消す",
  kzCheckAddDate: "確認する日",
  kzCheckAdd: "確認日を追加",
  kzCheckDelete: "この確認を削除",
  kzCheckNone: "展開日を入れると定着確認ができます",
  kzCheckRecorded: "定着確認を記録しました",
  kzStageChange: "段階を変える",
  kzStageNeedsLink: "標準書リンクを入れると選べます",
  kzStageNeedsCheck: "定着確認で「維持できている」を記録すると選べます",
  kzStageChanged: "段階を「{stage}」にしました",
  kzDelete: "この改善成果を削除",
  kzExportTitle: "改善ごとの A3 報告書（QC ストーリー）と一覧を Excel で出力",
  kzXlsSummarySheet: "改善成果一覧",
  kzXlsReportTitle: "改善成果報告書",
  kzXlsProject: "プロジェクト",
  kzXlsCreated: "作成日",
  kzXlsOwner: "改善オーナー",
  kzXlsTheme: "テーマ",
  kzXlsCurrent: "現状把握（改善前）",
  kzXlsGoal: "目標",
  kzXlsCountermeasure: "対策",
  kzXlsEffect: "効果（改善後）",
  kzXlsStandard: "標準化",
  kzXlsRollout: "横展開",
  kzXlsChecks: "定着確認",
  kzXlsStage: "段階",
  kzXlsMetric: "指標",
  kzXlsUnit: "単位",
  kzXlsTotal: "合計",
  kzXlsPhotos: "写真",
  kzXlsReportNote: "改善前 {before} 枚 / 改善後 {after} 枚（写真は Kanflow で見られます）",
  kzXlsResult: "結果",
  kzXlsCheckedBy: "確認者",
}

export const en: ImprovementTranslations = {
  kzBoardTitle: "Improvement results board",
  kzBoardDesc: "Effect (before → after), standardization, rollout and sustainment checks of every improvement in one place",
  kzReadOnly: "You can view, record sustainment checks and update rollout status (the improvement owner edits effects and stages)",
  kzEmptyTitle: "No improvement results yet",
  kzEmptyDesc: "Use \"Import from improvement backlog\" to bring in finished improvements",
  kzColumnEmpty: "None",
  kzDeferredSection: "Deferred ({n})",
  kzStageMeasuring: "Measuring effect",
  kzStageStandardized: "Standardized",
  kzStageDeploying: "Rolling out",
  kzStageSustained: "Sustained",
  kzStageDeferred: "Deferred",
  kzStageMeasuringHint: "Measuring the numbers after the change",
  kzStageStandardizedHint: "The standard document was revised",
  kzStageDeployingHint: "Spreading to other lines / plants",
  kzStageSustainedHint: "Confirmed it has not slipped back over time",
  kzStageDeferredHint: "On hold for now",
  kzSumEffect: "Total effect",
  kzSumEffectUnit: "USD/year",
  kzSumStandardized: "Standardized",
  kzSumRollout: "Rollout completion",
  kzSumItems: "Improvements",
  kzSumByStage: "Improvements per stage",
  kzUsd: "${value}",
  kzUsdPerYear: "${value}/yr",
  kzNone: "—",
  kzBefore: "Before",
  kzAfter: "After",
  kzTarget: "Target",
  kzAchievement: "Achievement",
  kzWorsened: "Worse",
  kzNoMetric: "No effect numbers yet",
  kzRolloutProgress: "Rollout {done}/{total}",
  kzNextCheck: "Next check {date}",
  kzCheckOverdueOn: "Check overdue {date}",
  kzPhotoCount: "{n} photos",
  kzOpenDetail: "Open details of {title}",
  kzDialogTitle: "Improvement result",
  kzSectionEffect: "Effect",
  kzSectionPhotos: "Photos",
  kzSectionStandard: "Standardization",
  kzSectionRollout: "Rollout",
  kzSectionChecks: "Sustainment checks",
  kzSectionMemo: "Improvement owner note",
  kzSectionStage: "Stage",
  kzMetricCategory: "Metric type",
  kzCatNone: "Choose",
  kzCatTime: "Time",
  kzCatQuality: "Quality",
  kzCatCost: "Cost",
  kzCatSafety: "Safety",
  kzCatOther: "Other",
  kzMetricName: "Metric name",
  kzMetricNamePlaceholder: "e.g. Changeover time",
  kzMetricUnit: "Unit",
  kzMetricUnitPlaceholder: "e.g. min",
  kzDirection: "Better when",
  kzDirDecrease: "Lower is better",
  kzDirIncrease: "Higher is better",
  kzAnnualEffect: "Money effect (USD/year)",
  kzAnnualEffectHint: "Only if known",
  kzSpaceSaved: "Space reduction (m²)",
  kzSpaceSavedHint: "Area only. Conversion to a money amount is planned for later.",
  kzSumSpace: "Total space reduction",
  kzSqm: "{value} m²",
  kzNumberInvalid: "Enter a number",
  kzTargetDirectionWarn: "The target is not better than before. Check \"Better when\"",
  kzSaveEffect: "Save effect",
  kzSaved: "Saved",
  kzSaveFailed: "Could not save",
  kzPhotoBefore: "Before",
  kzPhotoAfter: "After",
  kzPhotoDrop: "Click to choose, drag & drop, or paste with Ctrl+V",
  kzPhotoHint: "{count}/{max} photos",
  kzPhotoNone: "No photos yet",
  kzPhotoOpen: "Show {name} large (new tab)",
  kzPhotoDelete: "Delete {name}",
  kzPhotoDeleteConfirm: "Delete the photo \"{name}\"? This cannot be undone.",
  kzPhotoUploading: "Uploading photos…",
  kzPhotoUploaded: "Photo added",
  kzPhotoUploadFailed: "{name}: could not upload ({message})",
  kzPhotoNotImage: "{name} is not an image",
  kzPhotoTooMany: "Up to {max} photos",
  kzStandardLink: "Standard document link",
  kzStandardLinkHint: "Where the work standard / procedure is stored (URL). Needed for \"Standardized\"",
  kzStandardizedAt: "Standardized on",
  kzOpenLink: "Open the standard (new tab)",
  kzRolloutTarget: "Rollout target",
  kzRolloutPlaceholder: "e.g. Line 2, YMMA plant",
  kzRolloutAdd: "Add",
  kzRolloutNone: "No rollout targets yet",
  kzRolloutRemove: "Remove {name}",
  kzRolloutStatusOf: "Status of {name}",
  kzRolloutTodo: "Not started",
  kzRolloutDoing: "In progress",
  kzRolloutDone: "Done",
  kzRolloutMoveUp: "Move {name} up",
  kzRolloutMoveDown: "Move {name} down",
  kzReleaseDate: "Rollout date",
  kzReleaseDateHint: "Setting the rollout date creates the 1-month and 3-month sustainment checks",
  kzCheck1m: "After 1 month",
  kzCheck3m: "After 3 months",
  kzCheckCustom: "Extra check",
  kzCheckDue: "Due {date}",
  kzCheckPending: "Not checked yet",
  kzCheckOverdue: "Overdue",
  kzCheckSustained: "Still sustained",
  kzCheckRegressed: "Slipped back",
  kzCheckNote: "Note",
  kzCheckNotePlaceholder: "What you saw (optional)",
  kzCheckRecordedBy: "Recorded by {name} on {date}",
  kzCheckUndo: "Undo the record",
  kzCheckAddDate: "Check date",
  kzCheckAdd: "Add check date",
  kzCheckDelete: "Delete this check",
  kzCheckNone: "Set the rollout date to get sustainment checks",
  kzCheckRecorded: "Sustainment check recorded",
  kzStageChange: "Change stage",
  kzStageNeedsLink: "Available once the standard document link is set",
  kzStageNeedsCheck: "Available once a check is recorded as \"Still sustained\"",
  kzStageChanged: "Stage changed to \"{stage}\"",
  kzDelete: "Delete this improvement result",
  kzExportTitle: "Export an A3 report (QC story) per improvement and the list to Excel",
  kzXlsSummarySheet: "Improvements",
  kzXlsReportTitle: "Improvement report",
  kzXlsProject: "Project",
  kzXlsCreated: "Created",
  kzXlsOwner: "Improvement owner",
  kzXlsTheme: "Theme",
  kzXlsCurrent: "Current state (before)",
  kzXlsGoal: "Target",
  kzXlsCountermeasure: "Countermeasure",
  kzXlsEffect: "Effect (after)",
  kzXlsStandard: "Standardization",
  kzXlsRollout: "Rollout",
  kzXlsChecks: "Sustainment checks",
  kzXlsStage: "Stage",
  kzXlsMetric: "Metric",
  kzXlsUnit: "Unit",
  kzXlsTotal: "Total",
  kzXlsPhotos: "Photos",
  kzXlsReportNote: "{before} before / {after} after photos (view them in Kanflow)",
  kzXlsResult: "Result",
  kzXlsCheckedBy: "Checked by",
}

export const id: ImprovementTranslations = {
  kzBoardTitle: "Papan hasil perbaikan",
  kzBoardDesc: "Efek (sebelum → sesudah), standarisasi, penerapan ke tempat lain dan pengecekan keberlanjutan dalam satu tempat",
  kzReadOnly: "Anda bisa melihat, mencatat pengecekan dan status penerapan (efek dan tahap diubah oleh pemilik perbaikan)",
  kzEmptyTitle: "Belum ada hasil perbaikan",
  kzEmptyDesc: "Gunakan \"Ambil dari backlog perbaikan\" untuk memasukkan perbaikan yang sudah selesai",
  kzColumnEmpty: "Tidak ada",
  kzDeferredSection: "Ditunda ({n})",
  kzStageMeasuring: "Cek efek",
  kzStageStandardized: "Sudah distandarkan",
  kzStageDeploying: "Sedang diterapkan",
  kzStageSustained: "Sudah terjaga",
  kzStageDeferred: "Ditunda",
  kzStageMeasuringHint: "Sedang mengukur angka setelah perbaikan",
  kzStageStandardizedHint: "Dokumen standar sudah direvisi",
  kzStageDeployingHint: "Sedang diterapkan ke line / pabrik lain",
  kzStageSustainedHint: "Sudah dicek tidak kembali seperti semula",
  kzStageDeferredHint: "Dihentikan sementara",
  kzSumEffect: "Total efek biaya",
  kzSumEffectUnit: "USD/tahun",
  kzSumStandardized: "Sudah distandarkan",
  kzSumRollout: "Penerapan selesai",
  kzSumItems: "Jumlah perbaikan",
  kzSumByStage: "Jumlah per tahap",
  kzUsd: "${value}",
  kzUsdPerYear: "${value}/thn",
  kzNone: "—",
  kzBefore: "Sebelum",
  kzAfter: "Sesudah",
  kzTarget: "Target",
  kzAchievement: "Pencapaian",
  kzWorsened: "Memburuk",
  kzNoMetric: "Angka efek belum diisi",
  kzRolloutProgress: "Penerapan {done}/{total}",
  kzNextCheck: "Cek berikutnya {date}",
  kzCheckOverdueOn: "Cek terlambat {date}",
  kzPhotoCount: "{n} foto",
  kzOpenDetail: "Buka detail {title}",
  kzDialogTitle: "Detail hasil perbaikan",
  kzSectionEffect: "Efek",
  kzSectionPhotos: "Foto",
  kzSectionStandard: "Standarisasi",
  kzSectionRollout: "Penerapan ke tempat lain",
  kzSectionChecks: "Pengecekan keberlanjutan",
  kzSectionMemo: "Catatan pemilik perbaikan",
  kzSectionStage: "Tahap",
  kzMetricCategory: "Jenis indikator",
  kzCatNone: "Pilih",
  kzCatTime: "Waktu",
  kzCatQuality: "Kualitas",
  kzCatCost: "Biaya",
  kzCatSafety: "Keselamatan",
  kzCatOther: "Lainnya",
  kzMetricName: "Nama indikator",
  kzMetricNamePlaceholder: "contoh: Waktu ganti model",
  kzMetricUnit: "Satuan",
  kzMetricUnitPlaceholder: "contoh: menit",
  kzDirection: "Lebih baik jika",
  kzDirDecrease: "Makin kecil makin baik",
  kzDirIncrease: "Makin besar makin baik",
  kzAnnualEffect: "Efek biaya (USD/tahun)",
  kzAnnualEffectHint: "Isi jika diketahui",
  kzSpaceSaved: "Pengurangan ruang (m²)",
  kzSpaceSavedHint: "Hanya luas. Konversi ke nilai uang direncanakan nanti.",
  kzSumSpace: "Total pengurangan ruang",
  kzSqm: "{value} m²",
  kzNumberInvalid: "Isi dengan angka",
  kzTargetDirectionWarn: "Target tidak lebih baik dari sebelum. Periksa \"Lebih baik jika\"",
  kzSaveEffect: "Simpan efek",
  kzSaved: "Tersimpan",
  kzSaveFailed: "Gagal menyimpan",
  kzPhotoBefore: "Sebelum",
  kzPhotoAfter: "Sesudah",
  kzPhotoDrop: "Klik untuk memilih, seret & lepas, atau tempel dengan Ctrl+V",
  kzPhotoHint: "{count}/{max} foto",
  kzPhotoNone: "Belum ada foto",
  kzPhotoOpen: "Tampilkan {name} besar (tab baru)",
  kzPhotoDelete: "Hapus {name}",
  kzPhotoDeleteConfirm: "Hapus foto \"{name}\"? Tidak dapat dibatalkan.",
  kzPhotoUploading: "Mengunggah foto…",
  kzPhotoUploaded: "Foto ditambahkan",
  kzPhotoUploadFailed: "{name}: gagal diunggah ({message})",
  kzPhotoNotImage: "{name} bukan gambar",
  kzPhotoTooMany: "Maksimal {max} foto",
  kzStandardLink: "Tautan dokumen standar",
  kzStandardLinkHint: "Lokasi standar kerja / prosedur (URL). Diperlukan untuk \"Sudah distandarkan\"",
  kzStandardizedAt: "Tanggal distandarkan",
  kzOpenLink: "Buka dokumen standar (tab baru)",
  kzRolloutTarget: "Tujuan penerapan",
  kzRolloutPlaceholder: "contoh: Line 2, pabrik YMMA",
  kzRolloutAdd: "Tambah",
  kzRolloutNone: "Belum ada tujuan penerapan",
  kzRolloutRemove: "Hapus {name}",
  kzRolloutStatusOf: "Status {name}",
  kzRolloutTodo: "Belum mulai",
  kzRolloutDoing: "Sedang berjalan",
  kzRolloutDone: "Selesai",
  kzRolloutMoveUp: "Pindahkan {name} ke atas",
  kzRolloutMoveDown: "Pindahkan {name} ke bawah",
  kzReleaseDate: "Tanggal penerapan",
  kzReleaseDateHint: "Mengisi tanggal penerapan otomatis membuat pengecekan 1 bulan dan 3 bulan",
  kzCheck1m: "Setelah 1 bulan",
  kzCheck3m: "Setelah 3 bulan",
  kzCheckCustom: "Cek tambahan",
  kzCheckDue: "Batas {date}",
  kzCheckPending: "Belum dicek",
  kzCheckOverdue: "Terlambat",
  kzCheckSustained: "Masih terjaga",
  kzCheckRegressed: "Kembali seperti semula",
  kzCheckNote: "Catatan",
  kzCheckNotePlaceholder: "Apa yang dilihat (opsional)",
  kzCheckRecordedBy: "Dicatat oleh {name} pada {date}",
  kzCheckUndo: "Batalkan catatan",
  kzCheckAddDate: "Tanggal cek",
  kzCheckAdd: "Tambah tanggal cek",
  kzCheckDelete: "Hapus cek ini",
  kzCheckNone: "Isi tanggal penerapan untuk membuat pengecekan",
  kzCheckRecorded: "Pengecekan dicatat",
  kzStageChange: "Ubah tahap",
  kzStageNeedsLink: "Bisa dipilih setelah tautan dokumen standar diisi",
  kzStageNeedsCheck: "Bisa dipilih setelah ada cek \"Masih terjaga\"",
  kzStageChanged: "Tahap diubah menjadi \"{stage}\"",
  kzDelete: "Hapus hasil perbaikan ini",
  kzExportTitle: "Ekspor laporan A3 (QC story) per perbaikan dan daftarnya ke Excel",
  kzXlsSummarySheet: "Daftar perbaikan",
  kzXlsReportTitle: "Laporan hasil perbaikan",
  kzXlsProject: "Proyek",
  kzXlsCreated: "Dibuat",
  kzXlsOwner: "Pemilik perbaikan",
  kzXlsTheme: "Tema",
  kzXlsCurrent: "Kondisi saat ini (sebelum)",
  kzXlsGoal: "Target",
  kzXlsCountermeasure: "Penanggulangan",
  kzXlsEffect: "Efek (sesudah)",
  kzXlsStandard: "Standarisasi",
  kzXlsRollout: "Penerapan ke tempat lain",
  kzXlsChecks: "Pengecekan keberlanjutan",
  kzXlsStage: "Tahap",
  kzXlsMetric: "Indikator",
  kzXlsUnit: "Satuan",
  kzXlsTotal: "Total",
  kzXlsPhotos: "Foto",
  kzXlsReportNote: "{before} foto sebelum / {after} foto sesudah (lihat di Kanflow)",
  kzXlsResult: "Hasil",
  kzXlsCheckedBy: "Dicek oleh",
}
