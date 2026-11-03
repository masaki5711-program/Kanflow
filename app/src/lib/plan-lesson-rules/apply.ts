/**
 * Apply confirmed lesson rules to a base schedule (plan 12 §3.4). Pure and deterministic: the same schedule and
 * rules give the same result. The input is never mutated; every step builds new items.
 *
 * Rules run in a fixed order (`RULE_KIND_ORDER`, then by id). After each rule the whole schedule is validated
 * (the same checks as loading it: `baseScheduleSchema` + `planBaseSchedule` — 500 items, 5 levels, 3650 days,
 * unique keys, no unknown / self / ancestor / duplicate / cyclic dependency) plus the limits of this module
 * (added items, the product of scale factors). A rule that fails is dropped with a machine reason and the
 * schedule from before it is kept, so one bad rule never blocks the others.
 *
 * Semantics:
 * - `add_prerequisite`: a new leaf right before `beforeKey` among its siblings. It inherits the predecessors of
 *   `beforeKey` (so it does not jump to the project start) and `beforeKey` additionally depends on it.
 * - `add_dependency`: `to` depends on `from` (finish to start).
 * - `split`: the leaf becomes 2-4 leaves `<key>_p1..pN` in a chain. Predecessors move to the first part, every
 *   dependency on the leaf moves to the last part. The days are spread evenly (the remainder goes to the first
 *   parts); each part keeps at least 2 days. The leaf's `formerKeys` are dropped (no part is the old item);
 *   `derivedFrom` maps each part to the original key, and later rules naming the original key reach the parts.
 * - `add_buffer`: a load-0 leaf right after `afterKey` among its siblings, depending on it; every item that
 *   depended on `afterKey` depends on the buffer instead. After a split, `afterKey` means the last part.
 * - `scale_duration`: does NOT change `durationDays`. The factor is recorded per leaf in `scaleFactors` and is
 *   multiplied into the statistical ratio r50 by the estimate (E2). This module bounds the product of the rule
 *   factors per leaf to 0.5-3.0; the bound of rule product × statistical ratio is enforced where both meet (E5).
 * - `cap_parallel`: does not change the tree; returned in `constraints.capParallel` for levelling (E4). Two caps
 *   for one role keep the smaller.
 */
