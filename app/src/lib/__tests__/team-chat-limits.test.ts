import { describe, expect, it } from "vitest"
import {
  TEAM_CHAT_MAX_FILES,
  TEAM_CHAT_MAX_FILE_BYTES,
  TEAM_CHAT_MAX_TOTAL_BYTES,
  checkTeamChatFiles,
} from "../team-chat-limits"

const file = (name: string, size: number) => ({ name, size })

describe("checkTeamChatFiles", () => {
  it("allows an empty list", () => {
    expect(checkTeamChatFiles([])).toBeNull()
  })

  it("allows files within every limit", () => {
    expect(checkTeamChatFiles([file("a.txt", 100), file("b.txt", 200)])).toBeNull()
  })

  it("rejects more than TEAM_CHAT_MAX_FILES files", () => {
    const files = Array.from({ length: TEAM_CHAT_MAX_FILES + 1 }, (_, i) => file(`f${i}.txt`, 1))
    expect(checkTeamChatFiles(files)).toEqual({ reason: "too_many" })
  })

  it("allows exactly TEAM_CHAT_MAX_FILES files", () => {
    const files = Array.from({ length: TEAM_CHAT_MAX_FILES }, (_, i) => file(`f${i}.txt`, 1))
    expect(checkTeamChatFiles(files)).toBeNull()
  })

  it("rejects a single file over TEAM_CHAT_MAX_FILE_BYTES, naming it", () => {
    const result = checkTeamChatFiles([file("huge.zip", TEAM_CHAT_MAX_FILE_BYTES + 1)])
    expect(result).toEqual({ reason: "too_large", name: "huge.zip" })
  })

  it("allows a file at exactly the per-file limit", () => {
    expect(checkTeamChatFiles([file("exact.zip", TEAM_CHAT_MAX_FILE_BYTES)])).toBeNull()
  })

  it("reports the first oversized file when several are too large", () => {
    const result = checkTeamChatFiles([file("ok.txt", 1), file("first-big.zip", TEAM_CHAT_MAX_FILE_BYTES + 1), file("second-big.zip", TEAM_CHAT_MAX_FILE_BYTES + 1)])
    expect(result).toEqual({ reason: "too_large", name: "first-big.zip" })
  })

  it("rejects when the combined size exceeds TEAM_CHAT_MAX_TOTAL_BYTES even though each file is individually within the per-file limit", () => {
    // 3 files at the per-file max (20 MB) = 60 MB > the 50 MB total cap.
    const files = [file("a.zip", TEAM_CHAT_MAX_FILE_BYTES), file("b.zip", TEAM_CHAT_MAX_FILE_BYTES), file("c.zip", TEAM_CHAT_MAX_FILE_BYTES)]
    expect(checkTeamChatFiles(files)).toEqual({ reason: "total_too_large" })
  })

  it("allows a combined size at exactly the total limit", () => {
    const files = [file("a.zip", TEAM_CHAT_MAX_FILE_BYTES), file("b.zip", TEAM_CHAT_MAX_FILE_BYTES), file("c.zip", TEAM_CHAT_MAX_TOTAL_BYTES - 2 * TEAM_CHAT_MAX_FILE_BYTES)]
    expect(checkTeamChatFiles(files)).toBeNull()
  })

  it("checks file count before per-file size (too_many takes priority)", () => {
    const files = Array.from({ length: TEAM_CHAT_MAX_FILES + 1 }, (_, i) => file(`f${i}.txt`, TEAM_CHAT_MAX_FILE_BYTES + 1))
    expect(checkTeamChatFiles(files)).toEqual({ reason: "too_many" })
  })
})
