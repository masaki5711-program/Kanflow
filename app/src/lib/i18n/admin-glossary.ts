/**
 * i18n domain: Admin: translation glossary + translation queue.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AdminGlossaryTranslations {
  // Admin: translation glossary
  glossaryAdminMenu: string
  glossaryTitle: string
  glossaryHelp: string
  glossaryNotationTitle: string
  glossaryNotationBasic: string
  glossaryNotationExplicit: string
  glossaryNotationOverwrite: string
  glossaryNotationReverse: string
  glossaryDirection: string
  glossaryTabJa: string
  glossaryTabId: string
  glossaryLangJa: string
  glossaryLangId: string
  glossarySearch: string
  glossarySearchPlaceholder: string
  glossarySummary: string
  glossaryRetranslateAll: string
  glossaryColTerm: string
  glossaryColTranslation: string
  glossaryColNote: string
  glossaryColUsage: string
  glossaryColActions: string
  glossaryAdd: string
  glossaryAdded: string
  glossarySaved: string
  glossaryDeleted: string
  glossaryLoading: string
  glossaryEmpty: string
  glossaryRetranslateOne: string
  glossaryRetranslateOneHint: string
  glossaryRetranslateQueued: string
  glossaryDeleteConfirm: string
  glossaryAutoReverseHint: string
  glossaryPrev: string
  glossaryNext: string
  // Admin: translation queue
  translationsAdminMenu: string
  translationsTitle: string
  translationsHelp: string
  translationsPending: string
  translationsRunning: string
  translationsDone: string
  translationsFailed: string
  translationsWorker: string
  translationsWorkerIdle: string
  translationsWorkerBusy: string
  translationsWorkerDisabled: string
  translationsWorkerExternal: string
  translationsWorkerExternalNote: string
  translationsWorkerNotStarted: string
  translationsBackgroundActive: string
  translationsOllama: string
  translationsOllamaOk: string
  translationsOllamaNg: string
  translationsModel: string
  translationsLastError: string
  translationsNoError: string
  translationsRetryFailed: string
  translationsRetried: string
  translationsRefresh: string
}

export const ja: AdminGlossaryTranslations = {
  glossaryAdminMenu: "翻訳辞書",
  glossaryTitle: "翻訳辞書",
  glossaryHelp: "ここに登録した用語は、AI 翻訳で必ずこの訳語が使われます。誰かが登録・訂正すると全員の翻訳に反映されます。",
  glossaryNotationTitle: "入力記法",
  glossaryNotationBasic: "任意の入力欄で、用語の直後に訳語を書くと登録されます（保存される原文は用語のみ）。",
  glossaryNotationExplicit: "用語の境界が曖昧なときは明示形を使います。",
  glossaryNotationOverwrite: "同じ用語を再登録すると訳語が上書きされます。",
  glossaryNotationReverse: "反対方向（訳語→用語）も自動で登録されます（⇄ 印）。手で編集した行は上書きされません。",
  glossaryDirection: "方向",
  glossaryTabJa: "日本語 → インドネシア語",
  glossaryTabId: "インドネシア語 → 日本語",
  glossaryLangJa: "日本語",
  glossaryLangId: "インドネシア語",
  glossarySearch: "検索",
  glossarySearchPlaceholder: "用語・訳語で検索",
  glossarySummary: "{total} 件",
  glossaryRetranslateAll: "辞書の用語を含む文をすべて再翻訳",
  glossaryColTerm: "用語",
  glossaryColTranslation: "訳語",
  glossaryColNote: "メモ",
  glossaryColUsage: "使用回数",
  glossaryColActions: "操作",
  glossaryAdd: "追加",
  glossaryAdded: "登録しました",
  glossarySaved: "保存しました",
  glossaryDeleted: "削除しました",
  glossaryLoading: "読み込み中…",
  glossaryEmpty: "登録された用語はありません",
  glossaryRetranslateOne: "再翻訳",
  glossaryRetranslateOneHint: "この用語を含む文を次のアイドル時に再翻訳します",
  glossaryRetranslateQueued: "{count} 件を再翻訳キューに戻しました",
  glossaryDeleteConfirm: "「{term}」を辞書から削除しますか？",
  glossaryAutoReverseHint: "反対方向から自動登録された行",
  glossaryPrev: "前へ",
  glossaryNext: "次へ",
  translationsAdminMenu: "翻訳キュー",
  translationsTitle: "バックグラウンド翻訳の状況",
  translationsHelp: "ユーザー向けの AI 処理（チャット・分析・今すぐ翻訳）が動いていない間だけ、裏で 1 件ずつ翻訳します。",
  translationsPending: "待機",
  translationsRunning: "実行中",
  translationsDone: "完了",
  translationsFailed: "失敗",
  translationsWorker: "ワーカー",
  translationsWorkerIdle: "アイドル（翻訳できる状態）",
  translationsWorkerBusy: "ユーザー向け AI 処理中のため一時停止",
  translationsWorkerDisabled: "無効",
  translationsWorkerExternal: "ワーカープロセスで実行（別プロセス）",
  translationsWorkerExternalNote: "翻訳は Web サーバーとは別のワーカープロセス（kanflow-worker サービス）で実行されます。この画面の件数が減っていれば正常に動作しています。",
  translationsWorkerNotStarted: "この Web プロセスでは起動していません",
  translationsBackgroundActive: "バックグラウンド翻訳 実行中",
  translationsOllama: "Ollama",
  translationsOllamaOk: "接続 OK",
  translationsOllamaNg: "接続できません",
  translationsModel: "モデル",
  translationsLastError: "最後のエラー",
  translationsNoError: "エラーはありません",
  translationsRetryFailed: "失敗した翻訳を再実行",
  translationsRetried: "{count} 件を再実行キューに戻しました",
  translationsRefresh: "更新",
}

export const en: AdminGlossaryTranslations = {
  glossaryAdminMenu: "Glossary",
  glossaryTitle: "Translation glossary",
  glossaryHelp: "Terms registered here are always translated with the given wording by the AI. Any registration or correction applies to everyone's translations.",
  glossaryNotationTitle: "Input notation",
  glossaryNotationBasic: "In any text field, write the translation right after the term to register it (only the term is saved in the text).",
  glossaryNotationExplicit: "Use the explicit form when the term boundary is ambiguous.",
  glossaryNotationOverwrite: "Registering the same term again overwrites the translation.",
  glossaryNotationReverse: "The reverse direction (translation → term) is registered automatically (⇄). Hand-edited rows are never overwritten.",
  glossaryDirection: "Direction",
  glossaryTabJa: "Japanese → Indonesian",
  glossaryTabId: "Indonesian → Japanese",
  glossaryLangJa: "Japanese",
  glossaryLangId: "Indonesian",
  glossarySearch: "Search",
  glossarySearchPlaceholder: "Search term or translation",
  glossarySummary: "{total} entries",
  glossaryRetranslateAll: "Re-translate every text containing glossary terms",
  glossaryColTerm: "Term",
  glossaryColTranslation: "Translation",
  glossaryColNote: "Note",
  glossaryColUsage: "Uses",
  glossaryColActions: "Actions",
  glossaryAdd: "Add",
  glossaryAdded: "Registered",
  glossarySaved: "Saved",
  glossaryDeleted: "Deleted",
  glossaryLoading: "Loading…",
  glossaryEmpty: "No glossary entries yet",
  glossaryRetranslateOne: "Re-translate",
  glossaryRetranslateOneHint: "Re-translate texts containing this term at the next idle moment",
  glossaryRetranslateQueued: "{count} text(s) queued for re-translation",
  glossaryDeleteConfirm: "Delete \"{term}\" from the glossary?",
  glossaryAutoReverseHint: "Auto-registered from the opposite direction",
  glossaryPrev: "Previous",
  glossaryNext: "Next",
  translationsAdminMenu: "Translation queue",
  translationsTitle: "Background translation status",
  translationsHelp: "Texts are translated one at a time in the background, only while no user-facing AI request (chat, analysis, translate now) is running.",
  translationsPending: "Pending",
  translationsRunning: "Running",
  translationsDone: "Done",
  translationsFailed: "Failed",
  translationsWorker: "Worker",
  translationsWorkerIdle: "Idle (ready to translate)",
  translationsWorkerBusy: "Paused: a user-facing AI request is running",
  translationsWorkerDisabled: "Disabled",
  translationsWorkerExternal: "Runs in the worker process (separate process)",
  translationsWorkerExternalNote: "Translation runs in a separate worker process (kanflow-worker service), not in this web server. If the pending count goes down, it is working normally.",
  translationsWorkerNotStarted: "Not started in this web process",
  translationsBackgroundActive: "Background translation running",
  translationsOllama: "Ollama",
  translationsOllamaOk: "Connected",
  translationsOllamaNg: "Unreachable",
  translationsModel: "Model",
  translationsLastError: "Last error",
  translationsNoError: "No errors",
  translationsRetryFailed: "Retry failed translations",
  translationsRetried: "{count} row(s) put back into the queue",
  translationsRefresh: "Refresh",
}

export const id: AdminGlossaryTranslations = {
  glossaryAdminMenu: "Kamus terjemahan",
  glossaryTitle: "Kamus terjemahan",
  glossaryHelp: "Istilah yang terdaftar di sini selalu diterjemahkan AI dengan kata yang ditentukan. Pendaftaran atau koreksi siapa pun berlaku untuk terjemahan semua orang.",
  glossaryNotationTitle: "Notasi input",
  glossaryNotationBasic: "Di kolom teks mana pun, tulis terjemahan tepat setelah istilah untuk mendaftarkannya (hanya istilah yang disimpan dalam teks).",
  glossaryNotationExplicit: "Gunakan bentuk eksplisit bila batas istilah tidak jelas.",
  glossaryNotationOverwrite: "Mendaftarkan istilah yang sama lagi akan menimpa terjemahannya.",
  glossaryNotationReverse: "Arah sebaliknya (terjemahan → istilah) didaftarkan otomatis (⇄). Baris yang diedit manual tidak ditimpa.",
  glossaryDirection: "Arah",
  glossaryTabJa: "Jepang → Indonesia",
  glossaryTabId: "Indonesia → Jepang",
  glossaryLangJa: "Jepang",
  glossaryLangId: "Indonesia",
  glossarySearch: "Cari",
  glossarySearchPlaceholder: "Cari istilah atau terjemahan",
  glossarySummary: "{total} entri",
  glossaryRetranslateAll: "Terjemahkan ulang semua teks yang memuat istilah kamus",
  glossaryColTerm: "Istilah",
  glossaryColTranslation: "Terjemahan",
  glossaryColNote: "Catatan",
  glossaryColUsage: "Dipakai",
  glossaryColActions: "Aksi",
  glossaryAdd: "Tambah",
  glossaryAdded: "Terdaftar",
  glossarySaved: "Tersimpan",
  glossaryDeleted: "Terhapus",
  glossaryLoading: "Memuat…",
  glossaryEmpty: "Belum ada entri kamus",
  glossaryRetranslateOne: "Terjemahkan ulang",
  glossaryRetranslateOneHint: "Terjemahkan ulang teks yang memuat istilah ini saat AI menganggur berikutnya",
  glossaryRetranslateQueued: "{count} teks dimasukkan ke antrean terjemahan ulang",
  glossaryDeleteConfirm: "Hapus \"{term}\" dari kamus?",
  glossaryAutoReverseHint: "Didaftarkan otomatis dari arah sebaliknya",
  glossaryPrev: "Sebelumnya",
  glossaryNext: "Berikutnya",
  translationsAdminMenu: "Antrean terjemahan",
  translationsTitle: "Status terjemahan latar belakang",
  translationsHelp: "Teks diterjemahkan satu per satu di latar belakang, hanya saat tidak ada permintaan AI dari pengguna (chat, analisis, terjemahkan sekarang) yang berjalan.",
  translationsPending: "Menunggu",
  translationsRunning: "Berjalan",
  translationsDone: "Selesai",
  translationsFailed: "Gagal",
  translationsWorker: "Worker",
  translationsWorkerIdle: "Menganggur (siap menerjemahkan)",
  translationsWorkerBusy: "Dijeda: permintaan AI pengguna sedang berjalan",
  translationsWorkerDisabled: "Nonaktif",
  translationsWorkerExternal: "Berjalan di proses worker (proses terpisah)",
  translationsWorkerExternalNote: "Terjemahan berjalan di proses worker terpisah (layanan kanflow-worker), bukan di server web ini. Jika jumlah yang menunggu berkurang, worker berjalan normal.",
  translationsWorkerNotStarted: "Tidak dijalankan di proses web ini",
  translationsBackgroundActive: "Terjemahan latar belakang berjalan",
  translationsOllama: "Ollama",
  translationsOllamaOk: "Terhubung",
  translationsOllamaNg: "Tidak dapat dihubungi",
  translationsModel: "Model",
  translationsLastError: "Kesalahan terakhir",
  translationsNoError: "Tidak ada kesalahan",
  translationsRetryFailed: "Ulangi terjemahan yang gagal",
  translationsRetried: "{count} baris dikembalikan ke antrean",
  translationsRefresh: "Segarkan",
}
