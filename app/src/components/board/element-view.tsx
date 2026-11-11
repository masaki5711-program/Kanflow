import { createContext, memo, useContext, useEffect, useState, type CSSProperties } from "react"
import { timerLeft } from "@/lib/board/ops"
import { shapePath, shapeTextRect } from "@/lib/board/shapes"
import { FRAME_TITLE_HEIGHT, lineGeometry, type ElementMap, type LineGeometry, type Point } from "@/lib/board/geometry"
import { isBox, isHttpUrl, isLine, type BoardElement, type BoxElement, type LineElement, type StrokeKey, type TextRuns } from "@/lib/board/model"
import { FILL_COLOR, STROKE_COLOR } from "@/lib/board/palette"
import { runsFor, type RunMarks } from "@/lib/board/rich"
import { ALIGN_ITEMS, baseMarks, boxOutline, dashArray, FONT_STACK, JUSTIFY, lineStyle, TEXT_PADDING as PADDING, textStyle, type TextSlot } from "@/lib/board/style"

/** Outline width and text size in sheet units (they scale with the zoom). Kept for callers of the B1 names. */
export const STROKE_WIDTH = 2
export const TEXT_SIZE = 14
export const TEXT_PADDING = PADDING
const ARROW_HEAD = 12

/** Where the editor finds an image's bytes (the board's file route), and the viewer's user id (votes). */
export interface BoardRenderContext {
  fileUrl: (fileId: string) => string
  userId: string | null
  /** Accessible name of a link mark ("open … in a new tab"). */
  linkLabel: (url: string) => string
  /** Accessible name of an image without a caption. */
  imageAlt: string
  /** Texts of the timer. */
  timerLabels: { aria: string; done: string; budget: string }
  /** A linked backlog item, as read now (null while it is being read). */
  pbi: (id: string) => PbiBadgeInfo | null
  /** The shared clock (server time) the timers count down by. */
  now?: () => number
  /** Said once when a timer reaches zero. */
  timerDoneStatus?: string
}

/** What a box shows of its backlog item. */
export interface PbiBadgeInfo {
  label: string
  tone: "ready" | "notReady" | "done" | "missing" | "neutral"
}

export const BoardRenderContextValue = createContext<BoardRenderContext>({
  fileUrl: () => "",
  userId: null,
  linkLabel: (url) => url,
  imageAlt: "",
  timerLabels: { aria: "{time}", done: "0:00", budget: "{n}" },
  pbi: () => null,
})

/** The three corners of an arrow head at `tip`, for a line coming from `from`. */
export function arrowHeadPoints(from: Point, tip: Point, size = ARROW_HEAD): Point[] {
  const length = Math.hypot(tip.x - from.x, tip.y - from.y)
  if (length === 0) return []
  const ux = (tip.x - from.x) / length
  const uy = (tip.y - from.y) / length
  const back = { x: tip.x - ux * size, y: tip.y - uy * size }
  const half = size * 0.45
  return [tip, { x: back.x - uy * half, y: back.y + ux * half }, { x: back.x + uy * half, y: back.y - ux * half }]
}

/** Colour of the text of a box (CSS). */
export function textColor(el: BoxElement): string {
  const color = textStyle(el).color
  return color === "fg" ? "var(--color-fg)" : STROKE_COLOR[color]
}

/** The CSS of a box's text: the same in the drawing and in the editing overlay (zoom = the overlay's scale). */
export function textCss(el: BoxElement, zoom = 1, slot: TextSlot = { kind: "text" }): CSSProperties {
  const s = textStyle(el)
  const base = baseMarks(el, slot)
  return {
    color: textColor(el),
    fontSize: s.fontSize * zoom,
    fontFamily: FONT_STACK[s.fontFamily],
    fontWeight: base.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textDecoration: s.underline ? "underline" : undefined,
    textAlign: s.align,
    lineHeight: 1.4,
  }
}

/** CSS colour of a palette key or the theme foreground. */
function colorCss(color: StrokeKey | "fg"): string {
  return color === "fg" ? "var(--color-fg)" : STROKE_COLOR[color]
}

