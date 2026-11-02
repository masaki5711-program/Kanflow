/**
 * Windows: POSIX mode bits mean nothing, so password files are checked with
 * icacls. Any access entry for a broad group (Everyone, Users, Authenticated
 * Users, Guests, ...) refuses the file; the runbook's icacls command leaves
 * only the operator, SYSTEM and Administrators.
 */
import { execFileSync } from "node:child_process"
import { MigratorError } from "./errors"

const BROAD = [/\bEveryone:/i, /BUILTIN\\Users:/i, /NT AUTHORITY\\Authenticated Users:/i, /BUILTIN\\Guests:/i, /\\Domain Users:/i, /NT AUTHORITY\\INTERACTIVE:/i]

export function assertWindowsAclPrivate(file: string, icaclsOutput: string): void {
  const hit = BROAD.find((re) => re.test(icaclsOutput))
  if (hit) {
    throw new MigratorError("PASSWORD_FILE_MODE", `${file} grants access to a broad group (${hit.source}); restrict it with icacls (see the cutover runbook)`)
  }
}

/** Reads the ACL with icacls (bounded) and checks it. */
export function checkWindowsAcl(file: string): void {
  const out = execFileSync("icacls", [file], { encoding: "utf8", timeout: 10_000, windowsHide: true })
  assertWindowsAclPrivate(file, out)
}
