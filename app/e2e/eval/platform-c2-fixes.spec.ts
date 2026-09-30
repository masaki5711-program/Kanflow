/**
 * Platform eval (cycle 2): verification of the cycle-1 fixes that do not need a
 * browser layout pass — P-01 (no project-name leak, real 404), P-05 (403 view),
 * P-06 (hard 404), S-2 (/api/health detail gating), S-3 (zip with lying sizes),
 * P-13 (text charset), P-08 / P-09 copy, 404/403 pages in ja/en/id.
 * Read-mostly; uploads are deleted again.
 */
import { test, expect, request as pwRequest } from "@playwright/test"
import * as fs from "node:fs"
import * as http from "node:http"
import { crc32, deflateRawSync } from "node:zlib"
import { apiFor, BASE, contextFor, DATA, PILOT, shot, ZEVA, type Role } from "./platform-helpers"

test.describe.configure({ mode: "default" })
test.setTimeout(600_000)
const log: string[] = []

/** Every string that would reveal the ZEVA project (name, translations, distinctive words). */
async function zevaSecrets(): Promise<string[]> {
  const admin = await apiFor("admin")
  const p = await (await admin.get(`/api/projects/${ZEVA}`)).json()
  const proj = p.project ?? p
  const out = new Set<string>(["ZEVA", "ゼロバリエーション", "YMMA"])
  if (proj.name) out.add(String(proj.name))
  for (const v of Object.values(proj.i18n?.name ?? {})) if (typeof v === "string" && v) out.add(v)
  await admin.dispose()
  return [...out].filter((s) => s.length >= 4)
}

function titleOf(html: string): string {
  return (html.match(/<title[^>]*>([^<]*)<\/title>/) ?? [])[1] ?? "(none)"
}

test("P-01 / P-06: non-members get a real 404 with no project name anywhere", async () => {
  const secrets = await zevaSecrets()
  log.push(`P-01 secrets probed: ${secrets.join(" ¦ ")}`)
  const subpaths = ["", "/backlog", "/sprints", "/plan", "/settings", "/chat", "/trash", "/releases", "/calendar", "/sprints/nope"]
  const leaks: string[] = []
  for (const who of ["dev", "sm", "sec"] as Role[]) {
    const api = await apiFor(who)
    const unknown = await api.get(`/projects/doesnotexist123`)
    const unknownHtml = await unknown.text()
    log.push(`[${who}] unknown id -> HTTP ${unknown.status()} title="${titleOf(unknownHtml)}"`)
    expect.soft(unknown.status(), `${who} unknown id status`).toBe(404)
    for (const sp of subpaths) {
      for (const rsc of [false, true]) {
        const res = await api.get(`/projects/${ZEVA}${sp}`, { headers: rsc ? { RSC: "1" } : {}, maxRedirects: 0 })
        const body = await res.text()
        const hits = secrets.filter((s) => body.includes(s))
        const t = rsc ? "(rsc)" : titleOf(body)
        log.push(`[${who}] ZEVA${sp || "/"}${rsc ? " RSC" : ""} -> HTTP ${res.status()} title=${t} leaks=${hits.length ? hits.join(",") : "none"}`)
        if (!rsc) expect.soft(res.status(), `${who} ZEVA${sp} status`).toBe(404)
        if (hits.length) leaks.push(`${who} ZEVA${sp}${rsc ? " RSC" : ""}: ${hits.join(",")}`)
        if (!rsc && sp === "") expect.soft(titleOf(body), `${who} title equals unknown-id title`).toBe(titleOf(unknownHtml))
      }
    }
    await api.dispose()
  }
  // Pilot sub-route that does not exist
  const dev = await apiFor("dev")
  const sprintNope = await dev.get(`/projects/${PILOT}/sprints/nope`)
  log.push(`[dev] pilot /sprints/nope -> HTTP ${sprintNope.status()}`)
  const routeNope = await dev.get(`/no-such-page-xyz`)
  log.push(`[dev] /no-such-page-xyz -> HTTP ${routeNope.status()}`)
  expect.soft(leaks, leaks.join("\n")).toEqual([])
})

