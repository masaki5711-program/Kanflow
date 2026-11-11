import { createContext, memo, useContext, type CSSProperties } from "react"
import { FRAME_TITLE_HEIGHT, lineGeometry, type ElementMap, type LineGeometry, type Point } from "@/lib/board/geometry"
import { isBox, isHttpUrl, isLine, type BoardElement, type BoxElement, type LineElement } from "@/lib/board/model"
import { FILL_COLOR, STROKE_COLOR } from "@/lib/board/palette"
import { ALIGN_ITEMS, boxOutline, dashArray, FONT_STACK, JUSTIFY, lineStyle, TEXT_PADDING as PADDING, textStyle } from "@/lib/board/style"

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
}

export const BoardRenderContextValue = createContext<BoardRenderContext>({ fileUrl: () => "", userId: null, linkLabel: (url) => url, imageAlt: "" })

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
export function textCss(el: BoxElement, zoom = 1): CSSProperties {
  const s = textStyle(el)
  return {
    color: textColor(el),
    fontSize: s.fontSize * zoom,
    fontFamily: FONT_STACK[s.fontFamily],
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textAlign: s.align,
    lineHeight: 1.4,
  }
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
  /** A table cell being edited ("row:col"). */
  hideCell?: string | null
}

const sameRoute = (p?: LineGeometry, q?: LineGeometry) => p === q || (!!p && !!q && p.d === q.d && p.mid.x === q.mid.x && p.mid.y === q.mid.y)

/**
 * One element as SVG, in sheet coordinates. Types this build does not know are not drawn. Memoized: during a drag
 * only the moved elements (new objects) and the lines whose route moved are drawn again, not the whole sheet.
 */
export const ElementView = memo(
  function ElementView({ el, ends, hideText, hideCell }: ElementViewProps) {
    if (isLine(el)) return ends ? <LineShape el={el} geometry={ends} hideText={hideText} /> : null
    if (!isBox(el)) return null
    return <BoxShape el={el} hideText={hideText} hideCell={hideCell ?? null} />
  },
  (prev, next) => prev.el === next.el && prev.hideText === next.hideText && prev.hideCell === next.hideCell && sameRoute(prev.ends, next.ends),
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

function BoxShape({ el, hideText, hideCell }: { el: BoxElement; hideText?: boolean; hideCell: string | null }) {
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
        <FrameShape el={el} hideText={hideText} />
      ) : el.type === "sticky" ? (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={2} style={{ fill, stroke: shapeStroke }} {...strokeProps} strokeOpacity={0.6} />
      ) : (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={el.type === "rect" ? 3 : 0} style={{ fill, stroke: shapeStroke }} {...strokeProps} />
      )}
      {!hideText && el.text !== "" && el.type !== "frame" && el.type !== "table" && el.type !== "image" && <BoxText el={el} />}
      {el.type === "sticky" && <Votes el={el} />}
      {el.link && isHttpUrl(el.link) && <LinkMark href={el.link} at={{ x: el.x + el.w - 10, y: el.y - 10 }} />}
    </g>
  )
}

function BoxText({ el }: { el: BoxElement }) {
  const s = textStyle(el)
  return (
    <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} className="pointer-events-none">
      <div
        className="flex h-full w-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]"
        style={{ ...textCss(el), justifyContent: JUSTIFY[s.align], alignItems: ALIGN_ITEMS[s.valign], padding: TEXT_PADDING }}
      >
        <span className="min-w-0">{el.text}</span>
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
                  style={{ ...css, border, padding: "2px 6px", verticalAlign: s.valign === "middle" ? "middle" : s.valign, fontWeight: i === 0 && s.bold ? 700 : css.fontWeight }}
                >
                  {hideCell === `${i}:${j}` ? "" : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </foreignObject>
  )
}

function FrameShape({ el, hideText }: { el: BoxElement; hideText?: boolean }) {
  const outline = boxOutline(el)
  const stroke = STROKE_COLOR[el.stroke]
  return (
    <>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={6} style={{ fill: FILL_COLOR[el.fill], stroke }} strokeWidth={Math.max(1, outline.width)} strokeDasharray={dashArray(outline.dash, Math.max(1, outline.width))} />
      <rect x={el.x} y={el.y} width={el.w} height={FRAME_TITLE_HEIGHT} rx={6} style={{ fill: "var(--color-surface-sunken)" }} opacity={0.9} />
      {!hideText && (
        <foreignObject x={el.x} y={el.y} width={el.w} height={FRAME_TITLE_HEIGHT} className="pointer-events-none">
          <div className="truncate px-2" style={{ ...textCss(el), textAlign: "left", lineHeight: `${FRAME_TITLE_HEIGHT}px`, fontSize: Math.min(textStyle(el).fontSize, 20) }}>
            {el.text}
          </div>
        </foreignObject>
      )}
    </>
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
