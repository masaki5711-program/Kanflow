"use client"

import {
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group,
  Inbox,
  Link,
  ListOrdered,
  Lock,
  LockOpen,
  MessageSquare,
  MoveUpRight,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  SendToBack,
  Table,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Ungroup,
  BookmarkPlus,
  ExternalLink,
  Link2,
  Sparkles,
} from "lucide-react"
import type { Point } from "@/lib/board/geometry"
import { isBox, isKnown, isLine } from "@/lib/board/model"
import type { Translations } from "@/lib/i18n"
import type { MenuEntry } from "./board-menu"
import { TABLE_TRACK_STEP, type BoardEditorController, type DrawBoxType } from "./use-board-editor"

const ICON = "h-4 w-4"

/** What the menu reaches outside the editor (dialogs, other APIs); absent ones are not offered. */
export interface ContextMenuActions {
  editLink: () => void
  toIcebox?: () => void
  comment?: () => void
  linkPbi?: () => void
  createPbi?: () => void
  /** The AI's three PBI drafts from the shape and its surroundings (arrows, frame, group, comments). */
  pbiDrafts?: () => void
  openPbi?: () => void
  aiSummarize?: () => void
  aiGroup?: () => void
}

/**
 * The right-click menu for the current selection (or for the empty spot `at` when nothing is selected): the same
 * commands as the toolbars and the keyboard, with their shortcuts shown, so each can be learnt from here.
 */
