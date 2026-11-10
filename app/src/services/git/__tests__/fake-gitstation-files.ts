import { createHash } from "node:crypto"
import { vi } from "vitest"
import { GitStationError } from "@/lib/git/gitstation-client"

/**
 * A fake GitStation client for the knowledge index (synthetic data only). It serves the binding check
 * (`resolveProject` / `bindings`) and the browse routes (`repositoryGet`: refs / tree / blob / compare)
 * from an in-memory file tree, answering like the server (GitStation main 059cc34): the ref must be the
 * default branch's full name, a confidential document is a 403 FG-AUTH-0021, a missing path a 404, and
 * every answer names the commit it was computed at.
 */

export type FakeFile = { content: string } | { confidential: true; content?: string } | { binary: true; size?: number } | { size: number; content?: string }

export interface FakeStationOptions {
  files: Record<string, FakeFile>
  head?: string
  defaultBranch?: string | null
  /** Bound Kanflow project (null = not bound to any). */
  boundTo?: string | null
  integrationId?: string
  /** Folders whose listing GitStation cuts short (truncated: true, only the first `n` entries). */
  truncatedDirs?: Record<string, number>
  /** compare answer (by default: an error 404, so the indexer walks). */
  compare?: (from: string) => unknown
  /** The ref list leaves out the default branch it names (a GitStation quirk). */
  hideDefaultRef?: boolean
}

export const STATION_PROJECT_ID = 7
export const HEAD = "c".repeat(40)
export const OTHER_HEAD = "d".repeat(40)

/** The object id a file is listed with (git's blob id of its content). */
export function oidOf(file: FakeFile): string {
  const text = "content" in file && file.content !== undefined ? file.content : JSON.stringify(file)
  return createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex")
}

const rev = (name: string, commit: string) => ({ type: "branch", name, full_name: `refs/heads/${name}`, commit })

export function fakeStation(opts: FakeStationOptions) {
  const state = {
    files: { ...opts.files },
    head: opts.head ?? HEAD,
    defaultBranch: opts.defaultBranch === undefined ? "main" : opts.defaultBranch,
  }
  const calls: { route: string; query: Record<string, string | undefined> }[] = []
  const fullRef = () => `refs/heads/${state.defaultBranch}`
  const notFound = () => new GitStationError("not_found", "Not found or not visible to this integration (404)", 404, { errorCode: "FG-REPO-0023" })

  function children(dir: string) {
    const prefix = dir ? `${dir}/` : ""
    const names = new Map<string, { type: "tree" | "blob"; path: string; file?: FakeFile }>()
    for (const [path, file] of Object.entries(state.files)) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      const [name, ...more] = rest.split("/")
      if (more.length > 0) names.set(name, { type: "tree", path: `${prefix}${name}` })
      else names.set(name, { type: "blob", path, file })
    }
    return [...names.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  }

  const client = {
    resolveProject: vi.fn(async (path: string) => ({ projectId: STATION_PROJECT_ID, canonicalPath: path, moved: false })),
    bindings: vi.fn(async () =>
      opts.boundTo === null ? [] : [{ integrationId: opts.integrationId ?? "int_7", kind: "kanflow", externalProjectId: opts.boundTo ?? "p1" }],
    ),
    webUrl: (id: number, ...segments: string[]) => `https://station.example.test/-/projects/${id}/${segments.join("/")}`,
    repositoryGet: vi.fn(async (id: number, route: string, query: Record<string, string | undefined>) => {
      calls.push({ route, query })
      if (id !== STATION_PROJECT_ID) throw notFound()
      if (route === "refs") {
        const refs = state.defaultBranch && !opts.hideDefaultRef ? [rev(state.defaultBranch, state.head)] : []
        return { default_branch: state.defaultBranch, refs, truncated: false }
      }
      if (route === "compare") {
        if (!opts.compare) throw notFound()
        return opts.compare(query.from ?? "")
      }
      if (query.ref !== fullRef()) throw notFound()
      const at = rev(state.defaultBranch as string, state.head)
      if (route === "tree") {
        const dir = query.path ?? ""
        if (dir && !Object.keys(state.files).some((p) => p.startsWith(`${dir}/`))) throw notFound()
        const all = children(dir)
        const cut = opts.truncatedDirs?.[dir]
        const shown = cut === undefined ? all : all.slice(0, cut)
        const entries = shown.map(([name, e]) => ({
          name,
          path: e.path,
          type: e.type,
          mode: e.type === "tree" ? "040000" : "100644",
          oid: e.type === "tree" ? "e".repeat(40) : oidOf(e.file as FakeFile),
          size: e.type === "tree" ? null : "size" in (e.file as object) ? (e.file as { size: number }).size : Buffer.byteLength((e.file as { content?: string }).content ?? ""),
        }))
        return { ref: at, path: dir, oid: "e".repeat(40), entries, truncated: cut !== undefined }
      }
      if (route === "blob") {
        const file = state.files[query.path ?? ""]
        if (!file) throw notFound()
        if ("confidential" in file) throw new GitStationError("forbidden", "The service account may not read this (403)", 403, { errorCode: "FG-AUTH-0021" })
        const binary = "binary" in file
        const content = binary ? null : (file as { content?: string }).content ?? ""
        return {
          ref: at,
          path: query.path,
          name: (query.path ?? "").split("/").pop(),
          type: "blob",
          mode: "100644",
          oid: oidOf(file),
          size: "size" in file ? file.size : Buffer.byteLength(content ?? ""),
          binary,
          content,
          truncated: false,
        }
      }
      throw new GitStationError("http", "unknown route", 400, { errorCode: "FG-WEB-0006" })
    }),
  }
  return {
    client,
    calls,
    factory: vi.fn(() => client as never),
    /** Move the branch (the next answers are computed at another commit). */
    moveTo(commit: string) {
      state.head = commit
    },
    setFile(path: string, file: FakeFile | null) {
      if (file === null) delete state.files[path]
      else state.files[path] = file
    },
  }
}
