/**
 * i18n domain: personal access tokens — `/me` token section (`me/api-tokens-section.tsx`)
 * and the admin token list (`admin/api-tokens/`).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface ApiTokensTranslations {
  apiTokenSectionTitle: string
  apiTokenSectionHint: string
  apiTokenDocsLink: string
  /** /me API usage help (base URL + example request). */
  apiTokenUsageBaseUrl: string
  apiTokenUsageAuth: string
  apiTokenUsageExample: string
  apiTokenUsageEndpoints: string
  /** /me: connecting Claude Code to the Kanflow MCP (`/api/mcp`) with the agent-model setup script. */
  apiTokenUsageMcpUrl: string
  apiTokenUsageScopes: string
  apiTokenUsageMcpSetup: string
  apiTokenUsageMcpAfter: string
  apiTokenUsageNeverPaste: string
  apiTokenDisabled: string
  apiTokenName: string
  apiTokenNamePlaceholder: string
  apiTokenExpiry: string
  apiTokenExpiryDays: string
  apiTokenExpiryNone: string
  apiTokenCreate: string
  apiTokenCreated: string
  apiTokenCreateFailed: string
  apiTokenLimitReached: string
  apiTokenShownOnce: string
  apiTokenCopy: string
  apiTokenCopied: string
  apiTokenCopyFailed: string
  apiTokenDone: string
  apiTokenEmpty: string
  apiTokenListLabel: string
  apiTokenColPrefix: string
  apiTokenColCreated: string
  apiTokenColLastUsed: string
  apiTokenColExpires: string
  apiTokenNever: string
  apiTokenNoExpiry: string
  apiTokenStateExpired: string
  apiTokenRevoke: string
  apiTokenRevokeTitle: string
  apiTokenRevokeMessage: string
  apiTokenRevoked: string
  apiTokenRevokeFailed: string
  apiTokenLoadFailed: string
  apiTokenAdminMenu: string
  apiTokenAdminTitle: string
  apiTokenAdminDescription: string
  apiTokenAdminEmpty: string
  apiTokenColOwner: string
  apiTokenOwnerInactive: string
  apiTokenAdminRevokeMessage: string
  /** Token scopes (create form) and project restriction. */
  apiTokenScopes: string
  apiTokenScopesHint: string
  apiTokenPresetReadOnly: string
  apiTokenPresetDeveloper: string
  apiTokenPresetAll: string
  apiTokenScopeRead: string
  apiTokenScopeBacklogWrite: string
  apiTokenScopeBacklogReorder: string
  apiTokenScopeSprintWrite: string
  apiTokenScopeTaskWrite: string
  apiTokenScopeCommentWrite: string
  apiTokenScopeIceboxWrite: string
  apiTokenScopeDailyWrite: string
  apiTokenProjects: string
  apiTokenProjectsAll: string
  apiTokenProjectsSelected: string
  apiTokenProjectsPickOne: string
  apiTokenProjectsEmpty: string
  apiTokenProjectCount: string
}

