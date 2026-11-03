#!/usr/bin/env node
/**
 * mistake-store.js — durable store for the mistake-memory system.
 *
 * Source of truth: .claude/mistakes/records.jsonl (one record per line,
 * committed to the repo for team sharing). MISTAKES.md at the project root is
 * a GENERATED human/agent view — never hand-edited, regenerated via
 * `node scripts/mistakes.js render-md`. Session-scoped failure tracking lives
 * in .claude/state/mistake-pending.jsonl (runtime artifact, gitignored).
 *
 * All writes are immutable-style (build a new array, rewrite the file).
 * Confidential content is rejected at add() time (CLAUDE.md §2 / git §6).
 * See docs/mistake-memory-spec.md.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const search = require('./mistake-search');
const { scanText, hasCritical } = require('./confidential-patterns');

const RECORDS_REL = path.join('.claude', 'mistakes', 'records.jsonl');
const PENDING_REL = path.join('.claude', 'state', 'mistake-pending.jsonl');
const MD_NAME = 'MISTAKES.md';

const WEIGHT_MAX = 10;
const PIN_WEIGHT = 7;
const PIN_RECURRENCE = 3;
const DECAY_AFTER_DAYS = 180;
const PENDING_MAX_LINES = 200;
const PENDING_MAX_AGE_DAYS = 7;
const MD_RECENT_COUNT = 20;
const DAY_MS = 86400000;

function resolveRoot(root) {
  return root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}
const recordsPath = root => path.join(resolveRoot(root), RECORDS_REL);
const pendingPath = root => path.join(resolveRoot(root), PENDING_REL);
const markdownPath = root => path.join(resolveRoot(root), MD_NAME);

function readJsonl(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object') out.push(obj);
    } catch {
      /* skip broken line — graceful degradation */
    }
  }
  return out;
}

function writeJsonl(file, items) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, items.map(x => JSON.stringify(x)).join('\n') + (items.length ? '\n' : ''), 'utf8');
}

// --- records ---------------------------------------------------------------

function loadRecords(root) {
  return readJsonl(recordsPath(root)).filter(r => r.id && r.title);
}

function saveRecords(root, records) {
  writeJsonl(recordsPath(root), records);
}

function validateRecord(rec) {
  const errors = [];
  const str = k => typeof rec[k] === 'string' && rec[k].trim().length > 0;
  if (!str('id') || !/^mk-\d{8}-[0-9a-f]{6}$/.test(rec.id)) errors.push(`id: bad or missing (${rec.id})`);
  for (const k of ['title', 'signature', 'fix']) if (!str(k)) errors.push(`${k}: required`);
  if (!Number.isInteger(rec.severity) || rec.severity < 1 || rec.severity > 5) errors.push('severity: int 1-5');
  if (!Number.isInteger(rec.recurrence) || rec.recurrence < 0) errors.push('recurrence: int >= 0');
  if (!Number.isInteger(rec.weight) || rec.weight < 0 || rec.weight > WEIGHT_MAX) errors.push('weight: int 0-10');
  if (!Array.isArray(rec.tags)) errors.push('tags: array');
  if (!Number.isFinite(Date.parse(rec.created_at || ''))) errors.push('created_at: ISO date required');
  return errors;
}

function recomputeDerived(rec) {
  const weight = Math.min(WEIGHT_MAX, (rec.severity || 1) + (rec.recurrence || 0));
  return {
    ...rec,
    weight,
    pinned: weight >= PIN_WEIGHT || (rec.recurrence || 0) >= PIN_RECURRENCE,
  };
}

function newId(nowIso, seed) {
  const day = String(nowIso).slice(0, 10).replace(/-/g, '');
  const hash = crypto.createHash('sha1').update(`${seed}${nowIso}`).digest('hex').slice(0, 6);
  return `mk-${day}-${hash}`;
}

function createRecord(fields, nowIso) {
  return recomputeDerived({
    id: newId(nowIso, `${fields.title}${fields.signature}`),
    created_at: fields.created_at || nowIso,
    updated_at: nowIso,
    title: String(fields.title || '').trim(),
    signature: String(fields.signature || '').trim(),
    context: String(fields.context || '').trim(),
    root_cause: String(fields.root_cause || '').trim(),
    fix: String(fields.fix || '').trim(),
    tags: Array.isArray(fields.tags) ? fields.tags.map(String) : [],
    severity: Number.isInteger(fields.severity) ? Math.min(5, Math.max(1, fields.severity)) : 3,
    recurrence: 0,
    last_hit_at: null,
    source: fields.source || 'manual',
  });
}

