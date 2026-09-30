/**
 * i18n domain: Admin: sections (organisation) and project categories.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AdminOrgTranslations {
  categoryNamePlaceholder: string
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
  categoryAdminTitle: string
  categoryAdminDesc: string
  categoryAdd: string
  categoryEdit: string
  categoryName: string
  categoryScope: string
  categoryScopeGlobal: string
  categoryColor: string
  categorySortOrder: string
  categoryDeleted: string
  categoryGroupEmpty: string
  categoryColorGray: string
  categoryColorRed: string
  categoryColorOrange: string
  categoryColorYellow: string
  categoryColorGreen: string
  categoryColorBlue: string
  categoryColorIndigo: string
  categoryColorPurple: string
  categoryColorPink: string
  categoryColorAmber: string
  categoryColorRose: string
  categoryColorViolet: string
  categoryColorCyan: string
  sectionDeleted: string
  sectionTableCaption: string
  sectionActions: string
}

export const ja: AdminOrgTranslations = {
  categoryNamePlaceholder: "例: 開発中、保守、社内",
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
  categoryAdminTitle: "カテゴリ管理（管理者）",
  categoryAdminDesc: "全体またはセクション単位で共通カテゴリを定義します",
  categoryAdd: "カテゴリ追加",
  categoryEdit: "カテゴリ編集",
  categoryName: "名前",
  categoryScope: "スコープ",
  categoryScopeGlobal: "全体（Global）",
  categoryColor: "色",
  categorySortOrder: "並び順",
  categoryDeleted: "カテゴリを削除しました",
  categoryGroupEmpty: "このスコープのカテゴリはありません",
  categoryColorGray: "グレー",
  categoryColorRed: "レッド",
  categoryColorOrange: "オレンジ",
  categoryColorYellow: "イエロー",
  categoryColorGreen: "グリーン",
  categoryColorBlue: "ブルー",
  categoryColorIndigo: "インディゴ",
  categoryColorPurple: "パープル",
  categoryColorPink: "ピンク",
  categoryColorAmber: "アンバー",
  categoryColorRose: "ローズ",
  categoryColorViolet: "バイオレット",
  categoryColorCyan: "シアン",
  sectionDeleted: "セクションを削除しました",
  sectionTableCaption: "セクション一覧",
  sectionActions: "操作",
}

export const en: AdminOrgTranslations = {
  categoryNamePlaceholder: "e.g., In Development, Maintenance, Internal",
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
  categoryAdminTitle: "Category Management (Admin)",
  categoryAdminDesc: "Define shared categories globally or per section",
  categoryAdd: "Add Category",
  categoryEdit: "Edit Category",
  categoryName: "Name",
  categoryScope: "Scope",
  categoryScopeGlobal: "Global (all sections)",
  categoryColor: "Color",
  categorySortOrder: "Sort order",
  categoryDeleted: "Category deleted",
  categoryGroupEmpty: "No categories in this scope",
  categoryColorGray: "Gray",
  categoryColorRed: "Red",
  categoryColorOrange: "Orange",
  categoryColorYellow: "Yellow",
  categoryColorGreen: "Green",
  categoryColorBlue: "Blue",
  categoryColorIndigo: "Indigo",
  categoryColorPurple: "Purple",
  categoryColorPink: "Pink",
  categoryColorAmber: "Amber",
  categoryColorRose: "Rose",
  categoryColorViolet: "Violet",
  categoryColorCyan: "Cyan",
  sectionDeleted: "Section deleted",
  sectionTableCaption: "List of sections",
  sectionActions: "Actions",
}

export const id: AdminOrgTranslations = {
  categoryNamePlaceholder: "misalnya: Dalam Pengembangan, Pemeliharaan, Internal",
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
  categoryAdminTitle: "Manajemen Kategori (Admin)",
  categoryAdminDesc: "Tetapkan kategori bersama secara global atau per seksi",
  categoryAdd: "Tambah Kategori",
  categoryEdit: "Sunting Kategori",
  categoryName: "Nama",
  categoryScope: "Cakupan",
  categoryScopeGlobal: "Global (semua seksi)",
  categoryColor: "Warna",
  categorySortOrder: "Urutan",
  categoryDeleted: "Kategori dihapus",
  categoryGroupEmpty: "Tidak ada kategori di cakupan ini",
  categoryColorGray: "Abu-abu",
  categoryColorRed: "Merah",
  categoryColorOrange: "Oranye",
  categoryColorYellow: "Kuning",
  categoryColorGreen: "Hijau",
  categoryColorBlue: "Biru",
  categoryColorIndigo: "Nila",
  categoryColorPurple: "Ungu",
  categoryColorPink: "Merah muda",
  categoryColorAmber: "Kuning tua",
  categoryColorRose: "Merah mawar",
  categoryColorViolet: "Violet",
  categoryColorCyan: "Sian",
  sectionDeleted: "Seksi dihapus",
  sectionTableCaption: "Daftar seksi",
  sectionActions: "Tindakan",
}