export const ja: ApiTokensTranslations = {
  apiTokenSectionTitle: "個人アクセストークン",
  apiTokenSectionHint: "REST API（/api/v1）や Claude Code（Kanflow MCP）から Kanflow を使うためのトークンです。あなたの権限で動くので、第三者に渡さないでください。",
  apiTokenDocsLink: "API の使い方",
  apiTokenUsageBaseUrl: "ベース URL",
  apiTokenUsageAuth: "トークンを Authorization ヘッダー（Bearer）に付けて呼び出します。応答は JSON です。読み取りはどのトークンでもでき、書き込み（PBI・スプリント・タスク・コメントなど）はトークンのスコープと、そのプロジェクトでのあなたの役割の両方が許す範囲だけ行えます。",
  apiTokenUsageExample: "例: 閲覧できるプロジェクトの一覧を取得",
  apiTokenUsageEndpoints: "主なエンドポイント: 読み取り — /me、/projects、/projects/{id}/backlog、/projects/{id}/sprints、/projects/{id}/plan。書き込み — /projects/{id}/backlog、/projects/{id}/sprints、/projects/{id}/sprints/{sprintId}/tasks、/projects/{id}/comments など（POST / PATCH。削除はできません）",
  apiTokenUsageMcpUrl: "Claude Code（MCP）の接続先 URL",
  apiTokenUsageScopes: "Claude Code で開発する Developer は「Developer 向け」プリセット、PBI やスプリントも Claude Code から扱う PO / SM は「PO / SM 向け（すべて）」で発行してください。特定のプロジェクトだけで使うなら「選んだプロジェクトだけ」に限定できます。",
  apiTokenUsageMcpSetup: "エージェントモデルのリポジトリで次のコマンドを実行し、表示された入力欄にトークンを貼り付けます（入力内容は画面に表示されません）。",
  apiTokenUsageMcpAfter: "設定したら Claude Code を再起動し、/kanflow status で接続を確認します。Claude Code で /kanflow setup と入力すると、この手順を対話で案内します。",
  apiTokenUsageNeverPaste: "トークンを Claude Code のチャットや、リポジトリ内のファイルに貼り付けないでください。貼ってしまったときは、すぐにここで失効して発行し直してください。",
  apiTokenDisabled: "このサーバーではアクセストークンが無効になっています（管理者にお問い合わせください）。",
  apiTokenName: "名前",
  apiTokenNamePlaceholder: "例: 週次レポート用スクリプト",
  apiTokenExpiry: "有効期限",
  apiTokenExpiryDays: "{days} 日",
  apiTokenExpiryNone: "無期限",
  apiTokenCreate: "トークンを発行",
  apiTokenCreated: "トークンを発行しました",
  apiTokenCreateFailed: "トークンの発行に失敗しました",
  apiTokenLimitReached: "発行できるトークンは最大 {max} 件です。不要なトークンを失効してください。",
  apiTokenShownOnce: "このトークンは今だけ表示されます。安全な場所に保存してください。",
  apiTokenCopy: "コピー",
  apiTokenCopied: "コピーしました",
  apiTokenCopyFailed: "コピーできませんでした。手動で選択してコピーしてください。",
  apiTokenDone: "保存しました",
  apiTokenEmpty: "発行済みのトークンはありません。",
  apiTokenListLabel: "発行済みトークン",
  apiTokenColPrefix: "トークン",
  apiTokenColCreated: "発行日",
  apiTokenColLastUsed: "最終使用",
  apiTokenColExpires: "有効期限",
  apiTokenNever: "未使用",
  apiTokenNoExpiry: "無期限",
  apiTokenStateExpired: "期限切れ",
  apiTokenRevoke: "失効",
  apiTokenRevokeTitle: "トークンを失効しますか？",
  apiTokenRevokeMessage: "「{name}」を失効します。このトークンを使うツールは直ちに利用できなくなります。",
  apiTokenRevoked: "トークンを失効しました",
  apiTokenRevokeFailed: "失効に失敗しました",
  apiTokenLoadFailed: "トークンの読み込みに失敗しました",
  apiTokenAdminMenu: "API トークン",
  apiTokenAdminTitle: "API トークン管理",
  apiTokenAdminDescription: "全ユーザーの失効していないアクセストークンです（期限切れのものも表示）。不審なトークンはここから失効できます。",
  apiTokenAdminEmpty: "失効していないトークンはありません。",
  apiTokenColOwner: "所有者",
  apiTokenOwnerInactive: "無効ユーザー",
  apiTokenAdminRevokeMessage: "{owner} のトークン「{name}」を失効します。",
  apiTokenScopes: "権限（スコープ）",
  apiTokenScopesHint: "チェックした操作だけがこのトークンで行えます。実際に許可されるのは、各プロジェクトでのあなたの役割（PO / SM / Dev）で許される範囲までです。",
  apiTokenPresetReadOnly: "閲覧のみ",
  apiTokenPresetDeveloper: "Developer 向け",
  apiTokenPresetAll: "PO / SM 向け（すべて）",
  apiTokenScopeRead: "閲覧（常に含まれます）",
  apiTokenScopeBacklogWrite: "PBI の作成・編集",
  apiTokenScopeBacklogReorder: "PBI の並べ替え",
  apiTokenScopeSprintWrite: "スプリントの作成・編集・PBI 取り込み",
  apiTokenScopeTaskWrite: "タスクの作成・更新",
  apiTokenScopeCommentWrite: "コメントの書き込み",
  apiTokenScopeIceboxWrite: "アイスボックスへの起票",
  apiTokenScopeDailyWrite: "デイリースクラムの記入",
  apiTokenProjects: "使えるプロジェクト",
  apiTokenProjectsAll: "アクセスできるすべてのプロジェクト",
  apiTokenProjectsSelected: "選んだプロジェクトだけ",
  apiTokenProjectsPickOne: "プロジェクトを 1 つ以上選んでください",
  apiTokenProjectsEmpty: "参加しているプロジェクトがありません",
  apiTokenProjectCount: "{count} プロジェクト限定",
}