/** The CSS of one run: only what it sets itself (the rest comes from the box around it). */
export function runCss(run: RunMarks, zoom = 1): CSSProperties {
  const css: CSSProperties = {}
  if (run.bold !== undefined) css.fontWeight = run.bold ? 700 : 400
  if (run.italic !== undefined) css.fontStyle = run.italic ? "italic" : "normal"
  if (run.underline !== undefined) css.textDecoration = run.underline ? "underline" : "none"
  if (run.fontSize !== undefined) css.fontSize = run.fontSize * zoom
  if (run.fontFamily !== undefined) css.fontFamily = FONT_STACK[run.fontFamily]
  if (run.color !== undefined) css.color = colorCss(run.color)
  return css
}

/** A text with its runs (plain when it has none that fit it). */
function RichText({ text, runs }: { text: string; runs: TextRuns | null | undefined }) {
  const fitting = runsFor(text, runs)
  if (!fitting) return <>{text}</>
  return (
    <>
      {fitting.map((run, i) => (
        <span key={i} style={runCss(run)} data-run="">
          {run.text}
        </span>
      ))}
    </>
  )
}

/** The geometry ElementView needs from the rest of the sheet: a line's route (boxes need nothing but themselves). */
export function lineEndsOf(el: BoardElement, elements: ElementMap): LineGeometry | undefined {
  return isLine(el) ? lineGeometry(el, elements) : undefined
}

interface ElementViewProps {
  el: BoardElement
  /** A line's resolved route. */
  ends?: LineGeometry
  /** The text is being edited in the overlay: do not draw it twice. */
  hideText?: boolean
  /** A frame's body is being edited. */
  hideBody?: boolean
  /** A table cell being edited ("row:col"). */
  hideCell?: string | null
}

const sameRoute = (p?: LineGeometry, q?: LineGeometry) => p === q || (!!p && !!q && p.d === q.d && p.mid.x === q.mid.x && p.mid.y === q.mid.y)

/**
 * One element as SVG, in sheet coordinates. Types this build does not know are not drawn. Memoized: during a drag
 * only the moved elements (new objects) and the lines whose route moved are drawn again, not the whole sheet.
 */
export const ElementView = memo(
  function ElementView({ el, ends, hideText, hideBody, hideCell }: ElementViewProps) {
    if (isLine(el)) return ends ? <LineShape el={el} geometry={ends} hideText={hideText} /> : null
    if (!isBox(el)) return null
    return <BoxShape el={el} hideText={hideText} hideBody={hideBody} hideCell={hideCell ?? null} />
  },
  (prev, next) =>
    prev.el === next.el && prev.hideText === next.hideText && prev.hideBody === next.hideBody && prev.hideCell === next.hideCell && sameRoute(prev.ends, next.ends),
)

function LineShape({ el, geometry, hideText }: { el: LineElement; geometry: LineGeometry; hideText?: boolean }) {
  const stroke = STROKE_COLOR[el.stroke]
  const s = lineStyle(el)
  const head = ARROW_HEAD + (s.width - 2) * 2
  const heads = [s.arrowEnd ? arrowHeadPoints(geometry.endFrom, geometry.b, head) : [], s.arrowStart ? arrowHeadPoints(geometry.startFrom, geometry.a, head) : []]
  return (
    <g data-element-id={el.id} data-element-type={el.type} data-route={s.route}>
      <path d={geometry.d} fill="none" style={{ stroke }} strokeWidth={s.width} strokeDasharray={dashArray(s.dash, s.width)} strokeLinecap="round" strokeLinejoin="round" />
      {heads.map((points, i) =>
        points.length > 0 ? <polygon key={i} points={points.map((p) => `${p.x},${p.y}`).join(" ")} style={{ fill: stroke, stroke }} strokeWidth={1} strokeLinejoin="round" /> : null,
      )}
      {el.label && !hideText && <LineLabel text={el.label} at={geometry.mid} color={stroke} />}
      {el.link && isHttpUrl(el.link) && <LinkMark href={el.link} at={{ x: geometry.mid.x + 10, y: geometry.mid.y - 22 }} />}
    </g>
  )
}

/** The label sits on the line's middle on a background, so the line does not cross the text. */
function LineLabel({ text, at, color }: { text: string; at: Point; color: string }) {
  const width = Math.min(320, Math.max(32, text.length * 8 + 16))
  return (
    <foreignObject x={at.x - width / 2} y={at.y - 12} width={width} height={24} className="pointer-events-none" data-line-label="">
      <div
        className="mx-auto w-fit max-w-full truncate rounded-ui-sm bg-surface px-1 text-center"
        style={{ color, fontSize: 12, lineHeight: "20px", fontFamily: FONT_STACK.sans, border: "1px solid var(--color-border)" }}
      >
        {text}
      </div>
    </foreignObject>
  )
}

