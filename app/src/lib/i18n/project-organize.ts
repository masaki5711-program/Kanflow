/**
 * i18n domain: organizing the home project list — card / list layout,
 * "by my role" grouping, dormant reminder banner and bulk archive
 * (app/_project-list/project-list-table.tsx, role-groups.ts,
 * dormant-banner.tsx, bulk-archive-dialog.tsx).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ProjectOrganizeTranslations {
  projectLayoutLabel: string
  projectLayoutCard: string
  projectLayoutList: string
  projectGroupByRole: string
  projectGroupFavorites: string
  projectGroupRoleOwn: string
  projectGroupRoleMember: string
  projectGroupRoleViewer: string
  projectListColName: string
  projectListColType: string
  projectListColRole: string
  projectListColUpdated: string
  projectListColStatus: string
  projectListColActions: string
  projectListRoleViewer: string
  projectDormantBannerTitle: string
  projectDormantBannerBody: string
  projectDormantBannerAction: string
  projectDormantBannerDismiss: string
  projectBulkArchiveButton: string
  projectBulkArchiveTitle: string
  projectBulkArchiveIntro: string
  projectBulkArchiveSkipped: string
  projectBulkArchiveSkippedHint: string
  projectBulkArchiveNone: string
  projectBulkArchiveConfirm: string
  projectBulkArchiveProgress: string
  projectBulkArchiveDone: string
  projectBulkArchivePartial: string
  projectBulkArchiveFailedList: string
  projectBulkArchiveUndone: string
  projectBulkArchiveUndoFailed: string
}

export const ja: ProjectOrganizeTranslations = {
  projectLayoutLabel: "表示形式",
  projectLayoutCard: "カード",
  projectLayoutList: "一覧",
  projectGroupByRole: "役割別",
  projectGroupFavorites: "お気に入り",
  projectGroupRoleOwn: "{role} のプロジェクト",
  projectGroupRoleMember: "メンバーとして参加",
  projectGroupRoleViewer: "閲覧のみ（セクション管理・管理者）",
  projectListColName: "プロジェクト",
  projectListColType: "種別",
  projectListColRole: "自分の役割",
  projectListColUpdated: "最終更新",
  projectListColStatus: "状態",
  projectListColActions: "操作",
  projectListRoleViewer: "閲覧",
  projectDormantBannerTitle: "休眠中のプロジェクトが {count} 件あります",
  projectDormantBannerBody: "{days}日以上更新がないプロジェクトをアーカイブすると、一覧がすっきりします。アーカイブ後もいつでも元に戻せます。",
  projectDormantBannerAction: "整理する",
  projectDormantBannerDismiss: "30日間表示しない",
  projectBulkArchiveButton: "まとめてアーカイブ",
  projectBulkArchiveTitle: "休眠中のプロジェクトをまとめてアーカイブ",
  projectBulkArchiveIntro: "次の {count} 件をアーカイブします。「アーカイブ済み」からいつでも元に戻せます。",
  projectBulkArchiveSkipped: "権限がないためスキップ（{count} 件）",
  projectBulkArchiveSkippedHint: "アーカイブできるのは PO・SM・管理者です。",
  projectBulkArchiveNone: "あなたがアーカイブできる休眠中のプロジェクトはありません。",
  projectBulkArchiveConfirm: "{count} 件をアーカイブ",
  projectBulkArchiveProgress: "アーカイブ中… {done} / {total}",
  projectBulkArchiveDone: "{count} 件のプロジェクトをアーカイブしました",
  projectBulkArchivePartial: "{ok} 件をアーカイブしました。{failed} 件は失敗しました。",
  projectBulkArchiveFailedList: "失敗したプロジェクト",
  projectBulkArchiveUndone: "{count} 件のプロジェクトを元に戻しました",
  projectBulkArchiveUndoFailed: "{count} 件を元に戻せませんでした",
}

export const en: ProjectOrganizeTranslations = {
  projectLayoutLabel: "Layout",
  projectLayoutCard: "Cards",
  projectLayoutList: "List",
  projectGroupByRole: "By my role",
  projectGroupFavorites: "Favorites",
  projectGroupRoleOwn: "Projects where I'm {role}",
  projectGroupRoleMember: "Joined as a member",
  projectGroupRoleViewer: "View only (section manager / admin)",
  projectListColName: "Project",
  projectListColType: "Type",
  projectListColRole: "My role",
  projectListColUpdated: "Last updated",
  projectListColStatus: "Status",
  projectListColActions: "Actions",
  projectListRoleViewer: "Viewer",
  projectDormantBannerTitle: "You have {count} dormant project(s)",
  projectDormantBannerBody: "Archiving projects with no updates for {days}+ days keeps your list tidy. You can restore them at any time.",
  projectDormantBannerAction: "Review",
  projectDormantBannerDismiss: "Hide for 30 days",
  projectBulkArchiveButton: "Archive all",
  projectBulkArchiveTitle: "Archive dormant projects",
  projectBulkArchiveIntro: "These {count} project(s) will be archived. You can restore them from the archived section at any time.",
  projectBulkArchiveSkipped: "Skipped — you can't archive these ({count})",
  projectBulkArchiveSkippedHint: "Only the PO, the SM or an admin can archive a project.",
  projectBulkArchiveNone: "There are no dormant projects you can archive.",
  projectBulkArchiveConfirm: "Archive {count}",
  projectBulkArchiveProgress: "Archiving… {done} / {total}",
  projectBulkArchiveDone: "Archived {count} project(s)",
  projectBulkArchivePartial: "Archived {ok}; {failed} failed.",
  projectBulkArchiveFailedList: "Failed projects",
  projectBulkArchiveUndone: "Restored {count} project(s)",
  projectBulkArchiveUndoFailed: "Could not restore {count} project(s)",
}

export const id: ProjectOrganizeTranslations = {
  projectLayoutLabel: "Tata letak",
  projectLayoutCard: "Kartu",
  projectLayoutList: "Daftar",
  projectGroupByRole: "Per peran saya",
  projectGroupFavorites: "Favorit",
  projectGroupRoleOwn: "Proyek saya sebagai {role}",
  projectGroupRoleMember: "Ikut sebagai anggota",
  projectGroupRoleViewer: "Hanya lihat (manajer seksi / admin)",
  projectListColName: "Proyek",
  projectListColType: "Jenis",
  projectListColRole: "Peran saya",
  projectListColUpdated: "Terakhir diperbarui",
  projectListColStatus: "Keadaan",
  projectListColActions: "Aksi",
  projectListRoleViewer: "Pelihat",
  projectDormantBannerTitle: "Ada {count} proyek yang tidak aktif",
  projectDormantBannerBody: "Arsipkan proyek yang tidak diperbarui selama {days} hari atau lebih agar daftar tetap rapi. Proyek dapat dipulihkan kapan saja.",
  projectDormantBannerAction: "Rapikan",
  projectDormantBannerDismiss: "Sembunyikan 30 hari",
  projectBulkArchiveButton: "Arsipkan semua",
  projectBulkArchiveTitle: "Arsipkan proyek yang tidak aktif",
  projectBulkArchiveIntro: "{count} proyek berikut akan diarsipkan. Anda dapat memulihkannya kapan saja dari bagian arsip.",
  projectBulkArchiveSkipped: "Dilewati — Anda tidak dapat mengarsipkan ini ({count})",
  projectBulkArchiveSkippedHint: "Hanya PO, SM, atau admin yang dapat mengarsipkan proyek.",
  projectBulkArchiveNone: "Tidak ada proyek tidak aktif yang dapat Anda arsipkan.",
  projectBulkArchiveConfirm: "Arsipkan {count}",
  projectBulkArchiveProgress: "Mengarsipkan… {done} / {total}",
  projectBulkArchiveDone: "{count} proyek diarsipkan",
  projectBulkArchivePartial: "{ok} diarsipkan; {failed} gagal.",
  projectBulkArchiveFailedList: "Proyek yang gagal",
  projectBulkArchiveUndone: "{count} proyek dipulihkan",
  projectBulkArchiveUndoFailed: "{count} proyek gagal dipulihkan",
}
