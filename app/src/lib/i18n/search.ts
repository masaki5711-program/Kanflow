/**
 * i18n domain: global search / command palette (`components/search/`) and
 * keyboard shortcuts help (`components/shortcuts/`).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 * Placeholders: {query} {count} {page} {language} {key}.
 */
export interface SearchTranslations {
  searchButton: string
  searchButtonHint: string
  searchDialogTitle: string
  searchInputLabel: string
  searchPlaceholder: string
  searchMinChars: string
  searchSearching: string
  searchNoResults: string
  searchFailed: string
  searchResultCount: string
  searchKeyboardHint: string
  searchUntitled: string
  searchGroupPbi: string
  searchGroupTask: string
  searchGroupIcebox: string
  searchGroupProject: string
  searchGroupGoal: string
  searchGroupCommands: string
  searchCmdGoTo: string
  searchCmdLanguage: string
  shortcutsTitle: string
  shortcutsDescription: string
  shortcutsGroupGeneral: string
  shortcutsGroupNavigation: string
  shortcutsOpenHelp: string
  shortcutsOpenSearch: string
  shortcutsGoTo: string
  shortcutsThen: string
  shortcutsOr: string
}

export const ja: SearchTranslations = {
  searchButton: "検索",
  searchButtonHint: "検索（Ctrl+K）",
  searchDialogTitle: "検索とコマンド",
  searchInputLabel: "検索キーワード",
  searchPlaceholder: "PBI・タスク・IceBox・プロジェクト・ゴールを検索",
  searchMinChars: "2 文字以上入力すると検索します",
  searchSearching: "検索中…",
  searchNoResults: "「{query}」に一致する項目はありません",
  searchFailed: "検索に失敗しました。もう一度お試しください",
  searchResultCount: "{count} 件の候補",
  searchKeyboardHint: "↑↓ で選択 / Enter で開く / Esc で閉じる",
  searchUntitled: "（タイトルなし）",
  searchGroupPbi: "PBI",
  searchGroupTask: "スプリントタスク",
  searchGroupIcebox: "IceBox",
  searchGroupProject: "プロジェクト",
  searchGroupGoal: "プロダクトゴール",
  searchGroupCommands: "コマンド",
  searchCmdGoTo: "{page} を開く",
  searchCmdLanguage: "表示言語を {language} に切り替え",
  shortcutsTitle: "キーボードショートカット",
  shortcutsDescription: "文字入力中やダイアログ表示中は無効です。",
  shortcutsGroupGeneral: "全般",
  shortcutsGroupNavigation: "プロジェクト内の移動",
  shortcutsOpenHelp: "このショートカット一覧を表示",
  shortcutsOpenSearch: "検索とコマンドを開く",
  shortcutsGoTo: "{page} へ移動",
  shortcutsThen: "続けて",
  shortcutsOr: "または",
}

export const en: SearchTranslations = {
  searchButton: "Search",
  searchButtonHint: "Search (Ctrl+K)",
  searchDialogTitle: "Search and commands",
  searchInputLabel: "Search keywords",
  searchPlaceholder: "Search PBIs, tasks, IceBox, projects and goals",
  searchMinChars: "Type at least 2 characters to search",
  searchSearching: "Searching…",
  searchNoResults: "Nothing matches “{query}”",
  searchFailed: "Search failed. Please try again",
  searchResultCount: "{count} suggestions",
  searchKeyboardHint: "↑↓ to select / Enter to open / Esc to close",
  searchUntitled: "(untitled)",
  searchGroupPbi: "PBIs",
  searchGroupTask: "Sprint tasks",
  searchGroupIcebox: "IceBox",
  searchGroupProject: "Projects",
  searchGroupGoal: "Product goals",
  searchGroupCommands: "Commands",
  searchCmdGoTo: "Go to {page}",
  searchCmdLanguage: "Switch display language to {language}",
  shortcutsTitle: "Keyboard shortcuts",
  shortcutsDescription: "Shortcuts are off while you type or a dialog is open.",
  shortcutsGroupGeneral: "General",
  shortcutsGroupNavigation: "Within a project",
  shortcutsOpenHelp: "Show this list of shortcuts",
  shortcutsOpenSearch: "Open search and commands",
  shortcutsGoTo: "Go to {page}",
  shortcutsThen: "then",
  shortcutsOr: "or",
}

export const id: SearchTranslations = {
  searchButton: "Cari",
  searchButtonHint: "Cari (Ctrl+K)",
  searchDialogTitle: "Pencarian dan perintah",
  searchInputLabel: "Kata kunci pencarian",
  searchPlaceholder: "Cari PBI, tugas, IceBox, proyek, dan tujuan",
  searchMinChars: "Ketik minimal 2 karakter untuk mencari",
  searchSearching: "Mencari…",
  searchNoResults: "Tidak ada yang cocok dengan “{query}”",
  searchFailed: "Pencarian gagal. Silakan coba lagi",
  searchResultCount: "{count} saran",
  searchKeyboardHint: "↑↓ untuk memilih / Enter untuk membuka / Esc untuk menutup",
  searchUntitled: "(tanpa judul)",
  searchGroupPbi: "PBI",
  searchGroupTask: "Tugas sprint",
  searchGroupIcebox: "IceBox",
  searchGroupProject: "Proyek",
  searchGroupGoal: "Tujuan produk",
  searchGroupCommands: "Perintah",
  searchCmdGoTo: "Buka {page}",
  searchCmdLanguage: "Ganti bahasa tampilan ke {language}",
  shortcutsTitle: "Pintasan keyboard",
  shortcutsDescription: "Pintasan tidak aktif saat Anda mengetik atau dialog sedang terbuka.",
  shortcutsGroupGeneral: "Umum",
  shortcutsGroupNavigation: "Di dalam proyek",
  shortcutsOpenHelp: "Tampilkan daftar pintasan ini",
  shortcutsOpenSearch: "Buka pencarian dan perintah",
  shortcutsGoTo: "Buka {page}",
  shortcutsThen: "lalu",
  shortcutsOr: "atau",
}
