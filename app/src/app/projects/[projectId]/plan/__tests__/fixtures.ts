// Shared plan test data (not a test file itself).
import type { PlanItem } from "../lib/plan-types"

export function mkItem(p: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    projectId: "p1",
    parentId: null,
    name: p.id,
    description: null,
    notes: null,
    plannedStart: "2026-10-01",
    plannedEnd: "2026-10-10",
    actualStart: null,
    actualEnd: null,
    baselineStart: null,
    baselineEnd: null,
    baselineVarianceDays: null,
    progressPct: 0,
    progressMode: "manual",
    status: "not_started",
    scheduleState: "not_started",
    isMilestone: false,
    color: null,
    sortOrder: 0,
    version: 1,
    owner: null,
    hasChildren: false,
    linked: null,
    ...p,
  }
}

/** Node 25 ships its own (incomplete) global localStorage; install a plain in-memory Storage. */
export function installMemoryStorage(): Storage {
  const data = new Map<string, string>()
  const storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  } as Storage
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: true })
  return storage
}
