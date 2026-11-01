import { formatAcId } from "./acceptance-criteria.schemas"

/** Columns read for a criterion (the DTO fields; audit columns are not exposed). */
export const AC_SELECT = {
  seq: true,
  given: true,
  when: true,
  then: true,
  text: true,
  evidenceKind: true,
} as const

export interface AcceptanceCriterionDto {
  /** Display id, e.g. `PBI-12/AC-2`. */
  id: string
  seq: number
  given: string | null
  when: string | null
  then: string | null
  text: string | null
  evidenceKind: string | null
}

type Row = Pick<AcceptanceCriterionDto, "seq" | "given" | "when" | "then" | "text" | "evidenceKind">

/** Pure: a stored row → the DTO of the APIs (get_pbi, the PBI screen). */
export function toAcceptanceCriterionDto(pbiDisplayId: number, row: Row): AcceptanceCriterionDto {
  return {
    id: formatAcId(pbiDisplayId, row.seq),
    seq: row.seq,
    given: row.given,
    when: row.when,
    then: row.then,
    text: row.text,
    evidenceKind: row.evidenceKind,
  }
}
