/**
 * A recording fake of the Prisma client for repository tests (not a test file).
 *
 *   const db = fakeDb({ "sprint.findFirst": { id: "s1" } })
 *   await repo.findSprintId(db.client, "p1", "s1")
 *   expect(db.fn("sprint.findFirst")).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" }, ... })
 *
 * Every `client.<model>.<method>` is a lazily created `vi.fn()` that resolves
 * to the configured value for "model.method" (default `undefined`).
 */
import { vi, type Mock } from "vitest"

export interface FakeDb {
  client: never
  fn(key: string): Mock
}

export function fakeDb(returns: Record<string, unknown> = {}): FakeDb {
  const fns = new Map<string, Mock>()
  const fn = (key: string): Mock => {
    let f = fns.get(key)
    if (!f) {
      f = vi.fn(async () => returns[key])
      fns.set(key, f)
    }
    return f
  }
  const client = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy({}, { get: (_m, method: string) => fn(`${model}.${method}`) }),
    }
  )
  return { client: client as never, fn }
}