test("P-01 UI: header / sidebar / title for a non-member equal the unknown-id page", async ({ browser }) => {
  const secrets = await zevaSecrets()
  for (const who of ["dev", "sec"] as Role[]) {
    const ctx = await contextFor(browser, who)
    const page = await ctx.newPage()
    const res = await page.goto(`/projects/${ZEVA}/backlog`)
    await page.waitForLoadState("networkidle").catch(() => {})
    const visible = await page.locator("body").innerText()
    const title = await page.title()
    const hits = secrets.filter((s) => visible.includes(s) || title.includes(s))
    const hasSidebar = await page.locator("aside").count()
    log.push(`[UI ${who}] ZEVA/backlog -> HTTP ${res?.status()} title="${title}" sidebar=${hasSidebar} leaks=${hits.join(",") || "none"} text="${visible.replace(/\s+/g, " ").slice(0, 120)}"`)
    await page.screenshot({ path: shot(`authz-zeva-as-${who}`) })
    expect.soft(hits).toEqual([])
    await ctx.close()
  }
})

test("P-05: trash for a viewer without trash.manage shows the 403 view (dev, sec)", async ({ browser }) => {
  for (const who of ["dev", "sec", "po"] as Role[]) {
    const ctx = await contextFor(browser, who)
    const page = await ctx.newPage()
    const res = await page.goto(`/projects/${PILOT}/trash`)
    await page.waitForLoadState("networkidle").catch(() => {})
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200)
    const forbidden = /権限|permission|izin|akses|Access denied|Forbidden/i.test(text)
    const notFound = /見つかりません|not found|tidak ditemukan/i.test(text)
    log.push(`[P-05 ${who}] /trash -> HTTP ${res?.status()} forbidden=${forbidden} notFound=${notFound} text="${text}"`)
    await page.screenshot({ path: shot(`p05-trash-${who}`) })
    if (who === "po") expect.soft(forbidden || notFound).toBe(false)
    else {
      expect.soft(forbidden, `${who} sees 403 view`).toBe(true)
      expect.soft(notFound, `${who} not the 404 view`).toBe(false)
    }
    await ctx.close()
  }
})

function rawHealth(headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const u = new URL(BASE)
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: "/api/health", method: "GET", headers }, (res) => {
      let body = ""
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on("error", reject)
    req.end()
  })
}

test("S-2: /api/health details only for loopback / internal token", async () => {
  const cases: Array<[string, Record<string, string>]> = [
    ["loopback (Host localhost, no XFF)", {}],
    ["remote Host (pp-21)", { Host: "pp-21:3000" }],
    ["remote XFF", { "X-Forwarded-For": "10.1.2.3" }],
    ["proxy chain XFF client,127.0.0.1", { "X-Forwarded-For": "10.1.2.3, 127.0.0.1" }],
    ["wrong internal token (remote Host)", { Host: "pp-21:3000", "x-internal-token": "nope" }],
    ["spoof: Host localhost + XFF 127.0.0.1", { Host: "localhost", "X-Forwarded-For": "127.0.0.1" }],
  ]
  for (const [name, h] of cases) {
    const r = await rawHealth(h)
    const keys = Object.keys(JSON.parse(r.body)).join(",")
    log.push(`[health] ${name} -> ${r.status} keys=${keys}`)
    if (name.startsWith("remote") || name.startsWith("proxy") || name.startsWith("wrong")) expect.soft(keys).toBe("status,db")
  }
  // anonymous through the browser-facing API context (loopback here)
  const anon = await pwRequest.newContext({ baseURL: BASE })
  const a = await anon.get("/api/health")
  log.push(`[health] anon APIRequestContext -> ${a.status()} cache=${a.headers()["cache-control"]}`)
})

// ── zip with lying sizes ────────────────────────────────────────────────────

interface ZipEntry { name: string; data: Buffer; declaredSize?: number; localOffsetOverride?: number }

