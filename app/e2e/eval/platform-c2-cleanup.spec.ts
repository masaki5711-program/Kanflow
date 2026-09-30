/** Platform eval (cycle 2): deactivate the throwaway plat-ui admin and drop its pilot membership. */
import { test } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, DATA, PILOT } from "./platform-helpers"

test("cleanup throwaway users", async () => {
  const admin = await apiFor("admin")
  const members = await (await admin.get(`/api/projects/${PILOT}/members`)).json()
  const list = (Array.isArray(members) ? members : members.members ?? members.items ?? []) as Array<{ id: string; userId?: string; user?: { id: string; email?: string } }>
  for (const file of ["platform-ui-user.txt", "c2-login-user.txt"]) {
    if (!fs.existsSync(`${DATA}/${file}`)) continue
    const id = fs.readFileSync(`${DATA}/${file}`, "utf8").trim().split(/\s+/)[1]
    const m = list.find((x) => x.userId === id || x.user?.id === id)
    const rm = m ? (await admin.delete(`/api/projects/${PILOT}/members/${m.id}`)).status() : "none"
    const de = (await admin.patch(`/api/users/${id}`, { data: { isActive: false } })).status()
    console.log(`${file}: member removed ${rm}, deactivated ${de}`)
  }
})
