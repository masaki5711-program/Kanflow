/**
 * i18n domain: ボード (the project's drawing boards, `docs/plan/10-board.md`). The board list
 * (`projects/[id]/boards`), its sidebar entry and the editor (`projects/[id]/boards/[boardId]`:
 * toolbar, canvas, sheet tabs, save state).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {name} {count} {date} {n} {max} {percent} {sheet} {color}.
 */
export interface BoardsTranslations {
  wbTitle: string
  wbNavDesc: string
  wbDescription: string
  wbNew: string
  wbEmptyTitle: string
  wbEmptyDescription: string
  /** Empty list for someone who may not create boards. */
  wbEmptyReadOnly: string
  wbListLabel: string
  /** {count} = number of sheets. */
  wbSheetCount: string
  /** {date} = last change. */
  wbUpdatedAt: string
  wbRename: string
  /** Accessible name of a row's "⋯" menu; {name} = board or sheet. */
  wbActionsFor: string
  wbCreateTitle: string
  wbRenameTitle: string
  wbNameLabel: string
  wbNameRequired: string
  /** {max} = longest name accepted. */
  wbNameTooLong: string
  wbDeleteConfirmTitle: string
  /** {name} = board title. */
  wbDeleteConfirmMessage: string
  wbCreated: string
  wbRenamed: string
  wbDeleted: string
  wbRestored: string
  wbLoadFailed: string
  wbTrashHeading: string
  wbTrashDescription: string
  /** Name of a new sheet; {n} = running number. */
  wbDefaultSheetName: string
  wbBackToList: string
  wbNotFoundTitle: string
  wbNotFoundDescription: string
  wbReadOnly: string
  wbSaveSaved: string
  wbSavePending: string
  wbSaveSaving: string
  wbSaveFailed: string
  wbSaveFailedHint: string
  wbSaveRetry: string
  wbToolbarLabel: string
  wbToolSelect: string
  wbToolRect: string
  wbToolEllipse: string
  wbToolLine: string
  wbToolArrow: string
  wbToolText: string
  wbToolSticky: string
  wbUndo: string
  wbRedo: string
  wbDuplicate: string
  wbDeleteSelection: string
  wbBringToFront: string
  wbSendToBack: string
  wbFillLabel: string
  wbStrokeLabel: string
  /** Accessible name of a colour swatch; {color} = colour name. */
  wbFillColor: string
  wbStrokeColor: string
  wbColorNone: string
  wbColorWhite: string
  wbColorInk: string
  wbColorGray: string
  wbColorBlue: string
  wbColorSky: string
  wbColorGreen: string
  wbColorAmber: string
  wbColorRed: string
  wbColorViolet: string
  wbZoomLabel: string
  wbZoomIn: string
  wbZoomOut: string
  wbZoomFit: string
  /** Button showing the zoom, resets to 100 %; {percent} = current zoom. */
  wbZoomReset: string
  /** {sheet} = sheet name. */
  wbCanvasLabel: string
  wbCanvasHelp: string
  wbCanvasHelpReadOnly: string
  wbTextEditLabel: string
  /** Announced when the selection changes; {count} = selected elements. */
  wbSelectionCount: string
  wbSelectionNone: string
  wbSheetsLabel: string
  wbSheetAdd: string
  wbSheetRenameTitle: string
  wbSheetDuplicate: string
  wbSheetDuplicateTitle: string
  wbSheetMoveLeft: string
  wbSheetMoveRight: string
  wbSheetDelete: string
  wbSheetNameLabel: string
  wbSheetDeleteConfirmTitle: string
  /** {name} = sheet name. */
  wbSheetDeleteConfirmMessage: string
  /** Suggested name of a duplicated sheet; {name} = the source sheet. */
  wbSheetCopyName: string
  wbSheetLoadFailed: string
  wbSheetUnsavedTitle: string
  wbSheetUnsavedMessage: string
  wbSheetUnsavedLeave: string
}

