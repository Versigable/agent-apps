import { test, expect } from "@playwright/test";
import fs from 'node:fs/promises';
async function start(page) {
  await page.goto("/games/rift-runner/?test=1");
  await page.locator("#start").click();
}
test("kill drops magnetic geoms which raise multiplier and unlock spread without a menu", async ({
  page,
}) => {
  await start(page);
  const r = await page.evaluate(() => window.__gameTest.probeProgression());
  expect(r.dropCount).toBeGreaterThan(0);
  expect(r.attractedDistance).toBeLessThan(r.originalDistance);
  expect(r.collected).toBeGreaterThanOrEqual(10);
  expect(r.multiplier).toBeGreaterThan(1);
  expect(r.weaponTier).toBeGreaterThan(1);
  expect(r.projectiles).toBeGreaterThan(1);
  expect(r.spread).toBeGreaterThan(0);
  expect(r.killScore).toBe(100 * r.multiplier);
  expect((await snapshot(page)).state).toBe("playing");
});
test("enemy archetypes chase, dodge, split and exert gravity with a kill explosion", async ({
  page,
}) => {
  await start(page);
  const r = await page.evaluate(() => window.__gameTest.probeEnemies());
  expect(r.chaserDistanceAfter).toBeLessThan(r.chaserDistanceBefore);
  expect(Math.abs(r.dodgeY)).toBeGreaterThan(1);
  expect(r.minis).toBe(3);
  expect(r.gravityDistanceAfter).toBeLessThan(r.gravityDistanceBefore);
  expect(r.explosionDamage).toBeGreaterThan(0);
  expect(r.shockwaves).toBeGreaterThan(0);
  expect(r.edgeInside).toBe(true);
});
test("three lives respawn safely, bombs are limited and cannot farm rewards, restart resets run", async ({
  page,
}) => {
  await start(page);
  expect((await snapshot(page)).lives).toBe(3);
  await page.evaluate(() => window.__gameTest.probeProgression());
  await page.evaluate(() => window.__gameTest.setupCollision());
  let s = await snapshot(page);
  expect(s.lives).toBe(2);
  expect(s.multiplier).toBe(1);
  expect(s.player.invuln).toBeGreaterThan(1);
  expect(
    s.enemies.every(
      (e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) > 180,
    ),
  ).toBe(true);
  await page.evaluate(() => window.__gameTest.setupCombat("shoot"));
  const before = await snapshot(page);
  await page.keyboard.press("b");
  s = await snapshot(page);
  expect(s.bombs).toBe(2);
  expect(s.enemies).toHaveLength(0);
  expect(s.bullets).toHaveLength(0);
  expect(s.enemyShots).toHaveLength(0);
  expect(s.score).toBe(before.score);
  expect(s.geoms).toHaveLength(before.geoms.length);
  await page.keyboard.press("b");
  await page.keyboard.press("b");
  await page.keyboard.press("b");
  expect((await snapshot(page)).bombs).toBe(0);
  await page.evaluate(() => {
    window.__gameTest.setupCollision();
    window.__gameTest.setupCollision();
  });
  expect((await snapshot(page)).state).toBe("gameover");
  const best = (await snapshot(page)).best;
  expect(best).toBeGreaterThan(0);
  await page.locator("#restart").click();
  s = await snapshot(page);
  expect(s.lives).toBe(3);
  expect(s.bombs).toBe(3);
  expect(s.score).toBe(0);
  expect(s.collected).toBe(0);
  expect(s.weaponTier).toBe(1);
  expect(s.wave).toBe(1);
  expect(s.best).toBe(best);
  await page.reload();
  expect((await snapshot(page)).best).toBe(best);
});
test("pause freezes simulation and effects; keyboard, touch, mouse, mute and bounded dash work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await page.keyboard.down("d");
  await page.evaluate(() => window.__gameTest.step(0.2));
  await page.keyboard.up("d");
  expect((await snapshot(page)).player.x).toBeGreaterThan(620);
  await page.evaluate(() => window.__gameTest.setupCombat("shoot"));
  await page.keyboard.down("f");
  await page.evaluate(() => window.__gameTest.step(0.5));
  await page.keyboard.up("f");
  expect((await snapshot(page)).kills).toBeGreaterThan(0);
  expect((await snapshot(page)).audioEvents).toBeGreaterThan(0);
  await page.keyboard.press("p");
  const before = await snapshot(page);
  await page.evaluate(() => window.__gameTest.step(2));
  expect((await snapshot(page)).time).toBe(before.time);
  expect((await snapshot(page)).particles).toEqual(before.particles);
  await page.locator("#resume").click();
  await page.keyboard.press("m");
  expect((await snapshot(page)).muted).toBe(true);
  const r = await page.evaluate(() => window.__gameTest.probeAfterimage());
  expect(r.damage).toBe(100);
  expect(r.repeatDamage).toBe(0);
  await page
    .locator('[data-key="d"]')
    .dispatchEvent("pointerdown", { pointerId: 1 });
  const x = (await snapshot(page)).player.x;
  await page.evaluate(() => window.__gameTest.step(0.1));
  await page
    .locator('[data-key="d"]')
    .dispatchEvent("pointerup", { pointerId: 1 });
  expect((await snapshot(page)).player.x).toBeGreaterThan(x);
  await page.evaluate(() => window.__gameTest.setupCombat("shoot"));
  const p = await page.locator("canvas").evaluate((c) => {
    const r = c.getBoundingClientRect(),
      s = Math.min(r.width / c.width, r.height / c.height);
    return {
      x: r.x + (r.width - c.width * s) / 2 + 750 * s,
      y: r.y + (r.height - c.height * s) / 2 + 350 * s,
    };
  });
  await page.mouse.move(p.x, p.y);
  expect((await snapshot(page)).mouse.x).toBeCloseTo(750, 0);
  const shots = (await snapshot(page)).shots;
  await page.mouse.down();
  await page.evaluate(() => window.__gameTest.step(0.4));
  await page.mouse.up();
  expect((await snapshot(page)).shots).toBeGreaterThan(shots);
  expect(errors).toEqual([]);
});
test("effect lifetimes advance in simulation even with a pure external renderer", async ({
  page,
}) => {
  await start(page);
  const r = await page.evaluate(() => window.__gameTest.probeEffects());
  expect(r.before).toBeGreaterThan(0);
  expect(r.after).toBe(0);
  expect(r.rendererCalls).toBeGreaterThan(0);
});
const snapshot = (page) => page.evaluate(() => window.__gameTest.snapshot());
test("continuous director preserves position on clear and escalates by elapsed time", async ({
  page,
}) => {
  await start(page);
  const initial = await snapshot(page);
  expect(initial.enemies.length).toBeGreaterThan(0);
  expect(initial.enemies.some(e=>e.spawnIn>0)).toBe(true);
  const result = await page.evaluate(() => {
    const g = window.__gameTest;
    g.clearWave();
    const cleared = g.snapshot();
    g.step(31, {invulnerable:true});
    return { cleared, later: g.snapshot() };
  });
  expect(result.cleared.state).toBe("playing");
  expect(result.cleared.player.x).toBe(initial.player.x);
  expect(result.later.wave).toBeGreaterThan(1);
  expect(result.later.spawned).toBeGreaterThanOrEqual(45);
  expect(result.later.enemies.length).toBeLessThanOrEqual(120);
  await fs.mkdir('games/artifacts/test-results/smoke-screenshots',{recursive:true});
  await page.screenshot({path:'games/artifacts/test-results/smoke-screenshots/rift-runner-smoke.png'});
});
