/**
 * i18n domain: binding GitStation repositories to a project from its settings (plan 11 §5.7 X3,
 * settings/git-repo-bindings.tsx). The confirmation buttons reuse ./git-dev.ts (gitDevConfirm*).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface GitBindingsTranslations {
  gitBindTitle: string
  gitBindIntro: string
  gitBindKindsHelp: string
  gitBindLoadFailed: string
  gitBindUnsupportedConfig: string
  gitBindNoEmployeeNumber: string
  gitBindBoundList: string
  gitBindEmpty: string
  gitBindKindCode: string
  gitBindKindShared: string
  gitBindPathUnknown: string
  gitBindNotListed: string
  gitBindAddToList: string
  gitBindAddToListLabel: string
  gitBindAddedToList: string
  gitBindAddFailed: string
  gitBindMakeCode: string
  gitBindMakeCodeLabel: string
  gitBindUnbind: string
  gitBindUnbindLabel: string
  gitBindSearchLabel: string
  gitBindSearchHelp: string
  gitBindSearch: string
  gitBindSearchResults: string
  gitBindSearchEmpty: string
  gitBindSearchFound: string
  gitBindSearchFailed: string
  gitBindAsCode: string
  gitBindAsCodeLabel: string
  gitBindAsShared: string
  gitBindAsSharedLabel: string
  gitBindAlready: string
  gitBindConfirmGroup: string
  gitBindConfirmHelp: string
  gitBindBound: string
  gitBindUpdated: string
  gitBindUnchanged: string
  gitBindRemoved: string
  gitBindStartFailed: string
  gitBindFailed: string
}

export const ja: GitBindingsTranslations = {
  gitBindTitle: "GitStation のリポジトリの結びつけ",
  gitBindIntro: "このプロジェクトに GitStation のリポジトリを結びつけます。操作はあなた本人として GitStation が判断します（リポジトリの Maintainer 以上が必要）。結ぶ・外すたびに GitStation の画面で確認します。",
  gitBindKindsHelp: "「コード」: PBI-123 をこのリポジトリのブランチ・MR に結びつけます（1 つのプロジェクトにだけ結べます）。「共有の仕様」: 他のプロジェクトとも共有する仕様のリポジトリで、PBI には結びつけません。",
  gitBindLoadFailed: "GitStation の結びつけを読み込めませんでした",
  gitBindUnsupportedConfig: "どの GitStation に結びつけるか決められません（連携 ID・トークン・許可されたホストを確かめてください）。",
  gitBindNoEmployeeNumber: "社員番号が登録されていないため、結びつけの変更はできません（一覧は見られます）。管理者に社員番号の登録を依頼してください。",
  gitBindBoundList: "結びついているリポジトリ",
  gitBindEmpty: "結びついているリポジトリはまだありません。",
  gitBindKindCode: "コード",
  gitBindKindShared: "共有の仕様",
  gitBindPathUnknown: "（パスを読めません）",
  gitBindNotListed: "開発データの取り込み先にはまだ入っていません。",
  gitBindAddToList: "取り込み先に追加",
  gitBindAddToListLabel: "{path} を開発データの取り込み先に追加",
  gitBindAddedToList: "取り込み先に追加しました",
  gitBindAddFailed: "取り込み先に追加できませんでした",
  gitBindMakeCode: "コードのリポジトリにする",
  gitBindMakeCodeLabel: "{path} をコードのリポジトリにする",
  gitBindUnbind: "解除",
  gitBindUnbindLabel: "{path} の結びつけを解除",
  gitBindSearchLabel: "結びつけるリポジトリを探す",
  gitBindSearchHelp: "パスか名前の一部を入れて「検索」を押してください。あなたが Maintainer 以上のリポジトリだけが出ます。",
  gitBindSearch: "検索",
  gitBindSearchResults: "検索の結果",
  gitBindSearchEmpty: "結びつけられるリポジトリは見つかりませんでした。",
  gitBindSearchFound: "{count} 件見つかりました",
  gitBindSearchFailed: "リポジトリを検索できませんでした",
  gitBindAsCode: "コードとして結ぶ",
  gitBindAsCodeLabel: "{path} をコードのリポジトリとして結ぶ",
  gitBindAsShared: "共有の仕様として結ぶ",
  gitBindAsSharedLabel: "{path} を共有の仕様のリポジトリとして結ぶ",
  gitBindAlready: "結びつけ済み（{kind}）",
  gitBindConfirmGroup: "GitStation での確認: {path}",
  gitBindConfirmHelp: "GitStation の画面でリポジトリと設定を確かめてボタンを押し、ここに戻って「確認しました」を押してください（10 分で期限切れ）。",
  gitBindBound: "リポジトリを結びつけました",
  gitBindUpdated: "コードのリポジトリに変えました",
  gitBindUnchanged: "変更はありませんでした（すでにその設定です）",
  gitBindRemoved: "結びつけを解除しました",
  gitBindStartFailed: "確認を始められませんでした",
  gitBindFailed: "結びつけを変更できませんでした",
}

export const en: GitBindingsTranslations = {
  gitBindTitle: "GitStation repository bindings",
  gitBindIntro: "Bind GitStation repositories to this project. GitStation decides each change as you (Maintainer or above of the repository is needed), and you confirm every bind or unbind on a GitStation page.",
  gitBindKindsHelp: "\"Code\": PBI-123 is linked to this repository's branches and merge requests (one project only). \"Shared specs\": a specification repository shared with other projects; it is not linked to PBIs.",
  gitBindLoadFailed: "Could not load the GitStation bindings",
  gitBindUnsupportedConfig: "Kanflow cannot tell which GitStation to bind in (check the integration ID, the token and the allowed hosts).",
  gitBindNoEmployeeNumber: "Your employee number is not registered, so you cannot change bindings (you can still see them). Ask an administrator to register it.",
  gitBindBoundList: "Bound repositories",
  gitBindEmpty: "No repositories are bound yet.",
  gitBindKindCode: "Code",
  gitBindKindShared: "Shared specs",
  gitBindPathUnknown: "(path unavailable)",
  gitBindNotListed: "Not yet among the repositories Kanflow reads development data from.",
  gitBindAddToList: "Add to the read list",
  gitBindAddToListLabel: "Add {path} to the repositories Kanflow reads",
  gitBindAddedToList: "Added to the read list",
  gitBindAddFailed: "Could not add it to the read list",
  gitBindMakeCode: "Make it a code repository",
  gitBindMakeCodeLabel: "Make {path} a code repository",
  gitBindUnbind: "Unbind",
  gitBindUnbindLabel: "Unbind {path}",
  gitBindSearchLabel: "Find a repository to bind",
  gitBindSearchHelp: "Enter part of the path or name and press \"Search\". Only repositories where you are Maintainer or above are shown.",
  gitBindSearch: "Search",
  gitBindSearchResults: "Search results",
  gitBindSearchEmpty: "No repositories you can bind were found.",
  gitBindSearchFound: "{count} found",
  gitBindSearchFailed: "Could not search repositories",
  gitBindAsCode: "Bind as code",
  gitBindAsCodeLabel: "Bind {path} as a code repository",
  gitBindAsShared: "Bind as shared specs",
  gitBindAsSharedLabel: "Bind {path} as a shared spec repository",
  gitBindAlready: "Bound ({kind})",
  gitBindConfirmGroup: "Confirming in GitStation: {path}",
  gitBindConfirmHelp: "Check the repository and the setting on the GitStation page and press its button, then come back and press \"I confirmed\" (expires in 10 minutes).",
  gitBindBound: "Repository bound",
  gitBindUpdated: "Changed to a code repository",
  gitBindUnchanged: "Nothing changed (already set that way)",
  gitBindRemoved: "Binding removed",
  gitBindStartFailed: "Could not start the confirmation",
  gitBindFailed: "Could not change the binding",
}

export const id: GitBindingsTranslations = {
  gitBindTitle: "Pengikatan repositori GitStation",
  gitBindIntro: "Hubungkan repositori GitStation ke proyek ini. GitStation memutuskan setiap perubahan atas nama Anda (diperlukan peran Maintainer atau lebih tinggi pada repositori), dan Anda mengonfirmasi setiap pengikatan atau pelepasan di halaman GitStation.",
  gitBindKindsHelp: "\"Kode\": PBI-123 ditautkan ke branch dan merge request repositori ini (hanya satu proyek). \"Spesifikasi bersama\": repositori spesifikasi yang dibagi dengan proyek lain; tidak ditautkan ke PBI.",
  gitBindLoadFailed: "Tidak dapat memuat pengikatan GitStation",
  gitBindUnsupportedConfig: "Kanflow tidak dapat menentukan GitStation mana yang dipakai (periksa ID integrasi, token, dan host yang diizinkan).",
  gitBindNoEmployeeNumber: "Nomor karyawan Anda belum terdaftar, sehingga Anda tidak dapat mengubah pengikatan (daftar tetap terlihat). Minta administrator untuk mendaftarkannya.",
  gitBindBoundList: "Repositori yang terhubung",
  gitBindEmpty: "Belum ada repositori yang terhubung.",
  gitBindKindCode: "Kode",
  gitBindKindShared: "Spesifikasi bersama",
  gitBindPathUnknown: "(jalur tidak tersedia)",
  gitBindNotListed: "Belum termasuk repositori yang dibaca Kanflow untuk data pengembangan.",
  gitBindAddToList: "Tambahkan ke daftar baca",
  gitBindAddToListLabel: "Tambahkan {path} ke repositori yang dibaca Kanflow",
  gitBindAddedToList: "Ditambahkan ke daftar baca",
  gitBindAddFailed: "Tidak dapat menambahkannya ke daftar baca",
  gitBindMakeCode: "Jadikan repositori kode",
  gitBindMakeCodeLabel: "Jadikan {path} repositori kode",
  gitBindUnbind: "Lepaskan",
  gitBindUnbindLabel: "Lepaskan {path}",
  gitBindSearchLabel: "Cari repositori untuk dihubungkan",
  gitBindSearchHelp: "Masukkan sebagian jalur atau nama lalu tekan \"Cari\". Hanya repositori tempat Anda Maintainer atau lebih tinggi yang ditampilkan.",
  gitBindSearch: "Cari",
  gitBindSearchResults: "Hasil pencarian",
  gitBindSearchEmpty: "Tidak ditemukan repositori yang dapat Anda hubungkan.",
  gitBindSearchFound: "{count} ditemukan",
  gitBindSearchFailed: "Tidak dapat mencari repositori",
  gitBindAsCode: "Hubungkan sebagai kode",
  gitBindAsCodeLabel: "Hubungkan {path} sebagai repositori kode",
  gitBindAsShared: "Hubungkan sebagai spesifikasi bersama",
  gitBindAsSharedLabel: "Hubungkan {path} sebagai repositori spesifikasi bersama",
  gitBindAlready: "Sudah terhubung ({kind})",
  gitBindConfirmGroup: "Konfirmasi di GitStation: {path}",
  gitBindConfirmHelp: "Periksa repositori dan pengaturannya di halaman GitStation lalu tekan tombolnya, kemudian kembali dan tekan \"Sudah saya konfirmasi\" (kedaluwarsa dalam 10 menit).",
  gitBindBound: "Repositori terhubung",
  gitBindUpdated: "Diubah menjadi repositori kode",
  gitBindUnchanged: "Tidak ada perubahan (sudah diatur demikian)",
  gitBindRemoved: "Pengikatan dilepaskan",
  gitBindStartFailed: "Tidak dapat memulai konfirmasi",
  gitBindFailed: "Tidak dapat mengubah pengikatan",
}
