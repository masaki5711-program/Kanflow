import { describe, expect, it } from "vitest"
import { getTranslations, type Language } from "@/lib/i18n"

/** Same composition as board.tsx onAnnounce("pickUp"). */
function pickUpAnnouncement(language: Language, column: string): string {
  const t = getTranslations(language)
  const over = t.sprintBoardOverColumn.replace("{column}", column).replace("{position}", "1").replace("{total}", "3")
  return t.sprintBoardPickedUp.replace("{name}", "Task").replace("{column}", over)
}

describe("keyboard drag pick-up announcement (S-15a)", () => {
  it.each([
    ["id", /kolom/gi],
    ["en", /column/gi],
    ["ja", /列/g],
  ] as const)("names the column word only once in %s", (language, word) => {
    const text = pickUpAnnouncement(language, getTranslations(language).taskTodo)
    expect(text.match(word)).toHaveLength(1)
  })

  it("still names the task, the column and its position", () => {
    const id = getTranslations("id")
    expect(pickUpAnnouncement("id", id.taskTodo)).toBe(`“Task” diangkat. Posisi saat ini: Kolom ${id.taskTodo} (1 dari 3).`)
  })
})
