import { describe, expect, it } from "vitest"
import {
  UNCATEGORIZED,
  groupByVersion,
  pbiText,
  pickField,
  releaseItemText,
  toEditForm,
  type ReleaseItem,
} from "../release-types"

const base: ReleaseItem = {
  id: "r",
  pbItemId: null,
  iceboxId: null,
  initiative: null,
  epic: null,
  userStory: null,
  assignedPo: null,
  planVersion: null,
  releaseVersion: null,
  releaseDate: null,
  releaseNote: null,
  manualLink: null,
  poNote: null,
  status: "staged",
  pbItem: null,
}
const make = (o: Partial<ReleaseItem>): ReleaseItem => ({ ...base, ...o })
const pb = { id: "p", displayId: 1, initiative: null, epic: null, userStory: null, workloadScore: 1, status: "done" }

describe("release-types", () => {
  it("groups by plan version preserving order, null -> uncategorized", () => {
    const groups = groupByVersion([
      make({ id: "a", planVersion: "v2" }),
      make({ id: "b" }),
      make({ id: "c", planVersion: "v2" }),
      make({ id: "d", planVersion: "v1" }),
    ])
    expect(groups.map(([k, v]) => [k, v.map((i) => i.id)])).toEqual([
      ["v2", ["a", "c"]],
      [UNCATEGORIZED, ["b"]],
      ["v1", ["d"]],
    ])
  })

  it("extracts the editable subset", () => {
    const form = toEditForm(make({ id: "x", planVersion: "v1", status: "ready", poNote: "n", pbItemId: "p" }))
    expect(form).toEqual({
      initiative: null,
      epic: null,
      planVersion: "v1",
      releaseVersion: null,
      releaseDate: null,
      releaseNote: null,
      manualLink: null,
      poNote: "n",
      assignedPo: null,
      status: "ready",
    })
    expect(form).not.toHaveProperty("id")
  })

  it("pickField uses translations when available and tolerates null rows", () => {
    expect(pickField(null, "epic", "orig", "ja")).toBe("orig")
    expect(pickField(null, "epic", null, "ja")).toBe("")
    const row = { i18n: { epic: { source: "ja", ja: "エピック", id: "Epik", status: "done" } } } as never
    expect(pickField(row, "epic", "エピック", "id")).toBe("Epik")
  })

  it("pbiText prefers userStory, then epic, then initiative", () => {
    expect(pbiText({ ...pb, userStory: "S", epic: "E", initiative: "I" }, "ja")).toBe("S")
    expect(pbiText({ ...pb, epic: "E", initiative: "I" }, "ja")).toBe("E")
    expect(pbiText({ ...pb, initiative: "I" }, "ja")).toBe("I")
    expect(pbiText(pb, "ja")).toBe("")
  })

  it("releaseItemText handles linked and unlinked items", () => {
    expect(releaseItemText(make({ pbItem: { ...pb, userStory: "PS" }, epic: "E" }), "ja", "fb")).toBe("PS")
    expect(releaseItemText(make({ pbItem: pb, epic: "E" }), "ja", "fb")).toBe("E")
    expect(releaseItemText(make({ pbItem: pb, initiative: "I" }), "ja", "fb")).toBe("I")
    expect(releaseItemText(make({ pbItem: pb }), "ja", "fb")).toBe("")
    expect(releaseItemText(make({ userStory: "U", epic: "E" }), "ja", "fb")).toBe("U")
    expect(releaseItemText(make({ epic: "E" }), "ja", "fb")).toBe("E")
    expect(releaseItemText(make({ initiative: "I" }), "ja", "fb")).toBe("I")
    expect(releaseItemText(make({}), "ja", "fb")).toBe("fb")
  })
})
