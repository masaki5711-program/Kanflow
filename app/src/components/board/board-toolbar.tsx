"use client"

import type { ReactNode } from "react"
import {
  BringToFront,
  Circle,
  Columns3,
  Copy,
  Download,
  FileText,
  Frame,
  Grid2x2,
  ImagePlus,
  Inbox,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  NotebookPen,
  Redo2,
  SendToBack,
  Square,
  StickyNote,
  Table,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { FILL_KEYS, STROKE_KEYS, isBox, isKnown, type FillKey, type StrokeKey } from "@/lib/board/model"
import { FILL_COLOR, STROKE_COLOR } from "@/lib/board/palette"
import type { TemplateKind } from "@/lib/board/templates"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { Swatch, ToolbarRow, type ToolbarGroup } from "./toolbar-row"
import { TOOLS, type BoardEditorController, type Tool } from "./use-board-editor"

const TOOL_ICON: Record<Tool, ReactNode> = {
  select: <MousePointer2 className="h-4 w-4" />,
  rect: <Square className="h-4 w-4" />,
  ellipse: <Circle className="h-4 w-4" />,
  line: <Minus className="h-4 w-4" />,
  arrow: <MoveUpRight className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  sticky: <StickyNote className="h-4 w-4" />,
  frame: <Frame className="h-4 w-4" />,
  table: <Table className="h-4 w-4" />,
}

const TOOL_LABEL: Record<Tool, keyof Translations> = {
  select: "wbToolSelect",
  rect: "wbToolRect",
  ellipse: "wbToolEllipse",
  line: "wbToolLine",
  arrow: "wbToolArrow",
  text: "wbToolText",
  sticky: "wbToolSticky",
  frame: "wbToolFrame",
  table: "wbToolTable",
}

const TEMPLATES: { kind: TemplateKind; label: keyof Translations; icon: ReactNode }[] = [
  { kind: "kpt", label: "wbTemplateKpt", icon: <Columns3 className="h-4 w-4" /> },
  { kind: "zeva", label: "wbTemplateZeva", icon: <Grid2x2 className="h-4 w-4" /> },
  { kind: "minutes", label: "wbTemplateMinutes", icon: <NotebookPen className="h-4 w-4" /> },
  { kind: "report", label: "wbTemplateReport", icon: <FileText className="h-4 w-4" /> },
]

const COLOR_NAME: Record<FillKey | StrokeKey, keyof Translations> = {
  none: "wbColorNone",
  white: "wbColorWhite",
  ink: "wbColorInk",
  gray: "wbColorGray",
  blue: "wbColorBlue",
  sky: "wbColorSky",
  green: "wbColorGreen",
  amber: "wbColorAmber",
  red: "wbColorRed",
  violet: "wbColorViolet",
}

export function colorName(t: Translations, key: FillKey | StrokeKey): string {
  return String(t[COLOR_NAME[key]])
}

/** The one value all of `values` share, or null. */
export function shared<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null
  return values.every((value) => value === values[0]) ? values[0] : null
}

/** What the toolbar asks the sheet editor to do (things that need a file picker, a download or another API). */
export interface BoardToolbarActions {
  pickImage: () => void
  exportPng: () => void
  /** Undefined when the person cannot add IceBox items. */
  toIcebox?: () => void
}

interface BoardToolbarProps {
  editor: BoardEditorController
  actions: BoardToolbarActions
}