export const ja: BoardsTranslations = {
  wbTitle: "ボード",
  wbNavDesc: "図形・矢印・付箋で自由に描ける作図ボード",
  wbDescription: "構成図や業務フロー、アイデアの整理を、図形・矢印・テキスト・付箋で自由に描けます。変更は自動で保存されます。",
  wbNew: "ボードを作成",
  wbEmptyTitle: "ボードはまだありません",
  wbEmptyDescription: "最初のボードを作成して、図や付箋を描きはじめましょう。",
  wbEmptyReadOnly: "このプロジェクトにはまだボードがありません。",
  wbListLabel: "ボード一覧",
  wbSheetCount: "{count} シート",
  wbUpdatedAt: "更新: {date}",
  wbRename: "名前を変更",
  wbActionsFor: "{name} の操作",
  wbCreateTitle: "ボードを作成",
  wbRenameTitle: "ボードの名前を変更",
  wbNameLabel: "ボード名",
  wbNameRequired: "名前を入力してください。",
  wbNameTooLong: "{max}文字以内で入力してください。",
  wbDeleteConfirmTitle: "ボードをごみ箱に移動しますか？",
  wbDeleteConfirmMessage: "「{name}」をごみ箱に移動します。プロダクトオーナーとスクラムマスターは、このページのごみ箱から元に戻せます。",
  wbCreated: "ボードを作成しました",
  wbRenamed: "名前を変更しました",
  wbDeleted: "ボードをごみ箱に移動しました",
  wbRestored: "ボードを元に戻しました",
  wbLoadFailed: "ボードを読み込めませんでした",
  wbTrashHeading: "ごみ箱のボード",
  wbTrashDescription: "削除されたボードです。保持期間を過ぎると完全に削除されます。",
  wbDefaultSheetName: "シート{n}",
  wbBackToList: "ボード一覧へ",
  wbNotFoundTitle: "ボードが見つかりません",
  wbNotFoundDescription: "削除されたか、このプロジェクトのボードではありません。",
  wbReadOnly: "閲覧のみ",
  wbSaveSaved: "保存済み",
  wbSavePending: "未保存の変更があります",
  wbSaveSaving: "保存中…",
  wbSaveFailed: "保存できませんでした",
  wbSaveFailedHint: "変更はこの画面に残っています。接続が戻ると自動で再試行します。",
  wbSaveRetry: "今すぐ再試行",
  wbToolbarLabel: "作図ツール",
  wbToolSelect: "選択",
  wbToolRect: "四角形",
  wbToolEllipse: "楕円",
  wbToolLine: "線",
  wbToolArrow: "矢印",
  wbToolText: "テキスト",
  wbToolSticky: "付箋",
  wbUndo: "元に戻す",
  wbRedo: "やり直す",
  wbDuplicate: "複製",
  wbDeleteSelection: "選択した図形を削除",
  wbBringToFront: "最前面へ",
  wbSendToBack: "最背面へ",
  wbFillLabel: "塗りの色",
  wbStrokeLabel: "線の色",
  wbFillColor: "塗り: {color}",
  wbStrokeColor: "線: {color}",
  wbColorNone: "なし",
  wbColorWhite: "白",
  wbColorInk: "黒",
  wbColorGray: "グレー",
  wbColorBlue: "青",
  wbColorSky: "水色",
  wbColorGreen: "緑",
  wbColorAmber: "黄",
  wbColorRed: "赤",
  wbColorViolet: "紫",
  wbZoomLabel: "表示倍率",
  wbZoomIn: "拡大",
  wbZoomOut: "縮小",
  wbZoomFit: "全体を表示",
  wbZoomReset: "{percent}%（100%に戻す）",
  wbCanvasLabel: "作図キャンバス: {sheet}",
  wbCanvasHelp:
    "ツールを選んでEnterキーを押すと中央に図形を置きます。矢印キーで選択した図形を移動、Enterキーでテキストを編集、Deleteキーで削除、Ctrl+Zで元に戻します。",
  wbCanvasHelpReadOnly: "このボードは閲覧のみです。スペースキーを押しながらドラッグ、またはスクロールで表示位置を動かせます。",
  wbTextEditLabel: "テキストを編集",
  wbSelectionCount: "{count} 個を選択中",
  wbSelectionNone: "選択なし",
  wbSheetsLabel: "シート",
  wbSheetAdd: "シートを追加",
  wbSheetRenameTitle: "シートの名前を変更",
  wbSheetDuplicate: "複製",
  wbSheetDuplicateTitle: "シートを複製",
  wbSheetMoveLeft: "左へ移動",
  wbSheetMoveRight: "右へ移動",
  wbSheetDelete: "シートを削除",
  wbSheetNameLabel: "シート名",
  wbSheetDeleteConfirmTitle: "シートを削除しますか？",
  wbSheetDeleteConfirmMessage: "「{name}」と描かれた内容を完全に削除します。この操作は元に戻せません。",
  wbSheetCopyName: "{name} のコピー",
  wbSheetLoadFailed: "シートを読み込めませんでした",
  wbSheetUnsavedTitle: "保存されていない変更があります",
  wbSheetUnsavedMessage: "このシートの変更をまだ保存できていません。別のシートへ移動すると、保存されていない変更は失われます。",
  wbSheetUnsavedLeave: "保存せずに移動",
}

