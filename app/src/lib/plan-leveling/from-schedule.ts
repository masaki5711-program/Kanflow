/**
 * A base schedule (BaseSchedule, plan W12 / E0) as levelling input, and the working-day calendar the levelling
 * engine counts on. Pure.
 *
 * - Leaves only; a `dependsOn` on a parent covers every leaf under it, and a parent's own `dependsOn` applies to all
 *   of its leaves (the same reading as loading the schedule). A leaf with no dependency at all follows every earlier
 *   leaf (loading places such leaves one after another).
 * - D = durationDays (default 1, milestones 1). ℓ = the item's `load` (default 1); a milestone takes no capacity.
 * - `role` is inherited from the nearest ancestor that has one.
 */
import { dateKeyOf, dayNumber } from "@/lib/plan-estimate/dates"
import type { BaseSchedule, BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import type { LevelItem } from "./level"

interface FlatLeaf {
  item: BaseScheduleItem
  role: string | null
  /** dependsOn of the leaf and all of its ancestors. */
  depends: string[]
}

export function levelItemsFromSchedule(schedule: BaseSchedule, splittable: ReadonlySet<string> = new Set()): LevelItem[] {
  const leavesUnder = new Map<string, string[]>()
  const leaves: FlatLeaf[] = []
  const walk = (items: readonly BaseScheduleItem[], role: string | null, inherited: readonly string[], ancestors: readonly string[]) => {
    for (const it of items) {
      const myRole = it.role ?? role
      const depends = [...inherited, ...(it.dependsOn ?? [])]
      if (it.children && it.children.length > 0) walk(it.children, myRole, depends, [...ancestors, it.key])
      else {
        leaves.push({ item: it, role: myRole, depends })
        for (const a of [...ancestors, it.key]) leavesUnder.set(a, [...(leavesUnder.get(a) ?? []), it.key])
      }
    }
  }
  walk(schedule.items, null, [], [])
  return leaves.map((l, order) => {
    // A leaf without any dependency follows every earlier leaf, as loading places it (scheduleFrom's sequential
    // order): the base schedule's stage order is part of the plan, and levelling only delays work for capacity —
    // it never runs stages in parallel that the schedule puts one after another. Parallel work is said with dependsOn.
    const preds =
      l.depends.length === 0
        ? leaves.slice(0, order).map((x) => x.item.key)
        : [...new Set(l.depends.flatMap((k) => leavesUnder.get(k) ?? []))].filter((k) => k !== l.item.key)
    return {
      key: l.item.key,
      days: l.item.milestone ? 1 : Math.max(1, l.item.durationDays ?? 1),
      load: l.item.milestone ? 0 : (l.item.load ?? 1),
      role: l.role,
      predecessors: preds,
      order,
      ...(splittable.has(l.item.key) ? { splittable: true } : {}),
    }
  })
}

const isWeekend = (day: number): boolean => {
  const w = (((day + 4) % 7) + 7) % 7
  return w === 0 || w === 6
}

/** Working-day index ↔ calendar day. Index 0 = the first working day on or after `startDate`. */
export class WorkCalendar {
  private readonly days: number[] = []
  private readonly first: number

  constructor(
    startDate: string,
    private readonly skipWeekends: boolean,
  ) {
    let d = dayNumber(startDate)
    if (skipWeekends) while (isWeekend(d)) d++
    this.first = d
  }

  /** Calendar day number of a working-day index. */
  private dayAt(index: number): number {
    if (!this.skipWeekends) return this.first + index
    while (this.days.length <= index) {
      let d = this.days.length ? this.days[this.days.length - 1] + 1 : this.first
      while (isWeekend(d)) d++
      this.days.push(d)
    }
    return this.days[index]
  }

  /** "YYYY-MM-DD" of a working-day index. */
  keyOf(index: number): string {
    return dateKeyOf(this.dayAt(index))
  }

  /** Working-day index of a calendar day (a weekend day maps to the next working day); negative before the start. */
  indexOf(key: string): number {
    const target = dayNumber(key)
    if (!this.skipWeekends) return target - this.first
    if (target < this.first) {
      let n = 0
      for (let d = this.first - 1; d >= target; d--) if (!isWeekend(d)) n--
      return n
    }
    let i = 0
    while (this.dayAt(i) < target) i++
    return i
  }
}
