'use strict';

/*
 * Tests for scripts/lib/worktree-info.js (topology, overlap) and the
 * scripts/worktree.js CLI (new / status / sync / done, incl. a paired product
 * repository under apps/<project>). Real git in temp repos; synthetic content.
 */

const { test: nodeTest, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wt = require('../lib/worktree-info');
const cli = require('../worktree');
const fx = require('../lib/__tests__/worktree-fixture');

// Everything here drives real git; without it the tests skip (not fail).
const test = (name, fn) => nodeTest(name, { skip: fx.HAS_GIT ? false : 'git not available' }, fn);

const repos = [];
function repo(prefix) {
  const root = fx.makeRepo(prefix);
  repos.push(root);
  return root;
}
after(() => repos.forEach(fx.cleanup));

function run(cwd, ...argv) {
  const lines = [];
  const code = cli.main(argv, cwd, line => lines.push(String(line)));
  return { code, out: lines.join('\n') };
}

// ── worktree-info ──────────────────────────────────────────────────────────

test('describe: main checkout vs linked worktree vs non-repo', () => {
  const root = repo('wt-info-');
  const linked = fx.addWorktree(root, 'feat/Lcross-PBI-34-one');

  const main = wt.describe(root);
  assert.equal(main.isLinked, false);
  assert.equal(wt.normalize(main.mainRoot), wt.normalize(root));
  assert.equal(wt.currentBranch(main), 'main');

  const sub = wt.describe(path.join(linked, 'nested', 'dir'));
  assert.equal(sub.isLinked, true);
  assert.equal(wt.normalize(sub.root), wt.normalize(linked));
  assert.equal(wt.normalize(sub.mainRoot), wt.normalize(root));
  assert.equal(wt.currentBranch(sub), 'feat/Lcross-PBI-34-one');

  assert.equal(wt.describe(path.parse(root).root), null);
  assert.equal(wt.currentBranch(null), null);
});

test('listWorktrees / ownerOf: the deepest containing worktree owns a file', () => {
  const root = repo('wt-list-');
  const linked = fx.addWorktree(root, 'feat/Lcross-PBI-34-one');
  const trees = wt.listWorktrees(wt.describe(root));
  assert.deepEqual(trees.map(t => t.branch).sort(), ['feat/Lcross-PBI-34-one', 'main']);

  assert.equal(wt.ownerOf(path.join(linked, 'a.txt'), trees).branch, 'feat/Lcross-PBI-34-one');
  assert.equal(wt.ownerOf(path.join(root, 'a.txt'), trees).isMain, true);
  assert.equal(wt.ownerOf(path.parse(root).root, trees), null);
  assert.deepEqual(wt.listWorktrees(null), []);
});

test('listWorktrees: a worktree directory deleted by hand is skipped', () => {
  const root = repo('wt-stale-');
  const linked = fx.addWorktree(root, 'feat/Lcross-PBI-34-gone');
  fs.rmSync(linked, { recursive: true, force: true });
  assert.equal(wt.listWorktrees(wt.describe(root)).length, 1);
});

test('sessionWorktree: a linked worktree wins whichever variable points at it', () => {
  const root = repo('wt-sess-');
  const linked = fx.addWorktree(root, 'feat/Lcross-PBI-34-one');
  assert.equal(wt.sessionWorktree({ CLAUDE_PROJECT_DIR: root }, linked).isLinked, true);
  assert.equal(wt.sessionWorktree({ CLAUDE_PROJECT_DIR: linked }, root).isLinked, true);
  assert.equal(wt.sessionWorktree({}, root).isLinked, false);
  assert.equal(wt.sessionWorktree({}, path.parse(root).root), null);
  assert.equal(wt.sessionCheckouts({ CLAUDE_PROJECT_DIR: root }, linked).length, 2);
  assert.equal(wt.sessionCheckouts({ CLAUDE_PROJECT_DIR: root }, root).length, 1);
});

test('changedFiles: committed-on-branch, uncommitted and untracked', () => {
  const root = repo('wt-chg-');
  const linked = fx.addWorktree(root, 'feat/Lcross-PBI-34-one');
  fx.write(linked, 'committed.txt', 'x\n');
  fx.commitAll(linked, 'feat: committed');
  fx.write(linked, 'shared.txt', 'edited\n');
  fx.write(linked, 'dir/untracked.txt', 'y\n');
  assert.deepEqual(wt.changedFiles(linked), ['committed.txt', 'dir/untracked.txt', 'shared.txt']);
  assert.deepEqual(wt.changedFiles(root), []);
});

nodeTest('findOverlaps: shared files are overlaps; generated views are listed apart', () => {
  const res = wt.findOverlaps([
    { name: 'a', files: ['x.js', 'docs/asset-inventory.md', 'only-a.js'] },
    { name: 'b', files: ['x.js', 'docs/asset-inventory.md'] },
  ]);
  assert.deepEqual(res.overlaps, [{ file: 'x.js', worktrees: ['a', 'b'] }]);
  assert.deepEqual(res.generated.map(g => g.file), ['docs/asset-inventory.md']);
});

// ── CLI: new ───────────────────────────────────────────────────────────────

test('new: rejects non-conformant and trunk branch names', () => {
  const root = repo('wt-new-bad-');
  assert.equal(run(root, 'new', 'worktree-foo').code, 1);
  assert.equal(run(root, 'new', 'main').code, 1);
  assert.equal(run(root, 'new').code, 1);
  assert.match(run(root, 'new', 'feat/L3-no-pbi', '--no-fetch').out, /PBI number is missing/);
  assert.equal(cli.validateNewBranch('feat/L3-PBI-34-ok'), null);
});

test('new: creates a convention-named worktree and copies untracked setup files', () => {
  const root = repo('wt-new-');
  fx.write(root, '.claude/settings.local.json', '{}\n');
  const res = run(root, 'new', 'feat/Lcross-PBI-34-topic', '--no-fetch');
  assert.equal(res.code, 0, res.out);
  const dest = path.join(root, '.claude', 'worktrees', 'feat-Lcross-PBI-34-topic');
  assert.equal(wt.currentBranch(wt.describe(dest)), 'feat/Lcross-PBI-34-topic');
  assert.ok(fs.existsSync(path.join(dest, '.claude', 'settings.local.json')));
  assert.equal(run(root, 'new', 'feat/Lcross-PBI-34-topic', '--no-fetch').code, 1, 'refuses an existing directory');
});

test('new: warns above the parallel guideline', () => {
  const root = repo('wt-new-max-');
  const res = fx.withEnv({ ECC_MAX_PARALLEL_WORKTREES: '1' }, () => {
    run(root, 'new', 'feat/Lcross-PBI-34-one', '--no-fetch');
    return run(root, 'new', 'feat/Lcross-PBI-34-two', '--no-fetch');
  });
  assert.equal(res.code, 0);
  assert.match(res.out, /WARN {2}2 parallel worktrees/);
  assert.equal(cli.maxParallel({ ECC_MAX_PARALLEL_WORKTREES: 'x' }), 3);
});

// ── CLI: status ────────────────────────────────────────────────────────────

test('status: reports overlaps and registration points across worktrees', () => {
  const root = repo('wt-status-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  const b = fx.addWorktree(root, 'feat/Lcross-PBI-34-b');
  fx.write(a, 'shared.txt', 'a\n');
  fx.write(b, 'shared.txt', 'b\n');
  fx.write(a, '.claude/settings.json', '{}\n');

  const json = JSON.parse(run(root, 'status', '--json').out);
  assert.deepEqual(json.overlaps, [{ file: 'shared.txt', worktrees: ['feat/Lcross-PBI-34-a', 'feat/Lcross-PBI-34-b'] }]);
  const rowA = json.worktrees.find(w => w.branch === 'feat/Lcross-PBI-34-a');
  assert.deepEqual(rowA.registrationPoints, ['.claude/settings.json']);
  assert.deepEqual(json.apps, {});

  const text = run(a, 'status').out;
  assert.match(text, /Overlaps: 1 file/);
  assert.match(text, /registration points: \.claude\/settings\.json/);
});

test('status: no overlap is stated plainly', () => {
  const root = repo('wt-status-clean-');
  fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  assert.match(run(root, 'status').out, /Overlaps: none/);
});

// ── CLI: sync ──────────────────────────────────────────────────────────────

test('sync: merges the trunk into the feature worktree', () => {
  const root = repo('wt-sync-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(root, 'trunk-only.txt', 't\n');
  fx.commitAll(root, 'feat: trunk moved');
  const res = run(a, 'sync');
  assert.equal(res.code, 0, res.out);
  assert.ok(fs.existsSync(path.join(a, 'trunk-only.txt')));
});

test('sync: refuses on the trunk; stops on a real conflict and names the file', () => {
  const root = repo('wt-sync-conflict-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  assert.equal(run(root, 'sync').code, 1);

  fx.write(a, 'shared.txt', 'feature\n');
  fx.commitAll(a, 'feat: feature edit');
  fx.write(root, 'shared.txt', 'trunk\n');
  fx.commitAll(root, 'feat: trunk edit');
  const res = run(a, 'sync');
  assert.equal(res.code, 1);
  assert.match(res.out, /Resolve by hand: shared\.txt/);
});

test('sync: a conflict only in a generated view is concluded automatically', () => {
  const root = repo('wt-sync-gen-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(a, 'MISTAKES.md', 'feature view\n');
  fx.commitAll(a, 'feat: feature view');
  fx.write(root, 'MISTAKES.md', 'trunk view\n');
  fx.commitAll(root, 'feat: trunk view');
  const res = run(a, 'sync');
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /conflicts only in generated views/);
  assert.equal(fx.git(a, 'status', '--porcelain'), '');
});

// ── CLI: done ──────────────────────────────────────────────────────────────

test('done: refuses unlanded or dirty work; removes a squash-merged worktree', () => {
  const root = repo('wt-done-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(a, 'feature.txt', 'f\n');
  assert.match(run(root, 'done', 'feat/Lcross-PBI-34-a').out, /uncommitted changes/);
  fx.commitAll(a, 'feat: feature');
  assert.match(run(root, 'done', 'feat/Lcross-PBI-34-a').out, /not on main/);
  assert.equal(cli.isLanded(root, 'feat/Lcross-PBI-34-a', 'main'), false);

  fx.git(root, 'merge', '--squash', 'feat/Lcross-PBI-34-a');
  fx.git(root, 'commit', '-m', 'feat: feature (!1)');
  assert.equal(cli.isLanded(root, 'feat/Lcross-PBI-34-a', 'main'), true);

  assert.match(run(a, 'done', 'feat/Lcross-PBI-34-a').out, /from the main checkout/);
  const res = run(root, 'done', 'feat/Lcross-PBI-34-a');
  assert.equal(res.code, 0, res.out);
  assert.equal(fs.existsSync(a), false);
  assert.equal(fx.git(root, 'branch', '--list', 'feat/Lcross-PBI-34-a'), '');
  assert.equal(run(root, 'done', 'feat/Lcross-PBI-34-a').code, 1, 'unknown worktree');
});

test('done: refuses when there is no trunk ref to verify against', () => {
  const root = repo('wt-done-notrunk-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(a, 'feature.txt', 'f\n');
  fx.commitAll(a, 'feat: feature');
  fx.git(root, 'branch', '-m', 'main', 'trunk'); // a repo whose trunk is not main
  const res = run(root, 'done', 'feat/Lcross-PBI-34-a');
  assert.equal(res.code, 1);
  assert.match(res.out, /no trunk ref/);
  assert.ok(fs.existsSync(a));
});

test('done: refuses a detached HEAD holding commits that are not on the trunk', () => {
  const root = repo('wt-done-detached-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.git(a, 'checkout', '-q', '--detach');
  fx.write(a, 'orphan.txt', 'o\n');
  fx.commitAll(a, 'feat: only reachable from the detached HEAD');
  const res = run(root, 'done', 'feat-Lcross-PBI-34-a');
  assert.equal(res.code, 1);
  assert.match(res.out, /detached HEAD .* has work that is not on main/);
  assert.ok(fs.existsSync(a));
});

test('done: refuses when the worktree contains a standalone product clone', () => {
  const root = repo('wt-done-clone-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  const clone = fx.makeRepo('wt-clone-');
  fs.mkdirSync(path.join(a, 'apps'), { recursive: true });
  fs.renameSync(clone, path.join(a, 'apps', 'demo')); // ignored by the outer repo, so git sees it as clean
  const res = run(root, 'done', 'feat/Lcross-PBI-34-a');
  assert.equal(res.code, 1);
  assert.match(res.out, /standalone clone/);
  assert.ok(fs.existsSync(path.join(a, 'apps', 'demo', 'README.md')));
});

test('sync: a generated-view conflict that cannot be auto-resolved aborts the merge cleanly', () => {
  const root = repo('wt-sync-moddel-');
  fx.write(root, 'MISTAKES.md', 'view\n');
  fx.commitAll(root, 'feat: add view');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(a, 'MISTAKES.md', 'feature view\n');
  fx.commitAll(a, 'feat: feature view');
  fx.git(root, 'rm', '-q', 'MISTAKES.md'); // modify/delete: there is no "theirs" to take
  fx.git(root, 'commit', '-q', '-m', 'chore: drop view');
  const before = fx.git(a, 'rev-parse', 'HEAD');
  const res = run(a, 'sync');
  assert.equal(res.code, 1);
  assert.match(res.out, /merge aborted/);
  assert.equal(fx.git(a, 'rev-parse', 'HEAD'), before);
  assert.equal(fx.git(a, 'status', '--porcelain'), '', 'no half-merged state or conflict markers left');
});

test('changedFiles: non-ASCII file names are reported verbatim', () => {
  const root = repo('wt-nonascii-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(a, '仕様.md', 'x\n');
  assert.deepEqual(wt.changedFiles(a), ['仕様.md']);
});

test('hasLocalBranch: loose and packed refs; unknown names and tags are not branches', () => {
  const root = repo('wt-refs-');
  fx.git(root, 'branch', 'feat/Lcross-PBI-34-loose');
  fx.git(root, 'tag', 'v1.2.3');
  const info = wt.describe(root);
  assert.equal(wt.hasLocalBranch(info, 'feat/Lcross-PBI-34-loose'), true);
  fx.git(root, 'pack-refs', '--all');
  assert.equal(wt.hasLocalBranch(info, 'feat/Lcross-PBI-34-loose'), true);
  assert.equal(wt.hasLocalBranch(info, 'v1.2.3'), false);
  assert.equal(wt.hasLocalBranch(info, 'nope'), false);
  assert.equal(wt.hasLocalBranch(null, 'main'), false);
});

test('done --force discards an unlanded worktree', () => {
  const root = repo('wt-done-force-');
  const a = fx.addWorktree(root, 'feat/Lcross-PBI-34-a');
  fx.write(a, 'scratch.txt', 's\n');
  assert.equal(run(root, 'done', 'feat-Lcross-PBI-34-a', '--force').code, 0);
  assert.equal(fs.existsSync(a), false);
});

// ── CLI: paired product repository (apps/<project>) ────────────────────────

test('new --app pairs a product worktree; status and done cover it', () => {
  const root = repo('wt-app-');
  const product = fx.makeRepo('wt-product-');
  fs.mkdirSync(path.join(root, 'apps'), { recursive: true });
  const productMain = path.join(root, 'apps', 'demo');
  fs.renameSync(product, productMain);

  assert.match(run(root, 'new', 'feat/L3-PBI-34-a', '--no-fetch', '--app', 'nope').out, /not a product checkout/);
  assert.match(run(root, 'new', 'feat/L3-PBI-34-a', '--no-fetch', '--app', 'demo:bad-name').out, /apps\/demo: /);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'worktrees', 'feat-L3-PBI-34-a')), false, 'nothing created on a bad spec');

  const res = run(root, 'new', 'feat/L3-PBI-34-b', '--no-fetch', '--app', 'demo');
  assert.equal(res.code, 0, res.out);
  const dest = path.join(root, '.claude', 'worktrees', 'feat-L3-PBI-34-b');
  const paired = wt.describe(path.join(dest, 'apps', 'demo'));
  assert.equal(paired.isLinked, true);
  assert.equal(wt.normalize(paired.mainRoot), wt.normalize(productMain));
  assert.equal(wt.currentBranch(paired), 'feat/L3-PBI-34-b');

  // Product-repo overlap: the main product checkout and the paired worktree
  // both change the same file.
  fx.write(productMain, 'shared.txt', 'main side\n');
  fx.write(paired.root, 'shared.txt', 'paired side\n');
  const json = JSON.parse(run(root, 'status', '--json').out);
  assert.equal(json.apps.demo.overlaps[0].file, 'shared.txt');
  assert.match(run(root, 'status').out, /=== apps\/demo \(product repository\) ===/);

  assert.match(run(root, 'done', 'feat/L3-PBI-34-b').out, /apps\/demo: .*uncommitted changes/);
  assert.equal(run(root, 'done', 'feat/L3-PBI-34-b', '--force').code, 0);
  assert.equal(fs.existsSync(dest), false);
  assert.equal(fx.git(productMain, 'branch', '--list', 'feat/L3-PBI-34-b'), '');
});

test('main: usage on an unknown command; error outside a repository', () => {
  const root = repo('wt-main-');
  assert.equal(run(root, 'bogus').code, 1);
  assert.match(run(path.parse(root).root, 'status').out, /not inside a git repository/);
  assert.deepEqual(cli.parseArgs(['a', '--base', 'x', '--app', 'p:q', '--json']), {
    flags: { base: 'x', json: true },
    positional: ['a'],
    apps: ['p:q'],
  });
});
