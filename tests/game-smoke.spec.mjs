import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

async function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('agent game arcade loads manifest and exposes fps gauntlet', async ({ page }) => {
  const errors = await collectConsoleErrors(page);
  await page.goto('/games/arcade/');
  await expect(page.getByRole('heading', { name: 'Agent Game Arcade' })).toBeVisible();
  await expect(page.getByTestId('game-card-fps-gauntlet')).toBeVisible();
  await expect(page.getByRole('link', { name: /play neon breach/i })).toHaveAttribute('href', '../fps-gauntlet/');
  await expect(page.getByTestId('game-card-fps-gauntlet').getByText('npm test')).toBeVisible();
  await page.screenshot({ path: 'games/artifacts/arcade-smoke.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('fps gauntlet starts, accepts controls, shoots drones, and updates hud', async ({ page }) => {
  const errors = await collectConsoleErrors(page);
  await page.goto('/games/fps-gauntlet/');
  await expect(page.getByRole('heading', { name: 'Neon Breach' })).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('0');

  await page.getByRole('button', { name: /start breach/i }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state', 'running');

  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');

  const shots = Number(await page.locator('#game-root').getAttribute('data-shots-fired'));
  const enemyCount = Number(await page.locator('#game-root').getAttribute('data-enemy-count'));
  const health = Number(await page.getByTestId('health').textContent());

  expect(shots).toBeGreaterThan(0);
  expect(enemyCount).toBeGreaterThan(0);
  expect(health).toBeGreaterThan(0);
  await page.screenshot({ path: 'games/artifacts/fps-gauntlet-smoke.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('manifest is valid and has required arcade metadata', async () => {
  const raw = await fs.readFile('games/manifest.json', 'utf8');
  const manifest = JSON.parse(raw);
  expect(manifest.games).toEqual(expect.any(Array));
  const fps = manifest.games.find((game) => game.id === 'fps-gauntlet');
  expect(fps).toMatchObject({
    id: 'fps-gauntlet',
    title: 'Neon Breach',
    type: 'fps',
    playUrl: './fps-gauntlet/',
    testCommand: 'npm test'
  });
  expect(fps.manualChecklist.length).toBeGreaterThanOrEqual(5);
});
