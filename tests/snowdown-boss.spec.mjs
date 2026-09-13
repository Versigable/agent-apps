import { test, expect } from '@playwright/test';
test('rolling line hits multiple enemies once and only partner shots boost once',async({page})=>{
 await boot(page); expect(await page.evaluate(()=>typeof window.__snowdown.bowlingSetup)).toBe('function');
 await page.evaluate(()=>window.__snowdown.bowlingSetup());
 await page.keyboard.down('h'); await page.evaluate(()=>window.__snowdown.step(1.5)); await page.keyboard.up('h');
 await page.evaluate(()=>window.__snowdown.step(.02));
 const own=await page.evaluate(()=>{const t=window.__snowdown;t.rollerShot(0);return t.step(.02);}); expect(own.boosts).toBe(0);
 const partner=await page.evaluate(()=>{const t=window.__snowdown;t.rollerShot(1);return t.step(.02);});expect(partner.boosts).toBe(1);
 const again=await page.evaluate(()=>window.__snowdown.step(.02));expect(again.boosts).toBe(1);
 const hits=await page.evaluate(()=>window.__snowdown.step(1));expect(hits.rollerHits).toBe(3);expect(hits.players.every(p=>p.hp===5)).toBe(true);
});
test('real normal autoaim boosts partner roller; pause cancels charge and freezes rollers; restart clears counters',async({page})=>{
 await boot(page);await page.evaluate(()=>window.__snowdown.encounter());
 await page.keyboard.down('h');await page.evaluate(()=>window.__snowdown.step(.7));await page.keyboard.up('h');await page.evaluate(()=>window.__snowdown.step(.02));
 await page.keyboard.down('k');const boosted=await page.evaluate(()=>window.__snowdown.step(.65));await page.keyboard.up('k');expect(boosted.boosts).toBeGreaterThan(0);
 await page.keyboard.down('j');await page.evaluate(()=>window.__snowdown.step(.2));await page.keyboard.press('Escape');const paused=await page.evaluate(()=>window.__snowdown.snapshot());expect(paused.players[1].charge).toBe(0);expect(await page.evaluate(()=>window.__snowdown.step(3))).toEqual(paused);
 await page.getByRole('button',{name:'Start fresh'}).click();const reset=await page.evaluate(()=>window.__snowdown.snapshot());expect(reset.rollers).toHaveLength(0);expect(reset.boosts).toBe(0);expect(reset.rollsLaunched).toBe(0);expect(reset.boss).toBeNull();
});
test('boss telegraphs before volleys and backward dash; real snowballs defeat it',async({page})=>{
 await boot(page);const initial=await page.evaluate(()=>{const t=window.__snowdown;for(let i=0;i<3;i++){t.clearWave();t.step(3);}return t.snapshot();});expect(initial.boss.hp).toBe(50);expect(initial.state).toBe('playing');
 const warning=await page.evaluate(()=>window.__snowdown.step(1));expect(warning.boss.phase).toBe('VOLLEY WARNING');expect(warning.boss.warning).toBe(true);expect(warning.volleys).toBe(0);
 const hud=await page.locator('#boss-hud').boundingBox(), notice=await page.locator('#announcement').boundingBox();expect(notice.y).toBeGreaterThan(hud.y+hud.height);
 await page.screenshot({path:test.info().outputPath('snowdown-boss-verified.png')});
 const shot=await page.evaluate(()=>window.__snowdown.step(1));expect(shot.volleys).toBe(1);
 const dashed=await page.evaluate(()=>window.__snowdown.step(3.2));expect(dashed.bossDashes).toBe(1);
 expect(await page.evaluate(()=>typeof window.__snowdown.bossTarget)).toBe('function');
 await page.evaluate(()=>window.__snowdown.bossTarget(1));await page.keyboard.down('f');const won=await page.evaluate(()=>window.__snowdown.step(4));await page.keyboard.up('f');expect(won.boss.hp).toBeLessThanOrEqual(0);expect(won.state).toBe('won');
});
test('both gamepad X buttons charge independently, including null slot zero',async({page})=>{
 await page.addInitScript(()=>{window.__pads=[0,1].map(()=>({axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))}));Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});});await boot(page);
 const charged=await page.evaluate(()=>{window.__pads.forEach(p=>p.buttons[2].pressed=true);return window.__snowdown.step(.6);});expect(charged.players.every(p=>p.charge>0)).toBe(true);
 const released=await page.evaluate(()=>{window.__pads[0].buttons[2].pressed=false;return window.__snowdown.step(.02);});expect(released.rollsLaunched).toBe(1);expect(released.players[1].charge).toBeGreaterThan(charged.players[1].charge);
 const second=await page.evaluate(()=>{window.__pads[0]=null;window.__pads[1].buttons[2].pressed=false;return window.__snowdown.step(.02);});expect(second.rollsLaunched).toBe(2);expect(second.players.map(p=>p.chargedThrows)).toEqual([1,1]);
});
async function boot(page) { await page.goto('/games/snowdown/?test=1'); await page.getByRole('button',{name:'Ride together'}).click(); }
test('keyboard charge grows held ball and releases bounded bowling snow', async ({page})=>{
 await boot(page); await page.keyboard.down('h');
 const small=await page.evaluate(()=>window.__snowdown.step(.25));
 expect(small.players[0].charge).toBeGreaterThan(0);
 const big=await page.evaluate(()=>window.__snowdown.step(2));
 expect(big.players[0].charge).toBe(1); expect(big.players[0].heldRadius).toBeGreaterThan(small.players[0].heldRadius);
 await page.keyboard.up('h'); const rolled=await page.evaluate(()=>window.__snowdown.step(.02));
 expect(rolled.rollers).toHaveLength(1); expect(rolled.rollers[0].radius).toBeGreaterThan(1); expect(rolled.rollsLaunched).toBe(1);
 await page.evaluate(()=>window.__snowdown.step(8)); expect((await page.evaluate(()=>window.__snowdown.snapshot())).rollers).toHaveLength(0);
});