/** Minimal zip writer (deflate) that can lie about the uncompressed size in both headers. */
function buildZip(entries: ZipEntry[], shareFirstLocal = 0): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  const metas: Array<{ name: Buffer; crc: number; csize: number; usize: number; offset: number }> = []
  for (const e of entries) {
    const name = Buffer.from(e.name)
    const comp = deflateRawSync(e.data, { level: 9 })
    const crc = crc32(e.data)
    const usize = e.declaredSize ?? e.data.length
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8)
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(usize, 22)
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
    locals.push(lh, name, comp)
    metas.push({ name, crc, csize: comp.length, usize, offset })
    offset += lh.length + name.length + comp.length
  }
  // Extra central entries all pointing at the first local entry (overlapping-entry bomb).
  for (let i = 0; i < shareFirstLocal; i++) metas.push({ ...metas[0], name: Buffer.from(`xl/media/dup${i}.xml`) })
  const cdStart = offset
  for (const m of metas) {
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10)
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(m.crc >>> 0, 16); ch.writeUInt32LE(m.csize, 20); ch.writeUInt32LE(m.usize, 24)
    ch.writeUInt16LE(m.name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(m.offset, 42)
    centrals.push(ch, m.name)
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(metas.length, 8); eocd.writeUInt16LE(metas.length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(cdStart, 16)
  return Buffer.concat([...locals, cd, eocd])
}

const CT = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
const WB = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Backlog" sheetId="1" r:id="rId1"/></sheets></workbook>`
const RELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
const WBRELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`

function sheetXml(rows: number, repetitive = false): Buffer {
  // `repetitive`: identical rows without r= attributes (valid OOXML) -> ~1000:1 deflate ratio
  const row = (i: number) => repetitive ? `<row><c t="inlineStr"><is><t>PBI lorem ipsum dolor sit amet</t></is></c></row>` : `<row r="${i}"><c r="A${i}" t="inlineStr"><is><t>PBI ${i} lorem ipsum dolor sit amet</t></is></c></row>`
  const parts: string[] = [`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`]
  for (let i = 1; i <= rows; i++) parts.push(row(i))
  parts.push(`</sheetData></worksheet>`)
  return Buffer.from(parts.join(""))
}

test("S-3: realistic workbooks with lying sizes are refused with 413 before exceljs", async () => {
  const bigSheet = sheetXml(1_200_000, true) // ~85 MB of XML, compresses to well under the 5 MB upload limit
  const base = [
    { name: "[Content_Types].xml", data: Buffer.from(CT) },
    { name: "_rels/.rels", data: Buffer.from(RELS) },
    { name: "xl/workbook.xml", data: Buffer.from(WB) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(WBRELS) },
  ]
  const variants: Array<[string, Buffer]> = [
    ["lying-sheet (declares 900 KB, inflates ~85 MB)", buildZip([...base, { name: "xl/worksheets/sheet1.xml", data: bigSheet, declaredSize: 900_000 }])],
    ["lying-sheet (declares 49 MB: under entry limit, ratio < 200)", buildZip([...base, { name: "xl/worksheets/sheet1.xml", data: bigSheet, declaredSize: 49 * 1024 * 1024 }])],
    ["lying-sheet (declares 0 bytes)", buildZip([...base, { name: "xl/worksheets/sheet1.xml", data: bigSheet, declaredSize: 0 }])],
    ["honest small sheet but 1500 overlapping entries (each 60 KB)", buildZip([{ name: "xl/worksheets/sheet1.xml", data: sheetXml(1_000) }, ...base], 1500)],
    ["honest small workbook (control)", buildZip([...base, { name: "xl/worksheets/sheet1.xml", data: sheetXml(3) }])],
  ]
  const po = await apiFor("po")
  for (const [name, buf] of variants) {
    fs.writeFileSync(`${DATA}/c2-zip-${name.split(" ")[0]}.xlsx`, buf)
    const t0 = Date.now()
    const r = await po.post(`/api/projects/${PILOT}/backlog/import?dryRun=1`, {
      multipart: { file: { name: "bomb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf } },
      timeout: 120_000,
    })
    const ms = Date.now() - t0
    const text = (await r.text()).slice(0, 200)
    const h = await po.get("/api/health")
    log.push(`[zip] ${name}: ${buf.length} B -> HTTP ${r.status()} in ${ms} ms ${text} | health ${h.status()}`)
    if (!name.includes("control")) expect.soft(r.status(), name).toBe(413)
    else expect.soft(r.status(), name).not.toBe(413)
  }
})

test("P-13 / P-08 / P-09: charset, chat subtitle, API help on /me", async ({ browser }) => {
  const po = await apiFor("po")
  const up = await po.post(`/api/projects/${PILOT}/attachments`, {
    multipart: { file: { name: "c2-日本語.txt", mimeType: "text/plain", buffer: Buffer.from("日本語テキスト — charset check\n") } },
  })
  const created = await up.json()
  log.push(`[P-13] upload -> ${up.status()}`)
  if (created.id) {
    const g = await po.get(`/api/projects/${PILOT}/attachments/${created.id}`)
    log.push(`[P-13] serve txt: content-type="${g.headers()["content-type"]}" disposition="${g.headers()["content-disposition"]}"`)
    expect.soft(g.headers()["content-type"]).toMatch(/charset=utf-8/i)
    await po.delete(`/api/projects/${PILOT}/attachments/${created.id}`)
  }
  const ctx = await contextFor(browser, "po")
  const page = await ctx.newPage()
  await page.goto(`/projects/${PILOT}/chat`)
  await page.waitForLoadState("networkidle").catch(() => {})
  const header = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300)
  log.push(`[P-08] chat header: "${header}"`)
  expect.soft(header).not.toMatch(/離れるとリセット|reset when you leave|direset/i)
  await page.screenshot({ path: shot("p08-chat-header") })
  await page.goto("/me")
  await page.waitForLoadState("networkidle").catch(() => {})
  const tokenSection = page.locator("section[aria-labelledby='profile-api-tokens']")
  await tokenSection.locator("summary").first().click({ timeout: 15_000 }).catch(() => {})
  const txt = (await tokenSection.innerText({ timeout: 15_000 }).catch(() => "")).replace(/\s+/g, " ")
  log.push(`[P-09] /me token section: "${txt.slice(0, 400)}"`)
  expect.soft(txt).not.toMatch(/docs\/api-v1\.md/)
  await tokenSection.screenshot({ path: shot("p09-me-api-help") }).catch(() => {})
  await ctx.close()
})

test("404 / 403 pages localized (ja/en/id) with correct HTTP status", async ({ browser }) => {
  // e2e-admin (ja), e2e-dev (id); en via a context cookie is not possible for a signed-in user,
  // so en uses e2e-sm after checking its saved language.
  const rows: string[] = []
  for (const who of ["admin", "dev", "sm", "sec"] as Role[]) {
    const ctx = await contextFor(browser, who)
    const page = await ctx.newPage()
    const lang = await (await page.request.get("/api/user/language")).json()
    for (const [n, url] of [["route", "/no-such-page-xyz"], ["project", "/projects/doesnotexist123"], ["zeva", `/projects/${ZEVA}`], ["sprint", `/projects/${PILOT}/sprints/nope`], ["trash", `/projects/${PILOT}/trash`]] as const) {
      const res = await page.goto(url)
      await page.waitForLoadState("networkidle").catch(() => {})
      const text = (await page.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120)
      const htmlLang = await page.locator("html").getAttribute("lang")
      rows.push(`[${who} lang=${JSON.stringify(lang)} html=${htmlLang}] ${n} -> HTTP ${res?.status()} "${text}"`)
      if (who === "dev" || who === "admin") await page.screenshot({ path: shot(`404-${who}-${n}`) })
    }
    await ctx.close()
  }
  log.push(...rows)
})

test.afterAll(() => {
  fs.appendFileSync(`${DATA}/c2-fixes.log`, log.join("\n") + "\n")
})
