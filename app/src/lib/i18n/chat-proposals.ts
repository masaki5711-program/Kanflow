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
}
