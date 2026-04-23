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

  // === Scrum roles ===
  {
    question: {
      ja: "プロダクトオーナー（PO）の責任は？",
      en: "What is the Product Owner (PO) responsible for?",
      id: "Apa tanggung jawab Product Owner (PO)?",
    },
    answer: {
      ja: "プロダクトの価値を最大化する責任者。プロダクトゴール策定、プロダクトバックログの作成・優先順位付け・精緻化、ステークホルダーとの調整、受入判断を担います。Kanflowでは PBI の新規作成・編集・並び替えは PO のみが行えます。",
      en: "Accountable for maximizing product value. Owns the Product Goal, creates/prioritizes/refines the Product Backlog, aligns with stakeholders, and makes acceptance decisions. In Kanflow only the PO can create, edit, or reorder PBIs.",
      id: "Bertanggung jawab memaksimalkan nilai produk. Membuat Product Goal, menyusun/memprioritaskan/menghaluskan Product Backlog, menyelaraskan dengan pemangku kepentingan, dan membuat keputusan penerimaan. Di Kanflow hanya PO yang dapat membuat, mengedit, atau menyusun ulang PBI.",
    },
    category: "basic",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "スクラムマスター（SM）の責任は？",
      en: "What is the Scrum Master (SM) responsible for?",
      id: "Apa tanggung jawab Scrum Master (SM)?",
    },
    answer: {
      ja: "スクラムの実践・推進・継続的改善を支援するサーバントリーダー。チームのブロッカー除去、スクラムイベントの円滑な運営、組織へのスクラム浸透、コーチングが主な役割です。プロダクトの内容には直接関与せず、プロセスとチームの成長に責任を持ちます。",
      en: "A servant leader who coaches the team in practicing, promoting, and continuously improving Scrum. Removes impediments, facilitates Scrum events, and fosters Scrum adoption across the organization. Does not decide product content — owns process and team growth.",
      id: "Pemimpin yang melayani, membimbing tim dalam menerapkan, mempromosikan, dan terus meningkatkan Scrum. Menghilangkan hambatan, memfasilitasi acara Scrum, dan mendorong adopsi Scrum di seluruh organisasi. Tidak menentukan isi produk — bertanggung jawab atas proses dan pertumbuhan tim.",
    },
    category: "basic",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "デベロッパー（Dev）の責任は？",
      en: "What is the Developer responsible for?",
      id: "Apa tanggung jawab Developer?",
    },
    answer: {
      ja: "スプリントで Done にする成果物を実際に作る自己組織化されたメンバー。スプリントプランニングで選択した PBI をタスクに分解し、品質を担保しつつ日々進捗させます。全員が集まり毎日デイリースクラムを行い、問題を早期に可視化・解決します。",
      en: "A self-organizing member who actually builds the Done increment each sprint. Decomposes selected PBIs into tasks, safeguards quality, and makes progress daily. Attends the Daily Scrum to surface and resolve issues early.",
      id: "Anggota yang terorganisasi sendiri yang benar-benar membangun increment Selesai setiap sprint. Memecah PBI terpilih menjadi tugas, menjaga kualitas, dan membuat kemajuan harian. Menghadiri Daily Scrum untuk memunculkan dan menyelesaikan masalah sejak dini.",
    },
    category: "basic",
    projectTypes: ["software"],
  },

  // === Scrum events ===
  {
    question: {
      ja: "スプリントプランニングとは？ 誰が参加する？",
      en: "What is Sprint Planning? Who attends?",
      id: "Apa itu Sprint Planning? Siapa yang hadir?",
    },
    answer: {
      ja: "スプリントの開始時に行う計画会議。参加は PO・SM・Dev の全員。PO がスプリントゴールと候補 PBI を提示し、Dev が容量を踏まえて取り込む PBI を決定、タスクに分解します。時間目安は1週スプリントで最大2時間、4週で最大8時間。",
      en: "A planning meeting at the start of each sprint. All of PO, SM, Developers attend. The PO presents the Sprint Goal and candidate PBIs, and Developers decide what they can deliver based on capacity and break it into tasks. Timebox: up to 2h for a 1-week sprint, up to 8h for a 4-week sprint.",
      id: "Pertemuan perencanaan di awal setiap sprint. Dihadiri oleh PO, SM, dan semua Developer. PO menyajikan Sprint Goal dan PBI kandidat, lalu Developer memutuskan apa yang dapat mereka kirimkan berdasarkan kapasitas dan memecahnya menjadi tugas. Batas waktu: hingga 2 jam untuk sprint 1 minggu, hingga 8 jam untuk 4 minggu.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "デイリースクラムとは？ 誰が参加する？",
      en: "What is the Daily Scrum? Who attends?",
      id: "Apa itu Daily Scrum? Siapa yang hadir?",
    },
    answer: {
      ja: "Dev が毎日 15 分で行うスプリントゴール達成のための調整ミーティング。Dev 全員が必須参加、PO と SM は必要に応じ参加・傾聴。進捗共有・障害の可視化・翌日以降のプランの再調整を目的とする。",
      en: "A 15-minute daily event for Developers to inspect progress toward the Sprint Goal and adjust the plan. Developers must attend; PO and SM may listen in when useful. Purpose: share progress, surface impediments, replan the next 24 hours.",
      id: "Acara harian 15 menit bagi Developer untuk memeriksa kemajuan menuju Sprint Goal dan menyesuaikan rencana. Developer wajib hadir; PO dan SM dapat menyimak jika perlu. Tujuan: berbagi kemajuan, memunculkan hambatan, merencanakan kembali 24 jam berikutnya.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "スプリントレビューとは？ 誰が参加する？",
      en: "What is the Sprint Review? Who attends?",
      id: "Apa itu Sprint Review? Siapa yang hadir?",
    },
    answer: {
      ja: "スプリント終了前に増分（Done の成果）をステークホルダーとともに点検する会議。PO・SM・Dev に加え、ステークホルダー（顧客・関係部署）が参加。成果を実演しフィードバックを得て、PB を調整する。1週で最大1時間、4週で最大4時間。",
      en: "A working session at the end of the sprint where the increment is inspected with stakeholders. PO, SM, Developers, plus stakeholders (customers, related teams). Demo results, gather feedback, and adjust the Product Backlog. Up to 1h for 1-week / 4h for 4-week sprints.",
      id: "Sesi kerja di akhir sprint tempat increment diperiksa bersama pemangku kepentingan. PO, SM, Developer, plus pemangku kepentingan (pelanggan, tim terkait). Menunjukkan hasil, mendapatkan umpan balik, dan menyesuaikan Product Backlog. Hingga 1 jam untuk 1 minggu / 4 jam untuk 4 minggu.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "スプリントレトロスペクティブとは？ 誰が参加する？",
      en: "What is the Sprint Retrospective? Who attends?",
      id: "Apa itu Sprint Retrospective? Siapa yang hadir?",
    },
    answer: {
      ja: "スプリント終了後にチームのプロセスと協働を振り返り改善する会議。PO・SM・Dev が参加（通常ステークホルダーは不参加）。KPT（Keep/Problem/Try）で継続する良い取り組み、改善すべき問題、次に試すアクションを決める。1週で最大45分、4週で最大3時間。",
      en: "A working session after the Sprint for the team to inspect and adapt its process and collaboration. PO, SM, Developers attend (typically no stakeholders). Use KPT (Keep/Problem/Try) to agree on what to keep, problems to fix, and actions to try. Up to 45min for 1-week / 3h for 4-week sprints.",
      id: "Sesi kerja setelah Sprint bagi tim untuk memeriksa dan menyesuaikan proses serta kolaborasinya. PO, SM, Developer hadir (biasanya tanpa pemangku kepentingan). Gunakan KPT (Keep/Problem/Try) untuk menyepakati apa yang dipertahankan, masalah yang harus diperbaiki, dan tindakan yang akan dicoba. Hingga 45 menit untuk 1 minggu / 3 jam untuk 4 minggu.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "プロダクトバックログリファインメントとは？ 誰が参加する？",
      en: "What is Product Backlog Refinement? Who attends?",
      id: "Apa itu Product Backlog Refinement? Siapa yang hadir?",
    },
    answer: {
      ja: "PBI の詳細化・分解・見積もり・並び替えを継続的に行う活動。PO 主導で Dev が参加、必要に応じ SM も参加。Kanflow では Not Ready → Ready への遷移がリファインメントの成果物。一般的にスプリント容量の 10% 以下で実施。",
      en: "An ongoing activity to add detail, break down, estimate, and order PBIs. Led by PO with Developers; SM joins as needed. In Kanflow, moving a PBI from Not Ready to Ready is the outcome of refinement. Typically kept to ≤10% of sprint capacity.",
      id: "Aktivitas berkelanjutan untuk menambah detail, memecah, mengestimasi, dan mengurutkan PBI. Dipimpin oleh PO bersama Developer; SM bergabung sesuai kebutuhan. Di Kanflow, memindahkan PBI dari Not Ready ke Ready adalah hasil dari refinement. Biasanya dijaga ≤10% dari kapasitas sprint.",
    },
    category: "backlog",
    projectTypes: ["software"],
  },
]
