/**
 * i18n domain: Sidebar / header navigation.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface NavTranslations {
  // Navigation
  navDashboard: string
  navIcebox: string
  navBacklog: string
  navSprints: string
  navReleases: string
  navSettings: string
  // Sidebar groups
  navGroupPlan: string
  navGroupExecute: string
  navGroupReview: string
  navGroupManage: string
  // One-line descriptions of each sidebar destination
  navDescDashboard: string
  navDescBacklog: string
  navDescSprints: string
  navDescPlan: string
  navDescReleases: string
  navDescGantt: string
  navDescCalendar: string
  navDescBurndown: string
  navDescReport: string
  navDescChat: string
  navDescGuide: string
  navDescSettings: string
  // Shell chrome
  navProjectMenu: string
  navOpenMenu: string
  navCloseMenu: string
  /** Accessible name of the mobile drawer dialog (distinct from the nav landmark). */
  navDrawerLabel: string
  /** Skip link at the top of every page. */
  skipToMain: string
  navProjectType: string
  navAdminMenu: string
  navLanguageMenu: string
  navCategoryAdmin: string
  navUserMenu: string
  navBreadcrumb: string
  navPrimary: string
}

export const ja: NavTranslations = {
  navDashboard: "ダッシュボード",
  navIcebox: "IceBox",
  navBacklog: "プロダクトバックログ",
  navSprints: "スプリント",
  navReleases: "リリース",
  navSettings: "チーム設定",
  navGroupPlan: "計画",
  navGroupExecute: "実行",
  navGroupReview: "振り返り・AI",
  navGroupManage: "管理",
  navDescDashboard: "プロジェクトの概況と進捗",
  navDescBacklog: "優先順位を付けたやること一覧（PBI）",
  navDescSprints: "期間を区切って実行・タスク管理",
  navDescPlan: "全体スケジュールとマイルストーン",
  navDescReleases: "リリース単位で成果をまとめる",
  navDescGantt: "期間を横棒グラフで確認",
  navDescCalendar: "イベント・予定・休暇",
  navDescBurndown: "スプリントの残作業の推移",
  navDescReport: "進捗レポートの作成と出力",
  navDescChat: "プロジェクトについてAIに質問",
  navDescGuide: "使い方とスクラム用語",
  navDescSettings: "メンバーとプロジェクトの設定",
  navProjectMenu: "プロジェクトメニュー",
  navOpenMenu: "メニューを開く",
  navCloseMenu: "メニューを閉じる",
  navDrawerLabel: "プロジェクトメニュー（ドロワー）",
  skipToMain: "メインコンテンツへ移動",
  navProjectType: "プロジェクトタイプ",
  navAdminMenu: "管理",
  navLanguageMenu: "表示言語",
  navCategoryAdmin: "カテゴリ管理",
  navUserMenu: "ユーザーメニュー",
  navBreadcrumb: "パンくずリスト",
  navPrimary: "メインメニュー",
}

export const en: NavTranslations = {
  navDashboard: "Dashboard",
  navIcebox: "IceBox",
  navBacklog: "Product Backlog",
  navSprints: "Sprints",
  navReleases: "Releases",
  navSettings: "Settings",
  navGroupPlan: "Planning",
  navGroupExecute: "Delivery",
  navGroupReview: "Review & AI",
  navGroupManage: "Manage",
  navDescDashboard: "Project overview and progress",
  navDescBacklog: "Prioritized list of work (PBIs)",
  navDescSprints: "Time-boxed delivery and tasks",
  navDescPlan: "Overall schedule and milestones",
  navDescReleases: "Group results into releases",
  navDescGantt: "Timeline bars for planned work",
  navDescCalendar: "Events, schedules and leave",
  navDescBurndown: "Remaining work over the sprint",
  navDescReport: "Build and export progress reports",
  navDescChat: "Ask AI about this project",
  navDescGuide: "How to use it and Scrum terms",
  navDescSettings: "Members and project settings",
  navProjectMenu: "Project menu",
  navOpenMenu: "Open menu",
  navCloseMenu: "Close menu",
  navDrawerLabel: "Project menu drawer",
  skipToMain: "Skip to main content",
  navProjectType: "Project type",
  navAdminMenu: "Admin",
  navLanguageMenu: "Display language",
  navCategoryAdmin: "Category management",
  navUserMenu: "User menu",
  navBreadcrumb: "Breadcrumb",
  navPrimary: "Main menu",
}

export const id: NavTranslations = {
  navDashboard: "Dasbor",
  navIcebox: "IceBox",
  navBacklog: "Backlog Produk",
  navSprints: "Sprint",
  navReleases: "Rilis",
  navSettings: "Pengaturan",
  navGroupPlan: "Perencanaan",
  navGroupExecute: "Pelaksanaan",
  navGroupReview: "Retrospeksi & AI",
  navGroupManage: "Kelola",
  navDescDashboard: "Ringkasan dan progres proyek",
  navDescBacklog: "Daftar pekerjaan berprioritas (PBI)",
  navDescSprints: "Pelaksanaan berbatas waktu dan tugas",
  navDescPlan: "Jadwal keseluruhan dan tonggak",
  navDescReleases: "Kelompokkan hasil per rilis",
  navDescGantt: "Linimasa pekerjaan dalam diagram batang",
  navDescCalendar: "Acara, jadwal, dan cuti",
  navDescBurndown: "Sisa pekerjaan selama sprint",
  navDescReport: "Buat dan ekspor laporan progres",
  navDescChat: "Tanya AI tentang proyek ini",
  navDescGuide: "Cara pakai dan istilah Scrum",
  navDescSettings: "Anggota dan pengaturan proyek",
  navProjectMenu: "Menu proyek",
  navOpenMenu: "Buka menu",
  navCloseMenu: "Tutup menu",
  navDrawerLabel: "Laci menu proyek",
  skipToMain: "Lompat ke konten utama",
  navProjectType: "Tipe proyek",
  navAdminMenu: "Admin",
  navLanguageMenu: "Bahasa tampilan",
  navCategoryAdmin: "Kelola kategori",
  navUserMenu: "Menu pengguna",
  navBreadcrumb: "Navigasi jejak",
  navPrimary: "Menu utama",
}