/**
 * Add a record: rejects confidential content, merges into a near-duplicate
 * (lex >= MERGE_THRESHOLD) instead of creating one, regenerates MISTAKES.md.
 */
function addRecord(root, fields, opts = {}) {
  const nowIso = opts.now || new Date().toISOString();
  const text = [fields.title, fields.signature, fields.context, fields.root_cause, fields.fix]
    .filter(Boolean)
    .join('\n');
  const findings = scanText(text, 'mistakes:add');
  if (hasCritical(findings)) return { ok: false, reason: 'confidential', findings };

  const records = loadRecords(root);
  let dup = null;
  for (const r of records) {
    const sim = search.nearDuplicate(fields, r);
    if (sim >= search.MERGE_THRESHOLD && (!dup || sim > dup.sim)) dup = { record: r, sim };
  }

  if (dup) {
    const merged = recomputeDerived({
      ...dup.record,
      fix: String(fields.fix || dup.record.fix).trim(),
      root_cause: String(fields.root_cause || dup.record.root_cause).trim(),
      recurrence: (dup.record.recurrence || 0) + 1,
      last_hit_at: nowIso,
      updated_at: nowIso,
    });
    saveRecords(root, records.map(r => (r.id === merged.id ? merged : r)));
    writeMarkdown(root, nowIso);
    return { ok: true, action: 'merged', record: merged };
  }

  const record = createRecord(fields, nowIso);
  const problems = validateRecord(record);
  if (problems.length) return { ok: false, reason: 'invalid', problems };
  saveRecords(root, [...records, record]);
  writeMarkdown(root, nowIso);
  return { ok: true, action: 'created', record };
}

/** A matched failure re-occurred: bump recurrence/weight, refresh pin state. */
function registerHit(root, id, nowIso) {
  const records = loadRecords(root);
  let hit = null;
  const next = records.map(r => {
    if (r.id !== id) return r;
    hit = recomputeDerived({
      ...r,
      recurrence: (r.recurrence || 0) + 1,
      last_hit_at: nowIso,
      updated_at: nowIso,
    });
    return hit;
  });
  if (!hit) return null;
  saveRecords(root, next);
  writeMarkdown(root, nowIso);
  return hit;
}

/**
 * Collapse records sharing an id into one. records.jsonl merges with the
 * `union` driver (.gitattributes), so two branches that each bumped the same
 * record leave both versions in the file.
 *
 * Order-independent: the winner is the higher recurrence, then the later
 * updated_at, then the greater serialized form — never "whichever line came
 * first". The winner's fields (incl. its weight / pinned, which may carry a
 * decay) are kept as they are; tags are united and the hit / update
 * timestamps take the later side. Recurrence is the MAX of the two sides, not
 * their sum: without the merge base the hits cannot be told apart, and
 * undercounting by one is the safe direction for an auto-pin threshold.
 * @returns {{records: object[], removed: number}}
 */
function dedupeRecords(records) {
  const time = v => {
    const ms = Date.parse(v || '');
    return Number.isFinite(ms) ? ms : -Infinity;
  };
  const later = (a, b) => (time(a) >= time(b) ? a : b);
  const beats = (a, b) => {
    const rec = (a.recurrence || 0) - (b.recurrence || 0);
    if (rec !== 0) return rec > 0;
    if (time(a.updated_at) !== time(b.updated_at)) return time(a.updated_at) > time(b.updated_at);
    return JSON.stringify(a) > JSON.stringify(b);
  };
  const byId = new Map();
  for (const r of records) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      continue;
    }
    const [winner, loser] = beats(r, prev) ? [r, prev] : [prev, r];
    const tags = [...new Set([...(winner.tags || []), ...(loser.tags || [])])].sort();
    byId.set(r.id, {
      ...winner,
      ...(Array.isArray(winner.tags) || Array.isArray(loser.tags) ? { tags } : {}),
      last_hit_at: later(winner.last_hit_at, loser.last_hit_at) || null,
      updated_at: later(winner.updated_at, loser.updated_at),
    });
  }
  const deduped = [...byId.values()];
  return { records: deduped, removed: records.length - deduped.length };
}

