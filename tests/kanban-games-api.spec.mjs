import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { handleKanbanRequest } from '../scripts/kanban-bridge.mjs';

// Fixture paths must remain repo-local; clean checkouts have no output/tmp yet.
test.beforeEach(async () => {
  await fs.mkdir(path.join(repoRoot, 'output/tmp'), { recursive: true });
});

test('validated game metadata persists in body with existing creation fields and reads back publicly', async () => {
  const saved = { ...process.env };
  const dir = await fs.mkdtemp(path.join(repoRoot, 'output/tmp/game-dev-mock-'));
  const cli = path.join(dir, 'hermes');
  try {
    await fs.writeFile(cli, `#!/usr/bin/env node\nconst args=process.argv.slice(2);const get=k=>args[args.indexOf(k)+1]; console.log(JSON.stringify({id:'mock-game',title:args[args.indexOf('create')+1],body:get('--body'),status:'triage',args}));\n`);
    await fs.chmod(cli, 0o700);
    Object.assign(process.env, { KANBAN_MODE: 'live', KANBAN_READONLY: '0', HERMES_BIN: cli });
    const game_dev = { game_id: 'snowdown', milestone: 'Playable co-op', discipline: 'gameplay' };
    const result = await api('/api/kanban/tasks?board=second', { title: 'Co-op', body: '  Preserve my body\n', game_dev, assignee: 'worker', tenant: 'games', priority: 8, workspace: 'scratch', parents: ['parent1'], skills: ['testing'], max_runtime: '5m', idempotency_key: 'unique' });
    expect(result.code).toBe(201);
    expect(result.data.task.game_dev).toEqual(game_dev);
    expect(result.data.task.body).toBe('  Preserve my body\n\n\n```game-dev\n' + JSON.stringify(game_dev) + '\n```');
    const args = result.data.task.args;
    for (const token of ['second', '--triage', '--assignee', 'worker', '--tenant', 'games', '--priority', '8', '--parent', 'parent1', '--skill', 'testing', '--max-runtime', '5m', '--idempotency-key', 'unique']) expect(args).toContain(token);
    const { parseGameDev, encodeGameDev } = await import('../scripts/kanban-games.mjs');
    expect(parseGameDev(result.data.task.body)).toEqual(game_dev);
    expect(encodeGameDev('original', game_dev)).toContain('original\n\n```game-dev\n');
    for (const body of ['legacy', '```game-dev\nnot json\n```', '```game-dev\n{}\n```', result.data.task.body + '\n' + result.data.task.body]) expect(parseGameDev(body)).toBeNull();
    for (const invalid of [null, [], {}, { ...game_dev, game_id: 'unknown' }, { ...game_dev, milestone: 'x'.repeat(121) }, { ...game_dev, milestone: '' }, { ...game_dev, discipline: 'ops' }]) {
      expect((await api('/api/kanban/tasks', { title: 'Invalid', game_dev: invalid })).code).toBe(400);
    }
    expect((await api('/api/kanban/tasks', { title: 'Forged', body: result.data.task.body, game_dev })).code).toBe(400);
    expect((await api('/api/kanban/tasks', { title: 'Body-only forgery', body: result.data.task.body })).code).toBe(400);
    expect((await api('/api/kanban/tasks', { title: 'Too long', body: 'x'.repeat(7990), game_dev })).code).toBe(400);
    const legacy = await api('/api/kanban/tasks', { title: 'Legacy', body: 'original' });
    expect(legacy.code).toBe(201);
    expect(legacy.data.task.body).toBe('original');
    expect(legacy.data.task.args).not.toContain('--game-dev');
  } finally { process.env = saved; await fs.rm(dir, { recursive: true, force: true }); }
});

