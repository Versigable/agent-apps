import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const smokeScreenshotDir = 'games/artifacts/test-results/smoke-screenshots';

async function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function saveSmokeScreenshot(page, filename) {
  await fs.mkdir(smokeScreenshotDir, { recursive: true });
  await page.screenshot({ path: `${smokeScreenshotDir}/${filename}`, fullPage: true });
}

test('agent game arcade loads manifest and exposes fps gauntlet', async ({ page }) => {
  const errors = await collectConsoleErrors(page);
  await page.goto('/games/arcade/');
  await expect(page.getByRole('heading', { name: 'Agent Game Arcade' })).toBeVisible();
  const fpsCard = page.getByTestId('game-card-fps-gauntlet');
  await expect(fpsCard).toBeVisible();
  const voidCard = page.getByTestId('game-card-void-garden');
  await expect(voidCard).toBeVisible();
  await expect(page.getByRole('link', { name: /play neon breach/i })).toHaveAttribute('href', '../fps-gauntlet/');
  await expect(page.getByRole('link', { name: /play void garden/i })).toHaveAttribute('href', '../void-garden/');
  await expect(voidCard.getByText(/cursor-haunted greenhouse/i)).toBeVisible();
  await expect(fpsCard.getByText('npm test')).toBeVisible();
  await expect(fpsCard.getByText('Gameplay', { exact: true })).toBeVisible();
  await expect(fpsCard.locator('.score-rating', { hasText: '7/10' }).first()).toBeVisible();
  await expect(fpsCard.getByText(/Solid wave-survival loop/)).toBeVisible();
  await expect(fpsCard.getByText('Agent self-test quality')).toBeVisible();
  await expect(fpsCard.getByText(/Smoke tests cover arcade discovery/)).toBeVisible();
  await saveSmokeScreenshot(page, 'arcade-smoke.png');
  expect(errors).toEqual([]);
});

test('fps gauntlet starts, accepts controls, shoots drones, and updates hud', async ({ page }) => {
  const errors = await collectConsoleErrors(page);
  await page.goto('/games/fps-gauntlet/');
  await expect(page.getByRole('heading', { name: 'Neon Breach' })).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.getByTestId('radar')).toBeVisible();
  await expect(page.getByTestId('threat-count')).toHaveText('7');
  await expect(page.locator('#weapon-status')).toHaveText('READY');

  await page.getByRole('button', { name: /start breach/i }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state', 'running');

  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.keyboard.press('KeyF');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');

  const shots = Number(await page.locator('#game-root').getAttribute('data-shots-fired'));
  const jumps = Number(await page.locator('#game-root').getAttribute('data-jumps'));
  const enemyCount = Number(await page.locator('#game-root').getAttribute('data-enemy-count'));
  const health = Number(await page.getByTestId('health').textContent());

  expect(shots).toBeGreaterThan(0);
  expect(jumps).toBeGreaterThan(0);
  expect(enemyCount).toBeGreaterThan(0);
  expect(health).toBeGreaterThan(0);
  await saveSmokeScreenshot(page, 'fps-gauntlet-smoke.png');
  expect(errors).toEqual([]);
});

test('void garden starts, whispers at the cursor, and mutates the specimen log', async ({ page }) => {
  const errors = await collectConsoleErrors(page);
  await page.goto('/games/void-garden/');
  await expect(page.getByRole('heading', { name: 'Void Garden' })).toBeVisible();
  await expect(page.locator('#garden-stage')).toBeVisible();
  await expect(page.getByTestId('whisper')).toContainText(/sleeping|hungry/i);

  await page.getByRole('button', { name: /open the greenhouse/i }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state', 'growing');

  await page.mouse.move(420, 360);
  await page.keyboard.press('KeyF');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);

  const petals = Number(await page.locator('#game-root').getAttribute('data-petals-grown'));
  const specimens = Number(await page.getByTestId('specimens').textContent());
  const weirdness = Number(await page.getByTestId('weirdness').textContent());

  expect(petals).toBeGreaterThan(0);
  expect(specimens).toBeGreaterThan(0);
  expect(weirdness).toBeGreaterThan(0);
  await expect(page.getByTestId('whisper')).not.toHaveText(/sleeping/i);
  await saveSmokeScreenshot(page, 'void-garden-smoke.png');
  expect(errors).toEqual([]);
});

test('manifest is valid and has required arcade metadata', async () => {
  const raw = await fs.readFile('games/manifest.json', 'utf8');
  const manifest = JSON.parse(raw);
  expect(manifest.games).toEqual(expect.any(Array));
  const voidGarden = manifest.games.find((game) => game.id === 'void-garden');
  expect(voidGarden).toMatchObject({
    id: 'void-garden',
    title: 'Void Garden',
    type: 'weird-creative-wildcard',
    playUrl: './void-garden/',
    testCommand: 'npm test'
  });
  expect(voidGarden.manualChecklist.length).toBeGreaterThanOrEqual(5);
  expect(voidGarden.scorecardUrl).toBe('./scorecards/void-garden.json');

  const voidScorecard = JSON.parse(await fs.readFile('games/scorecards/void-garden.json', 'utf8'));
  expect(voidScorecard).toMatchObject({
    schemaVersion: 1,
    gameId: 'void-garden',
    ratings: {
      gameplay: { rating: 6 },
      controls: { rating: 7 },
      visualClarity: { rating: 8 },
      performance: { rating: 9 },
      replayability: { rating: 6 },
      agentSelfTestQuality: { rating: 8 }
    }
  });
  for (const entry of Object.values(voidScorecard.ratings)) {
    expect(entry.rating).toBeGreaterThanOrEqual(0);
    expect(entry.rating).toBeLessThanOrEqual(10);
    expect(entry.note.length).toBeGreaterThan(0);
  }

  const fps = manifest.games.find((game) => game.id === 'fps-gauntlet');
  expect(fps).toMatchObject({
    id: 'fps-gauntlet',
    title: 'Neon Breach',
    type: 'fps',
    playUrl: './fps-gauntlet/',
    testCommand: 'npm test'
  });
  expect(fps.manualChecklist.length).toBeGreaterThanOrEqual(5);
  expect(fps.scorecardUrl).toBe('./scorecards/fps-gauntlet.json');

  const scorecard = JSON.parse(await fs.readFile('games/scorecards/fps-gauntlet.json', 'utf8'));
  expect(scorecard).toMatchObject({
    schemaVersion: 1,
    gameId: 'fps-gauntlet',
    ratings: {
      gameplay: { rating: 7 },
      controls: { rating: 8 },
      visualClarity: { rating: 7 },
      performance: { rating: 8 },
      replayability: { rating: 6 },
      agentSelfTestQuality: { rating: 8 }
    }
  });
  for (const entry of Object.values(scorecard.ratings)) {
    expect(entry.rating).toBeGreaterThanOrEqual(0);
    expect(entry.rating).toBeLessThanOrEqual(10);
    expect(entry.note.length).toBeGreaterThan(0);
  }
});
