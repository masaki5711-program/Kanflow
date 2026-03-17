import type { Language } from "@/lib/i18n"
import type { ProjectType } from "@/lib/project-type-labels"

export type FaqCategory = "basic" | "icebox" | "backlog" | "sprint" | "other"

export interface FaqItem {
  question: Record<Language, string>
  answer: Record<Language, string>
  category: FaqCategory
  projectTypes?: ProjectType[]
}

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, Record<Language, string>> = {
  basic: { ja: "基本操作", en: "Basics", id: "Dasar" },
  icebox: { ja: "IceBox", en: "IceBox", id: "IceBox" },
  backlog: { ja: "バックログ", en: "Backlog", id: "Backlog" },
  sprint: { ja: "スプリント", en: "Sprint", id: "Sprint" },
  other: { ja: "その他", en: "Other", id: "Lainnya" },
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
    question: {
      ja: "プロジェクトを作成するには？",
      en: "How do I create a project?",
      id: "Bagaimana cara membuat proyek?",
    },
    answer: {
      ja: "トップページの「新規プロジェクト」ボタンをクリックし、プロジェクト名と説明を入力して作成します。",
      en: "Click the 'New Project' button on the top page, enter the project name and description, then create it.",
      id: "Klik tombol 'Proyek Baru' di halaman utama, masukkan nama dan deskripsi proyek, lalu buat.",
    },
    category: "basic",
  },
  {
    question: {
      ja: "メンバーを招待するには？",
      en: "How do I invite members?",
      id: "Bagaimana cara mengundang anggota?",
    },
    answer: {
      ja: "プロジェクト設定 → メンバー追加 から、招待したいユーザーのメールアドレスを入力して招待します。",
      en: "Go to Project Settings → Add Members, enter the email address of the user you want to invite.",
      id: "Buka Pengaturan Proyek → Tambah Anggota, masukkan alamat email pengguna yang ingin Anda undang.",
    },
    category: "basic",
  },
  {
    question: {
      ja: "言語を変更するには？",
      en: "How do I change the language?",
      id: "Bagaimana cara mengubah bahasa?",
    },
    answer: {
      ja: "プロジェクト設定 → 言語設定 から、日本語・英語・インドネシア語を選択できます。",
      en: "Go to Project Settings → Language Settings, where you can select Japanese, English, or Indonesian.",
      id: "Buka Pengaturan Proyek → Pengaturan Bahasa, di mana Anda dapat memilih Jepang, Inggris, atau Indonesia.",
    },
    category: "basic",
  },
  {
    question: {
      ja: "ファイルを添付するには？",
      en: "How do I attach files?",
      id: "Bagaimana cara melampirkan file?",
    },
    answer: {
      ja: "ダッシュボードの「ファイルをアップロード」エリア、またはIceBoxの編集画面からファイルを添付できます。",
      en: "You can attach files from the 'Upload File' area on the Dashboard, or from the IceBox edit screen.",
      id: "Anda dapat melampirkan file dari area 'Unggah File' di Dashboard, atau dari layar edit IceBox.",
    },
    category: "basic",
  },
  // IceBox
  {
    question: {
      ja: "誰でもIceBoxに投稿できますか？",
      en: "Can anyone post to the IceBox?",
      id: "Bisakah siapa saja memposting ke IceBox?",
    },
    answer: {
      ja: "はい、プロジェクトに参加している全メンバーがIceBoxにアイデアや要望を投稿できます。",
      en: "Yes, all members participating in the project can post ideas and requests to the IceBox.",
      id: "Ya, semua anggota yang berpartisipasi dalam proyek dapat memposting ide dan permintaan ke IceBox.",
    },
    category: "icebox",
  },
  {
    question: {
      ja: "凍結とは？",
      en: "What does 'Frozen' mean?",
      id: "Apa arti 'Dibekukan'?",
    },
    answer: {
      ja: "今は実施しないが、アイデアとして残しておく状態です。将来的に再検討する可能性がある要望を凍結にします。",
      en: "It means the idea won't be acted on now but is kept for future consideration. Requests that may be revisited later are set to Frozen.",
      id: "Artinya ide tersebut tidak akan ditindaklanjuti sekarang tetapi disimpan untuk pertimbangan di masa depan. Permintaan yang mungkin ditinjau kembali nanti diatur ke Dibekukan.",
    },
    category: "icebox",
  },
  // Backlog
  {
    question: {
      ja: "Ready / Not Ready の違いは？",
      en: "What is the difference between Ready and Not Ready?",
      id: "Apa perbedaan antara Ready dan Not Ready?",
    },
    answer: {
      ja: "Readyは詳細化と見積もりが完了し、スプリントに取り込める状態です。Not Readyはまだ詳細化や見積もりが必要な状態です。",
      en: "Ready means the item has been refined and estimated, and is ready to be pulled into a sprint. Not Ready means it still needs refinement or estimation.",
      id: "Ready berarti item telah diperinci dan diestimasi, dan siap untuk dimasukkan ke sprint. Not Ready berarti masih perlu diperinci atau diestimasi.",
    },
    category: "backlog",
  },
  {
    question: {
      ja: "業務負荷点数とは？",
      en: "What are effort points?",
      id: "Apa itu poin upaya?",
    },
    answer: {
      ja: "POが設定する相対的な作業量の見積もりです。フィボナッチ数列（1, 2, 3, 5, 8, 13…）を使うことが一般的です。",
      en: "A relative estimate of work effort set by the PO. It is common to use the Fibonacci sequence (1, 2, 3, 5, 8, 13...).",
      id: "Estimasi relatif dari upaya kerja yang ditetapkan oleh PO. Umum menggunakan deret Fibonacci (1, 2, 3, 5, 8, 13...).",
    },
    category: "backlog",
  },
  // Sprint
  {
    question: {
      ja: "キャパシティをどう設定する？",
      en: "How do I set the capacity?",
      id: "Bagaimana cara mengatur kapasitas?",
    },
    answer: {
      ja: "過去のスプリント実績（ベロシティ）を参考に設定します。スプリント設定画面で過去の平均を確認できます。",
      en: "Set it based on past sprint performance (velocity). You can check the historical average in the Sprint settings screen.",
      id: "Atur berdasarkan kinerja sprint sebelumnya (velocity). Anda dapat memeriksa rata-rata historis di layar pengaturan Sprint.",
    },
    category: "sprint",
  },
  {
    question: {
      ja: "タスクのステータスを変更するには？",
      en: "How do I change a task's status?",
      id: "Bagaimana cara mengubah status tugas?",
    },
    answer: {
      ja: "タスクの左側にある丸いステータスアイコンをクリックすると、Todo → 進行中 → 完了 と順番に切り替わります。",
      en: "Click the round status icon on the left side of the task. It cycles through Todo → In Progress → Done.",
      id: "Klik ikon status bulat di sisi kiri tugas. Statusnya berputar melalui Todo → Sedang Berlangsung → Selesai.",
    },
    category: "sprint",
  },
  // Other
  {
    question: {
      ja: "ガントチャートの使い方は？",
      en: "How do I use the Gantt Chart?",
      id: "Bagaimana cara menggunakan Gantt Chart?",
    },
    answer: {
      ja: "サイドバーの「ガントチャート」を選択します。ズーム切替ボタンで「週」「2週間」「月」の表示期間を変更できます。",
      en: "Select 'Gantt Chart' from the sidebar. Use the zoom toggle buttons to switch between 'Week', '2 Weeks', and 'Month' views.",
      id: "Pilih 'Gantt Chart' dari sidebar. Gunakan tombol zoom untuk beralih antara tampilan 'Minggu', '2 Minggu', dan 'Bulan'.",
    },
    category: "other",
  },
  {
    question: {
      ja: "カレンダーでイベントを作成するには？",
      en: "How do I create events on the calendar?",
      id: "Bagaimana cara membuat acara di kalender?",
    },
    answer: {
      ja: "サイドバーの「カレンダー」を選択し、日付をクリックするか、複数日をドラッグして選択します。",
      en: "Select 'Calendar' from the sidebar, then click on a date or drag to select multiple dates.",
      id: "Pilih 'Kalender' dari sidebar, lalu klik tanggal atau seret untuk memilih beberapa tanggal.",
    },
    category: "other",
  },
  {
    question: {
      ja: "Excelファイルを編集するには？",
      en: "How do I edit Excel files?",
      id: "Bagaimana cara mengedit file Excel?",
    },
    answer: {
      ja: "ダッシュボードのファイル一覧で「編集」ボタンをクリックすると、Collabora Onlineでブラウザ上から直接編集できます。",
      en: "Click the 'Edit' button in the file list on the Dashboard to edit directly in your browser using Collabora Online.",
      id: "Klik tombol 'Edit' di daftar file di Dashboard untuk mengedit langsung di browser Anda menggunakan Collabora Online.",
    },
    category: "other",
  },

  // ── Process improvement project FAQ ──

  {
    question: {
      ja: "改善スプリントとスプリントの違いは？",
      en: "What is the difference between a KAIZEN Sprint and a Sprint?",
      id: "Apa perbedaan antara KAIZEN Sprint dan Sprint?",
    },
    answer: {
      ja: "基本的な仕組みは同じですが、工程改善プロジェクトでは「改善スプリント」と呼びます。改善施策の計画・実行・効果検証を一定期間で繰り返す点はスプリントと同様です。",
      en: "The basic mechanism is the same, but in process improvement projects it is called a 'KAIZEN Sprint'. Like sprints, it repeats the cycle of planning, executing, and verifying improvement measures within a fixed period.",
      id: "Mekanisme dasarnya sama, tetapi dalam proyek perbaikan proses disebut 'KAIZEN Sprint'. Seperti sprint, ini mengulangi siklus perencanaan, pelaksanaan, dan verifikasi langkah-langkah perbaikan dalam periode tetap.",
    },
    category: "sprint",
    projectTypes: ["process_improvement"],
  },
  {
    question: {
      ja: "改善効果をどう測定する？",
      en: "How do I measure improvement effectiveness?",
      id: "Bagaimana cara mengukur efektivitas perbaikan?",
    },
    answer: {
      ja: "改善前後の数値を比較して効果を測定します。OEE（設備総合効率）、不良率、工数、リードタイムなどをKPIとして設定し、改善スプリントごとに振り返りで確認します。",
      en: "Measure effectiveness by comparing numbers before and after improvement. Set KPIs such as OEE (Overall Equipment Effectiveness), defect rate, labor hours, and lead time, and review them in each KAIZEN Sprint retrospective.",
      id: "Ukur efektivitas dengan membandingkan angka sebelum dan sesudah perbaikan. Tetapkan KPI seperti OEE (Overall Equipment Effectiveness), tingkat cacat, jam kerja, dan waktu tunggu, dan tinjau di setiap retrospektif KAIZEN Sprint.",
    },
    category: "sprint",
    projectTypes: ["process_improvement"],
  },
  {
    question: {
      ja: "標準化とは？",
      en: "What is standardization?",
      id: "Apa itu standardisasi?",
    },
    answer: {
      ja: "改善成果を標準作業手順書（SOP）に落とし込み、組織全体に展開することです。改善が一時的なものにならないよう、手順として定着させることが重要です。",
      en: "It means incorporating improvement results into Standard Operating Procedures (SOPs) and deploying them across the organization. It is important to establish them as procedures so improvements are not temporary.",
      id: "Artinya memasukkan hasil perbaikan ke dalam Prosedur Operasi Standar (SOP) dan menerapkannya di seluruh organisasi. Penting untuk menetapkannya sebagai prosedur agar perbaikan tidak bersifat sementara.",
    },
    category: "other",
    projectTypes: ["process_improvement"],
  },
]