test('URL projection rejects unsafe paths and missing or symlinked evidence', async () => {
  const { resolveGameUrl, loadGames } = await import('../scripts/kanban-games.mjs');
  const dir = await fs.mkdtemp(path.join(repoRoot, 'output/tmp/game-dev-links-'));
  try {
    await fs.mkdir(path.join(dir, 'games/artifacts'), { recursive: true });
    await fs.writeFile(path.join(dir, 'outside.png'), 'test fixture');
    await fs.symlink(path.join(dir, 'outside.png'), path.join(dir, 'games/artifacts/leak.png'));
    await fs.writeFile(path.join(dir, 'games/artifacts/ok.png'), 'test fixture');
    for (const input of ['javascript:alert(1)', 'data:text/plain,x', '//evil.test/x', 'https://evil.test/games/x', '/apps/kanban/', '/games/../scripts/a', '/games/%2e%2e/scripts/a', '/games/%2f..%2fscripts/a', '/games/\\evil', '/games/artifacts/%00.png']) expect(await resolveGameUrl(input, dir)).toBeNull();
    for (const input of ['./artifacts/missing.png', './artifacts/leak.png']) expect(await resolveGameUrl(input, dir, { evidence: true })).toBeNull();
    expect(await resolveGameUrl('./artifacts/ok.png', dir, { evidence: true })).toBe('https://game-preview.ninjaprivacy.org/games/artifacts/ok.png');
    await fs.writeFile(path.join(dir, 'games/manifest.json'), JSON.stringify({ games: [{ id: 'test', playUrl: './test/', screenshot: './artifacts/ok.png', artifacts: { latestScreenshot: './artifacts/missing.png', latestVideo: './artifacts/missing.webm' } }] }));
    expect((await loadGames(dir))[0]).toMatchObject({ screenshotUrl: 'https://game-preview.ninjaprivacy.org/games/artifacts/ok.png', videoUrl: null });
    await fs.rm(path.join(dir, 'games/artifacts'), { recursive: true });
    await fs.symlink(dir, path.join(dir, 'games/artifacts'));
    expect(await resolveGameUrl('./artifacts/outside.png', dir, { evidence: true })).toBeNull();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('fixture board and task details expose safe public metadata, legacy null, and retain write guard', async () => {
  const saved = { ...process.env };
  const dir = await fs.mkdtemp(path.join(repoRoot, 'output/tmp/game-dev-fixture-'));
  try {
    const metadata = { game_id: 'snowdown', milestone: 'QA', discipline: 'qa' };
    const body = 'Notes\n\n```game-dev\n' + JSON.stringify(metadata) + '\n```';
    const tasks = [{ id: 'game', body }, { id: 'legacy', body: 'Notes' }, { id: 'bad', body: '```game-dev\n{}\n```' }];
    await fs.writeFile(path.join(dir, 'board.json'), JSON.stringify({ columns: [{ name: 'triage', tasks }] }));
    Object.assign(process.env, { KANBAN_MODE: 'fixture', KANBAN_READONLY: '0', KANBAN_FIXTURE_PATH: path.relative(repoRoot, path.join(dir, 'board.json')) });
    const board = await api('/api/kanban/board');
    expect(board.data.columns.flatMap(c => c.tasks).map(t => t.game_dev)).toEqual([metadata, null, null]);
    expect((await api('/api/kanban/tasks/game/show')).data.task.game_dev).toEqual(metadata);
    expect((await api('/api/kanban/tasks/game')).data.task.body).toBe(body);
    expect((await api('/api/kanban/tasks', { title: 'No write', game_dev: metadata })).code).toBe(423);
  } finally { process.env = saved; await fs.rm(dir, { recursive: true, force: true }); }
});

const repoRoot = path.resolve('.');
async function api(url, payload, root = repoRoot) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
  req.url = url; req.method = payload === undefined ? 'GET' : 'POST'; req.headers = { host: 'localhost' };
  let code, data;
  await handleKanbanRequest(req, { writeHead(value) { code = value; }, end(value) { data = JSON.parse(value); } }, { repoRoot: root });
  return { code, data };
}

test('games API projects the real manifest without serving games on apps', async () => {
  const manifest = JSON.parse(await fs.readFile('games/manifest.json', 'utf8'));
  const result = await api('/api/kanban/games');
  expect(result.code).toBe(200);
  expect(result.data.games.map(g => g.id)).toEqual(manifest.games.map(g => g.id));
  for (const game of result.data.games) {
    expect(Object.keys(game).sort()).toEqual(['id', 'title', 'summary', 'status', 'previewUrl', 'screenshotUrl', 'videoUrl', 'testCommand', 'manualChecklist', 'nextIdeas'].sort());
    expect(game.previewUrl).toBe(`https://game-preview.ninjaprivacy.org/games/${game.id}/`);
    for (const field of ['screenshotUrl', 'videoUrl']) if (game[field]) {
      const url = new URL(game[field]);
      expect(url.origin).toBe('https://game-preview.ninjaprivacy.org');
      expect((await fs.stat(path.join(repoRoot, url.pathname))).isFile()).toBe(true);
    }
  }
});
