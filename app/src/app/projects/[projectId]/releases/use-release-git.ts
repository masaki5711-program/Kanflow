"use client"

import { useMemo } from "react"
import { apiFetch, useApiQuery } from "@/hooks"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"

/** Mirrors the server's VersionGitStatus (services/git/git-releases.service). */
export interface VersionGit {
  version: string
  tag: { tag: string; url: string; releasedAt: string; hasRelease: boolean } | null
  planned: number
  merged: number
  pending: Array<{ pbItemId: string; displayId: number; title: string }>
  unplanned: Array<{ displayId: number; title: string; ref: string; url: string }>
  canRelease: boolean
}

interface GitStatus {
  enabled: boolean
  versions: VersionGit[]
}

/** What Git says about each plan version of the release tab; empty when Git is off. */
export function useReleaseGit(projectId: string) {
  const url = `/api/projects/${projectId}/releases/git`
  const query = useApiQuery<GitStatus>(projectId ? url : null)
  useLiveRefetch(query.refetch, { types: ["git", "activity"], projectId })
  const byVersion = useMemo(() => new Map((query.data?.versions ?? []).map((v) => [v.version, v])), [query.data])

  /** Marks a tagged version's open items as released; returns how many changed. */
  async function markReleased(version: string): Promise<number> {
    const out = await apiFetch<{ updated: number }>(url, { method: "POST", json: { version, action: "release" } })
    query.refetch()
    return out.updated
  }

  return { enabled: query.data?.enabled ?? false, byVersion, markReleased }
}
