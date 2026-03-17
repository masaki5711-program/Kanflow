import type { ProjectType } from "@/lib/project-type-labels"

export type FaqCategory = "basic" | "icebox" | "backlog" | "sprint" | "other"

export interface FaqItem {
  question: string
  answer: string
  category: FaqCategory
  projectTypes?: ProjectType[]
}

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  basic: "基本操作",
  icebox: "IceBox",
  backlog: "バックログ",
  sprint: "スプリント",
  other: "その他",
}

export const FAQ_CATEGORY_COLORS: Record<FaqCategory, string> = {
  basic: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  icebox: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  backlog:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  sprint:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  other: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
}

export const FAQ_ENTRIES: FaqItem[] = [
  // Basic
  {
    question: "プロジェクトを作成するには？",
    answer:
      "トップページの「新規プロジェクト」ボタンをクリックし、プロジェクト名と説明を入力して作成します。",
    category: "basic",
  },
  {
    question: "メンバーを招待するには？",
    answer:
      "プロジェクト設定 → メンバー追加 から、招待したいユーザーのメールアドレスを入力して招待します。",
    category: "basic",
  },
  {
    question: "言語を変更するには？",
    answer:
      "プロジェクト設定 → 言語設定 から、日本語・英語・インドネシア語を選択できます。",
    category: "basic",
  },
  {
    question: "ファイルを添付するには？",
    answer:
      "ダッシュボードの「ファイルをアップロード」エリア、またはIceBoxの編集画面からファイルを添付できます。",
    category: "basic",
  },
  // IceBox
  {
    question: "誰でもIceBoxに投稿できますか？",
    answer:
      "はい、プロジェクトに参加している全メンバーがIceBoxにアイデアや要望を投稿できます。",
    category: "icebox",
  },
  {
    question: "凍結とは？",
    answer:
      "今は実施しないが、アイデアとして残しておく状態です。将来的に再検討する可能性がある要望を凍結にします。",
    category: "icebox",
  },
  // Backlog
  {
    question: "Ready / Not Ready の違いは？",
    answer:
      "Readyは詳細化と見積もりが完了し、スプリントに取り込める状態です。Not Readyはまだ詳細化や見積もりが必要な状態です。",
    category: "backlog",
  },
  {
    question: "業務負荷点数とは？",
    answer:
      "POが設定する相対的な作業量の見積もりです。フィボナッチ数列（1, 2, 3, 5, 8, 13…）を使うことが一般的です。",
    category: "backlog",
  },
  // Sprint
  {
    question: "キャパシティをどう設定する？",
    answer:
      "過去のスプリント実績（ベロシティ）を参考に設定します。スプリント設定画面で過去の平均を確認できます。",
    category: "sprint",
  },
  {
    question: "タスクのステータスを変更するには？",
    answer:
      "タスクの左側にある丸いステータスアイコンをクリックすると、Todo → 進行中 → 完了 と順番に切り替わります。",
    category: "sprint",
  },
  // Other
  {
    question: "ガントチャートの使い方は？",
    answer:
      "サイドバーの「ガントチャート」を選択します。ズーム切替ボタンで「週」「2週間」「月」の表示期間を変更できます。",
    category: "other",
  },
  {
    question: "カレンダーでイベントを作成するには？",
    answer:
      "サイドバーの「カレンダー」を選択し、日付をクリックするか、複数日をドラッグして選択します。",
    category: "other",
  },
  {
    question: "Excelファイルを編集するには？",
    answer:
      "ダッシュボードのファイル一覧で「編集」ボタンをクリックすると、Collabora Onlineでブラウザ上から直接編集できます。",
    category: "other",
  },

  // ── 工程改善プロジェクト専用FAQ ──

  {
    question: "改善サイクルとスプリントの違いは？",
    answer:
      "基本的な仕組みは同じですが、工程改善プロジェクトでは「改善サイクル」と呼びます。改善施策の計画・実行・効果検証を一定期間で繰り返す点はスプリントと同様です。",
    category: "sprint",
    projectTypes: ["process_improvement"],
  },
  {
    question: "改善効果をどう測定する？",
    answer:
      "改善前後の数値を比較して効果を測定します。OEE（設備総合効率）、不良率、工数、リードタイムなどをKPIとして設定し、改善サイクルごとに振り返りで確認します。",
    category: "sprint",
    projectTypes: ["process_improvement"],
  },
  {
    question: "標準化とは？",
    answer:
      "改善成果を標準作業手順書（SOP）に落とし込み、組織全体に展開することです。改善が一時的なものにならないよう、手順として定着させることが重要です。",
    category: "other",
    projectTypes: ["process_improvement"],
  },
]
