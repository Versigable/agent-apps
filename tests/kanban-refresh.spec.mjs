import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { handleKanbanRequest } from '../scripts/kanban-bridge.mjs';

test('task board precedes create and execution controls', async ({ page }) => {
  await page.goto('/apps/kanban/');
  await expect(page.getByTestId('summary-total')).toHaveText('2');
  expect(await page.locator('#board').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('#create-task-form')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(await page.locator('#board').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('#dispatch-form')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
});

test('drawer lazy tabs fetch endpoints and reset restores readable mobile board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/tasks/*/log?*', route => route.fulfill({ json: { log: 'Real lazy log' } }));
  await page.route('**/tasks/*/context?*', route => route.fulfill({ status: 500, json: { error: 'Context unavailable' } }));
  await page.goto('/apps/kanban/');
  await page.getByRole('button', { name: /open operator review sample/i }).click();
  await page.getByRole('tab', { name: 'Log', exact: true }).click();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('Real lazy log');
  await page.getByRole('tab', { name: 'Context', exact: true }).click();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('Context unavailable');
  await page.locator('#drawer-close').click();
  await page.getByLabel('Search cards').fill('no-match');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByTestId('filter-count')).toContainText('2 of 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('late board response cannot overwrite new board and refresh errors disable writes', async ({ page }) => {
  let release;
  await page.goto('/apps/kanban/');
  await expect(page.getByTestId('summary-total')).toHaveText('2');
  await page.route('**/api/kanban/board?board=default', async route => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { board: 'default', mode: 'live', readOnly: false, writesEnabled: true, columns: [], summary: { total: 99 } } });
  });
  await page.locator('#refresh-board').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByRole('button', { name: /open operator review sample/i })).toHaveCount(0);
  await page.locator('#board-selector').selectOption('agent-apps');
  await expect(page.getByTestId('bridge-status')).toContainText('board agent-apps');
  release();
  await expect(page.getByTestId('summary-total')).toHaveText('0');
  await page.route('**/api/kanban/board?board=agent-apps', route => route.fulfill({ status: 500, json: { error: 'Read failed' } }));
  await page.locator('#refresh-board').click();
  await expect(page.getByTestId('last-refresh')).toContainText('failed');
  await expect(page.getByRole('button', { name: /create triage card/i })).toBeDisabled();
});

test('fixture mode never advertises writes even when live operator flag is enabled', async () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { KANBAN_MODE: 'fixture', KANBAN_READONLY: '0', KANBAN_EXECUTION_ENABLED: '1' });
    expect((await api('/api/kanban/board')).data).toMatchObject({ writesEnabled: false, readOnly: true });
    expect((await api('/api/kanban/health')).data.executionEnabled).toBe(false);
  } finally { process.env = saved; }
});

test('readonly list resolves custom profile root and enriches counts without join fanout', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kanban-enrich-'));
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { KANBAN_MODE: 'live', HOME: dir, HERMES_HOME: path.join(dir, 'profiles', 'worker') });
    delete process.env.HERMES_KANBAN_HOME;
    delete process.env.HERMES_KANBAN_DB;
    execFileSync('python3', ['-c', `import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.executescript("""create table tasks(id text, title text, status text, priority integer, created_at integer);
insert into tasks values('t1','Enriched','review',5,10);
create table task_comments(task_id text); insert into task_comments values('t1'),('t1');
create table task_links(parent_id text, child_id text); insert into task_links values('p','t1'),('t1','c1'),('t1','c2');
create table task_runs(id integer,task_id text,summary text,started_at integer,ended_at integer);
insert into task_runs values(1,'t1','Older',1,2),(2,'t1','Newest',3,4),(3,'t1','',5,6);
"""); c.commit()`, path.join(dir, 'kanban.db')]);
    const result = await api('/api/kanban/board');
    expect(result.code).toBe(200);
    expect(result.data.columns.find(c => c.name === 'review').tasks[0]).toMatchObject({ latest_summary: 'Newest', comment_count: 2, link_counts: { parents: 1, children: 2 } });
  } finally { process.env = saved; await rm(dir, { recursive: true, force: true }); }
});

