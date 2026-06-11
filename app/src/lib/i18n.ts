export type Language = "ja" | "en" | "id"

export const languageLabels: Record<Language, string> = {
  ja: "日本語",
  en: "English",
  id: "Bahasa Indonesia",
}

/** Canonical point-unit keys stored in the database. */
export type PointUnitKey = "人日" | "人時" | "ポイント" | "SP"

export const POINT_UNIT_OPTIONS: PointUnitKey[] = ["SP", "ポイント", "人日", "人時"]

/** Default point unit for newly created projects. */
export const DEFAULT_POINT_UNIT: PointUnitKey = "SP"

/**
 * Scale of allowed values for a given point unit. Story-point-like scales
 * use Fibonacci (0, 1, 2, 3, 5, 8, 13, 21); man-days/hours use a regular
 * scale appropriate for time-boxed estimation. Direct free-form input is
 * disallowed — estimators pick from the scale.
 */
export function getPointScale(unit: string | null | undefined): number[] {
  switch (unit) {
    case "SP":
    case "ポイント":
      return [0, 1, 2, 3, 5, 8, 13, 21]
    case "人日":
      return [0, 1, 2, 3, 5, 8, 13]
    case "人時":
      return [0, 1, 2, 4, 8, 16, 24]
    default:
      return [0, 1, 2, 3, 5, 8, 13, 21]
  }
}

/**
 * Translate a stored pointUnit value to the current language.
 * Falls back to the stored string for custom/unknown values.
 */
export function formatPointUnit(
  unit: string | null | undefined,
  t: { pointUnitManDay: string; pointUnitManHour: string; pointUnitPoints: string; pointUnitSP: string }
): string {
  switch (unit) {
    case "人日": return t.pointUnitManDay
    case "人時": return t.pointUnitManHour
    case "ポイント": return t.pointUnitPoints
    case "SP": return t.pointUnitSP
    default: return unit ?? ""
  }
}

interface Translations {
  // Common
  save: string
  saving: string
  saved: string
  cancel: string
  delete: string
  edit: string
  add: string
  create: string
  update: string
  close: string
  confirm: string
  loading: string
  error: string
  success: string
  logout: string
  back: string

  // Navigation
  navDashboard: string
  navIcebox: string
  navBacklog: string
  navSprints: string
  navReleases: string
  navSettings: string

  // Header
  appTitle: string

  // Settings page
  settingsTitle: string
  settingsLanguage: string
  settingsLanguageLabel: string
  settingsSprintWorkload: string
  settingsDefaultCapacity: string
  settingsDefaultCapacityHint: string
  settingsSprintDuration: string
  settingsWeek: string
  settingsWeeks: string
  settingsDays: string
  settingsPointUnit: string
  settingsPointDescription: string
  settingsPointDescriptionPlaceholder: string
  settingsSaveButton: string
  settingsSaved: string
  settingsSprintHistory: string
  settingsSprintHistoryHint: string
  settingsAvgScore: string
  settingsAvgScoreHint: string
  settingsMembers: string
  settingsAddMember: string
  settingsEmail: string
  settingsRole: string
  settingsRemoveMember: string
  settingsRemoveConfirm: string
  settingsAddError: string

  // Point units
  pointUnitManDay: string
  pointUnitManHour: string
  pointUnitPoints: string
  pointUnitSP: string

  // Roles
  rolePO: string
  roleSM: string
  roleDev: string

  // Sprint history table
  colSprint: string
  colCapacity: string
  colActualScore: string
  colAchievementRate: string
  colDiff: string

  // Dashboard
  dashboardTitle: string
  dashboardActiveSprint: string
  dashboardNoActiveSprint: string
  dashboardGoal: string
  dashboardPeriod: string
  dashboardCapacity: string
  dashboardOverview: string
  dashboardProjectInfo: string
  dashboardDescription: string
  dashboardDescriptionPlaceholder: string
  dashboardProductGoals: string
  dashboardAddGoal: string
  dashboardNoGoals: string
  dashboardAttachments: string
  dashboardUploadFile: string
  dashboardDownload: string
  dashboardNoAttachments: string
  dashboardDeleteAttachmentConfirm: string

  // IceBox
  iceboxTitle: string
  iceboxAddRequest: string
  iceboxNewRequest: string
  iceboxRequest: string
  iceboxBackground: string
  bilingualize: string
  bilingualizing: string
  bilingualizeFailed: string
  bilingualizeRevert: string
  iceboxStatusUnreviewed: string
  iceboxStatusReviewed: string
  iceboxStatusCompleted: string
  iceboxStatusFrozen: string
  iceboxMoveToReviewed: string
  iceboxMoveToCompleted: string
  iceboxMoveToFrozen: string
  iceboxMoveToUnreviewed: string
  iceboxEditTitle: string
  iceboxStatus: string
  iceboxPoHearingMemo: string
  iceboxPoReviewMemo: string
  iceboxFreezeReason: string
  iceboxDeleteConfirm: string
  iceboxNoItems: string
  iceboxCount: string

  // Backlog
  backlogTitle: string
  backlogAddItem: string
  backlogWho: string
  backlogWhat: string
  backlogWhy: string
  backlogInitiative: string
  backlogEpic: string
  backlogWorkloadScore: string
  backlogPriority: string
  backlogUserStory: string
  backlogStatusReady: string
  backlogStatusNotReady: string
  backlogStatusCompleted: string
  backlogMoveToCompleted: string
  backlogMoveToReady: string
  backlogReturnToReady: string
  backlogMoveToNotReady: string
  backlogUserStoryPlaceholder: string
  categoryNamePlaceholder: string
  taskNamePlaceholder: string
  taskHoursPlaceholder: string
  eventTitlePlaceholder: string
  eventDescriptionPlaceholder: string
  backlogReadyHint: string
  backlogNotReadyHint: string
  backlogCompletedHint: string
  projectProgress: string
  projectProgressHint: string
  view: string
  projectSortUpdated: string
  projectSortFavorite: string
  projectSortNameAsc: string
  projectSortNameDesc: string
  projectSortProgress: string
  projectDensityComfortable: string
  projectDensityCompact: string
  projectSearchPlaceholder: string
  backlogCompletedDate: string
  backlogShowCompleted: string
  backlogHideCompleted: string

  // Sprint
  sprintTitle: string
  sprintCreate: string
  sprintName: string
  sprintGoal: string
  sprintStartDate: string
  sprintEndDate: string
  sprintCapacity: string
  sprintStatus: string
  sprintStatusPlanning: string
  sprintStatusActive: string
  sprintStatusReview: string
  sprintStatusDone: string
  sprintTasks: string
  sprintAddTask: string
  sprintTaskName: string
  sprintAssignee: string
  sprintEstimatedHours: string
  sprintDeleteConfirm: string

  // Burndown
  burndownTitle: string
  burndownShow: string
  burndownHide: string

  sprintTaskCompleteTitle: string
  sprintTaskCompleteHint: string
  sprintTaskCompleteSkip: string
  sprintTaskCompletionComment: string
  sprintTaskCompletionCommentPlaceholder: string
  completionToIceboxToggle: string
  completionToIceboxPlaceholder: string
  completionToIceboxSent: string
  sprintEditMenu: string
  sprintEditTitle: string
  burndownPlan: string
  burndownIdeal: string
  burndownActual: string
  burndownTotal: string
  burndownRemainingTasks: string
  burndownCompleted: string

  // Release
  releaseTitle: string

  // Task status
  taskTodo: string
  taskInProgress: string
  taskDone: string

  // Sprint extended
  sprintNewSprint: string
  sprintAvgScore: string
  sprintPbImport: string
  sprintSelectedWorkload: string
  sprintNoPbReady: string
  sprintNotEntered: string
  sprintCreateWithCount: string
  sprintWorkload: string
  sprintNoSprints: string
  sprintDeleteFullConfirm: string
  sprintTaskEdit: string
  sprintPbItem: string
  sprintAddPbi: string
  sprintAddPbiTitle: string
  sprintAddPbiSubmit: string
  sprintAddPbiSearchPlaceholder: string
  sprintDailyScrum: string
  sprintDailyScrumAdd: string
  sprintDailyScrumEmpty: string
  sprintDailyScrumDatePlaceholder: string
  sprintDailyScrumContentPlaceholder: string
  sprintDailyScrumDeleteConfirm: string
  sprintDailyScrumArchive: string
  sprintDailyScrumUnarchive: string
  sprintDailyScrumArchived: string
  sprintNoTasksYet: string
  sprintRemovePbi: string
  sprintRemovePbiConfirm: string
  sprintSelect: string
  sprintUnassigned: string
  sprintEstimatedHoursShort: string
  sprintActualHoursShort: string
  sprintNoTaskName: string
  sprintAddTaskShort: string
  sprintNoTasks: string
  sprintStatusClickToggle: string
  sprintDeleteTaskConfirm: string
  sprintUpdateFailed: string
  sprintAddFailed: string
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

  // Report
  reportTitle: string
  reportGeneratedAt: string
  reportPrint: string
  reportProjectOverview: string
  reportMembers: string
  reportSprintResults: string
  reportActiveSprintDetail: string
  reportBacklogStatus: string
  reportIceboxStatus: string
  reportUpcomingEvents: string
  reportTotalWorkload: string
  reportReadyItems: string
  reportNotReadyItems: string
  reportCompletedItems: string
  reportNoEvents: string
  reportItems: string

  // Calendar / Event
  // Gantt chart
  // Guide / Help
  guideTitle: string

  chatTitle: string
  chatPlaceholder: string
  chatSend: string
  chatThinking: string
  chatClear: string
  chatCancel: string
  chatEmpty: string
  chatError: string
  chatContextNote: string

