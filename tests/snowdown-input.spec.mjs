import { test, expect } from '@playwright/test';

test('two standard gamepads independently move, throw and dodge', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    window.__pads = [0, 1].map(index => ({
      id: `Test standard controller ${index}`, index, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    }));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads });
  });
  await page.goto('/games/snowdown/?test=1');
  await page.getByRole('button', { name: /ride together|play co-op|start co-op/i }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state', 'playing');
  const before = await page.evaluate(() => window.__snowdown.snapshot());
  await page.evaluate(() => {
    window.__pads[0].axes[0] = 0.8;
    window.__pads[1].axes[0] = -0.8;
    for (const pad of window.__pads) pad.buttons[0] = { pressed: true, value: 1 };
    window.__snowdown.step(0.25);
  });
  const moved = await page.evaluate(() => window.__snowdown.snapshot());
  expect(moved.players[0].x).not.toBe(before.players[0].x);
  expect(moved.players[1].x).not.toBe(before.players[1].x);
  expect(moved.shots).toBeGreaterThanOrEqual(before.shots + 2);
  await page.evaluate(() => {
    for (const pad of window.__pads) pad.buttons[1] = { pressed: true, value: 1 };
    window.__snowdown.step(0.05);
  });
  expect((await page.evaluate(() => window.__snowdown.snapshot())).dodges).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    window.__pads[0] = null;
    window.__pads[1].buttons.forEach(button => { button.pressed = false; button.value = 0; });
    window.__snowdown.step(0.4);
  });
  const onePad = await page.evaluate(() => window.__snowdown.snapshot());
  await page.evaluate(() => window.__snowdown.step(0.15));
  const oneMoved = await page.evaluate(() => window.__snowdown.snapshot());
  expect(oneMoved.players[0].x).toBeCloseTo(onePad.players[0].x, 5);
  expect(oneMoved.players[0].z).toBeCloseTo(onePad.players[0].z, 5);
  expect(oneMoved.players[1].x).not.toBe(onePad.players[1].x);
  await page.evaluate(() => {
    window.__pads = [null, null];
    window.__snowdown.step(1);
  });
  const disconnected = await page.evaluate(() => window.__snowdown.snapshot());
  await page.evaluate(() => window.__snowdown.step(0.2));
  const still = await page.evaluate(() => window.__snowdown.snapshot());
  expect(still.shots).toBe(disconnected.shots);
  for (let i = 0; i < 2; i++) {
    expect(still.players[i].x).toBeCloseTo(disconnected.players[i].x, 5);
    expect(still.players[i].z).toBeCloseTo(disconnected.players[i].z, 5);
  }
});
