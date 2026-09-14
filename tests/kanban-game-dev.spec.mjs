import { test, expect } from '@playwright/test';

const game = { id: 'runner', title: 'Runner', summary: 'Jump and run', previewUrl: '/games/runner/', screenshotUrl: null, videoUrl: '/games/artifacts/runner.mp4', testCommand: 'npm test -- runner', manualChecklist: ['Jump over a gap', 'Restart after losing'] };
async function mock(page, options = {}) {
  const writes = [];
  const tasks = [{ id: 'general', title: 'General task', status: 'review' }, { id: 'game', title: 'Jump tuning', status: 'review', game_dev: { game_id: 'runner', milestone: 'MVP', discipline: 'gameplay' } }];
  await page.route('**/api/kanban/**', async route => {
    const url = new URL(route.request().url());
    const board = url.searchParams.get('board') || 'default';
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON(); writes.push({ board, payload });
      tasks.push({ ...payload, id: 'created', status: 'triage' });
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith('/games')) {
      if (options.catalog) return options.catalog(route);
      return route.fulfill({ json: { games: [game] } });
    }
    if (options.board && url.pathname.endsWith('/board') && board === 'second') return options.board(route);
    const json = url.pathname.endsWith('/boards') ? { boards: [{ slug: 'default' }, { slug: 'second' }] }
      : url.pathname.endsWith('/assignees') ? { assignees: [] }
      : url.pathname.endsWith('/status') ? { executionEnabled: true }
      : url.pathname.endsWith('/show') ? { board, task: tasks[1], comments: [], events: [] }
      : { board, mode: 'live', writesEnabled: true, readOnly: false, columns: [{ name: 'review', tasks }], summary: { total: tasks.length } };
    return route.fulfill({ json });
  });
  return writes;
}

test('intentional game creation appends acceptance criteria without silently replacing drafts', async ({ page }) => {
  const writes = await mock(page);
  await page.goto('/apps/kanban/?board=second&view=game-dev');
  await page.locator('#create-task-form [name=title]').fill('New jump');
  await page.locator('#create-task-form [name=body]').fill('Keep my draft');
  await page.getByLabel('Task milestone', { exact: true }).fill('MVP');
  await page.getByLabel('Task discipline', { exact: true }).selectOption('gameplay');
  await page.getByLabel('Task template').selectOption('bug');
  await expect(page.locator('#create-task-form [name=body]')).toHaveValue('Keep my draft');
  await page.getByRole('button', { name: 'Append template' }).click();
  await expect(page.locator('#create-task-form [name=body]')).toHaveValue(/Keep my draft.*Acceptance criteria/s);
  await page.getByRole('button', { name: 'Create game task', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ board: 'second', payload: { title: 'New jump', game_dev: { game_id: 'runner', milestone: 'MVP', discipline: 'gameplay' } } });
  await expect(page.getByRole('button', { name: 'Open New jump' })).toBeVisible();
  await page.getByRole('link', { name: 'General', exact: true }).click();
  await page.locator('#create-task-form [name=title]').fill('Ordinary');
  await page.getByRole('button', { name: 'Create triage card', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].payload).not.toHaveProperty('game_dev');
});

test('catalog failure and delayed board response never expose stale game controls', async ({ page }) => {
  let release;
  await mock(page, { catalog: route => route.fulfill({ status: 500, json: { error: 'Offline' } }), board: async route => { await new Promise(resolve => { release = resolve; }); await route.fulfill({ json: { board: 'second', writesEnabled: true, readOnly: false, columns: [] } }); } });
  await page.goto('/apps/kanban/?view=game-dev');
  await expect(page.locator('#game-catalog-status')).toContainText('Game catalog unavailable');
  await expect(page.getByRole('button', { name: 'Create game task', exact: true })).toBeDisabled();
  await page.locator('#board-selector').selectOption('second');
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator('#create-task-form [name=title]')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Claim task', exact: true })).toBeDisabled();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'General', exact: true }).click();
  await page.locator('#board-selector').selectOption('default');
  release();
  await expect(page.getByRole('button', { name: 'Open General task' })).toBeVisible();
  await expect(page.locator('#game-dev-panel')).toBeHidden();
  await expect(page.locator('#board-selector')).toHaveValue('default');
});

