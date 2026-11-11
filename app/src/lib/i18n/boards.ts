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
  wbTemplateMinutes: string
  wbTemplateReport: string
  wbTplKeep: string
  wbTplProblem: string
  wbTplTry: string
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
  wbTemplateZeva: string
  wbTplZevaCurrent: string
  wbTplZevaFuture: string
  wbTplZevaResult: string
  wbTplZevaCause: string
  wbTplZeva1: string
  wbTplZeva1Hint: string
  wbTplZeva2: string
  wbTplZeva2Hint: string
  wbTplZeva3: string
  wbTplZeva3Hint: string
  wbTplZeva4: string
  wbTplZeva4Hint: string
  wbTplZevaLoop: string
  wbUnderline: string
  wbGroup: string
  wbUngroup: string
  wbGrouped: string
  wbTableColNarrow: string
  wbTableColWiden: string
  wbTableRowShorter: string
  wbTableRowTaller: string
  wbTableResizeHint: string
  wbBodyEditLabel: string
  wbFullscreen: string
  wbFullscreenExit: string
  wbFormatTooLarge: string
  wbTemplateWhy5: string
  wbTemplateFishbone: string
  wbTemplatePdcas: string
  wbTemplateEcrs: string
  wbTemplateA3: string
  wbTplWhy5Problem: string
  wbTplWhy5ProblemHint: string
  wbTplWhy5Why: string
  wbTplWhy5WhyHint: string
  wbTplWhy5Root: string
  wbTplWhy5RootHint: string
  wbTplWhy5Action: string
  wbTplWhy5ActionHint: string
  wbTplFishEffect: string
  wbTplFishEffectHint: string
  wbTplFishMan: string
  wbTplFishMachine: string
  wbTplFishMaterial: string
  wbTplFishMethod: string
  wbTplFishMeasurement: string
  wbTplFishManagement: string
  wbTplFishEnvironment: string
  wbTplFishNote: string
  wbTplPdcaP: string
  wbTplPdcaPHint: string
  wbTplPdcaD: string
  wbTplPdcaDHint: string
  wbTplPdcaC: string
  wbTplPdcaCHint: string
  wbTplPdcaA: string
  wbTplPdcaAHint: string
  wbTplPdcaS: string
  wbTplPdcaSHint: string
  wbTplPdcaNote: string
  wbTplEcrsTitle: string
  wbTplEcrsWork: string
  wbTplEcrsE: string
  wbTplEcrsC: string
  wbTplEcrsR: string
  wbTplEcrsS: string
  wbTplEcrsEffect: string
  wbTplEcrsNote: string
  wbTplA3Title: string
  wbTplA3Meta: string
  wbTplA3Background: string
  wbTplA3Current: string
  wbTplA3Target: string
  wbTplA3Cause: string
  wbTplA3Measures: string
  wbTplA3Plan: string
  wbTplA3Result: string
  wbTplA3Standard: string
  wbShapeLibrary: string
  wbShapeGroupBasic: string
  wbShapeGroupFlow: string
  wbShapeGroupProcess: string
  wbShapeGroupSite: string
  wbShapeDiamond: string
  wbShapeTriangle: string
  wbShapeStorage: string
  wbShapeHexagon: string
  wbShapeParallelogram: string
  wbShapeChevron: string
  wbShapeBlockArrow: string
  wbShapeCylinder: string
  wbShapeDocument: string
  wbShapeDelay: string
  wbShapeTransport: string
  wbShapeInspectQty: string
  wbShapePerson: string
  wbShapeFactory: string
  wbShapeTruck: string
  wbShapeCloud: string
  wbShapeStar: string
  wbToolTimer: string
  wbTimerStart: string
  wbTimerPause: string
  wbTimerReset: string
  wbTimerLonger: string
  wbTimerShorter: string
  wbTimerDone: string
  wbTimerAria: string
  wbVoteBudget: string
  wbVoteBudgetNone: string
  wbVoteBudgetMore: string
  wbVoteBudgetLess: string
  wbVotesLeft: string
  wbVoteAdd: string
  wbVoteRemove: string
  wbSortByVotes: string
  wbConnect: string
  wbContextMenu: string
  wbCut: string
  wbCopy: string
  wbPaste: string
  wbEditText: string
  wbEditTitle: string
  wbSelectAll: string
  wbAddHere: string
  wbOrderLabel: string
  wbSearch: string
  wbSearchLabel: string
  wbSearchPlaceholder: string
  wbSearchNone: string
  wbSearchCount: string
  wbSearchLoading: string
  wbSearchClose: string
  wbExportMenu: string
  wbExportPdfA4: string
  wbExportPdfA3: string
  wbHelp: string
  wbHelpTitle: string
  wbHelpClose: string
  wbHelp01: string
  wbHelp02: string
  wbHelp03: string
  wbHelp04: string
  wbHelp05: string
  wbHelp06: string
  wbHelp07: string
  wbHelp08: string
  wbHelp09: string
  wbHelp10: string
  wbHelp11: string
  wbHelp12: string
  wbHelp13: string
  wbHelp14: string
  wbHelp15: string
  wbHelp16: string
  wbHelp17: string
  wbAlignGuides: string
  wbPbiLink: string
  wbPbiCreate: string
  wbComment: string
  wbViewersLabel: string
  wbViewersMoreCount: string
  wbViewerSelecting: string
  wbHistory: string
  wbHistoryTitle: string
  wbHistoryEmpty: string
  wbHistoryAuto: string
  wbHistorySaveNow: string
  wbHistoryLabel: string
  wbHistorySave: string
  wbHistoryView: string
  wbHistoryRestore: string
  wbHistoryRestoreTitle: string
  wbHistoryRestoreMessage: string
  wbHistoryRestored: string
  wbHistorySaved: string
  wbHistoryFailed: string
  wbHistoryElements: string
  wbHistoryPreview: string
  wbHistoryClose: string
  wbComments: string
  wbCommentsCount: string
  wbCommentsEmpty: string
  wbCommentOn: string
  wbCommentOnSheet: string
  wbCommentLabel: string
  wbCommentSend: string
  wbCommentResolve: string
  wbCommentReopen: string
  wbCommentDelete: string
  wbCommentShowResolved: string
  wbCommentShow: string
  wbCommentFailed: string
  wbCommentBadge: string
  wbCommentSheetName: string
  wbPbiLinkTitle: string
  wbPbiSearch: string
  wbPbiNone: string
  wbPbiUnlink: string
  wbPbiOpen: string
  wbPbiCreated: string
  wbPbiCreateFailed: string
  wbPbiStatusReady: string
  wbPbiStatusNotReady: string
  wbPbiStatusCompleted: string
  wbPbiMissing: string
  wbPbiConfidential: string
  wbPbiLinked: string
  wbLinkedBoardsTitle: string
  wbLinkedBoardsEmpty: string
  wbLinkedBoardsOpen: string
  wbAiSummarize: string
  wbAiGroup: string
  wbAiWorking: string
  wbAiFailed: string
  wbAiSummaryTitle: string
  wbAiDone: string
  wbTimerMinutes: string
  wbGroupLabel: string
  wbUngroupLabel: string
  wbConnectLabel: string
  wbTimerDoneStatus: string
  wbHistoryViewOf: string
  wbHistoryRestoreOf: string
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
    "ツールを選んでEnterキーを押すと中央に図形を置きます。矢印キーで選択した図形を移動、Enterキーでテキストを編集、Deleteキーで削除、Ctrl+Zで元に戻します。] と [ キーで図形を一つずつ選べます。図形を選んで文字を打つとそのまま書き込めます（F2 でも編集）。Insert キーで右につながる図形（マインドマップ）を、Alt+矢印キーで選んだ図形の大きさを変えます。Ctrl+Enter で図形のリンクを開きます。 Ctrl+G でグループ化、Ctrl+Shift+G で解除します。",
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
  wbTemplateMinutes: "議事メモ",
  wbTemplateReport: "報告（1 枚）",
  wbTplKeep: "Keep（続けること）",
  wbTplProblem: "Problem（困ったこと）",
  wbTplTry: "Try（次に試すこと）",
  wbTplMinutesTitle: "議事メモ",
  wbTplMinutesMeta: "日時：\n参加者：\n目的：",
  wbTplAgenda: "議題",
  wbTplDecisions: "決まったこと",
  wbTplActions: "やること（担当・期限）",
  wbTplReportTitle: "報告",
  wbTplSummary: "背景／目的",
  wbTplProgress: "報告課題",
  wbTplIssues: "結論",
  wbTplNext: "次の予定",
  wbTemplateZeva: "ZEVA 4つの箱",
  wbTplZevaCurrent: "現状",
  wbTplZevaFuture: "ありたい姿",
  wbTplZevaResult: "結果系",
  wbTplZevaCause: "要因系",
  wbTplZeva1: "① 現状の値",
  wbTplZeva1Hint: "OEE・CT・人員・不良率・V.Score・価値作業比率など数値で。理論値に対するロスを見える化する",
  wbTplZeva2: "② 現状のやり方",
  wbTplZeva2Hint: "なぜ①の結果なのか。4M（7要因）の視点で弱点・バラツキ要因を書く",
  wbTplZeva3: "③ 新たなやり方",
  wbTplZeva3Hint: "②の弱点を克服する改善策。理論値から考え、ECRS などで有効な理由を示す",
  wbTplZeva4: "④ 目標の値",
  wbTplZeva4Hint: "③で削減できるロスを積み上げた論理的な目標（例：人員−1、CT−20%）",
  wbTplZevaLoop: "②→③→④→①との比較 を何度も往復し、仮説と検証で改善シナリオの精度を高める",
  wbUnderline: "下線",
  wbGroup: "グループ化 (Ctrl+G)",
  wbUngroup: "グループ解除 (Ctrl+Shift+G)",
  wbGrouped: "グループ",
  wbTableColNarrow: "列の幅を狭く",
  wbTableColWiden: "列の幅を広く",
  wbTableRowShorter: "行の高さを低く",
  wbTableRowTaller: "行の高さを高く",
  wbTableResizeHint: "表の罫線をドラッグすると列の幅・行の高さを変えられます",
  wbBodyEditLabel: "本文を編集",
  wbFullscreen: "全画面表示",
  wbFullscreenExit: "全画面表示を終了",
  wbFormatTooLarge: "書式の情報が多すぎるため、文字だけを保存しました（書式は保存されていません）",
  wbTemplateWhy5: "なぜなぜ分析",
  wbTemplateFishbone: "特性要因図（7つの要因）",
  wbTemplatePdcas: "PDCA-S",
  wbTemplateEcrs: "ECRS 検討表",
  wbTemplateA3: "A3 報告書",
  wbTplWhy5Problem: "問題（起きたこと）",
  wbTplWhy5ProblemHint: "いつ・どこで・何が起きたか。事実と数値で書く",
  wbTplWhy5Why: "なぜ{n}",
  wbTplWhy5WhyHint: "なぜそれが起きたか。推測でなく現場・現物で確かめる",
  wbTplWhy5Root: "真因（X）",
  wbTplWhy5RootHint: "ここに手を打てば再発しない原因。人の意識ではなく仕組み・条件で書く",
  wbTplWhy5Action: "対策",
  wbTplWhy5ActionHint: "真因への対策と、標準（4M）にどう反映するか",
  wbTplFishEffect: "特性（結果 Y）",
  wbTplFishEffectHint: "ばらつきを減らしたい結果を数値で（例：CT のばらつき、不良率）",
  wbTplFishMan: "人（Man）",
  wbTplFishMachine: "設備（Machine）",
  wbTplFishMaterial: "材料（Material）",
  wbTplFishMethod: "方法（Method）",
  wbTplFishMeasurement: "測定（Measurement）",
  wbTplFishManagement: "管理（Management）",
  wbTplFishEnvironment: "環境（Environment）",
  wbTplFishNote: "7つのバラツキ要因（X）ごとに、思いつく要因を付箋で骨の近くに貼る",
  wbTplPdcaP: "P 計画（Plan）",
  wbTplPdcaPHint: "目標と、やり方の仮説を決める",
  wbTplPdcaD: "D 実行（Do）",
  wbTplPdcaDHint: "計画どおりに試す（小さく・早く）",
  wbTplPdcaC: "C 確認（Check）",
  wbTplPdcaCHint: "結果を目標・理論値と数値で比べる",
  wbTplPdcaA: "A 処置（Act）",
  wbTplPdcaAHint: "効果があれば定着へ、なければ原因を見直す",
  wbTplPdcaS: "S 標準化（Standardize）",
  wbTplPdcaSHint: "良い状態を 4M 標準・手順書に反映し、誰がやっても同じ結果にする",
  wbTplPdcaNote: "標準化で土台が更新され、次のサイクルはより高い水準から始まる",
  wbTplEcrsTitle: "ECRS 検討表",
  wbTplEcrsWork: "作業・工程",
  wbTplEcrsE: "E 排除（なくせないか）",
  wbTplEcrsC: "C 結合（まとめられないか）",
  wbTplEcrsR: "R 交換（順序・場所を替えられないか）",
  wbTplEcrsS: "S 簡素化（簡単にできないか）",
  wbTplEcrsEffect: "効果（時間・人・ばらつき）",
  wbTplEcrsNote: "E（その作業は本当に必要か）から順に考える",
  wbTplA3Title: "テーマ：",
  wbTplA3Meta: "部署・氏名・日付：",
  wbTplA3Background: "1. 背景・テーマ選定の理由",
  wbTplA3Current: "2. 現状把握（データ・理論値との差）",
  wbTplA3Target: "3. 目標（いつまでに何をどれだけ）",
  wbTplA3Cause: "4. 要因分析（真因）",
  wbTplA3Measures: "5. 対策",
  wbTplA3Plan: "6. 実施計画（誰が・いつ）",
  wbTplA3Result: "7. 効果の確認",
  wbTplA3Standard: "8. 標準化と横展開",
  wbShapeLibrary: "図形ライブラリ",
  wbShapeGroupBasic: "基本",
  wbShapeGroupFlow: "流れ・データ",
  wbShapeGroupProcess: "工程図記号",
  wbShapeGroupSite: "現場",
  wbShapeDiamond: "ひし形（判断・品質検査）",
  wbShapeTriangle: "三角形",
  wbShapeStorage: "貯蔵（▽）",
  wbShapeHexagon: "六角形（準備）",
  wbShapeParallelogram: "平行四辺形（入出力）",
  wbShapeChevron: "矢羽根（工程の流れ）",
  wbShapeBlockArrow: "太い矢印",
  wbShapeCylinder: "円柱（データ）",
  wbShapeDocument: "書類",
  wbShapeDelay: "滞留（D）",
  wbShapeTransport: "運搬",
  wbShapeInspectQty: "数量検査（□）",
  wbShapePerson: "人",
  wbShapeFactory: "工場・設備",
  wbShapeTruck: "トラック・搬送",
  wbShapeCloud: "雲（アイデア）",
  wbShapeStar: "星",
  wbToolTimer: "タイマー・投票",
  wbTimerStart: "開始",
  wbTimerPause: "一時停止",
  wbTimerReset: "リセット",
  wbTimerLonger: "1 分長く",
  wbTimerShorter: "1 分短く",
  wbTimerDone: "時間です",
  wbTimerAria: "タイマー：残り {time}",
  wbVoteBudget: "持ち票：{n} 票",
  wbVoteBudgetNone: "持ち票なし（1 枚に 1 票）",
  wbVoteBudgetMore: "持ち票を増やす",
  wbVoteBudgetLess: "持ち票を減らす",
  wbVotesLeft: "あなたの残り：{n} 票",
  wbVoteAdd: "1 票入れる",
  wbVoteRemove: "1 票取り消す",
  wbSortByVotes: "票の多い順に並べる",
  wbConnect: "矢印でつなぐ (Alt+L)",
  wbContextMenu: "メニュー",
  wbCut: "切り取り",
  wbCopy: "コピー",
  wbPaste: "貼り付け",
  wbEditText: "文字を編集",
  wbEditTitle: "見出しを編集",
  wbSelectAll: "すべて選択",
  wbAddHere: "ここに追加",
  wbOrderLabel: "重なり順",
  wbSearch: "検索 (Ctrl+F)",
  wbSearchLabel: "ホワイトボード内を検索",
  wbSearchPlaceholder: "全シートの文字を検索",
  wbSearchNone: "見つかりません",
  wbSearchCount: "{count} 件",
  wbSearchLoading: "検索しています…",
  wbSearchClose: "検索を閉じる",
  wbExportMenu: "保存・出力",
  wbExportPdfA4: "PDF で保存（A4）",
  wbExportPdfA3: "PDF で保存（A3）",
  wbHelp: "操作ガイド (?)",
  wbHelpTitle: "ホワイトボードの操作",
  wbHelpClose: "閉じる",
  wbHelp01: "ダブルクリック\t文字を編集（フレームは本文、見出しの所は見出し）",
  wbHelp02: "右クリック\tその場で使えるメニュー（Shift+F10・メニューキーでも開きます）",
  wbHelp03: "空いた所をドラッグ\t範囲を選ぶ。Space＋ドラッグ・ホイールで表示を動かす",
  wbHelp04: "Ctrl＋ホイール\t拡大・縮小",
  wbHelp05: "図形を選んで文字を打つ\tそのまま書き込む",
  wbHelp06: "Enter / F2\t文字を編集 / フレームの見出しを編集",
  wbHelp07: "Esc\t編集を終える・選択を外す",
  wbHelp08: "矢印キー（Shift で 10 ずつ）\t動かす。Alt＋矢印キーで大きさを変える",
  wbHelp09: "Ctrl+C / X / V / D\tコピー・切り取り・貼り付け・複製",
  wbHelp10: "Ctrl+Z / Ctrl+Y\t元に戻す・やり直す",
  wbHelp11: "Ctrl+G / Ctrl+Shift+G\tグループ化・グループ解除",
  wbHelp12: "Alt+L\t選んだ 2 つの図形を矢印でつなぐ",
  wbHelp13: "Insert\tマインドマップの子を追加",
  wbHelp14: "Ctrl+B / I / U\t（文字の編集中）選んだ文字を太字・斜体・下線に",
  wbHelp15: "] / [\t図形を 1 つずつ選ぶ",
  wbHelp16: "Ctrl+F\t全シートの文字を検索",
  wbHelp17: "?\tこの操作ガイドを開く",
  wbAlignGuides: "整列ガイド",
  wbPbiLink: "PBI とつなぐ…",
  wbPbiCreate: "この内容で PBI を作る",
  wbComment: "コメント…",
  wbViewersLabel: "このシートを開いている人",
  wbViewersMoreCount: "ほか {n} 人",
  wbViewerSelecting: "{name} さんが選択中",
  wbHistory: "履歴・版",
  wbHistoryTitle: "このシートの履歴",
  wbHistoryEmpty: "まだ版はありません（描いていると 10 分ごとに自動で残ります）",
  wbHistoryAuto: "自動",
  wbHistorySaveNow: "今の状態に名前を付けて保存",
  wbHistoryLabel: "版の名前",
  wbHistorySave: "保存",
  wbHistoryView: "見る",
  wbHistoryRestore: "この版に戻す",
  wbHistoryRestoreTitle: "この版に戻しますか",
  wbHistoryRestoreMessage: "{time} の状態に戻します。今の状態も版として残るので、あとで戻せます。",
  wbHistoryRestored: "{time} の状態に戻しました",
  wbHistorySaved: "版を保存しました",
  wbHistoryFailed: "履歴を読めませんでした",
  wbHistoryElements: "{n} 個",
  wbHistoryPreview: "{time} の版",
  wbHistoryClose: "閉じる",
  wbComments: "コメント",
  wbCommentsCount: "コメント（{n}）",
  wbCommentsEmpty: "まだコメントはありません。図形を右クリック →「コメント」で書けます",
  wbCommentOn: "「{target}」へのコメント",
  wbCommentOnSheet: "シート全体へのコメント",
  wbCommentLabel: "コメントを書く（@ で人を呼べます）",
  wbCommentSend: "コメントする",
  wbCommentResolve: "解決",
  wbCommentReopen: "未解決に戻す",
  wbCommentDelete: "削除",
  wbCommentShowResolved: "解決済みも表示",
  wbCommentShow: "図形を表示",
  wbCommentFailed: "コメントを保存できませんでした",
  wbCommentBadge: "コメント {n} 件",
  wbCommentSheetName: "シート：{name}",
  wbPbiLinkTitle: "PBI とつなぐ",
  wbPbiSearch: "番号（#12）か言葉で探す",
  wbPbiNone: "見つかりません",
  wbPbiUnlink: "つながりを外す",
  wbPbiOpen: "PBI を開く",
  wbPbiCreated: "PBI #{n} を作ってつなぎました",
  wbPbiCreateFailed: "PBI を作れませんでした",
  wbPbiStatusReady: "準備完了",
  wbPbiStatusNotReady: "準備中",
  wbPbiStatusCompleted: "完了",
  wbPbiMissing: "PBI が見つかりません",
  wbPbiConfidential: "機密",
  wbPbiLinked: "PBI #{n} とつなぎました",
  wbLinkedBoardsTitle: "つながっているホワイトボード",
  wbLinkedBoardsEmpty: "この PBI につながるホワイトボードの図形はありません",
  wbLinkedBoardsOpen: "{board} の「{sheet}」を開く",
  wbAiSummarize: "AI で要約（社内のローカル AI）",
  wbAiGroup: "AI でグループ分け（社内のローカル AI）",
  wbAiWorking: "AI が考えています…",
  wbAiFailed: "AI を使えませんでした：{reason}",
  wbAiSummaryTitle: "要約（AI）",
  wbAiDone: "AI の結果を置きました（元に戻すは Ctrl+Z）",
  wbTimerMinutes: "{n} 分",
  wbGroupLabel: "グループ化",
  wbUngroupLabel: "グループ解除",
  wbConnectLabel: "矢印でつなぐ",
  wbTimerDoneStatus: "タイマーの時間になりました",
  wbHistoryViewOf: "{name} を見る",
  wbHistoryRestoreOf: "{name} に戻す",
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
  wbTextEditHint: "Esc か Ctrl+Enter で編集を終えます。文字を範囲選択すると、その部分だけ書式（大きさ・太字・斜体・下線・色・フォント）を変えられます（Ctrl+B / Ctrl+I / Ctrl+U）",
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
    "Pick a tool and press Enter to place a shape in the centre. Arrow keys move the selected shapes, Enter edits the text, Delete removes them and Ctrl+Z undoes. ] and [ step through the shapes one by one. Type with a shape selected to write into it (F2 edits too). Insert adds a connected shape to the right (mind map); Alt+arrow keys resize the selected shape. Ctrl+Enter opens a shape's link. Ctrl+G groups the selected shapes, Ctrl+Shift+G ungroups them.",
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
  wbTemplateMinutes: "Meeting notes",
  wbTemplateReport: "One-page report",
  wbTplKeep: "Keep",
  wbTplProblem: "Problem",
  wbTplTry: "Try",
  wbTplMinutesTitle: "Meeting notes",
  wbTplMinutesMeta: "Date:\nAttendees:\nPurpose:",
  wbTplAgenda: "Agenda",
  wbTplDecisions: "Decisions",
  wbTplActions: "Actions (who, by when)",
  wbTplReportTitle: "Report",
  wbTplSummary: "Background / purpose",
  wbTplProgress: "Issues to report",
  wbTplIssues: "Conclusion",
  wbTplNext: "Next steps",
  wbTemplateZeva: "ZEVA four boxes",
  wbTplZevaCurrent: "Current",
  wbTplZevaFuture: "Desired future",
  wbTplZevaResult: "Result",
  wbTplZevaCause: "Cause",
  wbTplZeva1: "① Current value",
  wbTplZeva1Hint: "Numbers: OEE, CT, headcount, defects, V.Score, value ratio… Make the loss against the theoretical value visible",
  wbTplZeva2: "② Current way",
  wbTplZeva2Hint: "Why is ① the result? Weak points and causes of variation by 4M (7 factors)",
  wbTplZeva3: "③ New way",
  wbTplZeva3Hint: "Countermeasures that overcome ②, reasoned from the theoretical value and justified with ECRS",
  wbTplZeva4: "④ Target value",
  wbTplZeva4Hint: "A logical target built by stacking the losses removed in ③ (e.g. −1 person, −20% CT)",
  wbTplZevaLoop: "Loop ② → ③ → ④ → compare with ① repeatedly; refine the scenario with hypothesis and verification",
  wbUnderline: "Underline",
  wbGroup: "Group (Ctrl+G)",
  wbUngroup: "Ungroup (Ctrl+Shift+G)",
  wbGrouped: "grouped",
  wbTableColNarrow: "Narrower column",
  wbTableColWiden: "Wider column",
  wbTableRowShorter: "Shorter row",
  wbTableRowTaller: "Taller row",
  wbTableResizeHint: "Drag a table's ruling to change a column's width or a row's height",
  wbBodyEditLabel: "Edit body text",
  wbFullscreen: "Full screen",
  wbFullscreenExit: "Exit full screen",
  wbFormatTooLarge: "The formatting was too large to store: only the text was saved (without its formatting)",
  wbTemplateWhy5: "5 Whys",
  wbTemplateFishbone: "Fishbone (7 factors)",
  wbTemplatePdcas: "PDCA-S",
  wbTemplateEcrs: "ECRS worksheet",
  wbTemplateA3: "A3 report",
  wbTplWhy5Problem: "Problem (what happened)",
  wbTplWhy5ProblemHint: "When, where and what happened — in facts and numbers",
  wbTplWhy5Why: "Why {n}",
  wbTplWhy5WhyHint: "Why did that happen? Check on site, with the real thing — not by guessing",
  wbTplWhy5Root: "Root cause (X)",
  wbTplWhy5RootHint: "The cause that, once fixed, stops it recurring. Write a mechanism or condition, not someone's awareness",
  wbTplWhy5Action: "Countermeasure",
  wbTplWhy5ActionHint: "What you do about the root cause, and how it goes into the standard (4M)",
  wbTplFishEffect: "Effect (result Y)",
  wbTplFishEffectHint: "The result whose variation you want to reduce, in numbers (e.g. CT variation, defect rate)",
  wbTplFishMan: "Man",
  wbTplFishMachine: "Machine",
  wbTplFishMaterial: "Material",
  wbTplFishMethod: "Method",
  wbTplFishMeasurement: "Measurement",
  wbTplFishManagement: "Management",
  wbTplFishEnvironment: "Environment",
  wbTplFishNote: "For each of the seven variation factors (X), put the causes you can think of on sticky notes near its bone",
  wbTplPdcaP: "P Plan",
  wbTplPdcaPHint: "Set the target and the hypothesis of how to reach it",
  wbTplPdcaD: "D Do",
  wbTplPdcaDHint: "Try it as planned (small and quick)",
  wbTplPdcaC: "C Check",
  wbTplPdcaCHint: "Compare the result with the target and the theoretical value, in numbers",
  wbTplPdcaA: "A Act",
  wbTplPdcaAHint: "If it worked, make it stick; if not, revisit the cause",
  wbTplPdcaS: "S Standardize",
  wbTplPdcaSHint: "Put the good state into the 4M standards and instructions, so anyone gets the same result",
  wbTplPdcaNote: "Standardizing renews the foundation: the next cycle starts from a higher level",
  wbTplEcrsTitle: "ECRS worksheet",
  wbTplEcrsWork: "Task / process",
  wbTplEcrsE: "E Eliminate (can it go?)",
  wbTplEcrsC: "C Combine (can it be merged?)",
  wbTplEcrsR: "R Rearrange (other order or place?)",
  wbTplEcrsS: "S Simplify (can it be easier?)",
  wbTplEcrsEffect: "Effect (time, people, variation)",
  wbTplEcrsNote: "Start with E: is this task really needed?",
  wbTplA3Title: "Theme:",
  wbTplA3Meta: "Department, name, date:",
  wbTplA3Background: "1. Background and why this theme",
  wbTplA3Current: "2. Current state (data, gap to the theoretical value)",
  wbTplA3Target: "3. Target (what, how much, by when)",
  wbTplA3Cause: "4. Cause analysis (root cause)",
  wbTplA3Measures: "5. Countermeasures",
  wbTplA3Plan: "6. Plan (who, when)",
  wbTplA3Result: "7. Results",
  wbTplA3Standard: "8. Standardize and spread",
  wbShapeLibrary: "Shape library",
  wbShapeGroupBasic: "Basic",
  wbShapeGroupFlow: "Flow and data",
  wbShapeGroupProcess: "Process chart symbols",
  wbShapeGroupSite: "Shop floor",
  wbShapeDiamond: "Diamond (decision, quality check)",
  wbShapeTriangle: "Triangle",
  wbShapeStorage: "Storage (▽)",
  wbShapeHexagon: "Hexagon (preparation)",
  wbShapeParallelogram: "Parallelogram (input / output)",
  wbShapeChevron: "Chevron (process flow)",
  wbShapeBlockArrow: "Block arrow",
  wbShapeCylinder: "Cylinder (data)",
  wbShapeDocument: "Document",
  wbShapeDelay: "Delay (D)",
  wbShapeTransport: "Transport",
  wbShapeInspectQty: "Quantity check (□)",
  wbShapePerson: "Person",
  wbShapeFactory: "Factory / equipment",
  wbShapeTruck: "Truck / delivery",
  wbShapeCloud: "Cloud (idea)",
  wbShapeStar: "Star",
  wbToolTimer: "Timer and voting",
  wbTimerStart: "Start",
  wbTimerPause: "Pause",
  wbTimerReset: "Reset",
  wbTimerLonger: "1 minute longer",
  wbTimerShorter: "1 minute shorter",
  wbTimerDone: "Time is up",
  wbTimerAria: "Timer: {time} left",
  wbVoteBudget: "Votes per person: {n}",
  wbVoteBudgetNone: "No vote budget (one vote per note)",
  wbVoteBudgetMore: "More votes per person",
  wbVoteBudgetLess: "Fewer votes per person",
  wbVotesLeft: "You have {n} votes left",
  wbVoteAdd: "Add a vote",
  wbVoteRemove: "Take back a vote",
  wbSortByVotes: "Sort by votes (most first)",
  wbConnect: "Connect with an arrow (Alt+L)",
  wbContextMenu: "Menu",
  wbCut: "Cut",
  wbCopy: "Copy",
  wbPaste: "Paste",
  wbEditText: "Edit text",
  wbEditTitle: "Edit title",
  wbSelectAll: "Select all",
  wbAddHere: "Add here",
  wbOrderLabel: "Order",
  wbSearch: "Search (Ctrl+F)",
  wbSearchLabel: "Search this White Board",
  wbSearchPlaceholder: "Search the text of every sheet",
  wbSearchNone: "Nothing found",
  wbSearchCount: "{count} found",
  wbSearchLoading: "Searching…",
  wbSearchClose: "Close search",
  wbExportMenu: "Save and export",
  wbExportPdfA4: "Save as PDF (A4)",
  wbExportPdfA3: "Save as PDF (A3)",
  wbHelp: "How to use (?)",
  wbHelpTitle: "Using the White Board",
  wbHelpClose: "Close",
  wbHelp01: "Double-click\tEdit the text (in a frame: its body; on the title bar: the title)",
  wbHelp02: "Right-click\tThe menu for what you clicked (also Shift+F10 or the menu key)",
  wbHelp03: "Drag on empty space\tSelect an area. Space + drag or the wheel moves the view",
  wbHelp04: "Ctrl + wheel\tZoom in and out",
  wbHelp05: "Type with a shape selected\tWrite into it",
  wbHelp06: "Enter / F2\tEdit the text / edit a frame's title",
  wbHelp07: "Esc\tFinish editing, clear the selection",
  wbHelp08: "Arrow keys (Shift: by 10)\tMove. Alt + arrow keys resize",
  wbHelp09: "Ctrl+C / X / V / D\tCopy, cut, paste, duplicate",
  wbHelp10: "Ctrl+Z / Ctrl+Y\tUndo, redo",
  wbHelp11: "Ctrl+G / Ctrl+Shift+G\tGroup, ungroup",
  wbHelp12: "Alt+L\tConnect the two selected shapes with an arrow",
  wbHelp13: "Insert\tAdd a mind-map child",
  wbHelp14: "Ctrl+B / I / U\t(While editing) bold, italic, underline the selected characters",
  wbHelp15: "] / [\tSelect the shapes one by one",
  wbHelp16: "Ctrl+F\tSearch the text of every sheet",
  wbHelp17: "?\tOpen this guide",
  wbAlignGuides: "Alignment guides",
  wbPbiLink: "Link to a PBI…",
  wbPbiCreate: "Create a PBI from this",
  wbComment: "Comment…",
  wbViewersLabel: "People on this sheet",
  wbViewersMoreCount: "{n} more",
  wbViewerSelecting: "Selected by {name}",
  wbHistory: "History",
  wbHistoryTitle: "History of this sheet",
  wbHistoryEmpty: "No versions yet (one is kept every 10 minutes while people draw)",
  wbHistoryAuto: "Automatic",
  wbHistorySaveNow: "Save the current state under a name",
  wbHistoryLabel: "Name of the version",
  wbHistorySave: "Save",
  wbHistoryView: "View",
  wbHistoryRestore: "Restore this version",
  wbHistoryRestoreTitle: "Restore this version?",
  wbHistoryRestoreMessage: "The sheet goes back to how it was at {time}. The current state is kept as a version too, so this can be undone.",
  wbHistoryRestored: "Restored the state of {time}",
  wbHistorySaved: "Version saved",
  wbHistoryFailed: "The history could not be read",
  wbHistoryElements: "{n} items",
  wbHistoryPreview: "Version of {time}",
  wbHistoryClose: "Close",
  wbComments: "Comments",
  wbCommentsCount: "Comments ({n})",
  wbCommentsEmpty: "No comments yet. Right-click a shape → Comment to write one",
  wbCommentOn: "On “{target}”",
  wbCommentOnSheet: "On the whole sheet",
  wbCommentLabel: "Write a comment (@ to mention someone)",
  wbCommentSend: "Post",
  wbCommentResolve: "Resolve",
  wbCommentReopen: "Reopen",
  wbCommentDelete: "Delete",
  wbCommentShowResolved: "Show resolved",
  wbCommentShow: "Show the shape",
  wbCommentFailed: "The comment could not be saved",
  wbCommentBadge: "{n} comments",
  wbCommentSheetName: "Sheet: {name}",
  wbPbiLinkTitle: "Link to a PBI",
  wbPbiSearch: "Search by number (#12) or words",
  wbPbiNone: "Nothing found",
  wbPbiUnlink: "Unlink",
  wbPbiOpen: "Open the PBI",
  wbPbiCreated: "Created PBI #{n} and linked it",
  wbPbiCreateFailed: "The PBI could not be created",
  wbPbiStatusReady: "Ready",
  wbPbiStatusNotReady: "Not ready",
  wbPbiStatusCompleted: "Done",
  wbPbiMissing: "PBI not found",
  wbPbiConfidential: "Confidential",
  wbPbiLinked: "Linked to PBI #{n}",
  wbLinkedBoardsTitle: "Linked White Boards",
  wbLinkedBoardsEmpty: "No White Board shape stands for this PBI",
  wbLinkedBoardsOpen: "Open “{sheet}” of {board}",
  wbAiSummarize: "Summarize with AI (local)",
  wbAiGroup: "Group with AI (local)",
  wbAiWorking: "The AI is working…",
  wbAiFailed: "The AI could not be used: {reason}",
  wbAiSummaryTitle: "Summary (AI)",
  wbAiDone: "The AI's result is on the sheet (Ctrl+Z to undo)",
  wbTimerMinutes: "{n} min",
  wbGroupLabel: "Group",
  wbUngroupLabel: "Ungroup",
  wbConnectLabel: "Connect with an arrow",
  wbTimerDoneStatus: "The timer is up",
  wbHistoryViewOf: "View {name}",
  wbHistoryRestoreOf: "Restore {name}",
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
  wbTextEditHint: "Press Esc or Ctrl+Enter to finish editing. Select characters to format just them (size, bold, italic, underline, colour, font; Ctrl+B / Ctrl+I / Ctrl+U)",
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
    "Pilih alat lalu tekan Enter untuk menaruh bentuk di tengah. Tombol panah memindahkan bentuk yang dipilih, Enter mengedit teks, Delete menghapus, dan Ctrl+Z mengurungkan. ] dan [ memilih bentuk satu per satu. Ketik saat bentuk dipilih untuk menulis di dalamnya (F2 juga mengedit). Insert menambah bentuk terhubung di kanan (peta pikiran); Alt+tombol panah mengubah ukuran bentuk yang dipilih. Ctrl+Enter membuka tautan bentuk. Ctrl+G mengelompokkan bentuk yang dipilih, Ctrl+Shift+G memisahkannya.",
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
  wbTemplateMinutes: "Notulen rapat",
  wbTemplateReport: "Laporan satu halaman",
  wbTplKeep: "Keep (pertahankan)",
  wbTplProblem: "Problem (masalah)",
  wbTplTry: "Try (coba berikutnya)",
  wbTplMinutesTitle: "Notulen rapat",
  wbTplMinutesMeta: "Waktu:\nPeserta:\nTujuan:",
  wbTplAgenda: "Agenda",
  wbTplDecisions: "Keputusan",
  wbTplActions: "Tindakan (siapa, kapan)",
  wbTplReportTitle: "Laporan",
  wbTplSummary: "Latar belakang / tujuan",
  wbTplProgress: "Masalah yang dilaporkan",
  wbTplIssues: "Kesimpulan",
  wbTplNext: "Langkah berikutnya",
  wbTemplateZeva: "Empat kotak ZEVA",
  wbTplZevaCurrent: "Saat ini",
  wbTplZevaFuture: "Kondisi yang diinginkan",
  wbTplZevaResult: "Hasil",
  wbTplZevaCause: "Penyebab",
  wbTplZeva1: "① Nilai saat ini",
  wbTplZeva1Hint: "Angka: OEE, CT, jumlah orang, cacat, V.Score, rasio nilai… Tampakkan kerugian terhadap nilai teoretis",
  wbTplZeva2: "② Cara saat ini",
  wbTplZeva2Hint: "Mengapa hasil ①? Kelemahan dan penyebab variasi per 4M (7 faktor)",
  wbTplZeva3: "③ Cara baru",
  wbTplZeva3Hint: "Solusi yang mengatasi ②, berangkat dari nilai teoretis dan dijelaskan dengan ECRS",
  wbTplZeva4: "④ Nilai target",
  wbTplZeva4Hint: "Target logis dari penumpukan kerugian yang dihapus di ③ (mis. −1 orang, −20% CT)",
  wbTplZevaLoop: "Ulangi ② → ③ → ④ → bandingkan dengan ① berkali-kali; pertajam skenario dengan hipotesis dan verifikasi",
  wbUnderline: "Garis bawah",
  wbGroup: "Kelompokkan (Ctrl+G)",
  wbUngroup: "Pisahkan kelompok (Ctrl+Shift+G)",
  wbGrouped: "dikelompokkan",
  wbTableColNarrow: "Kolom lebih sempit",
  wbTableColWiden: "Kolom lebih lebar",
  wbTableRowShorter: "Baris lebih pendek",
  wbTableRowTaller: "Baris lebih tinggi",
  wbTableResizeHint: "Seret garis tabel untuk mengubah lebar kolom atau tinggi baris",
  wbBodyEditLabel: "Edit teks isi",
  wbFullscreen: "Layar penuh",
  wbFullscreenExit: "Keluar dari layar penuh",
  wbFormatTooLarge: "Format terlalu besar untuk disimpan: hanya teksnya yang disimpan (tanpa format)",
  wbTemplateWhy5: "Analisis 5 Mengapa",
  wbTemplateFishbone: "Diagram tulang ikan (7 faktor)",
  wbTemplatePdcas: "PDCA-S",
  wbTemplateEcrs: "Lembar ECRS",
  wbTemplateA3: "Laporan A3",
  wbTplWhy5Problem: "Masalah (apa yang terjadi)",
  wbTplWhy5ProblemHint: "Kapan, di mana, dan apa yang terjadi — dengan fakta dan angka",
  wbTplWhy5Why: "Mengapa {n}",
  wbTplWhy5WhyHint: "Mengapa itu terjadi? Pastikan di lapangan dengan barang nyata, bukan menebak",
  wbTplWhy5Root: "Akar masalah (X)",
  wbTplWhy5RootHint: "Penyebab yang bila diatasi tidak akan berulang. Tulis mekanisme atau kondisi, bukan kesadaran orang",
  wbTplWhy5Action: "Tindakan",
  wbTplWhy5ActionHint: "Tindakan atas akar masalah, dan bagaimana masuk ke standar (4M)",
  wbTplFishEffect: "Karakteristik (hasil Y)",
  wbTplFishEffectHint: "Hasil yang variasinya ingin dikurangi, dalam angka (mis. variasi CT, rasio cacat)",
  wbTplFishMan: "Manusia (Man)",
  wbTplFishMachine: "Mesin (Machine)",
  wbTplFishMaterial: "Material",
  wbTplFishMethod: "Metode (Method)",
  wbTplFishMeasurement: "Pengukuran (Measurement)",
  wbTplFishManagement: "Manajemen (Management)",
  wbTplFishEnvironment: "Lingkungan (Environment)",
  wbTplFishNote: "Untuk tiap faktor variasi (X), tempel penyebab yang terpikir dengan catatan tempel di dekat tulangnya",
  wbTplPdcaP: "P Rencana (Plan)",
  wbTplPdcaPHint: "Tetapkan target dan hipotesis cara mencapainya",
  wbTplPdcaD: "D Lakukan (Do)",
  wbTplPdcaDHint: "Coba sesuai rencana (kecil dan cepat)",
  wbTplPdcaC: "C Periksa (Check)",
  wbTplPdcaCHint: "Bandingkan hasil dengan target dan nilai teoretis, dalam angka",
  wbTplPdcaA: "A Tindak lanjut (Act)",
  wbTplPdcaAHint: "Bila berhasil, tetapkan; bila tidak, tinjau ulang penyebabnya",
  wbTplPdcaS: "S Standarisasi (Standardize)",
  wbTplPdcaSHint: "Masukkan kondisi yang baik ke standar 4M dan instruksi kerja agar siapa pun mendapat hasil yang sama",
  wbTplPdcaNote: "Standarisasi memperbarui fondasi: siklus berikutnya mulai dari tingkat yang lebih tinggi",
  wbTplEcrsTitle: "Lembar ECRS",
  wbTplEcrsWork: "Pekerjaan / proses",
  wbTplEcrsE: "E Hilangkan (bisa ditiadakan?)",
  wbTplEcrsC: "C Gabungkan (bisa disatukan?)",
  wbTplEcrsR: "R Tata ulang (urutan atau tempat lain?)",
  wbTplEcrsS: "S Sederhanakan (bisa lebih mudah?)",
  wbTplEcrsEffect: "Efek (waktu, orang, variasi)",
  wbTplEcrsNote: "Mulai dari E: apakah pekerjaan ini benar-benar perlu?",
  wbTplA3Title: "Tema:",
  wbTplA3Meta: "Departemen, nama, tanggal:",
  wbTplA3Background: "1. Latar belakang dan alasan tema",
  wbTplA3Current: "2. Kondisi saat ini (data, selisih dengan nilai teoretis)",
  wbTplA3Target: "3. Target (apa, berapa, kapan)",
  wbTplA3Cause: "4. Analisis penyebab (akar masalah)",
  wbTplA3Measures: "5. Tindakan",
  wbTplA3Plan: "6. Rencana (siapa, kapan)",
  wbTplA3Result: "7. Hasil",
  wbTplA3Standard: "8. Standarisasi dan perluasan",
  wbShapeLibrary: "Pustaka bentuk",
  wbShapeGroupBasic: "Dasar",
  wbShapeGroupFlow: "Alur dan data",
  wbShapeGroupProcess: "Simbol peta proses",
  wbShapeGroupSite: "Lapangan",
  wbShapeDiamond: "Belah ketupat (keputusan, inspeksi mutu)",
  wbShapeTriangle: "Segitiga",
  wbShapeStorage: "Penyimpanan (▽)",
  wbShapeHexagon: "Segi enam (persiapan)",
  wbShapeParallelogram: "Jajaran genjang (masukan / keluaran)",
  wbShapeChevron: "Chevron (alur proses)",
  wbShapeBlockArrow: "Panah tebal",
  wbShapeCylinder: "Silinder (data)",
  wbShapeDocument: "Dokumen",
  wbShapeDelay: "Tunda (D)",
  wbShapeTransport: "Transportasi",
  wbShapeInspectQty: "Inspeksi jumlah (□)",
  wbShapePerson: "Orang",
  wbShapeFactory: "Pabrik / mesin",
  wbShapeTruck: "Truk / pengiriman",
  wbShapeCloud: "Awan (ide)",
  wbShapeStar: "Bintang",
  wbToolTimer: "Pengatur waktu dan voting",
  wbTimerStart: "Mulai",
  wbTimerPause: "Jeda",
  wbTimerReset: "Atur ulang",
  wbTimerLonger: "1 menit lebih lama",
  wbTimerShorter: "1 menit lebih singkat",
  wbTimerDone: "Waktu habis",
  wbTimerAria: "Pengatur waktu: sisa {time}",
  wbVoteBudget: "Suara per orang: {n}",
  wbVoteBudgetNone: "Tanpa batas suara (satu suara per catatan)",
  wbVoteBudgetMore: "Tambah suara per orang",
  wbVoteBudgetLess: "Kurangi suara per orang",
  wbVotesLeft: "Sisa suara Anda: {n}",
  wbVoteAdd: "Beri satu suara",
  wbVoteRemove: "Tarik satu suara",
  wbSortByVotes: "Urutkan menurut suara (terbanyak dulu)",
  wbConnect: "Hubungkan dengan panah (Alt+L)",
  wbContextMenu: "Menu",
  wbCut: "Potong",
  wbCopy: "Salin",
  wbPaste: "Tempel",
  wbEditText: "Edit teks",
  wbEditTitle: "Edit judul",
  wbSelectAll: "Pilih semua",
  wbAddHere: "Tambah di sini",
  wbOrderLabel: "Urutan tumpukan",
  wbSearch: "Cari (Ctrl+F)",
  wbSearchLabel: "Cari di White Board ini",
  wbSearchPlaceholder: "Cari teks di semua lembar",
  wbSearchNone: "Tidak ditemukan",
  wbSearchCount: "{count} ditemukan",
  wbSearchLoading: "Mencari…",
  wbSearchClose: "Tutup pencarian",
  wbExportMenu: "Simpan dan ekspor",
  wbExportPdfA4: "Simpan sebagai PDF (A4)",
  wbExportPdfA3: "Simpan sebagai PDF (A3)",
  wbHelp: "Panduan (?)",
  wbHelpTitle: "Cara memakai White Board",
  wbHelpClose: "Tutup",
  wbHelp01: "Klik ganda\tEdit teks (pada bingkai: isinya; pada bilah judul: judulnya)",
  wbHelp02: "Klik kanan\tMenu untuk yang diklik (juga Shift+F10 atau tombol menu)",
  wbHelp03: "Seret di ruang kosong\tPilih area. Spasi + seret atau roda menggeser tampilan",
  wbHelp04: "Ctrl + roda\tPerbesar dan perkecil",
  wbHelp05: "Ketik saat bentuk dipilih\tMenulis di dalamnya",
  wbHelp06: "Enter / F2\tEdit teks / edit judul bingkai",
  wbHelp07: "Esc\tSelesai mengedit, hapus pilihan",
  wbHelp08: "Tombol panah (Shift: per 10)\tPindahkan. Alt + tombol panah mengubah ukuran",
  wbHelp09: "Ctrl+C / X / V / D\tSalin, potong, tempel, gandakan",
  wbHelp10: "Ctrl+Z / Ctrl+Y\tUrungkan, ulangi",
  wbHelp11: "Ctrl+G / Ctrl+Shift+G\tKelompokkan, pisahkan kelompok",
  wbHelp12: "Alt+L\tHubungkan dua bentuk yang dipilih dengan panah",
  wbHelp13: "Insert\tTambah anak peta pikiran",
  wbHelp14: "Ctrl+B / I / U\t(Saat mengedit) tebal, miring, garis bawah pada karakter yang dipilih",
  wbHelp15: "] / [\tPilih bentuk satu per satu",
  wbHelp16: "Ctrl+F\tCari teks di semua lembar",
  wbHelp17: "?\tBuka panduan ini",
  wbAlignGuides: "Garis bantu perataan",
  wbPbiLink: "Hubungkan ke PBI…",
  wbPbiCreate: "Buat PBI dari ini",
  wbComment: "Komentar…",
  wbViewersLabel: "Orang di lembar ini",
  wbViewersMoreCount: "{n} lainnya",
  wbViewerSelecting: "Dipilih oleh {name}",
  wbHistory: "Riwayat",
  wbHistoryTitle: "Riwayat lembar ini",
  wbHistoryEmpty: "Belum ada versi (disimpan otomatis tiap 10 menit saat menggambar)",
  wbHistoryAuto: "Otomatis",
  wbHistorySaveNow: "Simpan keadaan saat ini dengan nama",
  wbHistoryLabel: "Nama versi",
  wbHistorySave: "Simpan",
  wbHistoryView: "Lihat",
  wbHistoryRestore: "Pulihkan versi ini",
  wbHistoryRestoreTitle: "Pulihkan versi ini?",
  wbHistoryRestoreMessage: "Lembar kembali ke keadaan pada {time}. Keadaan sekarang juga disimpan sebagai versi, jadi bisa dibatalkan.",
  wbHistoryRestored: "Keadaan {time} telah dipulihkan",
  wbHistorySaved: "Versi disimpan",
  wbHistoryFailed: "Riwayat tidak dapat dibaca",
  wbHistoryElements: "{n} elemen",
  wbHistoryPreview: "Versi {time}",
  wbHistoryClose: "Tutup",
  wbComments: "Komentar",
  wbCommentsCount: "Komentar ({n})",
  wbCommentsEmpty: "Belum ada komentar. Klik kanan bentuk → Komentar untuk menulis",
  wbCommentOn: "Untuk “{target}”",
  wbCommentOnSheet: "Untuk seluruh lembar",
  wbCommentLabel: "Tulis komentar (@ untuk menyebut seseorang)",
  wbCommentSend: "Kirim",
  wbCommentResolve: "Selesaikan",
  wbCommentReopen: "Buka lagi",
  wbCommentDelete: "Hapus",
  wbCommentShowResolved: "Tampilkan yang selesai",
  wbCommentShow: "Tampilkan bentuk",
  wbCommentFailed: "Komentar tidak dapat disimpan",
  wbCommentBadge: "{n} komentar",
  wbCommentSheetName: "Lembar: {name}",
  wbPbiLinkTitle: "Hubungkan ke PBI",
  wbPbiSearch: "Cari dengan nomor (#12) atau kata",
  wbPbiNone: "Tidak ditemukan",
  wbPbiUnlink: "Lepaskan tautan",
  wbPbiOpen: "Buka PBI",
  wbPbiCreated: "PBI #{n} dibuat dan ditautkan",
  wbPbiCreateFailed: "PBI tidak dapat dibuat",
  wbPbiStatusReady: "Siap",
  wbPbiStatusNotReady: "Belum siap",
  wbPbiStatusCompleted: "Selesai",
  wbPbiMissing: "PBI tidak ditemukan",
  wbPbiConfidential: "Rahasia",
  wbPbiLinked: "Ditautkan ke PBI #{n}",
  wbLinkedBoardsTitle: "White Board yang tertaut",
  wbLinkedBoardsEmpty: "Tidak ada bentuk White Board untuk PBI ini",
  wbLinkedBoardsOpen: "Buka “{sheet}” dari {board}",
  wbAiSummarize: "Ringkas dengan AI (lokal)",
  wbAiGroup: "Kelompokkan dengan AI (lokal)",
  wbAiWorking: "AI sedang bekerja…",
  wbAiFailed: "AI tidak dapat digunakan: {reason}",
  wbAiSummaryTitle: "Ringkasan (AI)",
  wbAiDone: "Hasil AI sudah ditaruh (Ctrl+Z untuk membatalkan)",
  wbTimerMinutes: "{n} menit",
  wbGroupLabel: "Kelompokkan",
  wbUngroupLabel: "Pisahkan kelompok",
  wbConnectLabel: "Hubungkan dengan panah",
  wbTimerDoneStatus: "Waktu pengatur waktu habis",
  wbHistoryViewOf: "Lihat {name}",
  wbHistoryRestoreOf: "Pulihkan {name}",
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
  wbTextEditHint: "Tekan Esc atau Ctrl+Enter untuk selesai mengedit. Pilih karakter untuk memformat bagian itu saja (ukuran, tebal, miring, garis bawah, warna, font; Ctrl+B / Ctrl+I / Ctrl+U)",
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