/** Ids that occur more than once in records.jsonl (gate check). */
function duplicateIds(root) {
  const counts = new Map();
  for (const r of loadRecords(root)) counts.set(r.id, (counts.get(r.id) || 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([id]) => id);
}

/** Rewrite records.jsonl without duplicate ids; returns how many lines went. */
function dedupeStore(root, nowIso) {
  const { records, removed } = dedupeRecords(loadRecords(root));
  if (removed > 0) {
    saveRecords(root, records);
    writeMarkdown(root, nowIso);
  }
  return removed;
}

/** Weight decay for records not hit in DECAY_AFTER_DAYS (never below severity). */
function pruneDecay(root, nowIso) {
  const nowMs = Date.parse(nowIso);
  const records = loadRecords(root);
  let decayed = 0;
  const next = records.map(r => {
    const lastMs = Date.parse(r.last_hit_at || r.updated_at || r.created_at || '');
    if (!Number.isFinite(lastMs) || nowMs - lastMs < DECAY_AFTER_DAYS * DAY_MS) return r;
    const weight = Math.max(r.severity || 1, (r.weight || 0) - 1);
    if (weight === r.weight) return r;
    decayed += 1;
    return { ...r, weight, pinned: weight >= PIN_WEIGHT || (r.recurrence || 0) >= PIN_RECURRENCE };
  });
  if (decayed > 0) {
    saveRecords(root, next);
    writeMarkdown(root, nowIso);
  }
  return decayed;
}

// --- MISTAKES.md (generated view) ------------------------------------------

function renderMarkdown(records, nowIso) {
  const clip = (s, n) => {
    const v = String(s || '').replace(/\s+/g, ' ').trim();
    return v.length > n ? `${v.slice(0, n)}…` : v;
  };
  const entry = r =>
    [
      `### ${clip(r.title, 100)}`,
      `- 署名: \`${clip(r.signature, 160)}\``,
      `- 原因: ${clip(r.root_cause, 200)}`,
      `- 修正: ${clip(r.fix, 300)}`,
      `- weight ${r.weight} / 再発 ${r.recurrence} / ${String(r.updated_at || r.created_at).slice(0, 10)} / ${r.id}`,
    ].join('\n');

  const pinned = records.filter(r => r.pinned).sort((a, b) => b.weight - a.weight);
  const recent = [...records]
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .slice(0, MD_RECENT_COUNT);

  const lines = [
    '<!-- GENERATED FILE — do not edit by hand.',
    '     Source: .claude/mistakes/records.jsonl',
    '     Regenerate: node scripts/mistakes.js render-md',
    '     Add a record: node scripts/mistakes.js add --json \'{"title":...}\' -->',
    '',
    '# MISTAKES — 過去の失敗と実証済みの修正',
    '',
    `記録 ${records.length} 件。検索: \`node scripts/mistakes.js search "<エラー文>"\``,
    '',
    '## 📌 Pinned（再発性・致命度の高いミス — 常時注意）',
    '',
    pinned.length ? pinned.map(entry).join('\n\n') : '_なし_',
    '',
    '## 最近の記録',
    '',
    recent.length ? recent.map(entry).join('\n\n') : '_なし_',
    '',
  ];
  return lines.join('\n');
}

function writeMarkdown(root, nowIso) {
  const content = renderMarkdown(loadRecords(root), nowIso);
  const file = markdownPath(root);
  try {
    if (fs.readFileSync(file, 'utf8') === content) return false;
  } catch {
    /* absent — write it */
  }
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

/** True when MISTAKES.md matches the current records (gate check). */
function checkMarkdown(root) {
  try {
    return fs.readFileSync(markdownPath(root), 'utf8') === renderMarkdown(loadRecords(root));
  } catch {
    return loadRecords(root).length === 0; // no records and no file is fine
  }
}

// --- legacy .claude_errors.md migration -------------------------------------

const LEGACY_LABELS = {
  signature: /(?:症状|Error log signature)/,
  root_cause: /(?:原因|Root cause)/,
  fix: /(?:解決|Successful solution)/,
  prevention: /(?:予防)/,
  date: /(?:日付)/,
};

function parseLegacy(mdText) {
  const blocks = String(mdText || '').split(/^## +/m).slice(1);
  const fields = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const title = lines[0].replace(/^\[[^\]]*\]\s*/, '').trim();
    const grab = re => {
      const m = block.match(new RegExp(`\\*\\*${re.source}\\*\\*[:：]?\\s*([^\\n]+(?:\\n(?![-*#]|\\s*\\*\\*)[^\\n]+)*)`));
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    const fix = [grab(LEGACY_LABELS.fix), grab(LEGACY_LABELS.prevention) && `予防: ${grab(LEGACY_LABELS.prevention)}`]
      .filter(Boolean)
      .join(' / ');
    const dateRaw = grab(LEGACY_LABELS.date) || (lines[0].match(/\[(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    const dateMatch = dateRaw.match(/\d{4}-\d{2}-\d{2}/);
    if (!title) continue;
    fields.push({
      title,
      signature: grab(LEGACY_LABELS.signature) || title,
      context: '',
      root_cause: grab(LEGACY_LABELS.root_cause),
      fix: fix || block.trim().slice(0, 500),
      tags: [],
      severity: 3,
      created_at: dateMatch ? `${dateMatch[0]}T00:00:00.000Z` : undefined,
      source: 'migrated',
    });
  }
  return fields;
}

// --- session-scoped pending failures ----------------------------------------

/**
 * The session a pending failure belongs to. Claude Code passes `session_id`
 * in every hook event; there is no CLAUDE_SESSION_ID environment variable in
 * normal runs (tests set it), so without the event every session in one
 * directory shared the cwd-hash fallback.
 * @param {{session_id?: string}} [input] the hook event
 */
function sessionKey(input) {
  const fromEvent = input && typeof input.session_id === 'string' ? input.session_id.trim() : '';
  return (
    fromEvent ||
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12)
  );
}

const normCmd = cmd => String(cmd || '').replace(/\s+/g, ' ').trim().slice(0, 200);

function readPending(root) {
  return readJsonl(pendingPath(root));
}

function writePending(root, entries, nowIso) {
  const cutoff = Date.parse(nowIso) - PENDING_MAX_AGE_DAYS * DAY_MS;
  const kept = entries
    .filter(e => Number.isFinite(Date.parse(e.ts || '')) && Date.parse(e.ts) >= cutoff)
    .slice(-PENDING_MAX_LINES);
  writeJsonl(pendingPath(root), kept);
}

function recordFailure(root, cmd, snippet, nowIso, session = sessionKey()) {
  const entries = readPending(root);
  const key = normCmd(cmd);
  const existing = entries.find(e => e.session === session && e.cmd === key && !e.resolved);
  const next = existing
    ? entries.map(e =>
        e === existing ? { ...e, fails: (e.fails || 0) + 1, sig: snippet || e.sig, ts: nowIso } : e,
      )
    : [
        ...entries,
        { session, cmd: key, sig: snippet, fails: 1, resolved: false, prompted: false, ts: nowIso },
      ];
  writePending(root, next, nowIso);
}

function recordSuccess(root, cmd, nowIso, session = sessionKey()) {
  const key = normCmd(cmd);
  const entries = readPending(root);
  if (!entries.some(e => e.session === session && e.cmd === key && !e.resolved)) return;
  writePending(
    root,
    entries.map(e =>
      e.session === session && e.cmd === key && !e.resolved
        ? { ...e, resolved: true, resolved_at: nowIso, ts: nowIso }
        : e,
    ),
    nowIso,
  );
}

/** Resolved-after-≥2-failures entries of THIS session with no matching record yet. */
function captureCandidates(root, nowIso, session = sessionKey()) {
  const records = loadRecords(root);
  return readPending(root).filter(e => {
    if (e.session !== session || !e.resolved || e.prompted || (e.fails || 0) < 2) return false;
    const top = search.rank(records, `${e.cmd} ${e.sig || ''}`, { now: nowIso })[0];
    return !top || top.lex < search.HIT_THRESHOLD;
  });
}

function markPrompted(root, candidates, nowIso) {
  const keys = new Set(candidates.map(c => `${c.session} ${c.cmd}`));
  writePending(
    root,
    readPending(root).map(e => (keys.has(`${e.session} ${e.cmd}`) ? { ...e, prompted: true } : e)),
    nowIso,
  );
}

module.exports = {
  RECORDS_REL,
  PENDING_REL,
  MD_NAME,
  resolveRoot,
  recordsPath,
  pendingPath,
  markdownPath,
  loadRecords,
  saveRecords,
  validateRecord,
  recomputeDerived,
  createRecord,
  addRecord,
  registerHit,
  dedupeRecords,
  duplicateIds,
  dedupeStore,
  pruneDecay,
  renderMarkdown,
  writeMarkdown,
  checkMarkdown,
  parseLegacy,
  sessionKey,
  readPending,
  recordFailure,
  recordSuccess,
  captureCandidates,
  markPrompted,
};
