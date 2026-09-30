/**
 * i18n domain: Excel export / import (P4). Sheet and column names of the
 * backlog / sprint / IceBox workbooks (built server-side in the viewer's
 * language), the "Excel 出力" buttons, the backlog import dialog and the
 * import template's instructions sheet.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {label} {row} {count} {create} {update} {skip} {error} {max} {value} {id} {size}.
 */
export interface ExcelIoTranslations {
  excelExport: string
  /** Tooltip of the export button. */
  excelExportHint: string
  excelImport: string
  excelImportTitle: string
  excelImportDescription: string
  excelImportTemplate: string
  excelImportChooseFile: string
  /** {size} MB, {max} rows. */
  excelImportFileHint: string
  excelImportCheck: string
  excelImportRun: string
  excelImportBack: string
  excelImportRowCol: string
  excelImportActionCol: string
  excelImportDetailCol: string
  excelImportActionCreate: string
  excelImportActionUpdate: string
  excelImportActionSkip: string
  excelImportActionError: string
  /** Dry-run summary. */
  excelImportSummary: string
  excelImportHasErrors: string
  excelImportNothing: string
  /** Toast after commit. */
  excelImportDone: string
  excelImportFailed: string
  /** Row error codes (dry run). {value} = offending cell. */
  excelImportErrPbiNotFound: string
  excelImportErrInvalidId: string
  excelImportErrDuplicateId: string
  excelImportErrInvalidStatus: string
  excelImportErrInvalidPoints: string
  excelImportErrTooLong: string
  excelImportErrGoalNotFound: string
  excelImportErrEmptyStory: string
  excelImportErrInvalid: string
  /** File-level errors. {max} rows. */
  excelImportErrTooManyRows: string
  excelImportErrUnreadable: string
  excelImportErrNoHeader: string
  /** Sheet names. */
  excelSheetBacklog: string
  excelSheetSprints: string
  excelSheetTasks: string
  excelSheetIcebox: string
  excelSheetInstructions: string
  /** Column headers not covered by the project-type labels. */
  excelColId: string
  excelColStatus: string
  excelColGoal: string
  excelColPlanItem: string
  excelColSprint: string
  excelColCreatedAt: string
  excelColUpdatedAt: string
  excelColPoNote: string
  excelColNotReadyReason: string
  excelColReferenceDoc: string
  /** {label} = column name; the Japanese / Indonesian side of a translated field. */
  excelColLangJa: string
  excelColLangId: string
  excelColSprintName: string
  excelColStartDate: string
  excelColEndDate: string
  excelColCapacity: string
  excelColActualScore: string
  excelColTaskCount: string
  excelColTaskDone: string
  excelColTask: string
  excelColPbi: string
  excelColAssignee: string
  excelColEstimate: string
  excelColActualHours: string
  excelColCompletedAt: string
  excelColAuthor: string
  excelColPbEpic: string
  excelColRejectionReason: string
  excelColFreezeReason: string
  excelColLinkedPbis: string
  excelTaskStatusReview: string
  /** Template instructions sheet. */
  excelTplIntro: string
  excelTplRuleId: string
  excelTplRuleEmpty: string
  excelTplRuleStatus: string
  excelTplRulePoints: string
  excelTplRuleGoal: string
  /** {max} rows, {size} MB. */
  excelTplRuleLimits: string
  excelTplRuleColumns: string
  excelTplExampleInitiative: string
  excelTplExampleEpic: string
  excelTplExampleStory: string
  excelTplExampleAc: string
}