function BoxShape({ el, hideText, hideBody, hideCell }: { el: BoxElement; hideText?: boolean; hideBody?: boolean; hideCell: string | null }) {
  const fill = FILL_COLOR[el.fill]
  const stroke = STROKE_COLOR[el.stroke]
  const outline = boxOutline(el)
  const strokeProps = { strokeWidth: outline.width, strokeDasharray: dashArray(outline.dash, outline.width) }
  const shapeStroke = outline.width > 0 ? stroke : "none"
  return (
    <g data-element-id={el.id} data-element-type={el.type}>
      {el.type === "ellipse" ? (
        <ellipse cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} style={{ fill, stroke: shapeStroke }} {...strokeProps} />
      ) : el.type === "image" ? (
        <ImageShape el={el} stroke={shapeStroke} strokeProps={strokeProps} />
      ) : el.type === "table" ? (
        <TableShape el={el} hideCell={hideCell} />
      ) : el.type === "frame" ? (
        <FrameShape el={el} hideText={hideText} hideBody={hideBody} />
      ) : el.type === "shape" ? (
        <path d={shapePath(el.shape ?? "diamond", el.x, el.y, el.w, el.h)} style={{ fill, stroke: shapeStroke }} {...strokeProps} strokeLinejoin="round" fillRule="evenodd" />
      ) : el.type === "timer" ? (
        <TimerShape el={el} />
      ) : el.type === "sticky" ? (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={2} style={{ fill, stroke: shapeStroke }} {...strokeProps} strokeOpacity={0.6} />
      ) : (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={el.type === "rect" ? 3 : 0} style={{ fill, stroke: shapeStroke }} {...strokeProps} />
      )}
      {!hideText && el.text !== "" && el.type !== "frame" && el.type !== "table" && el.type !== "image" && el.type !== "timer" && <BoxText el={el} />}
      {el.pbiId && <PbiBadge el={el} />}
      {el.type === "sticky" && <Votes el={el} />}
      {el.link && isHttpUrl(el.link) && <LinkMark href={el.link} at={{ x: el.x + el.w - 10, y: el.y - 10 }} />}
    </g>
  )
}

/** Where a box's text is drawn (a library shape keeps it inside its outline). */
export function textArea(el: BoxElement): { x: number; y: number; w: number; h: number } {
  return el.type === "shape" ? shapeTextRect(el.shape ?? "diamond", el.x, el.y, el.w, el.h) : { x: el.x, y: el.y, w: el.w, h: el.h }
}

function BoxText({ el }: { el: BoxElement }) {
  const s = textStyle(el)
  const area = textArea(el)
  return (
    <foreignObject x={area.x} y={area.y} width={area.w} height={area.h} className="pointer-events-none">
      <div
        className="flex h-full w-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]"
        style={{ ...textCss(el), justifyContent: JUSTIFY[s.align], alignItems: ALIGN_ITEMS[s.valign], padding: TEXT_PADDING }}
      >
        <span className="min-w-0">
          <RichText text={el.text} runs={el.runs} />
        </span>
      </div>
    </foreignObject>
  )
}

function ImageShape({ el, stroke, strokeProps }: { el: BoxElement; stroke: string; strokeProps: { strokeWidth: number; strokeDasharray?: string } }) {
  const { fileUrl, imageAlt } = useContext(BoardRenderContextValue)
  const href = el.fileId ? fileUrl(el.fileId) : ""
  return (
    <>
      {href ? (
        <image href={href} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="xMidYMid meet" data-file-id={el.fileId} role="img" aria-label={el.text || imageAlt || undefined} />
      ) : (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} style={{ fill: "var(--color-surface-sunken)" }} />
      )}
      {strokeProps.strokeWidth > 0 && <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" style={{ stroke }} {...strokeProps} />}
    </>
  )
}