test('milestone validation blocks invalid Game Dev submissions but not General', async ({ page }) => {
  const writes = await mock(page);
  await page.goto('/apps/kanban/?view=game-dev');
  await page.locator('#create-task-form [name=title]').fill('Validation task');
  const milestone = page.getByLabel('Task milestone', { exact: true });
  for (const value of ['', '   ', 'bad`tick', 'bad\u0001control', '\tMVP', 'x'.repeat(121)]) {
    // Assign directly to cover overlength/control values beyond typing constraints.
    await milestone.evaluate((input, value) => { input.value = value; }, value);
    await page.getByRole('button', { name: 'Create game task', exact: true }).click();
    await expect(page.getByTestId('create-status')).toContainText('milestone must be 1-120 characters without controls or backticks', { timeout: 1000 });
    expect(writes).toHaveLength(0);
  }
  let statusAtPost;
  await page.route('**/api/kanban/tasks?*', async route => {
    statusAtPost = await page.getByTestId('create-status').evaluate(el => ({ text: el.textContent, error: el.classList.contains('is-error') }));
    await route.fallback();
  });
  await milestone.fill('  MVP  ');
  await page.getByRole('button', { name: 'Create game task', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(statusAtPost).toEqual({ text: 'Creating card on default…', error: false });
  expect(writes[0].payload.game_dev.milestone).toBe('MVP');
  await expect(page.getByTestId('create-status')).not.toHaveClass(/is-error/);
  await page.getByRole('link', { name: 'General', exact: true }).click();
  await page.locator('#create-task-form [name=title]').fill('Ordinary without milestone');
  await page.getByRole('button', { name: 'Create triage card', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].payload).not.toHaveProperty('game_dev');
});

for (const returnToA of [false, true]) {
  test(`delayed create preserves newer game draft${returnToA ? ' after A-B-A selection' : ' after A-B selection'}`, async ({ page }) => {
    await mock(page, { catalog: route => route.fulfill({ json: { games: [game, { ...game, id: 'puzzle', title: 'Puzzle' }] } }) });
    let release;
    let payload;
    await page.route('**/api/kanban/tasks?*', async route => {
      payload = route.request().postDataJSON();
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto('/apps/kanban/?view=game-dev');
    const title = page.locator('#create-task-form [name=title]');
    const body = page.locator('#create-task-form [name=body]');
    await title.fill('Original A task');
    await body.fill('Original A body');
    await page.getByLabel('Task milestone', { exact: true }).fill('MVP');
    await page.getByRole('button', { name: 'Create game task', exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.locator('#game-selector').selectOption('puzzle');
    if (returnToA) await page.locator('#game-selector').selectOption('runner');
    await title.fill('New selected-game draft');
    await body.fill('Do not erase this new body');
    await page.getByLabel('Task milestone', { exact: true }).fill('Next');
    const status = await page.getByTestId('create-status').textContent();
    const completed = page.waitForResponse(response => response.request().method() === 'POST');
    release();
    await completed;
    // Let the real async submit handler consume the response and any refresh finish.
    await page.waitForTimeout(200);
    expect(payload).toMatchObject({ title: 'Original A task', body: 'Original A body', game_dev: { game_id: 'runner', milestone: 'MVP' } });
    await expect(title).toHaveValue('New selected-game draft', { timeout: 1000 });
    await expect(body).toHaveValue('Do not erase this new body');
    await expect(page.getByLabel('Task milestone', { exact: true })).toHaveValue('Next');
    await expect(page.locator('#game-selector')).toHaveValue(returnToA ? 'runner' : 'puzzle');
    await expect(page.getByTestId('create-status')).toHaveText(status);
    await expect(page.locator('#drawer')).toBeHidden();
  });
}

test('mobile catalog and templates remain within viewport', async ({ page }) => {
  await mock(page, { catalog: route => route.fulfill({ json: { games: [{ ...game, testCommand: 'longcommand'.repeat(70), manualChecklist: ['evidence/'.repeat(100)] }] } }) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apps/kanban/?view=game-dev');
  await expect(page.getByRole('link', { name: 'Play build' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('late catalog cannot replace newer board selection; filters reuse the management drawer', async ({ page }) => {
  let release; let calls = 0;
  await mock(page, { catalog: async route => {
    if (++calls === 1) { await new Promise(resolve => { release = resolve; }); return route.fulfill({ json: { games: [{ ...game, title: 'Stale catalog' }] } }); }
    return route.fulfill({ json: { games: [game] } });
  } });
  await page.goto('/apps/kanban/?view=game-dev');
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#board-selector').selectOption('second');
  await expect(page.getByRole('link', { name: 'Play build' })).toBeVisible();
  const completed = page.waitForResponse(response => response.url().endsWith('/games'));
  release(); await completed;
  await expect(page.locator('#game-details')).not.toContainText('Stale catalog');
  await page.locator('#game-milestone-filter').fill('later');
  await expect(page.locator('#board')).toContainText('No game tasks');
  await page.locator('#game-milestone-filter').fill('MVP');
  await page.locator('#game-discipline-filter').selectOption('art');
  await expect(page.locator('#board')).toContainText('No game tasks');
  await page.locator('#game-discipline-filter').selectOption('gameplay');
  await page.getByRole('button', { name: 'Open Jump tuning' }).click();
  await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeVisible();
  await expect(page.getByTestId('drawer-tab-panel')).toContainText('review');
});

test('Game Dev deep link filters cards, presents evidence and preserves General visibility', async ({ page }) => {
  await mock(page);
  await page.goto('/apps/kanban/?board=default&view=game-dev');
  await expect(page.getByRole('link', { name: 'Play build', exact: true })).toHaveAttribute('href', '/games/runner/');
  await expect(page.locator('#game-details')).toContainText('Screenshot unavailable');
  await expect(page.locator('#game-details')).toContainText('npm test -- runner');
  await expect(page.locator('#game-details')).toContainText('Jump over a gap');
  await expect(page.getByRole('button', { name: 'Open General task' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Jump tuning' })).toContainText('MVP');
  await page.getByRole('link', { name: 'General', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open General task' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Jump tuning' })).toBeVisible();
  await expect(page).toHaveURL(/board=default/);
});
