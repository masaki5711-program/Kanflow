"use client"

import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { IconButton, cn } from "@/components/ui"
import type { EntityI18n } from "@/lib/translation/types"
import { dateLocale } from "../lib/locale"
import DailyScrumForm, { type DailyScrumDraft } from "./daily-scrum-form"
import { Archive, ArchiveRestore, SquarePen, Trash2 } from "lucide-react"
export interface DailyScrumNoteData {
  id: string
  sprintId: string
  date: string
  content: string
  author: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  i18n?: EntityI18n
}

interface Props {
  note: DailyScrumNoteData
  readOnly: boolean
  isEditing: boolean
  minDate: string
  maxDate: string
  onStartEdit: () => void
  onCancelEdit: () => void
  onUpdate: (draft: DailyScrumDraft) => Promise<boolean>
  onArchive: (archived: boolean) => void
  onDelete: () => void
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })
}

export default function DailyScrumNote({
  note, readOnly, isEditing, minDate, maxDate, onStartEdit, onCancelEdit, onUpdate, onArchive, onDelete,
}: Props) {
  const { t, language } = useLanguage()
  const archived = !!note.archivedAt
  const dateLabel = formatDate(note.date, dateLocale(language))

  if (isEditing) {
    return (
      <li className="bg-surface-muted border border-border rounded-ui-sm">
        <DailyScrumForm className="p-3" initial={{ date: new Date(note.date).toISOString().slice(0, 10), content: note.content }}
          minDate={minDate} maxDate={maxDate} submitLabel={t.save} onSubmit={onUpdate} onCancel={onCancelEdit} />
      </li>
    )
  }

  return (
    <li className={cn("bg-surface-muted border border-border rounded-ui-sm p-3 group", archived && "opacity-70")}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 text-caption">
          <span className="font-semibold text-primary-active">{dateLabel}</span>
          {note.author && <span className="text-fg-muted">{note.author}</span>}
        </div>
        {!readOnly && (
          <div className="flex gap-0.5 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity">
            {!archived && (
              <IconButton size="sm" label={`${t.edit}: ${dateLabel}`} icon={<SquarePen className="w-4 h-4" />} onClick={onStartEdit} />
            )}
            <IconButton size="sm" label={`${archived ? t.sprintDailyScrumUnarchive : t.sprintDailyScrumArchive}: ${dateLabel}`}
              icon={archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              onClick={() => onArchive(!archived)} />
            <IconButton size="sm" label={`${t.delete}: ${dateLabel}`} icon={<Trash2 className="w-4 h-4" />}
              className="hover:text-danger-strong hover:bg-danger-soft" onClick={onDelete} />
          </div>
        )}
      </div>
      <I18nText as="p" i18n={note.i18n} field="content" original={note.content}
        entity={{ type: "daily_scrum_note", id: note.id }} className="text-body text-fg whitespace-pre-wrap leading-relaxed" />
    </li>
  )
}