function TableShape({ el, hideCell }: { el: BoxElement; hideCell: string | null }) {
  const cells = el.cells ?? []
  const colWidths = el.colWidths ?? []
  const rowHeights = el.rowHeights ?? []
  const css = textCss(el)
  const s = textStyle(el)
  const border = `1px solid ${STROKE_COLOR[el.stroke]}`
  return (
    <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} className="pointer-events-none">
      <table className="border-collapse" style={{ width: el.w, height: el.h, tableLayout: "fixed", background: FILL_COLOR[el.fill] }} data-table="">
        <colgroup>
          {colWidths.map((w, j) => (
            <col key={j} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {cells.map((row, i) => (
            <tr key={i} style={{ height: rowHeights[i] }}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]"
                  style={{ ...css, border, padding: "2px 6px", verticalAlign: s.valign === "middle" ? "middle" : s.valign, fontWeight: i === 0 && s.bold ? 700 : 400 }}
                >
                  {hideCell === `${i}:${j}` ? "" : <RichText text={cell} runs={el.cellRuns?.[i]?.[j]} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </foreignObject>
  )
}

/** Where a frame's body text sits (below the title bar). */
export function frameBodyRect(el: BoxElement): { x: number; y: number; w: number; h: number } {
  return { x: el.x, y: el.y + FRAME_TITLE_HEIGHT, w: el.w, h: Math.max(1, el.h - FRAME_TITLE_HEIGHT) }
}

function FrameShape({ el, hideText, hideBody }: { el: BoxElement; hideText?: boolean; hideBody?: boolean }) {
  const outline = boxOutline(el)
  const stroke = STROKE_COLOR[el.stroke]
  const s = textStyle(el)
  const body = frameBodyRect(el)
  const bodyText = el.body ?? ""
  return (
    <>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={6} style={{ fill: FILL_COLOR[el.fill], stroke }} strokeWidth={Math.max(1, outline.width)} strokeDasharray={dashArray(outline.dash, Math.max(1, outline.width))} />
      <rect x={el.x} y={el.y} width={el.w} height={FRAME_TITLE_HEIGHT} rx={6} style={{ fill: "var(--color-surface-sunken)" }} opacity={0.9} />
      {!hideText && (
        <foreignObject x={el.x} y={el.y} width={el.w} height={FRAME_TITLE_HEIGHT} className="pointer-events-none">
          <div className="truncate px-2" style={{ ...textCss(el), textAlign: "left", lineHeight: `${FRAME_TITLE_HEIGHT}px`, fontSize: Math.min(s.fontSize, 20) }}>
            {el.text}
          </div>
        </foreignObject>
      )}
      {!hideBody && (bodyText !== "" || el.hint) && (
        <foreignObject x={body.x} y={body.y} width={body.w} height={body.h} className="pointer-events-none" data-frame-body="">
          {bodyText !== "" ? (
            <div
              className="flex h-full w-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]"
              style={{ ...textCss(el, 1, { kind: "body" }), justifyContent: JUSTIFY[s.align], alignItems: ALIGN_ITEMS[s.valign], padding: PADDING }}
            >
              <span className="min-w-0">
                <RichText text={bodyText} runs={el.bodyRuns} />
              </span>
            </div>
          ) : (
            <div className="h-full w-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-muted" style={{ fontFamily: FONT_STACK.sans, fontSize: 13, lineHeight: 1.5, padding: PADDING }} data-frame-hint="">
              {el.hint}
            </div>
          )}
        </foreignObject>
      )}
    </>
  )
}

/** mm:ss of a number of seconds (rounded up, so 0:00 only when the time is up). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** A timer: the time left, ticking while it runs; red when it is up. Everyone's clock counts down to the same end. */
function TimerShape({ el }: { el: BoxElement }) {
  const { timerLabels, now: clockNow, timerDoneStatus } = useContext(BoardRenderContextValue)
  const running = el.endsAt !== undefined
  const read = clockNow ?? Date.now
  const [now, setNow] = useState(() => read())
  useEffect(() => {
    if (!running) return
    const tick = window.setInterval(() => setNow(read()), 250)
    return () => window.clearInterval(tick)
  }, [running, read])
  // Never above its length (the clock read before the start, until the first tick).
  const left = Math.min(timerLeft(el, running ? now : 0), el.durationSec ?? Infinity)
  const done = running && left <= 0
  const color = done ? "var(--color-danger)" : STROKE_COLOR[el.stroke]
  const size = Math.min(el.h * 0.45, el.w / 4)
  return (
    <>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={12} style={{ fill: done ? "var(--color-danger-soft, var(--color-surface))" : FILL_COLOR[el.fill], stroke: color }} strokeWidth={done ? 4 : 2} />
      <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} className="pointer-events-none">
        <div className="flex h-full w-full flex-col items-center justify-center" style={{ color, fontFamily: FONT_STACK.mono, lineHeight: 1.1 }} role="timer" aria-label={timerLabels.aria.replace("{time}", clock(Math.ceil(left / 15) * 15))}>
          <span className="tabular-nums" style={{ fontSize: size, fontWeight: 700 }} data-timer-left={Math.ceil(left)}>
            {done ? timerLabels.done : clock(left)}
          </span>
          {/* Said once when the time is up (the clock itself is not read out every second). */}
          <span className="sr-only" role="status">
            {done ? (timerDoneStatus ?? timerLabels.done) : ""}
          </span>
          {el.voteBudget ? (
            <span style={{ fontSize: Math.max(11, size * 0.28), fontFamily: FONT_STACK.sans }}>{timerLabels.budget.replace("{n}", String(el.voteBudget))}</span>
          ) : null}
        </div>
      </foreignObject>
    </>
  )
}

/** The backlog item a box stands for: its number and state, read live (a confidential or deleted one says so). */
function PbiBadge({ el }: { el: BoxElement }) {
  const { pbi } = useContext(BoardRenderContextValue)
  const info = el.pbiId ? pbi(el.pbiId) : null
  const label = info ? info.label : "…"
  const tone = info?.tone ?? "neutral"
  const color = tone === "done" ? "var(--color-success)" : tone === "ready" ? "var(--color-primary)" : tone === "missing" ? "var(--color-danger)" : "var(--color-fg-muted)"
  const width = Math.min(el.w, Math.max(48, label.length * 7 + 22))
  return (
    <foreignObject x={el.x} y={el.y + el.h + 4} width={width} height={22} data-pbi-badge={el.pbiId} className="pointer-events-none">
      <div className="flex h-full items-center gap-1 truncate rounded-ui-sm border bg-surface px-1.5" style={{ borderColor: color, color, fontSize: 11, fontFamily: FONT_STACK.sans }}>
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </div>
    </foreignObject>
  )
}

/** The number of votes on a sticky note (a filled dot when the viewer voted). */
function Votes({ el }: { el: BoxElement }) {
  const { userId } = useContext(BoardRenderContextValue)
  const count = el.voters?.length ?? 0
  if (count === 0) return null
  const mine = !!userId && (el.voters ?? []).includes(userId)
  return (
    <g data-votes={count} transform={`translate(${el.x + el.w - 14} ${el.y + el.h - 14})`}>
      <circle r={11} style={{ fill: mine ? "var(--color-primary)" : "var(--color-surface)", stroke: "var(--color-primary)" }} strokeWidth={1.5} />
      <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight={700} style={{ fill: mine ? "var(--color-surface)" : "var(--color-primary)" }}>
        {count}
      </text>
    </g>
  )
}

/**
 * The link mark: a real anchor (new tab, no opener), so it also works on a read-only board and from the keyboard
 * of a screen reader user. Its pointer-down does not start a drag on the canvas.
 */
function LinkMark({ href, at }: { href: string; at: Point }) {
  const { linkLabel } = useContext(BoardRenderContextValue)
  const label = linkLabel(href)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-link={href}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      className="outline-none [&:focus-visible>circle]:[stroke-width:3] [&:focus-visible>circle]:[stroke:var(--color-focus,var(--color-primary))]"
    >
      <title>{label}</title>
      <circle cx={at.x} cy={at.y} r={9} style={{ fill: "var(--color-surface)", stroke: "var(--color-primary)", cursor: "pointer" }} strokeWidth={1.5} />
      <path
        d={`M${at.x - 3} ${at.y + 3}L${at.x + 3} ${at.y - 3}M${at.x - 1} ${at.y - 3.5}L${at.x + 3.5} ${at.y - 3.5}L${at.x + 3.5} ${at.y + 1}`}
        fill="none"
        style={{ stroke: "var(--color-primary)", pointerEvents: "none" }}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </a>
  )
}