export function contextMenuEntries(editor: BoardEditorController, t: Translations, at: Point, actions: ContextMenuActions): MenuEntry[] {
  const { elements, selection, readOnly } = editor
  const selected = selection.map((id) => elements[id]).filter(isKnown)
  const boxes = selected.filter(isBox)
  const one = selected.length === 1 ? selected[0] : null
  const locked = selected.length > 0 && selected.every((el) => el.locked)
  const entries: MenuEntry[] = []
  const item = (key: string, label: string, icon: React.ReactNode, onSelect: () => void, extra: Partial<Extract<MenuEntry, { kind: "item" }>> = {}): MenuEntry => ({
    kind: "item",
    key,
    label,
    icon,
    onSelect,
    ...extra,
  })
  const sep = (key: string): MenuEntry => ({ kind: "separator", key })
  const copyToSystem = () => {
    // The plain text goes to the system clipboard too (pasting in other apps); the shapes stay on the board's own.
    const text = editor.selectionText()
    void navigator.clipboard?.writeText?.(text).catch(() => {})
  }

  if (readOnly) {
    if (selected.length > 0) entries.push(item("copy", t.wbCopy, <Copy className={ICON} />, () => (copyToSystem(), editor.copy()), { shortcut: "Ctrl+C" }))
    entries.push(item("select-all", t.wbSelectAll, null, editor.selectAll, { shortcut: "Ctrl+A" }))
    entries.push(item("fit", t.wbZoomFit, null, editor.zoomFit))
    return entries
  }

  const add = (type: DrawBoxType, label: string): MenuEntry => item(`add-${type}`, label, <Plus className={ICON} />, () => editor.addAt(type, at))
  const addHere: MenuEntry = {
    kind: "submenu",
    key: "add",
    label: t.wbAddHere,
    icon: <Plus className={ICON} />,
    items: [add("sticky", t.wbToolSticky), add("rect", t.wbToolRect), add("ellipse", t.wbToolEllipse), add("text", t.wbToolText), add("frame", t.wbToolFrame), add("table", t.wbToolTable)],
  }
  if (selected.length === 0) {
    entries.push(item("paste", t.wbPaste, <ClipboardPaste className={ICON} />, editor.paste, { shortcut: "Ctrl+V" }))
    entries.push(addHere)
    entries.push(sep("s1"))
    entries.push(item("select-all", t.wbSelectAll, null, editor.selectAll, { shortcut: "Ctrl+A" }))
    entries.push(item("fit", t.wbZoomFit, null, editor.zoomFit))
    entries.push(item("snap", t.wbSnap, null, () => editor.setSnap(!editor.snap), { checked: editor.snap }))
    return entries
  }

  // Writing comes first: it is what a right-click on a shape is most often for.
  if (one && !one.locked) {
    if (isLine(one)) entries.push(item("edit", t.wbLabelEditLabel, <Pencil className={ICON} />, () => editor.startLabelEditing(one.id), { shortcut: "Enter" }))
    else if (one.type === "frame") {
      entries.push(item("edit-body", t.wbBodyEditLabel, <Pencil className={ICON} />, () => editor.startBodyEditing(one.id), { shortcut: "Enter" }))
      entries.push(item("edit-title", t.wbEditTitle, <Pencil className={ICON} />, () => editor.startEditing(one.id), { shortcut: "F2" }))
      // A frame holds things: something new can be put in it where it was right-clicked.
      entries.push(addHere)
    } else if (one.type === "table") {
      const cell = editor.activeCell?.id === one.id ? editor.activeCell : { row: 0, col: 0 }
      entries.push(item("edit", t.wbEditText, <Pencil className={ICON} />, () => editor.startCellEditing(one.id, cell.row, cell.col), { shortcut: "Enter" }))
    } else if (one.type !== "image" && one.type !== "timer") entries.push(item("edit", t.wbEditText, <Pencil className={ICON} />, () => editor.startEditing(one.id), { shortcut: "Enter" }))
  }
  if (one && isBox(one) && one.type === "timer" && !one.locked) {
    const running = one.endsAt !== undefined
    entries.push(item("timer-run", running ? t.wbTimerPause : t.wbTimerStart, running ? <Pause className={ICON} /> : <Play className={ICON} />, () => editor.timer({ kind: running ? "pause" : "start" })))
    entries.push(item("timer-reset", t.wbTimerReset, <RotateCcw className={ICON} />, () => editor.timer({ kind: "reset" })))
  }
  if (entries.length > 0) entries.push(sep("s-edit"))

  entries.push(item("cut", t.wbCut, <Scissors className={ICON} />, () => (copyToSystem(), editor.cut()), { shortcut: "Ctrl+X", disabled: locked }))
  entries.push(item("copy", t.wbCopy, <Copy className={ICON} />, () => (copyToSystem(), editor.copy()), { shortcut: "Ctrl+C" }))
  entries.push(item("paste", t.wbPaste, <ClipboardPaste className={ICON} />, editor.paste, { shortcut: "Ctrl+V" }))
  entries.push(item("duplicate", t.wbDuplicate, <CopyPlus className={ICON} />, editor.duplicate, { shortcut: "Ctrl+D" }))
  entries.push(item("delete", t.wbDeleteSelection, <Trash2 className={ICON} />, editor.deleteSelection, { shortcut: "Delete", disabled: locked }))
  entries.push(sep("s-clip"))

  entries.push({
    kind: "submenu",
    key: "order",
    label: t.wbOrderLabel,
    icon: <BringToFront className={ICON} />,
    items: [item("front", t.wbBringToFront, <BringToFront className={ICON} />, () => editor.reorder("front")), item("back", t.wbSendToBack, <SendToBack className={ICON} />, () => editor.reorder("back"))],
  })
  if (boxes.length >= 2) {
    entries.push({
      kind: "submenu",
      key: "arrange",
      label: t.wbArrangeLabel,
      icon: <AlignStartVertical className={ICON} />,
      items: [
        item("a-left", t.wbAlignBoxesLeft, <AlignStartVertical className={ICON} />, () => editor.align("left")),
        item("a-center", t.wbAlignBoxesCenter, <AlignCenterVertical className={ICON} />, () => editor.align("center")),
        item("a-right", t.wbAlignBoxesRight, <AlignEndVertical className={ICON} />, () => editor.align("right")),
        item("a-top", t.wbAlignBoxesTop, <AlignStartHorizontal className={ICON} />, () => editor.align("top")),
        item("a-bottom", t.wbAlignBoxesBottom, <AlignEndHorizontal className={ICON} />, () => editor.align("bottom")),
        item("d-h", t.wbDistributeH, null, () => editor.distribute("horizontal"), { disabled: boxes.length < 3 }),
        item("d-v", t.wbDistributeV, null, () => editor.distribute("vertical"), { disabled: boxes.length < 3 }),
      ],
    })
  }
  if (selected.length >= 2) entries.push(item("group", t.wbGroupLabel, <Group className={ICON} />, editor.group, { shortcut: "Ctrl+G" }))
  if (selected.some((el) => el.groupId)) entries.push(item("ungroup", t.wbUngroupLabel, <Ungroup className={ICON} />, editor.ungroup, { shortcut: "Ctrl+Shift+G" }))
  if (boxes.filter((b) => b.type !== "frame").length === 2 && selected.length === 2) {
    entries.push(item("connect", t.wbConnectLabel, <MoveUpRight className={ICON} />, editor.connect, { shortcut: "Alt+L" }))
  }

  const table = one && isBox(one) && one.type === "table" && !one.locked ? one : null
  if (table && editor.activeCell?.id === table.id) {
    entries.push({
      kind: "submenu",
      key: "table",
      label: t.wbTableLabel,
      icon: <Table className={ICON} />,
      items: [
        item("row-above", t.wbTableRowAbove, null, () => editor.tableEdit("row-above")),
        item("row-below", t.wbTableRowBelow, null, () => editor.tableEdit("row-below")),
        item("row-delete", t.wbTableRowDelete, null, () => editor.tableEdit("row-delete")),
        { kind: "separator", key: "t1" },
        item("col-left", t.wbTableColLeft, null, () => editor.tableEdit("col-left")),
        item("col-right", t.wbTableColRight, null, () => editor.tableEdit("col-right")),
        item("col-delete", t.wbTableColDelete, null, () => editor.tableEdit("col-delete")),
        { kind: "separator", key: "t2" },
        item("col-widen", t.wbTableColWiden, null, () => editor.tableTrack("col", TABLE_TRACK_STEP)),
        item("col-narrow", t.wbTableColNarrow, null, () => editor.tableTrack("col", -TABLE_TRACK_STEP)),
        item("row-taller", t.wbTableRowTaller, null, () => editor.tableTrack("row", TABLE_TRACK_STEP)),
        item("row-shorter", t.wbTableRowShorter, null, () => editor.tableTrack("row", -TABLE_TRACK_STEP)),
      ],
    })
  }

  const sticky = one && isBox(one) && one.type === "sticky" ? one : null
  const stickies = boxes.filter((b) => b.type === "sticky")
  if (sticky && editor.userId && !sticky.locked) {
    entries.push(sep("s-vote"))
    if (editor.voteBudget !== null) {
      entries.push(item("vote-add", `${t.wbVoteAdd}（${t.wbVotesLeft.replace("{n}", String(editor.votesLeft ?? 0))}）`, <ThumbsUp className={ICON} />, () => editor.vote("add"), { disabled: (editor.votesLeft ?? 0) <= 0 }))
      entries.push(item("vote-remove", t.wbVoteRemove, <ThumbsDown className={ICON} />, () => editor.vote("remove"), { disabled: !(sticky.voters ?? []).includes(editor.userId) }))
    } else {
      const voted = (sticky.voters ?? []).includes(editor.userId)
      entries.push(item("vote", t.wbVote, <ThumbsUp className={ICON} />, () => editor.vote("toggle"), { checked: voted }))
    }
  }
  if (stickies.length >= 2) entries.push(item("sort-votes", t.wbSortByVotes, <ListOrdered className={ICON} />, editor.sortByVotes))
  if (stickies.length > 0 && actions.toIcebox) entries.push(item("icebox", t.wbToIcebox, <Inbox className={ICON} />, actions.toIcebox))
  if (actions.aiSummarize || actions.aiGroup) {
    entries.push(sep("s-ai"))
    if (actions.aiSummarize) entries.push(item("ai-summarize", t.wbAiSummarize, <Sparkles className={ICON} />, actions.aiSummarize))
    if (actions.aiGroup) entries.push(item("ai-group", t.wbAiGroup, <Sparkles className={ICON} />, actions.aiGroup))
  }

  entries.push(sep("s-misc"))
  if (one && isBox(one) && actions.openPbi) entries.push(item("pbi-open", t.wbPbiOpen, <ExternalLink className={ICON} />, actions.openPbi))
  if (one && isBox(one) && actions.linkPbi) entries.push(item("pbi-link", t.wbPbiLink, <Link2 className={ICON} />, actions.linkPbi, { disabled: !!one.locked }))
  if (one && isBox(one) && actions.createPbi && one.type !== "table" && one.type !== "image" && one.type !== "timer") {
    entries.push(item("pbi-create", t.wbPbiCreate, <BookmarkPlus className={ICON} />, actions.createPbi, { disabled: !!one.locked || !one.text.trim() }))
  }
  if (one && isBox(one) && actions.pbiDrafts) entries.push(item("pbi-drafts", t.wbPbiDrafts, <Sparkles className={ICON} />, actions.pbiDrafts, { disabled: !!one.locked }))
  if (one && actions.comment) entries.push(item("comment", t.wbComment, <MessageSquare className={ICON} />, actions.comment))
  entries.push(item("link", t.wbLink, <Link className={ICON} />, actions.editLink, { disabled: locked }))
  entries.push(item("lock", locked ? t.wbUnlock : t.wbLock, locked ? <LockOpen className={ICON} /> : <Lock className={ICON} />, () => editor.setLocked(!locked)))
  return entries
}