export const en: ApiTokensTranslations = {
  apiTokenSectionTitle: "Personal access tokens",
  apiTokenSectionHint: "Tokens let the REST API (/api/v1) and Claude Code (Kanflow MCP) use Kanflow. A token acts with your rights, so never share it.",
  apiTokenDocsLink: "How to use the API",
  apiTokenUsageBaseUrl: "Base URL",
  apiTokenUsageAuth: "Send the token in the Authorization header (Bearer); responses are JSON. Any token can read. Writes (PBIs, sprints, tasks, comments, ...) work only as far as both the token's scopes and your role in the project allow.",
  apiTokenUsageExample: "Example: list the projects you can see",
  apiTokenUsageEndpoints: "Main endpoints: read — /me, /projects, /projects/{id}/backlog, /projects/{id}/sprints, /projects/{id}/plan. Write — /projects/{id}/backlog, /projects/{id}/sprints, /projects/{id}/sprints/{sprintId}/tasks, /projects/{id}/comments and more (POST / PATCH; nothing can be deleted).",
  apiTokenUsageMcpUrl: "Claude Code (MCP) server URL",
  apiTokenUsageScopes: "Developers working in Claude Code: create the token with the \"For developers\" preset. PO / SM who also manage PBIs and sprints from Claude Code: use \"For PO / SM (all)\". To use it in some projects only, choose \"Selected projects only\".",
  apiTokenUsageMcpSetup: "In the agent-model repository, run the command below and paste the token at its prompt (what you type stays hidden).",
  apiTokenUsageMcpAfter: "Then restart Claude Code and check the connection with /kanflow status. Typing /kanflow setup in Claude Code walks you through these steps.",
  apiTokenUsageNeverPaste: "Never paste the token into the Claude Code chat or into a file in a repository. If that happens, revoke it here at once and create a new one.",
  apiTokenDisabled: "Access tokens are disabled on this server (ask an administrator).",
  apiTokenName: "Name",
  apiTokenNamePlaceholder: "e.g. weekly report script",
  apiTokenExpiry: "Expires in",
  apiTokenExpiryDays: "{days} days",
  apiTokenExpiryNone: "Never",
  apiTokenCreate: "Create token",
  apiTokenCreated: "Token created",
  apiTokenCreateFailed: "Could not create the token",
  apiTokenLimitReached: "You can have at most {max} tokens. Revoke one you no longer need.",
  apiTokenShownOnce: "This token is shown only now. Store it somewhere safe.",
  apiTokenCopy: "Copy",
  apiTokenCopied: "Copied",
  apiTokenCopyFailed: "Could not copy. Select the token and copy it manually.",
  apiTokenDone: "I have saved it",
  apiTokenEmpty: "No tokens yet.",
  apiTokenListLabel: "Your tokens",
  apiTokenColPrefix: "Token",
  apiTokenColCreated: "Created",
  apiTokenColLastUsed: "Last used",
  apiTokenColExpires: "Expires",
  apiTokenNever: "Never used",
  apiTokenNoExpiry: "No expiry",
  apiTokenStateExpired: "Expired",
  apiTokenRevoke: "Revoke",
  apiTokenRevokeTitle: "Revoke this token?",
  apiTokenRevokeMessage: "\"{name}\" will be revoked. Tools using it stop working immediately.",
  apiTokenRevoked: "Token revoked",
  apiTokenRevokeFailed: "Could not revoke the token",
  apiTokenLoadFailed: "Could not load the tokens",
  apiTokenAdminMenu: "API tokens",
  apiTokenAdminTitle: "API tokens",
  apiTokenAdminDescription: "Every user's access tokens that have not been revoked (expired ones included). Revoke anything suspicious here.",
  apiTokenAdminEmpty: "No unrevoked tokens.",
  apiTokenColOwner: "Owner",
  apiTokenOwnerInactive: "Inactive user",
  apiTokenAdminRevokeMessage: "The token \"{name}\" of {owner} will be revoked.",
  apiTokenScopes: "Scopes",
  apiTokenScopesHint: "Only the checked actions are possible with this token, and only as far as your role (PO / SM / Dev) in each project allows.",
  apiTokenPresetReadOnly: "Read only",
  apiTokenPresetDeveloper: "For developers",
  apiTokenPresetAll: "For PO / SM (all)",
  apiTokenScopeRead: "Read (always included)",
  apiTokenScopeBacklogWrite: "Create and edit PBIs",
  apiTokenScopeBacklogReorder: "Reorder PBIs",
  apiTokenScopeSprintWrite: "Create and edit sprints, add PBIs",
  apiTokenScopeTaskWrite: "Create and update tasks",
  apiTokenScopeCommentWrite: "Write comments",
  apiTokenScopeIceboxWrite: "Submit Icebox items",
  apiTokenScopeDailyWrite: "Write daily scrums",
  apiTokenProjects: "Projects",
  apiTokenProjectsAll: "Every project you can access",
  apiTokenProjectsSelected: "Selected projects only",
  apiTokenProjectsPickOne: "Select at least one project",
  apiTokenProjectsEmpty: "You are not in any project",
  apiTokenProjectCount: "Limited to {count} project(s)",
}