  aiThinking: string
  aiCopy: string
  aiFailed: string
  aiResultDisclaimer: string
  aiInvestReview: string
  aiInvestRunning: string
  aiInvestTitle: string
  aiRetroSynthesis: string
  aiRetroTitle: string
  aiAddToTry: string
  aiAddToTryDone: string
  aiProgressReport: string
  aiProgressReportTitle: string
  aiGeneratePbiDraft: string
  aiPbiDraftTitle: string
  aiUseThisDraft: string
  aiPbiDraftRationale: string

  sectionTitle: string
  sectionAdminTitle: string
  sectionAdd: string
  sectionEdit: string
  sectionDelete: string
  sectionDeleteConfirm: string
  sectionName: string
  sectionDescription: string
  sectionSortOrder: string
  sectionUserCount: string
  sectionProjectCount: string
  sectionCategoryCount: string
  sectionUnassigned: string
  sectionDuplicateName: string
  sectionAssignHint: string
  sectionEmpty: string
  roleSectionManager: string

  ganttTitle: string
  ganttToday: string
  ganttNoData: string

  calendarTitle: string
  calendarShow: string
  calendarHide: string
  calendarWeekdays: string[]
  calendarNoEvents: string
  calendarWeekView: string
  calendarMonthView: string
  calendarTeamView: string
  eventAdd: string
  eventEdit: string
  eventTitle: string
  eventDescription: string
  eventStartDate: string
  eventEndDate: string
  eventColor: string
  eventSprintLink: string
  eventNone: string
  eventDeleteConfirm: string
  eventEvents: string

  // Login
  loginTitle: string
  loginSubtitle: string
  loginEmail: string
  loginPassword: string
  loginPasswordPlaceholder: string
  loginButton: string
  loginProcessing: string
  loginError: string
  loginAccountNote: string

  // User Management
  userManagementTitle: string
  myProfileTitle: string
  myProfileMenu: string
  myProfileSaved: string
  myProfileEmployeeNumber: string
  myProfileDepartment: string
  myProfilePasswordSection: string
  myProfileCurrentPassword: string
  myProfileNewPassword: string
  myProfileNewPasswordConfirm: string
  myProfilePasswordMismatch: string
  myProfilePasswordChanged: string
  myProfilePasswordWrong: string
  userCount: string
  userAdd: string
  userCreateTitle: string
  userName: string
  userNamePlaceholder: string
  userEmail: string
  userInitialPassword: string
  userPasswordMinLength: string
  userRole: string
  userRoleMember: string
  userRoleAdmin: string
  userResetPassword: string
  userResetPasswordFor: string
  userNewPasswordPlaceholder: string
  userReset: string
  userInactive: string
  userProjects: string
  userDeactivate: string
  userActivate: string
  userPasswordMinError: string
  userEmployeeNumber: string
  userEmployeeNumberPlaceholder: string
  userDepartment: string
  userDepartmentPlaceholder: string
  userSearchPlaceholder: string
  userFilterRoleAll: string
  userFilterStatusAll: string
  userFilterActive: string
  userFilterInactive: string
  userNoResults: string
  memberPickerSearchPlaceholder: string
  memberPickerAlreadyAdded: string
  memberPickerSelected: string
  memberPickerAddSelected: string
  memberPickerEmpty: string
  errorCreationFailed: string
  errorUpdateFailed: string
  errorChangeFailed: string
  errorResetPasswordFailed: string

  // Project List
  projectListTitle: string
  projectListCount: string
  projectListEmpty: string
  projectListGetStarted: string
  projectListNoActive: string
  projectCreateTitle: string
  projectCreateButton: string
  projectType: string
  projectName: string
  projectNamePlaceholder: string
  projectDescription: string
  projectDescriptionPlaceholder: string
  projectEditName: string
  projectBackToList: string

  // Category Settings
  categorySettingsTitle: string
  categorySettingsDesc: string
  categoryNew: string
  categoryEmpty: string
  categoryEmptyDesc: string
  categoryDeleteConfirm: string
  categoryProjects: string
  categoryHelpText: string
  categoryFlat: string
  categoryCategory: string
  categoryUncategorized: string

  // Common UI
  items: string
  editorLoading: string
  editorError: string

  // Folder
  folderNew: string
  folderName: string
  folderDelete: string
  folderDeleteConfirm: string
  folderNoFiles: string
  folderMoveTo: string
  folderUnfiled: string
  folderEditName: string
  folderDeleteTitle: string

  // Release extras
  releaseDeleteConfirm: string
  releaseDeleteFailed: string
  releaseBulkConfirm: string
  releaseUpdateFailed: string
  releaseNoItems: string
  releaseNoItemsDesc: string
  releaseNoCompletedItems: string

  // Error page
  errorPageTitle: string
  errorPageMessage: string
  errorRetry: string
  errorGoHome: string
}

