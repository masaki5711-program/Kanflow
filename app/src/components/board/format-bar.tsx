"use client"

import {
  AArrowDown,
  AArrowUp,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeft,
  ArrowRight,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  ChevronsDownUp,
  ChevronsLeftRight,
  ChevronsRightLeft,
  ChevronsUpDown,
  Columns2,
  CornerDownRight,
  Group,
  Italic,
  ListOrdered,
  MoveUpRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ThumbsDown,
  Link,
  ListTree,
  Lock,
  LockOpen,
  Minus,
  Network,
  Rows3,
  Spline,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  ThumbsUp,
  Underline,
  Ungroup,
  Workflow,
} from "lucide-react"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { mindParent } from "@/lib/board/mindmap"
import { STROKE_KEYS, isBox, isKnown, isLine, type Dash, type FontFamily, type HAlign, type LineRoute, type VAlign } from "@/lib/board/model"
import { STROKE_COLOR } from "@/lib/board/palette"
import { BOX_STROKE_WIDTHS, boxOutline, dashArray, FONT_STACK, LINE_WIDTHS, lineStyle, stepFontSize, textStyle } from "@/lib/board/style"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { colorName, shared } from "./board-toolbar"
import { FORMAT_BAR_ATTR } from "./rich-editor"
import { Swatch, ToolbarRow, type ToolbarGroup, type ToolbarItem } from "./toolbar-row"
import { TABLE_TRACK_STEP, type BoardEditorController } from "./use-board-editor"

const ICON = "h-4 w-4"

/** A short sample of a line width / dash, drawn as the button's face. */
function LineSample({ width, dash }: { width: number; dash: Dash }) {
  const w = Math.max(1, Math.min(width, 8))
  return (
    <svg width={22} height={12} viewBox="0 0 22 12" aria-hidden="true">
      {width === 0 ? (
        <path d="M2 10L20 2" stroke="var(--color-danger)" strokeWidth={1.5} />
      ) : (
        <line x1={2} y1={6} x2={20} y2={6} stroke="currentColor" strokeWidth={w} strokeDasharray={dashArray(dash, w)} strokeLinecap="round" />
      )}
    </svg>
  )
}

const FAMILY_LABEL: Record<FontFamily, keyof Translations> = { sans: "wbFontSans", serif: "wbFontSerif", mono: "wbFontMono" }
const ALIGN: { value: HAlign; label: keyof Translations; icon: React.ReactNode }[] = [
  { value: "left", label: "wbAlignLeft", icon: <TextAlignStart className={ICON} /> },
  { value: "center", label: "wbAlignCenter", icon: <TextAlignCenter className={ICON} /> },
  { value: "right", label: "wbAlignRight", icon: <TextAlignEnd className={ICON} /> },
]
const VALIGN: { value: VAlign; label: keyof Translations; icon: React.ReactNode }[] = [
  { value: "top", label: "wbValignTop", icon: <AlignVerticalJustifyStart className={ICON} /> },
  { value: "middle", label: "wbValignMiddle", icon: <AlignVerticalJustifyCenter className={ICON} /> },
  { value: "bottom", label: "wbValignBottom", icon: <AlignVerticalJustifyEnd className={ICON} /> },
]
const DASHES: { value: Dash; label: keyof Translations }[] = [
  { value: "solid", label: "wbDashSolid" },
  { value: "dashed", label: "wbDashDashed" },
  { value: "dotted", label: "wbDashDotted" },
]
const ROUTES: { value: LineRoute; label: keyof Translations; icon: React.ReactNode }[] = [
  { value: "straight", label: "wbRouteStraight", icon: <Minus className={ICON} /> },
  { value: "elbow", label: "wbRouteElbow", icon: <CornerDownRight className={ICON} /> },
  { value: "curve", label: "wbRouteCurve", icon: <Spline className={ICON} /> },
]

export { stepFontSize }

interface FormatBarProps {
  editor: BoardEditorController
  /** Opens the link dialog for the selection. */
  onEditLink: () => void
}

/**
 * Format and arrange commands for the selection — text (size, font, bold, italic, colour, alignment), outline and
 * line style, line shape and arrow heads, arranging several shapes, table rows / columns, lock, link, votes and
 * the mind map. Only what fits the selection is offered. Hidden while nothing is selected or the board is view only.
 */
