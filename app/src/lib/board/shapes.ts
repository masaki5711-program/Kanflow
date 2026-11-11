/**
 * The shape library: outlines drawn inside a box (x, y, w, h) as an SVG path. The same path draws the shape on the
 * canvas and in the PNG / PDF export (Path2D). Pure.
 *
 * Process-chart symbols follow the ZEVA Academy "工程図記号" (operation = the ellipse tool, transport, inspection of
 * quantity / quality, storage, delay).
 */

export const SHAPE_KINDS = [
  "diamond",
  "triangle",
  "storage",
  "hexagon",
  "parallelogram",
  "chevron",
  "blockArrow",
  "cylinder",
  "document",
  "delay",
  "transport",
  "inspectQty",
  "person",
  "factory",
  "truck",
  "cloud",
  "star",
] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

/** Groups of the library (the menu lists them under these headings). */
export const SHAPE_GROUPS: readonly { key: "basic" | "flow" | "process" | "site"; kinds: readonly ShapeKind[] }[] = [
  { key: "basic", kinds: ["diamond", "triangle", "hexagon", "parallelogram", "star", "cloud"] },
  { key: "flow", kinds: ["chevron", "blockArrow", "cylinder", "document"] },
  { key: "process", kinds: ["transport", "inspectQty", "storage", "delay"] },
  { key: "site", kinds: ["person", "factory", "truck"] },
]

/** Size of a shape placed from the library. */
export const SHAPE_SIZE: Readonly<Record<ShapeKind, { w: number; h: number }>> = {
  diamond: { w: 140, h: 100 },
  triangle: { w: 120, h: 100 },
  storage: { w: 100, h: 90 },
  hexagon: { w: 150, h: 90 },
  parallelogram: { w: 160, h: 80 },
  chevron: { w: 160, h: 70 },
  blockArrow: { w: 160, h: 80 },
  cylinder: { w: 110, h: 120 },
  document: { w: 140, h: 100 },
  delay: { w: 110, h: 90 },
  transport: { w: 140, h: 80 },
  inspectQty: { w: 100, h: 100 },
  person: { w: 70, h: 120 },
  factory: { w: 160, h: 110 },
  truck: { w: 170, h: 90 },
  cloud: { w: 170, h: 100 },
  star: { w: 120, h: 120 },
}

const n = (v: number) => Math.round(v * 100) / 100

