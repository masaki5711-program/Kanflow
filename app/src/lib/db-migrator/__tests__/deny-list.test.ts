import { describe, expect, it } from "vitest"
import { assertTargetAllowed, loadDenyList, parseDenyEntries } from "../deny-list"
import { MigratorError } from "../errors"
import { parseEndpoint } from "../args"

const SRC = "mysql://reader@127.0.0.1:23306/scrum_tool"

function target(url: string) {
  return parseEndpoint(url, "postgresql", "--target")
}

function source(url: string) {
  return parseEndpoint(url, "mysql", "--source")
}

function refusal(fn: () => void): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof MigratorError ? e.code : String(e)
  }
  return undefined
}

describe("parseDenyEntries", () => {
  it("parses host:port/db lines, comments, blanks and wildcards", () => {
    const entries = parseDenyEntries("# production\nkanflow-db.internal:5432/scrum_tool\n\n127.0.0.1:25434/*\n*:6543/*\nhost-only\n")
    expect(entries).toEqual([
      { host: "kanflow-db.internal", port: 5432, database: "scrum_tool", raw: "kanflow-db.internal:5432/scrum_tool" },
      { host: "loopback", port: 25434, database: "*", raw: "127.0.0.1:25434/*" },
      { host: "*", port: 6543, database: "*", raw: "*:6543/*" },
      { host: "host-only", port: "*", database: "*", raw: "host-only" },
    ])
  })

  it("rejects malformed entries instead of silently ignoring them", () => {
    expect(refusal(() => parseDenyEntries("db:notaport/x"))).toBe("DENY_LIST_INVALID")
  })
})

describe("loadDenyList", () => {
  it("merges the env variable and the file", () => {
    const entries = loadDenyList({ KANFLOW_MIGRATOR_DENY_TARGETS: "a:1/x, b:2/y" }, "c:3/z\n")
    expect(entries.map((e) => e.raw)).toEqual(["a:1/x", "b:2/y", "c:3/z"])
  })

  it("refuses to run without any deny-list entry (the guard must be configured)", () => {
    expect(refusal(() => loadDenyList({}, null))).toBe("DENY_LIST_MISSING")
    expect(refusal(() => loadDenyList({ KANFLOW_MIGRATOR_DENY_TARGETS: "  " }, "# only a comment\n"))).toBe("DENY_LIST_MISSING")
  })
})

describe("assertTargetAllowed", () => {
  const deny = parseDenyEntries("kanflow-db.internal:5432/scrum_tool\nlocalhost:25434/*\n")

  it("refuses an exact match", () => {
    expect(refusal(() => assertTargetAllowed(target("postgresql://w@kanflow-db.internal:5432/scrum_tool"), source(SRC), deny))).toBe("TARGET_DENIED")
  })

  it("is case-insensitive on the host and treats localhost / 127.0.0.1 / ::1 as one host", () => {
    expect(refusal(() => assertTargetAllowed(target("postgresql://w@KANFLOW-DB.internal:5432/scrum_tool"), source(SRC), deny))).toBe("TARGET_DENIED")
    expect(refusal(() => assertTargetAllowed(target("postgresql://w@127.0.0.1:25434/anything"), source(SRC), deny))).toBe("TARGET_DENIED")
    expect(refusal(() => assertTargetAllowed(target("postgresql://w@[::1]:25434/scrum_tool"), source(SRC), deny))).toBe("TARGET_DENIED")
  })

  it("allows a target that matches no entry", () => {
    expect(() => assertTargetAllowed(target("postgresql://w@127.0.0.1:25435/scrum_tool"), source(SRC), deny)).not.toThrow()
    expect(() => assertTargetAllowed(target("postgresql://w@kanflow-db.internal:5432/scrum_tool_new"), source(SRC), deny)).not.toThrow()
  })

  it("refuses a target on the same host:port as the source", () => {
    expect(refusal(() => assertTargetAllowed(target("postgresql://w@127.0.0.1:23306/x"), source(SRC), deny))).toBe("TARGET_DENIED")
  })
})
