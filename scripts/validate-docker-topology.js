#!/usr/bin/env node
'use strict';

/*
 * validate-docker-topology.js — network-topology & statelessness gate.
 *
 * iotpf-architecture-contracts.md §4 claims the layer boundary is "enforced
 * by infrastructure, not by a comment": no service sits on both the
 * edge-facing network and the AI network, so the AI service reaches edge data
 * only through Edge MCP over mTLS (Flow B, contracts §2.1). A service that
 * needs a network it isn't on is a design error, not a runtime request. This
 * gate makes the claim structural.
 *
 * Checks apps/docker-compose.yml (legacy layout) and the primary compose file
 * (docker-compose.yml / compose.yml) of every product checkout apps/<project>/:
 *   1. ERROR — a service's `networks:` references a network not declared
 *      under the top-level `networks:` block (typo / drift guard).
 *   2. ERROR — a service attached to BOTH an edge network and an ai network
 *      (by name token, not literal service identity) — the edge ⇄ AI
 *      boundary of contracts §2.1 / §4.
 *   3. WARNING (non-blocking) — a non-db/cache/broker service declares
 *      `volumes:`, a heuristic signal of in-process state that contradicts
 *      the statelessness rule (contracts §6: state belongs in Redis /
 *      TimescaleDB). A heuristic, not proof — surfaced for human review.
 *
 * No compose file under apps/ yet, or no active (uncommented) services in any
 * -> skip cleanly (the workspace may be empty).
 *
 * Node built-ins only. CI gate, not a Claude Code hook: does NOT fail open
 * on a real topology violation — blocking that is the point of this gate.
 *
 * Run: node scripts/validate-docker-topology.js
 */

const fs = require('fs');
const path = require('path');
const { parseCompose } = require('./lib/compose-parser');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const APPS = path.join(ROOT, 'apps');
const COMPOSE_NAMES = ['docker-compose.yml', 'compose.yml'];

const EDGE_NET_PATTERN = /\bedge\b/i;
const AI_NET_PATTERN = /\bai\b/i;
const STATE_OWNER_PATTERN =
  /(postgres|timescale|redis|db\b|cache|mosquitto|emqx|broker|\bmq\b|ollama|keycloak|prometheus|grafana|loki)/i;

// apps/docker-compose.yml plus the primary compose file of each apps/<project>/.
function composeFiles() {
  const out = [];
  const legacy = path.join(APPS, 'docker-compose.yml');
  if (fs.existsSync(legacy)) out.push(legacy);
  if (!fs.existsSync(APPS)) return out;
  const dirs = fs.readdirSync(APPS, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name)); // deterministic across platforms
  for (const d of dirs) {
    const name = COMPOSE_NAMES.find(n => fs.existsSync(path.join(APPS, d.name, n)));
    if (name) out.push(path.join(APPS, d.name, name));
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function checkCompose(file, errors, warnings) {
  const { services, networks } = parseCompose(fs.readFileSync(file, 'utf8'));
  const where = rel(file);
  for (const [name, svc] of Object.entries(services)) {
    for (const net of svc.networks) {
      if (!networks.has(net)) {
        errors.push(
          `${where}: service '${name}' references undeclared network '${net}' ` +
            '(typo, or missing from the top-level networks: block)',
        );
      }
    }

    const onEdge = svc.networks.some(n => EDGE_NET_PATTERN.test(n));
    const onAi = svc.networks.some(n => AI_NET_PATTERN.test(n));
    if (onEdge && onAi) {
      errors.push(
        `${where}: service '${name}' is attached to both an edge network and an ai network ` +
          `(${svc.networks.join(', ')}) — the AI side reaches edge data only through Edge MCP over mTLS ` +
          '(iotpf-architecture-contracts.md §2.1 / §4)',
      );
    }

    if (svc.volumes.length > 0 && !STATE_OWNER_PATTERN.test(name)) {
      warnings.push(
        `${where}: service '${name}' declares volumes: ${svc.volumes.join(', ')} — verify this is not ` +
          'in-process business state (contracts §6: state belongs in Redis/TimescaleDB, not a service volume)',
      );
    }
  }
  return Object.keys(services).length;
}

function main() {
  const files = composeFiles();
  if (files.length === 0) {
    console.log('[validate-docker-topology] no compose file under apps/ — skipping');
    process.exit(0);
  }

  const errors = [];
  const warnings = [];
  let serviceCount = 0;
  for (const f of files) serviceCount += checkCompose(f, errors, warnings);

  if (serviceCount === 0) {
    console.log('[validate-docker-topology] no active (uncommented) services yet — skipping');
    process.exit(0);
  }

  if (warnings.length) {
    console.log(`
[validate-docker-topology] ${warnings.length} warning(s):`);
    for (const w of warnings) console.log('  WARN  ' + w);
  }

  if (errors.length) {
    console.error(`
[validate-docker-topology] FAILED — ${errors.length} error(s):`);
    for (const e of errors) console.error('  ERROR ' + e);
    process.exit(1);
  }

  console.log(
    '[validate-docker-topology] OK — network topology honors the layer-boundary contract ' +
      `[files=${files.length}, services=${serviceCount}]`,
  );
  process.exit(0);
}

main();