function poly(points: readonly [number, number][]): string {
  return points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${n(px)} ${n(py)}`).join("") + "Z"
}

/** The outline of a shape in the box (SVG path data, absolute coordinates). */
export function shapePath(kind: ShapeKind, x: number, y: number, w: number, h: number): string {
  const r = x + w
  const b = y + h
  const cx = x + w / 2
  const cy = y + h / 2
  switch (kind) {
    case "diamond":
      return poly([
        [cx, y],
        [r, cy],
        [cx, b],
        [x, cy],
      ])
    case "triangle":
      return poly([
        [cx, y],
        [r, b],
        [x, b],
      ])
    case "storage":
      // ▽ (貯蔵)
      return poly([
        [x, y],
        [r, y],
        [cx, b],
      ])
    case "hexagon": {
      const d = Math.min(w / 4, h / 2)
      return poly([
        [x + d, y],
        [r - d, y],
        [r, cy],
        [r - d, b],
        [x + d, b],
        [x, cy],
      ])
    }
    case "parallelogram": {
      const d = Math.min(w / 4, h * 0.6)
      return poly([
        [x + d, y],
        [r, y],
        [r - d, b],
        [x, b],
      ])
    }
    case "chevron": {
      // 矢羽根
      const d = Math.min(w / 3, h / 2)
      return poly([
        [x, y],
        [r - d, y],
        [r, cy],
        [r - d, b],
        [x, b],
        [x + d, cy],
      ])
    }
    case "blockArrow": {
      const head = Math.min(w * 0.4, h)
      return poly([
        [x, y + h * 0.25],
        [r - head, y + h * 0.25],
        [r - head, y],
        [r, cy],
        [r - head, b],
        [r - head, y + h * 0.75],
        [x, y + h * 0.75],
      ])
    }
    case "cylinder": {
      const e = Math.min(h * 0.12, w * 0.3)
      return `M${n(x)} ${n(y + e)}A${n(w / 2)} ${n(e)} 0 0 1 ${n(r)} ${n(y + e)}L${n(r)} ${n(b - e)}A${n(w / 2)} ${n(e)} 0 0 1 ${n(x)} ${n(b - e)}Z M${n(x)} ${n(y + e)}A${n(w / 2)} ${n(e)} 0 0 0 ${n(r)} ${n(y + e)}`
    }
    case "document": {
      const wave = h * 0.12
      return `M${n(x)} ${n(y)}L${n(r)} ${n(y)}L${n(r)} ${n(b - wave)}C${n(x + w * 0.75)} ${n(b - wave * 3)} ${n(x + w * 0.25)} ${n(b + wave)} ${n(x)} ${n(b - wave)}Z`
    }
    case "delay": {
      // D (滞留)
      const rr = Math.min(h / 2, w / 2)
      return `M${n(x)} ${n(y)}L${n(r - rr)} ${n(y)}A${n(rr)} ${n(h / 2)} 0 0 1 ${n(r - rr)} ${n(b)}L${n(x)} ${n(b)}Z`
    }
    case "transport": {
      // 運搬: a circle with an arrow under it
      const rad = Math.min(h * 0.22, w * 0.15)
      const ay = y + h * 0.72
      return `M${n(cx - rad)} ${n(y + rad + 2)}A${n(rad)} ${n(rad)} 0 1 0 ${n(cx + rad)} ${n(y + rad + 2)}A${n(rad)} ${n(rad)} 0 1 0 ${n(cx - rad)} ${n(y + rad + 2)}Z ${poly([
        [x, ay - h * 0.09],
        [r - w * 0.2, ay - h * 0.09],
        [r - w * 0.2, ay - h * 0.2],
        [r, ay],
        [r - w * 0.2, ay + h * 0.2],
        [r - w * 0.2, ay + h * 0.09],
        [x, ay + h * 0.09],
      ])}`
    }
    case "inspectQty":
      return poly([
        [x, y],
        [r, y],
        [r, b],
        [x, b],
      ])
    case "person": {
      const head = Math.min(w * 0.32, h * 0.18)
      const top = y + head * 2 + 4
      return `M${n(cx - head)} ${n(y + head)}A${n(head)} ${n(head)} 0 1 0 ${n(cx + head)} ${n(y + head)}A${n(head)} ${n(head)} 0 1 0 ${n(cx - head)} ${n(y + head)}Z ${poly([
        [x + w * 0.1, top + h * 0.06],
        [x + w * 0.9, top + h * 0.06],
        [x + w * 0.8, y + h * 0.62],
        [x + w * 0.66, y + h * 0.62],
        [x + w * 0.64, b],
        [x + w * 0.36, b],
        [x + w * 0.34, y + h * 0.62],
        [x + w * 0.2, y + h * 0.62],
      ])}`
    }
    case "factory":
      return poly([
        [x, b],
        [x, y + h * 0.45],
        [x + w * 0.25, y + h * 0.25],
        [x + w * 0.25, y + h * 0.45],
        [x + w * 0.5, y + h * 0.25],
        [x + w * 0.5, y + h * 0.45],
        [x + w * 0.72, y + h * 0.3],
        [x + w * 0.72, y],
        [x + w * 0.86, y],
        [x + w * 0.86, y + h * 0.3],
        [r, y + h * 0.3],
        [r, b],
      ])
    case "truck": {
      const wheel = Math.min(h * 0.14, w * 0.08)
      const base = b - wheel
      const body = poly([
        [x, y],
        [x + w * 0.62, y],
        [x + w * 0.62, y + h * 0.22],
        [x + w * 0.84, y + h * 0.22],
        [r, y + h * 0.5],
        [r, base],
        [x, base],
      ])
      const circle = (wx: number) => `M${n(wx - wheel)} ${n(base)}A${n(wheel)} ${n(wheel)} 0 1 0 ${n(wx + wheel)} ${n(base)}A${n(wheel)} ${n(wheel)} 0 1 0 ${n(wx - wheel)} ${n(base)}Z`
      return `${body} ${circle(x + w * 0.2)} ${circle(x + w * 0.8)}`
    }
    case "cloud":
      return `M${n(x + w * 0.25)} ${n(b - h * 0.1)}A${n(w * 0.18)} ${n(h * 0.25)} 0 0 1 ${n(x + w * 0.2)} ${n(y + h * 0.42)}A${n(w * 0.2)} ${n(h * 0.3)} 0 0 1 ${n(x + w * 0.52)} ${n(y + h * 0.18)}A${n(w * 0.2)} ${n(h * 0.28)} 0 0 1 ${n(x + w * 0.84)} ${n(y + h * 0.4)}A${n(w * 0.16)} ${n(h * 0.25)} 0 0 1 ${n(x + w * 0.78)} ${n(b - h * 0.1)}Z`
    case "star": {
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const rad = i % 2 === 0 ? 1 : 0.42
        pts.push([cx + Math.cos(angle) * (w / 2) * rad, cy + Math.sin(angle) * (h / 2) * rad])
      }
      return poly(pts)
    }
  }
}

/** Where the text of a shape sits (inside its outline, away from the pointed or round parts). */
export function shapeTextRect(kind: ShapeKind, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  switch (kind) {
    case "diamond":
    case "star":
      return { x: x + w * 0.22, y: y + h * 0.25, w: w * 0.56, h: h * 0.5 }
    case "triangle":
      return { x: x + w * 0.2, y: y + h * 0.45, w: w * 0.6, h: h * 0.5 }
    case "storage":
      return { x: x + w * 0.2, y: y + 2, w: w * 0.6, h: h * 0.5 }
    case "transport":
      return { x, y: y + h * 0.55, w: w * 0.78, h: h * 0.45 }
    case "person":
      return { x: x - w * 0.5, y: y + h, w: w * 2, h: 32 }
    case "truck":
      return { x, y, w: w * 0.62, h: h * 0.8 }
    case "cylinder":
      return { x, y: y + h * 0.2, w, h: h * 0.7 }
    default:
      return { x, y, w, h }
  }
}
