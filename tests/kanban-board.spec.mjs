import { test, expect } from '@playwright/test';

const columnNames = ['triage', 'todo', 'ready', 'running', 'blocked', 'done'];

test('kanban operator app loads fixture board in read-only safe mode', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/apps/kanban');
  await expect(page.getByRole('heading', { name: 'Hermes Kanban Board' })).toBeVisible();
  await expect(page.getByTestId('summary-total')).toContainText('2');
  await expect(page.getByTestId('summary-triage')).toContainText('1');
  await expect(page.getByTestId('summary-active')).toContainText('2');
  await expect(page.getByTestId('last-refresh')).toContainText(/last refresh/i);
  await expect(page.getByRole('button', { name: /refresh board/i })).toBeEnabled();
  await expect(page.getByTestId('safety-banner')).toContainText(/read-only/i);
  await expect(page.getByTestId('safety-banner')).toContainText(/writes are disabled/i);

  for (const column of columnNames) {
    await expect(page.getByTestId(`kanban-column-${column}`)).toBeVisible();
  }

  const triageColumn = page.getByTestId('kanban-column-triage');
  await expect(triageColumn.getByText('Operator review sample')).toBeVisible();
  await expect(page.getByText('Draft app-preview filters')).toBeVisible();
  await expect(triageColumn.getByText('default')).toBeVisible();
  await expect(triageColumn.getByText('Merquery')).toBeVisible();
  await expect(triageColumn.getByText('priority 5')).toBeVisible();
  await expect(triageColumn.getByText(/needs operator review before ready/i)).toBeVisible();

  await page.getByRole('button', { name: /open operator review sample/i }).click();
  await expect(page.getByTestId('task-drawer')).toBeVisible();
  await expect(page.getByTestId('task-drawer')).toContainText('Do not auto-promote this card.');
  await expect(page.getByTestId('task-drawer')).toContainText('comments: 2');
  await expect(page.getByTestId('task-drawer')).toContainText('children: 1');
  await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Comments & Events' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Runs' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Log' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Context' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Diagnostics' })).toBeVisible();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('Task id');
  await page.getByRole('tab', { name: 'Comments & Events' }).click();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('Operator note: keep in triage.');
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('created');
  await page.getByRole('tab', { name: 'Runs' }).click();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('No worker runs yet.');
  await page.getByRole('tab', { name: 'Context' }).click();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('Full worker context would appear here.');

  await expect(page.getByRole('button', { name: /create triage card/i })).toBeDisabled();
  await expect(page.getByTestId('create-status')).toContainText(/read-only/i);
  await expect(page.getByRole('button', { name: /dispatch/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /move to ready/i })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('kanban operator app filters cards client-side', async ({ page }) => {
  await page.goto('/apps/kanban/');
  await page.getByLabel('Search cards').fill('filters');
  await expect(page.getByText('Draft app-preview filters')).toBeVisible();
  await expect(page.getByText('Operator review sample')).toHaveCount(0);
  await expect(page.getByTestId('filter-count')).toContainText('1 of 2');

  await page.getByLabel('Filter by assignee').selectOption('Merquery');
  await expect(page.getByText('No cards match current filters.')).toBeVisible();
  await expect(page.getByTestId('filter-count')).toContainText('0 of 2');

  await page.getByLabel('Search cards').fill('');
  await expect(page.getByText('Operator review sample')).toBeVisible();
  await expect(page.getByText('Draft app-preview filters')).toHaveCount(0);
  await expect(page.getByTestId('filter-count')).toContainText('1 of 2');
});

test('kanban bridge exposes fixture board without dispatcher controls', async ({ request }) => {
  const health = await request.get('/api/kanban/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({
    ok: true,
    service: 'agent-apps-kanban-bridge',
    mode: 'fixture',
    readOnly: true,
    writesEnabled: false
  });

  const board = await request.get('/api/kanban/board?board=default');
  expect(board.ok()).toBe(true);
  const payload = await board.json();
  expect(payload.board).toBe('default');
  expect(payload.readOnly).toBe(true);
  expect(payload.summary).toMatchObject({
    total: 2,
    active: 2,
    by_status: { triage: 1, todo: 1, ready: 0, running: 0, blocked: 0, done: 0 },
    by_assignee: { DrClawBotNik: 1, Merquery: 1 },
    by_tenant: { 'agent-apps': 1, default: 1 }
  });
  expect(payload.columns.map((column) => column.name)).toEqual(columnNames);
  expect(payload.columns.find((column) => column.name === 'triage').tasks[0]).toMatchObject({
    id: 't_fixture_triage_001',
    title: 'Operator review sample',
    status: 'triage',
    assignee: 'Merquery',
    tenant: 'default',
    priority: 5
  });
  expect(JSON.stringify(payload)).not.toMatch(/dispatch|ready-promotion|kanban\.db|\/home\//i);
});

test('kanban bridge exposes fixture task operator detail endpoints', async ({ request }) => {
  const taskId = 't_fixture_triage_001';

  const show = await request.get(`/api/kanban/tasks/${taskId}/show?board=default`);
  expect(show.ok()).toBe(true);
  const showPayload = await show.json();
  expect(showPayload).toMatchObject({
    board: 'default',
    task: { id: taskId, title: 'Operator review sample' },
    dependencies: { parents: [], children: ['t_fixture_todo_002'] }
  });
  expect(showPayload.comments).toEqual(expect.arrayContaining([{ author: 'Merquery', text: 'Operator note: keep in triage.', created_at: 1778089320 }]));
  expect(showPayload.events).toEqual(expect.arrayContaining([{ event: 'created', actor: 'fixture', created_at: 1778089200, summary: 'Fixture task created for operator board tests.' }]));

  const runs = await request.get(`/api/kanban/tasks/${taskId}/runs?board=default`);
  expect(runs.ok()).toBe(true);
  await expect(runs.json()).resolves.toMatchObject({ task_id: taskId, runs: [] });

  const log = await request.get(`/api/kanban/tasks/${taskId}/log?board=default`);
  expect(log.ok()).toBe(true);
  await expect(log.json()).resolves.toMatchObject({ task_id: taskId, log: 'No worker log yet.' });

  const context = await request.get(`/api/kanban/tasks/${taskId}/context?board=default`);
  expect(context.ok()).toBe(true);
  await expect(context.json()).resolves.toMatchObject({ task_id: taskId, context: expect.stringContaining('Full worker context') });

  const diagnostics = await request.get(`/api/kanban/tasks/${taskId}/diagnostics?board=default`);
  expect(diagnostics.ok()).toBe(true);
  await expect(diagnostics.json()).resolves.toMatchObject({ task_id: taskId, diagnostics: [] });
});

test('kanban write routes for links and recovery actions stay locked in fixture mode', async ({ request }) => {
  const action = await request.post('/api/kanban/tasks/t_fixture_triage_001/actions?board=default', {
    data: { action: 'reassign', assignee: 'frontend-eng', reclaim: true, reason: 'fixture recovery smoke' }
  });
  expect(action.status()).toBe(423);

  const link = await request.post('/api/kanban/links?board=default', {
    data: { action: 'link', parent_id: 't_fixture_triage_001', child_id: 't_fixture_todo_002' }
  });
  expect(link.status()).toBe(423);
});

test('preview service serves kanban app assets while denying private and bridge source paths', async ({ request }) => {
  const noSlash = await request.get('/apps/kanban', { maxRedirects: 0 });
  expect(noSlash.status()).toBe(308);
  expect(noSlash.headers().location).toBe('/apps/kanban/');

  await expect((await request.get('/apps/kanban/')).status()).toBe(200);
  await expect((await request.get('/apps/kanban/app.js')).status()).toBe(200);
  await expect((await request.get('/apps/kanban/styles.css')).status()).toBe(200);

  for (const privatePath of [
    '/.git/config',
    '/package.json',
    '/scripts/kanban-bridge.mjs',
    '/apps/.secret',
    '/apps/kanban/.env',
    '/~/.hermes/kanban.db'
  ]) {
    const response = await request.get(privatePath);
    expect(response.status(), `${privatePath} should not be publicly served`).not.toBe(200);
  }

  const health = await request.get('/healthz');
  const body = await health.text();
  expect(body).not.toMatch(/repoRoot|kanban\.db|\/home\/merquery|\.hermes/i);
});