const ja: Translations = {
  save: "保存",
  saving: "保存中...",
  saved: "保存しました",
  cancel: "キャンセル",
  delete: "削除",
  edit: "編集",
  add: "追加",
  create: "作成",
  update: "更新",
  close: "閉じる",
  confirm: "確認",
  loading: "読み込み中...",
  error: "エラー",
  success: "成功",
  logout: "ログアウト",
  back: "戻る",

  navDashboard: "ダッシュボード",
  navIcebox: "IceBox",
  navBacklog: "プロダクトバックログ",
  navSprints: "スプリント",
  navReleases: "リリース",
  navSettings: "チーム設定",

  appTitle: "Kanflow",

  settingsTitle: "プロジェクト設定",
  settingsLanguage: "言語設定",
  settingsLanguageLabel: "表示言語",
  settingsSprintWorkload: "スプリント負荷設定",
  settingsDefaultCapacity: "デフォルトキャパシティ（点数上限）",
  settingsDefaultCapacityHint: "新規スプリント作成時の初期値",
  settingsSprintDuration: "スプリント期間",
  settingsWeek: "週間",
  settingsWeeks: "週間",
  settingsDays: "日",
  settingsPointUnit: "1点の単位",
  settingsPointDescription: "1点の重みの説明",
  settingsPointDescriptionPlaceholder: "例: 1点 = 開発者1人の1日分の作業量",
  settingsSaveButton: "設定を保存",
  settingsSaved: "保存しました",
  settingsSprintHistory: "過去のスプリント実績（1点の重み把握の参考）",
  settingsSprintHistoryHint: "この値を参考にデフォルトキャパシティを調整してください",
  settingsAvgScore: "スプリントの平均消化点数",
  settingsAvgScoreHint: "この値を参考にデフォルトキャパシティを調整してください",
  settingsMembers: "メンバー一覧",
  settingsAddMember: "メンバー追加",
  settingsEmail: "メールアドレス",
  settingsRole: "役割",
  settingsRemoveMember: "削除",
  settingsRemoveConfirm: "このメンバーを削除しますか？",
  settingsAddError: "追加に失敗しました",

  pointUnitManDay: "人日",
  pointUnitManHour: "人時",
  pointUnitPoints: "ポイント",
  pointUnitSP: "ストーリーポイント (SP)",

  rolePO: "Product Owner",
  roleSM: "Scrum Master",
  roleDev: "Developer",

  colSprint: "スプリント",
  colCapacity: "キャパシティ",
  colActualScore: "消化点数",
  colAchievementRate: "達成率",
  colDiff: "差分",

  dashboardTitle: "ダッシュボード",
  dashboardActiveSprint: "実行中スプリント",
  dashboardNoActiveSprint: "実行中のスプリントはありません",
  dashboardGoal: "ゴール",
  dashboardPeriod: "期間",
  dashboardCapacity: "キャパシティ",
  dashboardOverview: "プロジェクト概要",
  dashboardProjectInfo: "プロジェクト情報",
  dashboardDescription: "プロジェクトの目的・概要",
  dashboardDescriptionPlaceholder: "このプロジェクトの目的や背景を記入してください",
  dashboardProductGoals: "プロダクトゴール",
  dashboardAddGoal: "ゴール追加",
  dashboardNoGoals: "プロダクトゴールが設定されていません",
  dashboardAttachments: "添付ファイル",
  dashboardUploadFile: "ファイルをアップロード",
  dashboardDownload: "ダウンロード",
  dashboardNoAttachments: "添付ファイルはありません",
  dashboardDeleteAttachmentConfirm: "このファイルを削除しますか？",

  iceboxTitle: "IceBox",
  iceboxAddRequest: "要望を追加",
  iceboxNewRequest: "新規要望",
  iceboxRequest: "要望・要求",
  iceboxBackground: "課題・背景",
  bilingualize: "JA/ID 併記",
  bilingualizing: "翻訳中…",
  bilingualizeFailed: "翻訳に失敗しました",
  bilingualizeRevert: "元に戻す",
  iceboxStatusUnreviewed: "PO未確認",
  iceboxStatusReviewed: "PO確認済み",
  iceboxStatusCompleted: "完了",
  iceboxStatusFrozen: "凍結",
  iceboxMoveToReviewed: "確認済みへ",
  iceboxMoveToCompleted: "完了へ",
  iceboxMoveToFrozen: "凍結へ",
  iceboxMoveToUnreviewed: "未確認へ戻す",
  iceboxEditTitle: "IceBox項目を編集",
  iceboxStatus: "ステータス",
  iceboxPoHearingMemo: "POヒアリングメモ",
  iceboxPoReviewMemo: "POレビューメモ",
  iceboxFreezeReason: "凍結理由",
  iceboxDeleteConfirm: "この項目を削除しますか？",
  iceboxNoItems: "項目はありません",
  iceboxCount: "件",

  backlogTitle: "プロダクトバックログ",
  backlogAddItem: "PBI追加",
  backlogWho: "誰が",
  backlogWhat: "何を",
  backlogWhy: "なぜ",
  backlogInitiative: "イニシアティブ",
  backlogEpic: "エピック",
  backlogWorkloadScore: "工数",
  backlogPriority: "優先度",
  backlogUserStory: "ユーザーストーリー",
  backlogStatusReady: "着手可能",
  backlogStatusNotReady: "未準備",
  backlogStatusCompleted: "完了",
  backlogMoveToCompleted: "完了にする",
  backlogMoveToReady: "着手可能に移動する",
  backlogReturnToReady: "着手可能に戻す",
  backlogMoveToNotReady: "未準備に戻す",
  backlogUserStoryPlaceholder: "プロジェクトマネージャーとして、チームの進捗をリアルタイムで確認したい。それは遅延リスクを早期に発見できるからだ。",
  categoryNamePlaceholder: "例: 開発中、保守、社内",
  taskNamePlaceholder: "例: API実装、画面デザイン",
  taskHoursPlaceholder: "例: 4",
  eventTitlePlaceholder: "例: スプリントレビュー、デモ",
  eventDescriptionPlaceholder: "イベントの詳細を入力（任意）",
  backlogReadyHint: "次スプリントに取り込む候補。ユーザーストーリー・受入条件・工数が揃った PBI が並びます。",
  backlogNotReadyHint: "まだ詳細が固まっていない・見積り前の PBI。精緻化（リファインメント）を経て Ready に移動します。",
  backlogCompletedHint: "スプリントで完了した PBI。履歴として保持し、統計やレポートに使います。",
  projectProgress: "プロジェクト進捗",
  projectProgressHint: "このプロジェクトの全スプリントタスクのうち、完了済みタスクの割合。",
  view: "詳細",
  projectSortUpdated: "更新日順",
  projectSortFavorite: "お気に入り順",
  projectSortNameAsc: "名前昇順 (A→Z)",
  projectSortNameDesc: "名前降順 (Z→A)",
  projectSortProgress: "進捗の高い順",
  projectDensityComfortable: "標準表示",
  projectDensityCompact: "コンパクト",
  projectSearchPlaceholder: "プロジェクト名・説明・メンバー名で検索",
  backlogCompletedDate: "完了日",
  backlogShowCompleted: "完了済みを表示",
  backlogHideCompleted: "完了済みを非表示",

  sprintTitle: "スプリント",
  sprintCreate: "スプリント作成",
  sprintName: "スプリント名",
  sprintGoal: "スプリントゴール",
  sprintStartDate: "開始日",
  sprintEndDate: "終了日",
  sprintCapacity: "キャパシティ",
  sprintStatus: "ステータス",
  sprintStatusPlanning: "計画中",
  sprintStatusActive: "実行中",
  sprintStatusReview: "レビュー",
  sprintStatusDone: "完了",
  sprintTasks: "タスク",
  sprintAddTask: "タスク追加",
  sprintTaskName: "タスク名",
  sprintAssignee: "担当者",
  sprintEstimatedHours: "見積時間",
  sprintDeleteConfirm: "このスプリントを削除しますか？",

  burndownTitle: "バーンダウンチャート",
  burndownShow: "バーンダウン表示",
  burndownHide: "バーンダウン非表示",

  sprintTaskCompleteTitle: "タスク完了",
  sprintTaskCompleteHint: "完了内容や所感を記録（任意）",
  sprintTaskCompleteSkip: "コメント無しで完了",
  sprintTaskCompletionComment: "完了コメント",
  sprintTaskCompletionCommentPlaceholder: "実施内容・気づきなどを記入…",
  completionToIceboxToggle: "Iceboxにも追加(発見した問題・残課題など)",
  completionToIceboxPlaceholder: "Iceboxへ送る内容を入力(空欄なら送信しません)",
  completionToIceboxSent: "Iceboxに追加しました",
  sprintEditMenu: "スプリント編集",
  sprintEditTitle: "スプリント編集",
  burndownPlan: "計画（稼働日）",
  burndownIdeal: "理想（全日）",
  burndownActual: "実績",
  burndownTotal: "全{count}件",
  burndownRemainingTasks: "残タスク数 (件)",
  burndownCompleted: "件完了",

  releaseTitle: "リリース",

  taskTodo: "未着手",
  taskInProgress: "進行中",
  taskDone: "完了",

  sprintNewSprint: "新規スプリント",
  sprintAvgScore: "過去{count}スプリントの平均消化点数",
  sprintPbImport: "PBから取り込み（Ready項目）",
  sprintSelectedWorkload: "選択負荷",
  sprintNoPbReady: "Ready状態のPBアイテムがありません",
  sprintNotEntered: "(未入力)",
  sprintCreateWithCount: "作成（{count}件取り込み）",
  sprintWorkload: "業務負荷",
  sprintNoSprints: "スプリントがありません",
  sprintDeleteFullConfirm: "このスプリントを削除しますか？関連するタスクも全て削除されます。",
  sprintTaskEdit: "タスク編集",
  sprintPbItem: "PBアイテム",
  sprintAddPbi: "PBアイテムを追加",
  sprintAddPbiTitle: "このスプリントに PBアイテムを追加",
  sprintAddPbiSubmit: "選択したPBを追加",
  sprintAddPbiSearchPlaceholder: "PB番号・Initiative・Epic・ユーザーストーリーで検索",
  sprintDailyScrum: "デイリースクラム",
  sprintDailyScrumAdd: "デイリースクラムを追加",
  sprintDailyScrumEmpty: "まだ記録がありません。毎日の進捗・困りごと・次の24時間のプランを記入してください。",
  sprintDailyScrumDatePlaceholder: "実施日",
  sprintDailyScrumContentPlaceholder: "今日やったこと / 明日やること / 困っていること …",
  sprintDailyScrumDeleteConfirm: "このデイリースクラム記録を削除しますか？",
  sprintDailyScrumArchive: "アーカイブ",
  sprintDailyScrumUnarchive: "復元",
  sprintDailyScrumArchived: "アーカイブ済み",
  sprintNoTasksYet: "タスクがまだありません",
  sprintRemovePbi: "このPBをスプリントから外す",
  sprintRemovePbiConfirm: "このPBと紐づく全タスクをスプリントから削除します。続行しますか？",
  sprintSelect: "選択",
  sprintUnassigned: "未割当",
  sprintEstimatedHoursShort: "見積工数",
  sprintActualHoursShort: "実績工数",
  sprintNoTaskName: "(タスク名なし)",
  sprintAddTaskShort: "+ タスク",
  sprintNoTasks: "タスクがありません",
  sprintStatusClickToggle: "現在: {status} (クリックで切替)",
  sprintDeleteTaskConfirm: "このタスクを削除しますか？",
  sprintUpdateFailed: "更新失敗",
  sprintAddFailed: "追加失敗",
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
  sprintActualScore: "消化点数",

  reportTitle: "プロジェクトレポート",
  reportGeneratedAt: "出力日",
  reportPrint: "印刷 / PDF保存",
  reportProjectOverview: "プロジェクト概要",
  reportMembers: "メンバー",
  reportSprintResults: "スプリント実績",
  reportActiveSprintDetail: "実行中スプリント詳細",
  reportBacklogStatus: "プロダクトバックログ状況",
  reportIceboxStatus: "IceBox状況",
  reportUpcomingEvents: "直近のイベント",
  reportTotalWorkload: "合計工数",
  reportReadyItems: "着手可能",
  reportNotReadyItems: "未準備",
  reportCompletedItems: "完了",
  reportNoEvents: "直近のイベントはありません",
  reportItems: "件",

  guideTitle: "ガイド & ヘルプ",
  chatTitle: "AI チャット",
  chatPlaceholder: "プロジェクトについて質問してください…",
  chatSend: "送信",
  chatThinking: "考え中…",
  chatClear: "履歴をクリア",
  chatCancel: "停止",
  chatEmpty: "プロジェクトの進捗・進め方・添付ファイルについて自由に質問できます。",
  chatError: "応答の取得に失敗しました",
  chatContextNote: "ローカル LLM で動作。会話履歴はこのページを離れるとリセットされます。",

  aiThinking: "AI が分析中…",
  aiCopy: "コピー",
  aiFailed: "AI の応答取得に失敗しました",
  aiResultDisclaimer: "AI の提案です。最終判断は人間が行ってください。",
  aiInvestReview: "INVEST 評価",
  aiInvestRunning: "評価中…",
  aiInvestTitle: "INVEST 原則による PBI 評価",
  aiRetroSynthesis: "振り返りサマリ生成",
  aiRetroTitle: "スプリント振り返りサマリ",
  aiAddToTry: "Try 欄に追記",
  aiAddToTryDone: "追記しました",
  aiProgressReport: "進捗レポート生成",
  aiProgressReportTitle: "ステークホルダー向け進捗レポート",
  aiGeneratePbiDraft: "PBI 草案生成",
  aiPbiDraftTitle: "PBI 草案候補",
  aiUseThisDraft: "この案で作成",
  aiPbiDraftRationale: "この案のポイント",

  sectionTitle: "セクション",
  sectionAdminTitle: "セクション管理",
  sectionAdd: "セクション追加",
  sectionEdit: "セクション編集",
  sectionDelete: "削除",
  sectionDeleteConfirm: "このセクションを削除しますか？配下のユーザー・プロジェクトは未分類になります。",
  sectionName: "セクション名",
  sectionDescription: "説明",
  sectionSortOrder: "並び順",
  sectionUserCount: "所属ユーザー",
  sectionProjectCount: "プロジェクト",
  sectionCategoryCount: "カテゴリ",
  sectionUnassigned: "未分類",
  sectionDuplicateName: "同名のセクションが既に存在します",
  sectionAssignHint: "プロジェクトが属するセクションを選択してください（複数可）。セクション管理者は所属セクションのプロジェクトすべてを閲覧できます。",
  sectionEmpty: "セクションがまだ登録されていません。",
  roleSectionManager: "セクション管理者",

  ganttTitle: "ガントチャート",
  ganttToday: "今日",
  ganttNoData: "表示するスプリント・タスクがありません",

  calendarTitle: "カレンダー",
  calendarShow: "カレンダーを表示",
  calendarHide: "カレンダーを隠す",
  calendarWeekdays: ["日", "月", "火", "水", "木", "金", "土"],
  calendarNoEvents: "イベントはありません",
  calendarWeekView: "週表示",
  calendarMonthView: "月表示",
  calendarTeamView: "チーム",
  eventAdd: "イベント追加",
  eventEdit: "イベント編集",
  eventTitle: "タイトル",
  eventDescription: "説明（任意）",
  eventStartDate: "開始日",
  eventEndDate: "終了日（任意）",
  eventColor: "色",
  eventSprintLink: "スプリント紐付（任意）",
  eventNone: "なし",
  eventDeleteConfirm: "このイベントを削除しますか？",
  eventEvents: "イベント",

  loginTitle: "ログイン",
  loginSubtitle: "チームのプロジェクト管理",
  loginEmail: "メールアドレス",
  loginPassword: "パスワード",
  loginPasswordPlaceholder: "6文字以上",
  loginButton: "ログイン",
  loginProcessing: "処理中...",
  loginError: "メールアドレスまたはパスワードが正しくありません",
  loginAccountNote: "アカウントは管理者が作成します",

  userManagementTitle: "ユーザー管理",
  myProfileTitle: "個人設定",
  myProfileMenu: "個人設定",
  myProfileSaved: "保存しました",
  myProfileEmployeeNumber: "従業員番号",
  myProfileDepartment: "所属",
  myProfilePasswordSection: "パスワード変更",
  myProfileCurrentPassword: "現在のパスワード",
  myProfileNewPassword: "新しいパスワード",
  myProfileNewPasswordConfirm: "新しいパスワード（確認）",
  myProfilePasswordMismatch: "新しいパスワードが一致しません",
  myProfilePasswordChanged: "パスワードを変更しました",
  myProfilePasswordWrong: "現在のパスワードが間違っています",
  userCount: "名のユーザー",
  userAdd: "ユーザー追加",
  userCreateTitle: "新規ユーザー作成",
  userName: "名前",
  userNamePlaceholder: "山田 太郎",
  userEmail: "メールアドレス",
  userInitialPassword: "初期パスワード",
  userPasswordMinLength: "6文字以上",
  userRole: "権限",
  userRoleMember: "メンバー",
  userRoleAdmin: "管理者",
  userResetPassword: "パスワードリセット",
  userResetPasswordFor: "のパスワードをリセット",
  userNewPasswordPlaceholder: "新しいパスワード（6文字以上）",
  userReset: "リセット",
  userInactive: "無効",
  userProjects: "プロジェクト",
  userDeactivate: "無効化",
  userActivate: "有効化",
  userPasswordMinError: "パスワードは6文字以上で入力してください",
  userEmployeeNumber: "従業員番号",
  userEmployeeNumberPlaceholder: "EMP0001",
  userDepartment: "所属",
  userDepartmentPlaceholder: "例：戦略企画部",
  userSearchPlaceholder: "名前・メール・従業員番号・所属で検索",
  userFilterRoleAll: "すべての権限",
  userFilterStatusAll: "すべての状態",
  userFilterActive: "有効のみ",
  userFilterInactive: "無効のみ",
  userNoResults: "該当するユーザーがいません",
  memberPickerSearchPlaceholder: "名前・メール・従業員番号・所属で検索",
  memberPickerAlreadyAdded: "追加済み",
  memberPickerSelected: "人を選択中",
  memberPickerAddSelected: "選択したメンバーを追加",
  memberPickerEmpty: "2文字以上入力して検索",
  errorCreationFailed: "作成に失敗しました",
  errorUpdateFailed: "更新に失敗しました",
  errorChangeFailed: "変更に失敗しました",
  errorResetPasswordFailed: "パスワードリセットに失敗しました",

  projectListTitle: "プロジェクト一覧",
  projectListCount: "件のアクティブなプロジェクト",
  projectListEmpty: "プロジェクトがありません",
  projectListGetStarted: "プロジェクトを作成して始めましょう",
  projectListNoActive: "アクティブなプロジェクトがありません",
  projectCreateTitle: "プロジェクト作成",
  projectCreateButton: "新規プロジェクト",
  projectType: "プロジェクトタイプ",
  projectName: "プロジェクト名",
  projectNamePlaceholder: "プロジェクト名を入力",
  projectDescription: "説明",
  projectDescriptionPlaceholder: "プロジェクトの概要を入力（任意）",
  projectEditName: "プロジェクト名を編集",
  projectBackToList: "← プロジェクト一覧",

  categorySettingsTitle: "カテゴリ設定",
  categorySettingsDesc: "プロジェクトをカテゴリで分類できます",
  categoryNew: "新規カテゴリ",
  categoryEmpty: "カテゴリがありません",
  categoryEmptyDesc: "カテゴリを作成してプロジェクトを整理しましょう",
  categoryDeleteConfirm: "このカテゴリを削除しますか？プロジェクトへの割り当ても解除されます。",
  categoryProjects: "プロジェクト",
  categoryHelpText: "プロジェクトへのカテゴリ割り当ては、プロジェクト一覧画面のプロジェクトカード右クリックメニューから行えます。",
  categoryFlat: "フラット",
  categoryCategory: "カテゴリ",
  categoryUncategorized: "未分類",

  items: "件",
  editorLoading: "エディタを読み込み中...",
  editorError: "エディタエラー",

  folderNew: "+ フォルダ",
  folderName: "フォルダ名",
  folderDelete: "フォルダを削除",
  folderDeleteConfirm: "このフォルダを削除しますか？（ファイルは未分類に移動されます）",
  folderNoFiles: "ファイルなし",
  folderMoveTo: "移動...",
  folderUnfiled: "未分類",
  folderEditName: "フォルダ名を編集",
  folderDeleteTitle: "フォルダを削除",

  releaseDeleteConfirm: "この項目を削除しますか？",
  releaseDeleteFailed: "削除に失敗しました",
  releaseBulkConfirm: "件を一括でリリース済みにしますか？",
  releaseUpdateFailed: "件の更新に失敗しました",
  releaseNoItems: "項目がありません",
  releaseNoItemsDesc: "上のボタンからバックログの完了項目を取り込んでください",
  releaseNoCompletedItems: "取り込み可能な完了済み項目がありません",

  errorPageTitle: "エラーが発生しました",
  errorPageMessage: "このページの読み込み中にエラーが発生しました。",
  errorRetry: "再試行",
  errorGoHome: "ホームに戻る",
}

