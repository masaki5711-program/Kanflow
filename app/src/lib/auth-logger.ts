/**
 * Auth.js `logger` override (C3-02).
 *
 * A wrong password is an expected event: Auth.js reports it as a
 * `CredentialsSignin` error and its default logger prints a ~17-line stack
 * trace for every attempt, which buries real problems in the server log.
 * Expected sign-in failures become ONE warn line without a stack; every
 * other auth error keeps the full stack (and its cause) on stderr.
 */

/** Auth.js error types that are normal user behaviour, not faults. */
export const EXPECTED_AUTH_ERROR_TYPES: ReadonlySet<string> = new Set(["CredentialsSignin"])

function authErrorType(error: Error): string {
  const type = (error as { type?: unknown }).type
  return typeof type === "string" ? type : error.name
}

export function isExpectedAuthError(error: Error): boolean {
  return EXPECTED_AUTH_ERROR_TYPES.has(authErrorType(error))
}

function logUnexpected(error: Error): void {
  const cause = (error as { cause?: unknown }).cause
  const causeErr = cause && typeof cause === "object" && "err" in cause ? (cause as { err: unknown }).err : null
  console.error(`[auth][error] ${authErrorType(error)}: ${error.message}`)
  if (causeErr instanceof Error) console.error("[auth][cause]:", causeErr.stack ?? causeErr.message)
  else if (error.stack) console.error(error.stack)
}

export const authLogger = {
  error(error: Error): void {
    if (isExpectedAuthError(error)) {
      console.warn(`[auth] sign-in rejected (${authErrorType(error)})`)
      return
    }
    logUnexpected(error)
  },
}
