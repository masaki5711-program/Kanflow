// E2E fixture for the Git dev panel / badges (eval DB only). Usage: npx tsx scripts/_git-dev-fixture.mts up|down
import "dotenv/config"
import { prisma } from "../src/lib/prisma"

const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const REPO_NAME = "E2E fixture repo"
if (process.env.DATABASE_HOST !== "127.0.0.1" || process.env.DATABASE_PORT !== "3307") throw new Error("refusing: not the eval DB (127.0.0.1:3307)")

const mode = process.argv[2]
if (mode === "down") {
  const repos = await prisma.gitRepository.findMany({ where: { projectId: PROJECT, name: { startsWith: "E2E fixture" } }, select: { id: true } })
  await prisma.gitRepository.deleteMany({ where: { id: { in: repos.map((r) => r.id) } } }) // links cascade
  await prisma.gitIntegration.deleteMany({ where: { projectId: PROJECT, tokenCipher: null } })
  console.log("removed", repos.length, "fixture repos")
} else {
  const sprint = await prisma.sprint.findFirst({ where: { projectId: PROJECT, status: "active" }, include: { items: { select: { pbItemId: true } } } })
  const ids = [...new Set((sprint?.items ?? []).map((i) => i.pbItemId))]
  if (ids.length < 2) throw new Error("need an active sprint with 2 PBIs")
  const [a, b] = await prisma.productBacklogItem.findMany({ where: { id: { in: ids.slice(0, 2) } }, select: { id: true, displayId: true } })
  await prisma.gitIntegration.upsert({ where: { projectId: PROJECT }, create: { projectId: PROJECT, enabled: true }, update: { enabled: true } })
  const mk = (name: string, path: string) =>
    prisma.gitRepository.create({ data: { projectId: PROJECT, name, webUrl: `https://gitlab.invalid/${path}`, apiBase: "https://gitlab.invalid", repoPath: path } })
  const web = await mk(`${REPO_NAME} (web)`, "e2e/web")
  const api = await mk(`${REPO_NAME} (api)`, "e2e/api")
  const now = Date.now()
  const at = (h: number) => new Date(now - h * 3600_000)
  const base = { projectId: PROJECT, author: "E2E 太郎" }
  const rows = [
    { repositoryId: web.id, backlogItemId: a.id, kind: "mr", ref: "41", title: `PBI-${a.displayId} ログイン画面`, state: "opened", pipeline: "failed", occurredAt: at(1) },
    { repositoryId: web.id, backlogItemId: a.id, kind: "mr", ref: "38", title: `PBI-${a.displayId} 下準備`, state: "merged", pipeline: "success", occurredAt: at(30), mergedAt: at(30) },
    { repositoryId: web.id, backlogItemId: a.id, kind: "branch", ref: `feature/PBI-${a.displayId}-login`, title: "WIP: フォーム", occurredAt: at(2) },
    ...Array.from({ length: 7 }, (_, i) => ({ repositoryId: web.id, backlogItemId: a.id, kind: "commit", ref: `${(i + 10).toString(16).repeat(20)}`.slice(0, 40), title: `PBI-${a.displayId} コミット ${i + 1}`, occurredAt: at(3 + i) })),
    { repositoryId: api.id, backlogItemId: a.id, kind: "mr", ref: "12", title: `PBI-${a.displayId} 認証 API`, state: "opened", pipeline: "running", occurredAt: at(0.5) },
    { repositoryId: api.id, backlogItemId: b.id, kind: "mr", ref: "13", title: `PBI-${b.displayId} エクスポート`, state: "merged", pipeline: "success", occurredAt: at(5), mergedAt: at(5) },
  ]
  for (const r of rows) await prisma.gitLink.create({ data: { ...base, url: `https://gitlab.invalid/e2e/${r.kind}/${r.ref}`, ...r } })
  console.log("fixture up: PBI", a.displayId, a.id, "and PBI", b.displayId, b.id)
}
await prisma.$disconnect()
