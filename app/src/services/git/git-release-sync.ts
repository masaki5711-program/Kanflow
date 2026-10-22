import { prisma } from "@/lib/prisma"
import type { GitLabClient, GitLabRelease, GitLabTag } from "@/lib/git/gitlab-client"

/**
 * Tags and GitLab releases of one repository, mirrored into git_release so the
 * release tab can match them to its versions. A tag with a GitLab release
 * carries the release title / description / date; a bare tag only its commit date.
 */
const MAX_PAGES = 3
const PER_PAGE = 100

export interface TagDraft {
  tag: string
  name: string | null
  description: string | null
  url: string
  releasedAt: Date
}

const asDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Pure: one draft per tag; the GitLab release (when any) wins for name / description / date. */
export function draftsFromTags(tags: readonly GitLabTag[], releases: readonly GitLabRelease[], webUrl: string, now: Date): TagDraft[] {
  const byTag = new Map(releases.map((r) => [r.tag_name, r]))
  const base = webUrl.replace(/\/+$/, "")
  return tags.map((t) => {
    const rel = byTag.get(t.name)
    return {
      tag: t.name,
      name: rel?.name?.trim() || null,
      description: rel?.description?.trim() || null,
      url: `${base}/-/tags/${encodeURIComponent(t.name)}`,
      releasedAt: asDate(rel?.released_at) ?? asDate(t.commit?.committed_date) ?? asDate(t.commit?.created_at) ?? now,
    }
  })
}

const same = (a: { name: string | null; description: string | null; url: string; releasedAt: Date }, b: TagDraft) =>
  a.name === b.name && a.description === b.description && a.url === b.url && a.releasedAt.getTime() === b.releasedAt.getTime()

/** Returns how many rows were created / changed / removed. */
export async function syncReleases(
  client: GitLabClient,
  repo: { id: string; projectId: string; webUrl: string },
  externalId: number,
  now = new Date(),
): Promise<number> {
  const tags = await client.listTags(externalId, MAX_PAGES)
  // Release descriptions are decoration: a tag without one is still worth showing.
  const releases = await client.listReleases(externalId, MAX_PAGES).catch(() => [] as GitLabRelease[])
  const drafts = draftsFromTags(tags, releases, repo.webUrl, now)

  const existing = await prisma.gitRelease.findMany({ where: { repositoryId: repo.id } })
  const before = new Map(existing.map((r) => [r.tag, r]))
  let changed = 0
  for (const d of drafts) {
    const row = before.get(d.tag)
    if (row && same(row, d)) continue
    const data = { name: d.name, description: d.description, url: d.url, releasedAt: d.releasedAt }
    await prisma.gitRelease.upsert({
      where: { repositoryId_tag: { repositoryId: repo.id, tag: d.tag } },
      create: { projectId: repo.projectId, repositoryId: repo.id, tag: d.tag, ...data },
      update: data,
    })
    changed++
  }
  // Deleted tags disappear — unless the list was cut short, where absence proves nothing.
  if (tags.length < MAX_PAGES * PER_PAGE) {
    const live = new Set(drafts.map((d) => d.tag))
    const stale = existing.filter((r) => !live.has(r.tag)).map((r) => r.id)
    if (stale.length > 0) {
      await prisma.gitRelease.deleteMany({ where: { id: { in: stale } } })
      changed += stale.length
    }
  }
  return changed
}
