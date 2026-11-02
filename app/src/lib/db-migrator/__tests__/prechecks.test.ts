import { describe, expect, it } from "vitest"
import { CitextDuplicateFinder, checkSchemaCompat, citextUniqueKeys } from "../prechecks"
import type { SourceSchema, TargetColumn, TargetSchema } from "../schema"

function tcol(name: string, typname: string, extra: Partial<TargetColumn> = {}): TargetColumn {
  return { name, typname, typtype: "b", pgType: typname, nullable: true, maxLength: null, isCitext: typname === "citext", ...extra }
}

describe("CitextDuplicateFinder", () => {
  it("groups values that collide under citext (lower-case) semantics", () => {
    const f = new CitextDuplicateFinder([true])
    f.add("u1", ["Alice@Example.test"])
    f.add("u2", ["alice@example.TEST"])
    f.add("u3", ["bob@example.test"])
    f.add("u4", [null])
    f.add("u5", [null])
    expect(f.duplicates()).toEqual([{ value: "alice@example.test", keys: ["u1", "u2"] }])
  })

  it("catches pairs utf8mb4_unicode_ci keeps apart but lower() merges (U+023A / U+2C65)", () => {
    const f = new CitextDuplicateFinder([true])
    f.add("u1", ["Ⱥlice@example.test"])
    f.add("u2", ["ⱥlice@example.test"])
    expect(f.duplicates()).toHaveLength(1)
  })

  it("compares the non-citext parts of a composite key exactly", () => {
    // (planItemId text, label citext)
    const f = new CitextDuplicateFinder([false, true])
    f.add("c1", ["item-1", "Review"])
    f.add("c2", ["item-1", "REVIEW"])
    f.add("c3", ["ITEM-1", "review"])
    f.add("c4", ["item-2", "review"])
    expect(f.duplicates()).toEqual([{ value: '["item-1","review"]', keys: ["c1", "c2"] }])
  })
})

describe("citextUniqueKeys", () => {
  it("returns only the unique keys that contain a citext column", () => {
    const schema = {
      tables: [
        { name: "User", primaryKey: ["id"], columns: [tcol("id", "text"), tcol("email", "citext"), tcol("name", "text")] },
        { name: "lesson", primaryKey: ["id"], columns: [tcol("id", "text"), tcol("signature", "varchar"), tcol("scope", "varchar")] },
      ],
      uniqueKeys: [
        { name: "User_email_key", table: "User", columns: ["email"] },
        { name: "lesson_signature_scope_key", table: "lesson", columns: ["signature", "scope"] },
      ],
    } as unknown as TargetSchema
    expect(citextUniqueKeys(schema).map((k) => k.name)).toEqual(["User_email_key"])
  })
})

describe("checkSchemaCompat", () => {
  const target = {
    tables: [
      {
        name: "T",
        primaryKey: ["id"],
        columns: [
          tcol("id", "text", { nullable: false }),
          tcol("flag", "bool"),
          tcol("at", "timestamp"),
          tcol("meta", "jsonb"),
          tcol("label", "varchar", { maxLength: 10 }),
        ],
      },
    ],
  } as unknown as TargetSchema
  const okSource: SourceSchema = {
    tables: [
      {
        name: "T",
        primaryKey: ["id"],
        columns: [
          { name: "id", dataType: "varchar", columnType: "varchar(191)", nullable: false, maxLength: 191 },
          { name: "flag", dataType: "tinyint", columnType: "tinyint(1)", nullable: true, maxLength: null },
          { name: "at", dataType: "datetime", columnType: "datetime(3)", nullable: true, maxLength: null },
          { name: "meta", dataType: "json", columnType: "json", nullable: true, maxLength: null },
          { name: "label", dataType: "varchar", columnType: "varchar(10)", nullable: true, maxLength: 10 },
        ],
      },
    ],
  }

  it("accepts the Prisma MySQL -> PostgreSQL type pairs", () => {
    expect(checkSchemaCompat(okSource, target).issues).toEqual([])
  })

  it("flags an incompatible type pair", () => {
    const src = structuredClone(okSource)
    src.tables[0].columns[2] = { name: "at", dataType: "varchar", columnType: "varchar(30)", nullable: true, maxLength: 30 }
    expect(checkSchemaCompat(src, target).issues.map((i) => i.code)).toEqual(["SCHEMA_TYPE_INCOMPATIBLE"])
  })

  it("flags a table without a primary key on either side", () => {
    const src = structuredClone(okSource)
    src.tables[0].primaryKey = []
    expect(checkSchemaCompat(src, target).issues.map((i) => i.code)).toEqual(["NO_PRIMARY_KEY"])
  })

  it("flags a target table missing in the source and ignores _prisma_migrations", () => {
    const t = structuredClone(target)
    t.tables.push({ name: "New", primaryKey: ["id"], columns: [tcol("id", "text", { nullable: false })] })
    const src = structuredClone(okSource)
    src.tables.push({ name: "_prisma_migrations", primaryKey: ["id"], columns: [] })
    expect(checkSchemaCompat(src, t).issues.map((i) => i.code)).toEqual(["SCHEMA_TABLE_MISSING_IN_SOURCE"])
  })

  it("reports which columns need a length check (target bound tighter than source)", () => {
    const src = structuredClone(okSource)
    src.tables[0].columns[4] = { name: "label", dataType: "varchar", columnType: "varchar(191)", nullable: true, maxLength: 191 }
    const r = checkSchemaCompat(src, target)
    expect(r.issues).toEqual([])
    expect(r.mappings.get("T")?.find((m) => m.name === "label")?.lengthLimit).toBe(10)
    expect(r.mappings.get("T")?.find((m) => m.name === "id")?.lengthLimit).toBeNull()
  })
})
