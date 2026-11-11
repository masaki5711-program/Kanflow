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
  wbSelectedOne: string
  wbSelectedOneNoText: string
  wbSheetContents: string
  wbContentsEmpty: string
  wbLineBetween: string
  wbLineFree: string
  wbNoText: string
  wbToolFrame: string
  wbToolTable: string
  wbToolImage: string
  wbFormatLabel: string
  wbFontSize: string
  wbFontFamily: string
  wbFontSans: string
  wbFontSerif: string
  wbFontMono: string
  wbBold: string
  wbItalic: string
  wbTextColorLabel: string
  wbTextColor: string
  wbAlignLeft: string
  wbAlignCenter: string
  wbAlignRight: string
  wbValignTop: string
  wbValignMiddle: string
  wbValignBottom: string
  wbStrokeWidth: string
  wbStrokeWidthNone: string
  wbStrokeWidthValue: string
  wbDash: string
  wbDashSolid: string
  wbDashDashed: string
  wbDashDotted: string
  wbRoute: string
  wbRouteStraight: string
  wbRouteElbow: string
  wbRouteCurve: string
  wbArrowStart: string
  wbArrowEnd: string
  wbLock: string
  wbUnlock: string
  wbLocked: string
  wbLink: string
  wbLinkTitle: string
  wbLinkUrl: string
  wbLinkInvalid: string
  wbLinkRemove: string
  wbLinkSave: string
  wbLinkOpen: string
  wbArrangeLabel: string
  wbAlignBoxesLeft: string
  wbAlignBoxesCenter: string
  wbAlignBoxesRight: string
  wbAlignBoxesTop: string
  wbAlignBoxesMiddle: string
  wbAlignBoxesBottom: string
  wbDistributeH: string
  wbDistributeV: string
  wbSnap: string
  wbVote: string
  wbVoteCount: string
  wbVoteCountOne: string
  wbTableLabel: string
  wbTableRowAbove: string
  wbTableRowBelow: string
  wbTableRowDelete: string
  wbTableColLeft: string
  wbTableColRight: string
  wbTableColDelete: string
  wbCellEditLabel: string
  wbLabelEditLabel: string
  wbImageInsert: string
  wbImageUploading: string
  wbImageFailed: string
  wbImageTooLarge: string
  wbImageNotImage: string
  wbImageAlt: string
  wbPastedTable: string
  wbTemplates: string
  wbTemplateKpt: string
  wbTemplateSwot: string
  wbTemplateMinutes: string
  wbTemplateReport: string
  wbTplKeep: string
  wbTplProblem: string
  wbTplTry: string
  wbTplStrengths: string
  wbTplWeaknesses: string
  wbTplOpportunities: string
  wbTplThreats: string
  wbTplMinutesTitle: string
  wbTplMinutesMeta: string
  wbTplAgenda: string
  wbTplDecisions: string
  wbTplActions: string
  wbTplReportTitle: string
  wbTplSummary: string
  wbTplProgress: string
  wbTplIssues: string
  wbTplNext: string
  wbMindChild: string
  wbMindSibling: string
  wbMindLayout: string
  wbExportPng: string
  wbExportFailed: string
  wbToIcebox: string
  wbToIceboxDone: string
  wbToIceboxFailed: string
  wbRemoteUpdated: string
  wbConnectHint: string
  wbToIceboxPartial: string
  wbLinkOpenNewTab: string
  wbTextEditHint: string
  wbRemotePaused: string
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
  wbTitle: "ホワイトボード",
  wbNavDesc: "図形・矢印・付箋で自由に描けるホワイトボード",
  wbDescription: "構成図や業務フロー、アイデアの整理を、図形・矢印・テキスト・付箋で自由に描けます。変更は自動で保存されます。",
  wbNew: "ホワイトボードを作成",
  wbEmptyTitle: "ホワイトボードはまだありません",
  wbEmptyDescription: "最初のホワイトボードを作成して、図や付箋を描きはじめましょう。",
  wbEmptyReadOnly: "このプロジェクトにはまだホワイトボードがありません。",
  wbListLabel: "ホワイトボード一覧",
  wbSheetCount: "{count} シート",
  wbUpdatedAt: "更新: {date}",
  wbRename: "名前を変更",
  wbActionsFor: "{name} の操作",
  wbCreateTitle: "ホワイトボードを作成",
  wbRenameTitle: "ホワイトボードの名前を変更",
  wbNameLabel: "ホワイトボード名",
  wbNameRequired: "名前を入力してください。",
  wbNameTooLong: "{max}文字以内で入力してください。",
  wbDeleteConfirmTitle: "ホワイトボードをごみ箱に移動しますか？",
  wbDeleteConfirmMessage: "「{name}」をごみ箱に移動します。プロダクトオーナーとスクラムマスターは、このページのごみ箱から元に戻せます。",
  wbCreated: "ホワイトボードを作成しました",
  wbRenamed: "名前を変更しました",
  wbDeleted: "ホワイトボードをごみ箱に移動しました",
  wbRestored: "ホワイトボードを元に戻しました",
  wbLoadFailed: "ホワイトボードを読み込めませんでした",
  wbTrashHeading: "ごみ箱のホワイトボード",
  wbTrashDescription: "削除されたホワイトボードです。保持期間を過ぎると完全に削除されます。",
  wbDefaultSheetName: "シート{n}",
  wbBackToList: "ホワイトボード一覧へ",
  wbNotFoundTitle: "ホワイトボードが見つかりません",
  wbNotFoundDescription: "削除されたか、このプロジェクトのホワイトボードではありません。",
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
    "ツールを選んでEnterキーを押すと中央に図形を置きます。矢印キーで選択した図形を移動、Enterキーでテキストを編集、Deleteキーで削除、Ctrl+Zで元に戻します。] と [ キーで図形を一つずつ選べます。図形を選んで文字を打つとそのまま書き込めます（F2 でも編集）。Insert キーで右につながる図形（マインドマップ）を、Alt+矢印キーで選んだ図形の大きさを変えます。Ctrl+Enter で図形のリンクを開きます。",
  wbCanvasHelpReadOnly: "このホワイトボードは閲覧のみです。スペースキーを押しながらドラッグ、またはスクロールで表示位置を動かせます。",
  wbTextEditLabel: "テキストを編集",
  wbSelectionCount: "{count} 個を選択中",
  wbSelectionNone: "選択なし",
  wbSelectedOne: "{kind}「{text}」を選択中（{n} / {total}）",
  wbSelectedOneNoText: "{kind}を選択中（{n} / {total}）",
  wbSheetContents: "シートの中身（{count} 個）",
  wbContentsEmpty: "このシートには何もありません",
  wbLineBetween: "{kind}：{from} から {to} へ",
  wbLineFree: "{kind}（つながっていない）",
  wbNoText: "文字なし",
  wbToolFrame: "枠",
  wbToolTable: "表",
  wbToolImage: "画像",
  wbFormatLabel: "書式",
  wbFontSize: "文字の大きさ",
  wbFontFamily: "書体",
  wbFontSans: "ゴシック",
  wbFontSerif: "明朝",
  wbFontMono: "等幅",
  wbBold: "太字",
  wbItalic: "斜体",
  wbTextColorLabel: "文字の色",
  wbTextColor: "文字の色: {color}",
  wbAlignLeft: "左揃え",
  wbAlignCenter: "中央揃え",
  wbAlignRight: "右揃え",
  wbValignTop: "上揃え",
  wbValignMiddle: "上下中央",
  wbValignBottom: "下揃え",
  wbStrokeWidth: "線の太さ",
  wbStrokeWidthNone: "線なし",
  wbStrokeWidthValue: "{n} pt",
  wbDash: "線の種類",
  wbDashSolid: "実線",
  wbDashDashed: "破線",
  wbDashDotted: "点線",
  wbRoute: "線の形",
  wbRouteStraight: "直線",
  wbRouteElbow: "カギ線",
  wbRouteCurve: "曲線",
  wbArrowStart: "始点に矢印",
  wbArrowEnd: "終点に矢印",
  wbLock: "ロックする",
  wbUnlock: "ロックを外す",
  wbLocked: "ロック中",
  wbLink: "リンク",
  wbLinkTitle: "リンクを設定",
  wbLinkUrl: "URL（http:// または https://）",
  wbLinkInvalid: "http:// か https:// で始まる URL を入力してください",
  wbLinkRemove: "リンクを外す",
  wbLinkSave: "設定",
  wbLinkOpen: "リンクを開く: {url}",
  wbArrangeLabel: "整列",
  wbAlignBoxesLeft: "左端で揃える",
  wbAlignBoxesCenter: "左右中央で揃える",
  wbAlignBoxesRight: "右端で揃える",
  wbAlignBoxesTop: "上端で揃える",
  wbAlignBoxesMiddle: "上下中央で揃える",
  wbAlignBoxesBottom: "下端で揃える",
  wbDistributeH: "左右に等間隔",
  wbDistributeV: "上下に等間隔",
  wbSnap: "グリッドに合わせる",
  wbVote: "投票する / 取り消す",
  wbVoteCount: "{count} 票",
  wbVoteCountOne: "1 票",
  wbTableLabel: "表の編集",
  wbTableRowAbove: "上に行を追加",
  wbTableRowBelow: "下に行を追加",
  wbTableRowDelete: "行を削除",
  wbTableColLeft: "左に列を追加",
  wbTableColRight: "右に列を追加",
  wbTableColDelete: "列を削除",
  wbCellEditLabel: "セル（{row} 行 {col} 列）",
  wbLabelEditLabel: "線の文字",
  wbImageInsert: "画像を挿入",
  wbImageUploading: "画像を保存しています…",
  wbImageFailed: "画像を保存できませんでした",
  wbImageTooLarge: "画像が大きすぎます（10 MB まで）",
  wbImageNotImage: "画像（PNG・JPEG・GIF・WebP）だけを置けます",
  wbImageAlt: "画像",
  wbPastedTable: "表を貼り付けました（{rows} 行 × {cols} 列）",
  wbTemplates: "ひな形",
  wbTemplateKpt: "KPT（ふりかえり）",
  wbTemplateSwot: "SWOT",
  wbTemplateMinutes: "議事メモ",
  wbTemplateReport: "報告（1 枚）",
  wbTplKeep: "Keep（続けること）",
  wbTplProblem: "Problem（困ったこと）",
  wbTplTry: "Try（次に試すこと）",
  wbTplStrengths: "強み（Strengths）",
  wbTplWeaknesses: "弱み（Weaknesses）",
  wbTplOpportunities: "機会（Opportunities）",
  wbTplThreats: "脅威（Threats）",
  wbTplMinutesTitle: "議事メモ",
  wbTplMinutesMeta: "日時：\n参加者：\n目的：",
  wbTplAgenda: "議題",
  wbTplDecisions: "決まったこと",
  wbTplActions: "やること（担当・期限）",
  wbTplReportTitle: "報告",
  wbTplSummary: "要約",
  wbTplProgress: "進み具合",
  wbTplIssues: "課題・相談",
  wbTplNext: "次の予定",
  wbMindChild: "子を追加（Insert）",
  wbMindSibling: "兄弟を追加（Enter）",
  wbMindLayout: "マインドマップを整列",
  wbExportPng: "PNG で保存",
  wbExportFailed: "PNG を作れませんでした",
  wbToIcebox: "IceBox に追加",
  wbToIceboxDone: "{count} 件を IceBox に追加しました",
  wbToIceboxFailed: "IceBox に追加できませんでした",
  wbRemoteUpdated: "ほかの人の変更を反映しました",
  wbConnectHint: "線の端を図形に近づけると、辺の中央につながります",
  wbToIceboxPartial: "{count} 件は追加しましたが、残りは追加できませんでした",
  wbLinkOpenNewTab: "リンクを開く（新しいタブ）: {url}",
  wbTextEditHint: "Esc か Ctrl+Enter で編集を終えます",
  wbRemotePaused: "ほかの人の変更を読み込めていません（表示が古いかもしれません）。接続を確かめています…",
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
  wbTitle: "White Board",
  wbNavDesc: "Draw freely with shapes, arrows and sticky notes",
  wbDescription: "Draw architecture diagrams, workflows and ideas with shapes, arrows, text and sticky notes. Changes are saved automatically.",
  wbNew: "New White Board",
  wbEmptyTitle: "No White Boards yet",
  wbEmptyDescription: "Create the first White Board and start drawing diagrams and sticky notes.",
  wbEmptyReadOnly: "This project has no White Boards yet.",
  wbListLabel: "White Boards",
  wbSheetCount: "{count} sheets",
  wbUpdatedAt: "Updated {date}",
  wbRename: "Rename",
  wbActionsFor: "Actions for {name}",
  wbCreateTitle: "New White Board",
  wbRenameTitle: "Rename White Board",
  wbNameLabel: "White Board name",
  wbNameRequired: "Enter a name.",
  wbNameTooLong: "Use {max} characters or fewer.",
  wbDeleteConfirmTitle: "Move this White Board to the trash?",
  wbDeleteConfirmMessage: "\"{name}\" will be moved to the trash. A product owner or scrum master can restore it from the trash on this page.",
  wbCreated: "White Board created",
  wbRenamed: "Renamed",
  wbDeleted: "White Board moved to the trash",
  wbRestored: "White Board restored",
  wbLoadFailed: "Could not load the White Boards",
  wbTrashHeading: "White Boards in the trash",
  wbTrashDescription: "Deleted White Boards. They are removed permanently after the retention period.",
  wbDefaultSheetName: "Sheet {n}",
  wbBackToList: "All White Boards",
  wbNotFoundTitle: "White Board not found",
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
    "Pick a tool and press Enter to place a shape in the centre. Arrow keys move the selected shapes, Enter edits the text, Delete removes them and Ctrl+Z undoes. ] and [ step through the shapes one by one. Type with a shape selected to write into it (F2 edits too). Insert adds a connected shape to the right (mind map); Alt+arrow keys resize the selected shape. Ctrl+Enter opens a shape's link.",
  wbCanvasHelpReadOnly: "This White Board is view only. Hold the space bar and drag, or scroll, to move around.",
  wbTextEditLabel: "Edit text",
  wbSelectionCount: "{count} selected",
  wbSelectionNone: "Nothing selected",
  wbSelectedOne: "{kind} \"{text}\" selected ({n} of {total})",
  wbSelectedOneNoText: "{kind} selected ({n} of {total})",
  wbSheetContents: "Contents of the sheet ({count})",
  wbContentsEmpty: "This sheet is empty",
  wbLineBetween: "{kind} from {from} to {to}",
  wbLineFree: "{kind} (not connected)",
  wbNoText: "no text",
  wbToolFrame: "Frame",
  wbToolTable: "Table",
  wbToolImage: "Image",
  wbFormatLabel: "Format",
  wbFontSize: "Text size",
  wbFontFamily: "Font",
  wbFontSans: "Sans-serif",
  wbFontSerif: "Serif",
  wbFontMono: "Monospace",
  wbBold: "Bold",
  wbItalic: "Italic",
  wbTextColorLabel: "Text colour",
  wbTextColor: "Text colour: {color}",
  wbAlignLeft: "Align text left",
  wbAlignCenter: "Centre text",
  wbAlignRight: "Align text right",
  wbValignTop: "Text at the top",
  wbValignMiddle: "Text in the middle",
  wbValignBottom: "Text at the bottom",
  wbStrokeWidth: "Line width",
  wbStrokeWidthNone: "No outline",
  wbStrokeWidthValue: "{n} pt",
  wbDash: "Line style",
  wbDashSolid: "Solid",
  wbDashDashed: "Dashed",
  wbDashDotted: "Dotted",
  wbRoute: "Line shape",
  wbRouteStraight: "Straight",
  wbRouteElbow: "Elbow",
  wbRouteCurve: "Curved",
  wbArrowStart: "Arrow at the start",
  wbArrowEnd: "Arrow at the end",
  wbLock: "Lock",
  wbUnlock: "Unlock",
  wbLocked: "Locked",
  wbLink: "Link",
  wbLinkTitle: "Set a link",
  wbLinkUrl: "URL (http:// or https://)",
  wbLinkInvalid: "Enter a URL that starts with http:// or https://",
  wbLinkRemove: "Remove the link",
  wbLinkSave: "Save",
  wbLinkOpen: "Open the link: {url}",
  wbArrangeLabel: "Arrange",
  wbAlignBoxesLeft: "Align left edges",
  wbAlignBoxesCenter: "Align centres",
  wbAlignBoxesRight: "Align right edges",
  wbAlignBoxesTop: "Align top edges",
  wbAlignBoxesMiddle: "Align middles",
  wbAlignBoxesBottom: "Align bottom edges",
  wbDistributeH: "Space evenly across",
  wbDistributeV: "Space evenly down",
  wbSnap: "Snap to the grid",
  wbVote: "Vote / take back",
  wbVoteCount: "{count} votes",
  wbVoteCountOne: "1 vote",
  wbTableLabel: "Table",
  wbTableRowAbove: "Add a row above",
  wbTableRowBelow: "Add a row below",
  wbTableRowDelete: "Delete the row",
  wbTableColLeft: "Add a column to the left",
  wbTableColRight: "Add a column to the right",
  wbTableColDelete: "Delete the column",
  wbCellEditLabel: "Cell (row {row}, column {col})",
  wbLabelEditLabel: "Text on the line",
  wbImageInsert: "Insert an image",
  wbImageUploading: "Saving the image…",
  wbImageFailed: "The image could not be saved",
  wbImageTooLarge: "The image is too large (up to 10 MB)",
  wbImageNotImage: "Only images (PNG, JPEG, GIF, WebP) can be placed",
  wbImageAlt: "Image",
  wbPastedTable: "Table pasted: {rows} × {cols} (rows × columns)",
  wbTemplates: "Templates",
  wbTemplateKpt: "KPT (retrospective)",
  wbTemplateSwot: "SWOT",
  wbTemplateMinutes: "Meeting notes",
  wbTemplateReport: "One-page report",
  wbTplKeep: "Keep",
  wbTplProblem: "Problem",
  wbTplTry: "Try",
  wbTplStrengths: "Strengths",
  wbTplWeaknesses: "Weaknesses",
  wbTplOpportunities: "Opportunities",
  wbTplThreats: "Threats",
  wbTplMinutesTitle: "Meeting notes",
  wbTplMinutesMeta: "Date:\nAttendees:\nPurpose:",
  wbTplAgenda: "Agenda",
  wbTplDecisions: "Decisions",
  wbTplActions: "Actions (who, by when)",
  wbTplReportTitle: "Report",
  wbTplSummary: "Summary",
  wbTplProgress: "Progress",
  wbTplIssues: "Issues / questions",
  wbTplNext: "Next steps",
  wbMindChild: "Add a child (Insert)",
  wbMindSibling: "Add a sibling (Enter)",
  wbMindLayout: "Tidy the mind map",
  wbExportPng: "Save as PNG",
  wbExportFailed: "The PNG could not be made",
  wbToIcebox: "Add to IceBox",
  wbToIceboxDone: "Added {count} to IceBox",
  wbToIceboxFailed: "Could not add to IceBox",
  wbRemoteUpdated: "Others' changes have been applied",
  wbConnectHint: "Bring a line end near a shape to connect it to the middle of a side",
  wbToIceboxPartial: "Added {count}, but the rest could not be added",
  wbLinkOpenNewTab: "Open link (new tab): {url}",
  wbTextEditHint: "Press Esc or Ctrl+Enter to finish editing",
  wbRemotePaused: "Changes from others cannot be loaded right now (the sheet may be out of date). Retrying…",
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
  wbTitle: "White Board",
  wbNavDesc: "White Board bebas dengan bentuk, panah, dan catatan tempel",
  wbDescription: "Gambar diagram arsitektur, alur kerja, dan ide dengan bentuk, panah, teks, dan catatan tempel. Perubahan disimpan secara otomatis.",
  wbNew: "Buat White Board",
  wbEmptyTitle: "Belum ada White Board",
  wbEmptyDescription: "Buat White Board pertama dan mulailah menggambar diagram serta catatan tempel.",
  wbEmptyReadOnly: "Proyek ini belum memiliki White Board.",
  wbListLabel: "Daftar White Board",
  wbSheetCount: "{count} lembar",
  wbUpdatedAt: "Diperbarui {date}",
  wbRename: "Ubah nama",
  wbActionsFor: "Tindakan untuk {name}",
  wbCreateTitle: "Buat White Board",
  wbRenameTitle: "Ubah nama White Board",
  wbNameLabel: "Nama White Board",
  wbNameRequired: "Masukkan nama.",
  wbNameTooLong: "Gunakan paling banyak {max} karakter.",
  wbDeleteConfirmTitle: "Pindahkan White Board ini ke tempat sampah?",
  wbDeleteConfirmMessage: "\"{name}\" akan dipindahkan ke tempat sampah. Product owner atau scrum master dapat memulihkannya dari tempat sampah di halaman ini.",
  wbCreated: "White Board dibuat",
  wbRenamed: "Nama diubah",
  wbDeleted: "White Board dipindahkan ke tempat sampah",
  wbRestored: "White Board dipulihkan",
  wbLoadFailed: "White Board tidak dapat dimuat",
  wbTrashHeading: "White Board di tempat sampah",
  wbTrashDescription: "White Board yang dihapus. White Board dihapus permanen setelah masa penyimpanan berakhir.",
  wbDefaultSheetName: "Lembar {n}",
  wbBackToList: "Semua White Board",
  wbNotFoundTitle: "White Board tidak ditemukan",
  wbNotFoundDescription: "White Board ini sudah dihapus atau bukan milik proyek ini.",
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
    "Pilih alat lalu tekan Enter untuk menaruh bentuk di tengah. Tombol panah memindahkan bentuk yang dipilih, Enter mengedit teks, Delete menghapus, dan Ctrl+Z mengurungkan. ] dan [ memilih bentuk satu per satu. Ketik saat bentuk dipilih untuk menulis di dalamnya (F2 juga mengedit). Insert menambah bentuk terhubung di kanan (peta pikiran); Alt+tombol panah mengubah ukuran bentuk yang dipilih. Ctrl+Enter membuka tautan bentuk.",
  wbCanvasHelpReadOnly: "White Board ini hanya dapat dilihat. Tahan tombol spasi sambil menyeret, atau gulir, untuk berpindah.",
  wbTextEditLabel: "Edit teks",
  wbSelectionCount: "{count} dipilih",
  wbSelectionNone: "Tidak ada yang dipilih",
  wbSelectedOne: "{kind} \"{text}\" dipilih ({n} dari {total})",
  wbSelectedOneNoText: "{kind} dipilih ({n} dari {total})",
  wbSheetContents: "Isi lembar ({count})",
  wbContentsEmpty: "Lembar ini kosong",
  wbLineBetween: "{kind} dari {from} ke {to}",
  wbLineFree: "{kind} (tidak terhubung)",
  wbNoText: "tanpa teks",
  wbToolFrame: "Bingkai",
  wbToolTable: "Tabel",
  wbToolImage: "Gambar",
  wbFormatLabel: "Format",
  wbFontSize: "Ukuran teks",
  wbFontFamily: "Font",
  wbFontSans: "Sans-serif",
  wbFontSerif: "Serif",
  wbFontMono: "Monospace",
  wbBold: "Tebal",
  wbItalic: "Miring",
  wbTextColorLabel: "Warna teks",
  wbTextColor: "Warna teks: {color}",
  wbAlignLeft: "Rata kiri",
  wbAlignCenter: "Rata tengah",
  wbAlignRight: "Rata kanan",
  wbValignTop: "Teks di atas",
  wbValignMiddle: "Teks di tengah",
  wbValignBottom: "Teks di bawah",
  wbStrokeWidth: "Ketebalan garis",
  wbStrokeWidthNone: "Tanpa garis",
  wbStrokeWidthValue: "{n} pt",
  wbDash: "Jenis garis",
  wbDashSolid: "Penuh",
  wbDashDashed: "Putus-putus",
  wbDashDotted: "Titik-titik",
  wbRoute: "Bentuk garis",
  wbRouteStraight: "Lurus",
  wbRouteElbow: "Siku",
  wbRouteCurve: "Lengkung",
  wbArrowStart: "Panah di awal",
  wbArrowEnd: "Panah di akhir",
  wbLock: "Kunci",
  wbUnlock: "Buka kunci",
  wbLocked: "Terkunci",
  wbLink: "Tautan",
  wbLinkTitle: "Atur tautan",
  wbLinkUrl: "URL (http:// atau https://)",
  wbLinkInvalid: "Masukkan URL yang diawali http:// atau https://",
  wbLinkRemove: "Hapus tautan",
  wbLinkSave: "Simpan",
  wbLinkOpen: "Buka tautan: {url}",
  wbArrangeLabel: "Susun",
  wbAlignBoxesLeft: "Ratakan tepi kiri",
  wbAlignBoxesCenter: "Ratakan ke tengah",
  wbAlignBoxesRight: "Ratakan tepi kanan",
  wbAlignBoxesTop: "Ratakan tepi atas",
  wbAlignBoxesMiddle: "Ratakan ke tengah vertikal",
  wbAlignBoxesBottom: "Ratakan tepi bawah",
  wbDistributeH: "Beri jarak sama mendatar",
  wbDistributeV: "Beri jarak sama menurun",
  wbSnap: "Tempel ke kisi",
  wbVote: "Pilih / batalkan",
  wbVoteCount: "{count} suara",
  wbVoteCountOne: "1 suara",
  wbTableLabel: "Tabel",
  wbTableRowAbove: "Tambah baris di atas",
  wbTableRowBelow: "Tambah baris di bawah",
  wbTableRowDelete: "Hapus baris",
  wbTableColLeft: "Tambah kolom di kiri",
  wbTableColRight: "Tambah kolom di kanan",
  wbTableColDelete: "Hapus kolom",
  wbCellEditLabel: "Sel (baris {row}, kolom {col})",
  wbLabelEditLabel: "Teks pada garis",
  wbImageInsert: "Sisipkan gambar",
  wbImageUploading: "Menyimpan gambar…",
  wbImageFailed: "Gambar tidak dapat disimpan",
  wbImageTooLarge: "Gambar terlalu besar (maks. 10 MB)",
  wbImageNotImage: "Hanya gambar (PNG, JPEG, GIF, WebP) yang dapat ditaruh",
  wbImageAlt: "Gambar",
  wbPastedTable: "Tabel ditempel: {rows} × {cols} (baris × kolom)",
  wbTemplates: "Templat",
  wbTemplateKpt: "KPT (retrospeksi)",
  wbTemplateSwot: "SWOT",
  wbTemplateMinutes: "Notulen rapat",
  wbTemplateReport: "Laporan satu halaman",
  wbTplKeep: "Keep (pertahankan)",
  wbTplProblem: "Problem (masalah)",
  wbTplTry: "Try (coba berikutnya)",
  wbTplStrengths: "Kekuatan (Strengths)",
  wbTplWeaknesses: "Kelemahan (Weaknesses)",
  wbTplOpportunities: "Peluang (Opportunities)",
  wbTplThreats: "Ancaman (Threats)",
  wbTplMinutesTitle: "Notulen rapat",
  wbTplMinutesMeta: "Waktu:\nPeserta:\nTujuan:",
  wbTplAgenda: "Agenda",
  wbTplDecisions: "Keputusan",
  wbTplActions: "Tindakan (siapa, kapan)",
  wbTplReportTitle: "Laporan",
  wbTplSummary: "Ringkasan",
  wbTplProgress: "Kemajuan",
  wbTplIssues: "Masalah / pertanyaan",
  wbTplNext: "Langkah berikutnya",
  wbMindChild: "Tambah anak (Insert)",
  wbMindSibling: "Tambah saudara (Enter)",
  wbMindLayout: "Rapikan peta pikiran",
  wbExportPng: "Simpan sebagai PNG",
  wbExportFailed: "PNG tidak dapat dibuat",
  wbToIcebox: "Tambah ke IceBox",
  wbToIceboxDone: "{count} ditambahkan ke IceBox",
  wbToIceboxFailed: "Tidak dapat menambah ke IceBox",
  wbRemoteUpdated: "Perubahan orang lain ditampilkan",
  wbConnectHint: "Dekatkan ujung garis ke bentuk untuk menghubungkannya ke tengah sisi",
  wbToIceboxPartial: "{count} ditambahkan, tetapi sisanya tidak dapat ditambahkan",
  wbLinkOpenNewTab: "Buka tautan (tab baru): {url}",
  wbTextEditHint: "Tekan Esc atau Ctrl+Enter untuk selesai mengedit",
  wbRemotePaused: "Perubahan orang lain belum dapat dimuat (lembar mungkin tidak terbaru). Mencoba lagi…",
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
