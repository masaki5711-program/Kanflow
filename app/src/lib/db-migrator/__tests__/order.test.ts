import { describe, expect, it } from "vitest"
import { MigratorError } from "../errors"
import { planCopyOrder, type FkEdge } from "../order"

function fk(table: string, refTable: string, nullable: boolean, name = `${table}_${refTable}_fkey`): FkEdge {
  return { name, table, columns: [`${refTable}Id`], refTable, refColumns: ["id"], nullable }
}

function before(order: string[], a: string, b: string): boolean {
  return order.indexOf(a) < order.indexOf(b)
}

describe("planCopyOrder", () => {
  it("puts parents before children and is deterministic", () => {
    const plan = planCopyOrder(["Task", "Sprint", "Project", "User"], [fk("Task", "Sprint", false), fk("Sprint", "Project", false), fk("Task", "User", true)])
    expect(plan.order).toEqual(["Project", "Sprint", "User", "Task"])
    expect(plan.deferred).toEqual([])
  })

  it("defers a nullable self-reference (tree) instead of ordering rows", () => {
    const self = fk("PlanItem", "PlanItem", true, "PlanItem_parentId_fkey")
    const plan = planCopyOrder(["PlanItem", "Project"], [self, fk("PlanItem", "Project", false)])
    expect(plan.order).toEqual(["Project", "PlanItem"])
    expect(plan.deferred).toEqual([self])
  })

  it("refuses a NOT NULL self-reference", () => {
    expect(() => planCopyOrder(["A"], [fk("A", "A", false)])).toThrow(MigratorError)
  })

  it("breaks a multi-table cycle on a nullable edge", () => {
    const ab = fk("A", "B", false)
    const bc = fk("B", "C", false)
    const ca = fk("C", "A", true)
    const plan = planCopyOrder(["A", "B", "C"], [ab, bc, ca])
    expect(plan.deferred).toEqual([ca])
    expect(before(plan.order, "C", "B")).toBe(true)
    expect(before(plan.order, "B", "A")).toBe(true)
  })

  it("breaks nested cycles until the graph is acyclic", () => {
    const edges = [fk("A", "B", true), fk("B", "A", true), fk("B", "C", false), fk("C", "B", true), fk("D", "A", false)]
    const plan = planCopyOrder(["A", "B", "C", "D"], edges)
    const kept = edges.filter((e) => !plan.deferred.includes(e))
    for (const e of kept) expect(before(plan.order, e.refTable, e.table)).toBe(true)
    expect(plan.order).toHaveLength(4)
    expect(plan.deferred.every((e) => e.nullable)).toBe(true)
  })

  it("refuses a cycle with no nullable edge and names the tables", () => {
    try {
      planCopyOrder(["A", "B"], [fk("A", "B", false), fk("B", "A", false)])
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(MigratorError)
      expect((e as MigratorError).code).toBe("FK_CYCLE_UNBREAKABLE")
      expect((e as MigratorError).message).toContain("A")
      expect((e as MigratorError).message).toContain("B")
    }
  })

  it("refuses an FK to a table outside the copy set", () => {
    expect(() => planCopyOrder(["A"], [fk("A", "Ghost", true)])).toThrow(/Ghost/)
  })
})
