/** Identifier quoting and statement tags. Identifiers come from the catalogs, never from user input. */

export function pgIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function myIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``
}

/** Leading comment naming the statement's purpose; table names are reduced to [A-Za-z0-9_]. */
export function tag(purpose: string, table = ""): string {
  return `/* k2:${purpose}:${table.replace(/[^A-Za-z0-9_]/g, "_")} */`
}