export const ja: ExcelIoTranslations = {
  excelExport: "Excel 出力",
  excelExportHint: "表示中のデータを Excel ファイル（.xlsx）でダウンロードします",
  excelImport: "Excel 取込",
  excelImportTitle: "Excel からバックログを取り込む",
  excelImportDescription:
    "テンプレート（またはバックログの Excel 出力）に記入したファイルを選んでください。取り込む前に、追加・更新される内容とエラーを確認できます。",
  excelImportTemplate: "テンプレートをダウンロード",
  excelImportChooseFile: "Excel ファイル（.xlsx）",
  excelImportFileHint: ".xlsx 形式、{size} MB・{max} 行まで",
  excelImportCheck: "内容を確認",
  excelImportRun: "取り込む",
  excelImportBack: "ファイルを選び直す",
  excelImportRowCol: "行",
  excelImportActionCol: "処理",
  excelImportDetailCol: "内容",
  excelImportActionCreate: "追加",
  excelImportActionUpdate: "更新",
  excelImportActionSkip: "変更なし",
  excelImportActionError: "エラー",
  excelImportSummary: "追加 {create} 件・更新 {update} 件・変更なし {skip} 件・エラー {error} 件",
  excelImportHasErrors: "エラーのある行を修正してから、もう一度ファイルを選んでください。エラーがある間は取り込めません。",
  excelImportNothing: "追加・更新する行がありません。",
  excelImportDone: "{create} 件を追加し、{update} 件を更新しました",
  excelImportFailed: "取り込みに失敗しました",
  excelImportErrPbiNotFound: "ID {value} の PBI が見つかりません（削除済みまたは別プロジェクト）",
  excelImportErrInvalidId: "ID「{value}」は PBI の番号ではありません",
  excelImportErrDuplicateId: "ID {value} が複数の行にあります",
  excelImportErrInvalidStatus: "ステータス「{value}」は使えません（着手可能 / 未準備 / 完了）",
  excelImportErrInvalidPoints: "{label}「{value}」は 0 以上の整数にしてください",
  excelImportErrTooLong: "「{label}」が長すぎます",
  excelImportErrGoalNotFound: "プロダクトゴール「{value}」が見つかりません",
  excelImportErrEmptyStory: "新規追加の行にはユーザーストーリーかイニシアティブが必要です",
  excelImportErrInvalid: "「{label}」の値が不正です",
  excelImportErrTooManyRows: "{max} 行を超えています。ファイルを分けて取り込んでください",
  excelImportErrUnreadable: "Excel ファイル（.xlsx）として読み込めませんでした",
  excelImportErrNoHeader: "見出し行が見つかりません。テンプレートの 1 行目の見出しを残してください",
  excelSheetBacklog: "バックログ",
  excelSheetSprints: "スプリント",
  excelSheetTasks: "タスク",
  excelSheetIcebox: "IceBox",
  excelSheetInstructions: "記入方法",
  excelColId: "ID",
  excelColStatus: "ステータス",
  excelColGoal: "プロダクトゴール",
  excelColPlanItem: "全体計画の項目",
  excelColSprint: "スプリント",
  excelColCreatedAt: "作成日時",
  excelColUpdatedAt: "更新日時",
  excelColPoNote: "PO メモ",
  excelColNotReadyReason: "未準備の理由",
  excelColReferenceDoc: "参考資料",
  excelColLangJa: "{label}（日本語）",
  excelColLangId: "{label}（インドネシア語）",
  excelColSprintName: "スプリント名",
  excelColStartDate: "開始日",
  excelColEndDate: "終了日",
  excelColCapacity: "キャパシティ",
  excelColActualScore: "完了ポイント",
  excelColTaskCount: "タスク数",
  excelColTaskDone: "完了タスク数",
  excelColTask: "タスク",
  excelColPbi: "PBI",
  excelColAssignee: "担当者",
  excelColEstimate: "見積（時間）",
  excelColActualHours: "実績（時間）",
  excelColCompletedAt: "完了日時",
  excelColAuthor: "起票者",
  excelColPbEpic: "バックログのエピック",
  excelColRejectionReason: "却下理由",
  excelColFreezeReason: "凍結理由",
  excelColLinkedPbis: "作成された PBI",
  excelTaskStatusReview: "レビュー",
  excelTplIntro: "「バックログ」シートに 1 行 1 PBI で記入し、バックログ画面の「Excel 取込」から取り込みます。",
  excelTplRuleId: "ID が空の行は新しい PBI として追加されます。ID（PBI 番号）がある行は、その PBI を記入された列だけ更新します。",
  excelTplRuleEmpty: "空のセルは「変更しない」扱いです（既存の値は消えません）。",
  excelTplRuleStatus: "ステータスは 着手可能 / 未準備 / 完了（ready / not_ready / completed）のいずれか。空なら新規は未準備です。",
  excelTplRulePoints: "ポイントは 0 以上の整数です。",
  excelTplRuleGoal: "プロダクトゴールは、プロジェクトに登録済みのゴール名と完全に一致させてください。",
  excelTplRuleLimits: "1 回の取り込みは {max} 行・{size} MB までです。エラーのある行があると 1 件も取り込まれません。",
  excelTplRuleColumns: "列の順番は自由です。見出し行（1 行目）の名前で列を判定します。不要な列は削除してかまいません。",
  excelTplExampleInitiative: "新規ユーザー獲得の強化",
  excelTplExampleEpic: "ログイン機能の刷新",
  excelTplExampleStory: "利用者として、社員番号でログインしたい。パスワードを覚えなくて済むから。",
  excelTplExampleAc: "社員番号とパスワードでログインできる\n誤ったパスワードではエラーが表示される",
}