/** Tools, insert, edit commands, colours, view and export of the canvas (one toolbar, one tab stop). */
export function BoardToolbar({ editor, actions }: BoardToolbarProps) {
  const { t } = useLanguage()
  const { readOnly, elements, selection } = editor

  const selected = selection.map((id) => elements[id]).filter(isKnown)
  const boxes = selected.filter(isBox)
  const fill = shared(boxes.map((el) => el.fill))
  const stroke = shared(selected.map((el) => el.stroke))
  const none = selection.length === 0
  const stickies = boxes.filter((el) => el.type === "sticky" && el.text.trim() !== "")

  const groups: ToolbarGroup[] = []
  if (!readOnly) {
    groups.push({
      key: "tools",
      items: TOOLS.map((tool) => ({
        key: `tool-${tool}`,
        label: String(t[TOOL_LABEL[tool]]),
        content: TOOL_ICON[tool],
        onClick: () => editor.setTool(tool),
        pressed: editor.tool === tool,
      })),
    })
    groups.push({
      key: "insert",
      label: t.wbTemplates,
      items: [
        {
          key: "image",
          label: editor.uploading > 0 ? t.wbImageUploading : t.wbImageInsert,
          content: <ImagePlus className="h-4 w-4" />,
          onClick: actions.pickImage,
          disabled: editor.uploading > 0,
        },
        ...TEMPLATES.map((tpl) => ({
          key: `template-${tpl.kind}`,
          label: `${t.wbTemplates}: ${String(t[tpl.label])}`,
          content: tpl.icon,
          onClick: () => editor.applyTemplate(tpl.kind),
        })),
      ],
    })
    groups.push({
      key: "edit",
      items: [
        { key: "undo", label: t.wbUndo, content: <Undo2 className="h-4 w-4" />, onClick: editor.undo, disabled: !editor.canUndo },
        { key: "redo", label: t.wbRedo, content: <Redo2 className="h-4 w-4" />, onClick: editor.redo, disabled: !editor.canRedo },
        { key: "duplicate", label: t.wbDuplicate, content: <Copy className="h-4 w-4" />, onClick: editor.duplicate, disabled: none },
        { key: "delete", label: t.wbDeleteSelection, content: <Trash2 className="h-4 w-4" />, onClick: editor.deleteSelection, disabled: none },
        { key: "front", label: t.wbBringToFront, content: <BringToFront className="h-4 w-4" />, onClick: () => editor.reorder("front"), disabled: none },
        { key: "back", label: t.wbSendToBack, content: <SendToBack className="h-4 w-4" />, onClick: () => editor.reorder("back"), disabled: none },
      ],
    })
    groups.push({
      key: "fill",
      label: t.wbFillLabel,
      items: FILL_KEYS.map((key) => ({
        key: `fill-${key}`,
        label: t.wbFillColor.replace("{color}", colorName(t, key)),
        content: <Swatch color={FILL_COLOR[key]} none={key === "none"} />,
        onClick: () => editor.setStyle({ fill: key }),
        disabled: boxes.length === 0,
        pressed: fill === key,
      })),
    })
    groups.push({
      key: "stroke",
      label: t.wbStrokeLabel,
      items: STROKE_KEYS.map((key) => ({
        key: `stroke-${key}`,
        label: t.wbStrokeColor.replace("{color}", colorName(t, key)),
        content: <Swatch color={STROKE_COLOR[key]} />,
        onClick: () => editor.setStyle({ stroke: key }),
        disabled: selected.length === 0,
        pressed: stroke === key,
      })),
    })
  }
  const percent = Math.round(editor.viewport.zoom * 100)
  groups.push({
    key: "zoom",
    label: t.wbZoomLabel,
    items: [
      ...(readOnly ? [] : [{ key: "snap", label: t.wbSnap, content: <Magnet className="h-4 w-4" />, onClick: () => editor.setSnap(!editor.snap), pressed: editor.snap }]),
      { key: "zoom-out", label: t.wbZoomOut, content: <ZoomOut className="h-4 w-4" />, onClick: editor.zoomOut },
      {
        key: "zoom-reset",
        label: t.wbZoomReset.replace("{percent}", String(percent)),
        content: <span className="tabular-nums">{percent}%</span>,
        onClick: editor.zoomReset,
        wide: true,
      },
      { key: "zoom-in", label: t.wbZoomIn, content: <ZoomIn className="h-4 w-4" />, onClick: editor.zoomIn },
      { key: "zoom-fit", label: t.wbZoomFit, content: <Maximize className="h-4 w-4" />, onClick: editor.zoomFit },
    ],
  })
  groups.push({
    key: "export",
    items: [
      { key: "export-png", label: t.wbExportPng, content: <Download className="h-4 w-4" />, onClick: actions.exportPng },
      ...(actions.toIcebox
        ? [{ key: "to-icebox", label: t.wbToIcebox, content: <Inbox className="h-4 w-4" />, onClick: actions.toIcebox, disabled: stickies.length === 0 }]
        : []),
    ],
  })

  return <ToolbarRow label={t.wbToolbarLabel} groups={groups} />
}
