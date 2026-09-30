import { describe, expect, it } from "vitest"
import { MENU_OFFSET, MENU_VIEWPORT_MARGIN, placeMenu } from "../menu-placement"

const viewport = { width: 1440, height: 900 }
const anchorAt = (top: number, right = 700) => ({ top, bottom: top + 28, left: right - 28, right })

describe("placeMenu", () => {
  it("opens below, right-aligned to the button, when it fits", () => {
    const p = placeMenu(anchorAt(100), { width: 180, height: 300 }, viewport)
    expect(p).toEqual({ top: 128 + MENU_OFFSET, left: 700 - 180, maxHeight: 900 - MENU_VIEWPORT_MARGIN - 132, side: "bottom" })
  })

  it("flips above when the space below is short (N-01: bottom rows of the plan)", () => {
    const p = placeMenu(anchorAt(760), { width: 180, height: 330 }, viewport)
    expect(p.side).toBe("top")
    expect(p.top).toBe(760 - MENU_OFFSET - 330)
    expect(p.top + 330).toBeLessThanOrEqual(760)
  })

  it("stays inside the viewport horizontally and scrolls when neither side has room", () => {
    const left = placeMenu({ top: 100, bottom: 128, left: 0, right: 20 }, { width: 180, height: 50 }, viewport)
    expect(left.left).toBe(MENU_VIEWPORT_MARGIN)
    const tall = placeMenu(anchorAt(400), { width: 180, height: 2000 }, viewport)
    expect(tall.side).toBe("bottom")
    expect(tall.top + tall.maxHeight).toBeLessThanOrEqual(900 - MENU_VIEWPORT_MARGIN)
    const phone = placeMenu(anchorAt(100, 370), { width: 500, height: 50 }, { width: 375, height: 700 })
    expect(phone.left).toBe(MENU_VIEWPORT_MARGIN)
  })
})
