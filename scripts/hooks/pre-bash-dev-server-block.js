#!/usr/bin/env node
'use strict';

const MAX_STDIN = 1024 * 1024;
const path = require('path');
const { splitShellSegments } = require('../lib/shell-split');

const DEV_COMMAND_WORDS = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'npx',
  'tmux'
]);
const SKIPPABLE_PREFIX_WORDS = new Set(['env', 'command', 'builtin', 'exec', 'noglob', 'sudo', 'nohup']);
const PREFIX_OPTION_VALUE_WORDS = {
  env: new Set(['-u', '-C', '-S', '--unset', '--chdir', '--split-string']),
  sudo: new Set([
    '-u',
    '-g',
    '-h',
    '-p',
    '-r',
    '-t',
    '-C',
    '--user',
    '--group',
    '--host',
    '--prompt',
    '--role',
    '--type',
    '--close-from'
  ])
};

function readToken(input, startIndex) {
  let index = startIndex;
  while (index < input.length && /\s/.test(input[index])) index += 1;
  if (index >= input.length) return null;

  let token = '';
  let quote = null;

  while (index < input.length) {
    const ch = input[index];

    if (quote) {
      if (ch === quote) {
        quote = null;
        index += 1;
        continue;
      }

      if (ch === '\\' && quote === '"' && index + 1 < input.length) {
        token += input[index + 1];
        index += 2;
        continue;
      }

      token += ch;
      index += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      index += 1;
      continue;
    }

    if (/\s/.test(ch)) break;

    if (ch === '\\' && index + 1 < input.length) {
      token += input[index + 1];
      index += 2;
      continue;
    }

    token += ch;
    index += 1;
  }

  return { token, end: index };
}

function shouldSkipOptionValue(wrapper, optionToken) {
  if (!wrapper || !optionToken || optionToken.includes('=')) return false;
  const optionSet = PREFIX_OPTION_VALUE_WORDS[wrapper];
  return Boolean(optionSet && optionSet.has(optionToken));
}

function isOptionToken(token) {
  return token.startsWith('-') && token.length > 1;
}

function normalizeCommandWord(token) {
  if (!token) return '';
  const base = path.basename(token).toLowerCase();
  return base.replace(/\.(cmd|exe|bat)$/i, '');
}

function getLeadingCommandWord(segment) {
  let index = 0;
  let activeWrapper = null;
  let skipNextValue = false;

  while (index < segment.length) {
    const parsed = readToken(segment, index);
    if (!parsed) return null;
    index = parsed.end;

    const token = parsed.token;
    if (!token) continue;

    if (skipNextValue) {
      skipNextValue = false;
      continue;
    }

    if (token === '--') {
      activeWrapper = null;
      continue;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) continue;

    const normalizedToken = normalizeCommandWord(token);

    if (SKIPPABLE_PREFIX_WORDS.has(normalizedToken)) {
      activeWrapper = normalizedToken;
      continue;
    }

    if (activeWrapper && isOptionToken(token)) {
      if (shouldSkipOptionValue(activeWrapper, token)) {
        skipNextValue = true;
      }
      continue;
    }

    return normalizedToken;
  }

  return null;
}

/**
 * Core hook logic: decide whether a Bash command launches a dev server outside
 * tmux and should be blocked (POSIX only). Pure — no stdin, no process.exit.
 *
 * Returns either the raw input (pass-through / allow) or a result object with
 * exitCode 2 + a stderr guidance message when the command is blocked. On any
 * parse error it fails open by returning the raw input unchanged.
 *
 * @param {string} rawInput JSON event from stdin
 * @returns {string|{stderr:string,exitCode:number,stdout:string}}
 */
function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const cmd = String(input.tool_input?.command || '');

    if (process.platform !== 'win32') {
      const segments = splitShellSegments(cmd);
      const tmuxLauncher = /^\s*tmux\s+(new|new-session|new-window|split-window)\b/;
      const devPattern = /\b(npm\s+run\s+dev|pnpm(?:\s+run)?\s+dev|yarn\s+dev|bun\s+run\s+dev)\b/;

      const hasBlockedDev = segments.some(segment => {
        const commandWord = getLeadingCommandWord(segment);
        if (!commandWord || !DEV_COMMAND_WORDS.has(commandWord)) {
          return false;
        }
        return devPattern.test(segment) && !tmuxLauncher.test(segment);
      });

      if (hasBlockedDev) {
        const stderr =
          '[Hook] BLOCKED: Dev server must run in tmux for log access\n' +
          '[Hook] Use: tmux new-session -d -s dev "npm run dev"\n' +
          '[Hook] Then: tmux attach -t dev';
        return { stderr, exitCode: 2, stdout: '' };
      }
    }
  } catch {
    // ignore parse errors and pass through
  }

  return rawInput;
}

module.exports = { run, getLeadingCommandWord, normalizeCommandWord };

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      data += chunk.substring(0, MAX_STDIN - data.length);
    }
  });
  process.stdin.on('end', () => {
    const r = run(data, { truncated: process.env.ECC_HOOK_INPUT_TRUNCATED === '1' });
    if (r && typeof r === 'object') {
      if (r.stderr) process.stderr.write(String(r.stderr));
      if (Object.prototype.hasOwnProperty.call(r, 'stdout')) process.stdout.write(String(r.stdout ?? ''));
      else if (!Number.isInteger(r.exitCode) || r.exitCode === 0) process.stdout.write(data);
      process.exit(Number.isInteger(r.exitCode) ? r.exitCode : 0);
    }
    process.stdout.write(typeof r === 'string' ? r : data);
    process.exit(0);
  });
  process.stdin.on('error', () => process.exit(0));
}