export function FormatBar({ editor, onEditLink }: FormatBarProps) {
  const { t } = useLanguage()
  const { elements, selection, readOnly } = editor
  if (readOnly || selection.length === 0) return null

  const selected = selection.map((id) => elements[id]).filter(isKnown)
  const boxes = selected.filter(isBox)
  const lines = selected.filter(isLine)
  const textBoxes = boxes.filter((b) => b.type !== "image")
  const styles = textBoxes.map(textStyle)
  // While characters of a text are selected, the buttons show (and set) their format, not the shape's.
  const marks = editor.richMarks
  const fontSize = marks ? marks.fontSize : shared(styles.map((s) => s.fontSize))
  const family = shared(styles.map((s) => s.fontFamily))
  const bold = marks ? marks.bold : styles.length > 0 && styles.every((s) => s.bold)
  const italic = marks ? marks.italic : styles.length > 0 && styles.every((s) => s.italic)
  const underline = marks ? marks.underline : styles.length > 0 && styles.every((s) => s.underline)
  const editing = editor.editing !== null
  const grouped = selected.some((el) => !!el.groupId)
  const align = shared(styles.map((s) => s.align))
  const valign = shared(styles.map((s) => s.valign))
  const textColor = shared(styles.map((s) => s.color))
  const outlines = [...boxes.map((b) => boxOutline(b)), ...lines.map((l) => lineStyle(l))]
  const width = shared(outlines.map((o) => o.width))
  const dash = shared(outlines.map((o) => o.dash))
  const lineStyles = lines.map(lineStyle)
  const route = shared(lineStyles.map((s) => s.route))
  const arrowStart = lineStyles.length > 0 && lineStyles.every((s) => s.arrowStart)
  const arrowEnd = lineStyles.length > 0 && lineStyles.every((s) => s.arrowEnd)
  const locked = selected.length > 0 && selected.every((el) => el.locked)
  const one = selected.length === 1 ? selected[0] : null
  const sticky = one && isBox(one) && one.type === "sticky" ? one : null
  const voted = !!sticky && !!editor.userId && (sticky.voters ?? []).includes(editor.userId)
  const table = editor.activeCell && one && isBox(one) && one.type === "table" && one.id === editor.activeCell.id ? one : null

  const groups: ToolbarGroup[] = []
  if (textBoxes.length > 0) {
    const size = fontSize ?? 14
    groups.push({
      key: "text",
      label: t.wbFormatLabel,
      items: [
        // While a text is edited, these act on the selected characters (when some are selected).
        { key: "font-down", label: `${t.wbFontSize} −`, content: <AArrowDown className={ICON} />, onClick: () => editor.textFormat({ sizeStep: -1 }, { fontSize: stepFontSize(size, -1) }), disabled: size <= BOARD_LIMITS.fontSizeMin && !editing },
        { key: "font-size", label: `${t.wbFontSize}: ${fontSize ?? "—"}`, content: <span className="tabular-nums">{fontSize ?? "—"}</span>, onClick: () => editor.textFormat({ fontSize: 14 }, { fontSize: 14 }), wide: true },
        { key: "font-up", label: `${t.wbFontSize} +`, content: <AArrowUp className={ICON} />, onClick: () => editor.textFormat({ sizeStep: 1 }, { fontSize: stepFontSize(size, 1) }), disabled: size >= BOARD_LIMITS.fontSizeMax && !editing },
        ...(["sans", "serif", "mono"] as const).map(
          (f): ToolbarItem => ({
            key: `family-${f}`,
            label: `${t.wbFontFamily}: ${String(t[FAMILY_LABEL[f]])}`,
            content: <span style={{ fontFamily: FONT_STACK[f], fontSize: 15 }}>{f === "mono" ? "M" : "あ"}</span>,
            onClick: () => editor.textFormat({ fontFamily: f }, { fontFamily: f }),
            pressed: family === f,
          }),
        ),
        { key: "bold", label: t.wbBold, content: <Bold className={ICON} />, onClick: () => editor.textFormat({ toggle: "bold" }, { bold: !bold }), pressed: bold },
        { key: "italic", label: t.wbItalic, content: <Italic className={ICON} />, onClick: () => editor.textFormat({ toggle: "italic" }, { italic: !italic }), pressed: italic },
        { key: "underline", label: t.wbUnderline, content: <Underline className={ICON} />, onClick: () => editor.textFormat({ toggle: "underline" }, { underline: !underline }), pressed: underline },
        ...ALIGN.map((a): ToolbarItem => ({ key: `align-${a.value}`, label: String(t[a.label]), content: a.icon, onClick: () => editor.format({ align: a.value }), pressed: align === a.value })),
        ...VALIGN.map((a): ToolbarItem => ({ key: `valign-${a.value}`, label: String(t[a.label]), content: a.icon, onClick: () => editor.format({ valign: a.value }), pressed: valign === a.value })),
      ],
    })
    groups.push({
      key: "text-color",
      label: t.wbTextColorLabel,
      items: STROKE_KEYS.map((key) => ({
        key: `text-color-${key}`,
        label: t.wbTextColor.replace("{color}", colorName(t, key)),
        content: (
          <span className="inline-flex flex-col items-center leading-none">
            <span style={{ color: STROKE_COLOR[key], fontWeight: 700, fontSize: 13 }}>A</span>
            <Swatch color={STROKE_COLOR[key]} />
          </span>
        ),
        onClick: () => editor.textFormat({ color: key }, { textColor: key }),
        pressed: textColor === key,
      })),
    })
  }
  if (boxes.length > 0 || lines.length > 0) {
    const widths: readonly number[] = lines.length > 0 && boxes.length === 0 ? LINE_WIDTHS : BOX_STROKE_WIDTHS
    groups.push({
      key: "outline",
      label: t.wbStrokeWidth,
      items: [
        ...widths.map(
          (w): ToolbarItem => ({
            key: `width-${w}`,
            label: w === 0 ? t.wbStrokeWidthNone : `${t.wbStrokeWidth}: ${t.wbStrokeWidthValue.replace("{n}", String(w))}`,
            content: <LineSample width={w} dash="solid" />,
            onClick: () => editor.format({ strokeWidth: w }),
            pressed: width === w,
          }),
        ),
        ...DASHES.map((d): ToolbarItem => ({ key: `dash-${d.value}`, label: `${t.wbDash}: ${String(t[d.label])}`, content: <LineSample width={2} dash={d.value} />, onClick: () => editor.format({ dash: d.value }), pressed: dash === d.value })),
      ],
    })
  }
  if (lines.length > 0) {
    groups.push({
      key: "line",
      label: t.wbRoute,
      items: [
        ...ROUTES.map((r): ToolbarItem => ({ key: `route-${r.value}`, label: `${t.wbRoute}: ${String(t[r.label])}`, content: r.icon, onClick: () => editor.format({ route: r.value }), pressed: route === r.value })),
        { key: "arrow-start", label: t.wbArrowStart, content: <ArrowLeft className={ICON} />, onClick: () => editor.format({ arrowStart: !arrowStart }), pressed: arrowStart },
        { key: "arrow-end", label: t.wbArrowEnd, content: <ArrowRight className={ICON} />, onClick: () => editor.format({ arrowEnd: !arrowEnd }), pressed: arrowEnd },
      ],
    })
  }
  if (boxes.length >= 2) {
    groups.push({
      key: "arrange",
      label: t.wbArrangeLabel,
      items: [
        { key: "a-left", label: t.wbAlignBoxesLeft, content: <AlignStartVertical className={ICON} />, onClick: () => editor.align("left") },
        { key: "a-center", label: t.wbAlignBoxesCenter, content: <AlignCenterVertical className={ICON} />, onClick: () => editor.align("center") },
        { key: "a-right", label: t.wbAlignBoxesRight, content: <AlignEndVertical className={ICON} />, onClick: () => editor.align("right") },
        { key: "a-top", label: t.wbAlignBoxesTop, content: <AlignStartHorizontal className={ICON} />, onClick: () => editor.align("top") },
        { key: "a-middle", label: t.wbAlignBoxesMiddle, content: <AlignCenterHorizontal className={ICON} />, onClick: () => editor.align("middle") },
        { key: "a-bottom", label: t.wbAlignBoxesBottom, content: <AlignEndHorizontal className={ICON} />, onClick: () => editor.align("bottom") },
        { key: "d-h", label: t.wbDistributeH, content: <AlignHorizontalDistributeCenter className={ICON} />, onClick: () => editor.distribute("horizontal"), disabled: boxes.length < 3 },
        { key: "d-v", label: t.wbDistributeV, content: <AlignVerticalDistributeCenter className={ICON} />, onClick: () => editor.distribute("vertical"), disabled: boxes.length < 3 },
      ],
    })
  }
  if (table) {
    const rows = table.cells?.length ?? 0
    const cols = table.cells?.[0]?.length ?? 0
    const colWidth = table.colWidths?.[editor.activeCell?.col ?? 0] ?? 0
    const rowHeight = table.rowHeights?.[editor.activeCell?.row ?? 0] ?? 0
    groups.push({
      key: "table",
      label: t.wbTableLabel,
      items: [
        { key: "row-above", label: t.wbTableRowAbove, content: <BetweenHorizontalStart className={ICON} />, onClick: () => editor.tableEdit("row-above"), disabled: rows >= BOARD_LIMITS.tableRows },
        { key: "row-below", label: t.wbTableRowBelow, content: <BetweenHorizontalEnd className={ICON} />, onClick: () => editor.tableEdit("row-below"), disabled: rows >= BOARD_LIMITS.tableRows },
        { key: "row-delete", label: t.wbTableRowDelete, content: <Rows3 className={ICON} />, onClick: () => editor.tableEdit("row-delete"), disabled: rows <= 1 },
        { key: "col-left", label: t.wbTableColLeft, content: <BetweenVerticalStart className={ICON} />, onClick: () => editor.tableEdit("col-left"), disabled: cols >= BOARD_LIMITS.tableCols },
        { key: "col-right", label: t.wbTableColRight, content: <BetweenVerticalEnd className={ICON} />, onClick: () => editor.tableEdit("col-right"), disabled: cols >= BOARD_LIMITS.tableCols },
        { key: "col-delete", label: t.wbTableColDelete, content: <Columns2 className={ICON} />, onClick: () => editor.tableEdit("col-delete"), disabled: cols <= 1 },
        { key: "col-narrow", label: t.wbTableColNarrow, content: <ChevronsRightLeft className={ICON} />, onClick: () => editor.tableTrack("col", -TABLE_TRACK_STEP), disabled: colWidth <= BOARD_LIMITS.tableCellMin },
        { key: "col-widen", label: t.wbTableColWiden, content: <ChevronsLeftRight className={ICON} />, onClick: () => editor.tableTrack("col", TABLE_TRACK_STEP) },
        { key: "row-shorter", label: t.wbTableRowShorter, content: <ChevronsDownUp className={ICON} />, onClick: () => editor.tableTrack("row", -TABLE_TRACK_STEP), disabled: rowHeight <= BOARD_LIMITS.tableCellMin },
        { key: "row-taller", label: t.wbTableRowTaller, content: <ChevronsUpDown className={ICON} />, onClick: () => editor.tableTrack("row", TABLE_TRACK_STEP) },
      ],
    })
  }
  const timer = one && isBox(one) && one.type === "timer" ? one : null
  if (timer) {
    const running = timer.endsAt !== undefined
    const minutes = Math.round((timer.durationSec ?? 300) / 60)
    const budget = timer.voteBudget ?? 0
    groups.push({
      key: "timer",
      label: t.wbToolTimer,
      items: [
        { key: "timer-run", label: running ? t.wbTimerPause : t.wbTimerStart, text: running ? t.wbTimerPause : t.wbTimerStart, content: running ? <Pause className={ICON} /> : <Play className={ICON} />, onClick: () => editor.timer({ kind: running ? "pause" : "start" }) },
        { key: "timer-reset", label: t.wbTimerReset, content: <RotateCcw className={ICON} />, onClick: () => editor.timer({ kind: "reset" }) },
        { key: "timer-shorter", label: t.wbTimerShorter, content: <Minus className={ICON} />, onClick: () => editor.timer({ kind: "duration", sec: Math.max(1, minutes - 1) * 60 }), disabled: minutes <= 1 },
        { key: "timer-minutes", label: t.wbTimerMinutes.replace("{n}", String(minutes)), content: <span className="tabular-nums">{minutes}′</span>, onClick: () => editor.timer({ kind: "reset" }), wide: true },
        { key: "timer-longer", label: t.wbTimerLonger, content: <Plus className={ICON} />, onClick: () => editor.timer({ kind: "duration", sec: (minutes + 1) * 60 }), disabled: minutes >= 120 },
        { key: "budget-less", label: t.wbVoteBudgetLess, content: <ThumbsDown className={ICON} />, onClick: () => editor.timer({ kind: "budget", votes: budget <= 1 ? null : budget - 1 }), disabled: budget === 0 },
        { key: "budget", label: budget ? t.wbVoteBudget.replace("{n}", String(budget)) : t.wbVoteBudgetNone, content: <span className="tabular-nums">{budget || "—"}</span>, onClick: () => {}, wide: true },
        { key: "budget-more", label: t.wbVoteBudgetMore, content: <ThumbsUp className={ICON} />, onClick: () => editor.timer({ kind: "budget", votes: budget + 1 }), disabled: budget >= BOARD_LIMITS.voteBudgetMax },
      ],
    })
  }
  const stickies = boxes.filter((b) => b.type === "sticky")
  const misc: ToolbarItem[] = [
    { key: "group", label: t.wbGroup, content: <Group className={ICON} />, onClick: editor.group, disabled: selected.length < 2 },
    { key: "ungroup", label: t.wbUngroup, content: <Ungroup className={ICON} />, onClick: editor.ungroup, disabled: !grouped },
    { key: "lock", label: locked ? t.wbUnlock : t.wbLock, content: locked ? <LockOpen className={ICON} /> : <Lock className={ICON} />, onClick: () => editor.setLocked(!locked), pressed: locked },
    { key: "link", label: t.wbLink, content: <Link className={ICON} />, onClick: onEditLink, disabled: locked, pressed: selected.some((el) => !!el.link) },
  ]
  if (boxes.filter((b) => b.type !== "frame").length === 2 && selected.length === 2) {
    misc.unshift({ key: "connect", label: t.wbConnect, content: <MoveUpRight className={ICON} />, onClick: editor.connect })
  }
  if (sticky && editor.voteBudget !== null) {
    const left = editor.votesLeft ?? 0
    const mine = !!editor.userId && (sticky.voters ?? []).includes(editor.userId)
    misc.push(
      { key: "vote-add", label: `${t.wbVoteAdd} — ${t.wbVotesLeft.replace("{n}", String(left))}`, text: t.wbVotesLeft.replace("{n}", String(left)), content: <ThumbsUp className={ICON} />, onClick: () => editor.vote("add"), disabled: !editor.userId || !!sticky.locked || left <= 0 },
      { key: "vote-remove", label: t.wbVoteRemove, content: <ThumbsDown className={ICON} />, onClick: () => editor.vote("remove"), disabled: !mine || !!sticky.locked },
    )
  } else if (sticky) misc.push({ key: "vote", label: t.wbVote, content: <ThumbsUp className={ICON} />, onClick: () => editor.vote("toggle"), pressed: voted, disabled: !editor.userId || !!sticky.locked })
  if (stickies.length >= 2) misc.push({ key: "sort-votes", label: t.wbSortByVotes, content: <ListOrdered className={ICON} />, onClick: editor.sortByVotes })
  if (one && isBox(one) && one.type !== "image" && one.type !== "frame" && one.type !== "table") {
    misc.push({ key: "mind-child", label: t.wbMindChild, content: <Network className={ICON} />, onClick: editor.mindChild })
    if (mindParent(elements, one.id)) misc.push({ key: "mind-sibling", label: t.wbMindSibling, content: <ListTree className={ICON} />, onClick: () => void editor.mindSibling() })
    misc.push({ key: "mind-layout", label: t.wbMindLayout, content: <Workflow className={ICON} />, onClick: editor.mindLayout })
  }
  groups.push({ key: "misc", items: misc })

  // Floats over the top of the canvas instead of taking a row above it: selecting a shape must not move the
  // board under the pointer. Only the bar itself catches the pointer; the strip around it reaches the canvas.
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex justify-center">
      <div
        className="pointer-events-auto max-w-full rounded-ui-md border border-border bg-surface px-2 py-1 shadow-ui-md"
        {...{ [FORMAT_BAR_ATTR]: "" }}
        onKeyDown={(e) => {
          // Reached from the text being edited with the keyboard: Esc ends that edit here too.
          if (e.key === "Escape" && editing) {
            e.preventDefault()
            editor.endTextEdit()
          }
        }}
      >
        {/* keepFocus: a click keeps the caret and the selected characters of the text being edited. */}
        <ToolbarRow label={t.wbFormatLabel} groups={groups} testId="board-format-bar" keepFocus />
      </div>
    </div>
  )
}
