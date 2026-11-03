'use strict';

/*
 * compose-parser.js — minimal, purpose-built parser for this repo's
 * docker-compose.yml shape (apps/docker-compose.yml).
 *
 * This is NOT a general YAML parser: it understands exactly the subset used
 * here — top-level `services:` / `networks:` maps, per-service
 * `networks:`/`volumes:` lists in either inline (`[a, b]`) or block (`- a`)
 * form, and full-line `#` comments (a commented-out scaffolded service is
 * treated as inactive, matching how docker-compose itself would ignore it).
 * If the compose file's shape ever grows past this subset (anchors,
 * multi-document, flow mappings, etc.), replace this with a real YAML
 * library rather than extending these regexes — Node built-ins only is a
 * deliberate constraint for this repo's core tooling, not a reason to grow
 * a bespoke YAML parser indefinitely.
 */

function stripInlineComment(line) {
  // Strips a comment that starts after whitespace or at line start — good
  // enough for this file's flat scalars/lists (no quoted '#' values here).
  const idx = line.search(/(^|\s)#/);
  return idx === -1 ? line : line.slice(0, idx);
}

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function parseInlineList(text) {
  const m = text.match(/\[(.*)\]/);
  if (!m) return null;
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} text - raw docker-compose.yml contents
 * @returns {{ services: Record<string, {networks: string[], volumes: string[]}>, networks: Set<string> }}
 */
function parseCompose(text) {
  // Zero out fully-commented lines up front (scaffolded/inactive services)
  // but keep the line so indentation-based section tracking stays simple.
  const lines = text.split(/\r?\n/).map(l => (/^\s*#/.test(l) ? '' : l));

  const services = {};
  const networks = new Set();

  let section = null; // 'services' | 'networks' | null
  let currentService = null;
  let currentServiceIndent = -1;
  let currentKey = null; // 'networks' | 'volumes' | null
  let currentKeyIndent = -1;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const line = stripInlineComment(raw);
    if (!line.trim()) continue;

    const indent = indentOf(line);
    const trimmed = line.trim();

    if (indent === 0) {
      if (trimmed === 'services:') section = 'services';
      else if (trimmed === 'networks:') section = 'networks';
      else section = null;
      currentService = null;
      currentKey = null;
      continue;
    }

    if (section === 'networks') {
      const m = trimmed.match(/^([a-zA-Z0-9_.-]+):/);
      if (m && indent <= 2) networks.add(m[1]);
      continue;
    }

    if (section !== 'services') continue;

    if (currentKey && indent <= currentKeyIndent) currentKey = null;
    if (currentService && indent <= currentServiceIndent) {
      currentService = null;
      currentKey = null;
    }

    if (!currentService) {
      const serviceMatch = trimmed.match(/^([a-zA-Z0-9_.-]+):\s*$/);
      if (serviceMatch) {
        currentService = serviceMatch[1];
        currentServiceIndent = indent;
        services[currentService] = { networks: [], volumes: [] };
      }
      continue;
    }

    const listKeyMatch = trimmed.match(/^(networks|volumes):\s*(.*)$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const inline = parseInlineList(listKeyMatch[2]);
      if (inline) {
        services[currentService][key].push(...inline);
        currentKey = null;
      } else {
        currentKey = key;
        currentKeyIndent = indent;
      }
      continue;
    }

    if (currentKey && trimmed.startsWith('-')) {
      const val = trimmed.replace(/^-\s*/, '').trim();
      if (val) services[currentService][currentKey].push(val);
    }
  }

  return { services, networks };
}

module.exports = { parseCompose };
