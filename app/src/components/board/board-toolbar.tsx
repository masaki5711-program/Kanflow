"use client"

import type { ReactNode } from "react"
import {
  BringToFront,
  Circle,
  CircleHelp,
  History,
  MessageSquare,
  Columns3,
  Copy,
  Download,
  FileDown,
  FileImage,
  FileText,
  Fish,
  Frame,
  Grid2x2,
  ImagePlus,
  Inbox,
  LayoutPanelLeft,
  LayoutTemplate,
  ListTree,
  RefreshCw,
  Search,
  Shapes,
  Timer,
  Magnet,
  Maximize,
  CornerDownRight,
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
import type { PaperSize } from "@/lib/board/pdf"
import { SHAPE_GROUPS, shapePath, type ShapeKind } from "@/lib/board/shapes"
import type { TemplateKind } from "@/lib/board/templates"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import type { MenuEntry } from "./board-menu"
import { Swatch, ToolbarRow, type ToolbarGroup } from "./toolbar-row"
import { TOOLS, type BoardEditorController, type Tool } from "./use-board-editor"

const TOOL_ICON: Record<Tool, ReactNode> = {
  select: <MousePointer2 className="h-4 w-4" />,
  rect: <Square className="h-4 w-4" />,
  ellipse: <Circle className="h-4 w-4" />,
  line: <Minus className="h-4 w-4" />,
  arrow: <MoveUpRight className="h-4 w-4" />,
  elbow: <CornerDownRight className="h-4 w-4" />,
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
  elbow: "wbToolElbow",
  text: "wbToolText",
  sticky: "wbToolSticky",
  frame: "wbToolFrame",
  table: "wbToolTable",
}

/** The templates, in the menu's order: improvement (ZEVA) first, then meetings and reports. */
const TEMPLATES: { kind: TemplateKind; label: keyof Translations; icon: ReactNode; group: "improve" | "meeting" }[] = [
  { kind: "zeva", label: "wbTemplateZeva", icon: <Grid2x2 className="h-4 w-4" />, group: "improve" },
  { kind: "why5", label: "wbTemplateWhy5", icon: <ListTree className="h-4 w-4" />, group: "improve" },
  { kind: "fishbone", label: "wbTemplateFishbone", icon: <Fish className="h-4 w-4" />, group: "improve" },
  { kind: "pdcas", label: "wbTemplatePdcas", icon: <RefreshCw className="h-4 w-4" />, group: "improve" },
  { kind: "ecrs", label: "wbTemplateEcrs", icon: <Table className="h-4 w-4" />, group: "improve" },
  { kind: "a3", label: "wbTemplateA3", icon: <LayoutPanelLeft className="h-4 w-4" />, group: "improve" },
  { kind: "kpt", label: "wbTemplateKpt", icon: <Columns3 className="h-4 w-4" />, group: "meeting" },
  { kind: "minutes", label: "wbTemplateMinutes", icon: <NotebookPen className="h-4 w-4" />, group: "meeting" },
  { kind: "report", label: "wbTemplateReport", icon: <FileText className="h-4 w-4" />, group: "meeting" },
]

const SHAPE_LABEL: Record<ShapeKind, keyof Translations> = {
  diamond: "wbShapeDiamond",
  triangle: "wbShapeTriangle",
  storage: "wbShapeStorage",
  hexagon: "wbShapeHexagon",
  parallelogram: "wbShapeParallelogram",
  chevron: "wbShapeChevron",
  blockArrow: "wbShapeBlockArrow",
  cylinder: "wbShapeCylinder",
  document: "wbShapeDocument",
  delay: "wbShapeDelay",
  transport: "wbShapeTransport",
  inspectQty: "wbShapeInspectQty",
  person: "wbShapePerson",
  factory: "wbShapeFactory",
  truck: "wbShapeTruck",
  cloud: "wbShapeCloud",
  star: "wbShapeStar",
}

const SHAPE_GROUP_LABEL: Record<(typeof SHAPE_GROUPS)[number]["key"], keyof Translations> = {
  basic: "wbShapeGroupBasic",
  flow: "wbShapeGroupFlow",
  process: "wbShapeGroupProcess",
  site: "wbShapeGroupSite",
}

export function shapeName(t: Translations, kind: ShapeKind): string {
  return String(t[SHAPE_LABEL[kind]])
}

/** A small picture of a library shape (menu entries). */
export function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      <path d={shapePath(kind, 1, 1, 14, 14)} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  )
}

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
  exportPdf: (paper: PaperSize) => void
  /** Undefined when the person cannot add IceBox items. */
  toIcebox?: () => void
  search?: () => void
  help: () => void
  history?: () => void
  comments?: () => void
  commentsOpen?: boolean
  commentCount?: number
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
          key: "shapes",
          label: t.wbShapeLibrary,
          text: t.wbShapeLibrary,
          content: <Shapes className="h-4 w-4" />,
          onClick: () => {},
          menu: () =>
            SHAPE_GROUPS.flatMap((group): MenuEntry[] => [
              { kind: "heading", key: `h-${group.key}`, label: String(t[SHAPE_GROUP_LABEL[group.key]]) },
              ...group.kinds.map((kind): MenuEntry => ({ kind: "item", key: `shape-${kind}`, label: shapeName(t, kind), icon: <ShapeIcon kind={kind} />, onSelect: () => editor.insertShape(kind) })),
            ]),
        },
        {
          key: "templates",
          label: t.wbTemplates,
          text: t.wbTemplates,
          content: <LayoutTemplate className="h-4 w-4" />,
          onClick: () => {},
          menu: () =>
            TEMPLATES.flatMap((tpl, i): MenuEntry[] => [
              ...(i > 0 && TEMPLATES[i - 1].group !== tpl.group ? [{ kind: "separator", key: `sep-${tpl.kind}` } as MenuEntry] : []),
              { kind: "item", key: `template-${tpl.kind}`, label: String(t[tpl.label]), icon: tpl.icon, onSelect: () => editor.applyTemplate(tpl.kind) },
            ]),
        },
        {
          key: "image",
          label: editor.uploading > 0 ? t.wbImageUploading : t.wbImageInsert,
          content: <ImagePlus className="h-4 w-4" />,
          onClick: actions.pickImage,
          disabled: editor.uploading > 0,
        },
        { key: "timer", label: t.wbToolTimer, content: <Timer className="h-4 w-4" />, onClick: editor.insertTimer },
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
      {
        key: "export",
        label: t.wbExportMenu,
        text: t.wbExportMenu,
        content: <Download className="h-4 w-4" />,
        onClick: () => {},
        menu: () => [
          { kind: "item", key: "export-png", label: t.wbExportPng, icon: <FileImage className="h-4 w-4" />, onSelect: actions.exportPng },
          { kind: "item", key: "export-pdf-a4", label: t.wbExportPdfA4, icon: <FileDown className="h-4 w-4" />, onSelect: () => actions.exportPdf("a4") },
          { kind: "item", key: "export-pdf-a3", label: t.wbExportPdfA3, icon: <FileDown className="h-4 w-4" />, onSelect: () => actions.exportPdf("a3") },
          ...(actions.toIcebox
            ? [{ kind: "separator", key: "s" } as MenuEntry, { kind: "item", key: "to-icebox", label: t.wbToIcebox, icon: <Inbox className="h-4 w-4" />, onSelect: actions.toIcebox, disabled: stickies.length === 0 } as MenuEntry]
            : []),
        ],
      },
      ...(actions.search ? [{ key: "search", label: t.wbSearch, content: <Search className="h-4 w-4" />, onClick: actions.search }] : []),
      ...(actions.comments
        ? [
            {
              key: "comments",
              label: t.wbCommentsCount.replace("{n}", String(actions.commentCount ?? 0)),
              text: t.wbComments,
              content: (
                <span className="relative inline-flex">
                  <MessageSquare className="h-4 w-4" />
                  {(actions.commentCount ?? 0) > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary-strong px-0.5 text-center text-[11px] font-bold leading-4 text-surface">{actions.commentCount}</span>
                  )}
                </span>
              ),
              onClick: actions.comments,
              pressed: actions.commentsOpen,
            },
          ]
        : []),
      ...(actions.history ? [{ key: "history", label: t.wbHistory, text: t.wbHistory, content: <History className="h-4 w-4" />, onClick: actions.history }] : []),
      { key: "help", label: t.wbHelp, content: <CircleHelp className="h-4 w-4" />, onClick: actions.help },
    ],
  })

  return <ToolbarRow label={t.wbToolbarLabel} groups={groups} />
}