import { baseScheduleSchema, keyAliases, planBaseSchedule, PlanScheduleError, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { linkBlock, type TemplateLink } from "@/lib/plan-templates/links"
import {
  ADDED_ITEMS_MAX,
  ADDED_ITEMS_MAX_SHARE,
  lessonRuleSchema,
  RULE_KIND_ORDER,
  SCALE_FACTOR_MAX,
  SCALE_FACTOR_MIN,
  SPLIT_PART_MIN_DAYS,
  type LessonRule,
  type LessonRuleKind,
  type LessonRuleOf,
} from "./rules"

const KEY_MAX = 40
const NAME_MAX = 255
/** Float tolerance when comparing a product of factors against its bounds. */
const EPSILON = 1e-9

export type RuleRejectReason =
  /** The rule does not match its schema (bounds, plain name, unknown fields). */
  | "invalid_params"
  /** A key the rule names is not in the schedule (nor a former key, nor a split item). */
  | "unknown_key"
  /** `scale_duration` / `split` name a parent. */
  | "not_a_leaf"
  /** `scale_duration` / `split` name a milestone (fixed at one day). */
  | "milestone"
  /** A key the rule would create already exists (or is a former key). */
  | "key_conflict"
  /** `split`: fewer than 2 days per part. */
  | "split_too_short"
  /** `add_dependency` from = to. */
  | "self"
  /** `add_dependency` between an item and its ancestor / descendant. */
  | "hierarchy"
  /** `add_dependency` that already exists. */
  | "existing"
  /** `add_dependency` that closes a cycle. */
  | "cycle"
  /** More added items than 30 / 20 % of the template's leaves. */
  | "too_many_added_items"
  /** The product of scale factors on a leaf leaves 0.5-3.0. */
  | "scale_out_of_bounds"
  /** The schedule would fail loading (`detail` has the check's message). */
  | "schedule_invalid"
  | "schedule_too_large"
  | "schedule_too_deep"

export interface RejectedRule {
  ruleId: string
  kind: string
  reason: RuleRejectReason
  /** English message for logs and the evidence view (never shown raw to other projects). */
  detail?: string
}

export interface LessonRuleResult {
  /** The schedule after every applied rule (a new object). */
  schedule: BaseSchedule
  /** Ids of the applied rules, in application order. */
  applied: string[]
  rejected: RejectedRule[]
  constraints: {
    /** role → most items one person of that role holds at once (E4). */
    capParallel: Record<string, number>
  }
  /** Leaf key → product of the applied `scale_duration` factors (leaves without one are absent). */
  scaleFactors: Record<string, number>
  /** Split part key → the key of the item it was split from. */
  derivedFrom: Record<string, string>
  /** Key of an item a rule added (prerequisite, buffer, split part) → the rule's id. */
  addedBy: Record<string, string>
}

export interface ApplyLessonRulesOptions {
  /** Start date (YYYY-MM-DD) the schedule is validated with, as `/plan/load` will place it. */
  startDate: string
  /** Name of a buffer item (default 「バッファ: <name of afterKey>」). */
  bufferName?: (afterName: string) => string
  /** Name of a split part (default 「<name> (n/N)」). */
  partName?: (name: string, part: number, parts: number) => string
}

class Reject extends Error {
  constructor(
    readonly reason: RuleRejectReason,
    readonly detail?: string
  ) {
    super(reason)
  }
}

interface State {
  schedule: BaseSchedule
  scaleFactors: Record<string, number>
  derivedFrom: Record<string, string>
  addedBy: Record<string, string>
  /** Any name a split item answered to (its key and former keys) → its parts. */
  splitParts: Record<string, string[]>
  addedCount: number
}

// ---------------------------------------------------------------- tree helpers (all return new arrays)

const isLeaf = (item: BaseScheduleItem): boolean => (item.children ?? []).length === 0

function allItems(items: readonly BaseScheduleItem[]): BaseScheduleItem[] {
  return items.flatMap((item) => [item, ...allItems(item.children ?? [])])
}

function findItem(items: readonly BaseScheduleItem[], key: string): BaseScheduleItem | undefined {
  return allItems(items).find((item) => item.key === key)
}

/** Replace the item `key` by `replacement` (0..n items) wherever it sits. */
function replaceItem(items: readonly BaseScheduleItem[], key: string, replacement: (item: BaseScheduleItem) => BaseScheduleItem[]): BaseScheduleItem[] {
  return items.flatMap((item) => {
    if (item.key === key) return replacement(item)
    if (!item.children) return [item]
    return [{ ...item, children: replaceItem(item.children, key, replacement) }]
  })
}

/** Apply `fn` to every item (children first), building new objects. */
function mapItems(items: readonly BaseScheduleItem[], fn: (item: BaseScheduleItem) => BaseScheduleItem): BaseScheduleItem[] {
  return items.map((item) => fn(item.children ? { ...item, children: mapItems(item.children, fn) } : { ...item }))
}

/** A copy of `item` without the listed fields. */
function omit<T extends object, K extends keyof T>(item: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...item }
  for (const k of keys) delete copy[k]
  return copy
}

function withDependsOn(item: BaseScheduleItem, dependsOn: string[]): BaseScheduleItem {
  const rest = omit(item, ["dependsOn"])
  return dependsOn.length > 0 ? { ...rest, dependsOn } : rest
}

/** Every dependency on `from` points at `to` instead (items listed in `except` keep theirs). */
function redirectDependencies(items: readonly BaseScheduleItem[], from: string, to: string, except: ReadonlySet<string>): BaseScheduleItem[] {
  return mapItems(items, (item) => {
    if (except.has(item.key) || !(item.dependsOn ?? []).includes(from)) return item
    const next = (item.dependsOn ?? []).map((k) => (k === from ? to : k))
    return withDependsOn(item, [...new Set(next)])
  })
}

function linksOf(items: readonly BaseScheduleItem[]): TemplateLink[] {
  return allItems(items).flatMap((item) => (item.dependsOn ?? []).map((from) => ({ from, to: item.key })))
}

function takenNames(schedule: BaseSchedule): Set<string> {
  return new Set(keyAliases(schedule).keys())
}

/** `<key>` shortened so that `<key><suffix>` fits the 40-character key. */
function derivedKey(key: string, suffix: string): string {
  return `${key.slice(0, KEY_MAX - suffix.length)}${suffix}`
}

const clipName = (name: string): string => (name.length > NAME_MAX ? name.slice(0, NAME_MAX) : name)

// ---------------------------------------------------------------- key resolution

