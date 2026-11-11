import { resolveLine, type ElementMap, type Point } from "@/lib/board/geometry"
import { isBox, isLine, type BoardElement, type BoxElement } from "@/lib/board/model"
import { FILL_COLOR, STROKE_COLOR } from "@/lib/board/palette"
import { cn } from "@/components/ui"

/** Outline width and text size in sheet units (they scale with the zoom). */
export const STROKE_WIDTH = 2
export const TEXT_SIZE = 14
export const TEXT_PADDING = 6
const ARROW_HEAD = 12

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

/** Colour of the text of a box: a text element is written in its line colour, text inside a shape in the foreground colour. */
export function textColor(el: BoxElement): string {
  return el.type === "text" ? STROKE_COLOR[el.stroke] : "var(--color-fg)"
}

interface ElementViewProps {
  el: BoardElement
  /** The sheet's elements (a line needs the boxes it is attached to). */
  elements: ElementMap
  /** The text is being edited in the overlay: do not draw it twice. */
  hideText?: boolean
}

/** One element as SVG, in sheet coordinates. Types this build does not know are not drawn. */
export function ElementView({ el, elements, hideText }: ElementViewProps) {
  if (isLine(el)) {
    const { a, b } = resolveLine(el, elements)
    const stroke = STROKE_COLOR[el.stroke]
    const head = el.type === "arrow" ? arrowHeadPoints(a, b) : []
    return (
      <g data-element-id={el.id} data-element-type={el.type}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ stroke }} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
        {head.length > 0 && <polygon points={head.map((p) => `${p.x},${p.y}`).join(" ")} style={{ fill: stroke, stroke }} strokeWidth={1} strokeLinejoin="round" />}
      </g>
    )
  }
  if (!isBox(el)) return null

  const fill = FILL_COLOR[el.fill]
  const stroke = STROKE_COLOR[el.stroke]
  const centered = el.type !== "text"
  return (
    <g data-element-id={el.id} data-element-type={el.type}>
      {el.type === "ellipse" ? (
        <ellipse cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} style={{ fill, stroke }} strokeWidth={STROKE_WIDTH} />
      ) : el.type === "rect" ? (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={3} style={{ fill, stroke }} strokeWidth={STROKE_WIDTH} />
      ) : el.type === "sticky" ? (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={2} style={{ fill, stroke }} strokeWidth={1} strokeOpacity={0.35} />
      ) : (
        // A text element has no outline; a fill, when chosen, is its background.
        <rect x={el.x} y={el.y} width={el.w} height={el.h} style={{ fill }} stroke="none" />
      )}
      {!hideText && el.text !== "" && (
        <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} className="pointer-events-none">
          <div
            className={cn(
              "flex h-full w-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]",
              centered ? "items-center justify-center text-center" : "items-start justify-start text-left",
            )}
            style={{ color: textColor(el), fontSize: TEXT_SIZE, lineHeight: 1.4, padding: TEXT_PADDING }}
          >
            {el.text}
          </div>
        </foreignObject>
      )}
    </g>
  )
}
