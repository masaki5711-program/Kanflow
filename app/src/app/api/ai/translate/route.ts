import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { accessVia, can, loadProjectActor } from "@/lib/authz"
import { resolveEntityScope } from "@/services/_shared/entity-scope"
import { aiLog, aiLogTrunc } from "@/lib/ai-monitor"
import { oppositeLocale } from "@/lib/translation/detect-locale"
import { bumpGlossaryUsage, findGlossaryForText } from "@/lib/translation/glossary-service"
import { translateText } from "@/lib/translation/translator"
import { isTranslatableEntity, type TranslatableEntity, type TranslationLocale } from "@/lib/translation/types"
import { OllamaAbortedError, OllamaError } from "@/lib/ollama/errors"

/**
 * "Translate now" — high priority (preempts the background worker).
 *
 * Two shapes:
 *   { text, targetLocale, sourceLocale? }         → ad-hoc translation, nothing stored
 *   { entityType, entityId, field }                → translate that field's pending row
 *                                                   and store the result (done)
 */
const adHocSchema = z.object({
  text: z.string().min(1).max(20000),
  targetLocale: z.enum(["ja", "id"]),
  sourceLocale: z.enum(["ja", "id"]).optional(),
})

const rowSchema = z.object({
  entityType: z.string().min(1).max(64),
  entityId: z.string().min(1).max(191),
  field: z.string().min(1).max(64),
})

const TIMEOUT_MS = 120_000

export async function POST(request: Request) {
  const auth = await requireAuth()
  if ("error" in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_request", code: "VALIDATION" }, { status: 400 })
  }

  // Client disconnect or deadline aborts the Ollama call.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])

  const row = rowSchema.safeParse(body)
  if (row.success) return translateRow(row.data, auth.session.user, signal)

  const adHoc = adHocSchema.safeParse(body)
  if (!adHoc.success) return NextResponse.json({ error: adHoc.error.issues, code: "VALIDATION" }, { status: 400 })

  const source = adHoc.data.sourceLocale
  const target = adHoc.data.targetLocale
  try {
    const terms = source ? await findGlossaryForText(adHoc.data.text, source, target) : []
    aiLog("TRANSLATE", `now ${source ?? "?"}→${target} ${adHoc.data.text.length} chars "${aiLogTrunc(adHoc.data.text, 60)}"`)
    const r = await translateText(
      { text: adHoc.data.text, sourceLocale: source, targetLocale: target, glossary: terms },
      { signal }
    )
    return NextResponse.json(toResponse(r))
  } catch (err) {
    return ollamaError(err)
  }
}

interface Caller {
  id: string
  role?: string | null
}

/**
 * The caller may only translate (and read back) a row of an entity it can
 * view: a project entity needs project access, a personal fixed task needs
 * ownership. Anything else answers 404 so existence is not leaked.
 */
async function canAccessEntity(caller: Caller, entityType: TranslatableEntity, entityId: string): Promise<boolean> {
  const scope = await resolveEntityScope(prisma, entityType, entityId)
  if (!scope) return false
  if (scope.kind === "user") return scope.userId === caller.id
  const actor = await loadProjectActor(caller.id, caller.role ?? "member", scope.projectId)
  return accessVia(actor) !== null && can(actor, "project.view")
}

async function translateRow(input: z.infer<typeof rowSchema>, caller: Caller, signal: AbortSignal) {
  if (!isTranslatableEntity(input.entityType)) {
    return NextResponse.json({ error: "unknown entity", code: "VALIDATION" }, { status: 400 })
  }
  if (!(await canAccessEntity(caller, input.entityType, input.entityId))) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  }
  const key = { entityType: input.entityType, entityId: input.entityId, field: input.field }
  const row = await prisma.fieldTranslation.findUnique({ where: { entityType_entityId_field: key } })
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })

  const source = row.sourceLocale as TranslationLocale
  const target = oppositeLocale(source)
  const text = source === "ja" ? row.textJa : row.textId
  if (!text) return NextResponse.json({ error: "source text missing", code: "CONFLICT" }, { status: 409 })

  try {
    const terms = await findGlossaryForText(text, source, target)
    aiLog("TRANSLATE", `now ${row.entityType}/${row.field} ${source}→${target} ${text.length} chars`)
    const r = await translateText(
      { text, sourceLocale: source, targetLocale: target, glossary: terms.map(({ term, translation }) => ({ term, translation })) },
      { signal }
    )
    if (!r.translated.trim()) return NextResponse.json({ error: "empty translation", code: "TRANSLATION_FAILED" }, { status: 502 })
    await prisma.fieldTranslation.updateMany({
      where: { ...key, sourceHash: row.sourceHash },
      data: {
        status: "done",
        attempts: row.attempts,
        lastError: null,
        startedAt: null,
        translatedAt: new Date(),
        model: r.modelUsed,
        ...(target === "ja" ? { textJa: r.translated } : { textId: r.translated }),
      },
    })
    if (terms.length > 0) void bumpGlossaryUsage(terms.map((t) => t.id)).catch(() => undefined)
    return NextResponse.json({
      ...toResponse(r),
      i18n: {
        [row.field]: {
          ja: target === "ja" ? r.translated : row.textJa,
          id: target === "id" ? r.translated : row.textId,
          source,
          status: "done",
        },
      },
    })
  } catch (err) {
    return ollamaError(err)
  }
}

function toResponse(r: Awaited<ReturnType<typeof translateText>>) {
  return {
    translated: r.translated,
    source_locale: r.sourceLocale,
    target_locale: r.targetLocale,
    model_used: r.modelUsed,
    fallback_used: false,
    glossary_applied: r.glossaryApplied,
    glossary_misses: r.glossaryMisses,
  }
}

/** 499 aborted / 408 timeout / 503 unreachable / 502 upstream or other failure. */
function ollamaError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (!(err instanceof OllamaAbortedError)) aiLog("CHAT_ERROR", `translate-now: ${message}`)
  const status = err instanceof OllamaError ? err.httpStatus : 502
  const code = err instanceof OllamaError ? err.code : "translation_failed"
  return NextResponse.json({ error: "translation_failed", code, detail: message }, { status })
}
