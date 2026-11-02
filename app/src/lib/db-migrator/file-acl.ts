/**
 * Windows: POSIX mode bits mean nothing, so password files are checked with
 * icacls. Any access entry for a broad group refuses the file - by name
 * (Everyone, Users, Authenticated Users, Guests, ...; English names) and by
 * well-known SID as icacls prints it when a name does not resolve or the
 * system language differs (*S-1-1-0 Everyone, *S-1-5-11 Authenticated Users,
 * *S-1-5-32-545 Users, *S-1-5-32-546 Guests, *S-1-5-4 INTERACTIVE).
 * The runbook's icacls command leaves only the operator, SYSTEM and Administrators.
 */
import { execFileSync } from "node:child_process"
import path from "node:path"
import { MigratorError } from "./errors"

const BROAD = [
  /\bEveryone:/i,
  /BUILTIN\\Users:/i,
  /NT AUTHORITY\\Authenticated Users:/i,
  /BUILTIN\\Guests:/i,
  /\\Domain Users:/i,
  /NT AUTHORITY\\INTERACTIVE:/i,
  /\*S-1-1-0:/i,
  /\*S-1-5-11:/i,
  /\*S-1-5-32-545:/i,
  /\*S-1-5-32-546:/i,
  /\*S-1-5-4:/i,
]

export function assertWindowsAclPrivate(file: string, icaclsOutput: string): void {
  const hit = BROAD.find((re) => re.test(icaclsOutput))
  if (hit) {
    throw new MigratorError("PASSWORD_FILE_MODE", `${file} grants access to a broad group (${hit.source}); restrict it with icacls (see the cutover runbook)`)
  }
}

/** %SystemRoot%\System32\icacls.exe - never resolved through PATH (a planted icacls.exe could lie). */
export function icaclsPath(env: Record<string, string | undefined> = process.env): string {
  return path.win32.join(env.SystemRoot ?? "C:\\Windows", "System32", "icacls.exe")
}

/** Reads the ACL with icacls (bounded) and checks it. */
export function checkWindowsAcl(file: string): void {
  const out = execFileSync(icaclsPath(), [file], { encoding: "utf8", timeout: 10_000, windowsHide: true })
  assertWindowsAclPrivate(file, out)
}
