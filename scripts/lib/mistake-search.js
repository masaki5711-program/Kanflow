#!/usr/bin/env node
/**
 * mistake-search.js — lexical search/ranking for the mistake-memory store.
 *
 * Pure Node built-ins. No embeddings, no external index: the corpus is small
 * (hundreds of records) and error signatures are highly distinctive machine
 * strings, so char-bigram + alnum-token matching wins on both latency (<15ms
 * at 2,000 records, measured) and Japanese 2-char terms (which FTS5 trigram
 * cannot match). See docs/mistake-memory-spec.md §1.1–§1.3.
 *
 * lex is SYMMETRIC by design:
 *   lex = min(queryNorm, sigCoverage) + signatureBoost + tagBoost   (≤ 1)
 *   - queryNorm:  BM25 normalized by the idf mass of the query terms present
 *     in the corpus ("how much of the query's known vocabulary this doc has").
 *   - sigCoverage: matched idf mass over the record's SIGNATURE idf mass
 *     ("how much of the record's error signature the query reproduces").
 *   Query-side normalization alone degenerates on tiny corpora — one shared
 *   token like "import" scores 1.0. The signature-coverage min() kills that:
 *   a record only surfaces when its recorded error actually appears.
 *   Consequence (documented in the spec): title-only matches do not inject —
 *   the signature is the match key of an ERROR memory.
 *
 * Near-duplicate detection for add()-merge is Dice similarity over
 * title+signature token sets — independent of corpus statistics.
 *
 * Ranking: score = 0.6·lex + 0.25·(weight/10) + 0.15·recency(90d half-life)
 */

'use strict';

const INJECT_THRESHOLD = 0.45; // below this, hooks inject nothing (stay silent)
const HIT_THRESHOLD = 0.75; // recurrence auto-increment on a matched failure
const MERGE_THRESHOLD = 0.9; // add() merges into a near-duplicate instead

const RECENCY_HALF_LIFE_DAYS = 90;
const W_LEX = 0.6;
const W_WEIGHT = 0.25;
const W_RECENCY = 0.15;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const SIG_BOOST = 0.3;
const SIG_OVERLAP_MIN = 0.6;
const TAG_BOOST_EACH = 0.05;
const TAG_BOOST_MAX = 0.15;
const DAY_MS = 86400000;

const ALNUM_RUN = /[a-z0-9_]+/g;
// Hiragana, Katakana (+halfwidth), CJK unified (+ext A) and compat ideographs.
const CJK_RUN = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]+/g;

// Common English filler that a small corpus would misread as "rare": with
// df=1 a lone shared "to"/"all" would otherwise score high and false-inject.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'not', 'all', 'was', 'were', 'are', 'but', 'with',
  'this', 'that', 'from', 'into', 'has', 'have', 'had', 'you', 'can', 'will',
  'when', 'then', 'than', 'its', 'also', 'only', 'over', 'out', 'per', 'via',
]);
const isInformative = t => /[^\x00-\x7f]/.test(t) || (t.length >= 3 && !STOPWORDS.has(t));
// A single short matched term (< 5 chars) is noise, not evidence.
const LONE_SHORT_MATCH_DAMP = 0.3;

/** Mixed tokenizer: ASCII alnum runs verbatim + CJK character bigrams. */
function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(ALNUM_RUN)) out.push(m[0]);
  for (const m of t.matchAll(CJK_RUN)) {
    const run = m[0];
    if (run.length === 1) out.push(run);
    for (let i = 0; i < run.length - 1; i += 1) out.push(run.slice(i, i + 2));
  }
  return out;
}

