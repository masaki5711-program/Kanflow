/**
 * i18n domain: plan templates (計画テンプレート) — the load / save / 仮置き
 * dialogs of 全体計画, the template library (/templates) and its editor, and
 * the 日程未定 (undated) labels of the plan page. Template CONTENT (stage
 * names, checks, documents) is user text and never translated here.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface PlanTemplatesTranslations {
  tplUndated: string
  tplUndatedFieldHint: string
  tplUndatedBarLabel: string
  tplUndatedBarLabelEdit: string
  tplDurationApprox: string
  tplNav: string
  tplLoadButton: string
  tplSaveAsButton: string
  tplLoadTitle: string
  tplLoadDesc: string
  tplSearch: string
  tplSectionBuiltin: string
  tplSectionMine: string
  tplSectionShared: string
  tplStageCount: string
  tplNoTemplates: string
  tplNoMatches: string
  tplManage: string
  tplPreview: string
  tplSelectPrompt: string
  tplInsertPosition: string
  tplInsertTop: string
  tplAlreadyApplied: string
  tplLoadSubmit: string
  tplLoaded: string
  tplLoadFailed: string
  tplSelectAll: string
  tplSelectNone: string
  tplSelectedCount: string
  tplMilestone: string
  tplChecklist: string
  tplPrivateBadge: string
  tplBuiltinBadge: string
  tplChecksHeading: string
  tplChecksDefaultLabel: string
  tplDocumentsHeading: string
  tplBudgetEnabled: string
  tplScheduleTitle: string
  tplScheduleDesc: string
  tplScheduleStart: string
  tplScheduleSubmit: string
  tplScheduleSkip: string
  tplScheduled: string
  tplScheduleFailed: string
  tplScheduleAction: string
  tplScheduleBanner: string
  tplSystemUser: string
  tplBuiltinShared: string
  tplSaveTitle: string
  tplSaveDesc: string
  tplName: string
  tplDescription: string
  tplVisibility: string
  tplVisibilityPublic: string
  tplVisibilityPrivate: string
  tplVisibilityHint: string
  tplVisibilityLocked: string
  tplSaveSubmit: string
  tplSaved: string
  tplOpenTemplate: string
  tplNameRequired: string
  tplLibraryTitle: string
  tplLibraryDesc: string
  tplNew: string
  tplDuplicate: string
  tplDelete: string
  tplEdit: string
  tplDeleteConfirmTitle: string
  tplDeleteConfirmMessage: string
  tplDeleted: string
  tplDuplicated: string
  tplUpdatedBy: string
  tplOwnerLabel: string
  tplBack: string
  tplEditorTitleNew: string
  tplEditorTitleEdit: string
  tplStages: string
  tplStagesHint: string
  tplAddStage: string
  tplAddChild: string
  tplStageName: string
  tplStageNameRequired: string
  tplMoveUp: string
  tplMoveDown: string
  tplIndent: string
  tplOutdent: string
  tplRemoveStage: string
  tplStageDetails: string
  tplDuration: string
  tplDaysUnit: string
  tplChecklistHint: string
  tplStageDescription: string
  tplExtras: string
  tplExtrasHint: string
  tplCheckLabel: string
  tplCheckLabelHint: string
  tplChecks: string
  tplCheckName: string
  tplCheckCriterion: string
  tplAddCheck: string
  tplRemoveCheck: string
  tplDocuments: string
  tplDocumentName: string
  tplAddDocument: string
  tplRemoveDocument: string
  tplBudget: string
  tplSave: string
  tplSavedEdit: string
  tplResetDefault: string
  tplResetConfirmTitle: string
  tplResetConfirmMessage: string
  tplResetDone: string
  tplConflictTitle: string
  tplConflictMessage: string
  tplConflictReload: string
  tplHistory: string
  tplHistoryEmpty: string
  tplHistoryCreate: string
  tplHistoryUpdate: string
  tplHistoryReset: string
  tplHistoryDuplicate: string
  tplHistoryView: string
  tplHistoryVersion: string
  tplHistoryEntry: string
  tplNoStages: string
  tplStagesRequired: string
  tplLimitReached: string
  tplNotFound: string
  tplLoadListFailed: string
  tplSaveFailed: string
  tplUnknownUser: string
}

export const ja: PlanTemplatesTranslations = {
  tplUndated: "日程未定",
  tplUndatedFieldHint: "空欄のままにすると日程未定になります",
  tplUndatedBarLabel: "{name}：日程未定",
  tplUndatedBarLabelEdit: "{name}：日程未定（開いて日付を設定）",
  tplDurationApprox: "目安 {n}日",
  tplNav: "計画テンプレート",
  tplLoadButton: "テンプレートを読み込む",
  tplSaveAsButton: "この計画をテンプレートとして保存",
  tplLoadTitle: "テンプレートを読み込む",
  tplLoadDesc: "大枠の計画を日程未定の項目として追加します。不要な工程はチェックを外してください。",
  tplSearch: "テンプレートを検索",
  tplSectionBuiltin: "共通テンプレート",
  tplSectionMine: "自分のテンプレート",
  tplSectionShared: "みんなのテンプレート",
  tplStageCount: "{n}工程",
  tplNoTemplates: "テンプレートがありません",
  tplNoMatches: "一致するテンプレートがありません",
  tplManage: "テンプレートを管理",
  tplPreview: "プレビュー",
  tplSelectPrompt: "一覧からテンプレートを選んでください",
  tplInsertPosition: "追加する位置",
  tplInsertTop: "最上位（計画の末尾）",
  tplAlreadyApplied: "このテンプレートはすでに読み込み済みです（{date}・{name}）。読み込むと同じ工程がもう一度追加されます。",
  tplLoadSubmit: "{n}項目を読み込む",
  tplLoaded: "「{name}」を読み込みました（{n}項目・日程未定）",
  tplLoadFailed: "テンプレートの読み込みに失敗しました",
  tplSelectAll: "すべて選択",
  tplSelectNone: "すべて解除",
  tplSelectedCount: "{n} / {total} 項目を選択中",
  tplMilestone: "マイルストーン",
  tplChecklist: "完了条件",
  tplPrivateBadge: "自分だけ",
  tplBuiltinBadge: "共通",
  tplChecksHeading: "{label}項目",
  tplChecksDefaultLabel: "チェック",
  tplDocumentsHeading: "引き渡し資料",
  tplBudgetEnabled: "予算を管理する",
  tplScheduleTitle: "開始日を入れて日程を仮置き",
  tplScheduleDesc: "目安期間をもとに、日程未定の工程へ開始日から順に日付を入れます（あとから自由に変更できます）。目安期間のない工程は1日として置きます。",
  tplScheduleStart: "開始日",
  tplScheduleSubmit: "仮置きする",
  tplScheduleSkip: "日程未定のままにする",
  tplScheduled: "{n}項目に日程を仮置きしました",
  tplScheduleFailed: "日程の仮置きに失敗しました",
  tplScheduleAction: "日程を仮置き",
  tplScheduleBanner: "読み込んだ工程は日程未定です。目安期間から開始日を基準に日程を仮置きできます。",
  tplSystemUser: "システム（初期設定）",
  tplBuiltinShared: "共通テンプレートは全員に共有されます（自分だけにはできません）。",
  tplSaveTitle: "この計画をテンプレートとして保存",
  tplSaveDesc: "現在の計画の項目（階層・マイルストーン・完了条件）をテンプレートにします。日付は保存されず、各項目の期間が目安期間になります。",
  tplName: "テンプレート名",
  tplDescription: "説明",
  tplVisibility: "公開範囲",
  tplVisibilityPublic: "みんなに共有",
  tplVisibilityPrivate: "自分だけ",
  tplVisibilityHint: "共有したテンプレートは誰でも使えて、誰でも編集できます（変更履歴が残ります）。",
  tplVisibilityLocked: "公開範囲を変更できるのは作成者または管理者だけです",
  tplSaveSubmit: "保存",
  tplSaved: "テンプレート「{name}」を保存しました",
  tplOpenTemplate: "開く",
  tplNameRequired: "テンプレート名を入力してください",
  tplLibraryTitle: "計画テンプレート",
  tplLibraryDesc: "全体計画に読み込む大枠の計画です。共通テンプレートは誰でも編集でき、いつでもデフォルトに戻せます。",
  tplNew: "新しいテンプレート",
  tplDuplicate: "複製",
  tplDelete: "削除",
  tplEdit: "編集",
  tplDeleteConfirmTitle: "テンプレート「{name}」を削除しますか？",
  tplDeleteConfirmMessage: "このテンプレートから作成済みの計画は変わりません。",
  tplDeleted: "テンプレートを削除しました",
  tplDuplicated: "「{name}」を作成しました",
  tplUpdatedBy: "{date} {name} が更新",
  tplOwnerLabel: "作成者: {name}",
  tplBack: "テンプレート一覧へ",
  tplEditorTitleNew: "新しいテンプレート",
  tplEditorTitleEdit: "テンプレートを編集",
  tplStages: "工程",
  tplStagesHint: "工程は3階層・200項目まで。並べ替えや階層の変更はボタンで行えます。",
  tplAddStage: "工程を追加",
  tplAddChild: "子工程を追加",
  tplStageName: "工程名",
  tplStageNameRequired: "工程名を入力してください",
  tplMoveUp: "上へ移動",
  tplMoveDown: "下へ移動",
  tplIndent: "一段下げる（前の工程の子にする）",
  tplOutdent: "一段上げる",
  tplRemoveStage: "工程を削除",
  tplStageDetails: "詳細",
  tplDuration: "目安期間（日）",
  tplDaysUnit: "日",
  tplChecklistHint: "1行に1つ",
  tplStageDescription: "メモ",
  tplExtras: "マイルストーン・検収ボード用の設定",
  tplExtrasHint: "読み込んだ計画のマイルストーン・検収ボードで使います。",
  tplCheckLabel: "チェック項目の呼び名",
  tplCheckLabelHint: "例: 検収 / テスト / 評価 / 竣工検査",
  tplChecks: "チェック項目",
  tplCheckName: "項目名",
  tplCheckCriterion: "判定基準",
  tplAddCheck: "項目を追加",
  tplRemoveCheck: "項目を削除",
  tplDocuments: "引き渡し資料",
  tplDocumentName: "資料名",
  tplAddDocument: "資料を追加",
  tplRemoveDocument: "資料を削除",
  tplBudget: "予算を管理する",
  tplSave: "保存",
  tplSavedEdit: "テンプレートを保存しました",
  tplResetDefault: "デフォルトに戻す",
  tplResetConfirmTitle: "デフォルトに戻しますか？",
  tplResetConfirmMessage: "名前・説明・工程・チェック項目が出荷時の内容に戻ります。現在の内容は変更履歴に残ります。",
  tplResetDone: "デフォルトに戻しました",
  tplConflictTitle: "他の人が先に更新しました",
  tplConflictMessage: "このテンプレートは編集中に他のユーザーが更新しました。最新の内容を読み込んでから編集し直してください。",
  tplConflictReload: "最新の内容を読み込む",
  tplHistory: "変更履歴",
  tplHistoryEmpty: "履歴はありません",
  tplHistoryCreate: "作成",
  tplHistoryUpdate: "編集",
  tplHistoryReset: "デフォルトに戻す",
  tplHistoryDuplicate: "複製して作成",
  tplHistoryView: "この版を見る",
  tplHistoryVersion: "版 {n}",
  tplHistoryEntry: "{date}・{name}・{action}",
  tplNoStages: "工程がありません。「工程を追加」から追加してください。",
  tplStagesRequired: "工程を1つ以上追加してください",
  tplLimitReached: "工程は200項目までです",
  tplNotFound: "テンプレートが見つかりません",
  tplLoadListFailed: "テンプレートを取得できませんでした",
  tplSaveFailed: "テンプレートを保存できませんでした",
  tplUnknownUser: "（不明）",
}

export const en: PlanTemplatesTranslations = {
  tplUndated: "Not scheduled",
  tplUndatedFieldHint: "Leave empty to keep the item unscheduled",
  tplUndatedBarLabel: "{name}: not scheduled",
  tplUndatedBarLabelEdit: "{name}: not scheduled (open to set dates)",
  tplDurationApprox: "~{n} days",
  tplNav: "Plan templates",
  tplLoadButton: "Load template",
  tplSaveAsButton: "Save this plan as a template",
  tplLoadTitle: "Load a template",
  tplLoadDesc: "Adds the rough plan as unscheduled items. Uncheck the stages you do not need.",
  tplSearch: "Search templates",
  tplSectionBuiltin: "Common templates",
  tplSectionMine: "My templates",
  tplSectionShared: "Shared templates",
  tplStageCount: "{n} stages",
  tplNoTemplates: "No templates",
  tplNoMatches: "No templates match",
  tplManage: "Manage templates",
  tplPreview: "Preview",
  tplSelectPrompt: "Pick a template from the list",
  tplInsertPosition: "Insert position",
  tplInsertTop: "Top level (end of the plan)",
  tplAlreadyApplied: "This template was already loaded ({date}, {name}). Loading it again adds the same stages once more.",
  tplLoadSubmit: "Load {n} items",
  tplLoaded: "Loaded \"{name}\" ({n} items, not scheduled)",
  tplLoadFailed: "Could not load the template",
  tplSelectAll: "Select all",
  tplSelectNone: "Select none",
  tplSelectedCount: "{n} of {total} items selected",
  tplMilestone: "Milestone",
  tplChecklist: "Done criteria",
  tplPrivateBadge: "Only me",
  tplBuiltinBadge: "Common",
  tplChecksHeading: "{label} items",
  tplChecksDefaultLabel: "Check",
  tplDocumentsHeading: "Hand-over documents",
  tplBudgetEnabled: "Track budget",
  tplScheduleTitle: "Pencil in dates from a start date",
  tplScheduleDesc: "Fills the unscheduled stages one after another from the start date, using their approximate durations (you can change them later). Stages without a duration take one day.",
  tplScheduleStart: "Start date",
  tplScheduleSubmit: "Pencil in",
  tplScheduleSkip: "Keep unscheduled",
  tplScheduled: "Pencilled in dates for {n} items",
  tplScheduleFailed: "Could not pencil in the dates",
  tplScheduleAction: "Pencil in dates",
  tplScheduleBanner: "The loaded stages are not scheduled yet. You can pencil in dates from a start date using their approximate durations.",
  tplSystemUser: "System (initial setup)",
  tplBuiltinShared: "Common templates are shared with everyone (they cannot be made private).",
  tplSaveTitle: "Save this plan as a template",
  tplSaveDesc: "Turns the current plan items (hierarchy, milestones, done criteria) into a template. Dates are not saved; each item's length becomes its approximate duration.",
  tplName: "Template name",
  tplDescription: "Description",
  tplVisibility: "Visibility",
  tplVisibilityPublic: "Share with everyone",
  tplVisibilityPrivate: "Only me",
  tplVisibilityHint: "Shared templates can be used and edited by anyone (every change is kept in the history).",
  tplVisibilityLocked: "Only the creator or an admin can change the visibility",
  tplSaveSubmit: "Save",
  tplSaved: "Saved the template \"{name}\"",
  tplOpenTemplate: "Open",
  tplNameRequired: "Enter a template name",
  tplLibraryTitle: "Plan templates",
  tplLibraryDesc: "Rough plans to load into a master plan. Anyone can edit the common templates and reset them to the default at any time.",
  tplNew: "New template",
  tplDuplicate: "Duplicate",
  tplDelete: "Delete",
  tplEdit: "Edit",
  tplDeleteConfirmTitle: "Delete the template \"{name}\"?",
  tplDeleteConfirmMessage: "Plans already created from this template do not change.",
  tplDeleted: "Template deleted",
  tplDuplicated: "Created \"{name}\"",
  tplUpdatedBy: "Updated {date} by {name}",
  tplOwnerLabel: "Created by {name}",
  tplBack: "Back to templates",
  tplEditorTitleNew: "New template",
  tplEditorTitleEdit: "Edit template",
  tplStages: "Stages",
  tplStagesHint: "Up to 3 levels and 200 stages. Reorder and change levels with the buttons.",
  tplAddStage: "Add stage",
  tplAddChild: "Add sub-stage",
  tplStageName: "Stage name",
  tplStageNameRequired: "Enter a name for every stage",
  tplMoveUp: "Move up",
  tplMoveDown: "Move down",
  tplIndent: "Indent (make it a sub-stage of the previous one)",
  tplOutdent: "Outdent",
  tplRemoveStage: "Remove stage",
  tplStageDetails: "Details",
  tplDuration: "Approx. duration (days)",
  tplDaysUnit: "days",
  tplChecklistHint: "One per line",
  tplStageDescription: "Notes",
  tplExtras: "Milestone & acceptance board settings",
  tplExtrasHint: "Used by the milestone & acceptance board of plans loaded from this template.",
  tplCheckLabel: "Name of the check items",
  tplCheckLabelHint: "e.g. Acceptance / Test / Evaluation / Completion inspection",
  tplChecks: "Check items",
  tplCheckName: "Item",
  tplCheckCriterion: "Criterion",
  tplAddCheck: "Add item",
  tplRemoveCheck: "Remove item",
  tplDocuments: "Hand-over documents",
  tplDocumentName: "Document",
  tplAddDocument: "Add document",
  tplRemoveDocument: "Remove document",
  tplBudget: "Track budget",
  tplSave: "Save",
  tplSavedEdit: "Template saved",
  tplResetDefault: "Reset to default",
  tplResetConfirmTitle: "Reset to the default?",
  tplResetConfirmMessage: "The name, description, stages and check items go back to the shipped content. The current content stays in the history.",
  tplResetDone: "Reset to the default",
  tplConflictTitle: "Someone else saved first",
  tplConflictMessage: "Another user updated this template while you were editing. Load the latest content and make your changes again.",
  tplConflictReload: "Load the latest content",
  tplHistory: "History",
  tplHistoryEmpty: "No history",
  tplHistoryCreate: "Created",
  tplHistoryUpdate: "Edited",
  tplHistoryReset: "Reset to default",
  tplHistoryDuplicate: "Created as a copy",
  tplHistoryView: "View this version",
  tplHistoryVersion: "Version {n}",
  tplHistoryEntry: "{date} · {name} · {action}",
  tplNoStages: "No stages yet. Use \"Add stage\".",
  tplStagesRequired: "Add at least one stage",
  tplLimitReached: "At most 200 stages",
  tplNotFound: "Template not found",
  tplLoadListFailed: "Could not load the templates",
  tplSaveFailed: "Could not save the template",
  tplUnknownUser: "(unknown)",
}

export const id: PlanTemplatesTranslations = {
  tplUndated: "Belum dijadwalkan",
  tplUndatedFieldHint: "Kosongkan agar item tetap belum dijadwalkan",
  tplUndatedBarLabel: "{name}: belum dijadwalkan",
  tplUndatedBarLabelEdit: "{name}: belum dijadwalkan (buka untuk mengisi tanggal)",
  tplDurationApprox: "± {n} hari",
  tplNav: "Templat rencana",
  tplLoadButton: "Muat templat",
  tplSaveAsButton: "Simpan rencana ini sebagai templat",
  tplLoadTitle: "Muat templat",
  tplLoadDesc: "Menambahkan rencana garis besar sebagai item yang belum dijadwalkan. Hapus centang tahapan yang tidak diperlukan.",
  tplSearch: "Cari templat",
  tplSectionBuiltin: "Templat umum",
  tplSectionMine: "Templat saya",
  tplSectionShared: "Templat bersama",
  tplStageCount: "{n} tahapan",
  tplNoTemplates: "Tidak ada templat",
  tplNoMatches: "Tidak ada templat yang cocok",
  tplManage: "Kelola templat",
  tplPreview: "Pratinjau",
  tplSelectPrompt: "Pilih templat dari daftar",
  tplInsertPosition: "Posisi penambahan",
  tplInsertTop: "Tingkat teratas (akhir rencana)",
  tplAlreadyApplied: "Templat ini sudah pernah dimuat ({date}, {name}). Memuat lagi akan menambahkan tahapan yang sama sekali lagi.",
  tplLoadSubmit: "Muat {n} item",
  tplLoaded: "\"{name}\" dimuat ({n} item, belum dijadwalkan)",
  tplLoadFailed: "Gagal memuat templat",
  tplSelectAll: "Pilih semua",
  tplSelectNone: "Batalkan semua",
  tplSelectedCount: "{n} dari {total} item dipilih",
  tplMilestone: "Milestone",
  tplChecklist: "Kriteria selesai",
  tplPrivateBadge: "Hanya saya",
  tplBuiltinBadge: "Umum",
  tplChecksHeading: "Item {label}",
  tplChecksDefaultLabel: "pemeriksaan",
  tplDocumentsHeading: "Dokumen serah terima",
  tplBudgetEnabled: "Kelola anggaran",
  tplScheduleTitle: "Isi tanggal sementara dari tanggal mulai",
  tplScheduleDesc: "Mengisi tahapan yang belum dijadwalkan secara berurutan dari tanggal mulai berdasarkan perkiraan durasi (dapat diubah nanti). Tahapan tanpa durasi dihitung satu hari.",
  tplScheduleStart: "Tanggal mulai",
  tplScheduleSubmit: "Isi sementara",
  tplScheduleSkip: "Biarkan belum dijadwalkan",
  tplScheduled: "Tanggal sementara diisi untuk {n} item",
  tplScheduleFailed: "Gagal mengisi tanggal sementara",
  tplScheduleAction: "Isi tanggal sementara",
  tplScheduleBanner: "Tahapan yang dimuat belum dijadwalkan. Anda dapat mengisi tanggal sementara dari tanggal mulai berdasarkan perkiraan durasi.",
  tplSystemUser: "Sistem (pengaturan awal)",
  tplBuiltinShared: "Templat umum dibagikan ke semua orang (tidak dapat dijadikan pribadi).",
  tplSaveTitle: "Simpan rencana ini sebagai templat",
  tplSaveDesc: "Menjadikan item rencana saat ini (hierarki, milestone, kriteria selesai) sebagai templat. Tanggal tidak disimpan; lama setiap item menjadi perkiraan durasinya.",
  tplName: "Nama templat",
  tplDescription: "Deskripsi",
  tplVisibility: "Visibilitas",
  tplVisibilityPublic: "Bagikan ke semua",
  tplVisibilityPrivate: "Hanya saya",
  tplVisibilityHint: "Templat bersama dapat dipakai dan diubah siapa saja (setiap perubahan tercatat di riwayat).",
  tplVisibilityLocked: "Hanya pembuat atau admin yang dapat mengubah visibilitas",
  tplSaveSubmit: "Simpan",
  tplSaved: "Templat \"{name}\" disimpan",
  tplOpenTemplate: "Buka",
  tplNameRequired: "Masukkan nama templat",
  tplLibraryTitle: "Templat rencana",
  tplLibraryDesc: "Rencana garis besar untuk dimuat ke rencana induk. Siapa saja dapat mengubah templat umum dan mengembalikannya ke default kapan saja.",
  tplNew: "Templat baru",
  tplDuplicate: "Duplikat",
  tplDelete: "Hapus",
  tplEdit: "Ubah",
  tplDeleteConfirmTitle: "Hapus templat \"{name}\"?",
  tplDeleteConfirmMessage: "Rencana yang sudah dibuat dari templat ini tidak berubah.",
  tplDeleted: "Templat dihapus",
  tplDuplicated: "\"{name}\" dibuat",
  tplUpdatedBy: "Diperbarui {date} oleh {name}",
  tplOwnerLabel: "Dibuat oleh {name}",
  tplBack: "Kembali ke templat",
  tplEditorTitleNew: "Templat baru",
  tplEditorTitleEdit: "Ubah templat",
  tplStages: "Tahapan",
  tplStagesHint: "Maksimal 3 tingkat dan 200 tahapan. Urutan dan tingkat diubah dengan tombol.",
  tplAddStage: "Tambah tahapan",
  tplAddChild: "Tambah sub-tahapan",
  tplStageName: "Nama tahapan",
  tplStageNameRequired: "Isi nama setiap tahapan",
  tplMoveUp: "Naikkan",
  tplMoveDown: "Turunkan",
  tplIndent: "Menjorok (jadikan sub-tahapan dari tahapan sebelumnya)",
  tplOutdent: "Kurangi jorok",
  tplRemoveStage: "Hapus tahapan",
  tplStageDetails: "Detail",
  tplDuration: "Perkiraan durasi (hari)",
  tplDaysUnit: "hari",
  tplChecklistHint: "Satu per baris",
  tplStageDescription: "Catatan",
  tplExtras: "Pengaturan papan milestone & serah terima",
  tplExtrasHint: "Dipakai oleh papan milestone & serah terima pada rencana yang dimuat dari templat ini.",
  tplCheckLabel: "Sebutan item pemeriksaan",
  tplCheckLabelHint: "mis. Serah terima / Uji / Evaluasi / Inspeksi akhir",
  tplChecks: "Item pemeriksaan",
  tplCheckName: "Item",
  tplCheckCriterion: "Kriteria",
  tplAddCheck: "Tambah item",
  tplRemoveCheck: "Hapus item",
  tplDocuments: "Dokumen serah terima",
  tplDocumentName: "Dokumen",
  tplAddDocument: "Tambah dokumen",
  tplRemoveDocument: "Hapus dokumen",
  tplBudget: "Kelola anggaran",
  tplSave: "Simpan",
  tplSavedEdit: "Templat disimpan",
  tplResetDefault: "Kembalikan ke default",
  tplResetConfirmTitle: "Kembalikan ke default?",
  tplResetConfirmMessage: "Nama, deskripsi, tahapan, dan item pemeriksaan kembali ke isi bawaan. Isi saat ini tetap ada di riwayat.",
  tplResetDone: "Dikembalikan ke default",
  tplConflictTitle: "Orang lain menyimpan lebih dulu",
  tplConflictMessage: "Pengguna lain memperbarui templat ini saat Anda mengedit. Muat isi terbaru lalu ulangi perubahan Anda.",
  tplConflictReload: "Muat isi terbaru",
  tplHistory: "Riwayat",
  tplHistoryEmpty: "Tidak ada riwayat",
  tplHistoryCreate: "Dibuat",
  tplHistoryUpdate: "Diubah",
  tplHistoryReset: "Dikembalikan ke default",
  tplHistoryDuplicate: "Dibuat sebagai salinan",
  tplHistoryView: "Lihat versi ini",
  tplHistoryVersion: "Versi {n}",
  tplHistoryEntry: "{date} · {name} · {action}",
  tplNoStages: "Belum ada tahapan. Gunakan \"Tambah tahapan\".",
  tplStagesRequired: "Tambahkan minimal satu tahapan",
  tplLimitReached: "Maksimal 200 tahapan",
  tplNotFound: "Templat tidak ditemukan",
  tplLoadListFailed: "Gagal memuat templat",
  tplSaveFailed: "Gagal menyimpan templat",
  tplUnknownUser: "(tidak diketahui)",
}
