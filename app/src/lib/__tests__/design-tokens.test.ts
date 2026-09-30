import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  CHART_GRID_COLOR,
  CHART_SERIES_COLORS,
  SPRINT_STATUS_TONE,
  TOKEN_HEX,
  TONE_COLOR,
  TONE_SOFT,
  sprintStatusTone,
} from "../design-tokens"

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8")

function cssToken(name: string): string | undefined {
  return css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()
}

const HEX_TOKEN_NAMES: Record<keyof typeof TOKEN_HEX, string> = {
  primary: "color-primary",
  success: "color-success",
  warning: "color-warning",
  danger: "color-danger",
  info: "color-info",
  border: "color-border",
  fg: "color-fg",
  fgMuted: "color-fg-muted",
}

describe("design tokens", () => {
  it("TOKEN_HEX mirrors globals.css", () => {
    for (const [key, token] of Object.entries(HEX_TOKEN_NAMES)) {
      expect(TOKEN_HEX[key as keyof typeof TOKEN_HEX], token).toBe(cssToken(token))
    }
  })

  it("every referenced CSS variable is defined in globals.css", () => {
    const vars = [...Object.values(TONE_COLOR), ...Object.values(TONE_SOFT), ...CHART_SERIES_COLORS, CHART_GRID_COLOR]
    for (const v of vars) {
      const name = v.match(/^var\(--(.+)\)$/)?.[1]
      expect(name, v).toBeTruthy()
      expect(cssToken(name as string), name).toBeDefined()
    }
  })

  it("maps sprint statuses to the same tones as the sprint badges", () => {
    expect(SPRINT_STATUS_TONE).toMatchObject({ planning: "warning", active: "primary", review: "info", done: "success" })
    expect(sprintStatusTone("unknown")).toBe("neutral")
  })
})
