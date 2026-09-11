import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    window.__pads = [0,1].map(index => ({index, axes:[0,0], buttons:Array.from({length:17},()=>({pressed:false}))}));
    Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});
  });
  await page.goto('/games/snowdown/?test=1');
  await page.getByRole('button',{name:'Ride together'}).click();
}
test('screen up and right project correctly for keyboard and both pads', async ({page}) => {
  await boot(page);
  for (const input of ['keyboard','pad']) for (const axis of ['up','right']) {
    if(input==='keyboard') {await page.keyboard.down(axis==='up'?'w':'d');await page.keyboard.down(axis==='up'?'ArrowUp':'ArrowRight');}
    const vectors=await page.evaluate(({input,axis})=>{
      const t=window.__snowdown;t.place(0,-2,3);t.place(1,2,3);
      const project=p=>({x:(32*p.x-22*p.z)/Math.hypot(32,22),y:-(22*p.x+32*p.z)/Math.hypot(32,22)});
      const before=t.snapshot().players.map(project);
      if(input==='pad')window.__pads.forEach(p=>p.axes=axis==='up'?[0,-1]:[1,0]);
      const after=t.step(.2).players.map(project);window.__pads.forEach(p=>p.axes=[0,0]);
      return after.map((p,i)=>({x:p.x-before[i].x,y:p.y-before[i].y}));
    },{input,axis});
    if(input==='keyboard'){await page.keyboard.up(axis==='up'?'w':'d');await page.keyboard.up(axis==='up'?'ArrowUp':'ArrowRight');}
    for(const v of vectors){expect(axis==='up'?v.y:v.x).toBeGreaterThan(.5);expect(Math.abs(axis==='up'?v.x:v.y)).toBeLessThan(.001);}
  }
});
test('real frame deltas use small substeps, bounded gaps and no pause catchup', async ({page}) => {
  await boot(page);
  const result=await page.evaluate(()=>{
    const t=window.__snowdown;
    const a=t.frameDelta(.1), b=t.frameDelta(.2);
    t.encounter();t.fire(0);t.step(.18);const hit=t.frameDelta(.2);
    dispatchEvent(new Event('blur'));const paused=t.snapshot();t.frameDelta(5);
    document.querySelector('#resume').click();const resumed=t.frameDelta(.1);
    const gap=t.frameDelta(5);
    return {a,b,hit,paused,resumed,gap};
  });
  expect(result.a.elapsed).toBeCloseTo(.1,6);expect(result.b.elapsed).toBeCloseTo(.3,6);
  expect(result.hit.hits).toBe(1);
  expect(result.resumed.elapsed-result.paused.elapsed).toBeCloseTo(.1,6);
  expect(result.gap.elapsed-result.resumed.elapsed).toBeLessThanOrEqual(.251);
});
test('throw has real windup then release, feedback and individual cooldowns', async ({page}) => {
  await boot(page);
  const r=await page.evaluate(()=>{
    const t=window.__snowdown;t.encounter();t.fire(0);const start=t.snapshot();t.step(.08);const winding=t.snapshot();t.step(.1);const released=t.snapshot();t.step(.2);const hit=t.snapshot();
    t.enemySnowball(1);t.step(.1);return {start,winding,released,hit,damage:t.snapshot()};
  });
  expect(r.start.shots).toBe(0);expect(r.winding.shots).toBe(0);expect(r.winding.players[0].windup).toBeGreaterThan(0);
  expect(r.released.shots).toBe(1);expect(r.released.players[0].throws).toBe(1);expect(r.released.players[0].recoil).toBeGreaterThan(0);
  expect(r.hit.hits).toBe(1);expect(r.damage.players[1].hitsReceived).toBe(1);
  await page.keyboard.press('g');
  const dodged=await page.evaluate(()=>window.__snowdown.snapshot());expect(dodged.players[0].dodges).toBe(1);expect(dodged.players[1].dodges).toBe(0);
  await expect(page.locator('#cooldown0')).toContainText('DODGE');await expect(page.locator('#cooldown1')).toContainText('READY');
  await expect(page.locator('#marker0')).toHaveText('P1');await expect(page.locator('#marker1')).toHaveText('P2');
});
test('Start is a rising-edge toggle and remains polled while paused', async ({page}) => {
  await boot(page);
  const states = await page.evaluate(() => {
    const t=window.__snowdown, b=window.__pads[0].buttons[9], states=[];
    b.pressed=true; states.push(t.step(.1).state); states.push(t.step(.1).state);
    b.pressed=false;t.step(.1);b.pressed=true;states.push(t.step(.1).state);states.push(t.step(.1).state);
    return states;
  });
  expect(states).toEqual(['paused','paused','playing','playing']);
});
