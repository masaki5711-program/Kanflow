import { describe, expect, it } from "vitest"
import { MAX_OFFICE_BYTES, MAX_TEXT_BYTES, decideFile, isSecretFileName, normalizePathFilter, parsePathFilter } from "../repo-index-rules"

describe("decideFile — included types", () => {
  it.each(["README.md", "docs/spec.markdown", "notes.txt", "data/plan.csv", "api/openapi.yaml", "db/schema.sql", "src/app.ts", "edge/main.rs", "tools/run.ps1", "Dockerfile"])(
    "indexes %s as text",
    (path) => expect(decideFile(path)).toEqual({ index: true, kind: "text", maxBytes: MAX_TEXT_BYTES }),
  )

  it.each(["documents/仕様.docx", "plan.xlsx", "deck.pptx", "manual.pdf"])("indexes %s as an Office / PDF document", (path) =>
    expect(decideFile(path)).toEqual({ index: true, kind: "office", maxBytes: MAX_OFFICE_BYTES }),
  )
})

describe("decideFile — exclusions", () => {
  it.each(["diagram.png", "logo.svg", "photo.JPG", "archive.zip", "app.exe", "font.woff2", "legacy.doc"])("skips %s (type)", (path) =>
    expect(decideFile(path)).toEqual({ index: false, reason: "type" }),
  )

  it.each(["node_modules/x/index.js", "vendor/lib.go", "dist/app.js", "build/out.txt", ".git/config", "a/__pycache__/m.py", "x/.venv/lib.py"])(
    "skips %s (dependency / build folder)",
    (path) => expect(decideFile(path)).toEqual({ index: false, reason: "excluded" }),
  )

  it.each(["package-lock.json", "web/yarn.lock", "Cargo.lock", "go.sum", "public/app.min.js", "styles.min.css", "app.js.map"])(
    "skips %s (lockfile / minified)",
    (path) => expect(decideFile(path)).toEqual({ index: false, reason: "excluded" }),
  )

  it.each([".env", ".env.production", "config/.env.local", "certs/server.pem", "tls/private.key", "keys/cert.pfx", "store.p12", "id_rsa", "id_ed25519.pub", ".npmrc", "config/credentials.json", "aws_credentials.yml", "secrets.yaml", "app-secret.properties", "db-password.txt", "infra/terraform.tfstate"])(
    "never reads %s (secret)",
    (path) => expect(decideFile(path)).toEqual({ index: false, reason: "secret" }),
  )

  it("still reads a design document ABOUT secrets", () => {
    expect(decideFile("docs/secret-management.md").index).toBe(true)
    expect(decideFile("docs/password-policy.md").index).toBe(true)
  })

  it("refuses paths longer than the column", () => {
    expect(decideFile(`${"a/".repeat(300)}x.md`)).toEqual({ index: false, reason: "path" })
  })
})

describe("folder filter", () => {
  it("parses comma / newline separated prefixes, normalising slashes", () => {
    expect(parsePathFilter("docs, ./specs/api/\n/10-pfs")).toEqual(["docs/", "specs/api/", "10-pfs/"])
    expect(parsePathFilter("")).toEqual([])
    expect(parsePathFilter(null)).toEqual([])
  })

  it("rejects traversal and odd characters", () => {
    expect(parsePathFilter("../etc")).toBeNull()
    expect(parsePathFilter("docs/*")).toBeNull()
    expect(parsePathFilter(Array.from({ length: 21 }, (_, i) => `d${i}`).join(","))).toBeNull()
  })

  it("normalises the stored form, null meaning the whole repository", () => {
    expect(normalizePathFilter(" docs ,specs/ ")).toBe("docs/, specs/")
    expect(normalizePathFilter("  ")).toBeNull()
  })

  it("limits indexing to the prefixes", () => {
    expect(decideFile("docs/a.md", ["docs/"]).index).toBe(true)
    expect(decideFile("src/a.ts", ["docs/"])).toEqual({ index: false, reason: "filter" })
    expect(decideFile("docsx/a.md", ["docs/"])).toEqual({ index: false, reason: "filter" })
  })
})

describe("isSecretFileName", () => {
  it("is case-insensitive", () => {
    expect(isSecretFileName("ID_RSA")).toBe(true)
    expect(isSecretFileName("Server.PEM")).toBe(true)
    expect(isSecretFileName("readme.md")).toBe(false)
  })
})
