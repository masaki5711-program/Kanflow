"use client"

import { useState } from "react"
import { FileIcon, Trash2, X } from "lucide-react"
import MediaPreviewModal, { type MediaItem } from "@/components/media-preview-modal"
import { IconButton } from "@/components/ui"
import { formatFileSize, isImageType, isPreviewable } from "@/lib/file-display"
import { useLanguage } from "@/lib/language-context"
import type { PbiAttachmentItem } from "./types"

interface Props {
  items: readonly PbiAttachmentItem[]
  /** Offers a remove button per row (edit form / create modals); omitted in the read view. */
  onRemove?: (id: string) => void
  disabled?: boolean
}

/**
 * 参考資料 attachments: image thumbnails and file rows. Images / video / audio
 * open the full-screen viewer; other uploaded files open in a new tab.
 */
export function PbiAttachmentList({ items, onRemove, disabled }: Props) {
  const { t } = useLanguage()
  const [preview, setPreview] = useState<{ items: MediaItem[]; index: number } | null>(null)
  if (items.length === 0) return null

  function openPreview(id: string) {
    const media: MediaItem[] = items
      .filter((i) => i.url && isPreviewable(i.mimeType))
      .map((i) => ({ id: i.id, originalName: i.name, mimeType: i.mimeType, url: i.url ?? undefined }))
    const index = media.findIndex((m) => m.id === id)
    if (index >= 0) setPreview({ items: media, index })
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2.5 rounded-ui-md border border-border bg-surface-muted px-2.5 py-2">
            <Thumb item={item} onPreview={() => openPreview(item.id)} />
            <span className="min-w-0 flex-1">
              <ItemName item={item} onPreview={() => openPreview(item.id)} />
              <span className="block text-caption text-fg-muted">
                {formatFileSize(item.size)}
                {item.pending && <> · {t.pbiAttachPendingNote}</>}
              </span>
            </span>
            {onRemove && (
              <IconButton
                size="sm"
                label={(item.pending ? t.pbiAttachRemove : t.pbiAttachDelete).replace("{name}", item.name)}
                icon={item.pending ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4 text-danger" />}
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              />
            )}
          </li>
        ))}
      </ul>
      {preview && <MediaPreviewModal items={preview.items} startIndex={preview.index} onClose={() => setPreview(null)} />}
    </>
  )
}

function Thumb({ item, onPreview }: { item: PbiAttachmentItem; onPreview: () => void }) {
  const { t } = useLanguage()
  if (!item.url || !isImageType(item.mimeType)) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-ui-sm bg-surface-sunken">
        <FileIcon aria-hidden="true" className="h-5 w-5 text-fg-muted" />
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onPreview}
      aria-label={t.pbiAttachPreview.replace("{name}", item.name)}
      className="shrink-0 rounded-ui-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Authenticated API URL or local object URL → plain <img> (next/image cannot fetch it). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 rounded-ui-sm object-cover" />
    </button>
  )
}

function ItemName({ item, onPreview }: { item: PbiAttachmentItem; onPreview: () => void }) {
  const { t } = useLanguage()
  const cls = "block truncate text-left text-caption font-medium"
  if (item.url && isPreviewable(item.mimeType)) {
    return (
      <button type="button" onClick={onPreview} title={item.name} className={`${cls} max-w-full text-primary-strong hover:underline`}>
        {item.name}
      </button>
    )
  }
  if (item.url && !item.pending) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t.pbiAttachOpen.replace("{name}", item.name)}
        className={`${cls} text-primary-strong hover:underline`}
      >
        {item.name}
      </a>
    )
  }
  return (
    <span className={`${cls} text-fg`} title={item.name}>
      {item.name}
    </span>
  )
}
