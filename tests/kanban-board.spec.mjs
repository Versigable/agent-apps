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
  await expect(page.getByTestId('safety-banner')).toContainText(/read-only/i);
  await expect(page.getByTestId('safety-banner')).toContainText(/writes are disabled/i);

  for (const column of columnNames) {
    await expect(page.getByTestId(`kanban-column-${column}`)).toBeVisible();
  }

  const triageColumn = page.getByTestId('kanban-column-triage');
  await expect(triageColumn.getByText('Operator review sample')).toBeVisible();
  await expect(triageColumn.getByText('default')).toBeVisible();
  await expect(triageColumn.getByText('Merquery')).toBeVisible();
  await expect(triageColumn.getByText('priority 5')).toBeVisible();
  await expect(triageColumn.getByText(/needs operator review before ready/i)).toBeVisible();

  await page.getByRole('button', { name: /open operator review sample/i }).click();
  await expect(page.getByTestId('task-drawer')).toBeVisible();
  await expect(page.getByTestId('task-drawer')).toContainText('Do not auto-promote this card.');
  await expect(page.getByTestId('task-drawer')).toContainText('comments: 2');
  await expect(page.getByTestId('task-drawer')).toContainText('children: 1');

  await expect(page.getByRole('button', { name: /create triage card/i })).toBeDisabled();
  await expect(page.getByTestId('create-status')).toContainText(/read-only/i);
  await expect(page.getByRole('button', { name: /dispatch/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /move to ready/i })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
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
