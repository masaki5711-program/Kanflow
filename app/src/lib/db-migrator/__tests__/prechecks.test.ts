import { describe, expect, it } from "vitest"
import { CitextDuplicateFinder, checkSchemaCompat, citextUniqueKeys } from "../prechecks"
import type { SourceSchema, TargetColumn, TargetSchema } from "../schema"

function tcol(name: string, typname: string, extra: Partial<TargetColumn> = {}): TargetColumn {
  return { name, typname, typtype: "b", pgType: typname, nullable: true, hasDefault: false, maxLength: null, isCitext: typname === "citext", ...extra }
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

  describe("--target-superset (the target schema is a newer version of the source's)", () => {
    const newer = (): TargetSchema => {
      const t = structuredClone(target)
      // A table only the newer schema has, and three columns only it has on T.
      t.tables.push({ name: "New", primaryKey: ["id"], columns: [tcol("id", "text", { nullable: false })] })
      t.tables[0].columns.push(tcol("note", "text"), tcol("confidential", "bool", { nullable: false, hasDefault: true }))
      return t
    }

    it("without the option, the newer schema is refused as before", () => {
      expect(checkSchemaCompat(okSource, newer()).issues.map((i) => i.code).sort()).toEqual(["SCHEMA_COLUMN_MISMATCH", "SCHEMA_TABLE_MISSING_IN_SOURCE"])
    })

    it("a target-only table stays empty and target-only nullable / defaulted columns are left out of the copy (both reported)", () => {
      const r = checkSchemaCompat(okSource, newer(), { targetSuperset: true })
      expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
      expect(r.issues.map((i) => [i.code, i.severity])).toEqual([
        ["TARGET_TABLE_LEFT_EMPTY", "info"],
        ["TARGET_COLUMNS_DEFAULTED", "warning"],
      ])
      expect(r.issues.find((i) => i.code === "TARGET_TABLE_LEFT_EMPTY")?.message).toContain("New")
      expect(r.issues.find((i) => i.code === "TARGET_COLUMNS_DEFAULTED")?.message).toContain("T.note, T.confidential")
      // Only the shared columns are copied and verified; New is not copied at all.
      expect(r.tables.map((t) => t.table)).toEqual(["T"])
      expect(r.mappings.get("T")?.map((m) => m.name)).toEqual(["id", "flag", "at", "meta", "label"])
    })

    it("a target-only NOT NULL column without a default is still refused (the row could not be written)", () => {
      const t = newer()
      t.tables[0].columns.push(tcol("required", "text", { nullable: false, hasDefault: false }))
      const r = checkSchemaCompat(okSource, t, { targetSuperset: true })
      expect(r.issues.filter((i) => i.severity === "error").map((i) => [i.code, i.message])).toEqual([["SCHEMA_COLUMN_MISMATCH", "T: columns missing in source [required], missing in target []"]])
    })

    it("a SOURCE column or table the target lacks is still refused (its data would be lost)", () => {
      const src = structuredClone(okSource)
      src.tables[0].columns.push({ name: "legacy", dataType: "varchar", columnType: "varchar(10)", nullable: true, maxLength: 10 })
      src.tables.push({ name: "Old", primaryKey: ["id"], columns: [{ name: "id", dataType: "varchar", columnType: "varchar(10)", nullable: false, maxLength: 10 }] })
      const codes = checkSchemaCompat(src, newer(), { targetSuperset: true }).issues.filter((i) => i.severity === "error").map((i) => i.code).sort()
      expect(codes).toEqual(["SCHEMA_COLUMN_MISMATCH", "SCHEMA_TABLE_MISSING_IN_TARGET"])
    })
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

describe("checkSchemaCompat: precision / scale / fraction / width (refused before writing)", () => {
  const mk = (src: { dataType: string; columnType: string }, tgt: { typname: string; pgType: string }) =>
    checkSchemaCompat(
      { tables: [{ name: "T", primaryKey: ["id"], columns: [{ name: "id", dataType: "int", columnType: "int", nullable: false, maxLength: null }, { name: "v", nullable: true, maxLength: null, ...src }] }] },
      {
        tables: [{ name: "T", primaryKey: ["id"], columns: [tcol("id", "int4", { pgType: "integer", nullable: false }), tcol("v", tgt.typname, { pgType: tgt.pgType })] }],
      } as unknown as TargetSchema,
    ).issues.map((i) => i.code)

  it("refuses losing fractional seconds", () => {
    expect(mk({ dataType: "datetime", columnType: "datetime(6)" }, { typname: "timestamp", pgType: "timestamp(3) without time zone" })).toEqual(["SCHEMA_PRECISION"])
    expect(mk({ dataType: "datetime", columnType: "datetime(3)" }, { typname: "timestamp", pgType: "timestamp(3) without time zone" })).toEqual([])
    expect(mk({ dataType: "datetime", columnType: "datetime" }, { typname: "timestamp", pgType: "timestamp(3) without time zone" })).toEqual([])
  })
  it("refuses a narrower decimal", () => {
    expect(mk({ dataType: "decimal", columnType: "decimal(10,4)" }, { typname: "numeric", pgType: "numeric(10,2)" })).toEqual(["SCHEMA_PRECISION"])
    expect(mk({ dataType: "decimal", columnType: "decimal(12,2)" }, { typname: "numeric", pgType: "numeric(10,2)" })).toEqual(["SCHEMA_PRECISION"])
    expect(mk({ dataType: "decimal", columnType: "decimal(10,2)" }, { typname: "numeric", pgType: "numeric(12,4)" })).toEqual([])
    expect(mk({ dataType: "decimal", columnType: "decimal(10,2)" }, { typname: "numeric", pgType: "numeric" })).toEqual([])
  })
  it("refuses a narrower integer or float", () => {
    expect(mk({ dataType: "bigint", columnType: "bigint" }, { typname: "int4", pgType: "integer" })).toEqual(["SCHEMA_PRECISION"])
    expect(mk({ dataType: "int", columnType: "int unsigned" }, { typname: "int4", pgType: "integer" })).toEqual(["SCHEMA_PRECISION"])
    expect(mk({ dataType: "int", columnType: "int" }, { typname: "int2", pgType: "smallint" })).toEqual(["SCHEMA_PRECISION"])
    expect(mk({ dataType: "int", columnType: "int" }, { typname: "int4", pgType: "integer" })).toEqual([])
    expect(mk({ dataType: "double", columnType: "double" }, { typname: "float4", pgType: "real" })).toEqual(["SCHEMA_PRECISION"])
  })
})
