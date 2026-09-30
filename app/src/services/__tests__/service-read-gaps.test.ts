import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/services/_shared/db",async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/members/members.repository")
vi.mock("@/services/user-categories/user-categories.repository")
vi.mock("@/services/plan/plan.repository")
vi.mock("@/services/sprints/sprints.repository")
vi.mock("@/services/users/users.repository")

const { DEFAULT_DB } = await import("@/services/__tests__/support")
const membersRepo = await import("@/services/members/members.repository")
const catRepo = await import("@/services/user-categories/user-categories.repository")
const planRepo = await import("@/services/plan/plan.repository")
const sprintsRepo = await import("@/services/sprints/sprints.repository")
const usersRepo = await import("@/services/users/users.repository")
const { NotFoundError } = await import("@/services/_shared/errors")

const members = await import("@/services/members/members.service")
const cats = await import("@/services/user-categories/user-categories.service")
const plan = await import("@/services/plan/plan.service")
const sprints = await import("@/services/sprints/sprints.service")
const account = await import("@/services/users/account.service")

describe("read-side service entry points", () => {
  beforeEach(() => vi.clearAllMocks())

  it("listMembers reads the project's members on the default client", async () => {
    vi.mocked(membersRepo.findMembers).mockResolvedValue([{ id: "m1" }] as never)
    await expect(members.listMembers("p1")).resolves.toEqual([{ id: "m1" }])
    expect(membersRepo.findMembers).toHaveBeenCalledWith(DEFAULT_DB, "p1")
  })

  it("listUserCategories only ever reads the caller's own categories", async () => {
    vi.mocked(catRepo.findUserCategories).mockResolvedValue([] as never)
    await cats.listUserCategories("u1")
    expect(catRepo.findUserCategories).toHaveBeenCalledWith(DEFAULT_DB, "u1")
  })

  it("listPlan reads the project's live plan (items, links, dependencies) on the default client", async () => {
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([])
    vi.mocked(planRepo.findLinkedPbisOfProject).mockResolvedValue([])
    vi.mocked(planRepo.findDependencies).mockResolvedValue([])
    await expect(plan.listPlan("p1", new Date("2026-10-01T00:00:00Z"))).resolves.toEqual({ items: [], dependencies: [], today: "2026-10-01" })
    expect(planRepo.findPlanItems).toHaveBeenCalledWith(DEFAULT_DB, "p1")
    expect(planRepo.findLinkedPbisOfProject).toHaveBeenCalledWith(DEFAULT_DB, "p1")
  })

  it("getSprint throws NotFound for a sprint outside the project", async () => {
    vi.mocked(sprintsRepo.findSprintDetail).mockResolvedValue(null)
    await expect(sprints.getSprint("p1", "s-other")).rejects.toBeInstanceOf(NotFoundError)
    expect(sprintsRepo.findSprintDetail).toHaveBeenCalledWith(DEFAULT_DB, "p1", "s-other")
  })

  it("getSprint returns the sprint with i18n", async () => {
    vi.mocked(sprintsRepo.findSprintDetail).mockResolvedValue({ id: "s1" } as never)
    await expect(sprints.getSprint("p1", "s1")).resolves.toEqual({ id: "s1", i18n: {} })
  })

  it("getProfile throws NotFound for a missing user and returns the profile otherwise", async () => {
    vi.mocked(usersRepo.findProfile).mockResolvedValueOnce(null)
    await expect(account.getProfile("u1")).rejects.toBeInstanceOf(NotFoundError)
    vi.mocked(usersRepo.findProfile).mockResolvedValueOnce({ id: "u1" } as never)
    await expect(account.getProfile("u1")).resolves.toEqual({ id: "u1" })
  })
})