export const en: BoardsTranslations = {
  wbTitle: "Boards",
  wbNavDesc: "Free drawing boards with shapes, arrows and sticky notes",
  wbDescription: "Draw architecture diagrams, workflows and ideas with shapes, arrows, text and sticky notes. Changes are saved automatically.",
  wbNew: "New board",
  wbEmptyTitle: "No boards yet",
  wbEmptyDescription: "Create the first board and start drawing diagrams and sticky notes.",
  wbEmptyReadOnly: "This project has no boards yet.",
  wbListLabel: "Boards",
  wbSheetCount: "{count} sheets",
  wbUpdatedAt: "Updated {date}",
  wbRename: "Rename",
  wbActionsFor: "Actions for {name}",
  wbCreateTitle: "New board",
  wbRenameTitle: "Rename board",
  wbNameLabel: "Board name",
  wbNameRequired: "Enter a name.",
  wbNameTooLong: "Use {max} characters or fewer.",
  wbDeleteConfirmTitle: "Move this board to the trash?",
  wbDeleteConfirmMessage: "\"{name}\" will be moved to the trash. A product owner or scrum master can restore it from the trash on this page.",
  wbCreated: "Board created",
  wbRenamed: "Renamed",
  wbDeleted: "Board moved to the trash",
  wbRestored: "Board restored",
  wbLoadFailed: "Could not load the boards",
  wbTrashHeading: "Boards in the trash",
  wbTrashDescription: "Deleted boards. They are removed permanently after the retention period.",
  wbDefaultSheetName: "Sheet {n}",
  wbBackToList: "All boards",
  wbNotFoundTitle: "Board not found",
  wbNotFoundDescription: "It was deleted, or it does not belong to this project.",
  wbReadOnly: "View only",
  wbSaveSaved: "Saved",
  wbSavePending: "Unsaved changes",
  wbSaveSaving: "Saving…",
  wbSaveFailed: "Could not save",
  wbSaveFailedHint: "Your changes are still on this screen. Saving is retried automatically when the connection is back.",
  wbSaveRetry: "Retry now",
  wbToolbarLabel: "Drawing tools",
  wbToolSelect: "Select",
  wbToolRect: "Rectangle",
  wbToolEllipse: "Ellipse",
  wbToolLine: "Line",
  wbToolArrow: "Arrow",
  wbToolText: "Text",
  wbToolSticky: "Sticky note",
  wbUndo: "Undo",
  wbRedo: "Redo",
  wbDuplicate: "Duplicate",
  wbDeleteSelection: "Delete the selected shapes",
  wbBringToFront: "Bring to front",
  wbSendToBack: "Send to back",
  wbFillLabel: "Fill colour",
  wbStrokeLabel: "Line colour",
  wbFillColor: "Fill: {color}",
  wbStrokeColor: "Line: {color}",
  wbColorNone: "None",
  wbColorWhite: "White",
  wbColorInk: "Black",
  wbColorGray: "Gray",
  wbColorBlue: "Blue",
  wbColorSky: "Sky blue",
  wbColorGreen: "Green",
  wbColorAmber: "Yellow",
  wbColorRed: "Red",
  wbColorViolet: "Violet",
  wbZoomLabel: "Zoom",
  wbZoomIn: "Zoom in",
  wbZoomOut: "Zoom out",
  wbZoomFit: "Fit to screen",
  wbZoomReset: "{percent}% (reset to 100%)",
  wbCanvasLabel: "Drawing canvas: {sheet}",
  wbCanvasHelp:
    "Pick a tool and press Enter to place a shape in the centre. Arrow keys move the selected shapes, Enter edits the text, Delete removes them and Ctrl+Z undoes.",
  wbCanvasHelpReadOnly: "This board is view only. Hold the space bar and drag, or scroll, to move around.",
  wbTextEditLabel: "Edit text",
  wbSelectionCount: "{count} selected",
  wbSelectionNone: "Nothing selected",
  wbSheetsLabel: "Sheets",
  wbSheetAdd: "Add sheet",
  wbSheetRenameTitle: "Rename sheet",
  wbSheetDuplicate: "Duplicate",
  wbSheetDuplicateTitle: "Duplicate sheet",
  wbSheetMoveLeft: "Move left",
  wbSheetMoveRight: "Move right",
  wbSheetDelete: "Delete sheet",
  wbSheetNameLabel: "Sheet name",
  wbSheetDeleteConfirmTitle: "Delete this sheet?",
  wbSheetDeleteConfirmMessage: "\"{name}\" and everything drawn on it will be deleted permanently. This cannot be undone.",
  wbSheetCopyName: "Copy of {name}",
  wbSheetLoadFailed: "Could not load the sheet",
  wbSheetUnsavedTitle: "Some changes are not saved",
  wbSheetUnsavedMessage: "The changes on this sheet could not be saved yet. If you move to another sheet, the unsaved changes are lost.",
  wbSheetUnsavedLeave: "Move without saving",
}

