import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`dark controls and responsive board hierarchy at ${width}px`, async ({ page }) => {
    await catalog(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/apps/kanban/?view=game-dev');
    await expect(page.locator('#game-selector')).toBeEnabled();
    const controls = ['#game-selector', '#game-milestone-filter', '#game-discipline-filter', '#create-board-form input', '#dispatch-form input[type=number]', '#create-task-form select', '#create-task-form textarea'];
    for (const selector of controls) {
      const control = page.locator(selector).first();
      const style = await control.evaluate(el => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, radius: parseFloat(s.borderRadius), height: el.getBoundingClientRect().height };
      });
      expect(style.bg).toBe('rgb(8, 13, 24)');
      expect(style.radius).toBeGreaterThanOrEqual(8);
      expect(style.height).toBeGreaterThanOrEqual(40);
    }
    const search = page.getByRole('searchbox', { name: 'Search cards' });
    await search.focus();
    await expect(search).toBeFocused();
    expect(await search.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await page.locator('#dispatch-form input[type=checkbox]').evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(25);
    const boardY = await page.locator('#board').evaluate(el => el.getBoundingClientRect().top + scrollY);
    if (width === 1440) expect(boardY).toBeLessThan(800);
    await page.locator('#game-details summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#game-details summary').click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`kanban-polish-game-dev-${width}.png`), fullPage: false });
    await page.getByRole('link', { name: 'General', exact: true }).click();
    await expect(page.locator('#game-dev-panel')).toBeHidden();
    await expect(page.locator('.task-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await search.fill('Operator review sample');
    await expect(page.locator('.task-card')).toHaveCount(1);
    await search.fill('');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`kanban-polish-general-${width}.png`), fullPage: false });
  });
}

async function catalog(page) {
  const writes = [];
  page.on('request', request => {
    if (request.url().includes('/api/kanban/') && request.method() !== 'GET') writes.push(request.method());
  });
  await page.route('**/api/kanban/games', route => route.fulfill({ json: { games: [
    { id: 'runner', title: 'Runner', summary: 'A compact catalog reference.', previewUrl: '/games/runner/', screenshotUrl: null, videoUrl: null, testCommand: 'npm test -- runner', manualChecklist: ['Jump over a gap', 'evidence/'.repeat(100)] },
    { id: 'puzzle', title: 'Puzzle', previewUrl: '/games/puzzle/', manualChecklist: ['Solve the puzzle'] }
  ] } }));
  return writes;
}

test('catalog reference is keyboard collapsible without hiding Play or implying verified evidence', async ({ page }) => {
  const writes = await catalog(page);
  await page.goto('/apps/kanban/?view=game-dev');
  const reference = page.locator('#game-details details');
  const toggle = reference.locator('summary');
  await expect(toggle).toHaveText('Test command & manual checklist');
  await expect(reference).not.toHaveAttribute('open', '');
  await expect(reference.locator('pre')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Play build', exact: true })).toBeVisible();
  await expect(page.locator('#game-catalog-status')).toContainText('references, not test results');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(reference.locator('pre')).toHaveText('npm test -- runner');
  await expect(reference.getByText('Jump over a gap', { exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(reference.locator('pre')).toBeHidden();
  await page.locator('#game-selector').selectOption('puzzle');
  await expect(page.getByRole('link', { name: 'Play build' })).toHaveAttribute('href', '/games/puzzle/');
  await expect(reference).not.toHaveAttribute('open', '');
  await toggle.click();
  await expect(reference.getByText('Solve the puzzle')).toBeVisible();
  await expect(reference).not.toContainText('Jump over a gap');
  expect(writes).toEqual([]);
});
