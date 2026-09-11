import { test, expect } from '@playwright/test';

test('snowdown boots a local 3D arena and both cowpokes can move, throw and dodge', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/games/snowdown/?test=1');
  await expect(page.getByRole('heading', { name: 'High Noon, Low Temperatures' })).toBeVisible();
  await page.getByRole('button', { name: 'Ride together' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state', 'playing');
  const initial = await page.evaluate(() => window.__snowdown.snapshot());
  await page.keyboard.down('d'); await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.__snowdown.step(0.3));
  await page.keyboard.up('d'); await page.keyboard.up('ArrowLeft');
  const moved = await page.evaluate(() => window.__snowdown.snapshot());
  expect(moved.players[0].x).toBeGreaterThan(initial.players[0].x);
  expect(moved.players[1].x).toBeLessThan(initial.players[1].x);
  await page.keyboard.down('f'); await page.keyboard.down('k');
  await page.evaluate(() => window.__snowdown.step(0.2));
  await page.keyboard.up('f'); await page.keyboard.up('k');
  await page.keyboard.press('g'); await page.keyboard.press('l');
  const active = await page.evaluate(() => window.__snowdown.snapshot());
  expect(active.shots).toBeGreaterThanOrEqual(2);
  expect(active.dodges).toBe(2);
  expect(active.renderer).toBe('WebGLRenderer');
  expect(active.enemies).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('snowdown-smoke.png'), timeout: 30000 });
  expect(errors).toEqual([]);
});

test('snowballs collide, outlaws retaliate, partners revive, cocoa heals and three waves unlock the boss before victory', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/games/snowdown/?test=1');
  await page.getByRole('button', { name: 'Ride together' }).click();
  const shot = await page.evaluate(() => {
    const t=window.__snowdown;
    t.encounter();
    t.fire(0); t.step(.4);
    return t.snapshot();
  });
  expect(shot.hits).toBe(1);
  expect(shot.score).toBe(100);
  const damage = await page.evaluate(() => {
    const t=window.__snowdown;t.enemySnowball(0);t.step(.15);return t.snapshot();
  });
  expect(damage.players[0].hp).toBe(4);
  const revived=await page.evaluate(() => {
    const t=window.__snowdown;t.down(0);t.place(1,-1,3);t.step(2.3);return t.snapshot();
  });
  expect(revived.players[0].hp).toBe(3);
  expect(revived.revives).toBe(1);
  const healed=await page.evaluate(() => {
    const t=window.__snowdown;t.cocoa(0);t.step(.1);return t.snapshot();
  });
  expect(healed.players[0].hp).toBe(5);
  const won=await page.evaluate(() => {
    const t=window.__snowdown;
    for(let i=0;i<3;i++){t.clearWave();t.step(3.1);}
    return t.snapshot();
  });
  expect(won.state).toBe('playing');
  expect(won.boss.hp).toBeGreaterThan(0);
  expect(won.wave).toBe(3);
  await page.evaluate(()=>{window.__snowdown.clearWave();window.__snowdown.step(3.1);});
  expect((await page.evaluate(()=>window.__snowdown.snapshot())).state).toBe('won');
  await expect(page.getByRole('heading', {name:'The West is thawed.'})).toBeVisible();
  await page.getByRole('button',{name:'Another snow day'}).click();
  const reset=await page.evaluate(()=>window.__snowdown.snapshot());
  expect(reset.wave).toBe(1);expect(reset.score).toBe(0);expect(reset.players.every(p=>p.hp===5)).toBe(true);
});

test('pause and blur freeze simulation; a wiped posse loses; solo excludes player two', async ({ page }) => {
  await page.goto('/games/snowdown/?test=1');
  await page.getByRole('button', { name: 'Ride together' }).click();
  await page.keyboard.press('Escape');
  const before=await page.evaluate(()=>window.__snowdown.snapshot());
  const after=await page.evaluate(()=>window.__snowdown.step(5));
  expect(after).toEqual(before);
  await page.getByRole('button',{name:'Back in the saddle'}).click();
  await page.evaluate(()=>dispatchEvent(new Event('blur')));
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','paused');
  await page.getByRole('button',{name:'Back in the saddle'}).click();
  await page.evaluate(()=>{window.__snowdown.down(0);window.__snowdown.down(1);window.__snowdown.step(.1);});
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','lost');
  await page.getByRole('button',{name:'Change posse'}).click();
  await page.getByRole('button',{name:'Lone ranger'}).click();
  expect(await page.evaluate(()=>window.__snowdown.snapshot().players[1].active)).toBe(false);
  await page.evaluate(()=>{window.__snowdown.down(0);window.__snowdown.step(.1);});
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','lost');
});
