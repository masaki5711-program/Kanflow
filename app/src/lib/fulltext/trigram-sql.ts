import { Prisma } from "@/generated/prisma/client"

/**
 * SQL fragments of the trigram ("fulltext") search path on PostgreSQL.
 *
 * - termsMatch: every term (or, mode "any", at least one) occurs as a
 *   case-insensitive substring (`ILIKE '%term%'`) of at least one column. The
 *   searched columns carry pg_trgm GIN indexes (`*_trgm_idx`, migration
 *   0_init), which serve these filters for terms of 3+ characters.
 * - termsScore: Σ word_similarity(term, columns joined) — pg_trgm relevance,
 *   1.0 when a term occurs as a whole word.
 *
 * Column fragments must be static SQL (quoted identifiers); terms are always
 * bound parameters.
 */

export type TermMode = "all" | "any"

/** Escape LIKE wildcards and the escape character (backslash, PostgreSQL's default). */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function termsMatch(cols: readonly Prisma.Sql[], terms: readonly string[], mode: TermMode = "all"): Prisma.Sql {
  const perTerm = terms.map((t) => {
    const pattern = `%${escapeLikeTerm(t)}%`
    return Prisma.sql`(${Prisma.join(
      cols.map((c) => Prisma.sql`${c} ILIKE ${pattern}`),
      " OR "
    )})`
  })
  return Prisma.sql`(${Prisma.join(perTerm, mode === "all" ? " AND " : " OR ")})`
}

export function termsScore(cols: readonly Prisma.Sql[], terms: readonly string[]): Prisma.Sql {
  const doc = Prisma.sql`concat_ws(' ', ${Prisma.join(cols)})`
  return Prisma.sql`(${Prisma.join(
    terms.map((t) => Prisma.sql`word_similarity(${t}, ${doc})`),
    " + "
  )})`
}
