import type { GitLabClient, GitLabRelease, GitLabTag } from "@/lib/git/gitlab-client"

/**
 * Tags and GitLab releases of one repository as drafts (no database: the GitLab
 * source reads them, git-release-sync mirrors them into git_release). A tag with
 * a GitLab release carries the release title / description / date; a bare tag
 * only its commit date.
 */
export const MAX_TAG_PAGES = 3
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

/** GitLab tags + releases as drafts; `complete` false when the tag list hit the page cap. */
export async function readGitLabReleaseTags(client: GitLabClient, externalId: number, webUrl: string, now: Date): Promise<{ drafts: TagDraft[]; complete: boolean }> {
  const tags = await client.listTags(externalId, MAX_TAG_PAGES)
  // Release descriptions are decoration: a tag without one is still worth showing.
  const releases = await client.listReleases(externalId, MAX_TAG_PAGES).catch(() => [] as GitLabRelease[])
  return { drafts: draftsFromTags(tags, releases, webUrl, now), complete: tags.length < MAX_TAG_PAGES * PER_PAGE }
}