/** The current key for a name the rule uses (a current or former key); Reject when unknown. */
function resolveOne(state: State, name: string): string {
  const current = keyAliases(state.schedule).get(name)
  if (current) return current
  throw new Reject("unknown_key", `Unknown key: ${name}`)
}

/** Current keys for a name: the item itself, or every part when the item was split. */
function resolveMany(state: State, name: string): string[] {
  const current = keyAliases(state.schedule).get(name)
  if (current) return [current]
  const parts = state.splitParts[name]
  if (parts) return parts
  throw new Reject("unknown_key", `Unknown key: ${name}`)
}

function requireLeaf(item: BaseScheduleItem): void {
  if (!isLeaf(item)) throw new Reject("not_a_leaf", `${item.key} is not a leaf`)
  if (item.milestone === true) throw new Reject("milestone", `${item.key} is a milestone`)
}

function countAdded(state: State, n: number, limit: number): number {
  const next = state.addedCount + n
  if (next > limit) throw new Reject("too_many_added_items", `At most ${limit} items may be added (would be ${next})`)
  return next
}

// ---------------------------------------------------------------- the six kinds

type Step<K extends LessonRuleKind> = (state: State, rule: LessonRuleOf<K>, ctx: Ctx) => State

interface Ctx {
  addedLimit: number
  bufferName: (afterName: string) => string
  partName: (name: string, part: number, parts: number) => string
}

