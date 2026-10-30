import { prisma } from "@/lib/prisma"
import type { GitLabClient } from "@/lib/git/gitlab-client"
import { readGitLabReleaseTags, type TagDraft } from "./gitlab-release-tags"

/**
 * Tags and releases of one repository, mirrored into git_release so the release
 * tab can match them to its versions (drafts: gitlab-release-tags).
 */
export { draftsFromTags, type TagDraft } from "./gitlab-release-tags"

const same = (a: { name: string | null; description: string | null; url: string; releasedAt: Date }, b: TagDraft) =>
  a.name === b.name && a.description === b.description && a.url === b.url && a.releasedAt.getTime() === b.releasedAt.getTime()

/** Returns how many rows were created / changed / removed. */
export async function syncReleases(
  client: GitLabClient,
  repo: { id: string; projectId: string; webUrl: string },
  externalId: number,
  now = new Date(),
): Promise<number> {
  return writeReleases(repo, await readGitLabReleaseTags(client, externalId, repo.webUrl, now))
}

/** Mirrors a tag listing (of any source) into git_release; returns how many rows were created / changed / removed. */
export async function writeReleases(repo: { id: string; projectId: string }, listing: { drafts: readonly TagDraft[]; complete: boolean }): Promise<number> {
  const { drafts } = listing
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
  if (listing.complete) {
    const live = new Set(drafts.map((d) => d.tag))
    const stale = existing.filter((r) => !live.has(r.tag)).map((r) => r.id)
    if (stale.length > 0) {
      await prisma.gitRelease.deleteMany({ where: { id: { in: stale } } })
      changed += stale.length
    }
  }
  return changed
}
