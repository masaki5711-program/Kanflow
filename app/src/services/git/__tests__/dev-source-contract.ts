import { describe, expect, it } from "vitest"
import type { DevCursor, DevSource, DevSourceKind } from "../dev-source"

/**
 * What every DevSource must do for the sync (GitLab today, GitStation in M3).
 * An implementation's test calls this with a source kind and a way to connect
 * it to a fake remote holding one PBI merge request, commit and branch, or to
 * one where every request fails.
 */
export interface DevSourceContractSetup {
  kind: DevSourceKind
  /** A never-synced repository row of this source. */
  freshRow: object
  /** A row whose stored position cannot be read (fromRow must throw). */
  corruptRow: object
  /** Connected to a remote with one merge request (PBI-1), one commit (PBI-2), one branch (PBI-3). */
  healthy(): DevSource
  /** Connected to a remote that fails every request. */
  failing(): DevSource
  now: Date
}

export function describeDevSourceContract(name: string, setup: () => DevSourceContractSetup): void {
  describe(`DevSource contract: ${name}`, () => {
    it("the codec turns a stored row into an opaque string cursor and back into columns, stably", () => {
      const { kind, freshRow, now } = setup()
      const cursor = kind.cursors.fromRow(freshRow, now)
      expect(typeof cursor).toBe("string")
      const columns = kind.cursors.toRow(cursor)
      expect(kind.cursors.fromRow({ ...freshRow, ...columns }, now)).toBe(cursor)
    })

    it("restart (過去分を再同期) yields columns from which a readable cursor follows", () => {
      const { kind, freshRow, now } = setup()
      const columns = kind.cursors.restart(freshRow, now)
      expect(() => kind.cursors.fromRow({ ...freshRow, ...columns }, now)).not.toThrow()
    })

    it("restart works from a corrupt stored position (the escape hatch), and fromRow refuses it", () => {
      const { kind, corruptRow, now } = setup()
      expect(() => kind.cursors.fromRow(corruptRow, now)).toThrow()
      const columns = kind.cursors.restart(corruptRow, now)
      const cursor = kind.cursors.fromRow({ ...corruptRow, ...columns }, now)
      expect(typeof cursor).toBe("string")
    })

    it("describes an unreadable stored position with a message to show (not the generic one)", () => {
      const { kind, corruptRow, healthy, now } = setup()
      let caught: unknown
      try {
        kind.cursors.fromRow(corruptRow, now)
      } catch (err) {
        caught = err
      }
      const info = healthy().describeError(caught)
      expect(info.kind).toBe("cursor")
      expect(info.expected).toBe(false)
      expect(info.message).toContain("過去分を再同期")
    })

    it("refuses a cursor it did not make instead of silently starting over", () => {
      const { kind } = setup()
      expect(() => kind.cursors.toRow("someone-else:{}" as DevCursor)).toThrow()
    })

    it("readChanges returns normalized merge requests and commits plus a cursor its codec accepts", async () => {
      const { kind, freshRow, healthy, now } = setup()
      const source = healthy()
      expect(source.provider).toBe(kind.provider)
      const changes = await source.readChanges(kind.cursors.fromRow(freshRow, now), now)
      expect(changes.failures).toEqual([])
      expect(changes.mergeRequests).toEqual([
        expect.objectContaining({ ref: expect.any(String), title: expect.stringContaining("PBI-1"), state: expect.any(String), url: expect.stringMatching(/^https:/), sourceBranch: expect.any(String), updatedAt: expect.any(String) }),
      ])
      expect(changes.freshMergeRequestRefs.has(changes.mergeRequests[0].ref)).toBe(true)
      expect(changes.commits).toEqual([expect.objectContaining({ sha: expect.any(String), message: expect.stringContaining("PBI-2"), url: expect.stringMatching(/^https:/), committedAt: expect.any(String) })])
      expect(typeof changes.cursor).toBe("string")
      expect(() => kind.cursors.toRow(changes.cursor)).not.toThrow()
    })

    it("lists branches with a completeness flag and looks a pipeline up by merge request ref", async () => {
      const { healthy, now } = setup()
      const source = healthy()
      const branches = await source.listBranches(now)
      expect(branches.complete).toBe(true)
      expect(branches.items).toEqual([expect.objectContaining({ name: expect.stringContaining("PBI-3"), url: expect.stringMatching(/^https:/) })])
      const changes = await source.readChanges(setup().kind.cursors.fromRow(setup().freshRow, now), now)
      await expect(source.pipelineStatus(changes.mergeRequests[0].ref)).resolves.toEqual(expect.anything())
    })

    it("a failing remote never throws from readChanges: failures are reported with a message to show", async () => {
      const { kind, freshRow, failing, now } = setup()
      const source = failing()
      const start = kind.cursors.fromRow(freshRow, now)
      // A source may need to locate the repository first; that failure is the sync's to catch.
      const located = await source.locate().then(
        () => true,
        () => false,
      )
      if (!located) return
      const changes = await source.readChanges(start, now)
      expect(changes.failures.length).toBeGreaterThan(0)
      expect(changes.mergeRequests).toEqual([])
      expect(() => kind.cursors.toRow(changes.cursor)).not.toThrow()
      await expect(source.listBranches(now)).rejects.toBeDefined()
      for (const f of changes.failures) {
        const info = source.describeError(f.error)
        expect(info.kind).toEqual(expect.any(String))
        expect(info.message.length).toBeGreaterThan(0)
      }
    })
  })
}