const en: Translations = {
  save: "Save",
  saving: "Saving...",
  saved: "Saved",
  cancel: "Cancel",
  delete: "Delete",
  edit: "Edit",
  add: "Add",
  create: "Create",
  update: "Update",
  close: "Close",
  confirm: "Confirm",
  loading: "Loading...",
  error: "Error",
  success: "Success",
  logout: "Logout",
  back: "Back",

  navDashboard: "Dashboard",
  navIcebox: "IceBox",
  navBacklog: "Product Backlog",
  navSprints: "Sprints",
  navReleases: "Releases",
  navSettings: "Settings",

  appTitle: "Kanflow",

  settingsTitle: "Project Settings",
  settingsLanguage: "Language Settings",
  settingsLanguageLabel: "Display Language",
  settingsSprintWorkload: "Sprint Workload Settings",
  settingsDefaultCapacity: "Default Capacity (Point Limit)",
  settingsDefaultCapacityHint: "Initial value when creating new sprints",
  settingsSprintDuration: "Sprint Duration",
  settingsWeek: "week",
  settingsWeeks: " weeks",
  settingsDays: " days",
  settingsPointUnit: "Point Unit",
  settingsPointDescription: "Point Weight Description",
  settingsPointDescriptionPlaceholder: "e.g., 1 point = 1 developer-day of work",
  settingsSaveButton: "Save Settings",
  settingsSaved: "Saved",
  settingsSprintHistory: "Past Sprint Results (Reference for Point Weight)",
  settingsSprintHistoryHint: "Use this value to adjust the default capacity",
  settingsAvgScore: "Average Sprint Score",
  settingsAvgScoreHint: "Use this value to adjust the default capacity",
  settingsMembers: "Members",
  settingsAddMember: "Add Member",
  settingsEmail: "Email Address",
  settingsRole: "Role",
  settingsRemoveMember: "Remove",
  settingsRemoveConfirm: "Remove this member?",
  settingsAddError: "Failed to add member",

  pointUnitManDay: "Man-days",
  pointUnitManHour: "Man-hours",
  pointUnitPoints: "Points",
  pointUnitSP: "Story Points (SP)",

  rolePO: "Product Owner",
  roleSM: "Scrum Master",
  roleDev: "Developer",

  colSprint: "Sprint",
  colCapacity: "Capacity",
  colActualScore: "Actual Score",
  colAchievementRate: "Achievement Rate",
  colDiff: "Diff",

  dashboardTitle: "Dashboard",
  dashboardActiveSprint: "Active Sprint",
  dashboardNoActiveSprint: "No active sprint",
  dashboardGoal: "Goal",
  dashboardPeriod: "Period",
  dashboardCapacity: "Capacity",
  dashboardOverview: "Project Overview",
  dashboardProjectInfo: "Project Information",
  dashboardDescription: "Project Purpose & Overview",
  dashboardDescriptionPlaceholder: "Describe the purpose and background of this project",
  dashboardProductGoals: "Product Goals",
  dashboardAddGoal: "Add Goal",
  dashboardNoGoals: "No product goals set",
  dashboardAttachments: "Attachments",
  dashboardUploadFile: "Upload File",
  dashboardDownload: "Download",
  dashboardNoAttachments: "No attachments",
  dashboardDeleteAttachmentConfirm: "Delete this file?",

  iceboxTitle: "IceBox",
  iceboxAddRequest: "Add Request",
  iceboxNewRequest: "New Request",
  iceboxRequest: "Request",
  iceboxBackground: "Background / Context",
  bilingualize: "JA/ID Bilingual",
  bilingualizing: "Translating…",
  bilingualizeFailed: "Translation failed",
  bilingualizeRevert: "Revert",
  iceboxStatusUnreviewed: "PO Unreviewed",
  iceboxStatusReviewed: "PO Reviewed",
  iceboxStatusCompleted: "Completed",
  iceboxStatusFrozen: "Frozen",
  iceboxMoveToReviewed: "Mark Reviewed",
  iceboxMoveToCompleted: "Mark Completed",
  iceboxMoveToFrozen: "Freeze",
  iceboxMoveToUnreviewed: "Back to Unreviewed",
  iceboxEditTitle: "Edit IceBox Item",
  iceboxStatus: "Status",
  iceboxPoHearingMemo: "PO Hearing Memo",
  iceboxPoReviewMemo: "PO Review Memo",
  iceboxFreezeReason: "Freeze Reason",
  iceboxDeleteConfirm: "Delete this item?",
  iceboxNoItems: "No items",
  iceboxCount: "items",

  backlogTitle: "Product Backlog",
  backlogAddItem: "Add PBI",
  backlogWho: "Who",
  backlogWhat: "What",
  backlogWhy: "Why",
  backlogInitiative: "Initiative",
  backlogEpic: "Epic",
  backlogWorkloadScore: "Workload",
  backlogPriority: "Priority",
  backlogUserStory: "User Story",
  backlogStatusReady: "Ready",
  backlogStatusNotReady: "Not Ready",
  backlogStatusCompleted: "Completed",
  backlogMoveToCompleted: "Mark Completed",
  backlogMoveToReady: "Move to Ready",
  backlogReturnToReady: "Move back to Ready",
  backlogMoveToNotReady: "Move to Not Ready",
  backlogUserStoryPlaceholder: "As a project manager, I want to track team progress in real time, so that I can detect delay risks early.",
  categoryNamePlaceholder: "e.g., In Development, Maintenance, Internal",
  taskNamePlaceholder: "e.g., API implementation, UI design",
  taskHoursPlaceholder: "e.g., 4",
  eventTitlePlaceholder: "e.g., Sprint Review, Demo",
  eventDescriptionPlaceholder: "Optional event details",
  backlogReadyHint: "Candidates to pull into the next sprint. These PBIs have user story, acceptance criteria, and effort estimates.",
  backlogNotReadyHint: "PBIs still being refined or not yet estimated. They move to Ready after refinement.",
  backlogCompletedHint: "PBIs completed in past sprints. Kept for history, metrics, and reports.",
  projectProgress: "Project progress",
  projectProgressHint: "Percentage of completed tasks across all sprints in this project.",
  view: "View",
  projectSortUpdated: "Updated (newest)",
  projectSortFavorite: "Favorites first",
  projectSortNameAsc: "Name A→Z",
  projectSortNameDesc: "Name Z→A",
  projectSortProgress: "Progress (high → low)",
  projectDensityComfortable: "Comfortable",
  projectDensityCompact: "Compact",
  projectSearchPlaceholder: "Search project name, description, or member",
  backlogCompletedDate: "Completed",
  backlogShowCompleted: "Show Completed",
  backlogHideCompleted: "Hide Completed",

  sprintTitle: "Sprints",
  sprintCreate: "Create Sprint",
  sprintName: "Sprint Name",
  sprintGoal: "Sprint Goal",
  sprintStartDate: "Start Date",
  sprintEndDate: "End Date",
  sprintCapacity: "Capacity",
  sprintStatus: "Status",
  sprintStatusPlanning: "Planning",
  sprintStatusActive: "Active",
  sprintStatusReview: "Review",
  sprintStatusDone: "Done",
  sprintTasks: "Tasks",
  sprintAddTask: "Add Task",
  sprintTaskName: "Task Name",
  sprintAssignee: "Assignee",
  sprintEstimatedHours: "Estimated Hours",
  sprintDeleteConfirm: "Delete this sprint?",

  burndownTitle: "Burndown Chart",
  burndownShow: "Show Burndown",
  burndownHide: "Hide Burndown",

  sprintTaskCompleteTitle: "Task Completed",
  sprintTaskCompleteHint: "Optionally note what was done",
  sprintTaskCompleteSkip: "Done without comment",
  sprintTaskCompletionComment: "Completion comment",
  sprintTaskCompletionCommentPlaceholder: "What was done, observations, etc.…",
  completionToIceboxToggle: "Also add to Icebox (issues found, remaining work, etc.)",
  completionToIceboxPlaceholder: "Type the item to send to Icebox (leave blank to skip)",
  completionToIceboxSent: "Added to Icebox",
  sprintEditMenu: "Edit Sprint",
  sprintEditTitle: "Edit Sprint",
  burndownPlan: "Plan (Working Days)",
  burndownIdeal: "Ideal (All Days)",
  burndownActual: "Actual",
  burndownTotal: "Total {count}",
  burndownRemainingTasks: "Remaining Tasks",
  burndownCompleted: " completed",

  releaseTitle: "Releases",

  taskTodo: "To Do",
  taskInProgress: "In Progress",
  taskDone: "Done",

  sprintNewSprint: "New Sprint",
  sprintAvgScore: "Average score from past {count} sprints",
  sprintPbImport: "Import from PB (Ready items)",
  sprintSelectedWorkload: "Selected workload",
  sprintNoPbReady: "No ready PB items available",
  sprintNotEntered: "(Not entered)",
  sprintCreateWithCount: "Create ({count} items)",
  sprintWorkload: "Workload",
  sprintNoSprints: "No sprints",
  sprintDeleteFullConfirm: "Delete this sprint? All related tasks will also be deleted.",
  sprintTaskEdit: "Edit Task",
  sprintPbItem: "PB Item",
  sprintAddPbi: "Add PB item",
  sprintAddPbiTitle: "Add PB items to this sprint",
  sprintAddPbiSubmit: "Add selected PBs",
  sprintAddPbiSearchPlaceholder: "Search by PB number, initiative, epic, user story",
  sprintDailyScrum: "Daily Scrum",
  sprintDailyScrumAdd: "Add Daily Scrum note",
  sprintDailyScrumEmpty: "No notes yet. Record daily progress, blockers, and the plan for the next 24 hours.",
  sprintDailyScrumDatePlaceholder: "Date",
  sprintDailyScrumContentPlaceholder: "What was done / What is next / Impediments …",
  sprintDailyScrumDeleteConfirm: "Delete this Daily Scrum note?",
  sprintDailyScrumArchive: "Archive",
  sprintDailyScrumUnarchive: "Restore",
  sprintDailyScrumArchived: "Archived",
  sprintNoTasksYet: "No tasks yet",
  sprintRemovePbi: "Remove PB from sprint",
  sprintRemovePbiConfirm: "This removes the PB and all its tasks from the sprint. Continue?",
  sprintSelect: "Select",
  sprintUnassigned: "Unassigned",
  sprintEstimatedHoursShort: "Estimated",
  sprintActualHoursShort: "Actual",
  sprintNoTaskName: "(No task name)",
  sprintAddTaskShort: "+ Task",
  sprintNoTasks: "No tasks",
  sprintStatusClickToggle: "Current: {status} (Click to toggle)",
  sprintDeleteTaskConfirm: "Delete this task?",
  sprintUpdateFailed: "Update failed",
  sprintAddFailed: "Add failed",
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
  sprintActualScore: "Actual Score",

  reportTitle: "Project Report",
  reportGeneratedAt: "Generated",
  reportPrint: "Print / Save PDF",
  reportProjectOverview: "Project Overview",
  reportMembers: "Members",
  reportSprintResults: "Sprint Results",
  reportActiveSprintDetail: "Active Sprint Detail",
  reportBacklogStatus: "Product Backlog Status",
  reportIceboxStatus: "IceBox Status",
  reportUpcomingEvents: "Upcoming Events",
  reportTotalWorkload: "Total Workload",
  reportReadyItems: "Ready",
  reportNotReadyItems: "Not Ready",
  reportCompletedItems: "Completed",
  reportNoEvents: "No upcoming events",
  reportItems: "items",

  ganttTitle: "Gantt Chart",
  guideTitle: "Guide & Help",
  chatTitle: "AI Chat",
  chatPlaceholder: "Ask anything about this project…",
  chatSend: "Send",
  chatThinking: "Thinking…",
  chatClear: "Clear history",
  chatCancel: "Stop",
  chatEmpty: "Ask about progress, planning, or attached files for this project.",
  chatError: "Failed to get a response",
  chatContextNote: "Powered by local LLM. Conversation resets when you leave this page.",

  aiThinking: "AI is analyzing…",
  aiCopy: "Copy",
  aiFailed: "Failed to get AI response",
  aiResultDisclaimer: "AI-generated suggestion. Human review recommended.",
  aiInvestReview: "INVEST Review",
  aiInvestRunning: "Reviewing…",
  aiInvestTitle: "PBI INVEST Review",
  aiRetroSynthesis: "Retrospective Summary",
  aiRetroTitle: "Sprint Retrospective Summary",
  aiAddToTry: "Add to Try",
  aiAddToTryDone: "Added",
  aiProgressReport: "Progress Report",
  aiProgressReportTitle: "Stakeholder Progress Report",
  aiGeneratePbiDraft: "Generate PBI Draft",
  aiPbiDraftTitle: "PBI Draft Candidates",
  aiUseThisDraft: "Use this draft",
  aiPbiDraftRationale: "Why this draft",

  sectionTitle: "Section",
  sectionAdminTitle: "Section Management",
  sectionAdd: "Add Section",
  sectionEdit: "Edit Section",
  sectionDelete: "Delete",
  sectionDeleteConfirm: "Delete this section? Its users and projects will be unassigned.",
  sectionName: "Section Name",
  sectionDescription: "Description",
  sectionSortOrder: "Sort Order",
  sectionUserCount: "Users",
  sectionProjectCount: "Projects",
  sectionCategoryCount: "Categories",
  sectionUnassigned: "Unassigned",
  sectionDuplicateName: "A section with this name already exists",
  sectionAssignHint: "Select the sections this project belongs to (multiple allowed). Section managers can view all projects in their sections.",
  sectionEmpty: "No sections have been registered yet.",
  roleSectionManager: "Section Manager",

  ganttToday: "Today",
  ganttNoData: "No sprints or tasks to display",

  calendarTitle: "Calendar",
  calendarShow: "Show Calendar",
  calendarHide: "Hide Calendar",
  calendarWeekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  calendarNoEvents: "No events",
  calendarWeekView: "Week",
  calendarMonthView: "Month",
  calendarTeamView: "Team",
  eventAdd: "Add Event",
  eventEdit: "Edit Event",
  eventTitle: "Title",
  eventDescription: "Description (optional)",
  eventStartDate: "Start Date",
  eventEndDate: "End Date (optional)",
  eventColor: "Color",
  eventSprintLink: "Link to Sprint (optional)",
  eventNone: "None",
  eventDeleteConfirm: "Delete this event?",
  eventEvents: "Events",

  loginTitle: "Login",
  loginSubtitle: "Team Project Management",
  loginEmail: "Email Address",
  loginPassword: "Password",
  loginPasswordPlaceholder: "6 characters or more",
  loginButton: "Login",
  loginProcessing: "Processing...",
  loginError: "Invalid email or password",
  loginAccountNote: "Accounts are created by administrators",

  userManagementTitle: "User Management",
  myProfileTitle: "My Profile",
  myProfileMenu: "My Profile",
  myProfileSaved: "Saved",
  myProfileEmployeeNumber: "Employee Number",
  myProfileDepartment: "Department",
  myProfilePasswordSection: "Change Password",
  myProfileCurrentPassword: "Current Password",
  myProfileNewPassword: "New Password",
  myProfileNewPasswordConfirm: "New Password (confirm)",
  myProfilePasswordMismatch: "New passwords do not match",
  myProfilePasswordChanged: "Password changed",
  myProfilePasswordWrong: "Current password is incorrect",
  userCount: "users",
  userAdd: "Add User",
  userCreateTitle: "Create New User",
  userName: "Name",
  userNamePlaceholder: "John Doe",
  userEmail: "Email Address",
  userInitialPassword: "Initial Password",
  userPasswordMinLength: "6+ characters",
  userRole: "Role",
  userRoleMember: "Member",
  userRoleAdmin: "Admin",
  userResetPassword: "Reset Password",
  userResetPasswordFor: "'s password reset",
  userNewPasswordPlaceholder: "New password (6+ characters)",
  userReset: "Reset",
  userInactive: "Inactive",
  userProjects: "projects",
  userDeactivate: "Deactivate",
  userActivate: "Activate",
  userPasswordMinError: "Password must be at least 6 characters",
  userEmployeeNumber: "Employee ID",
  userEmployeeNumberPlaceholder: "EMP0001",
  userDepartment: "Department",
  userDepartmentPlaceholder: "e.g. Strategic Planning",
  userSearchPlaceholder: "Search by name, email, employee ID, or department",
  userFilterRoleAll: "All roles",
  userFilterStatusAll: "All statuses",
  userFilterActive: "Active only",
  userFilterInactive: "Inactive only",
  userNoResults: "No users match your search",
  memberPickerSearchPlaceholder: "Search by name, email, employee ID, or department",
  memberPickerAlreadyAdded: "Already added",
  memberPickerSelected: "selected",
  memberPickerAddSelected: "Add selected members",
  memberPickerEmpty: "Type at least 2 characters to search",
  errorCreationFailed: "Creation failed",
  errorUpdateFailed: "Update failed",
  errorChangeFailed: "Change failed",
  errorResetPasswordFailed: "Password reset failed",

  projectListTitle: "Projects",
  projectListCount: "active projects",
  projectListEmpty: "No projects",
  projectListGetStarted: "Create a project to get started",
  projectListNoActive: "No active projects",
  projectCreateTitle: "Create Project",
  projectCreateButton: "New Project",
  projectType: "Project Type",
  projectName: "Project Name",
  projectNamePlaceholder: "Enter project name",
  projectDescription: "Description",
  projectDescriptionPlaceholder: "Enter project overview (optional)",
  projectEditName: "Edit project name",
  projectBackToList: "← Projects",

  categorySettingsTitle: "Category Settings",
  categorySettingsDesc: "Organize projects by category",
  categoryNew: "New Category",
  categoryEmpty: "No categories",
  categoryEmptyDesc: "Create categories to organize your projects",
  categoryDeleteConfirm: "Delete this category? Project assignments will also be removed.",
  categoryProjects: "projects",
  categoryHelpText: "To assign categories to projects, right-click a project card on the project list page.",
  categoryFlat: "Flat",
  categoryCategory: "Category",
  categoryUncategorized: "Uncategorized",

  items: "items",
  editorLoading: "Loading editor...",
  editorError: "Editor error",

  folderNew: "+ Folder",
  folderName: "Folder name",
  folderDelete: "Delete folder",
  folderDeleteConfirm: "Delete this folder? Files will be moved to unfiled.",
  folderNoFiles: "No files",
  folderMoveTo: "Move...",
  folderUnfiled: "Unfiled",
  folderEditName: "Edit folder name",
  folderDeleteTitle: "Delete folder",

  releaseDeleteConfirm: "Delete this item?",
  releaseDeleteFailed: "Delete failed",
  releaseBulkConfirm: "items to Released?",
  releaseUpdateFailed: "updates failed",
  releaseNoItems: "No items",
  releaseNoItemsDesc: "Import completed backlog items using the button above",
  releaseNoCompletedItems: "No completed items available for import",

  errorPageTitle: "An error occurred",
  errorPageMessage: "An error occurred while loading this page.",
  errorRetry: "Retry",
  errorGoHome: "Go Home",
}

