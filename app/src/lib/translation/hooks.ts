/**
 * Convenience surface for API routes:
 *
 *   const data = await cleanGlossaryInput(schema.parse(body), session.user.id)
 *   const item = await prisma.x.create({ data })
 *   await enqueueTranslations("entity", item.id, item)
 *   return NextResponse.json(await attachI18nOne("entity", item))
 *
 * `cleanGlossaryInput` strips `用語<<訳語>>` markup and registers the pairs;
 * `enqueueTranslations` never throws and only waits for one upsert.
 */
import { applyGlossaryMarkup } from "./glossary-service"

export { enqueueTranslations, deleteTranslationsFor, attachI18n, attachI18nOne, getI18nFor } from "./service"

export async function cleanGlossaryInput<T extends Record<string, unknown>>(data: T, actorId: string | null): Promise<T> {
  const { fields } = await applyGlossaryMarkup(data, actorId)
  return fields
}