export const en: ExcelIoTranslations = {
  excelExport: "Export to Excel",
  excelExportHint: "Download the data as an Excel file (.xlsx)",
  excelImport: "Import from Excel",
  excelImportTitle: "Import the backlog from Excel",
  excelImportDescription:
    "Choose a file filled in from the template (or a backlog Excel export). You can review what will be added or updated, and any errors, before importing.",
  excelImportTemplate: "Download template",
  excelImportChooseFile: "Excel file (.xlsx)",
  excelImportFileHint: ".xlsx, up to {size} MB and {max} rows",
  excelImportCheck: "Check file",
  excelImportRun: "Import",
  excelImportBack: "Choose another file",
  excelImportRowCol: "Row",
  excelImportActionCol: "Action",
  excelImportDetailCol: "Details",
  excelImportActionCreate: "Add",
  excelImportActionUpdate: "Update",
  excelImportActionSkip: "No change",
  excelImportActionError: "Error",
  excelImportSummary: "{create} to add · {update} to update · {skip} unchanged · {error} errors",
  excelImportHasErrors: "Fix the rows with errors and choose the file again. Nothing can be imported while errors remain.",
  excelImportNothing: "There are no rows to add or update.",
  excelImportDone: "Added {create} and updated {update} items",
  excelImportFailed: "Import failed",
  excelImportErrPbiNotFound: "No PBI with ID {value} (deleted or in another project)",
  excelImportErrInvalidId: "ID \"{value}\" is not a PBI number",
  excelImportErrDuplicateId: "ID {value} appears in more than one row",
  excelImportErrInvalidStatus: "Status \"{value}\" is not allowed (Ready / Not Ready / Completed)",
  excelImportErrInvalidPoints: "{label} \"{value}\" must be a whole number of 0 or more",
  excelImportErrTooLong: "\"{label}\" is too long",
  excelImportErrGoalNotFound: "Product goal \"{value}\" was not found",
  excelImportErrEmptyStory: "A new row needs a user story or an initiative",
  excelImportErrInvalid: "\"{label}\" has an invalid value",
  excelImportErrTooManyRows: "The file has more than {max} rows. Split it and import each part",
  excelImportErrUnreadable: "The file could not be read as an Excel workbook (.xlsx)",
  excelImportErrNoHeader: "No header row was found. Keep the headers in row 1 of the template",
  excelSheetBacklog: "Backlog",
  excelSheetSprints: "Sprints",
  excelSheetTasks: "Tasks",
  excelSheetIcebox: "IceBox",
  excelSheetInstructions: "How to fill in",
  excelColId: "ID",
  excelColStatus: "Status",
  excelColGoal: "Product goal",
  excelColPlanItem: "Master plan item",
  excelColSprint: "Sprint",
  excelColCreatedAt: "Created",
  excelColUpdatedAt: "Updated",
  excelColPoNote: "PO note",
  excelColNotReadyReason: "Reason not ready",
  excelColReferenceDoc: "Reference",
  excelColLangJa: "{label} (Japanese)",
  excelColLangId: "{label} (Indonesian)",
  excelColSprintName: "Sprint name",
  excelColStartDate: "Start date",
  excelColEndDate: "End date",
  excelColCapacity: "Capacity",
  excelColActualScore: "Completed points",
  excelColTaskCount: "Tasks",
  excelColTaskDone: "Tasks done",
  excelColTask: "Task",
  excelColPbi: "PBI",
  excelColAssignee: "Assignee",
  excelColEstimate: "Estimate (h)",
  excelColActualHours: "Actual (h)",
  excelColCompletedAt: "Completed",
  excelColAuthor: "Submitted by",
  excelColPbEpic: "Backlog epic",
  excelColRejectionReason: "Rejection reason",
  excelColFreezeReason: "Freeze reason",
  excelColLinkedPbis: "PBIs created",
  excelTaskStatusReview: "Review",
  excelTplIntro: "Fill in the \"Backlog\" sheet with one PBI per row, then import it with \"Import from Excel\" on the backlog page.",
  excelTplRuleId: "A row without an ID is added as a new PBI. A row with an ID (PBI number) updates that PBI, only in the columns you filled in.",
  excelTplRuleEmpty: "An empty cell means \"leave unchanged\" (existing values are not erased).",
  excelTplRuleStatus: "Status is Ready / Not Ready / Completed (ready / not_ready / completed). New rows default to Not Ready.",
  excelTplRulePoints: "Points are whole numbers of 0 or more.",
  excelTplRuleGoal: "A product goal must match the name of a goal already registered in the project exactly.",
  excelTplRuleLimits: "One import takes up to {max} rows and {size} MB. If any row has an error, nothing is imported.",
  excelTplRuleColumns: "Column order is free: columns are recognised by the header names in row 1. You may delete columns you do not need.",
  excelTplExampleInitiative: "Grow new user sign-ups",
  excelTplExampleEpic: "Renew the login flow",
  excelTplExampleStory: "As a user, I want to log in with my employee number so that I do not have to remember another ID.",
  excelTplExampleAc: "Can log in with employee number and password\nA wrong password shows an error",
}

