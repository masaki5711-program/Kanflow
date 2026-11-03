#!/usr/bin/env node
'use strict';

/*
 * run-evals.js — agent eval runner (the measure -> improve loop).
 *
 *  Default (CI gate, no LLM): validate every evals/specs/*.json is well-formed
 *  and names a real agent. A malformed or dangling eval fails CI.
 *
 *  ECC_EVAL_LIVE=1: run each fixture through its agent against Claude and score
 *  the output against the rubric. Evaluation is UNIFIED ON CLAUDE CODE — there is
 *  no local-LLM (Ollama) eval path. Production agents run on Claude, so Claude is
 *  the only faithful regression target.
 *    ECC_EVAL_PROVIDER = claude-cli | anthropic   (default: claude-cli)
 *    ECC_EVAL_MODEL    = model id                 (required for anthropic; optional for claude-cli)
 *    ANTHROPIC_API_KEY = ...                       (anthropic, for CI without interactive auth)
 *    ECC_EVAL_DRYRUN=1 = assemble prompts but do not call the endpoint
 *    ECC_EVAL_SAMPLES  = run each spec N times, pass on majority (default 1)
 *    ECC_EVAL_PASS_RATIO = required pass fraction across samples (default 0.5)
 *    ECC_EVAL_ONLY     = comma-separated spec-id or agent-name filter for a
 *                        targeted live run (e.g. model-tier demotion checks)
 *                        — cheaper than scoring all specs every time
 *
 *  claude-cli (default): drives the locally-installed `claude` CLI in headless
 *  `-p` mode, reusing the operator's existing Claude Code subscription auth (no
 *  API key). The most faithful target. anthropic is the key-based fallback for CI
 *  where interactive auth is unavailable. Synthetic eval fixtures carry no
 *  shop-floor data, so this is not a data-egress concern (iotpf-self-improvement §5).
 *
 *  Data sovereignty (CLAUDE.md §2): a spec marked "localOnly": true is NEVER sent
 *  to Claude — it is SKIPPED from live scoring (kept synthetic, not live-scored).
 *  Note: this is the EVAL harness only; the product's Flow B deep-dive LLM stays
 *  local (Ollama) per CLAUDE.md §1.4/§2 — that rule is unchanged.
 *
 * Node built-ins only (global fetch, Node 18+). Exit 0 = pass, 1 = problems.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SPEC_DIR = path.join(ROOT, 'evals', 'specs');
const AGENTS = path.join(ROOT, '.claude', 'agents');

function agentBody(name) {
  const p = path.join(AGENTS, name + '.md');
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, 'utf8');
  if (txt.startsWith('---')) {
    const end = txt.indexOf('\n---', 3);
    if (end >= 0) return txt.slice(txt.indexOf('\n', end + 1) + 1).trim();
  }
  return txt.trim();
}

// --- load + validate specs (always) ---------------------------------------
if (!fs.existsSync(SPEC_DIR)) {
  console.log('[run-evals] no evals/specs — skipping');
  process.exit(0);
}
const errors = [];
const ids = new Set();
const specs = [];
for (const f of fs.readdirSync(SPEC_DIR).filter((x) => x.endsWith('.json'))) {
  const rel = path.join('evals', 'specs', f);
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), 'utf8'));
  } catch (e) {
    errors.push(`${rel}: invalid JSON (${e.message})`);
    continue;
  }
  for (const k of ['id', 'agent', 'summary', 'fixture', 'rubric']) if (!spec[k]) errors.push(`${rel}: missing '${k}'`);
  if (spec.id) {
    if (ids.has(spec.id)) errors.push(`${rel}: duplicate id '${spec.id}'`);
    ids.add(spec.id);
  }
  if (spec.agent && !agentBody(spec.agent)) errors.push(`${rel}: agent '${spec.agent}' has no .claude/agents/${spec.agent}.md`);
  if (spec.fixture && !spec.fixture.code) errors.push(`${rel}: fixture.code is empty`);
  if (spec.rubric && Object.keys(spec.rubric).length === 0) errors.push(`${rel}: rubric is empty`);
  specs.push(spec);
}
if (errors.length) {
  console.error(`\n[run-evals] FAILED — ${errors.length} spec problem(s):`);
  for (const e of errors) console.error('  ERROR ' + e);
  process.exit(1);
}
console.log(`[run-evals] specs OK — ${specs.length} valid eval case(s) across ${new Set(specs.map((s) => s.agent)).size} agent(s)`);

if (process.env.ECC_EVAL_LIVE !== '1') {
  console.log('[run-evals] live scoring disabled (set ECC_EVAL_LIVE=1 with an LLM endpoint to score outputs).');
  process.exit(0);
}

// --- live mode -------------------------------------------------------------
// Evaluation is unified on Claude Code: claude-cli by default, anthropic as the
// key-based CI fallback. No local-LLM (Ollama) eval path.
const provider = process.env.ECC_EVAL_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'claude-cli');
const model = process.env.ECC_EVAL_MODEL;
const dryRun = process.env.ECC_EVAL_DRYRUN === '1';
// Multi-sample: a non-deterministic model phrases a correct finding differently
// run-to-run, so a single sample intermittently misses a literal rubric token.
// Run each spec ECC_EVAL_SAMPLES times and pass on a majority (ECC_EVAL_PASS_RATIO).
// Clamp to sane ranges: 1..9 samples, pass ratio in (0, 1]. Out-of-range env
// values (typos, negative numbers) silently degrading to nonsense is worse
// than refusing them, but clamping keeps the gate runnable either way.
const MAX_SAMPLES = 9;
const samples = Math.min(MAX_SAMPLES, Math.max(1, parseInt(process.env.ECC_EVAL_SAMPLES || '1', 10) || 1));
const passRatio = Math.min(1, Math.max(0.1, Number(process.env.ECC_EVAL_PASS_RATIO || '0.5') || 0.5));

if (provider !== 'claude-cli' && provider !== 'anthropic') {
  console.error(`[run-evals] unsupported ECC_EVAL_PROVIDER '${provider}' — evaluation is unified on Claude Code (use claude-cli or anthropic). The local-LLM eval path was removed.`);
  process.exit(1);
}
if (!model && !dryRun && provider === 'anthropic') {
  console.error('[run-evals] anthropic provider needs ECC_EVAL_MODEL (a Claude model id, e.g. claude-sonnet-4-6).');
  process.exit(1);
}
if (provider === 'claude-cli' && !dryRun) {
  // Fail fast instead of burning a 3-minute spawn timeout per spec when the
  // CLI is missing or this is an unattended CI runner with no interactive auth.
  if (process.env.CI && !process.env.ECC_EVAL_PROVIDER) {
    console.error('[run-evals] live claude-cli eval in CI needs a pre-authenticated `claude` CLI, which unattended runners do not have. Set ECC_EVAL_PROVIDER=anthropic with ANTHROPIC_API_KEY and ECC_EVAL_MODEL for CI live scoring.');
    process.exit(1);
  }
  const isWin = process.platform === 'win32';
  const probe = spawnSync(isWin ? 'claude.cmd' : 'claude', ['--version'],
    { encoding: 'utf8', shell: isWin, timeout: 15000, windowsHide: true });
  if (probe.error || probe.status !== 0) {
    console.error('[run-evals] claude-cli provider selected but the `claude` CLI is not runnable here. Install/auth Claude Code, or use ECC_EVAL_PROVIDER=anthropic with ANTHROPIC_API_KEY and ECC_EVAL_MODEL.');
    process.exit(1);
  }
}

function buildPrompt(spec) {
  const system = agentBody(spec.agent);
  const lang = (spec.fixture && spec.fixture.lang) || 'text';
  const user = `Review the following ${lang} for issues. State each finding, its severity (LOW/MEDIUM/HIGH/CRITICAL), and a single overall verdict of PASS or BLOCK.\n\n\`\`\`${lang}\n${spec.fixture.code}\n\`\`\``;
  return { system, user };
}

async function callAnthropic(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return (j.content || []).map((c) => c.text || '').join('\n');
}

// Headless `claude -p`, reusing subscription auth. The agent body becomes the
// full system prompt (via a temp file, to keep large prompts out of argv — and
// out of the Windows shell that .cmd spawning requires). User prompt via stdin.
function callClaudeCli(system, user) {
  const isWin = process.platform === 'win32';
  const tmp = path.join(os.tmpdir(), `ecc-eval-sys-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(tmp, system, 'utf8');
  try {
    const bin = isWin ? 'claude.cmd' : 'claude';
    const args = ['-p', '--system-prompt-file', isWin ? `"${tmp}"` : tmp, '--output-format', 'text'];
    if (model) args.push('--model', model);
    const res = spawnSync(bin, args, {
      input: user,
      encoding: 'utf8',
      shell: isWin, // Windows refuses to spawn .cmd without a shell
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    if (res.error) throw new Error('claude-cli: ' + res.error.message);
    if (res.status !== 0) throw new Error(`claude-cli exit ${res.status}: ${(res.stderr || '').slice(0, 300)}`);
    return res.stdout || '';
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
  }
}

// Deterministic rubric scoring lives in a pure, unit-tested lib (CLAUDE.md §6).
const { score, failReason } = require('./lib/eval-score');

// Targeted live runs (ECC_EVAL_ONLY=id-or-agent[,..]) score a subset — used for
// evidence-based model-tier changes without paying for the full spec sweep.
// Filter applies to live mode only; the always-on validation above stays whole.
const only = (process.env.ECC_EVAL_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const liveSpecs = only.length
  ? specs.filter((s) => only.includes(s.id) || only.includes(s.agent))
  : specs;
if (only.length) {
  console.log(`[run-evals] ECC_EVAL_ONLY filter active — scoring ${liveSpecs.length}/${specs.length} spec(s)`);
  if (liveSpecs.length === 0) {
    console.error(`[run-evals] ECC_EVAL_ONLY matched no spec id/agent: ${only.join(', ')}`);
    process.exit(1);
  }
}

(async () => {
  let failures = 0;
  let skipped = 0;
  for (const spec of liveSpecs) {
    if (spec.localOnly) {
      // Eval is unified on Claude Code with no local-LLM path, so a localOnly
      // (confidential) spec is never sent anywhere — skipped from live scoring,
      // not failed. Data sovereignty (CLAUDE.md §2) preserved by construction.
      console.log(`  [SKIP] ${spec.id}: localOnly spec is not live-scored under Claude-only eval (data sovereignty, CLAUDE.md §2).`);
      skipped++;
      continue;
    }
    const { system, user } = buildPrompt(spec);
    if (dryRun) {
      // Dry-run is the CI gate for prompt assembly: an empty system prompt
      // (missing/empty agent body) or empty user prompt is a real failure.
      if (!system || !system.trim() || !user.trim()) {
        console.error(`  [DRYRUN-FAIL] ${spec.id}: assembled an empty ${!system || !system.trim() ? 'system' : 'user'} prompt`);
        failures++;
      } else {
        console.log(`  [DRYRUN] ${spec.id}: agent=${spec.agent} systemPromptChars=${system.length} userChars=${user.length}`);
      }
      continue;
    }
    try {
      let passCount = 0;
      let lastReason = '';
      for (let s = 0; s < samples; s += 1) {
        const text = provider === 'anthropic' ? await callAnthropic(system, user)
          : callClaudeCli(system, user);
        const r = score(spec, text);
        if (r.pass) passCount += 1;
        else lastReason = failReason(r);
      }
      const required = Math.max(1, Math.ceil(samples * passRatio));
      const pass = passCount >= required;
      const tag = samples > 1 ? ` (${passCount}/${samples}, need ${required})` : '';
      console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${spec.id}${tag}${pass ? '' : ` — ${lastReason}`}`);
      if (!pass) failures++;
    } catch (e) {
      console.error(`  [ERROR] ${spec.id}: ${e.message}`);
      failures++;
    }
  }
  if (dryRun) {
    if (failures) {
      console.error(`\n[run-evals] dry-run FAILED — ${failures} prompt assembly problem(s).`);
      process.exit(1);
    }
    console.log('[run-evals] dry-run complete (no endpoint calls).');
    process.exit(0);
  }
  const tgt = `${provider}${model ? '/' + model : ''}`;
  if (failures) {
    console.error(`\n[run-evals] ${failures} eval(s) failed against ${tgt}${skipped ? ` (${skipped} localOnly skipped)` : ''}.`);
    process.exit(1);
  }
  console.log(`\n[run-evals] all evals passed against ${tgt}${skipped ? ` (${skipped} localOnly skipped)` : ''}.`);
  process.exit(0);
})();