test('operator assigns a review task on its captured board and sees authoritative read-back', async ({ page }) => {
  let assignee = 'old-worker';
  const writes = [];
  const task = () => ({ id: 't_review', title: 'Review assignment', status: 'review', assignee });
  await page.route('**/api/kanban/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      writes.push({ path: url.pathname, board: url.searchParams.get('board'), payload: route.request().postDataJSON() });
      assignee = route.request().postDataJSON().assignee;
      return route.fulfill({ json: { ok: true } });
    }
    const payload = url.pathname.endsWith('/boards') ? { boards: [{ slug: 'second', name: 'Second' }] }
      : url.pathname.endsWith('/assignees') ? { assignees: [] }
      : url.pathname.endsWith('/status') ? { executionEnabled: false }
      : url.pathname.endsWith('/show') ? { board: 'second', task: task(), comments: [], events: [] }
      : { board: 'second', mode: 'live', readOnly: false, writesEnabled: true, columns: [{ name: 'review', tasks: [task()] }], summary: { total: 1, by_status: { review: 1 } } };
    return route.fulfill({ json: payload });
  });
  await page.goto('/apps/kanban/?board=second');
  await page.getByRole('button', { name: 'Open Review assignment' }).click();
  const form = page.locator('.drawer-form').filter({ has: page.getByRole('button', { name: 'Assign', exact: true }) });
  await form.getByLabel('Assignee', { exact: true }).fill('new-worker');
  await form.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('new-worker');
  expect(writes).toEqual([{ path: '/api/kanban/tasks/t_review/actions', board: 'second', payload: { action: 'assign', assignee: 'new-worker' } }]);
  await expect(page.getByRole('button', { name: 'Claim task', exact: true })).toBeDisabled();
});


// Deliberately hold POST replies while the operator moves to another view.
for (const action of ['create', 'board', 'dispatch', 'claim', 'assign', 'assign-close', 'assign-refresh']) {
  test(`late ${action} completion cannot replace the selected board or reset its forms`, async ({ page }) => {
    let release;
    const reads = [];
    const writes = [];
    await page.route('**/api/kanban/**', async route => {
      const url = new URL(route.request().url());
      const board = url.searchParams.get('board') || 'default';
      if (route.request().method() === 'POST') {
        writes.push({ board, path: url.pathname });
        await new Promise(resolve => { release = resolve; });
        return route.fulfill({ json: { ok: true, board: { slug: 'new-board' } } });
      }
      reads.push(board);
      const task = { id: 't_review', title: `Card ${board}`, status: 'review' };
      const payload = url.pathname.endsWith('/boards') ? { boards: [{ slug: 'default' }, { slug: 'second' }] }
        : url.pathname.endsWith('/assignees') ? { assignees: [] }
        : url.pathname.endsWith('/status') ? { executionEnabled: true }
        : url.pathname.endsWith('/show') ? { board, task, comments: [], events: [] }
        : { board, mode: 'live', readOnly: false, writesEnabled: true, columns: [{ name: 'review', tasks: [task] }], summary: { total: 1 } };
      return route.fulfill({ json: payload });
    });
    await page.goto('/apps/kanban/');
    await expect(page.getByTestId('summary-total')).toHaveText('1');
    const forms = { create: '#create-task-form', board: '#create-board-form', dispatch: '#dispatch-form', claim: '#claim-form' };
    if (action.startsWith('assign')) {
      await page.getByRole('button', { name: 'Open Card default', exact: true }).click();
      await page.getByRole('button', { name: 'Assign', exact: true }).click();
    } else {
      // Native submit event exercises the handler without unrelated required-field validation.
      await page.locator(forms[action]).evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    }
    await expect.poll(() => Boolean(release)).toBe(true);
    const destination = action === 'assign-close' || action === 'assign-refresh' ? 'default' : 'second';
    if (action === 'assign-close') await page.locator('#drawer-close').click();
    else if (action === 'assign-refresh') await page.locator('#refresh-board').click();
    else await page.locator('#board-selector').selectOption('second');
    await expect(page.getByTestId('bridge-status')).toContainText(`board ${destination}`);
    await expect(page.locator('#create-task-form [name=title]')).toBeEnabled();
    await page.locator('#create-task-form [name=title]').fill('Keep this draft');
    await page.locator('#create-board-form [name=slug]').fill('keep-board-draft');
    const before = reads.length;
    const completed = page.waitForResponse(response => response.request().method() === 'POST');
    release();
    await completed;
    // Wait for the released request to finish and the async handler to settle.
    await expect.poll(() => writes.length).toBe(1);
    await page.waitForTimeout(150);
    await expect(page.locator('#board-selector')).toHaveValue(destination);
    await expect(page.locator('#create-task-form [name=title]')).toHaveValue('Keep this draft');
    await expect(page.locator('#create-board-form [name=slug]')).toHaveValue('keep-board-draft');
    await expect(page.locator('#drawer')).toBeHidden();
    expect(reads.length).toBe(before);
    expect(writes[0].board).toBe('default');
  });
}

