/**
 * Test double of the DB-backed half of api-v1.confidential.ts for route / MCP tests that mock their
 * services and Prisma: "nothing is confidential". The real behavior is covered by
 * api-v1.confidential.test.ts and confidential-enforcement.test.ts.
 *
 *   vi.mock("@/services/api-v1/api-v1.confidential", async (orig) => ({
 *     ...(await orig<typeof import("@/services/api-v1/api-v1.confidential")>()),
 *     ...(await import("@/services/api-v1/__tests__/confidential-passthrough")).confidentialPassthrough,
 *   }))
 */
export const confidentialPassthrough = {
  confidentialPbiIds: async () => new Set<string>(),
  withoutConfidentialItems: async <T>(items: readonly T[]) => [...items],
  maskPbiRef: async (_projectId: string, ref: string) => ref,
  maskPbiIds: async (ids: readonly string[]) => [...ids],
  maskTaskId: async (taskId: string) => taskId,
  maskClaimId: async (_projectId: string, claimId: string) => claimId,
  maskCommentEntityId: async (_projectId: string, _entityType: string, entityId: string) => entityId,
}
