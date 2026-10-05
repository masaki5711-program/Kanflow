/**
 * i18n domain: マイルストーン・検収ボード of general (その他) projects —
 * /projects/[id]/releases (releases/milestones/**) and its Excel export
 * (services/excel/milestone.export.ts). Plain wording for factory staff;
 * 'id' = Bahasa Indonesia for the YMMA floor. Template texts (stage names,
 * check names, documents) are user content and never translated here.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */

export interface MilestonesTranslations {
  msBoardTitle: string
  msBoardDesc: string
  msTemplatesLine: string
  msReadOnly: string
  msLoadTemplate: string
  msOpenPlan: string
  msEmptyTitle: string
  msEmptyDesc: string
  msEmptyNoEdit: string
  msExportTitle: string
  msSettings: string
  msSettingsCheckLabel: string
  msSettingsCheckLabelHint: string
  msSettingsBudget: string
  msSettingsTrend: string
  msSaved: string
  msConflict: string
  msSumAria: string
  msSumStages: string
  msSumStagesDone: string
  msSumLate: string
  msSumNext: string
  msSumNextNone: string
  msSumChecks: string
  msSumChecksValue: string
  msAccepted: string
  msAcceptedBanner: string
  msSumPunch: string
  msSumPunchOpen: string
  msSumPunchOverdue: string
  msSumDocs: string
  msSumDocsValue: string
  msSumBudget: string
  msSumBudgetValue: string
  msOverBudget: string
  msUnderBudget: string
  msYen: string
  msNone: string
  msStageTrack: string
  msScrollPrev: string
  msScrollNext: string
  msStageOpen: string
  msUndated: string
  msPlanned: string
  msActual: string
  msLate: string
  msMilestone: string
  msConditionsCount: string
  msPunchCount: string
  msStatusNotStarted: string
  msStatusInProgress: string
  msStatusDone: string
  msStatusOnHold: string
  msPanelConditions: string
  msPanelConditionsNone: string
  msConditionTickedBy: string
  msConditionAdd: string
  msConditionAddPlaceholder: string
  msConditionRemove: string
  msPanelSchedule: string
  msPlannedStart: string
  msPlannedEnd: string
  msActualStart: string
  msActualEnd: string
  msStatus: string
  msDerivedHint: string
  msDatesIncomplete: string
  msPanelSteps: string
  msPanelPunch: string
  msEditInPlan: string
  msChecksDefaultLabel: string
  msChecksNone: string
  msCheckCriterion: string
  msCheckStage: string
  msCheckNoStage: string
  msResultPassed: string
  msResultConditional: string
  msResultFailed: string
  msResultPending: string
  msWitness: string
  msWitnessPlaceholder: string
  msCheckedAt: string
  msCheckNote: string
  msCheckRecordedBy: string
  msCheckUndo: string
  msCheckRecorded: string
  msCheckAdd: string
  msCheckName: string
  msCheckEdit: string
  msCheckDelete: string
  msDeleteConfirm: string
  msPunchAddPlaceholder: string
  msPunchAdd: string
  msPunchAdded: string
  msPunchFilter: string
  msFilterOpen: string
  msFilterOverdue: string
  msFilterMine: string
  msFilterAll: string
  msPunchNone: string
  msPunchTitle: string
  msPunchDetail: string
  msPunchAssignee: string
  msPunchAssigneeOther: string
  msPunchAssigneeNone: string
  msPunchAssigneeName: string
  msPunchDue: string
  msPunchOverdue: string
  msPunchStatusOpen: string
  msPunchStatusInProgress: string
  msPunchStatusDone: string
  msPunchStatusChanged: string
  msPunchEdit: string
  msPunchDelete: string
  msPunchClosedAt: string
  msPhotoAdd: string
  msPhotoOpen: string
  msPhotoDelete: string
  msPhotoUploading: string
  msPhotoUploaded: string
  msPhotoNotImage: string
  msPhotoTooMany: string
  msUploadFailed: string
  msDocsNone: string
  msDocReceived: string
  msDocPending: string
  msDocToggle: string
  msDocReceivedBy: string
  msDocAttach: string
  msDocFileOpen: string
  msDocFileDelete: string
  msDocAdd: string
  msDocName: string
  msDocDelete: string
  msFileUploaded: string
  msBudgetLine: string
  msBudgetPlanned: string
  msBudgetActual: string
  msBudgetVariance: string
  msBudgetTotal: string
  msBudgetNone: string
  msBudgetAdd: string
  msBudgetDelete: string
  msBudgetInvalid: string
  msTrendNone: string
  msMetricName: string
  msMetricUnit: string
  msMetricDirection: string
  msMetricDecrease: string
  msMetricIncrease: string
  msMetricBaseline: string
  msMetricTarget: string
  msMetricAdd: string
  msMetricDelete: string
  msMonth: string
  msValue: string
  msValueSave: string
  msChartLabel: string
  msChartEmpty: string
  msOnTarget: string
  msOffTarget: string
  msLatest: string
  msTabsLabel: string
  msTabPunch: string
  msTabDocs: string
  msTabBudget: string
  msTabTrend: string
  msXlsSummarySheet: string
  msXlsChecksSheet: string
  msXlsPunchSheet: string
  msXlsDocsSheet: string
  msXlsTrendSheet: string
  msXlsProject: string
  msXlsTemplates: string
  msXlsCreated: string
  msXlsNo: string
  msXlsStage: string
  msXlsConditions: string
  msXlsSignWitness: string
  msXlsSignInspector: string
  msXlsConfirm: string
  msXlsPhotoCount: string
  msXlsFileCount: string
  msXlsReceivedAt: string
  msXlsReceivedBy: string
  msXlsClosedAt: string
  msXlsCreatedBy: string
  msXlsTotals: string
}

