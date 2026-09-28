import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { stagePlayable } from '../scripts/stage-playable.mjs';
import { createPlayableServer, publicFiles } from '../scripts/playable-service.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('public runtime has only builtins and the reviewed read-only ZIP module; deployment remains separate', async () => {
  const source = await fs.readFile(new URL('../scripts/playable-service.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.deepEqual(imports.sort(), ['./playable-downloads.mjs', 'node:fs', 'node:fs/promises', 'node:http', 'node:path', 'node:url'].sort());
  const downloads = await fs.readFile(new URL('../scripts/playable-downloads.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...downloads.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]).sort(), ['node:crypto','node:fs','node:fs/promises','node:path','node:stream/promises'].sort());
  assert.doesNotMatch(downloads, /\bimport\s*\(|\brequire\s*\(|child_process|kanban-bridge|game-dev-api|game-build-store|process\.env/);
  assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(|child_process|kanban-bridge|game-dev-api|game-build-store/);
  const unit = await fs.readFile(new URL('../deploy/systemd/agent-playable.service.in', import.meta.url), 'utf8');
  for (const directive of ['User=agent-playable', 'ProtectHome=true', 'ProtectSystem=strict', 'NoNewPrivileges=true', 'InaccessiblePaths=/home /root /run/user /opt @ARTIFACT_STORE@', 'Environment=PLAYABLE_DOWNLOAD_ROOT=/srv/agent-playable/releases/@RELEASE@/downloads']) assert.ok(unit.includes(directive),directive);
  for (const name of ['agent-app-preview.service', 'agent-apps-preview.service']) {
    assert.doesNotMatch(await fs.readFile(new URL(`../deploy/systemd/user/${name}`, import.meta.url), 'utf8'), /playable-service/);
  }
});

test('real registered browser assets stage byte-identically and load on the static-only server', async t => {
  const registry = JSON.parse(await fs.readFile(new URL('../deploy/playable-registry.json', import.meta.url)));
  const manifest = JSON.parse(await fs.readFile(new URL('../games/manifest.json', import.meta.url)));
  assert.deepEqual(registry.games.map(g => g.id).sort(), manifest.games.map(g => g.id).sort());
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'public-real-assets-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const dest = path.join(tmp, 'release');
  // Explicit runtime source accommodates this worktree's inherited node_modules symlink.
  const runtimeRoot = await fs.realpath(path.join(root, 'node_modules/three/build'));
  await stagePlayable({ root, registry, destination: dest, runtimeRoot });
  const server = await createPlayableServer({ root: path.join(dest, 'public'), registry });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const file of publicFiles(registry)) {
    const response = await fetch(`${base}/${file}`);
    assert.equal(response.status, 200, file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(path.join(root, file)));
  }
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const game of registry.games) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/games/${game.id}/`);
    await page.waitForLoadState('networkidle');
    assert.deepEqual(errors, [], game.id);
    assert.ok(await page.locator('canvas').count(), game.id);
    await page.close();
  }
});
