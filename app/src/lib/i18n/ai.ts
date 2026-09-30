/**
 * i18n domain: AI chat and AI assist buttons.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AiTranslations {
  chatTitle: string
  chatPlaceholder: string
  chatSend: string
  chatThinking: string
  chatClear: string
  chatCancel: string
  chatEmpty: string
  chatError: string
  chatContextNote: string
  chatInputLabel: string
  chatConversationLabel: string
  chatStopped: string
  chatYou: string
  chatAssistant: string
  aiThinking: string
  aiCopy: string
  aiFailed: string
  aiResultDisclaimer: string
  aiInvestReview: string
  aiInvestRunning: string
  aiInvestTitle: string
  aiRetroSynthesis: string
  aiRetroTitle: string
  aiAddToTry: string
  aiAddToTryDone: string
  aiProgressReport: string
  aiProgressReportTitle: string
  aiGeneratePbiDraft: string
  aiPbiDraftTitle: string
  aiUseThisDraft: string
  aiPbiDraftRationale: string
  aiAddDraftToIcebox: string
  aiDraftAddedToIcebox: string
  aiGenerate: string
  aiGenerating: string
  aiGenerateNeedsInitiative: string
}

export const ja: AiTranslations = {
  chatTitle: "AI チャット",
  chatPlaceholder: "プロジェクトについて質問してください…",
  chatSend: "送信",
  chatThinking: "考え中…",
  chatClear: "履歴をクリア",
  chatCancel: "停止",
  chatEmpty: "プロジェクトの進捗・進め方・添付ファイルについて自由に質問できます。",
  chatError: "応答の取得に失敗しました",
  chatContextNote: "ローカル LLM で動作。会話履歴はこのページを離れるとリセットされます。",
  chatInputLabel: "メッセージ入力",
  chatConversationLabel: "AI チャットの会話",
  chatStopped: "生成を停止しました",
  chatYou: "あなた",
  chatAssistant: "AI",
  aiThinking: "AI が分析中…",
  aiCopy: "コピー",
  aiFailed: "AI の応答取得に失敗しました",
  aiResultDisclaimer: "AI の提案です。最終判断は人間が行ってください。",
  aiInvestReview: "INVEST 評価",
  aiInvestRunning: "評価中…",
  aiInvestTitle: "INVEST 原則による PBI 評価",
  aiRetroSynthesis: "振り返りサマリ生成",
  aiRetroTitle: "スプリント振り返りサマリ",
  aiAddToTry: "Try 欄に追記",
  aiAddToTryDone: "追記しました",
  aiProgressReport: "進捗レポート生成",
  aiProgressReportTitle: "ステークホルダー向け進捗レポート",
  aiGeneratePbiDraft: "PBI 草案生成",
  aiPbiDraftTitle: "PBI 草案候補",
  aiUseThisDraft: "この案で作成",
  aiPbiDraftRationale: "この案のポイント",
  aiAddDraftToIcebox: "IceBox に追加",
  aiDraftAddedToIcebox: "IceBox に追加済み ✓",
  aiGenerate: "AI生成",
  aiGenerating: "生成中…",
  aiGenerateNeedsInitiative: "先に施策（タイトル）を入力してください",
}

export const en: AiTranslations = {
  chatTitle: "AI Chat",
  chatPlaceholder: "Ask anything about this project…",
  chatSend: "Send",
  chatThinking: "Thinking…",
  chatClear: "Clear history",
  chatCancel: "Stop",
  chatEmpty: "Ask about progress, planning, or attached files for this project.",
  chatError: "Failed to get a response",
  chatContextNote: "Powered by local LLM. Conversation resets when you leave this page.",
  chatInputLabel: "Message",
  chatConversationLabel: "AI chat conversation",
  chatStopped: "Generation stopped",
  chatYou: "You",
  chatAssistant: "AI",
  aiThinking: "AI is analyzing…",
  aiCopy: "Copy",
  aiFailed: "Failed to get AI response",
  aiResultDisclaimer: "AI-generated suggestion. Human review recommended.",
  aiInvestReview: "INVEST Review",
  aiInvestRunning: "Reviewing…",
  aiInvestTitle: "PBI INVEST Review",
  aiRetroSynthesis: "Retrospective Summary",
  aiRetroTitle: "Sprint Retrospective Summary",
  aiAddToTry: "Add to Try",
  aiAddToTryDone: "Added",
  aiProgressReport: "Progress Report",
  aiProgressReportTitle: "Stakeholder Progress Report",
  aiGeneratePbiDraft: "Generate PBI Draft",
  aiPbiDraftTitle: "PBI Draft Candidates",
  aiUseThisDraft: "Use this draft",
  aiPbiDraftRationale: "Why this draft",
  aiAddDraftToIcebox: "Add to IceBox",
  aiDraftAddedToIcebox: "Added to IceBox ✓",
  aiGenerate: "AI Generate",
  aiGenerating: "Generating…",
  aiGenerateNeedsInitiative: "Enter the initiative (title) first",
}

export const id: AiTranslations = {
  chatTitle: "Chat AI",
  chatPlaceholder: "Tanyakan apa saja tentang proyek ini…",
  chatSend: "Kirim",
  chatThinking: "Berpikir…",
  chatClear: "Hapus riwayat",
  chatCancel: "Hentikan",
  chatEmpty: "Tanyakan tentang progres, perencanaan, atau lampiran proyek ini.",
  chatError: "Gagal mendapatkan respons",
  chatContextNote: "Didukung oleh LLM lokal. Percakapan akan terhapus saat meninggalkan halaman.",
  chatInputLabel: "Pesan",
  chatConversationLabel: "Percakapan obrolan AI",
  chatStopped: "Pembuatan jawaban dihentikan",
  chatYou: "Anda",
  chatAssistant: "AI",
  aiThinking: "AI sedang menganalisis…",
  aiCopy: "Salin",
  aiFailed: "Gagal mendapatkan respons AI",
  aiResultDisclaimer: "Saran AI. Tinjauan manual disarankan.",
  aiInvestReview: "Tinjauan INVEST",
  aiInvestRunning: "Meninjau…",
  aiInvestTitle: "Tinjauan PBI dengan Prinsip INVEST",
  aiRetroSynthesis: "Ringkasan Retrospektif",
  aiRetroTitle: "Ringkasan Retrospektif Sprint",
  aiAddToTry: "Tambahkan ke Try",
  aiAddToTryDone: "Ditambahkan",
  aiProgressReport: "Laporan Progres",
  aiProgressReportTitle: "Laporan Progres untuk Stakeholder",
  aiGeneratePbiDraft: "Buat Draf PBI",
  aiPbiDraftTitle: "Kandidat Draf PBI",
  aiUseThisDraft: "Gunakan draf ini",
  aiPbiDraftRationale: "Alasan draf ini",
  aiAddDraftToIcebox: "Tambahkan ke IceBox",
  aiDraftAddedToIcebox: "Sudah di IceBox ✓",
  aiGenerate: "Buat dengan AI",
  aiGenerating: "Sedang membuat…",
  aiGenerateNeedsInitiative: "Isi inisiatif (judul) terlebih dahulu",
}