const id: Translations = {
  save: "Simpan",
  saving: "Menyimpan...",
  saved: "Tersimpan",
  cancel: "Batal",
  delete: "Hapus",
  edit: "Edit",
  add: "Tambah",
  create: "Buat",
  update: "Perbarui",
  close: "Tutup",
  confirm: "Konfirmasi",
  loading: "Memuat...",
  error: "Error",
  success: "Berhasil",
  logout: "Keluar",
  back: "Kembali",

  navDashboard: "Dasbor",
  navIcebox: "IceBox",
  navBacklog: "Product Backlog",
  navSprints: "Sprint",
  navReleases: "Rilis",
  navSettings: "Pengaturan",

  appTitle: "Kanflow",

  settingsTitle: "Pengaturan Proyek",
  settingsLanguage: "Pengaturan Bahasa",
  settingsLanguageLabel: "Bahasa Tampilan",
  settingsSprintWorkload: "Pengaturan Beban Sprint",
  settingsDefaultCapacity: "Kapasitas Default (Batas Poin)",
  settingsDefaultCapacityHint: "Nilai awal saat membuat sprint baru",
  settingsSprintDuration: "Durasi Sprint",
  settingsWeek: "minggu",
  settingsWeeks: " minggu",
  settingsDays: " hari",
  settingsPointUnit: "Satuan Poin",
  settingsPointDescription: "Deskripsi Bobot Poin",
  settingsPointDescriptionPlaceholder: "contoh: 1 poin = 1 hari kerja developer",
  settingsSaveButton: "Simpan Pengaturan",
  settingsSaved: "Tersimpan",
  settingsSprintHistory: "Riwayat Sprint (Referensi Bobot Poin)",
  settingsSprintHistoryHint: "Gunakan nilai ini untuk menyesuaikan kapasitas default",
  settingsAvgScore: "Rata-rata Skor Sprint",
  settingsAvgScoreHint: "Gunakan nilai ini untuk menyesuaikan kapasitas default",
  settingsMembers: "Anggota",
  settingsAddMember: "Tambah Anggota",
  settingsEmail: "Alamat Email",
  settingsRole: "Peran",
  settingsRemoveMember: "Hapus",
  settingsRemoveConfirm: "Hapus anggota ini?",
  settingsAddError: "Gagal menambahkan anggota",

  pointUnitManDay: "Hari-orang",
  pointUnitManHour: "Jam-orang",
  pointUnitPoints: "Poin",
  pointUnitSP: "Story Points (SP)",

  rolePO: "Product Owner",
  roleSM: "Scrum Master",
  roleDev: "Developer",

  colSprint: "Sprint",
  colCapacity: "Kapasitas",
  colActualScore: "Skor Aktual",
  colAchievementRate: "Tingkat Pencapaian",
  colDiff: "Selisih",

  dashboardTitle: "Dasbor",
  dashboardActiveSprint: "Sprint Aktif",
  dashboardNoActiveSprint: "Tidak ada sprint aktif",
  dashboardGoal: "Tujuan",
  dashboardPeriod: "Periode",
  dashboardCapacity: "Kapasitas",
  dashboardOverview: "Ringkasan Proyek",
  dashboardProjectInfo: "Informasi Proyek",
  dashboardDescription: "Tujuan & Ringkasan Proyek",
  dashboardDescriptionPlaceholder: "Jelaskan tujuan dan latar belakang proyek ini",
  dashboardProductGoals: "Tujuan Produk",
  dashboardAddGoal: "Tambah Tujuan",
  dashboardNoGoals: "Belum ada tujuan produk",
  dashboardAttachments: "Lampiran",
  dashboardUploadFile: "Unggah File",
  dashboardDownload: "Unduh",
  dashboardNoAttachments: "Tidak ada lampiran",
  dashboardDeleteAttachmentConfirm: "Hapus file ini?",

  iceboxTitle: "IceBox",
  iceboxAddRequest: "Tambah Permintaan",
  iceboxNewRequest: "Permintaan Baru",
  iceboxRequest: "Permintaan",
  iceboxBackground: "Latar Belakang",
  bilingualize: "Dwibahasa JA/ID",
  bilingualizing: "Menerjemahkan…",
  bilingualizeFailed: "Terjemahan gagal",
  bilingualizeRevert: "Kembalikan",
  iceboxStatusUnreviewed: "Belum Ditinjau PO",
  iceboxStatusReviewed: "Ditinjau PO",
  iceboxStatusCompleted: "Selesai",
  iceboxStatusFrozen: "Dibekukan",
  iceboxMoveToReviewed: "Tandai Ditinjau",
  iceboxMoveToCompleted: "Tandai Selesai",
  iceboxMoveToFrozen: "Bekukan",
  iceboxMoveToUnreviewed: "Kembali Belum Ditinjau",
  iceboxEditTitle: "Edit Item IceBox",
  iceboxStatus: "Status",
  iceboxPoHearingMemo: "Memo Hearing PO",
  iceboxPoReviewMemo: "Memo Review PO",
  iceboxFreezeReason: "Alasan Pembekuan",
  iceboxDeleteConfirm: "Hapus item ini?",
  iceboxNoItems: "Tidak ada item",
  iceboxCount: "item",

  backlogTitle: "Product Backlog",
  backlogAddItem: "Tambah PBI",
  backlogWho: "Siapa",
  backlogWhat: "Apa",
  backlogWhy: "Mengapa",
  backlogInitiative: "Inisiatif",
  backlogEpic: "Epik",
  backlogWorkloadScore: "Beban Kerja",
  backlogPriority: "Prioritas",
  backlogUserStory: "User Story",
  backlogStatusReady: "Siap",
  backlogStatusNotReady: "Belum Siap",
  backlogStatusCompleted: "Selesai",
  backlogMoveToCompleted: "Tandai Selesai",
  backlogMoveToReady: "Pindahkan ke Siap",
  backlogReturnToReady: "Kembali ke Siap",
  backlogMoveToNotReady: "Kembali ke Belum Siap",
  backlogUserStoryPlaceholder: "Sebagai manajer proyek, saya ingin memantau progres tim secara real-time, agar dapat mendeteksi risiko keterlambatan lebih awal.",
  categoryNamePlaceholder: "misalnya: Dalam Pengembangan, Pemeliharaan, Internal",
  taskNamePlaceholder: "misalnya: Implementasi API, Desain UI",
  taskHoursPlaceholder: "misalnya: 4",
  eventTitlePlaceholder: "misalnya: Sprint Review, Demo",
  eventDescriptionPlaceholder: "Detail acara (opsional)",
  backlogReadyHint: "Kandidat untuk ditarik ke sprint berikutnya. PBI yang sudah memiliki user story, kriteria penerimaan, dan estimasi upaya.",
  backlogNotReadyHint: "PBI yang masih diperjelas atau belum diestimasi. Akan pindah ke Siap setelah refinement.",
  backlogCompletedHint: "PBI yang diselesaikan di sprint sebelumnya. Disimpan untuk riwayat, metrik, dan laporan.",
  projectProgress: "Progres proyek",
  projectProgressHint: "Persentase tugas yang selesai di seluruh sprint dalam proyek ini.",
  view: "Lihat",
  projectSortUpdated: "Terbaru diperbarui",
  projectSortFavorite: "Favorit di atas",
  projectSortNameAsc: "Nama A→Z",
  projectSortNameDesc: "Nama Z→A",
  projectSortProgress: "Progres (tinggi → rendah)",
  projectDensityComfortable: "Nyaman",
  projectDensityCompact: "Kompak",
  projectSearchPlaceholder: "Cari nama proyek, deskripsi, atau anggota",
  backlogCompletedDate: "Tanggal Selesai",
  backlogShowCompleted: "Tampilkan Selesai",
  backlogHideCompleted: "Sembunyikan Selesai",

  sprintTitle: "Sprint",
  sprintCreate: "Buat Sprint",
  sprintName: "Nama Sprint",
  sprintGoal: "Tujuan Sprint",
  sprintStartDate: "Tanggal Mulai",
  sprintEndDate: "Tanggal Selesai",
  sprintCapacity: "Kapasitas",
  sprintStatus: "Status",
  sprintStatusPlanning: "Perencanaan",
  sprintStatusActive: "Aktif",
  sprintStatusReview: "Review",
  sprintStatusDone: "Selesai",
  sprintTasks: "Tugas",
  sprintAddTask: "Tambah Tugas",
  sprintTaskName: "Nama Tugas",
  sprintAssignee: "Penanggung Jawab",
  sprintEstimatedHours: "Estimasi Jam",
  sprintDeleteConfirm: "Hapus sprint ini?",

  burndownTitle: "Burndown Chart",
  burndownShow: "Tampilkan Burndown",
  burndownHide: "Sembunyikan Burndown",

  sprintTaskCompleteTitle: "Tugas Selesai",
  sprintTaskCompleteHint: "Catat apa yang telah dikerjakan (opsional)",
  sprintTaskCompleteSkip: "Selesai tanpa komentar",
  sprintTaskCompletionComment: "Komentar penyelesaian",
  sprintTaskCompletionCommentPlaceholder: "Apa yang dilakukan, catatan, dsb…",
  completionToIceboxToggle: "Tambahkan ke Icebox juga (masalah ditemukan, sisa pekerjaan, dll.)",
  completionToIceboxPlaceholder: "Isi item yang akan dikirim ke Icebox (kosong untuk lewati)",
  completionToIceboxSent: "Ditambahkan ke Icebox",
  sprintEditMenu: "Sunting Sprint",
  sprintEditTitle: "Sunting Sprint",
  burndownPlan: "Rencana (Hari Kerja)",
  burndownIdeal: "Ideal (Semua Hari)",
  burndownActual: "Aktual",
  burndownTotal: "Total {count}",
  burndownRemainingTasks: "Sisa Tugas",
  burndownCompleted: " selesai",

  releaseTitle: "Rilis",

  taskTodo: "Belum Mulai",
  taskInProgress: "Sedang Berjalan",
  taskDone: "Selesai",

  sprintNewSprint: "Sprint Baru",
  sprintAvgScore: "Rata-rata skor dari {count} sprint sebelumnya",
  sprintPbImport: "Impor dari PB (Item Siap)",
  sprintSelectedWorkload: "Beban terpilih",
  sprintNoPbReady: "Tidak ada item PB yang siap",
  sprintNotEntered: "(Belum diisi)",
  sprintCreateWithCount: "Buat ({count} item)",
  sprintWorkload: "Beban Kerja",
  sprintNoSprints: "Tidak ada sprint",
  sprintDeleteFullConfirm: "Hapus sprint ini? Semua tugas terkait juga akan dihapus.",
  sprintTaskEdit: "Edit Tugas",
  sprintPbItem: "Item PB",
  sprintAddPbi: "Tambah item PB",
  sprintAddPbiTitle: "Tambahkan item PB ke sprint ini",
  sprintAddPbiSubmit: "Tambahkan PB terpilih",
  sprintAddPbiSearchPlaceholder: "Cari berdasarkan nomor PB, initiative, epic, user story",
  sprintDailyScrum: "Daily Scrum",
  sprintDailyScrumAdd: "Tambah catatan Daily Scrum",
  sprintDailyScrumEmpty: "Belum ada catatan. Catat kemajuan harian, hambatan, dan rencana 24 jam berikutnya.",
  sprintDailyScrumDatePlaceholder: "Tanggal",
  sprintDailyScrumContentPlaceholder: "Apa yang sudah dikerjakan / Rencana berikutnya / Hambatan …",
  sprintDailyScrumDeleteConfirm: "Hapus catatan Daily Scrum ini?",
  sprintDailyScrumArchive: "Arsipkan",
  sprintDailyScrumUnarchive: "Pulihkan",
  sprintDailyScrumArchived: "Diarsipkan",
  sprintNoTasksYet: "Belum ada tugas",
  sprintRemovePbi: "Hapus PB dari sprint",
  sprintRemovePbiConfirm: "Ini akan menghapus PB beserta semua tugasnya dari sprint. Lanjutkan?",
  sprintSelect: "Pilih",
  sprintUnassigned: "Belum ditugaskan",
  sprintEstimatedHoursShort: "Estimasi",
  sprintActualHoursShort: "Aktual",
  sprintNoTaskName: "(Tanpa nama tugas)",
  sprintAddTaskShort: "+ Tugas",
  sprintNoTasks: "Tidak ada tugas",
  sprintStatusClickToggle: "Saat ini: {status} (Klik untuk mengganti)",
  sprintDeleteTaskConfirm: "Hapus tugas ini?",
  sprintUpdateFailed: "Gagal memperbarui",
  sprintAddFailed: "Gagal menambahkan",
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
  sprintActualScore: "Skor Aktual",

  reportTitle: "Laporan Proyek",
  reportGeneratedAt: "Dibuat",
  reportPrint: "Cetak / Simpan PDF",
  reportProjectOverview: "Ringkasan Proyek",
  reportMembers: "Anggota",
  reportSprintResults: "Hasil Sprint",
  reportActiveSprintDetail: "Detail Sprint Aktif",
  reportBacklogStatus: "Status Product Backlog",
  reportIceboxStatus: "Status IceBox",
  reportUpcomingEvents: "Acara Mendatang",
  reportTotalWorkload: "Total Beban Kerja",
  reportReadyItems: "Siap",
  reportNotReadyItems: "Belum Siap",
  reportCompletedItems: "Selesai",
  reportNoEvents: "Tidak ada acara mendatang",
  reportItems: "item",

  ganttTitle: "Gantt Chart",
  ganttToday: "Hari Ini",
  guideTitle: "Panduan & Bantuan",
  chatTitle: "Chat AI",
  chatPlaceholder: "Tanyakan apa saja tentang proyek ini…",
  chatSend: "Kirim",
  chatThinking: "Berpikir…",
  chatClear: "Hapus riwayat",
  chatCancel: "Hentikan",
  chatEmpty: "Tanyakan tentang progres, perencanaan, atau lampiran proyek ini.",
  chatError: "Gagal mendapatkan respons",
  chatContextNote: "Didukung oleh LLM lokal. Percakapan akan terhapus saat meninggalkan halaman.",

  aiThinking: "AI sedang menganalisis…",
  aiCopy: "Salin",
  aiFailed: "Gagal mendapatkan respons AI",
  aiResultDisclaimer: "Saran AI. Tinjauan manual disarankan.",
  aiInvestReview: "Tinjauan INVEST",
  aiInvestRunning: "Meninjau…",
  aiInvestTitle: "Tinjauan PBI dengan Prinsip INVEST",
  aiRetroSynthesis: "Ringkasan Retrospektif",
  aiRetroTitle: "Ringkasan Retrospektif Sprint",
  aiAddToTry: "Tambahkan ke Try",
  aiAddToTryDone: "Ditambahkan",
  aiProgressReport: "Laporan Progres",
  aiProgressReportTitle: "Laporan Progres untuk Stakeholder",
  aiGeneratePbiDraft: "Buat Draf PBI",
  aiPbiDraftTitle: "Kandidat Draf PBI",
  aiUseThisDraft: "Gunakan draf ini",
  aiPbiDraftRationale: "Alasan draf ini",

  sectionTitle: "Seksi",
  sectionAdminTitle: "Manajemen Seksi",
  sectionAdd: "Tambah Seksi",
  sectionEdit: "Sunting Seksi",
  sectionDelete: "Hapus",
  sectionDeleteConfirm: "Hapus seksi ini? Pengguna dan proyek di dalamnya akan tidak terkelompokkan.",
  sectionName: "Nama Seksi",
  sectionDescription: "Deskripsi",
  sectionSortOrder: "Urutan",
  sectionUserCount: "Pengguna",
  sectionProjectCount: "Proyek",
  sectionCategoryCount: "Kategori",
  sectionUnassigned: "Belum Terkelompok",
  sectionDuplicateName: "Seksi dengan nama ini sudah ada",
  sectionAssignHint: "Pilih seksi tempat proyek ini berada (bisa lebih dari satu). Manajer seksi dapat melihat semua proyek di seksi mereka.",
  sectionEmpty: "Belum ada seksi yang terdaftar.",
  roleSectionManager: "Manajer Seksi",

  ganttNoData: "Tidak ada sprint atau tugas untuk ditampilkan",

  calendarTitle: "Kalender",
  calendarShow: "Tampilkan Kalender",
  calendarHide: "Sembunyikan Kalender",
  calendarWeekdays: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
  calendarNoEvents: "Tidak ada acara",
  calendarWeekView: "Minggu",
  calendarMonthView: "Bulan",
  calendarTeamView: "Tim",
  eventAdd: "Tambah Acara",
  eventEdit: "Edit Acara",
  eventTitle: "Judul",
  eventDescription: "Deskripsi (opsional)",
  eventStartDate: "Tanggal Mulai",
  eventEndDate: "Tanggal Selesai (opsional)",
  eventColor: "Warna",
  eventSprintLink: "Hubungkan ke Sprint (opsional)",
  eventNone: "Tidak ada",
  eventDeleteConfirm: "Hapus acara ini?",
  eventEvents: "Acara",

  loginTitle: "Masuk",
  loginSubtitle: "Manajemen Proyek Tim",
  loginEmail: "Alamat Email",
  loginPassword: "Kata Sandi",
  loginPasswordPlaceholder: "6 karakter atau lebih",
  loginButton: "Masuk",
  loginProcessing: "Memproses...",
  loginError: "Email atau kata sandi salah",
  loginAccountNote: "Akun dibuat oleh administrator",

  userManagementTitle: "Manajemen Pengguna",
  myProfileTitle: "Profil Saya",
  myProfileMenu: "Profil Saya",
  myProfileSaved: "Tersimpan",
  myProfileEmployeeNumber: "Nomor Karyawan",
  myProfileDepartment: "Departemen",
  myProfilePasswordSection: "Ubah Kata Sandi",
  myProfileCurrentPassword: "Kata Sandi Saat Ini",
  myProfileNewPassword: "Kata Sandi Baru",
  myProfileNewPasswordConfirm: "Kata Sandi Baru (konfirmasi)",
  myProfilePasswordMismatch: "Kata sandi baru tidak cocok",
  myProfilePasswordChanged: "Kata sandi berhasil diubah",
  myProfilePasswordWrong: "Kata sandi saat ini salah",
  userCount: "pengguna",
  userAdd: "Tambah Pengguna",
  userCreateTitle: "Buat Pengguna Baru",
  userName: "Nama",
  userNamePlaceholder: "Budi Santoso",
  userEmail: "Alamat Email",
  userInitialPassword: "Kata Sandi Awal",
  userPasswordMinLength: "6+ karakter",
  userRole: "Peran",
  userRoleMember: "Anggota",
  userRoleAdmin: "Admin",
  userResetPassword: "Reset Kata Sandi",
  userResetPasswordFor: " reset kata sandi",
  userNewPasswordPlaceholder: "Kata sandi baru (6+ karakter)",
  userReset: "Reset",
  userInactive: "Nonaktif",
  userProjects: "proyek",
  userDeactivate: "Nonaktifkan",
  userActivate: "Aktifkan",
  userPasswordMinError: "Kata sandi minimal 6 karakter",
  userEmployeeNumber: "Nomor Karyawan",
  userEmployeeNumberPlaceholder: "EMP0001",
  userDepartment: "Departemen",
  userDepartmentPlaceholder: "mis. Perencanaan Strategis",
  userSearchPlaceholder: "Cari berdasarkan nama, email, nomor karyawan, atau departemen",
  userFilterRoleAll: "Semua peran",
  userFilterStatusAll: "Semua status",
  userFilterActive: "Aktif saja",
  userFilterInactive: "Nonaktif saja",
  userNoResults: "Tidak ada pengguna yang cocok",
  memberPickerSearchPlaceholder: "Cari berdasarkan nama, email, nomor karyawan, atau departemen",
  memberPickerAlreadyAdded: "Sudah ditambahkan",
  memberPickerSelected: "dipilih",
  memberPickerAddSelected: "Tambahkan anggota terpilih",
  memberPickerEmpty: "Ketik minimal 2 karakter untuk mencari",
  errorCreationFailed: "Gagal membuat",
  errorUpdateFailed: "Gagal memperbarui",
  errorChangeFailed: "Gagal mengubah",
  errorResetPasswordFailed: "Gagal mereset kata sandi",

  projectListTitle: "Daftar Proyek",
  projectListCount: "proyek aktif",
  projectListEmpty: "Tidak ada proyek",
  projectListGetStarted: "Buat proyek untuk memulai",
  projectListNoActive: "Tidak ada proyek aktif",
  projectCreateTitle: "Buat Proyek",
  projectCreateButton: "Proyek Baru",
  projectType: "Tipe Proyek",
  projectName: "Nama Proyek",
  projectNamePlaceholder: "Masukkan nama proyek",
  projectDescription: "Deskripsi",
  projectDescriptionPlaceholder: "Masukkan ringkasan proyek (opsional)",
  projectEditName: "Edit nama proyek",
  projectBackToList: "← Daftar Proyek",

  categorySettingsTitle: "Pengaturan Kategori",
  categorySettingsDesc: "Atur proyek berdasarkan kategori",
  categoryNew: "Kategori Baru",
  categoryEmpty: "Tidak ada kategori",
  categoryEmptyDesc: "Buat kategori untuk mengatur proyek Anda",
  categoryDeleteConfirm: "Hapus kategori ini? Penetapan proyek juga akan dihapus.",
  categoryProjects: "proyek",
  categoryHelpText: "Untuk menetapkan kategori ke proyek, klik kanan kartu proyek di halaman daftar proyek.",
  categoryFlat: "Datar",
  categoryCategory: "Kategori",
  categoryUncategorized: "Tidak Berkategori",

  items: "item",
  editorLoading: "Memuat editor...",
  editorError: "Error editor",

  folderNew: "+ Folder",
  folderName: "Nama folder",
  folderDelete: "Hapus folder",
  folderDeleteConfirm: "Hapus folder ini? File akan dipindahkan ke tidak berkategori.",
  folderNoFiles: "Tidak ada file",
  folderMoveTo: "Pindah...",
  folderUnfiled: "Tidak Berkategori",
  folderEditName: "Edit nama folder",
  folderDeleteTitle: "Hapus folder",

  releaseDeleteConfirm: "Hapus item ini?",
  releaseDeleteFailed: "Gagal menghapus",
  releaseBulkConfirm: "item ke Dirilis?",
  releaseUpdateFailed: "pembaruan gagal",
  releaseNoItems: "Tidak ada item",
  releaseNoItemsDesc: "Impor item backlog yang selesai menggunakan tombol di atas",
  releaseNoCompletedItems: "Tidak ada item selesai yang tersedia untuk diimpor",

  errorPageTitle: "Terjadi kesalahan",
  errorPageMessage: "Terjadi kesalahan saat memuat halaman ini.",
  errorRetry: "Coba Lagi",
  errorGoHome: "Ke Beranda",
}

const translations: Record<Language, Translations> = { ja, en, id }

export function getTranslations(lang: Language): Translations {
  return translations[lang] ?? translations.ja
}

export type { Translations }
