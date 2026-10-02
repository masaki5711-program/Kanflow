/**
 * i18n domain: link entries in the dashboard attachments (e.g. a GitLab
 * repository URL with a display name).
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AttachmentLinksTranslations {
  attLinkAdd: string
  attLinkFormTitle: string
  attLinkEditTitle: string
  attLinkUrl: string
  attLinkUrlPlaceholder: string
  attLinkUrlInvalid: string
  attLinkName: string
  attLinkNamePlaceholder: string
  attLinkNameHint: string
  attLinkSave: string
  attLinkAdded: string
  attLinkSaved: string
  attLinkAddFailed: string
  attLinkEdit: string
  attLinkOpen: string
  attLinkBadge: string
}

export const ja: AttachmentLinksTranslations = {
  attLinkAdd: "リンクを追加",
  attLinkFormTitle: "リンクを追加（GitLab のリポジトリなど）",
  attLinkEditTitle: "リンクを編集",
  attLinkUrl: "URL",
  attLinkUrlPlaceholder: "https://gitlab.example.com/group/repository",
  attLinkUrlInvalid: "http:// または https:// で始まる URL を入力してください",
  attLinkName: "表示名（リポジトリ名など）",
  attLinkNamePlaceholder: "例: iot-platform/edge-gateway",
  attLinkNameHint: "空欄なら URL からリポジトリ名を自動で付けます",
  attLinkSave: "保存",
  attLinkAdded: "リンクを追加しました",
  attLinkSaved: "リンクを更新しました",
  attLinkAddFailed: "リンクを保存できませんでした",
  attLinkEdit: "リンクを編集",
  attLinkOpen: "新しいタブで開く",
  attLinkBadge: "リンク",
}

export const en: AttachmentLinksTranslations = {
  attLinkAdd: "Add link",
  attLinkFormTitle: "Add a link (e.g. a GitLab repository)",
  attLinkEditTitle: "Edit link",
  attLinkUrl: "URL",
  attLinkUrlPlaceholder: "https://gitlab.example.com/group/repository",
  attLinkUrlInvalid: "Enter a URL starting with http:// or https://",
  attLinkName: "Display name (e.g. repository name)",
  attLinkNamePlaceholder: "e.g. iot-platform/edge-gateway",
  attLinkNameHint: "Left empty, the repository name is taken from the URL",
  attLinkSave: "Save",
  attLinkAdded: "Link added",
  attLinkSaved: "Link updated",
  attLinkAddFailed: "Could not save the link",
  attLinkEdit: "Edit link",
  attLinkOpen: "Open in a new tab",
  attLinkBadge: "Link",
}

export const id: AttachmentLinksTranslations = {
  attLinkAdd: "Tambah tautan",
  attLinkFormTitle: "Tambah tautan (mis. repositori GitLab)",
  attLinkEditTitle: "Ubah tautan",
  attLinkUrl: "URL",
  attLinkUrlPlaceholder: "https://gitlab.example.com/group/repository",
  attLinkUrlInvalid: "Masukkan URL yang diawali http:// atau https://",
  attLinkName: "Nama tampilan (mis. nama repositori)",
  attLinkNamePlaceholder: "mis. iot-platform/edge-gateway",
  attLinkNameHint: "Jika kosong, nama repositori diambil dari URL",
  attLinkSave: "Simpan",
  attLinkAdded: "Tautan ditambahkan",
  attLinkSaved: "Tautan diperbarui",
  attLinkAddFailed: "Gagal menyimpan tautan",
  attLinkEdit: "Ubah tautan",
  attLinkOpen: "Buka di tab baru",
  attLinkBadge: "Tautan",
}
