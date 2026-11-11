"use client"

import { useState, type ReactNode } from "react"
import {
  BringToFront,
  Circle,
  Copy,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  Redo2,
  SendToBack,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { FILL_KEYS, STROKE_KEYS, isBox, isKnown, type FillKey, type StrokeKey } from "@/lib/board/model"
import { FILL_COLOR, STROKE_COLOR } from "@/lib/board/palette"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import { TOOLS, type BoardEditorController, type Tool } from "./use-board-editor"

const TOOL_ICON: Record<Tool, ReactNode> = {
  select: <MousePointer2 className="h-4 w-4" />,
  rect: <Square className="h-4 w-4" />,
  ellipse: <Circle className="h-4 w-4" />,
  line: <Minus className="h-4 w-4" />,
  arrow: <MoveUpRight className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  sticky: <StickyNote className="h-4 w-4" />,
}

function toolLabel(t: Translations, tool: Tool): string {
  switch (tool) {
    case "select":
      return t.wbToolSelect
    case "rect":
      return t.wbToolRect
    case "ellipse":
      return t.wbToolEllipse
    case "line":
      return t.wbToolLine
    case "arrow":
      return t.wbToolArrow
    case "text":
      return t.wbToolText
    case "sticky":
      return t.wbToolSticky
  }
}

function colorName(t: Translations, key: FillKey | StrokeKey): string {
  switch (key) {
    case "none":
      return t.wbColorNone
    case "white":
      return t.wbColorWhite
    case "ink":
      return t.wbColorInk
    case "gray":
      return t.wbColorGray
    case "blue":
      return t.wbColorBlue
    case "sky":
      return t.wbColorSky
    case "green":
      return t.wbColorGreen
    case "amber":
      return t.wbColorAmber
    case "red":
      return t.wbColorRed
    case "violet":
      return t.wbColorViolet
  }
}

interface ToolbarItem {
  key: string
  label: string
  content: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Toggle buttons (tools, colours) say whether they are on. */
  pressed?: boolean
  /** A wider button with text (the zoom percentage). */
  wide?: boolean
}

function Swatch({ color, none }: { color: string; none?: boolean }) {
  return (
    <span
      className={cn("block h-4 w-4 rounded-full border border-border-strong", none && "bg-surface")}
      style={
        none
          ? { backgroundImage: "linear-gradient(to top right, transparent 44%, var(--color-danger) 44%, var(--color-danger) 56%, transparent 56%)" }
          : { backgroundColor: color }
      }
    />
  )
}

/** The one value all of `values` share, or null. */
function shared<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null
  return values.every((value) => value === values[0]) ? values[0] : null
}

interface BoardToolbarProps {
  editor: BoardEditorController
}

/**
 * Tools, edit commands, colours and zoom of the canvas. One tab stop (toolbar pattern): ← / → / Home / End
 * move between the buttons, so the canvas is one Tab away from the toolbar.
 */
export function BoardToolbar({ editor }: BoardToolbarProps) {
  const { t } = useLanguage()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const { readOnly, elements, selection } = editor

  const selected = selection.map((id) => elements[id]).filter(isKnown)
  const boxes = selected.filter(isBox)
  const fill = shared(boxes.map((el) => el.fill))
  const stroke = shared(selected.map((el) => el.stroke))
  const none = selection.length === 0

  const groups: { key: string; label?: string; items: ToolbarItem[] }[] = []
  if (!readOnly) {
    groups.push({
      key: "tools",
      items: TOOLS.map((tool) => ({
        key: `tool-${tool}`,
        label: toolLabel(t, tool),
        content: TOOL_ICON[tool],
        onClick: () => editor.setTool(tool),
        pressed: editor.tool === tool,
      })),
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

  // Exactly one button is in the tab order: the last one used while it can still be used, else the first.
  const enabled = groups.flatMap((group) => group.items).filter((item) => !item.disabled)
  const tabStop = enabled.some((item) => item.key === activeKey) ? activeKey : (enabled[0]?.key ?? null)

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length
    e.preventDefault()
    buttons[next].focus()
  }

  return (
    <div
      role="toolbar"
      aria-label={t.wbToolbarLabel}
      aria-orientation="horizontal"
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1"
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const key = (e.target as HTMLElement).closest("button")?.dataset.toolbarKey
        if (key) setActiveKey(key)
      }}
    >
      {groups.map((group, index) => (
        <div
          key={group.key}
          role="group"
          aria-label={group.label}
          className={cn("flex items-center gap-0.5", index > 0 && "border-l border-border pl-1")}
        >
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              data-toolbar-key={item.key}
              aria-label={item.label}
              title={item.label}
              aria-pressed={item.pressed}
              disabled={item.disabled}
              tabIndex={item.key === tabStop ? 0 : -1}
              onClick={item.onClick}
              className={cn(
                "inline-flex h-8 shrink-0 items-center justify-center rounded-ui-sm text-caption font-medium text-fg-muted",
                "hover:bg-surface-sunken hover:text-fg",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                item.wide ? "min-w-12 px-1.5" : "w-8",
                item.pressed && "bg-primary-soft text-primary-strong ring-1 ring-inset ring-primary",
              )}
            >
              <span aria-hidden="true" className="inline-flex">
                {item.content}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