async function api(url, body) {
  let code, data;
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { url, method: body ? 'POST' : 'GET', headers: {} });
  await handleKanbanRequest(req, { writeHead(c) { code = c; }, end(s) { data = JSON.parse(s); } }, { repoRoot: process.cwd() });
  return { code, data };
}

test('live list reads SQLite without invoking CLI or promoting scheduled tasks; errors never fall back', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kanban-read-'));
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { KANBAN_MODE: 'live', HERMES_KANBAN_HOME: dir, HERMES_BIN: '/does-not-exist', KANBAN_LIVE_FALLBACK: 'fixture' });
    delete process.env.HERMES_KANBAN_DB;
    const db = path.join(dir, 'kanban.db');
    execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("create table tasks(id text, title text, status text)"); c.executemany("insert into tasks values(?,?,?)", [(s,s,s) for s in ["review","scheduled","future"]]); c.commit()', db]);
    const before = await readFile(db);
    const result = await api('/api/kanban/board?board=default');
    expect(result.code).toBe(200);
    expect(result.data.summary.by_status).toMatchObject({ review: 1, scheduled: 1, future: 1 });
    expect(await readFile(db)).toEqual(before);
    expect((await api('/api/kanban/board?board=missing')).code).toBe(500);
    expect((await api('/api/kanban/boards')).code).toBe(500);
  } finally { process.env = saved; await rm(dir, { recursive: true, force: true }); }
});

test('real CLI-shaped detail and intentional writes remain available with execution locked', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kanban-cli-'));
  const saved = { ...process.env };
  try {
    const bin = path.join(dir, 'mock.mjs'), log = path.join(dir, 'args');
    await writeFile(bin, `#!/usr/bin/env node\nimport fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n'); console.log(JSON.stringify({task:{id:'t_test',status:'review'},latest_summary:'Real summary',comments:[{body:'Real comment'}],events:[{kind:'assigned',payload:{assignee:'worker'}}]}));\n`);
    await chmod(bin, 0o755);
    Object.assign(process.env, { KANBAN_MODE: 'live', KANBAN_READONLY: '0', KANBAN_EXECUTION_ENABLED: '0', HERMES_BIN: bin });
    const detail = await api('/api/kanban/tasks/t_test/show?board=second');
    expect(detail.data.task.latest_summary).toBe('Real summary');
    expect(detail.data.comments[0].text).toBe('Real comment');
    expect(detail.data.events[0].event).toBe('assigned');
    for (const action of ['assign', 'block', 'unblock', 'complete', 'archive', 'edit']) {
      expect((await api('/api/kanban/tasks/t_test/actions?board=second', { action, assignee: 'worker', result: 'verified' })).code).toBe(200);
    }
    expect((await api('/api/kanban/tasks?board=second', { title: 'Intentional task', assignee: 'worker', triage: true })).code).toBe(201);
    expect((await api('/api/kanban/tasks/t_test/claim?board=second', { confirm: 'CLAIM' })).code).toBe(423);
    expect((await api('/api/kanban/execution/dispatch?board=second', { confirm: 'DISPATCH' })).code).toBe(423);
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    expect(calls.every(args => args.slice(0, 3).join(' ') === 'kanban --board second')).toBe(true);
  } finally { process.env = saved; await rm(dir, { recursive: true, force: true }); }
});
