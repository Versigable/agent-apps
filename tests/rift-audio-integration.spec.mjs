import {test,expect} from '@playwright/test';

test('phone mixer leaves its close toggle and touch controls reachable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/games/rift-runner/');await page.locator('#start').click();await page.locator('#audio-mixer summary').click();
 const panel=await page.locator('.mixer-panel').boundingBox(),toggle=await page.locator('#audio-mixer summary').boundingBox();
 expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(390);expect(panel.y+panel.height).toBeLessThanOrEqual(toggle.y);
 await page.locator('#audio-mixer summary').click();await expect(page.locator('.mixer-panel')).not.toBeVisible();
});

test('mixer arrow keys do not steer the ship and focus loss suspends the soundtrack',async({page})=>{
 await page.goto('/games/rift-runner/');await page.locator('#start').click();
 await page.getByText('AUDIO MIXER',{exact:true}).click();
 const slider=page.getByLabel('Music volume');await slider.focus();
 const before=await page.evaluate(()=>window.__gameTest.snapshot().player.x);
 await page.keyboard.down('ArrowRight');await page.evaluate(()=>window.__gameTest.step(.2));await page.keyboard.up('ArrowRight');
 expect(await page.evaluate(()=>window.__gameTest.snapshot().player.x)).toBe(before);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await expect(page.locator('#game-root')).toHaveAttribute('data-state','paused');
 await expect.poll(()=>page.evaluate(()=>window.riftAudio.snapshot().contextState)).toBe('suspended');
});

test('game mixer persists separate levels and pause freezes live audio', async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/games/rift-runner/');
 await page.getByText('AUDIO MIXER',{exact:true}).click();
 const music=page.getByLabel('Music volume'),sfx=page.getByLabel('Effects volume');
 await expect(music).toBeVisible();await expect(sfx).toBeVisible();
 await music.evaluate(el=>{el.value='.25';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await sfx.evaluate(el=>{el.value='.6';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#start').click();
 await expect.poll(()=>page.evaluate(()=>window.riftAudio.snapshot().contextState)).toBe('running');
 await page.keyboard.down('f');await page.waitForTimeout(250);await page.keyboard.up('f');
 expect(await page.evaluate(()=>window.__gameTest.snapshot().audioEvents)).toBeGreaterThan(0);
 await page.keyboard.press('p');
 await expect.poll(()=>page.evaluate(()=>window.riftAudio.snapshot().contextState)).toBe('suspended');
 await page.locator('#resume').click();
 await expect.poll(()=>page.evaluate(()=>window.riftAudio.snapshot().contextState)).toBe('running');
 await page.keyboard.press('m');
 await expect(page.locator('#game-root')).toHaveAttribute('data-muted','true');
 await page.reload();
 await page.getByText('AUDIO MIXER',{exact:true}).click();
 await expect(music).toHaveValue('0.25');await expect(sfx).toHaveValue('0.6');
 await expect(page.locator('#game-root')).toHaveAttribute('data-muted','true');
 expect(errors).toEqual([]);
});
