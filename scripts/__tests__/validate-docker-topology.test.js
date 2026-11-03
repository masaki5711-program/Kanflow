'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'validate-docker-topology.js');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-docker-topology-'));

test.after(() => {
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function runGate(projectDir) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

function writeCompose(dir, contents) {
  fs.mkdirSync(path.join(dir, 'apps'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps', 'docker-compose.yml'), contents, 'utf8');
}

test('no apps/docker-compose.yml -> skips cleanly (exit 0)', () => {
  const dir = path.join(SANDBOX, 'no-compose');
  fs.mkdirSync(dir, { recursive: true });
  const res = runGate(dir);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /skipping/);
});

test('only commented-out (scaffolded) services -> skips cleanly (exit 0)', () => {
  const dir = path.join(SANDBOX, 'scaffold-only');
  writeCompose(
    dir,
    `services:\n  # edge:\n  #   networks: [edge-net]\n\nnetworks:\n  edge-net:\n`,
  );
  const res = runGate(dir);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /skipping/);
});

test('honors the layer boundary -> exit 0', () => {
  const dir = path.join(SANDBOX, 'honors-boundary');
  writeCompose(
    dir,
    [
      'services:',
      '  edge:',
      '    networks: [edge-net]',
      '  hub:',
      '    networks: [core-net, ai-net]',
      '  ai:',
      '    networks: [ai-net]',
      '',
      'networks:',
      '  edge-net:',
      '  core-net:',
      '  ai-net:',
      '',
    ].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /OK/);
});

test('a service on both an edge network and an ai network -> blocks (exit 1)', () => {
  const dir = path.join(SANDBOX, 'crosses-boundary');
  writeCompose(
    dir,
    [
      'services:',
      '  hub:',
      '    networks: [edge-net, ai-net]',
      '',
      'networks:',
      '  edge-net:',
      '  ai-net:',
      '',
    ].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /both an edge network and an ai network/);
});

test('a network referenced but not declared -> blocks (exit 1)', () => {
  const dir = path.join(SANDBOX, 'undeclared-network');
  writeCompose(
    dir,
    ['services:', '  hub:', '    networks: [core-net, ai-net]', '', 'networks:', '  core-net:', ''].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /undeclared network 'ai-net'/);
});

test('a non-db service declaring volumes -> warns but does not block (exit 0)', () => {
  const dir = path.join(SANDBOX, 'stateful-warning');
  writeCompose(
    dir,
    [
      'services:',
      '  hub:',
      '    networks: [core-net]',
      '    volumes:',
      '      - hubcache:/cache',
      '',
      'networks:',
      '  core-net:',
      '',
    ].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /WARN.*hub.*volumes/);
});

test('a db/cache/broker-named service declaring volumes -> no warning', () => {
  const dir = path.join(SANDBOX, 'db-no-warning');
  writeCompose(
    dir,
    [
      'services:',
      '  postgres:',
      '    networks: [core-net]',
      '    volumes:',
      '      - pgdata:/var/lib/postgresql/data',
      '',
      'networks:',
      '  core-net:',
      '',
    ].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.doesNotMatch(res.stdout, /WARN/);
});

function writeProjectCompose(dir, project, contents) {
  fs.mkdirSync(path.join(dir, 'apps', project), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps', project, 'docker-compose.yml'), contents, 'utf8');
}

test('ZEVA topology (judgment hub on core + ai, AI service on ai only) -> exit 0', () => {
  const dir = path.join(SANDBOX, 'zeva-topology');
  writeProjectCompose(
    dir,
    'iotpf-zeva-engine',
    [
      'services:',
      '  zeva-engine:',
      '    networks: [core-net]',
      '  judgment-hub:',
      '    networks: [core-net, ai-net]',
      '  ai-service:',
      '    networks: [ai-net]',
      '  emqx:',
      '    networks: [edge-net, core-net]',
      '',
      'networks:',
      '  edge-net:',
      '  core-net:',
      '  ai-net:',
      '',
    ].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /files=1, services=4/);
});

test('a violation inside a product checkout apps/<project>/ is caught and located', () => {
  const dir = path.join(SANDBOX, 'project-violation');
  writeProjectCompose(
    dir,
    'iotpf-ai-service',
    ['services:', '  ai-service:', '    networks: [edge-net, ai-net]', '', 'networks:', '  edge-net:', '  ai-net:', ''].join('\n'),
  );
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /apps\/iotpf-ai-service\/docker-compose\.yml: service 'ai-service'/);
  assert.match(res.stderr, /Edge MCP/);
});

test('every product compose file is checked, not only the first', () => {
  const dir = path.join(SANDBOX, 'two-projects');
  const ok = ['services:', '  api:', '    networks: [core-net]', '', 'networks:', '  core-net:', ''].join('\n');
  writeProjectCompose(dir, 'a-project', ok);
  writeProjectCompose(dir, 'b-project', ok.replace('[core-net]', '[core-net, missing-net]'));
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /apps\/b-project\/docker-compose\.yml: .*undeclared network 'missing-net'/);
});
