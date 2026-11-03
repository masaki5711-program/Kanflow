'use strict';

/*
 * eval-score.js — deterministic rubric scoring for agent evals.
 *
 * Pure (no I/O, no LLM judge) so it is unit-testable and cheap to run in CI.
 * Less gameable than a bare substring match:
 *   mustFlag        — every entry must be satisfied (the finding was named). An
 *                     entry may be a string (substring) OR an array of strings
 *                     (OR — any one spelling satisfies it), so a correct answer
 *                     phrased "timestamptz" vs "with time zone" is not a flake.
 *   mustNotFlag     — none may appear (guards against false positives / noise)
 *   minSeverity     — a severity at or above the threshold must be stated
 *   expectedVerdict — the overall PASS/BLOCK verdict must appear
 *
 * A future semantic upgrade (LLM-judge) can wrap this without changing callers.
 */

const SEVERITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Enum labels (severity / verdict) are matched as a STANDALONE token so a
// domain word cannot spoof a verdict: "blocking" must not satisfy "BLOCK",
// "high-frequency" must not satisfy "HIGH", "passthrough" must not satisfy
// "PASS". Hyphen is treated as part of a token, so a hyphen-joined compound
// ("HIGH-FREQUENCY") is one token and does not match the bare label "HIGH" —
// while a real label ("severity: HIGH", "(HIGH)", "BLOCK.") still matches.
// Free-text rubric tokens (mustFlag / mustNotFlag) stay substring — there we
// *want* "apiKey" to match inside a sentence.
function hasWord(haystackUpper, wordUpper) {
  return new RegExp(`(?:^|[^A-Z0-9-])${wordUpper}(?:[^A-Z0-9-]|$)`).test(haystackUpper);
}

function score(spec, text) {
  const rubric = (spec && spec.rubric) || {};
  const body = String(text == null ? '' : text);
  const low = body.toLowerCase();
  const up = body.toUpperCase();

  // An entry is satisfied if it is a substring, or — when an array — if ANY of
  // its spellings is a substring (OR-of-synonyms).
  const satisfied = (entry) => Array.isArray(entry)
    ? entry.some((t) => low.includes(String(t).toLowerCase()))
    : low.includes(String(entry).toLowerCase());

  const miss = (rubric.mustFlag || []).filter((entry) => !satisfied(entry));
  const falsePos = (rubric.mustNotFlag || []).filter((t) => low.includes(String(t).toLowerCase()));

  let severityOk = true;
  if (rubric.minSeverity) {
    const threshold = SEVERITY_ORDER.indexOf(String(rubric.minSeverity).toUpperCase());
    severityOk = threshold < 0
      ? true
      : SEVERITY_ORDER.slice(threshold).some((s) => hasWord(up, s));
  }

  const verdictOk = !rubric.expectedVerdict || hasWord(up, String(rubric.expectedVerdict).toUpperCase());

  const pass = miss.length === 0 && falsePos.length === 0 && severityOk && verdictOk;
  return { pass, miss, falsePos, severityOk, verdictOk };
}

function failReason(r) {
  const parts = [];
  if (r.miss.length) parts.push(`missing ${JSON.stringify(r.miss)}`);
  if (r.falsePos.length) parts.push(`false-positive ${JSON.stringify(r.falsePos)}`);
  if (!r.severityOk) parts.push('severity below minSeverity');
  if (!r.verdictOk) parts.push('wrong/absent verdict');
  return parts.join(', ');
}

module.exports = { score, failReason, SEVERITY_ORDER };