/** The searchable text of a record — the error side only, never the fix. */
function docText(record) {
  return [
    record.title,
    record.signature,
    record.context,
    Array.isArray(record.tags) ? record.tags.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function termFrequencies(tokens) {
  const tf = new Map();
  for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1);
  return tf;
}

/** Corpus index: per-doc term frequencies + document frequency of every term. */
function buildIndex(records) {
  const docs = records.map(r => termFrequencies(tokenize(docText(r)).filter(isInformative)));
  const df = new Map();
  for (const doc of docs) {
    for (const tok of doc.keys()) df.set(tok, (df.get(tok) || 0) + 1);
  }
  const n = docs.length;
  const idf = tok => Math.log(1 + (n - (df.get(tok) || 0) + 0.5) / ((df.get(tok) || 0) + 0.5));
  return { docs, idf, df };
}

/**
 * lex(0..1) of the query against every record. See the header for the model.
 */
function lexScores(records, queryText) {
  const { docs, idf, df } = buildIndex(records);
  const queryTokens = [...new Set(tokenize(queryText).filter(isInformative))];
  const present = queryTokens.filter(t => df.has(t));
  const docLens = docs.map(tf => {
    let sum = 0;
    for (const c of tf.values()) sum += c;
    return sum;
  });
  const avgLen = docs.length > 0 ? docLens.reduce((a, b) => a + b, 0) / docs.length : 0;

  let queryMass = 0;
  for (const tok of present) queryMass += idf(tok);

  return records.map((record, i) => {
    const doc = docs[i];
    const matched = present.filter(t => doc.has(t));
    if (matched.length === 0 || queryMass === 0) return 0;

    // Query-side: BM25, normalized so full coverage at avg length ≈ 1.
    let raw = 0;
    for (const tok of matched) {
      const tf = doc.get(tok);
      const lenNorm = BM25_K1 * (1 - BM25_B + (BM25_B * docLens[i]) / (avgLen || 1));
      raw += (idf(tok) * (tf * (BM25_K1 + 1))) / (tf + lenNorm);
    }
    const queryNorm = Math.min(1, raw / queryMass);

    // Signature-side: how much of the recorded error signature the query hits.
    const sigTokens = [...new Set(tokenize(record.signature || '').filter(isInformative))];
    const querySet = new Set(queryTokens);
    let sigMass = 0;
    let sigHit = 0;
    for (const tok of sigTokens) {
      const v = idf(tok);
      sigMass += v;
      if (querySet.has(tok)) sigHit += v;
    }
    const sigCoverage = sigMass > 0 ? sigHit / sigMass : 0;

    let lex = Math.min(queryNorm, sigCoverage);
    if (matched.length === 1 && matched[0].length < 5) lex *= LONE_SHORT_MATCH_DAMP;

    // Boosts (post-min): dominant signature overlap and tag mentions.
    const strongSig = sigTokens.filter(t => /^[a-z0-9_]{4,}$/.test(t));
    if (
      strongSig.length > 0 &&
      strongSig.filter(t => querySet.has(t)).length / strongSig.length >= SIG_OVERLAP_MIN
    ) {
      lex += SIG_BOOST;
    }
    const q = String(queryText || '').toLowerCase();
    let tagBoost = 0;
    for (const tag of Array.isArray(record.tags) ? record.tags : []) {
      if (tag && q.includes(String(tag).toLowerCase())) tagBoost += TAG_BOOST_EACH;
    }
    lex += Math.min(tagBoost, TAG_BOOST_MAX);

    return Math.min(1, lex);
  });
}

/** Exponential decay, 1.0 = touched now, 0.5 = one half-life ago. */
function recency(record, nowMs) {
  const stamp = record.last_hit_at || record.updated_at || record.created_at;
  const t = Date.parse(stamp || '');
  if (!Number.isFinite(t)) return 0.5; // undated — neutral
  const days = Math.max(0, (nowMs - t) / DAY_MS);
  return 0.5 ** (days / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Rank all records against a query text.
 * Returns [{ record, lex, score }] sorted by score (desc). Pure function.
 */
function rank(records, queryText, opts = {}) {
  const parsed = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.parse(opts.now || '');
  const effectiveNow = Number.isFinite(parsed) ? parsed : 0;
  const lex = lexScores(records, queryText);
  return records
    .map((record, i) => {
      const weight = Math.min(10, Math.max(0, Number(record.weight) || 0));
      const score =
        W_LEX * lex[i] + W_WEIGHT * (weight / 10) + W_RECENCY * recency(record, effectiveNow);
      return { record, lex: lex[i], score };
    })
    .sort((a, b) => b.score - a.score || b.lex - a.lex);
}

/**
 * Near-duplicate check for add()-merge: Dice similarity over the informative
 * token sets of `title + signature`. Corpus-independent — an exact duplicate
 * is always 1.0 regardless of corpus size (BM25 normalization is not).
 */
function nearDuplicate(fieldsA, recordB) {
  const setOf = x => new Set(tokenize(`${x.title || ''} ${x.signature || ''}`).filter(isInformative));
  const a = setOf(fieldsA);
  const b = setOf(recordB);
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const tok of a) if (b.has(tok)) both += 1;
  return (2 * both) / (a.size + b.size);
}

/** Compact injection block: 3 lines per record, fix truncated. */
function formatMatches(matches, maxFixChars = 220) {
  const clip = (s, n) => {
    const v = String(s || '').replace(/\s+/g, ' ').trim();
    return v.length > n ? `${v.slice(0, n)}…` : v;
  };
  return matches
    .map(
      (m, i) =>
        `${i + 1}. ${clip(m.record.title, 80)} [w${m.record.weight}]\n` +
        `   原因: ${clip(m.record.root_cause, 160)}\n` +
        `   修正: ${clip(m.record.fix, maxFixChars)}`,
    )
    .join('\n');
}

module.exports = {
  INJECT_THRESHOLD,
  HIT_THRESHOLD,
  MERGE_THRESHOLD,
  tokenize,
  docText,
  lexScores,
  rank,
  nearDuplicate,
  formatMatches,
};
