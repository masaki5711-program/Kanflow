/**
 * Placement of a small menu portaled to <body> (position: fixed) next to its
 * anchor button: below and right-aligned when it fits, flipped above when the
 * space below is short, always kept inside the viewport (scrolls when neither
 * side has room for all items).
 */

/** Gap between the menu and the viewport edges (px). */
export const MENU_VIEWPORT_MARGIN = 8
/** Gap between the anchor and the menu (px). */
export const MENU_OFFSET = 4

export interface MenuAnchor {
  top: number
  bottom: number
  left: number
  right: number
}

export interface MenuPlacement {
  top: number
  left: number
  /** Height available on the chosen side (the menu scrolls beyond it). */
  maxHeight: number
  side: "bottom" | "top"
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

export function placeMenu(
  anchor: MenuAnchor,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin: number = MENU_VIEWPORT_MARGIN,
): MenuPlacement {
  const below = Math.max(0, viewport.height - margin - (anchor.bottom + MENU_OFFSET))
  const above = Math.max(0, anchor.top - MENU_OFFSET - margin)
  const side = menu.height <= below || below >= above ? "bottom" : "top"
  const room = side === "bottom" ? below : above
  const height = Math.min(menu.height, room)
  const top = side === "bottom" ? anchor.bottom + MENU_OFFSET : anchor.top - MENU_OFFSET - height
  const width = Math.min(menu.width, viewport.width - margin * 2)
  const left = clamp(anchor.right - width, margin, viewport.width - margin - width)
  return { top: Math.round(top), left: Math.round(left), maxHeight: Math.floor(room), side }
}