const addPrerequisite: Step<"add_prerequisite"> = (state, rule, ctx) => {
  const { beforeKey, newKey, name, durationDays, role, load } = rule.params
  const target = resolveOne(state, beforeKey)
  if (takenNames(state.schedule).has(newKey)) throw new Reject("key_conflict", `Key already used: ${newKey}`)
  const addedCount = countAdded(state, 1, ctx.addedLimit)
  const before = findItem(state.schedule.items, target) as BaseScheduleItem
  const created: BaseScheduleItem = {
    key: newKey,
    name,
    durationDays,
    ...(before.dependsOn && before.dependsOn.length > 0 ? { dependsOn: [...before.dependsOn] } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(load !== undefined ? { load } : {}),
  }
  const items = replaceItem(state.schedule.items, target, (item) => [created, withDependsOn(item, [...(item.dependsOn ?? []), newKey])])
  return { ...state, schedule: { ...state.schedule, items }, addedCount, addedBy: { ...state.addedBy, [newKey]: rule.id } }
}

const addDependency: Step<"add_dependency"> = (state, rule) => {
  const from = resolveOne(state, rule.params.from)
  const to = resolveOne(state, rule.params.to)
  const block = linkBlock(state.schedule.items, linksOf(state.schedule.items), from, to)
  if (block === "unknown") throw new Reject("unknown_key", `Unknown key: ${from} or ${to}`)
  if (block) throw new Reject(block, `Dependency ${from} → ${to} refused: ${block}`)
  const items = replaceItem(state.schedule.items, to, (item) => [withDependsOn(item, [...(item.dependsOn ?? []), from])])
  return { ...state, schedule: { ...state.schedule, items } }
}

const split: Step<"split"> = (state, rule, ctx) => {
  const { parts } = rule.params
  const key = resolveOne(state, rule.params.key)
  const item = findItem(state.schedule.items, key) as BaseScheduleItem
  requireLeaf(item)
  const days = item.durationDays ?? 1
  if (days < parts * SPLIT_PART_MIN_DAYS) throw new Reject("split_too_short", `${key} has ${days} days; ${parts} parts need at least ${parts * SPLIT_PART_MIN_DAYS}`)
  const keys = Array.from({ length: parts }, (_, i) => derivedKey(key, `_p${i + 1}`))
  const taken = takenNames(state.schedule)
  const clash = keys.find((k) => taken.has(k))
  if (clash) throw new Reject("key_conflict", `Key already used: ${clash}`)
  const addedCount = countAdded(state, parts - 1, ctx.addedLimit)

  const share = Math.floor(days / parts)
  const extra = days % parts
  const carried = omit(item, ["formerKeys", "dependsOn", "key", "name", "durationDays"])
  const pieces: BaseScheduleItem[] = keys.map((k, i) => {
    const dependsOn = i === 0 ? [...(item.dependsOn ?? [])] : [keys[i - 1]]
    return {
      ...carried,
      key: k,
      name: clipName(ctx.partName(item.name, i + 1, parts)),
      durationDays: share + (i < extra ? 1 : 0),
      ...(dependsOn.length > 0 ? { dependsOn } : {}),
    }
  })
  const replaced = replaceItem(state.schedule.items, key, () => pieces)
  const items = redirectDependencies(replaced, key, keys[parts - 1], new Set(keys))

  // Every name the old item answered to now reaches its parts (later rules may use a former key).
  const names = [key, ...(item.formerKeys ?? [])]
  const inherited = Object.entries(state.splitParts).filter(([, ps]) => ps.includes(key))
  const splitParts = { ...state.splitParts }
  for (const n of names) splitParts[n] = keys
  // A part split again: names that reached the old part now reach its pieces in its place.
  for (const [n, ps] of inherited) splitParts[n] = ps.flatMap((p) => (p === key ? keys : [p]))

  const origin = state.derivedFrom[key] ?? key
  const derivedFrom = { ...state.derivedFrom }
  delete derivedFrom[key]
  for (const k of keys) derivedFrom[k] = origin
  const addedBy = { ...state.addedBy }
  for (const k of keys.slice(1)) addedBy[k] = rule.id
  if (state.addedBy[key]) addedBy[keys[0]] = state.addedBy[key]
  delete addedBy[key]

  const scaleFactors = { ...state.scaleFactors }
  if (scaleFactors[key] !== undefined) {
    for (const k of keys) scaleFactors[k] = scaleFactors[key]
    delete scaleFactors[key]
  }
  return { ...state, schedule: { ...state.schedule, items }, addedCount, splitParts, derivedFrom, addedBy, scaleFactors }
}

const addBuffer: Step<"add_buffer"> = (state, rule, ctx) => {
  const targets = resolveMany(state, rule.params.afterKey)
  const after = targets[targets.length - 1]
  const item = findItem(state.schedule.items, after) as BaseScheduleItem
  const taken = takenNames(state.schedule)
  let n = 1
  while (taken.has(derivedKey(after, `_buf${n}`))) n += 1
  const key = derivedKey(after, `_buf${n}`)
  const addedCount = countAdded(state, 1, ctx.addedLimit)
  const buffer: BaseScheduleItem = { key, name: clipName(ctx.bufferName(item.name)), durationDays: rule.params.days, dependsOn: [after], load: 0 }
  const inserted = replaceItem(state.schedule.items, after, (it) => [it, buffer])
  const items = redirectDependencies(inserted, after, key, new Set([key]))
  return { ...state, schedule: { ...state.schedule, items }, addedCount, addedBy: { ...state.addedBy, [key]: rule.id } }
}

const scaleDuration: Step<"scale_duration"> = (state, rule) => {
  const targets = resolveMany(state, rule.params.key)
  const scaleFactors = { ...state.scaleFactors }
  for (const key of targets) {
    requireLeaf(findItem(state.schedule.items, key) as BaseScheduleItem)
    const product = (scaleFactors[key] ?? 1) * rule.params.factor
    if (product < SCALE_FACTOR_MIN - EPSILON || product > SCALE_FACTOR_MAX + EPSILON) {
      throw new Reject("scale_out_of_bounds", `Scale product on ${key} would be ${product} (allowed ${SCALE_FACTOR_MIN}-${SCALE_FACTOR_MAX})`)
    }
    scaleFactors[key] = product
  }
  return { ...state, scaleFactors }
}

const STEPS: { [K in LessonRuleKind]: Step<K> } = {
  add_prerequisite: addPrerequisite,
  add_dependency: addDependency,
  split,
  add_buffer: addBuffer,
  scale_duration: scaleDuration,
  cap_parallel: (state) => state,
}

function runStep(state: State, rule: LessonRule, ctx: Ctx): State {
  return (STEPS[rule.kind] as Step<typeof rule.kind>)(state, rule as never, ctx)
}

// ---------------------------------------------------------------- validation and the entry point

function validate(schedule: BaseSchedule, startDate: string): void {
  // Size, depth and links first (their reasons are more specific), then the item shapes (names, dependsOn ≤ 50).
  try {
    planBaseSchedule(schedule, startDate)
  } catch (err) {
    if (!(err instanceof PlanScheduleError)) throw err
    const reason: RuleRejectReason = err.code === "PLAN_SCHEDULE_TOO_LARGE" ? "schedule_too_large" : err.code === "PLAN_SCHEDULE_TOO_DEEP" ? "schedule_too_deep" : "schedule_invalid"
    throw new Reject(reason, err.message)
  }
  const shape = baseScheduleSchema.safeParse(schedule)
  if (!shape.success) {
    const issue = shape.error.issues[0]
    throw new Reject("schedule_invalid", issue ? `${issue.path.join(".")}: ${issue.message}` : "Schedule does not match its schema")
  }
}

/** The template must load as it is; otherwise the caller passed a broken schedule (PlanScheduleError). */
function validateTemplate(template: BaseSchedule, startDate: string): void {
  const shape = baseScheduleSchema.safeParse(template)
  if (!shape.success) {
    const issue = shape.error.issues[0]
    throw new PlanScheduleError("PLAN_SCHEDULE_INVALID", issue ? `${issue.path.join(".")}: ${issue.message}` : "Schedule does not match its schema")
  }
  planBaseSchedule(template, startDate)
}

const kindRank = (kind: string): number => {
  const i = (RULE_KIND_ORDER as readonly string[]).indexOf(kind)
  return i < 0 ? RULE_KIND_ORDER.length : i
}

const ruleIdOf = (rule: unknown): string => {
  const id = (rule as { id?: unknown } | null)?.id
  return typeof id === "string" ? id : ""
}
const kindOf = (rule: unknown): string => {
  const kind = (rule as { kind?: unknown } | null)?.kind
  return typeof kind === "string" ? kind : ""
}

/**
 * Apply the `confirmed` rules among `rules` (drafts and retired rules are ignored: they never change a plan).
 * Rules are re-validated here, so stored or drafted rules may be passed as they are; an invalid one is rejected
 * with `invalid_params`. Throws PlanScheduleError only when the template itself does not load.
 */
export function applyLessonRules(template: BaseSchedule, rules: readonly unknown[], options: ApplyLessonRulesOptions): LessonRuleResult {
  validateTemplate(template, options.startDate) // a broken template is the caller's error, not a rule's
  const templateLeaves = allItems(template.items).filter(isLeaf).length
  const ctx: Ctx = {
    addedLimit: Math.min(ADDED_ITEMS_MAX, Math.floor(templateLeaves * ADDED_ITEMS_MAX_SHARE)),
    bufferName: options.bufferName ?? ((name) => `バッファ: ${name}`),
    partName: options.partName ?? ((name, part, parts) => `${name} (${part}/${parts})`),
  }

  const ordered = rules
    .filter((r) => (r as { state?: unknown } | null)?.state === "confirmed")
    .map((r, index) => ({ r, index }))
    .sort((a, b) => kindRank(kindOf(a.r)) - kindRank(kindOf(b.r)) || (ruleIdOf(a.r) < ruleIdOf(b.r) ? -1 : ruleIdOf(a.r) > ruleIdOf(b.r) ? 1 : a.index - b.index))
    .map(({ r }) => r)

  let state: State = { schedule: structuredClone(template), scaleFactors: {}, derivedFrom: {}, addedBy: {}, splitParts: {}, addedCount: 0 }
  const applied: string[] = []
  const rejected: RejectedRule[] = []
  const capParallel: Record<string, number> = {}

  for (const raw of ordered) {
    const parsed = lessonRuleSchema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      rejected.push({ ruleId: ruleIdOf(raw), kind: kindOf(raw), reason: "invalid_params", detail: issue ? `${issue.path.join(".")}: ${issue.message}` : undefined })
      continue
    }
    const rule = parsed.data
    try {
      const next = runStep(state, rule, ctx)
      if (next.schedule !== state.schedule) validate(next.schedule, options.startDate)
      state = next
      if (rule.kind === "cap_parallel") {
        const { role, max } = rule.params
        capParallel[role] = Math.min(capParallel[role] ?? max, max)
      }
      applied.push(rule.id)
    } catch (err) {
      if (err instanceof Reject) rejected.push({ ruleId: rule.id, kind: rule.kind, reason: err.reason, ...(err.detail ? { detail: err.detail } : {}) })
      else if (err instanceof PlanScheduleError) rejected.push({ ruleId: rule.id, kind: rule.kind, reason: "schedule_invalid", detail: err.message })
      else throw err
    }
  }

  return {
    schedule: state.schedule,
    applied,
    rejected,
    constraints: { capParallel },
    scaleFactors: state.scaleFactors,
    derivedFrom: state.derivedFrom,
    addedBy: state.addedBy,
  }
}
