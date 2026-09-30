"use client"

import { Button, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { ArrowRight, CircleCheck, Clock, Eye, FileIcon, Info, MessageSquareText, Paperclip, Pencil, Snowflake, Trash2, User, type LucideIcon } from "lucide-react"
import { attachmentUrl, formatFileSize, isImageType, type IceboxItem, type IceboxStatus } from "./types"

export interface IceboxCardActions {
  onChangeStatus: (item: IceboxItem, to: IceboxStatus) => void
  onEdit: (item: IceboxItem) => void
  onDelete: (item: IceboxItem) => void
  onGenerateDraft: (item: IceboxItem) => void
  onPreview: (item: IceboxItem, attachmentId: string) => void
}

interface Props extends IceboxCardActions {
  projectId: string
  item: IceboxItem
  statusLabel: string
  badgeClass: string
  accentClass: string
}

const STATUS_ICON: Record<string, LucideIcon> = { unreviewed: Clock, reviewed: CircleCheck, completed: CircleCheck, frozen: Snowflake }

const MAX_NAME_CHARS = 20

interface MoveTarget {
  status: IceboxStatus
  label: string
  className: string
}

function useMoveTargets(current: string): MoveTarget[] {
  const { t } = useLanguage()
  const targets: MoveTarget[] = []
  if (current !== "reviewed") {
    targets.push({ status: "reviewed", label: t.iceboxMoveToReviewed, className: "text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" })
  }
  // Only reviewed items can move to completed (the review gate has passed).
  if (current === "reviewed") {
    targets.push({ status: "completed", label: t.iceboxMoveToCompleted, className: "text-blue-800 bg-blue-50 border-blue-200 hover:bg-blue-100" })
  }
  if (current !== "frozen") {
    targets.push({ status: "frozen", label: t.iceboxMoveToFrozen, className: "text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100" })
  }
  if (current !== "unreviewed") {
    targets.push({ status: "unreviewed", label: t.iceboxMoveToUnreviewed, className: "text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100" })
  }
  return targets
}

function shortName(name: string): string {
  return name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 2)}…` : name
}

function Attachments({ projectId, item, onPreview }: Pick<Props, "projectId" | "item" | "onPreview">) {
  const { t } = useLanguage()
  const attachments = item.attachments ?? []
  const images = attachments.filter((a) => isImageType(a.mimeType))
  const others = attachments.filter((a) => !isImageType(a.mimeType))
  return (
    <>
      {images.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {images.map((att) => (
            <li key={att.id}>
              <button
                type="button"
                onClick={() => onPreview(item, att.id)}
                aria-label={t.iceboxAttachmentPreview.replace("{name}", att.originalName)}
                className="group/img relative block overflow-hidden rounded-ui-md border border-border shadow-ui-sm hover:border-primary/50 hover:shadow-ui-md"
              >
                {/* Plain <img>: attachment URLs are session-authenticated API routes, which the
                    next/image optimizer cannot fetch. Size is fixed and loading is lazy. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachmentUrl(projectId, item.id, att.id)}
                  alt={att.originalName}
                  className="h-24 w-24 object-cover"
                  loading="lazy"
                  decoding="async"
                  width={96}
                  height={96}
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/10 group-focus-visible/img:bg-black/10">
                  <Eye className="h-5 w-5 text-white opacity-0 drop-shadow-md group-hover/img:opacity-100 group-focus-visible/img:opacity-100" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {others.map((att) => {
            const title = `${att.originalName} (${formatFileSize(att.fileSize)})`
            const media = att.mimeType.startsWith("video/") || att.mimeType.startsWith("audio/")
            return (
              <li key={att.id}>
                {media ? (
                  <button
                    type="button"
                    onClick={() => onPreview(item, att.id)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-ui-sm border border-sky-200 bg-sky-50 px-2.5 py-1 text-caption text-sky-800 hover:border-sky-300 hover:bg-sky-100"
                    title={title}
                    aria-label={t.iceboxAttachmentPreview.replace("{name}", att.originalName)}
                  >
                    <span aria-hidden="true">{att.mimeType.startsWith("video/") ? "▶" : "♪"}</span> {shortName(att.originalName)}
                  </button>
                ) : (
                  <a
                    href={attachmentUrl(projectId, item.id, att.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-ui-sm border border-border bg-surface-muted px-2.5 py-1 text-caption text-fg-muted hover:border-primary/40 hover:bg-primary-soft hover:text-primary-active"
                    title={title}
                    aria-label={title}
                  >
                    <FileIcon className="h-3 w-3" />
                    {shortName(att.originalName)}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Memo({ icon: MemoIcon, label, children, className }: { icon: LucideIcon; label: string; children: React.ReactNode; className: string }) {
  return (
    <div className={cn("mt-2 border-l-2 pl-3", className)}>
      <p className="flex items-start gap-1.5 text-caption leading-relaxed">
        <MemoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {label}: {children}
        </span>
      </p>
    </div>
  )
}

export function IceboxItemCard(props: Props) {
  const { item, projectId } = props
  const { t } = useLanguage()
  const moveTargets = useMoveTargets(item.status)
  const entity = { type: "icebox_item", id: item.id }
  const attachmentCount = item.attachments?.length ?? 0
  const StatusIcon = STATUS_ICON[item.status] ?? Clock

  return (
    <li className={cn("border-l-2 px-5 py-4 hover:bg-surface-muted", props.accentClass)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">#{item.displayId}</span>
            <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
              <User className="h-3 w-3" />
              {item.author}
            </span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium", props.badgeClass)}>
              <StatusIcon className="h-3 w-3" />
              {props.statusLabel}
            </span>
            {attachmentCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-caption text-fg-muted" title={t.iceboxAttachmentCount.replace("{n}", String(attachmentCount))}>
                <Paperclip className="h-3 w-3" />
                <span className="sr-only">{t.iceboxAttachmentCount.replace("{n}", String(attachmentCount))}</span>
                <span aria-hidden="true">{attachmentCount}</span>
              </span>
            )}
          </div>

          <I18nText as="p" i18n={item.i18n} field="request" original={item.request} entity={entity} className="whitespace-pre-wrap text-body leading-relaxed text-fg" />
          {item.background && (
            <div className="mt-2 border-l-2 border-border pl-3">
              <p className="flex items-start gap-1.5 whitespace-pre-wrap text-caption leading-relaxed text-fg-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                <I18nText i18n={item.i18n} field="background" original={item.background} entity={entity} />
              </p>
            </div>
          )}

          <Attachments projectId={projectId} item={item} onPreview={props.onPreview} />

          {item.poHearingMemo && (
            <Memo icon={MessageSquareText} label={t.iceboxPoHearingMemo} className="border-blue-200 text-blue-800">
              <I18nText i18n={item.i18n} field="poHearingMemo" original={item.poHearingMemo} entity={entity} />
            </Memo>
          )}
          {item.poReviewMemo && (
            <Memo icon={CircleCheck} label={t.iceboxPoReviewMemo} className="border-emerald-200 text-emerald-800">
              <I18nText i18n={item.i18n} field="poReviewMemo" original={item.poReviewMemo} entity={entity} />
            </Memo>
          )}
          {item.freezeReason && (
            <Memo icon={Snowflake} label={t.iceboxFreezeReason} className="border-slate-200 text-fg-muted">
              <I18nText i18n={item.i18n} field="freezeReason" original={item.freezeReason} entity={entity} />
            </Memo>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col">
          {moveTargets.map((target) => (
            <button
              key={target.status}
              type="button"
              onClick={() => props.onChangeStatus(item, target.status)}
              className={cn("inline-flex min-h-8 items-center gap-1 rounded-ui-sm border px-2.5 py-1.5 text-caption font-medium", target.className)}
            >
              <ArrowRight className="h-3 w-3" />
              {target.label}
            </button>
          ))}
          <div className="flex flex-wrap justify-end gap-1 sm:mt-1">
            {item.status !== "frozen" && (
              <Button variant="secondary" size="sm" onClick={() => props.onGenerateDraft(item)} leftIcon={<span aria-hidden="true">🤖</span>}>
                {t.aiGeneratePbiDraft}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => props.onEdit(item)} leftIcon={<Pencil className="h-3 w-3" />}>
              {t.edit}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => props.onDelete(item)} leftIcon={<Trash2 className="h-3 w-3 text-danger" />}>
              {t.delete}
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}
