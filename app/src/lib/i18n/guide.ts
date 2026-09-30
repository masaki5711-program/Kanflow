/**
 * i18n domain: Guide / help page.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GuideTranslations {
  guideTitle: string
  guideTabsLabel: string
  guideTabGettingStarted: string
  guideTabGlossary: string
  guideTabHelp: string
  guideIntroSoftware: string
  guideIntroProcessImprovement: string
  guideIntroGeneral: string
  guideKanflowOperation: string
  guideHint: string
  guideFilterAll: string
  guideCategoryFilterLabel: string
  guideSearchLabel: string
  guideSearchPlaceholder: string
  /** `{count}` is replaced with the number of matching terms. */
  guideResultsCount: string
  guideResultsCountOne: string
  guideNoResults: string
  guideNoResultsHint: string
  guideNoFaq: string
}

export const ja: GuideTranslations = {
  guideTitle: "ガイド & ヘルプ",
  guideTabsLabel: "ガイドの表示切り替え",
  guideTabGettingStarted: "はじめに",
  guideTabGlossary: "用語集",
  guideTabHelp: "ヘルプ",
  guideIntroSoftware:
    "Kanflowを使ったスクラム開発の流れを順に説明します。各ステップをクリックして詳細（イベント・参加者・タイムボックス）を確認してください。",
  guideIntroProcessImprovement:
    "Kanflowを使った工程改善の流れを順に説明します。各ステップをクリックして詳細を確認してください。",
  guideIntroGeneral:
    "Kanflowを使ったプロジェクト運営の流れを順に説明します。各ステップをクリックして詳細を確認してください。",
  guideKanflowOperation: "Kanflowでの操作",
  guideHint: "ヒント",
  guideFilterAll: "すべて",
  guideCategoryFilterLabel: "カテゴリで絞り込み",
  guideSearchLabel: "用語を検索",
  guideSearchPlaceholder: "用語を検索...",
  guideResultsCount: "{count} 件の用語",
  guideResultsCountOne: "1 件の用語",
  guideNoResults: "検索結果が見つかりませんでした",
  guideNoResultsHint: "別のキーワードを試すか、カテゴリの絞り込みを解除してください。",
  guideNoFaq: "このカテゴリの質問はありません",
}

export const en: GuideTranslations = {
  guideTitle: "Guide & Help",
  guideTabsLabel: "Guide sections",
  guideTabGettingStarted: "Getting Started",
  guideTabGlossary: "Glossary",
  guideTabHelp: "Help",
  guideIntroSoftware:
    "Walk through the Scrum development workflow using Kanflow. Click each step to see details (events, attendees, timeboxes).",
  guideIntroProcessImprovement:
    "Walk through the process-improvement workflow using Kanflow. Click each step to see the details.",
  guideIntroGeneral: "Walk through the project-management workflow using Kanflow. Click each step to see the details.",
  guideKanflowOperation: "Kanflow operation",
  guideHint: "Tip",
  guideFilterAll: "All",
  guideCategoryFilterLabel: "Filter by category",
  guideSearchLabel: "Search terms",
  guideSearchPlaceholder: "Search terms...",
  guideResultsCount: "{count} terms",
  guideResultsCountOne: "1 term",
  guideNoResults: "No results found",
  guideNoResultsHint: "Try a different keyword or clear the category filter.",
  guideNoFaq: "No questions in this category",
}

export const id: GuideTranslations = {
  guideTitle: "Panduan & Bantuan",
  guideTabsLabel: "Bagian panduan",
  guideTabGettingStarted: "Memulai",
  guideTabGlossary: "Glosarium",
  guideTabHelp: "Bantuan",
  guideIntroSoftware:
    "Pelajari alur kerja pengembangan Scrum dengan Kanflow. Klik setiap langkah untuk melihat detail (acara, peserta, timebox).",
  guideIntroProcessImprovement:
    "Pelajari alur kerja perbaikan proses dengan Kanflow. Klik setiap langkah untuk melihat detailnya.",
  guideIntroGeneral: "Pelajari alur kerja manajemen proyek dengan Kanflow. Klik setiap langkah untuk melihat detailnya.",
  guideKanflowOperation: "Operasi Kanflow",
  guideHint: "Tips",
  guideFilterAll: "Semua",
  guideCategoryFilterLabel: "Saring berdasarkan kategori",
  guideSearchLabel: "Cari istilah",
  guideSearchPlaceholder: "Cari istilah...",
  guideResultsCount: "{count} istilah",
  guideResultsCountOne: "1 istilah",
  guideNoResults: "Tidak ada hasil yang ditemukan",
  guideNoResultsHint: "Coba kata kunci lain atau hapus filter kategori.",
  guideNoFaq: "Tidak ada pertanyaan dalam kategori ini",
}
