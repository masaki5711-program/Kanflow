/**
 * Per-key write queue for versioned PATCHes (N-03). Two quick status clicks on
 * one card used to race: the second request left with the version of the last
 * list fetch, hit the server after the first one and got a 409 — a "conflict"
 * with the user's own save. Here a key's tasks run one after another, and each
 * task is told the newest version an earlier task of the same key got back,
 * so the second write carries the version the first one produced.
 */
export interface KeyedSerialQueue {
  /**
   * Runs `task` once every earlier task of `key` has settled (success or
   * failure). `knownVersion` is the newest `version` an earlier task of the
   * key resolved with, or undefined.
   */
  run<T>(key: string, task: (knownVersion: number | undefined) => Promise<T>): Promise<T>
}

function versionOf(result: unknown): number | undefined {
  const v = (result as { version?: unknown } | null | undefined)?.version
  return typeof v === "number" ? v : undefined
}

export function createKeyedSerialQueue(): KeyedSerialQueue {
  const tails = new Map<string, Promise<unknown>>()
  const versions = new Map<string, number>()

  function remember(key: string, result: unknown) {
    const v = versionOf(result)
    if (v === undefined) return
    versions.set(key, Math.max(v, versions.get(key) ?? v))
  }

  return {
    run<T>(key: string, task: (knownVersion: number | undefined) => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve()
      const next = previous.then(() => task(versions.get(key))).then((result) => {
        remember(key, result)
        return result
      })
      const settled = next.then(
        () => undefined,
        () => undefined,
      )
      tails.set(key, settled)
      void settled.then(() => {
        if (tails.get(key) === settled) tails.delete(key)
      })
      return next
    },
  }
}

/** The version to send: the newer of the (possibly stale) list row and what our own earlier write returned. */
export function newestVersion(listVersion: number | undefined, knownVersion: number | undefined): number | undefined {
  if (listVersion === undefined) return knownVersion
  if (knownVersion === undefined) return listVersion
  return Math.max(listVersion, knownVersion)
}
