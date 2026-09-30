/**
 * Shared fakes for project route tests. The real `requireProject` runs; only
 * `auth()` and the two authz Prisma lookups are faked. Wire it up with:
 *
 *   vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
 *   vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
 *   vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
 */
import { vi } from "vitest"

export const authMock = vi.fn()
export const memberFindFirst = vi.fn()
export const sectionFindFirst = vi.fn()

export const authModule = { auth: () => authMock() }
export const prismaModule = {
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => sectionFindFirst(...a) },
  },
}
const noopLog = { debug() {}, info() {}, warn() {}, error() {}, child: () => noopLog }
export const loggerModule = { logger: noopLog }

export const PROJECT_ID = "proj-1"
export const USER = { id: "u1", name: "Alice", role: "member" }
export const ACTOR = { userId: "u1", userName: "Alice", systemRole: "member" }

/** Signed-in user with the given project role (null = not a member). */
export function asRole(projectRole: "po" | "sm" | "dev" | null, systemRole = "member"): void {
  authMock.mockReset().mockResolvedValue({ user: { ...USER, role: systemRole } })
  memberFindFirst.mockReset().mockResolvedValue(projectRole ? { role: projectRole } : null)
  sectionFindFirst.mockReset().mockResolvedValue(null)
}

export function signedOut(): void {
  authMock.mockReset().mockResolvedValue(null)
}

export function req(method: string, body?: unknown): Request {
  const url = `http://localhost/api/projects/${PROJECT_ID}`
  if (body === undefined) return new Request(url, { method })
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

export function ctx<T extends Record<string, string>>(extra?: T): { params: Promise<{ projectId: string } & T> } {
  return { params: Promise.resolve({ projectId: PROJECT_ID, ...(extra ?? ({} as T)) }) }
}

export async function read(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: await res.json() }
}
