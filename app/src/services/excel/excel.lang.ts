import type { Language } from "@/lib/i18n"
import { defaultDb, type Db } from "@/services/_shared/db"
import { EXCEL_LANGS, parseExcelLang } from "./excel.shared"

/**
 * Workbook language: the `?lang=` the page sent (it follows a project-level
 * language override), else the user's saved language, else Japanese.
 */
export async function resolveExcelLang(request: Request, userId: string, db: Db = defaultDb): Promise<Language> {
  const raw = new URL(request.url).searchParams.get("lang")
  if (EXCEL_LANGS.includes(raw as Language)) return raw as Language
  const user = await db.user.findUnique({ where: { id: userId }, select: { language: true } })
  return parseExcelLang(user?.language, "ja")
}
