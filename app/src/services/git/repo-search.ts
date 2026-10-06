import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withFulltext } from "@/lib/fulltext/fallback"
import { NGRAM_TOKEN_SIZE } from "@/lib/fulltext/boolean-query"

/**
 * Search and read of the knowledge index (repo_chunk) for the AI chat
 * tools. Everything is scoped to ONE project and to its repositories that
 * are switched on as AI knowledge while the Git integration is on.
 *
 * The MATCH column list must equal the FULLTEXT index ft_repo_chunk_text
 * (migration 20261016000000_repo_knowledge); without it withFulltext falls
 * back to LIKE.
 */

export interface KnowledgeRepo {
  id: string
  name: string
  webUrl: string
  /** Commit the citations link to (the indexed one; HEAD while the first pass runs). */
  ref: string
  indexedFiles: number
  indexedAt: Date | null
}

export interface SearchHit {
  repository: string
  path: string
  heading: string | null
  url: string
  snippet: string
  score: number
}

/** Passages returned per search, and at most this many from one file. */
export const SEARCH_LIMIT = 4
const PER_FILE = 2
const CANDIDATES = 40
const SNIPPET_CHARS = 350
const MAX_KEYWORDS = 8

/** Knowledge repositories of a project (empty when the integration is off or none is switched on). */
export async function listKnowledgeRepos(projectId: string): Promise<KnowledgeRepo[]> {
  const rows = await prisma.gitRepository.findMany({
    where: { projectId, aiKnowledge: true, project: { deletedAt: null, gitIntegration: { enabled: true } } },
    select: { id: true, name: true, webUrl: true, indexedSha: true, indexTargetSha: true, indexedFiles: true, indexedAt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })
  return rows.map((r) => ({ id: r.id, name: r.name, webUrl: r.webUrl, ref: r.indexedSha ?? r.indexTargetSha ?? "HEAD", indexedFiles: r.indexedFiles, indexedAt: r.indexedAt }))
}

/** Repositories matching the model's `repository` argument (id or part of the name); all when omitted. */
export function pickRepos(repos: readonly KnowledgeRepo[], hint: unknown): KnowledgeRepo[] {
  const h = typeof hint === "string" ? hint.trim().toLowerCase() : ""
  if (!h) return [...repos]
  return repos.filter((r) => r.id === hint || r.name.toLowerCase().includes(h) || h.includes(r.name.toLowerCase()))
}

const STOPWORDS = new Set([
  "the", "and", "for", "what", "how", "why", "when", "where", "which", "are", "was", "does", "with", "from", "about", "between", "difference",
  "is", "of", "to", "in", "on", "an", "by", "do", "ke", "di",
  "yang", "dan", "dari", "untuk", "dengan", "apa", "bagaimana", "kenapa", "mengapa", "adalah", "itu", "ini", "pada", "dalam", "atau", "antara",
])

/**
 * Search keywords from a question or keyword list: split on punctuation and
 * spaces, then between Japanese particles (hiragana runs) and at script
 * changes, so 「OEEとOLEの計算方法の違いは？」 → OEE, OLE, 計算方法.
 */
export function extractKeywords(query: string): string[] {
  // Same separators as lib/fulltext (no boolean-mode operator can survive into the query).
  const coarse = query.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
  const fine = coarse.flatMap((t) => t.split(/\p{Script=Hiragana}+/u)).flatMap((t) => t.match(/[\p{Script=Han}\p{Script=Katakana}ー]+|[^\p{Script=Han}\p{Script=Katakana}ー]+/gu) ?? [])
  const cleaned = fine.filter((t) => Array.from(t).length >= NGRAM_TOKEN_SIZE && !STOPWORDS.has(t.toLowerCase()))
  return [...new Set(cleaned)].slice(0, MAX_KEYWORDS)
}

/** GitLab URL of a file (at the indexed commit), with the heading / line anchor when known. */
export function blobUrl(repo: Pick<KnowledgeRepo, "webUrl" | "ref">, path: string, anchor: string | null): string {
  const encoded = path
    .split("/")
    .map((s) => encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/")
  return `${repo.webUrl}/-/blob/${encodeURIComponent(repo.ref)}/${encoded}${anchor ? `#${anchor}` : ""}`
}

/** ~350 characters around the first keyword (whitespace collapsed). */
export function snippetOf(content: string, keywords: readonly string[]): string {
  const lower = content.toLowerCase()
  const at = Math.min(...keywords.map((k) => lower.indexOf(k.toLowerCase())).filter((i) => i >= 0), Number.MAX_SAFE_INTEGER)
  const start = at === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, at - 100)
  const text = content.slice(start, start + SNIPPET_CHARS).replace(/\s+/g, " ").trim()
  return `${start > 0 ? "…" : ""}${text}${start + SNIPPET_CHARS < content.length ? "…" : ""}`
}

type ChunkRow = { id: string; repositoryId: string; path: string; heading: string | null; anchor: string | null; content: string; score: number }

function fulltextChunks(repoIds: readonly string[], projectId: string, booleanQuery: string): Promise<ChunkRow[]> {
  return prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
    SELECT \`id\`, \`repositoryId\`, \`path\`, \`heading\`, \`anchor\`, \`content\`, MATCH(\`path\`, \`heading\`, \`content\`) AGAINST (${booleanQuery} IN BOOLEAN MODE) AS score
    FROM \`repo_chunk\`
    WHERE \`projectId\` = ${projectId} AND \`repositoryId\` IN (${Prisma.join([...repoIds])})
      AND MATCH(\`path\`, \`heading\`, \`content\`) AGAINST (${booleanQuery} IN BOOLEAN MODE)
    ORDER BY score DESC LIMIT ${CANDIDATES}`)
}

