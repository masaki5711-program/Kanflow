#!/usr/bin/env node
/**
 * PostToolUse hook: lightweight frontend design-quality reminder.
 *
 * This stays self-contained inside ECC. It does not call remote models or
 * install packages. The goal is to catch obviously generic UI drift and keep
 * frontend edits aligned with ECC's stronger design standards.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FRONTEND_EXTENSIONS = /\.(astro|css|html|jsx|scss|svelte|tsx|vue)$/i;
const MAX_STDIN = 1024 * 1024;

// Signals aligned with .claude/rules/web/design-quality.md "Banned Patterns".
// Do NOT flag techniques that design-quality.md endorses (gradients, grid
// breaking, centered compositions) — only genuinely template-default drift.
const GENERIC_SIGNALS = [
  { pattern: /\bget started\b/i, label: '"Get Started" CTA copy' },
  { pattern: /\blearn more\b/i, label: '"Learn more" CTA copy' },
  { pattern: /\bfont-(sans|inter)\b/i, label: 'default font stack with no deliberate pairing' },
  { pattern: /\bbg-white\b[^\n]*\btext-gray-[5-7]00\b/, label: 'safe gray-on-white default styling' },
  { pattern: /\blorem ipsum\b/i, label: 'placeholder copy left in the UI' },
];

const CHECKLIST = [
  'visual hierarchy with real contrast (scale, weight — not uniform emphasis)',
  'intentional spacing rhythm on the 8pt grid, not uniform padding',
  'depth or layering (surfaces, shadows, overlap, motion)',
  'designed hover / focus / active states plus loading / error states',
  'colors and type consumed from design tokens (frontend-design design-tokens.json), not ad-hoc values',
];

function getFilePaths(input) {
  const toolInput = input?.tool_input || {};
  if (toolInput.file_path) {
    return [String(toolInput.file_path)];
  }

  if (Array.isArray(toolInput.edits)) {
    return toolInput.edits
      .map(edit => String(edit?.file_path || ''))
      .filter(Boolean);
  }

  return [];
}

function readContent(filePath) {
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch {
    return '';
  }
}

function detectSignals(content) {
  return GENERIC_SIGNALS.filter(signal => signal.pattern.test(content)).map(signal => signal.label);
}

function buildWarning(frontendPaths, findings) {
  const pathLines = frontendPaths.map(fp => `  - ${fp}`).join('\n');
  const signalLines = findings.length > 0
    ? findings.map(item => `  - ${item}`).join('\n')
    : '  - no obvious canned-template strings detected';

  return [
    '[Hook] DESIGN CHECK: frontend file(s) modified:',
    pathLines,
    '[Hook] Review for generic/template drift. Frontend should have:',
    CHECKLIST.map(item => `  - ${item}`).join('\n'),
    '[Hook] Heuristic signals:',
    signalLines,
    '[Hook] Standard: .claude/rules/web/design-quality.md. For a full visual review,',
    '[Hook] run the design-reviewer agent before committing UI changes.',
  ].join('\n');
}

function run(inputOrRaw) {
  let input;
  let rawInput = inputOrRaw;

  try {
    if (typeof inputOrRaw === 'string') {
      rawInput = inputOrRaw;
      input = inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {};
    } else {
      input = inputOrRaw || {};
      rawInput = JSON.stringify(inputOrRaw ?? {});
    }
  } catch {
    return { exitCode: 0, stdout: typeof rawInput === 'string' ? rawInput : '' };
  }

  const filePaths = getFilePaths(input);
  const frontendPaths = filePaths.filter(filePath => FRONTEND_EXTENSIONS.test(filePath));

  if (frontendPaths.length === 0) {
    return { exitCode: 0, stdout: typeof rawInput === 'string' ? rawInput : '' };
  }

  const findings = [];
  for (const filePath of frontendPaths) {
    const content = readContent(filePath);
    findings.push(...detectSignals(content));
  }

  return {
    exitCode: 0,
    stdout: typeof rawInput === 'string' ? rawInput : '',
    stderr: buildWarning(frontendPaths, findings),
  };
}

module.exports = { run };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
    }
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.stdout.write(typeof result.stdout === 'string' ? result.stdout : raw);
    process.exit(Number.isInteger(result.exitCode) ? result.exitCode : 0);
  });
}