export const id: ApiTokensTranslations = {
  apiTokenSectionTitle: "Token akses pribadi",
  apiTokenSectionHint: "Token dipakai REST API (/api/v1) dan Claude Code (Kanflow MCP) untuk menggunakan Kanflow. Token bertindak dengan hak Anda, jadi jangan dibagikan.",
  apiTokenDocsLink: "Cara menggunakan API",
  apiTokenUsageBaseUrl: "URL dasar",
  apiTokenUsageAuth: "Kirim token di header Authorization (Bearer); responsnya berupa JSON. Semua token dapat membaca. Penulisan (PBI, sprint, tugas, komentar, dll.) hanya bisa dilakukan sejauh cakupan token dan peran Anda di proyek tersebut sama-sama mengizinkannya.",
  apiTokenUsageExample: "Contoh: ambil daftar proyek yang dapat Anda lihat",
  apiTokenUsageEndpoints: "Endpoint utama: baca — /me, /projects, /projects/{id}/backlog, /projects/{id}/sprints, /projects/{id}/plan. Tulis — /projects/{id}/backlog, /projects/{id}/sprints, /projects/{id}/sprints/{sprintId}/tasks, /projects/{id}/comments, dan lainnya (POST / PATCH; tidak ada yang bisa dihapus).",
  apiTokenUsageMcpUrl: "URL server Claude Code (MCP)",
  apiTokenUsageScopes: "Developer yang bekerja di Claude Code: buat token dengan preset \"Untuk developer\". PO / SM yang juga mengelola PBI dan sprint dari Claude Code: gunakan \"Untuk PO / SM (semua)\". Agar token hanya dipakai di proyek tertentu, pilih \"Hanya proyek yang dipilih\".",
  apiTokenUsageMcpSetup: "Di repositori agent model, jalankan perintah di bawah, lalu tempelkan token pada prompt yang muncul (yang Anda ketik tidak ditampilkan).",
  apiTokenUsageMcpAfter: "Setelah itu, mulai ulang Claude Code dan periksa koneksinya dengan /kanflow status. Ketik /kanflow setup di Claude Code untuk dipandu langkah demi langkah.",
  apiTokenUsageNeverPaste: "Jangan pernah menempelkan token ke chat Claude Code atau ke file di dalam repositori. Jika telanjur, segera cabut token itu di sini dan buat yang baru.",
  apiTokenDisabled: "Token akses dinonaktifkan di server ini (hubungi administrator).",
  apiTokenName: "Nama",
  apiTokenNamePlaceholder: "mis. skrip laporan mingguan",
  apiTokenExpiry: "Berlaku selama",
  apiTokenExpiryDays: "{days} hari",
  apiTokenExpiryNone: "Tanpa batas",
  apiTokenCreate: "Buat token",
  apiTokenCreated: "Token dibuat",
  apiTokenCreateFailed: "Gagal membuat token",
  apiTokenLimitReached: "Maksimal {max} token. Cabut token yang tidak diperlukan lagi.",
  apiTokenShownOnce: "Token ini hanya ditampilkan sekarang. Simpan di tempat yang aman.",
  apiTokenCopy: "Salin",
  apiTokenCopied: "Disalin",
  apiTokenCopyFailed: "Gagal menyalin. Pilih token lalu salin secara manual.",
  apiTokenDone: "Sudah saya simpan",
  apiTokenEmpty: "Belum ada token.",
  apiTokenListLabel: "Token Anda",
  apiTokenColPrefix: "Token",
  apiTokenColCreated: "Dibuat",
  apiTokenColLastUsed: "Terakhir dipakai",
  apiTokenColExpires: "Kedaluwarsa",
  apiTokenNever: "Belum dipakai",
  apiTokenNoExpiry: "Tanpa batas",
  apiTokenStateExpired: "Kedaluwarsa",
  apiTokenRevoke: "Cabut",
  apiTokenRevokeTitle: "Cabut token ini?",
  apiTokenRevokeMessage: "\"{name}\" akan dicabut. Alat yang memakainya langsung berhenti berfungsi.",
  apiTokenRevoked: "Token dicabut",
  apiTokenRevokeFailed: "Gagal mencabut token",
  apiTokenLoadFailed: "Gagal memuat token",
  apiTokenAdminMenu: "Token API",
  apiTokenAdminTitle: "Pengelolaan token API",
  apiTokenAdminDescription: "Token akses semua pengguna yang belum dicabut (termasuk yang kedaluwarsa). Cabut token yang mencurigakan di sini.",
  apiTokenAdminEmpty: "Tidak ada token yang belum dicabut.",
  apiTokenColOwner: "Pemilik",
  apiTokenOwnerInactive: "Pengguna nonaktif",
  apiTokenAdminRevokeMessage: "Token \"{name}\" milik {owner} akan dicabut.",
  apiTokenScopes: "Cakupan",
  apiTokenScopesHint: "Hanya tindakan yang dicentang yang dapat dilakukan dengan token ini, dan hanya sejauh peran Anda (PO / SM / Dev) di setiap proyek mengizinkannya.",
  apiTokenPresetReadOnly: "Hanya baca",
  apiTokenPresetDeveloper: "Untuk developer",
  apiTokenPresetAll: "Untuk PO / SM (semua)",
  apiTokenScopeRead: "Baca (selalu disertakan)",
  apiTokenScopeBacklogWrite: "Membuat dan mengedit PBI",
  apiTokenScopeBacklogReorder: "Mengurutkan PBI",
  apiTokenScopeSprintWrite: "Membuat dan mengedit sprint, menambahkan PBI",
  apiTokenScopeTaskWrite: "Membuat dan memperbarui tugas",
  apiTokenScopeCommentWrite: "Menulis komentar",
  apiTokenScopeIceboxWrite: "Mengajukan item Icebox",
  apiTokenScopeDailyWrite: "Menulis daily scrum",
  apiTokenProjects: "Proyek",
  apiTokenProjectsAll: "Semua proyek yang dapat Anda akses",
  apiTokenProjectsSelected: "Hanya proyek yang dipilih",
  apiTokenProjectsPickOne: "Pilih setidaknya satu proyek",
  apiTokenProjectsEmpty: "Anda belum tergabung dalam proyek mana pun",
  apiTokenProjectCount: "Terbatas pada {count} proyek",
}
