import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import {
  createGlossarySchema,
  listGlossarySchema,
  retranslateGlossarySchema,
} from "@/services/glossary/glossary.schemas"
import { createTerm, listTerms, retranslate } from "@/services/glossary/glossary.service"

/** GET /api/admin/glossary?q=&source=&limit=&offset= */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error
  const parsed = listGlossarySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues, code: "VALIDATION" }, { status: 400 })
  try {
    return jsonResponse(await listTerms(parsed.data))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Glossary LIST" })
  }
}

/** POST /api/admin/glossary — add or overwrite one term (reverse auto-registered). */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error
  try {
    const input = createGlossarySchema.parse(await request.json())
    return jsonResponse(await createTerm(input, auth.session.user.id), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "登録に失敗しました", context: "Glossary CREATE" })
  }
}

/** PUT /api/admin/glossary — re-translate the done rows containing the given (or all) terms. */
export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error
  try {
    const { ids } = retranslateGlossarySchema.parse(await request.json().catch(() => ({})))
    return jsonResponse(await retranslate(ids))
  } catch (error) {
    return toHttpResponse(error, { fallback: "再翻訳の登録に失敗しました", context: "Glossary retranslate" })
  }
}
