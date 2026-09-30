/**
 * Environment gates for the E2E suite.
 *
 * Write flows mutate data (create project / PBI / sprint / task). They run
 * only when explicitly enabled AND credentials are provided, and must be
 * pointed at a separate test database — never the shared/production DB.
 */
export const e2eUser = process.env.E2E_USER ?? ""
export const e2ePassword = process.env.E2E_PASSWORD ?? ""

export const writeFlowsEnabled =
  process.env.E2E_ALLOW_WRITE === "1" && e2eUser !== "" && e2ePassword !== ""

export const WRITE_SKIP_REASON =
  "write flow: set E2E_ALLOW_WRITE=1, E2E_USER and E2E_PASSWORD (separate TEST database only)"