export const ja: MilestonesTranslations = {
  msBoardTitle: "マイルストーン・検収ボード",
  msBoardDesc: "工程（ゲート）の進み具合、検収、残課題、引き渡し資料をまとめて見る",
  msTemplatesLine: "テンプレート: {names}",
  msReadOnly: "閲覧のみです。結果の記録や残課題の更新はプロジェクトメンバーが行えます。",
  msLoadTemplate: "テンプレートを読み込む",
  msOpenPlan: "全体計画を開く",
  msEmptyTitle: "まだ工程がありません",
  msEmptyDesc: "テンプレート（設備導入・建屋工事・IT導入など）を読み込むと、工程・チェック項目・引き渡し資料がそろいます。全体計画で工程を作ってもかまいません。",
  msEmptyNoEdit: "工程はプロジェクトオーナーまたはファシリテーターが全体計画で作成します。",
  msExportTitle: "マイルストーン・検収ボードを Excel で出力",
  msSettings: "ボードの設定",
  msSettingsCheckLabel: "チェック項目の呼び名",
  msSettingsCheckLabelHint: "例: 検収 / テスト / 評価 / 竣工検査（空欄なら「チェック項目」）",
  msSettingsBudget: "予算を管理する",
  msSettingsTrend: "推移（月ごとの指標）を使う",
  msSaved: "保存しました",
  msConflict: "ほかの人が先に更新しました。最新の内容を読み込みました。もう一度操作してください。",
  msSumAria: "ボードの集計",
  msSumStages: "工程",
  msSumStagesDone: "{done} / {total} 完了",
  msSumLate: "遅れ {n}",
  msSumNext: "次: {name}",
  msSumNextNone: "すべての工程が完了しました",
  msSumChecks: "{label}",
  msSumChecksValue: "{passed} / {total} 合格",
  msAccepted: "検収完了",
  msAcceptedBanner: "すべての{label}が合格しました（{label}完了）",
  msSumPunch: "残課題",
  msSumPunchOpen: "未完了",
  msSumPunchOverdue: "期限切れ {n}",
  msSumDocs: "引き渡し資料",
  msSumDocsValue: "{received} / {total} 揃った",
  msSumBudget: "予算",
  msSumBudgetValue: "実績 {actual} / 予算 {planned}",
  msOverBudget: "{value} 超過",
  msUnderBudget: "{value} 残り",
  msYen: "{value}円",
  msNone: "—",
  msStageTrack: "工程（ゲート）",
  msScrollPrev: "前の工程へ",
  msScrollNext: "次の工程へ",
  msStageOpen: "{name} の詳細を開く",
  msUndated: "日程未定",
  msPlanned: "予定",
  msActual: "実績",
  msLate: "遅れ",
  msMilestone: "マイルストーン",
  msConditionsCount: "完了条件 {done}/{total}",
  msPunchCount: "残課題 {n}",
  msStatusNotStarted: "未着手",
  msStatusInProgress: "進行中",
  msStatusDone: "完了",
  msStatusOnHold: "保留",
  msPanelConditions: "完了条件",
  msPanelConditionsNone: "完了条件はまだありません。",
  msConditionTickedBy: "{name}・{date}",
  msConditionAdd: "完了条件を追加",
  msConditionAddPlaceholder: "例: 検収書を受領",
  msConditionRemove: "完了条件「{label}」を削除",
  msPanelSchedule: "日程と状態",
  msPlannedStart: "予定開始",
  msPlannedEnd: "予定終了",
  msActualStart: "実績開始",
  msActualEnd: "実績終了",
  msStatus: "状態",
  msDerivedHint: "この工程の予定日と状態は、中の作業（全体計画の子項目）から自動で決まります。",
  msDatesIncomplete: "予定開始と予定終了は両方入れるか、両方空にしてください",
  msPanelSteps: "中の作業",
  msPanelPunch: "この工程の残課題",
  msEditInPlan: "全体計画で編集",
  msChecksDefaultLabel: "チェック項目",
  msChecksNone: "{label}の項目はまだありません。",
  msCheckCriterion: "判定基準",
  msCheckStage: "工程",
  msCheckNoStage: "（工程なし）",
  msResultPassed: "合格",
  msResultConditional: "条件付き合格",
  msResultFailed: "不合格",
  msResultPending: "未実施",
  msWitness: "立会者",
  msWitnessPlaceholder: "例: メーカー 山田様",
  msCheckedAt: "実施日",
  msCheckNote: "備考",
  msCheckRecordedBy: "記録: {name}",
  msCheckUndo: "結果を取り消す",
  msCheckRecorded: "{name}: {result} を記録しました",
  msCheckAdd: "項目を追加",
  msCheckName: "項目名",
  msCheckEdit: "「{name}」を編集",
  msCheckDelete: "「{name}」を削除",
  msDeleteConfirm: "「{name}」を削除しますか？",
  msPunchAddPlaceholder: "残課題を入力して Enter（例: 安全カバーのボルト不足）",
  msPunchAdd: "追加",
  msPunchAdded: "残課題を追加しました",
  msPunchFilter: "絞り込み",
  msFilterOpen: "未完了",
  msFilterOverdue: "期限切れ",
  msFilterMine: "自分の担当",
  msFilterAll: "すべて",
  msPunchNone: "該当する残課題はありません。",
  msPunchTitle: "内容",
  msPunchDetail: "詳しい内容",
  msPunchAssignee: "担当",
  msPunchAssigneeOther: "メンバー以外（名前を入力）",
  msPunchAssigneeNone: "未定",
  msPunchAssigneeName: "担当者名",
  msPunchDue: "期限",
  msPunchOverdue: "期限切れ",
  msPunchStatusOpen: "未着手",
  msPunchStatusInProgress: "対応中",
  msPunchStatusDone: "完了",
  msPunchStatusChanged: "「{name}」を「{status}」にしました",
  msPunchEdit: "「{name}」を編集",
  msPunchDelete: "「{name}」を削除",
  msPunchClosedAt: "完了 {date}",
  msPhotoAdd: "写真を追加（選択・ドラッグ・貼り付け）",
  msPhotoOpen: "写真 {name} を開く",
  msPhotoDelete: "写真 {name} を削除",
  msPhotoUploading: "アップロード中…",
  msPhotoUploaded: "写真を追加しました",
  msPhotoNotImage: "{name} は画像ではありません",
  msPhotoTooMany: "写真は {max} 枚までです",
  msUploadFailed: "{name}: {message}",
  msDocsNone: "引き渡し資料はまだありません。",
  msDocReceived: "揃った",
  msDocPending: "未提出",
  msDocToggle: "「{name}」を「揃った」にする",
  msDocReceivedBy: "{name}・{date}",
  msDocAttach: "ファイルを添付（選択・ドラッグ）",
  msDocFileOpen: "{name} を開く",
  msDocFileDelete: "{name} を削除",
  msDocAdd: "資料を追加",
  msDocName: "資料名",
  msDocDelete: "「{name}」を削除",
  msFileUploaded: "ファイルを添付しました",
  msBudgetLine: "項目",
  msBudgetPlanned: "予算",
  msBudgetActual: "実績",
  msBudgetVariance: "差異（実績−予算）",
  msBudgetTotal: "合計",
  msBudgetNone: "予算の項目はまだありません。",
  msBudgetAdd: "項目を追加",
  msBudgetDelete: "「{name}」を削除",
  msBudgetInvalid: "金額は数字で入力してください",
  msTrendNone: "推移を見る指標はまだありません。",
  msMetricName: "指標",
  msMetricUnit: "単位",
  msMetricDirection: "良い方向",
  msMetricDecrease: "小さいほど良い",
  msMetricIncrease: "大きいほど良い",
  msMetricBaseline: "改善前",
  msMetricTarget: "目標",
  msMetricAdd: "指標を追加",
  msMetricDelete: "指標「{name}」を削除",
  msMonth: "月",
  msValue: "値",
  msValueSave: "記録",
  msChartLabel: "{name} の月ごとの推移",
  msChartEmpty: "まだ値がありません。月と値を入れて記録してください。",
  msOnTarget: "目標達成",
  msOffTarget: "目標未達",
  msLatest: "最新 {month}: {value}",
  msTabsLabel: "ボードの内容",
  msTabPunch: "残課題",
  msTabDocs: "引き渡し資料",
  msTabBudget: "予算",
  msTabTrend: "推移",
  msXlsSummarySheet: "サマリー",
  msXlsChecksSheet: "{label}記録",
  msXlsPunchSheet: "残課題リスト",
  msXlsDocsSheet: "引き渡し資料",
  msXlsTrendSheet: "推移",
  msXlsProject: "プロジェクト",
  msXlsTemplates: "テンプレート",
  msXlsCreated: "出力日",
  msXlsNo: "No.",
  msXlsStage: "工程",
  msXlsConditions: "完了条件",
  msXlsSignWitness: "立会者 署名",
  msXlsSignInspector: "確認者 署名",
  msXlsConfirm: "確認欄",
  msXlsPhotoCount: "写真",
  msXlsFileCount: "添付",
  msXlsReceivedAt: "受領日",
  msXlsReceivedBy: "受領者",
  msXlsClosedAt: "完了日",
  msXlsCreatedBy: "起票",
  msXlsTotals: "集計",
}

