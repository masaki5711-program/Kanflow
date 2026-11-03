'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCompose } = require('../compose-parser');

test('parses the repo scaffold shape: active service + commented-out services + networks block', () => {
  const text = `
services:
  mosquitto:
    image: eclipse-mosquitto:2
    networks: [edge-net, core-net]
    # ports/config added when the broker config lands

  # edge:
  #   build: ./edge
  #   networks: [edge-net]

  # hub:
  #   build: ./hub
  #   networks: [core-net, ai-net]

networks:
  edge-net:
  core-net:
  ai-net:
`;
  const { services, networks } = parseCompose(text);
  assert.deepEqual(Object.keys(services), ['mosquitto'], 'commented-out services are ignored');
  assert.deepEqual(services.mosquitto.networks, ['edge-net', 'core-net']);
  assert.deepEqual(services.mosquitto.volumes, []);
  assert.deepEqual([...networks].sort(), ['ai-net', 'core-net', 'edge-net']);
});

test('parses block-style (dash list) networks and volumes', () => {
  const text = `
services:
  ai:
    build: ./ai
    networks:
      - ai-net
    volumes:
      - modeldata:/models

networks:
  ai-net:
`;
  const { services } = parseCompose(text);
  assert.deepEqual(services.ai.networks, ['ai-net']);
  assert.deepEqual(services.ai.volumes, ['modeldata:/models']);
});

test('a sibling key after a block list ends that list (no bleed into the next key)', () => {
  const text = `
services:
  hub:
    networks:
      - core-net
      - ai-net
    restart: unless-stopped
    volumes:
      - hubcache:/cache

networks:
  core-net:
  ai-net:
`;
  const { services } = parseCompose(text);
  assert.deepEqual(services.hub.networks, ['core-net', 'ai-net']);
  assert.deepEqual(services.hub.volumes, ['hubcache:/cache']);
});

test('a new service line ends the previous service block', () => {
  const text = `
services:
  a:
    networks: [net1]
  b:
    networks: [net2]

networks:
  net1:
  net2:
`;
  const { services } = parseCompose(text);
  assert.deepEqual(services.a.networks, ['net1']);
  assert.deepEqual(services.b.networks, ['net2']);
});

test('no services: or networks: block -> empty result, no throw', () => {
  const { services, networks } = parseCompose('version: "3"\n');
  assert.deepEqual(services, {});
  assert.equal(networks.size, 0);
});

test('empty string input -> empty result', () => {
  const { services, networks } = parseCompose('');
  assert.deepEqual(services, {});
  assert.equal(networks.size, 0);
});

test('inline list trailing comment is stripped', () => {
  const text = `
services:
  hub:
    networks: [core-net, ai-net]

networks:
  core-net:
  ai-net:
`;
  const { services } = parseCompose(text);
  assert.deepEqual(services.hub.networks, ['core-net', 'ai-net']);
});
