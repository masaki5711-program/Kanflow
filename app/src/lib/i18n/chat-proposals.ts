/**
 * i18n domain: approval cards of AI chat write proposals (P3) —
 * chat/proposal-card.tsx and chat/proposal-actions.ts.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ChatProposalsTranslations {
  chatProposalGroupLabel: string
  chatProposalNotice: string
  chatProposalCreatePbiTitle: string
  chatProposalTaskSplitTitle: string
  chatProposalStatusChangeTitle: string
  chatProposalApproveCreate: string
  chatProposalApproveApply: string
  chatProposalReject: string
  chatProposalApplying: string
  chatProposalApplied: string
  chatProposalRejected: string
  chatProposalNoPermission: string
  chatProposalCheckingPermission: string
  chatProposalOpen: string
  chatProposalPbiCreated: string
  chatProposalTasksCreated: string
  chatProposalTasksPartial: string
  chatProposalStatusChanged: string
  chatProposalFailed: string
  chatProposalAlreadyHandled: string
  chatProposalStoryPoints: string
  chatProposalEpic: string
  chatProposalUserStory: string
  chatProposalAcceptance: string
  chatProposalDuplicates: string
  chatProposalSprint: string
  chatProposalEstimate: string
  chatProposalSkipped: string
  chatProposalReason: string
  chatProposalTargetPbi: string
  chatProposalTargetTask: string
  chatProposalCreateIceboxTitle: string
  chatProposalSprintPbiTitle: string
  chatProposalPlanEditTitle: string
  chatProposalSprintScheduleTitle: string
  chatProposalCreateTemplateTitle: string
  chatProposalIceboxCreated: string
  chatProposalSprintPbiAdded: string
  chatProposalSprintPbiRemoved: string
  chatProposalPlanEdited: string
  chatProposalSprintScheduled: string
  chatProposalTemplateCreated: string
  chatProposalPlanLoadTitle: string
  chatProposalPlanLoaded: string
  chatProposalPlanLoadSummary: string
  chatProposalPartial: string
  chatProposalRequest: string
  chatProposalBackground: string
  chatProposalActionAdd: string
  chatProposalActionRemove: string
  chatProposalRemoveWarning: string
  chatProposalOpCreate: string
  chatProposalOpUpdate: string
  chatProposalOpShiftLater: string
  chatProposalOpShiftEarlier: string
  chatProposalDurationDays: string
  chatProposalFollowersNone: string
  chatProposalFollowersDependents: string
  chatProposalFollowersLater: string
  chatProposalUndated: string
  chatProposalParent: string
  chatProposalMilestone: string
  chatProposalPeriod: string
  chatProposalStages: string
  chatProposalVisibilityPrivate: string
  chatProposalVisibilityPublic: string
  chatProposalTemplateStatus: string
  chatProposalRenameTo: string
}

export const ja: ChatProposalsTranslations = {
  chatProposalGroupLabel: "AI の提案",
  chatProposalNotice: "AI の提案です。承認するまで何も変更されません。",
  chatProposalCreatePbiTitle: "PBI 作成の提案",
  chatProposalTaskSplitTitle: "タスク分割の提案",
  chatProposalStatusChangeTitle: "ステータス変更の提案",
  chatProposalApproveCreate: "承認して作成",
  chatProposalApproveApply: "承認して適用",
  chatProposalReject: "却下",
  chatProposalApplying: "反映中…",
  chatProposalApplied: "反映済み",
  chatProposalRejected: "却下しました",
  chatProposalNoPermission: "この操作の権限がありません",
  chatProposalCheckingPermission: "権限を確認中…",
  chatProposalOpen: "開く",
  chatProposalPbiCreated: "PBI を作成しました",
  chatProposalTasksCreated: "タスクを {count} 件作成しました",
  chatProposalTasksPartial: "タスクを {done} / {total} 件作成したところで失敗しました",
  chatProposalStatusChanged: "ステータスを変更しました",
  chatProposalFailed: "提案の反映に失敗しました",
  chatProposalAlreadyHandled: "この提案は既に反映済みか、別の画面で処理中です",
  chatProposalStoryPoints: "見積",
  chatProposalEpic: "エピック",
  chatProposalUserStory: "ユーザーストーリー",
  chatProposalAcceptance: "受け入れ基準",
  chatProposalDuplicates: "似た PBI があります",
  chatProposalSprint: "スプリント",
  chatProposalEstimate: "見積",
  chatProposalSkipped: "既存のため除外",
  chatProposalReason: "理由",
  chatProposalTargetPbi: "PBI",
  chatProposalTargetTask: "タスク",
  chatProposalCreateIceboxTitle: "Icebox 追加の提案",
  chatProposalSprintPbiTitle: "スプリント構成変更の提案",
  chatProposalPlanEditTitle: "全体計画の変更提案",
  chatProposalSprintScheduleTitle: "スプリント期間の変更提案",
  chatProposalCreateTemplateTitle: "計画テンプレート作成の提案",
  chatProposalIceboxCreated: "Icebox に追加しました",
  chatProposalSprintPbiAdded: "PBI をスプリントに入れました",
  chatProposalSprintPbiRemoved: "PBI をスプリントから外しました",
  chatProposalPlanEdited: "全体計画を {count} 件変更しました",
  chatProposalSprintScheduled: "スプリント期間を変更しました",
  chatProposalTemplateCreated: "テンプレートを作成しました",
  chatProposalPlanLoadTitle: "全体計画の読み込み提案（ベースのスケジュール）",
  chatProposalPlanLoaded: "全体計画を {count} 件読み込みました",
  chatProposalPlanLoadSummary: "{count} 件 · 依存 {deps} 件 · {start} 〜 {end}",
  chatProposalPartial: "{done} / {total} 件を反映したところで失敗しました。続きは画面から確認してください",
  chatProposalRequest: "要望",
  chatProposalBackground: "背景",
  chatProposalActionAdd: "スプリントに入れる",
  chatProposalActionRemove: "スプリントから外す",
  chatProposalRemoveWarning: "タスク {count} 件も一緒に削除されます",
  chatProposalOpCreate: "追加",
  chatProposalOpUpdate: "変更",
  chatProposalOpShiftLater: "{days} 日後ろへずらす",
  chatProposalOpShiftEarlier: "{days} 日前へずらす",
  chatProposalDurationDays: "{days} 日",
  chatProposalFollowersNone: "後続は動かさない",
  chatProposalFollowersDependents: "依存する後続も動かす",
  chatProposalFollowersLater: "これより後の項目も動かす",
  chatProposalUndated: "日程未定",
  chatProposalParent: "親",
  chatProposalMilestone: "マイルストーン",
  chatProposalPeriod: "期間",
  chatProposalStages: "段階 {count} 件",
  chatProposalVisibilityPrivate: "自分だけ",
  chatProposalVisibilityPublic: "全員に公開",
  chatProposalTemplateStatus: "状態",
  chatProposalRenameTo: "名称変更",
}

export const en: ChatProposalsTranslations = {
  chatProposalGroupLabel: "AI proposal",
  chatProposalNotice: "Suggested by AI. Nothing changes until you approve.",
  chatProposalCreatePbiTitle: "Proposal: create a PBI",
  chatProposalTaskSplitTitle: "Proposal: split into tasks",
  chatProposalStatusChangeTitle: "Proposal: change status",
  chatProposalApproveCreate: "Approve and create",
  chatProposalApproveApply: "Approve and apply",
  chatProposalReject: "Reject",
  chatProposalApplying: "Applying…",
  chatProposalApplied: "Applied",
  chatProposalRejected: "Rejected",
  chatProposalNoPermission: "You do not have permission for this action",
  chatProposalCheckingPermission: "Checking permission…",
  chatProposalOpen: "Open",
  chatProposalPbiCreated: "PBI created",
  chatProposalTasksCreated: "{count} task(s) created",
  chatProposalTasksPartial: "Stopped after creating {done} of {total} tasks",
  chatProposalStatusChanged: "Status changed",
  chatProposalFailed: "Could not apply the proposal",
  chatProposalAlreadyHandled: "This proposal has already been applied or is being applied elsewhere",
  chatProposalStoryPoints: "Estimate",
  chatProposalEpic: "Epic",
  chatProposalUserStory: "User story",
  chatProposalAcceptance: "Acceptance criteria",
  chatProposalDuplicates: "Similar PBIs exist",
  chatProposalSprint: "Sprint",
  chatProposalEstimate: "Estimate",
  chatProposalSkipped: "Skipped (already exist)",
  chatProposalReason: "Reason",
  chatProposalTargetPbi: "PBI",
  chatProposalTargetTask: "Task",
  chatProposalCreateIceboxTitle: "Proposal: add to Icebox",
  chatProposalSprintPbiTitle: "Proposal: change sprint contents",
  chatProposalPlanEditTitle: "Proposal: change the master plan",
  chatProposalSprintScheduleTitle: "Proposal: change the sprint period",
  chatProposalCreateTemplateTitle: "Proposal: create a plan template",
  chatProposalIceboxCreated: "Added to the Icebox",
  chatProposalSprintPbiAdded: "PBI put into the sprint",
  chatProposalSprintPbiRemoved: "PBI taken out of the sprint",
  chatProposalPlanEdited: "Changed {count} plan item(s)",
  chatProposalSprintScheduled: "Sprint period changed",
  chatProposalTemplateCreated: "Template created",
  chatProposalPlanLoadTitle: "Proposal: load a base schedule into the master plan",
  chatProposalPlanLoaded: "Loaded {count} plan items",
  chatProposalPlanLoadSummary: "{count} items · {deps} dependencies · {start} – {end}",
  chatProposalPartial: "Failed after {done} of {total} changes were applied. Check the rest on screen",
  chatProposalRequest: "Request",
  chatProposalBackground: "Background",
  chatProposalActionAdd: "Put into the sprint",
  chatProposalActionRemove: "Take out of the sprint",
  chatProposalRemoveWarning: "{count} task(s) will be deleted with it",
  chatProposalOpCreate: "Add",
  chatProposalOpUpdate: "Change",
  chatProposalOpShiftLater: "Move {days} day(s) later",
  chatProposalOpShiftEarlier: "Move {days} day(s) earlier",
  chatProposalDurationDays: "{days} d",
  chatProposalFollowersNone: "Leave later items",
  chatProposalFollowersDependents: "Also move dependent items",
  chatProposalFollowersLater: "Also move everything after it",
  chatProposalUndated: "Undated",
  chatProposalParent: "Parent",
  chatProposalMilestone: "Milestone",
  chatProposalPeriod: "Period",
  chatProposalStages: "{count} stage(s)",
  chatProposalVisibilityPrivate: "Only me",
  chatProposalVisibilityPublic: "Everyone",
  chatProposalTemplateStatus: "Status",
  chatProposalRenameTo: "Rename to",
}

export const id: ChatProposalsTranslations = {
  chatProposalGroupLabel: "Usulan AI",
  chatProposalNotice: "Usulan dari AI. Tidak ada yang berubah sebelum Anda menyetujuinya.",
  chatProposalCreatePbiTitle: "Usulan: buat PBI",
  chatProposalTaskSplitTitle: "Usulan: pecah menjadi tugas",
  chatProposalStatusChangeTitle: "Usulan: ubah status",
  chatProposalApproveCreate: "Setujui dan buat",
  chatProposalApproveApply: "Setujui dan terapkan",
  chatProposalReject: "Tolak",
  chatProposalApplying: "Menerapkan…",
  chatProposalApplied: "Sudah diterapkan",
  chatProposalRejected: "Ditolak",
  chatProposalNoPermission: "Anda tidak memiliki izin untuk tindakan ini",
  chatProposalCheckingPermission: "Memeriksa izin…",
  chatProposalOpen: "Buka",
  chatProposalPbiCreated: "PBI berhasil dibuat",
  chatProposalTasksCreated: "{count} tugas berhasil dibuat",
  chatProposalTasksPartial: "Berhenti setelah membuat {done} dari {total} tugas",
  chatProposalStatusChanged: "Status berhasil diubah",
  chatProposalFailed: "Gagal menerapkan usulan",
  chatProposalAlreadyHandled: "Usulan ini sudah diterapkan atau sedang diproses di tempat lain",
  chatProposalStoryPoints: "Estimasi",
  chatProposalEpic: "Epik",
  chatProposalUserStory: "Cerita pengguna",
  chatProposalAcceptance: "Kriteria penerimaan",
  chatProposalDuplicates: "Ada PBI yang mirip",
  chatProposalSprint: "Sprint",
  chatProposalEstimate: "Estimasi",
  chatProposalSkipped: "Dilewati (sudah ada)",
  chatProposalReason: "Alasan",
  chatProposalTargetPbi: "PBI",
  chatProposalTargetTask: "Tugas",
  chatProposalCreateIceboxTitle: "Usulan: tambah ke Icebox",
  chatProposalSprintPbiTitle: "Usulan: ubah isi sprint",
  chatProposalPlanEditTitle: "Usulan: ubah rencana induk",
  chatProposalSprintScheduleTitle: "Usulan: ubah periode sprint",
  chatProposalCreateTemplateTitle: "Usulan: buat templat rencana",
  chatProposalIceboxCreated: "Ditambahkan ke Icebox",
  chatProposalSprintPbiAdded: "PBI dimasukkan ke sprint",
  chatProposalSprintPbiRemoved: "PBI dikeluarkan dari sprint",
  chatProposalPlanEdited: "{count} item rencana diubah",
  chatProposalSprintScheduled: "Periode sprint diubah",
  chatProposalTemplateCreated: "Templat dibuat",
  chatProposalPlanLoadTitle: "Usulan: muat jadwal dasar ke rencana keseluruhan",
  chatProposalPlanLoaded: "{count} item rencana dimuat",
  chatProposalPlanLoadSummary: "{count} item · {deps} ketergantungan · {start} – {end}",
  chatProposalPartial: "Gagal setelah {done} dari {total} perubahan diterapkan. Periksa sisanya di layar",
  chatProposalRequest: "Permintaan",
  chatProposalBackground: "Latar belakang",
  chatProposalActionAdd: "Masukkan ke sprint",
  chatProposalActionRemove: "Keluarkan dari sprint",
  chatProposalRemoveWarning: "{count} tugas akan ikut dihapus",
  chatProposalOpCreate: "Tambah",
  chatProposalOpUpdate: "Ubah",
  chatProposalOpShiftLater: "Geser {days} hari lebih lambat",
  chatProposalOpShiftEarlier: "Geser {days} hari lebih cepat",
  chatProposalDurationDays: "{days} hari",
  chatProposalFollowersNone: "Biarkan item berikutnya",
  chatProposalFollowersDependents: "Geser juga item yang bergantung",
  chatProposalFollowersLater: "Geser juga semua item sesudahnya",
  chatProposalUndated: "Belum dijadwalkan",
  chatProposalParent: "Induk",
  chatProposalMilestone: "Milestone",
  chatProposalPeriod: "Periode",
  chatProposalStages: "{count} tahap",
  chatProposalVisibilityPrivate: "Hanya saya",
  chatProposalVisibilityPublic: "Semua orang",
  chatProposalTemplateStatus: "Status",
  chatProposalRenameTo: "Ubah nama menjadi",
}
