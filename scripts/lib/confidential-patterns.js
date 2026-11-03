#!/usr/bin/env node
/**
 * Confidential-data detection patterns and scanner.
 *
 * Used by:
 *   - scripts/hooks/pre-bash-confidential-scan.js  (Claude Code PreToolUse)
 *   - .gitlab-ci.yml                              (CI gate on MR diff)
 *   - scripts/hooks/__tests__/confidential-scan.test.js
 *
 * Pure logic, no I/O. Safe to import from anywhere.
 *
 * Patterns target what CLAUDE.md §2 (Data sovereignty) bans from commits:
 *   - Real plant codes, line names, edge IPs/MACs, serial/lot numbers
 *   - Credentials of any kind
 *   - Local machine paths that leak organizational structure
 *   - Raw waveforms / sensor captures (file extensions)
 *
 * Severity:
 *   - 'critical' → blocks commit (exit 2)
 *   - 'warning'  → printed but does not block (exit 0)
 */

'use strict';

const CONTENT_PATTERNS = [
  // ── Credentials ─────────────────────────────────────────────────────────
  {
    name: 'GitLab Personal Access Token',
    regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
    severity: 'critical',
    hint: 'Rotate the token immediately at GitLab user settings.',
  },
  {
    name: 'GitHub Personal Access Token (classic)',
    regex: /\bghp_[A-Za-z0-9]{36,}\b/,
    severity: 'critical',
    hint: 'Rotate at GitHub settings → Developer settings.',
  },
  {
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    severity: 'critical',
    hint: 'Rotate via AWS IAM immediately.',
  },
  {
    name: 'Slack token',
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
    severity: 'critical',
    hint: 'Revoke at Slack App management.',
  },
  {
    name: 'Bearer token (HTTP Authorization)',
    regex: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/,
    severity: 'critical',
    hint: 'Move to env var or secret manager.',
  },
  {
    name: 'PEM private key block',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    severity: 'critical',
    hint: 'Private keys never belong in git. Rotate and revoke.',
  },
  {
    name: 'Generic credential assignment',
    regex: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key)\s*[:=]\s*['"][\w\-./+=]{16,}['"]/i,
    severity: 'critical',
    hint: 'Use env var or secret manager. Never inline.',
  },

  // ── Manufacturing-confidential (CLAUDE.md §2) ───────────────────────────
  {
    name: 'Plant code literal',
    regex: /\bplant[_-]?code\s*[:=]\s*['"][A-Z0-9][\w-]{1,12}['"]/i,
    severity: 'critical',
    hint: 'Use a synthetic placeholder (e.g. "PLANT-DEMO-01") in fixtures.',
  },
  {
    name: 'Serial or lot number literal',
    regex: /\b(serial|lot)[_-]?(?:no|number|id)\s*[:=]\s*['"][A-Z0-9][\w-]{5,}['"]/i,
    severity: 'critical',
    hint: 'Use a synthetic placeholder. Real serials are confidential.',
  },
  {
    name: 'MAC address',
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/,
    severity: 'critical',
    hint: 'Edge device MACs are confidential. Use a locally-administered example (02 prefix) per IEEE 802.',
  },
  {
    name: 'Internal IPv4 (10.x.x.x, not 10.0.0.1)',
    regex: /\b10\.(?!0\.0\.1\b)\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    severity: 'critical',
    hint: 'Use 192.0.2.x (RFC 5737 documentation range) for examples.',
  },
  {
    name: 'Internal IPv4 (172.16-31.x.x)',
    regex: /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/,
    severity: 'critical',
    hint: 'Use 192.0.2.x (RFC 5737 documentation range) for examples.',
  },

  // ── Local machine paths (organizational structure leak) ─────────────────
  {
    name: 'Windows user profile path',
    regex: /[A-Z]:\\Users\\(?!Public\\|Default\\|<|\$)[A-Za-z0-9_.-]+/,
    severity: 'warning',
    hint: 'Replace with C:\\\\Users\\\\<user>\\\\ or use relative paths.',
  },
  {
    name: 'UNC share path',
    regex: /\\\\(?!localhost|127\.|<)[A-Za-z0-9_.-]+\\[A-Za-z0-9_$.-]+/,
    severity: 'warning',
    hint: 'Internal share paths reveal infra. Use <share>\\\\<path> placeholder.',
  },
];

const FILENAME_PATTERNS = [
  {
    name: 'PCAP capture',
    regex: /\.pcap(\.[gx]z)?$/i,
    severity: 'critical',
    hint: 'Packet captures contain raw network data. Commit a synthetic sample instead.',
  },
  {
    name: 'CSV/TSV data file',
    regex: /\.(csv|tsv)$/i,
    severity: 'warning',
    hint: 'Confirm this is synthetic, not real shop-floor data.',
  },
  {
    name: 'Parquet data file',
    regex: /\.parquet$/i,
    severity: 'warning',
    hint: 'Parquet usually = real warehouse export. Confirm synthetic.',
  },
  {
    name: 'Binary capture/dump',
    regex: /\.(bin|dat|raw|dump)$/i,
    severity: 'warning',
    hint: 'Binary blobs of shop-floor data must not enter git.',
  },
  {
    name: 'Environment file',
    // A template (.env.example / .sample / .template / .dist) is meant to be committed: it is
    // not blocked by its NAME. Its content is still scanned like any other file, so a real
    // credential written into a template stays a critical finding. Only an exact template
    // suffix is exempt — `.env.example.local` or `.env.examples` is a real env file.
    regex: /(^|\/)\.env(?!(\.[^/.]+)*\.(example|sample|template|dist)$)(\.[^/]+)?$/,
    severity: 'critical',
    hint: '.env files contain secrets. Add to .gitignore. (Templates: .env.example / .sample / .template / .dist)',
  },
];

/**
 * Scan a block of text against CONTENT_PATTERNS.
 * Returns array of { pattern, severity, line, snippet, hint }.
 *
 * @param {string} text      — text to scan (a diff line, a commit message, etc.)
 * @param {string} sourceLabel — short label like 'apps/edge/main.rs:42' for output
 */
function scanText(text, sourceLabel = '') {
  if (typeof text !== 'string' || text.length === 0) return [];
  const findings = [];
  for (const p of CONTENT_PATTERNS) {
    const m = text.match(p.regex);
    if (m) {
      findings.push({
        pattern: p.name,
        severity: p.severity,
        hint: p.hint,
        match: m[0],
        source: sourceLabel,
        snippet: text.length > 200 ? text.slice(0, 200) + '…' : text,
      });
    }
  }
  return findings;
}

/**
 * Check a filename against FILENAME_PATTERNS.
 * Returns array of { pattern, severity, file, hint }.
 */
function scanFilename(filepath) {
  if (typeof filepath !== 'string' || filepath.length === 0) return [];
  const findings = [];
  for (const p of FILENAME_PATTERNS) {
    if (p.regex.test(filepath)) {
      findings.push({
        pattern: p.name,
        severity: p.severity,
        hint: p.hint,
        file: filepath,
      });
    }
  }
  return findings;
}

/**
 * Test paths are exempt from scanning. Test files MUST contain literal
 * patterns (e.g. "glpat-aaaa...", "AKIA...EXAMPLE") so the regexes can be
 * verified; treating those literals as critical findings would make the
 * scanner unable to commit its own tests. This list is conservative —
 * anything not clearly a test path is still scanned.
 */
const TEST_PATH_ALLOWLIST = [
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /(^|\/)fixtures?\//,
  /\.test\.[a-z]+$/i,
  /\.spec\.[a-z]+$/i,
];

function isTestPath(filepath) {
  if (typeof filepath !== 'string' || filepath.length === 0) return false;
  return TEST_PATH_ALLOWLIST.some(re => re.test(filepath));
}

/**
 * CLAUDE.md §6 requires example data to be synthesized and *marked* as
 * synthetic. A file that carries such a declaration may legitimately show
 * manufacturing-shaped literals — a spec's worked example has to quote the
 * kit's synthetic rows so the reader can verify them against the reference
 * database. Only the two manufacturing-identifier patterns below can be
 * exempted this way; credentials, IPs, MACs and local paths never are.
 */
const SYNTHETIC_DECLARATION = /\bsynthetic\b|合成データ|合成シナリオ|テストデータ/i;

const MARKER_EXEMPT_PATTERNS = new Set([
  'Plant code literal',
  'Serial or lot number literal',
]);

/**
 * True if the given file text declares that its example data is synthetic.
 * Pure: the caller supplies the text.
 */
function declaresSynthetic(text) {
  return typeof text === 'string' && SYNTHETIC_DECLARATION.test(text);
}

/**
 * Scan a unified diff (as produced by `git diff --cached --unified=0`).
 * Only added lines (starting with '+', not '+++') are scanned. Content
 * inside test paths (per TEST_PATH_ALLOWLIST) is skipped — those files
 * are expected to contain synthetic literal credentials for assertions.
 *
 * @param {string} diff — unified diff text
 * @param {object} [options]
 * @param {function} [options.fileText] — (path) => string|null. When supplied
 *        and the returned text declares synthetic example data, the two
 *        manufacturing-identifier patterns are demoted to 'info' for that
 *        file instead of blocking. Omitting it keeps the strict behaviour.
 * @returns {Array}     — combined findings from content + filename scans
 */
function scanDiff(diff, options) {
  if (typeof diff !== 'string' || diff.length === 0) return [];
  const fileText = options && typeof options.fileText === 'function' ? options.fileText : null;
  const findings = [];
  let currentFile = '';
  let skipFile = false;
  let fileIsSynthetic = false;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      // +++ b/path/to/file
      const m = line.match(/^\+\+\+ b\/(.+)$/) || line.match(/^\+\+\+ (.+)$/);
      currentFile = m ? m[1] : '';
      skipFile = isTestPath(currentFile);
      fileIsSynthetic = false;
      if (fileText && !skipFile) {
        try {
          fileIsSynthetic = declaresSynthetic(fileText(currentFile));
        } catch (_) {
          fileIsSynthetic = false;
        }
      }
      if (!skipFile) findings.push(...scanFilename(currentFile));
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('diff ') || line.startsWith('@@')) {
      continue;
    }
    if (skipFile) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.substring(1);
      for (const f of scanText(content, currentFile)) {
        if (fileIsSynthetic && MARKER_EXEMPT_PATTERNS.has(f.pattern)) {
          findings.push(Object.assign({}, f, {
            severity: 'info',
            exempt: 'file declares synthetic example data (CLAUDE.md §6)',
          }));
        } else {
          findings.push(f);
        }
      }
    }
  }

  // Deduplicate by (pattern, source, match)
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.pattern}|${f.source || f.file || ''}|${f.match || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * True if any finding is critical (i.e. would block).
 */
function hasCritical(findings) {
  return Array.isArray(findings) && findings.some(f => f.severity === 'critical');
}

module.exports = {
  CONTENT_PATTERNS,
  FILENAME_PATTERNS,
  TEST_PATH_ALLOWLIST,
  MARKER_EXEMPT_PATTERNS,
  SYNTHETIC_DECLARATION,
  declaresSynthetic,
  isTestPath,
  scanText,
  scanFilename,
  scanDiff,
  hasCritical,
};
