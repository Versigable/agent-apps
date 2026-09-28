import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const moduleUrl = new URL('../scripts/playable-service.mjs', import.meta.url);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'public-playable-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'games/demo'), { recursive: true });
  await fs.writeFile(path.join(root, 'games/demo/index.html'), '<h1>Fixture game</h1>');
  const registry = { games: [{ id: 'demo', title: '<script>bad</script>', files: ['index.html'] }], runtime: [] };
  assert.ok(await fs.stat(moduleUrl).catch(() => false), 'static-only entrypoint must exist');
  const { createPlayableServer } = await import(moduleUrl);
  const server = await createPlayableServer({ root, registry });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (url, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method }, res => {
      let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
  return { root, registry, request };
}

test('only GET/HEAD and canonical allowlisted paths; no private responses', async t => {
  const { request, root } = await fixture(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE']) {
    assert.equal((await request('/games/demo/', method)).status, 405);
    assert.equal((await request('/healthz', method)).status, 405);
  }
  for (const url of ['/games/dev/', '/api/kanban/board', '/api/game-dev/games', '/apps/kanban/', '/.git/config', '/package.json', '/scripts/playable-service.mjs', '/native/build.zip', '/games/demo/README.md', '/games/unregistered/', '/games/demo/../demo/index.html', '/games/%64emo/', '/games/demo/%2e%2e/dev/', '/games/demo//index.html', '/games/demo/\\\\index.html', '/games/demo/%00', '/games/demo/%', '//games/demo/']) {
    const result = await request(url);
    assert.equal(result.status, 404, url);
    assert.equal(result.body, 'Not found');
    assert.ok(!result.body.includes(root));
    assert.equal(result.headers['access-control-allow-origin'], undefined);
  }
});

test('symlink files, directory escapes and hardlinks are never served', async t => {
  const { request, root } = await fixture(t);
  const secret = path.join(root, 'secret');
  await fs.writeFile(secret, 'PRIVATE FIXTURE');
  const file = path.join(root, 'games/demo/index.html');
  await fs.unlink(file);
  await fs.symlink(secret, file);
  assert.equal((await request('/games/demo/')).status, 404);
  await fs.unlink(file);
  await fs.link(secret, file);
  assert.equal((await request('/games/demo/')).status, 404);
  await fs.rm(path.join(root, 'games/demo'), { recursive: true });
  await fs.mkdir(path.join(root, 'private'));
  await fs.writeFile(path.join(root, 'private/index.html'), 'PRIVATE FIXTURE');
  await fs.symlink(path.join(root, 'private'), path.join(root, 'games/demo'));
  assert.equal((await request('/games/demo/')).status, 404);
});

test('registry rejects reserved namespaces, unsafe IDs and unapproved file types', async () => {
  const { createPlayableServer } = await import(moduleUrl);
  for (const game of [{ id: 'dev', files: ['index.html'] }, { id: '../apps', files: ['index.html'] }, { id: 'demo', files: ['../../secret.js'] }, { id: 'demo', files: ['README.md'] }]) {
    await assert.rejects(createPlayableServer({ root: '/tmp', registry: { games: [{ title: 'Fixture', ...game }], runtime: [] } }));
  }
  await assert.rejects(createPlayableServer({ root: '/tmp', registry: { games: [], runtime: ['scripts/secret.js'] } }));
});

test('registered game and generated escaped launcher work over HTTP', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/games/demo/')).body, '<h1>Fixture game</h1>');
  assert.equal((await request('/games/demo')).headers.location, '/games/demo/');
  const launcher = await request('/games/arcade/');
  assert.equal(launcher.status, 200);
  assert.match(launcher.body, /&lt;script&gt;/);
  assert.doesNotMatch(launcher.body, /<script>/);
  assert.equal((await request('/games/demo/', 'HEAD')).body, '');
  assert.equal((await request('/healthz')).status, 200);
});
