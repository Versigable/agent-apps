import { test, expect } from '@playwright/test';

// Run in isolation: CI=true KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4315
// npx playwright test tests/game-dev-discovery.spec.mjs --workers=1
// --output=output/tmp/game-dev-discovery-tests --reporter=list

test('app registry advertises Game Dev as a view of the existing Kanban store', async ({ request }) => {
  const response = await request.get('/apps/manifest.json');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.surface.publicBaseUrl).toBe('https://app-preview.ninjaprivacy.org');
  expect(new Set(manifest.apps.map(app => app.id)).size).toBe(manifest.apps.length);
  const gameDev = manifest.apps.find(app => app.id === 'game-dev');
  expect(gameDev).toBeDefined();
  expect(gameDev).toMatchObject({
    title: 'Game Dev',
    type: 'operator-workflow',
    launchUrl: '/apps/kanban/?view=game-dev',
    previewPath: '/apps/kanban/?view=game-dev',
    previewUrl: 'https://app-preview.ninjaprivacy.org/apps/kanban/?view=game-dev',
    healthPath: '/api/kanban/health',
    dataPath: '/api/kanban/board?board=default'
  });
  for (const app of manifest.apps) {
    for (const field of ['id', 'title', 'type', 'status', 'agent', 'model', 'summary', 'testCommand']) {
      expect(typeof app[field], field).toBe('string');
      expect(app[field].length, field).toBeGreaterThan(0);
    }
    for (const field of ['safetyPosture', 'operatorChecklist', 'nextIdeas']) {
      expect(Array.isArray(app[field]), field).toBeTruthy();
      for (const entry of app[field]) expect(typeof entry).toBe('string');
    }
    expect(new URL(app.launchUrl, 'https://app-preview.ninjaprivacy.org/apps/').href).toBe(app.previewUrl);
  }
  expect(gameDev.summary).toMatch(/same.*(backend|store)/i);
  expect(gameDev.safetyPosture.join(' ')).toMatch(/no separate board|not a separate board/i);
  expect(gameDev.safetyPosture.join(' ')).toMatch(/no new statuses/i);
  expect(gameDev.safetyPosture.join(' ')).toMatch(/not.*(guarantee|verified)|no guaranteed/i);
});

test('Kanban listing describes approved writes and backend-defined statuses', async ({ request }) => {
  const manifest = await (await request.get('/apps/manifest.json')).json();
  const kanban = manifest.apps.find(app => app.id === 'kanban');
  const safety = kanban.safetyPosture.join(' ');
  const checklist = kanban.operatorChecklist.join(' ');
  expect(safety).toMatch(/approved.*writes/i);
  expect(checklist).toMatch(/review/);
  expect(checklist).toMatch(/scheduled/);
  expect(checklist).toMatch(/unknown|backend/);
  expect(checklist).not.toMatch(/six columns|live\/read-only/i);
  expect(safety).toMatch(/Dispatch\/claim require explicit confirmation/);
  expect(safety).toMatch(/No automatic ready promotion/);
});

test('launcher preserves Game Dev query when opening the same Kanban app', async ({ page }) => {
  await page.goto('/apps/');
  const gameDev = page.getByTestId('app-card-game-dev');
  const open = gameDev.getByRole('link', { name: 'Open Game Dev', exact: true });
  await expect(open).toHaveAttribute('href', '/apps/kanban/?view=game-dev');
  await expect(gameDev.getByRole('link', { name: 'Public preview for Game Dev' })).toHaveAttribute('href', 'https://app-preview.ninjaprivacy.org/apps/kanban/?view=game-dev');
  await expect(page.getByTestId('app-card-kanban').getByRole('link', { name: 'Open Hermes Kanban Board', exact: true })).toHaveAttribute('href', './kanban/');
  await open.click();
  await expect(page).toHaveURL(/\/apps\/kanban\/\?view=game-dev$/);
  expect(await page.locator('body').innerText()).not.toContain('forbidden');
});