export const id: BoardsTranslations = {
  wbTitle: "Papan Gambar",
  wbNavDesc: "Papan gambar bebas dengan bentuk, panah, dan catatan tempel",
  wbDescription: "Gambar diagram arsitektur, alur kerja, dan ide dengan bentuk, panah, teks, dan catatan tempel. Perubahan disimpan secara otomatis.",
  wbNew: "Buat papan",
  wbEmptyTitle: "Belum ada papan",
  wbEmptyDescription: "Buat papan pertama dan mulailah menggambar diagram serta catatan tempel.",
  wbEmptyReadOnly: "Proyek ini belum memiliki papan.",
  wbListLabel: "Daftar papan",
  wbSheetCount: "{count} lembar",
  wbUpdatedAt: "Diperbarui {date}",
  wbRename: "Ubah nama",
  wbActionsFor: "Tindakan untuk {name}",
  wbCreateTitle: "Buat papan",
  wbRenameTitle: "Ubah nama papan",
  wbNameLabel: "Nama papan",
  wbNameRequired: "Masukkan nama.",
  wbNameTooLong: "Gunakan paling banyak {max} karakter.",
  wbDeleteConfirmTitle: "Pindahkan papan ini ke tempat sampah?",
  wbDeleteConfirmMessage: "\"{name}\" akan dipindahkan ke tempat sampah. Product owner atau scrum master dapat memulihkannya dari tempat sampah di halaman ini.",
  wbCreated: "Papan dibuat",
  wbRenamed: "Nama diubah",
  wbDeleted: "Papan dipindahkan ke tempat sampah",
  wbRestored: "Papan dipulihkan",
  wbLoadFailed: "Papan tidak dapat dimuat",
  wbTrashHeading: "Papan di tempat sampah",
  wbTrashDescription: "Papan yang dihapus. Papan dihapus permanen setelah masa penyimpanan berakhir.",
  wbDefaultSheetName: "Lembar {n}",
  wbBackToList: "Semua papan",
  wbNotFoundTitle: "Papan tidak ditemukan",
  wbNotFoundDescription: "Papan ini sudah dihapus atau bukan milik proyek ini.",
  wbReadOnly: "Hanya lihat",
  wbSaveSaved: "Tersimpan",
  wbSavePending: "Ada perubahan yang belum disimpan",
  wbSaveSaving: "Menyimpan…",
  wbSaveFailed: "Tidak dapat menyimpan",
  wbSaveFailedHint: "Perubahan Anda masih ada di layar ini. Penyimpanan dicoba lagi secara otomatis saat koneksi pulih.",
  wbSaveRetry: "Coba lagi sekarang",
  wbToolbarLabel: "Alat gambar",
  wbToolSelect: "Pilih",
  wbToolRect: "Persegi panjang",
  wbToolEllipse: "Elips",
  wbToolLine: "Garis",
  wbToolArrow: "Panah",
  wbToolText: "Teks",
  wbToolSticky: "Catatan tempel",
  wbUndo: "Urungkan",
  wbRedo: "Ulangi",
  wbDuplicate: "Gandakan",
  wbDeleteSelection: "Hapus bentuk yang dipilih",
  wbBringToFront: "Bawa ke depan",
  wbSendToBack: "Kirim ke belakang",
  wbFillLabel: "Warna isi",
  wbStrokeLabel: "Warna garis",
  wbFillColor: "Isi: {color}",
  wbStrokeColor: "Garis: {color}",
  wbColorNone: "Tanpa warna",
  wbColorWhite: "Putih",
  wbColorInk: "Hitam",
  wbColorGray: "Abu-abu",
  wbColorBlue: "Biru",
  wbColorSky: "Biru langit",
  wbColorGreen: "Hijau",
  wbColorAmber: "Kuning",
  wbColorRed: "Merah",
  wbColorViolet: "Ungu",
  wbZoomLabel: "Perbesaran",
  wbZoomIn: "Perbesar",
  wbZoomOut: "Perkecil",
  wbZoomFit: "Tampilkan semua",
  wbZoomReset: "{percent}% (kembali ke 100%)",
  wbCanvasLabel: "Kanvas gambar: {sheet}",
  wbCanvasHelp:
    "Pilih alat lalu tekan Enter untuk menaruh bentuk di tengah. Tombol panah memindahkan bentuk yang dipilih, Enter mengedit teks, Delete menghapus, dan Ctrl+Z mengurungkan.",
  wbCanvasHelpReadOnly: "Papan ini hanya dapat dilihat. Tahan tombol spasi sambil menyeret, atau gulir, untuk berpindah.",
  wbTextEditLabel: "Edit teks",
  wbSelectionCount: "{count} dipilih",
  wbSelectionNone: "Tidak ada yang dipilih",
  wbSheetsLabel: "Lembar",
  wbSheetAdd: "Tambah lembar",
  wbSheetRenameTitle: "Ubah nama lembar",
  wbSheetDuplicate: "Gandakan",
  wbSheetDuplicateTitle: "Gandakan lembar",
  wbSheetMoveLeft: "Pindah ke kiri",
  wbSheetMoveRight: "Pindah ke kanan",
  wbSheetDelete: "Hapus lembar",
  wbSheetNameLabel: "Nama lembar",
  wbSheetDeleteConfirmTitle: "Hapus lembar ini?",
  wbSheetDeleteConfirmMessage: "\"{name}\" dan semua gambar di dalamnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.",
  wbSheetCopyName: "Salinan {name}",
  wbSheetLoadFailed: "Lembar tidak dapat dimuat",
  wbSheetUnsavedTitle: "Ada perubahan yang belum disimpan",
  wbSheetUnsavedMessage: "Perubahan pada lembar ini belum dapat disimpan. Jika Anda berpindah ke lembar lain, perubahan yang belum disimpan akan hilang.",
  wbSheetUnsavedLeave: "Pindah tanpa menyimpan",
}