/** LIKE fallback: any keyword, ranked by how many keywords a passage contains. */
async function likeChunks(repoIds: readonly string[], projectId: string, keywords: readonly string[]): Promise<ChunkRow[]> {
  const rows = await prisma.repoChunk.findMany({
    where: {
      projectId,
      repositoryId: { in: [...repoIds] },
      OR: keywords.flatMap((k) => [{ content: { contains: k } }, { heading: { contains: k } }, { path: { contains: k } }]),
    },
    select: { id: true, repositoryId: true, path: true, heading: true, anchor: true, content: true },
    take: 200,
  })
  const scored = rows.map((r) => {
    const hay = `${r.path}\n${r.heading ?? ""}\n${r.content}`.toLowerCase()
    return { ...r, score: keywords.filter((k) => hay.includes(k.toLowerCase())).length }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, CANDIDATES)
}

/** All keywords first; when that finds too little, any keyword (relevance ranked) fills up. */
async function rankedChunks(repoIds: readonly string[], projectId: string, keywords: readonly string[]): Promise<ChunkRow[]> {
  return withFulltext(
    keywords.join(" "),
    async (allTerms) => {
      const strict = await fulltextChunks(repoIds, projectId, allTerms)
      if (strict.length >= SEARCH_LIMIT || keywords.length < 2) return strict.length > 0 ? strict : null
      const loose = await fulltextChunks(repoIds, projectId, keywords.map((k) => `${k}*`).join(" "))
      const merged = [...strict, ...loose.filter((l) => !strict.some((s) => s.id === l.id))]
      return merged.length > 0 ? merged : null
    },
    () => likeChunks(repoIds, projectId, keywords),
  )
}

/** Relevance bonus per keyword found in the heading path / file path (a section ABOUT the topic beats one that mentions it). */
const HEADING_BOOST = 0.5
const PATH_BOOST = 0.5

/** Pure: FULLTEXT / LIKE score boosted by keyword hits in heading and path, best first. */
export function rerank<T extends Pick<ChunkRow, "path" | "heading" | "score">>(rows: readonly T[], keywords: readonly string[]): T[] {
  const hits = (text: string) => keywords.filter((k) => text.includes(k.toLowerCase())).length
  return rows
    .map((r) => ({ row: r, score: Number(r.score) * (1 + HEADING_BOOST * hits((r.heading ?? "").toLowerCase()) + PATH_BOOST * hits(r.path.toLowerCase())) }))
    .sort((a, b) => b.score - a.score)
    .map(({ row, score }) => ({ ...row, score }))
}

/** Best passages for a query across the given knowledge repositories of the project. */
export async function searchRepoDocs(projectId: string, repos: readonly KnowledgeRepo[], query: string): Promise<SearchHit[]> {
  const keywords = extractKeywords(query)
  if (repos.length === 0 || keywords.length === 0) return []
  const rows = rerank(await rankedChunks(repos.map((r) => r.id), projectId, keywords), keywords)
  const byRepo = new Map(repos.map((r) => [r.id, r]))
  const perFile = new Map<string, number>()
  const hits: SearchHit[] = []
  for (const row of rows) {
    const repo = byRepo.get(row.repositoryId)
    const key = `${row.repositoryId}|${row.path}`
    if (!repo || (perFile.get(key) ?? 0) >= PER_FILE) continue
    perFile.set(key, (perFile.get(key) ?? 0) + 1)
    hits.push({ repository: repo.name, path: row.path, heading: row.heading, url: blobUrl(repo, row.path, row.anchor), snippet: snippetOf(row.content, keywords), score: Number(row.score) })
    if (hits.length >= SEARCH_LIMIT) break
  }
  return hits
}

export interface FilePassage {
  heading: string | null
  anchor: string | null
  content: string
}

/** Passages of one file in order: exact path first, else the only path containing the given text. */
export async function readRepoFile(
  projectId: string,
  repos: readonly KnowledgeRepo[],
  path: string,
): Promise<{ repo: KnowledgeRepo; path: string; passages: FilePassage[] } | { candidates: string[] }> {
  // Both the project and its knowledge repositories scope every lookup (defence in depth).
  const scope = { projectId, repositoryId: { in: repos.map((r) => r.id) } }
  const wanted = path.trim().replace(/^\.?\/+/, "")
  const exact = await prisma.repoChunk.findFirst({ where: { ...scope, path: wanted }, select: { repositoryId: true, path: true } })
  const match = exact ?? (await uniquePathContaining(scope, wanted))
  if (!match || "candidates" in match) return { candidates: match?.candidates ?? [] }
  const rows = await prisma.repoChunk.findMany({
    where: { projectId, repositoryId: match.repositoryId, path: match.path },
    orderBy: { chunkNo: "asc" },
    select: { heading: true, anchor: true, content: true },
  })
  const repo = repos.find((r) => r.id === match.repositoryId) as KnowledgeRepo
  return { repo, path: match.path, passages: rows }
}

type ChunkScope = { projectId: string; repositoryId: { in: string[] } }

async function uniquePathContaining(scope: ChunkScope, text: string): Promise<{ repositoryId: string; path: string } | { candidates: string[] } | null> {
  if (!text) return null
  const rows = await prisma.repoChunk.findMany({
    where: { ...scope, chunkNo: 0, path: { contains: text } },
    select: { repositoryId: true, path: true },
    take: 10,
  })
  if (rows.length === 1) return rows[0]
  return rows.length === 0 ? null : { candidates: rows.map((r) => r.path) }
}
