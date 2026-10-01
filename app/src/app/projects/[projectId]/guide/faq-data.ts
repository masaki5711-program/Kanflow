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
  basic: "bg-slate-100 text-slate-700",
  icebox: "bg-cyan-100 text-cyan-700",
  backlog:
    "bg-violet-100 text-violet-700",
  sprint:
    "bg-orange-100 text-orange-700",
  other: "bg-teal-100 text-teal-700",
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
  {
    question: {
      ja: "「これが終わらないと始められない」PBI の順番を設定するには？",
      en: "How do I say one PBI cannot start until another is finished?",
      id: "Bagaimana mengatur PBI yang baru bisa dimulai setelah PBI lain selesai?",
    },
    answer: {
      ja: "PBI の詳細を開き、下部の「依存関係（作業の順番）」で「先に終わらせる PBI を追加」から選びます。バックログのカードに「#12 の完了待ち」が表示され、待っている PBI より上に並べると警告と「下へ移動」ボタンが出ます。スプリントへ追加する画面でも完了待ちの PBI が分かります。",
      en: "Open the PBI and, under \"Dependencies (work order)\", use \"Add a PBI to finish first\". The backlog card then shows \"Waiting for #12\"; if it is ranked above the PBI it waits for, a warning with a \"Move below\" button appears. The add-to-sprint picker flags waiting PBIs too.",
      id: "Buka PBI, lalu di \"Ketergantungan (urutan kerja)\" pilih \"Tambah PBI yang diselesaikan lebih dulu\". Kartu backlog akan menampilkan \"Menunggu #12\"; jika diurutkan di atas PBI yang ditunggunya, muncul peringatan dengan tombol \"Pindahkan ke bawah\". Pemilih PBI saat menambah ke sprint juga menandai PBI yang masih menunggu.",
    },
    category: "backlog",
  },
  {
    question: {
      ja: "全体計画で項目どうしの依存関係（矢印）を描くには？",
      en: "How do I draw dependency arrows in the master plan?",
      id: "Bagaimana menggambar panah ketergantungan di rencana induk?",
    },
    answer: {
      ja: "バーにマウスを乗せると右端に ● が出ます。● を後に行う項目のバーまでドラッグして離すと矢印でつながります（循環や親子関係など設定できない相手は黄色で表示されます）。矢印をクリックすると削除できます。バーを選ぶと、その前後のつながりが青く強調されます。",
      en: "Hover a bar to show the ● at its end. Drag the ● onto the bar of the item that follows and release to connect them (targets that cannot be linked, such as a cycle or parent/child, turn amber). Click an arrow to remove it. Selecting a bar highlights its chain in blue.",
      id: "Arahkan kursor ke bar untuk menampilkan ● di ujungnya. Seret ● ke bar item berikutnya lalu lepaskan untuk menghubungkannya (target yang tidak dapat dihubungkan, seperti siklus atau induk/anak, berwarna kuning). Klik panah untuk menghapusnya. Memilih bar menyorot rantainya dengan warna biru.",
    },
    category: "other",
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
      ja: "1. スプリント (Sprint) とは？",
      en: "1. What is a Sprint?",
      id: "1. Apa itu Sprint?",
    },
    answer: {
      ja: "すべてのスクラムイベントを包み込む「入れ物」となる期間そのもの。通常1週間〜1ヶ月の固定された期間（タイムボックス）で設定し、この期間内に価値ある成果物を生み出します。\n\n【参加者】スクラムチーム全体（PO・SM・開発者）。\n\n【目的】プロダクトゴールに向けて、検証可能な成果物を作成し、検査と適応のサイクルを回すこと。",
      en: "The container that holds all the other Scrum events — a fixed timebox, typically 1 week to 1 month, in which the team delivers a valuable increment.\n\nAttendees: the whole Scrum Team (PO, SM, Developers).\n\nPurpose: produce an inspectable increment toward the Product Goal and run the inspect-and-adapt cycle.",
      id: "Wadah yang menampung semua acara Scrum lainnya — timebox tetap, biasanya 1 minggu hingga 1 bulan, di mana tim menghasilkan increment yang berharga.\n\nPeserta: seluruh Scrum Team (PO, SM, Developer).\n\nTujuan: menghasilkan increment yang dapat diperiksa menuju Product Goal dan menjalankan siklus inspect-and-adapt.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "2. スプリントプランニング (Sprint Planning) とは？",
      en: "2. What is Sprint Planning?",
      id: "2. Apa itu Sprint Planning?",
    },
    answer: {
      ja: "スプリントの開始時に行い、そのスプリントで「なぜ」「何を」「どのように」行うかを計画するイベント。\n\n【参加者】スクラムチーム全体（PO・SM・開発者）。\n※必要に応じて特定の専門知識を持つ外部の人（社内の有識者など）をアドバイザーとして招待することも可能。\n\n【目的】\n・スプリントゴール（このスプリントで達成すべき目的）の定義\n・スプリントで取り組むバックログアイテムの選択\n・それらをどのように完了させるかの作業計画の作成",
      en: "Held at the start of the Sprint. Plans the Why, What, and How of the Sprint.\n\nAttendees: the whole Scrum Team (PO, SM, Developers). Subject-matter experts can be invited as advisors when needed.\n\nPurpose:\n- Define the Sprint Goal (the outcome this Sprint must achieve).\n- Select the backlog items to tackle this Sprint.\n- Build the plan for how to complete them.",
      id: "Diadakan di awal Sprint. Merencanakan Mengapa, Apa, dan Bagaimana untuk Sprint tersebut.\n\nPeserta: seluruh Scrum Team (PO, SM, Developer). Pakar dari luar tim (ahli internal, dsb.) dapat diundang sebagai penasihat bila diperlukan.\n\nTujuan:\n- Menentukan Sprint Goal (hasil yang harus dicapai Sprint ini).\n- Memilih item backlog untuk dikerjakan di Sprint ini.\n- Menyusun rencana bagaimana menyelesaikannya.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "3. デイリースクラム (Daily Scrum) とは？",
      en: "3. What is the Daily Scrum?",
      id: "3. Apa itu Daily Scrum?",
    },
    answer: {
      ja: "毎日同じ時間・同じ場所で開催される、最大15分の短いミーティング。\n\n【参加者】開発者。\n※POやSMが実務担当者（開発者）も兼任している場合は、開発者として参加。兼任していない場合、POやSMは原則として参加必須ではない（オブザーバーとして聞くことは可能）。\n\n【目的】スプリントゴールに対する進捗を検査し、今後の24時間の作業計画を調整・適応させること。日々の障害や課題を早期に発見する場でもあります。",
      en: "A short meeting — at most 15 minutes — held every day at the same time and place.\n\nAttendees: the Developers.\nIf the PO or SM is also acting as a Developer, they attend in the Developer role. Otherwise they are not required — they may listen in as observers.\n\nPurpose: inspect progress toward the Sprint Goal and adapt the plan for the next 24 hours. Also the place to surface impediments early.",
      id: "Pertemuan singkat — maksimal 15 menit — diadakan setiap hari pada waktu dan tempat yang sama.\n\nPeserta: Developer.\nJika PO atau SM juga berperan sebagai Developer, mereka hadir sebagai Developer. Jika tidak, kehadiran PO/SM tidak wajib — mereka boleh menyimak sebagai pengamat.\n\nTujuan: memeriksa kemajuan menuju Sprint Goal dan menyesuaikan rencana 24 jam berikutnya. Juga tempat memunculkan hambatan sejak dini.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "4. スプリントレビュー (Sprint Review) とは？",
      en: "4. What is the Sprint Review?",
      id: "4. Apa itu Sprint Review?",
    },
    answer: {
      ja: "スプリントの終盤に開催され、スプリントの成果（作成されたインクリメント）を検査し、今後の方向性を適応させるためのイベント。単なる「進捗報告会」ではなく、参加者全員での**ワーキングセッション**。\n\n【参加者】スクラムチーム全体 ＋ 主要なステークホルダー（関係者・顧客・経営層など）。\n※POが適切なステークホルダーを招待する。\n\n【目的】スプリントの結果をデモンストレーションし、ステークホルダーからのフィードバックを得ること。市場や環境の変化について話し合い、プロダクトバックログ（今後の予定）を更新すること。",
      en: "Held near the end of the Sprint to inspect the increment and adapt the direction going forward. Not a status meeting — it is a working session with everyone.\n\nAttendees: the whole Scrum Team plus key stakeholders (partners, customers, executives, etc.). The PO invites the right stakeholders.\n\nPurpose: demonstrate the Sprint outcome and gather stakeholder feedback. Discuss market/environmental changes and update the Product Backlog for what comes next.",
      id: "Diadakan menjelang akhir Sprint untuk memeriksa increment dan menyesuaikan arah ke depan. Bukan rapat pelaporan — ini adalah sesi kerja bersama.\n\nPeserta: seluruh Scrum Team ditambah pemangku kepentingan kunci (mitra, pelanggan, eksekutif, dll.). PO mengundang pemangku kepentingan yang tepat.\n\nTujuan: mendemonstrasikan hasil Sprint dan mendapatkan umpan balik pemangku kepentingan. Mendiskusikan perubahan pasar/lingkungan dan memperbarui Product Backlog untuk rencana berikutnya.",
    },
    category: "sprint",
    projectTypes: ["software"],
  },
  {
    question: {
      ja: "5. スプリントレトロスペクティブ (Sprint Retrospective / ふりかえり) とは？",
      en: "5. What is the Sprint Retrospective?",
      id: "5. Apa itu Sprint Retrospective?",
    },
    answer: {
      ja: "スプリントの最後（スプリントレビューの後）に行う、チーム自身のための改善会議。\n\n【参加者】スクラムチーム全体（PO・SM・開発者）。\n\n【目的】人・関係性・プロセス・ツールの観点から、今回のスプリントがどのように進んだかを検査すること。上手くいったこと、課題だったことを洗い出し、次のスプリントに向けて品質や効果を高めるための**具体的な改善アクション**を計画すること。",
      en: "The team's improvement meeting at the end of the Sprint, after the Sprint Review.\n\nAttendees: the whole Scrum Team (PO, SM, Developers).\n\nPurpose: inspect how the Sprint went across people, relationships, process, and tools. Surface what worked and what didn't, then agree on concrete improvement actions to raise quality and effectiveness in the next Sprint.",
      id: "Rapat perbaikan oleh tim sendiri di akhir Sprint, setelah Sprint Review.\n\nPeserta: seluruh Scrum Team (PO, SM, Developer).\n\nTujuan: memeriksa bagaimana Sprint berjalan dari aspek orang, hubungan, proses, dan alat. Memunculkan apa yang berhasil dan apa yang menjadi masalah, lalu menyepakati aksi perbaikan konkret untuk meningkatkan kualitas dan efektivitas di Sprint berikutnya.",
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