export const en: MilestonesTranslations = {
  msBoardTitle: "Milestones & acceptance board",
  msBoardDesc: "Stages (gates), acceptance checks, punch list and hand-over documents in one place",
  msTemplatesLine: "Template: {names}",
  msReadOnly: "View only. Project members can record results and update the punch list.",
  msLoadTemplate: "Load a template",
  msOpenPlan: "Open the master plan",
  msEmptyTitle: "No stages yet",
  msEmptyDesc: "Load a template (equipment, building work, IT roll-out …) to get stages, check items and hand-over documents at once — or create stages in the master plan.",
  msEmptyNoEdit: "The project owner or facilitator creates the stages in the master plan.",
  msExportTitle: "Export the milestones board to Excel",
  msSettings: "Board settings",
  msSettingsCheckLabel: "Name of the check items",
  msSettingsCheckLabelHint: "e.g. Acceptance / Test / Evaluation / Completion inspection (empty = \"Checks\")",
  msSettingsBudget: "Track the budget",
  msSettingsTrend: "Use the trend (monthly metric)",
  msSaved: "Saved",
  msConflict: "Someone else updated it first. The latest data has been loaded — please try again.",
  msSumAria: "Board summary",
  msSumStages: "Stages",
  msSumStagesDone: "{done} / {total} done",
  msSumLate: "{n} late",
  msSumNext: "Next: {name}",
  msSumNextNone: "All stages are done",
  msSumChecks: "{label}",
  msSumChecksValue: "{passed} / {total} passed",
  msAccepted: "Accepted",
  msAcceptedBanner: "Every {label} item passed — {label} complete",
  msSumPunch: "Punch list",
  msSumPunchOpen: "open",
  msSumPunchOverdue: "{n} overdue",
  msSumDocs: "Hand-over documents",
  msSumDocsValue: "{received} / {total} received",
  msSumBudget: "Budget",
  msSumBudgetValue: "Actual {actual} / budget {planned}",
  msOverBudget: "{value} over",
  msUnderBudget: "{value} left",
  msYen: "¥{value}",
  msNone: "—",
  msStageTrack: "Stages (gates)",
  msScrollPrev: "Previous gates",
  msScrollNext: "Next gates",
  msStageOpen: "Open details of {name}",
  msUndated: "Not scheduled",
  msPlanned: "Plan",
  msActual: "Actual",
  msLate: "Late",
  msMilestone: "Milestone",
  msConditionsCount: "Done criteria {done}/{total}",
  msPunchCount: "{n} open punch items",
  msStatusNotStarted: "Not started",
  msStatusInProgress: "In progress",
  msStatusDone: "Done",
  msStatusOnHold: "On hold",
  msPanelConditions: "Done criteria",
  msPanelConditionsNone: "No done criteria yet.",
  msConditionTickedBy: "{name} · {date}",
  msConditionAdd: "Add a done criterion",
  msConditionAddPlaceholder: "e.g. Acceptance certificate received",
  msConditionRemove: "Remove the criterion \"{label}\"",
  msPanelSchedule: "Schedule and status",
  msPlannedStart: "Planned start",
  msPlannedEnd: "Planned end",
  msActualStart: "Actual start",
  msActualEnd: "Actual end",
  msStatus: "Status",
  msDerivedHint: "This stage's planned dates and status come from its steps (child items in the master plan).",
  msDatesIncomplete: "Enter both planned dates, or leave both empty",
  msPanelSteps: "Steps",
  msPanelPunch: "Punch items of this stage",
  msEditInPlan: "Edit in the master plan",
  msChecksDefaultLabel: "Checks",
  msChecksNone: "No {label} items yet.",
  msCheckCriterion: "Criterion",
  msCheckStage: "Stage",
  msCheckNoStage: "(no stage)",
  msResultPassed: "Passed",
  msResultConditional: "Passed with conditions",
  msResultFailed: "Failed",
  msResultPending: "Not checked",
  msWitness: "Witness",
  msWitnessPlaceholder: "e.g. Mr. Yamada (maker)",
  msCheckedAt: "Check date",
  msCheckNote: "Note",
  msCheckRecordedBy: "Recorded by {name}",
  msCheckUndo: "Clear the result",
  msCheckRecorded: "{name}: recorded {result}",
  msCheckAdd: "Add item",
  msCheckName: "Item",
  msCheckEdit: "Edit \"{name}\"",
  msCheckDelete: "Delete \"{name}\"",
  msDeleteConfirm: "Delete \"{name}\"?",
  msPunchAddPlaceholder: "Type a punch item and press Enter (e.g. bolt missing on the safety cover)",
  msPunchAdd: "Add",
  msPunchAdded: "Punch item added",
  msPunchFilter: "Filter",
  msFilterOpen: "Open",
  msFilterOverdue: "Overdue",
  msFilterMine: "Mine",
  msFilterAll: "All",
  msPunchNone: "No matching punch items.",
  msPunchTitle: "Item",
  msPunchDetail: "Details",
  msPunchAssignee: "Assignee",
  msPunchAssigneeOther: "Not a member (type a name)",
  msPunchAssigneeNone: "Unassigned",
  msPunchAssigneeName: "Assignee name",
  msPunchDue: "Due",
  msPunchOverdue: "Overdue",
  msPunchStatusOpen: "Open",
  msPunchStatusInProgress: "In progress",
  msPunchStatusDone: "Done",
  msPunchStatusChanged: "\"{name}\" is now \"{status}\"",
  msPunchEdit: "Edit \"{name}\"",
  msPunchDelete: "Delete \"{name}\"",
  msPunchClosedAt: "Closed {date}",
  msPhotoAdd: "Add photos (choose, drag or paste)",
  msPhotoOpen: "Open photo {name}",
  msPhotoDelete: "Delete photo {name}",
  msPhotoUploading: "Uploading…",
  msPhotoUploaded: "Photo added",
  msPhotoNotImage: "{name} is not an image",
  msPhotoTooMany: "Up to {max} photos",
  msUploadFailed: "{name}: {message}",
  msDocsNone: "No hand-over documents yet.",
  msDocReceived: "Received",
  msDocPending: "Not yet",
  msDocToggle: "Mark \"{name}\" as received",
  msDocReceivedBy: "{name} · {date}",
  msDocAttach: "Attach files (choose or drag)",
  msDocFileOpen: "Open {name}",
  msDocFileDelete: "Delete {name}",
  msDocAdd: "Add document",
  msDocName: "Document",
  msDocDelete: "Delete \"{name}\"",
  msFileUploaded: "File attached",
  msBudgetLine: "Item",
  msBudgetPlanned: "Budget",
  msBudgetActual: "Actual",
  msBudgetVariance: "Variance (actual − budget)",
  msBudgetTotal: "Total",
  msBudgetNone: "No budget lines yet.",
  msBudgetAdd: "Add line",
  msBudgetDelete: "Delete \"{name}\"",
  msBudgetInvalid: "Enter the amount as a number",
  msTrendNone: "No trend metrics yet.",
  msMetricName: "Metric",
  msMetricUnit: "Unit",
  msMetricDirection: "Better when",
  msMetricDecrease: "Lower is better",
  msMetricIncrease: "Higher is better",
  msMetricBaseline: "Baseline",
  msMetricTarget: "Target",
  msMetricAdd: "Add metric",
  msMetricDelete: "Delete metric \"{name}\"",
  msMonth: "Month",
  msValue: "Value",
  msValueSave: "Record",
  msChartLabel: "Monthly trend of {name}",
  msChartEmpty: "No values yet. Enter a month and a value.",
  msOnTarget: "On target",
  msOffTarget: "Below target",
  msLatest: "Latest {month}: {value}",
  msTabsLabel: "Board sections",
  msTabPunch: "Punch list",
  msTabDocs: "Hand-over documents",
  msTabBudget: "Budget",
  msTabTrend: "Trend",
  msXlsSummarySheet: "Summary",
  msXlsChecksSheet: "{label} record",
  msXlsPunchSheet: "Punch list",
  msXlsDocsSheet: "Hand-over documents",
  msXlsTrendSheet: "Trend",
  msXlsProject: "Project",
  msXlsTemplates: "Templates",
  msXlsCreated: "Exported",
  msXlsNo: "No.",
  msXlsStage: "Stage",
  msXlsConditions: "Done criteria",
  msXlsSignWitness: "Witness signature",
  msXlsSignInspector: "Inspector signature",
  msXlsConfirm: "Checked",
  msXlsPhotoCount: "Photos",
  msXlsFileCount: "Files",
  msXlsReceivedAt: "Received on",
  msXlsReceivedBy: "Received by",
  msXlsClosedAt: "Closed on",
  msXlsCreatedBy: "Raised by",
  msXlsTotals: "Totals",
}

