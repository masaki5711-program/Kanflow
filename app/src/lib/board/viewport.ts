import type { Point, Rect } from "./geometry"

/**
 * The view onto a sheet: screen = sheet × zoom + (x, y). Pan and zoom are pure functions of the previous
 * viewport; the canvas keeps the result in state.
 */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/** The zoom levels the buttons step through. */
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function toSheet(v: Viewport, screen: Point): Point {
  return { x: (screen.x - v.x) / v.zoom, y: (screen.y - v.y) / v.zoom }
}

export function toScreen(v: Viewport, sheet: Point): Point {
  return { x: sheet.x * v.zoom + v.x, y: sheet.y * v.zoom + v.y }
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy }
}

/** Zooms to `zoom`, keeping the sheet point under `anchor` (a screen point) where it is. */
export function zoomAt(v: Viewport, anchor: Point, zoom: number): Viewport {
  const next = clampZoom(zoom)
  const fixed = toSheet(v, anchor)
  return { zoom: next, x: anchor.x - fixed.x * next, y: anchor.y - fixed.y * next }
}

/** The next zoom level of the + / − buttons. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STEPS.find((step) => step > zoom + 1e-9) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - 1e-9) ?? MIN_ZOOM
}

/** Zoom factor of one wheel event (Ctrl + wheel, or a touchpad pinch): smooth, bounded per event. */
export function wheelZoom(zoom: number, deltaY: number): number {
  const bounded = Math.max(-100, Math.min(100, deltaY))
  return clampZoom(zoom * Math.exp(-bounded * 0.01))
}

/**
 * The viewport that shows all of `bounds` centred in a canvas of `size`, never above 100 %. With nothing
 * drawn, the origin at 100 %.
 */
export function fitViewport(bounds: Rect | null, size: { width: number; height: number }, padding = 48): Viewport {
  if (!bounds || size.width <= 0 || size.height <= 0) return INITIAL_VIEWPORT
  const availableW = Math.max(1, size.width - padding * 2)
  const availableH = Math.max(1, size.height - padding * 2)
  const zoom = clampZoom(Math.min(1, availableW / Math.max(1, bounds.w), availableH / Math.max(1, bounds.h)))
  return {
    zoom,
    x: size.width / 2 - (bounds.x + bounds.w / 2) * zoom,
    y: size.height / 2 - (bounds.y + bounds.h / 2) * zoom,
  }
}