export const id: ExcelIoTranslations = {
  excelExport: "Ekspor ke Excel",
  excelExportHint: "Unduh data sebagai file Excel (.xlsx)",
  excelImport: "Impor dari Excel",
  excelImportTitle: "Impor backlog dari Excel",
  excelImportDescription:
    "Pilih file yang diisi dari templat (atau hasil ekspor Excel backlog). Anda dapat memeriksa apa yang akan ditambahkan atau diperbarui, serta kesalahannya, sebelum mengimpor.",
  excelImportTemplate: "Unduh templat",
  excelImportChooseFile: "File Excel (.xlsx)",
  excelImportFileHint: ".xlsx, maksimal {size} MB dan {max} baris",
  excelImportCheck: "Periksa file",
  excelImportRun: "Impor",
  excelImportBack: "Pilih file lain",
  excelImportRowCol: "Baris",
  excelImportActionCol: "Tindakan",
  excelImportDetailCol: "Keterangan",
  excelImportActionCreate: "Tambah",
  excelImportActionUpdate: "Perbarui",
  excelImportActionSkip: "Tidak berubah",
  excelImportActionError: "Kesalahan",
  excelImportSummary: "{create} ditambah · {update} diperbarui · {skip} tidak berubah · {error} kesalahan",
  excelImportHasErrors: "Perbaiki baris yang salah lalu pilih file lagi. Tidak ada yang dapat diimpor selama masih ada kesalahan.",
  excelImportNothing: "Tidak ada baris untuk ditambah atau diperbarui.",
  excelImportDone: "{create} item ditambahkan dan {update} item diperbarui",
  excelImportFailed: "Impor gagal",
  excelImportErrPbiNotFound: "PBI dengan ID {value} tidak ditemukan (dihapus atau di proyek lain)",
  excelImportErrInvalidId: "ID \"{value}\" bukan nomor PBI",
  excelImportErrDuplicateId: "ID {value} muncul di lebih dari satu baris",
  excelImportErrInvalidStatus: "Status \"{value}\" tidak diizinkan (Siap / Belum Siap / Selesai)",
  excelImportErrInvalidPoints: "{label} \"{value}\" harus bilangan bulat 0 atau lebih",
  excelImportErrTooLong: "\"{label}\" terlalu panjang",
  excelImportErrGoalNotFound: "Tujuan produk \"{value}\" tidak ditemukan",
  excelImportErrEmptyStory: "Baris baru memerlukan user story atau inisiatif",
  excelImportErrInvalid: "Nilai \"{label}\" tidak valid",
  excelImportErrTooManyRows: "File memiliki lebih dari {max} baris. Pisahkan lalu impor per bagian",
  excelImportErrUnreadable: "File tidak dapat dibaca sebagai buku kerja Excel (.xlsx)",
  excelImportErrNoHeader: "Baris judul tidak ditemukan. Pertahankan judul di baris 1 templat",
  excelSheetBacklog: "Backlog",
  excelSheetSprints: "Sprint",
  excelSheetTasks: "Tugas",
  excelSheetIcebox: "IceBox",
  excelSheetInstructions: "Cara mengisi",
  excelColId: "ID",
  excelColStatus: "Status",
  excelColGoal: "Tujuan produk",
  excelColPlanItem: "Item rencana induk",
  excelColSprint: "Sprint",
  excelColCreatedAt: "Dibuat",
  excelColUpdatedAt: "Diperbarui",
  excelColPoNote: "Catatan PO",
  excelColNotReadyReason: "Alasan belum ready",
  excelColReferenceDoc: "Referensi",
  excelColLangJa: "{label} (Jepang)",
  excelColLangId: "{label} (Indonesia)",
  excelColSprintName: "Nama sprint",
  excelColStartDate: "Tanggal mulai",
  excelColEndDate: "Tanggal selesai",
  excelColCapacity: "Kapasitas",
  excelColActualScore: "Poin selesai",
  excelColTaskCount: "Jumlah tugas",
  excelColTaskDone: "Tugas selesai",
  excelColTask: "Tugas",
  excelColPbi: "PBI",
  excelColAssignee: "Penanggung jawab",
  excelColEstimate: "Estimasi (jam)",
  excelColActualHours: "Aktual (jam)",
  excelColCompletedAt: "Selesai pada",
  excelColAuthor: "Diajukan oleh",
  excelColPbEpic: "Epik backlog",
  excelColRejectionReason: "Alasan penolakan",
  excelColFreezeReason: "Alasan dibekukan",
  excelColLinkedPbis: "PBI yang dibuat",
  excelTaskStatusReview: "Tinjauan",
  excelTplIntro: "Isi lembar \"Backlog\" dengan satu PBI per baris, lalu impor dengan \"Impor dari Excel\" di halaman backlog.",
  excelTplRuleId: "Baris tanpa ID ditambahkan sebagai PBI baru. Baris dengan ID (nomor PBI) memperbarui PBI tersebut, hanya pada kolom yang diisi.",
  excelTplRuleEmpty: "Sel kosong berarti \"jangan diubah\" (nilai yang ada tidak dihapus).",
  excelTplRuleStatus: "Status adalah Siap / Belum Siap / Selesai (ready / not_ready / completed). Baris baru bawaannya Belum Siap.",
  excelTplRulePoints: "Poin adalah bilangan bulat 0 atau lebih.",
  excelTplRuleGoal: "Tujuan produk harus sama persis dengan nama tujuan yang sudah terdaftar di proyek.",
  excelTplRuleLimits: "Satu kali impor maksimal {max} baris dan {size} MB. Jika ada baris yang salah, tidak ada yang diimpor.",
  excelTplRuleColumns: "Urutan kolom bebas: kolom dikenali dari nama judul di baris 1. Kolom yang tidak diperlukan boleh dihapus.",
  excelTplExampleInitiative: "Meningkatkan pendaftaran pengguna baru",
  excelTplExampleEpic: "Memperbarui alur login",
  excelTplExampleStory: "Sebagai pengguna, saya ingin login dengan nomor karyawan agar tidak perlu mengingat ID lain.",
  excelTplExampleAc: "Dapat login dengan nomor karyawan dan kata sandi\nKata sandi salah menampilkan pesan kesalahan",
}
