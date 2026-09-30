import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import {
  DailyFileWriter,
  datedFileName,
  localDateStamp,
  parseDatedFileName,
  pruneRotatedFiles,
  retentionCutoffStamp,
} from "@/lib/logger/rotation"

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0)

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kanflow-rot-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("file naming", () => {
  it("builds and parses <base>-YYYY-MM-DD<ext>", () => {
    const name = datedFileName("app", day(2026, 9, 3))
    expect(name).toBe("app-2026-09-03.log")
    expect(parseDatedFileName(name, "app", ".log")).toBe("2026-09-03")
  })

  it("does not match other bases or extensions", () => {
    expect(parseDatedFileName("ai-activity-2026-09-03.log", "app", ".log")).toBeNull()
    expect(parseDatedFileName("app-2026-09-03.txt", "app", ".log")).toBeNull()
    expect(parseDatedFileName("app.log", "app", ".log")).toBeNull()
  })

  it("computes the retention cutoff with today counted as day 1", () => {
    expect(retentionCutoffStamp(day(2026, 9, 23), 14)).toBe("2026-09-10")
    expect(retentionCutoffStamp(day(2026, 9, 23), 1)).toBe("2026-09-23")
  })
})

describe("pruneRotatedFiles", () => {
  it("deletes dated files older than retention and keeps everything else", async () => {
    const files = [
      "app-2026-09-19.log",
      "app-2026-09-20.log",
      "app-2026-09-21.log",
      "app-2026-09-23.log",
      "other-2026-01-01.log",
      "app.log",
    ]
    await Promise.all(files.map((f) => writeFile(path.join(dir, f), "x")))

    const deleted = await pruneRotatedFiles(dir, "app", ".log", 3, day(2026, 9, 23))

    expect(deleted.sort()).toEqual(["app-2026-09-19.log", "app-2026-09-20.log"])
    expect((await readdir(dir)).sort()).toEqual([
      "app-2026-09-21.log",
      "app-2026-09-23.log",
      "app.log",
      "other-2026-01-01.log",
    ])
  })
})

describe("DailyFileWriter", () => {
  it("dated mode writes each day to its own file and prunes old ones", async () => {
    let now = day(2026, 9, 1)
    await writeFile(path.join(dir, "app-2026-08-01.log"), "old\n")
    const w = new DailyFileWriter({ dir, baseName: "app", retentionDays: 2, now: () => now })

    w.write("a\n")
    w.write("b\n")
    await w.flush()
    now = day(2026, 9, 2)
    w.write("c\n")
    await w.flush()

    expect((await readdir(dir)).sort()).toEqual(["app-2026-09-01.log", "app-2026-09-02.log"])
    expect(await readFile(path.join(dir, "app-2026-09-01.log"), "utf8")).toBe("a\nb\n")
    expect(await readFile(path.join(dir, "app-2026-09-02.log"), "utf8")).toBe("c\n")
  })

  it("live mode keeps a fixed file name and rotates yesterday's content by mtime", async () => {
    const live = path.join(dir, "ai-activity.log")
    await writeFile(live, "yesterday\n")
    const yesterday = day(2026, 9, 22)
    await utimes(live, yesterday, yesterday)
    const w = new DailyFileWriter({ dir, baseName: "ai-activity", mode: "live", now: () => day(2026, 9, 23) })

    w.write("today\n")
    await w.flush()

    expect(await readFile(live, "utf8")).toBe("today\n")
    const rotated = path.join(dir, `ai-activity-${localDateStamp(yesterday)}.log`)
    expect(await readFile(rotated, "utf8")).toBe("yesterday\n")
  })

  it("creates the directory lazily and never rejects", async () => {
    const nested = path.join(dir, "a", "b")
    const w = new DailyFileWriter({ dir: nested, baseName: "app", now: () => day(2026, 9, 23) })

    w.write("x\n")

    await expect(w.flush()).resolves.toBeUndefined()
    expect(await readdir(nested)).toEqual(["app-2026-09-23.log"])
  })
})
