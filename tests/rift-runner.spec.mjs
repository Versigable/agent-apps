import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('wave clear offers upgrade and third wave is a damageable boss', async ({page}) => {
  await start(page);
  await page.evaluate(() => window.__gameTest.clearWave());
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','upgrade');
  await page.getByRole('button',{name:/Overclock/}).click();
  expect(await page.evaluate(() => window.__gameTest.snapshot().player.fireRate)).toBeLessThan(.16);
  await expect(page.locator('#game-root')).toHaveAttribute('data-wave','2');
  await page.evaluate(() => window.__gameTest.clearWave());
  await page.getByRole('button',{name:/Reinforced/}).click();
  const boss=await page.evaluate(() => window.__gameTest.snapshot().enemies.find(e=>e.type==='boss'));
  expect(boss.hp).toBeGreaterThan(100);
  await page.evaluate(() => window.__gameTest.setupBossShot());
  await page.keyboard.down('f'); await page.waitForTimeout(400); await page.keyboard.up('f');
  expect(await page.evaluate(() => window.__gameTest.snapshot().enemies.find(e=>e.type==='boss').hp)).toBeLessThan(boss.hp);
  await page.evaluate(() => window.__gameTest.clearWave());
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','upgrade');
  await expect(page.getByText('CORE SHATTERED', {exact:true})).toBeVisible();
});

test('pause freezes combat, mute toggles, collision ends run and restart resets', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await page.keyboard.press('p');
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','paused');
  const x=await page.evaluate(()=>window.__gameTest.snapshot().player.x);
  await page.keyboard.down('d');await page.waitForTimeout(180);await page.keyboard.up('d');
  expect(await page.evaluate(()=>window.__gameTest.snapshot().player.x)).toBe(x);
  await page.getByRole('button',{name:/Resume run/}).click();
  await page.keyboard.press('m');
  await expect(page.locator('#game-root')).toHaveAttribute('data-muted','true');
  await page.evaluate(()=>window.__gameTest.setupLethalCollision());
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','gameover');
  await page.getByRole('button',{name:/Restart run/}).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-health','100');
  await expect(page.locator('#game-root')).toHaveAttribute('data-wave','1');
  await page.mouse.move(900,400);await page.mouse.down();await page.waitForTimeout(220);await page.mouse.up();
  expect(await page.evaluate(()=>window.__gameTest.snapshot().shots)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('touch controls move and fire on narrow viewport without overflow', async ({browser}) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await page.goto('/games/rift-runner/');
  await page.getByRole('button',{name:/Start run/}).click();
  const before=await page.evaluate(()=>window.__gameTest.snapshot().player.x);
  await page.locator('[data-key="d"]').dispatchEvent('pointerdown',{pointerId:1});
  await page.waitForTimeout(200);
  await page.locator('[data-key="d"]').dispatchEvent('pointerup',{pointerId:1});
  expect(await page.evaluate(()=>window.__gameTest.snapshot().player.x)).toBeGreaterThan(before);
  await page.locator('[data-key="f"]').dispatchEvent('pointerdown',{pointerId:2});await page.waitForTimeout(200);
  await page.locator('[data-key="f"]').dispatchEvent('pointerup',{pointerId:2});
  expect(await page.evaluate(()=>window.__gameTest.snapshot().shots)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await context.close();
});

test('mouse aim maps contained canvas accurately and mouse shots kill', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.evaluate(()=>window.__gameTest.setupCombat('shoot'));
  const point=await page.locator('canvas').evaluate(c=>{const r=c.getBoundingClientRect(),scale=Math.min(r.width/c.width,r.height/c.height);return{x:r.x+(r.width-c.width*scale)/2+750*scale,y:r.y+(r.height-c.height*scale)/2+350*scale};});
  await page.mouse.move(point.x,point.y);
  await expect.poll(()=>page.evaluate(()=>window.__gameTest.snapshot().mouse.x)).toBeCloseTo(750,0);
  await page.mouse.down();await page.waitForTimeout(550);await page.mouse.up();
  expect(await page.evaluate(()=>window.__gameTest.snapshot().kills)).toBeGreaterThan(0);
});

test('phase afterimage damages delayed pursuer only once per dash', async ({page}) => {
  await start(page);
  const result=await page.evaluate(()=>window.__gameTest.probeAfterimage());
  expect(result.damage).toBe(100);expect(result.repeatDamage).toBe(0);expect(result.trailHits).toBe(1);
});

async function start(page) {
  await page.goto('/games/rift-runner/?test=1');
  await page.getByRole('button', {name:/Start run/i}).click();
}
test('autoaim shooting kills enemies and dash damages along its path', async ({page}) => {
  await start(page);
  await page.evaluate(() => window.__gameTest.setupCombat('shoot'));
  await page.keyboard.down('f'); await page.waitForTimeout(650); await page.keyboard.up('f');
  expect(await page.evaluate(() => window.__gameTest.snapshot().kills)).toBeGreaterThan(0);
  await page.evaluate(() => window.__gameTest.setupCombat('dash'));
  await page.keyboard.down('d'); await page.keyboard.press('Space'); await page.waitForTimeout(180); await page.keyboard.up('d');
  const s=await page.evaluate(() => window.__gameTest.snapshot());
  expect(s.dashes).toBe(1); expect(s.dashKills).toBeGreaterThan(0);
  await expect(page.locator('#game-root')).toHaveAttribute('data-shots-fired',/^[1-9]/);
});

test('start launches arena and keyboard moves pilot', async ({ page }) => {
  await page.goto('/games/rift-runner/');
  await expect(page.getByRole('heading', {name:'RIFT//RUNNER', exact:true})).toBeVisible();
  await page.getByRole('button', {name:/Start run/i}).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','playing');
  const x = await page.evaluate(() => window.__gameTest.snapshot().player.x);
  await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
  expect(await page.evaluate(() => window.__gameTest.snapshot().player.x)).toBeGreaterThan(x + 20);
  await fs.mkdir('games/artifacts/test-results/smoke-screenshots', {recursive:true});
  await page.screenshot({path:'games/artifacts/test-results/smoke-screenshots/rift-runner-smoke.png'});
});
