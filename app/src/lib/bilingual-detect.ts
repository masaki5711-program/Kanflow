/**
 * Detection of text that is ALREADY bilingual (Japanese + Indonesian pairs),
 * used to guard against double annotation when re-running 併記.
 *
 * bilingualizeStream (ollama.ts) always emits adjacent line pairs — one line
 * in Indonesian (no Japanese characters) and one in Japanese — so bilingual
 * text is recognizable by its high ratio of mixed adjacent line pairs.
 * Dependency-free so both server routes and client components can share it.
 */

const JA_CHAR_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/

/** True when the line contains at least one Japanese character. */
export function hasJapanese(line: string): boolean {
  return JA_CHAR_RE.test(line)
}

// Stopword scoring to tell English from Indonesian (both are Latin-script,
// so character-class detection can't separate them). Function words rarely
// overlap between the two languages, so a simple count is reliable enough
// for report sentences.
const EN_WORDS = new Set([
  "the", "is", "are", "was", "were", "be", "been", "has", "have", "had",
  "will", "would", "should", "must", "not", "and", "or", "but", "of", "to",
  "in", "on", "at", "for", "with", "from", "by", "this", "that", "these",
  "it", "its", "as", "an", "a", "there", "no", "all", "than", "which",
  "while", "after", "before", "still", "yet", "remains", "days", "tasks",
  "sprint", "urgent", "overdue", "completed", "pending", "immediately",
])
const ID_WORDS = new Set([
  "yang", "dan", "untuk", "dengan", "tidak", "akan", "sudah", "belum",
  "dari", "pada", "ke", "di", "adalah", "ini", "itu", "harus", "dalam",
  "atau", "serta", "telah", "masih", "perlu", "agar", "karena", "sangat",
  "segera", "tugas", "hari", "tim", "laporan", "penyelesaian", "tertunda",
  "selesai", "baru", "semua", "oleh", "bisa", "dapat", "juga", "belum",
  "tindak", "lanjut", "terhadap", "sebelumnya", "temuan", "anomali",
])

/**
 * True when a non-Japanese line reads as English rather than Indonesian.
 * Used by the report pipeline to avoid pairing "English + Japanese" — the
 * Indonesian side must be actual Indonesian.
 */
export function looksEnglish(line: string): boolean {
  if (hasJapanese(line)) return false
  const tokens = line.toLowerCase().match(/[a-z]+/g) ?? []
  let en = 0
  let id = 0
  for (const tk of tokens) {
    if (EN_WORDS.has(tk)) en++
    if (ID_WORDS.has(tk)) id++
  }
  return en >= 2 && en > id
}

/**
 * A non-Japanese line only counts as a potential Indonesian translation when
 * it looks like prose: not a URL, and either multi-word or a long single
 * word. This keeps "JA sentence + trailing URL / version tag / brand name"
 * from being misread as an already-annotated pair (which would silently
 * disable auto-annotation for that field).
 */
function isTranslationCandidate(line: string): boolean {
  if (/https?:\/\/|:\/\//.test(line)) return false
  if (/\s/.test(line)) return true
  // Single token: version tags ("v2.0.1") and short brand names are
  // metadata, not translations. Long letter-only words may be a one-word
  // Indonesian translation, so keep them.
  return /^[A-Za-z]{10,}$/.test(line)
}

/**
 * Heuristic: split into non-empty lines, drop non-Japanese lines that don't
 * look like translation prose (URLs, versions, single short tokens), then the
 * text is "already bilingual" when
 * - it has both Japanese and non-Japanese lines in rough balance
 *   (minority side >= 30%, since true pairs sit near 50/50), and
 * - at least half of the adjacent line pairs are mixed (JA next to non-JA).
 *
 * Single-language multi-line text (all-JA or all-ID) never matches; a stray
 * technical term line inside Japanese prose fails the balance condition.
 */
export function isBilingualText(text: string | null | undefined): boolean {
  if (!text) return false
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => hasJapanese(l) || isTranslationCandidate(l))
  if (lines.length < 2) return false

  const jaFlags = lines.map(hasJapanese)
  const jaCount = jaFlags.filter(Boolean).length
  if (jaCount === 0 || jaCount === lines.length) return false
  if (Math.min(jaCount, lines.length - jaCount) / lines.length < 0.3) return false

  let mixedPairs = 0
  const totalPairs = lines.length - 1
  for (let i = 0; i < totalPairs; i++) {
    if (jaFlags[i] !== jaFlags[i + 1]) mixedPairs++
  }
  return mixedPairs / totalPairs >= 0.5
}