export const id: MilestonesTranslations = {
  msBoardTitle: "Papan Milestone & Serah Terima",
  msBoardDesc: "Tahapan (gerbang), pemeriksaan serah terima, daftar sisa pekerjaan, dan dokumen serah terima di satu tempat",
  msTemplatesLine: "Template: {names}",
  msReadOnly: "Hanya lihat. Anggota proyek dapat mencatat hasil dan memperbarui daftar sisa pekerjaan.",
  msLoadTemplate: "Muat template",
  msOpenPlan: "Buka rencana induk",
  msEmptyTitle: "Belum ada tahapan",
  msEmptyDesc: "Muat template (pemasangan mesin, pekerjaan gedung, implementasi IT …) untuk langsung mendapatkan tahapan, item pemeriksaan, dan dokumen serah terima — atau buat tahapan di rencana induk.",
  msEmptyNoEdit: "Pemilik proyek atau fasilitator membuat tahapan di rencana induk.",
  msExportTitle: "Ekspor papan milestone ke Excel",
  msSettings: "Pengaturan papan",
  msSettingsCheckLabel: "Nama item pemeriksaan",
  msSettingsCheckLabelHint: "mis. Serah terima / Uji / Evaluasi / Inspeksi akhir (kosong = \"Pemeriksaan\")",
  msSettingsBudget: "Kelola anggaran",
  msSettingsTrend: "Gunakan tren (indikator bulanan)",
  msSaved: "Tersimpan",
  msConflict: "Orang lain sudah memperbarui lebih dulu. Data terbaru telah dimuat — silakan coba lagi.",
  msSumAria: "Ringkasan papan",
  msSumStages: "Tahapan",
  msSumStagesDone: "{done} / {total} selesai",
  msSumLate: "{n} terlambat",
  msSumNext: "Berikutnya: {name}",
  msSumNextNone: "Semua tahapan selesai",
  msSumChecks: "{label}",
  msSumChecksValue: "{passed} / {total} lulus",
  msAccepted: "Serah terima selesai",
  msAcceptedBanner: "Semua item {label} lulus — {label} selesai",
  msSumPunch: "Sisa pekerjaan",
  msSumPunchOpen: "belum selesai",
  msSumPunchOverdue: "{n} lewat tenggat",
  msSumDocs: "Dokumen serah terima",
  msSumDocsValue: "{received} / {total} diterima",
  msSumBudget: "Anggaran",
  msSumBudgetValue: "Realisasi {actual} / anggaran {planned}",
  msOverBudget: "lebih {value}",
  msUnderBudget: "sisa {value}",
  msYen: "¥{value}",
  msNone: "—",
  msStageTrack: "Tahapan (gerbang)",
  msScrollPrev: "Tahap sebelumnya",
  msScrollNext: "Tahap berikutnya",
  msStageOpen: "Buka detail {name}",
  msUndated: "Jadwal belum ditentukan",
  msPlanned: "Rencana",
  msActual: "Realisasi",
  msLate: "Terlambat",
  msMilestone: "Milestone",
  msConditionsCount: "Kriteria selesai {done}/{total}",
  msPunchCount: "{n} sisa pekerjaan",
  msStatusNotStarted: "Belum mulai",
  msStatusInProgress: "Berjalan",
  msStatusDone: "Selesai",
  msStatusOnHold: "Ditahan",
  msPanelConditions: "Kriteria selesai",
  msPanelConditionsNone: "Belum ada kriteria selesai.",
  msConditionTickedBy: "{name} · {date}",
  msConditionAdd: "Tambah kriteria selesai",
  msConditionAddPlaceholder: "mis. Berita acara serah terima diterima",
  msConditionRemove: "Hapus kriteria \"{label}\"",
  msPanelSchedule: "Jadwal dan status",
  msPlannedStart: "Rencana mulai",
  msPlannedEnd: "Rencana selesai",
  msActualStart: "Mulai aktual",
  msActualEnd: "Selesai aktual",
  msStatus: "Status",
  msDerivedHint: "Tanggal rencana dan status tahapan ini dihitung dari langkah di dalamnya (sub-item di rencana induk).",
  msDatesIncomplete: "Isi kedua tanggal rencana, atau kosongkan keduanya",
  msPanelSteps: "Langkah",
  msPanelPunch: "Sisa pekerjaan tahapan ini",
  msEditInPlan: "Edit di rencana induk",
  msChecksDefaultLabel: "Pemeriksaan",
  msChecksNone: "Belum ada item {label}.",
  msCheckCriterion: "Kriteria",
  msCheckStage: "Tahapan",
  msCheckNoStage: "(tanpa tahapan)",
  msResultPassed: "Lulus",
  msResultConditional: "Lulus bersyarat",
  msResultFailed: "Tidak lulus",
  msResultPending: "Belum diperiksa",
  msWitness: "Saksi",
  msWitnessPlaceholder: "mis. Bpk. Yamada (pembuat)",
  msCheckedAt: "Tanggal periksa",
  msCheckNote: "Catatan",
  msCheckRecordedBy: "Dicatat oleh {name}",
  msCheckUndo: "Hapus hasil",
  msCheckRecorded: "{name}: {result} dicatat",
  msCheckAdd: "Tambah item",
  msCheckName: "Item",
  msCheckEdit: "Edit \"{name}\"",
  msCheckDelete: "Hapus \"{name}\"",
  msDeleteConfirm: "Hapus \"{name}\"?",
  msPunchAddPlaceholder: "Ketik sisa pekerjaan lalu Enter (mis. baut penutup pengaman kurang)",
  msPunchAdd: "Tambah",
  msPunchAdded: "Sisa pekerjaan ditambahkan",
  msPunchFilter: "Saring",
  msFilterOpen: "Belum selesai",
  msFilterOverdue: "Lewat tenggat",
  msFilterMine: "Milik saya",
  msFilterAll: "Semua",
  msPunchNone: "Tidak ada sisa pekerjaan yang cocok.",
  msPunchTitle: "Isi",
  msPunchDetail: "Detail",
  msPunchAssignee: "Penanggung jawab",
  msPunchAssigneeOther: "Bukan anggota (ketik nama)",
  msPunchAssigneeNone: "Belum ditentukan",
  msPunchAssigneeName: "Nama penanggung jawab",
  msPunchDue: "Tenggat",
  msPunchOverdue: "Lewat tenggat",
  msPunchStatusOpen: "Belum dikerjakan",
  msPunchStatusInProgress: "Dikerjakan",
  msPunchStatusDone: "Selesai",
  msPunchStatusChanged: "\"{name}\" sekarang \"{status}\"",
  msPunchEdit: "Edit \"{name}\"",
  msPunchDelete: "Hapus \"{name}\"",
  msPunchClosedAt: "Selesai {date}",
  msPhotoAdd: "Tambah foto (pilih, seret, atau tempel)",
  msPhotoOpen: "Buka foto {name}",
  msPhotoDelete: "Hapus foto {name}",
  msPhotoUploading: "Mengunggah…",
  msPhotoUploaded: "Foto ditambahkan",
  msPhotoNotImage: "{name} bukan gambar",
  msPhotoTooMany: "Maksimal {max} foto",
  msUploadFailed: "{name}: {message}",
  msDocsNone: "Belum ada dokumen serah terima.",
  msDocReceived: "Diterima",
  msDocPending: "Belum diserahkan",
  msDocToggle: "Tandai \"{name}\" sudah diterima",
  msDocReceivedBy: "{name} · {date}",
  msDocAttach: "Lampirkan file (pilih atau seret)",
  msDocFileOpen: "Buka {name}",
  msDocFileDelete: "Hapus {name}",
  msDocAdd: "Tambah dokumen",
  msDocName: "Dokumen",
  msDocDelete: "Hapus \"{name}\"",
  msFileUploaded: "File dilampirkan",
  msBudgetLine: "Item",
  msBudgetPlanned: "Anggaran",
  msBudgetActual: "Realisasi",
  msBudgetVariance: "Selisih (realisasi − anggaran)",
  msBudgetTotal: "Total",
  msBudgetNone: "Belum ada baris anggaran.",
  msBudgetAdd: "Tambah baris",
  msBudgetDelete: "Hapus \"{name}\"",
  msBudgetInvalid: "Masukkan jumlah berupa angka",
  msTrendNone: "Belum ada indikator tren.",
  msMetricName: "Indikator",
  msMetricUnit: "Satuan",
  msMetricDirection: "Lebih baik jika",
  msMetricDecrease: "Makin kecil makin baik",
  msMetricIncrease: "Makin besar makin baik",
  msMetricBaseline: "Sebelum",
  msMetricTarget: "Target",
  msMetricAdd: "Tambah indikator",
  msMetricDelete: "Hapus indikator \"{name}\"",
  msMonth: "Bulan",
  msValue: "Nilai",
  msValueSave: "Catat",
  msChartLabel: "Tren bulanan {name}",
  msChartEmpty: "Belum ada nilai. Isi bulan dan nilai.",
  msOnTarget: "Mencapai target",
  msOffTarget: "Belum mencapai target",
  msLatest: "Terbaru {month}: {value}",
  msTabsLabel: "Bagian papan",
  msTabPunch: "Sisa pekerjaan",
  msTabDocs: "Dokumen serah terima",
  msTabBudget: "Anggaran",
  msTabTrend: "Tren",
  msXlsSummarySheet: "Ringkasan",
  msXlsChecksSheet: "Catatan {label}",
  msXlsPunchSheet: "Daftar sisa pekerjaan",
  msXlsDocsSheet: "Dokumen serah terima",
  msXlsTrendSheet: "Tren",
  msXlsProject: "Proyek",
  msXlsTemplates: "Template",
  msXlsCreated: "Diekspor",
  msXlsNo: "No.",
  msXlsStage: "Tahapan",
  msXlsConditions: "Kriteria selesai",
  msXlsSignWitness: "Tanda tangan saksi",
  msXlsSignInspector: "Tanda tangan pemeriksa",
  msXlsConfirm: "Paraf",
  msXlsPhotoCount: "Foto",
  msXlsFileCount: "Lampiran",
  msXlsReceivedAt: "Tanggal diterima",
  msXlsReceivedBy: "Diterima oleh",
  msXlsClosedAt: "Tanggal selesai",
  msXlsCreatedBy: "Dibuat oleh",
  msXlsTotals: "Total",
}
