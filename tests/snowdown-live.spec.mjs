import { test, expect } from '@playwright/test';

test('production animation loop resumes with controller Start and held buttons do not retrigger', async ({ page }) => {
  test.setTimeout(90000);
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__pads=[{axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))},null];
    Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pads});
  });
  await page.goto('/games/snowdown/');
  await page.getByRole('button',{name:'Ride together'}).click();
  expect(await page.evaluate(()=>typeof window.__snowdown.step)).toBe('undefined');
  await page.evaluate(()=>{window.__pads[0].buttons[9].pressed=true;});
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','paused');
  const frozen=await page.evaluate(()=>window.__snowdown.snapshot().elapsed);
  // Wait for real production rAF callbacks, never advance the game with a test hook.
  const frames=()=>page.evaluate(()=>new Promise(resolve=>{
    let count=0;function tick(){if(++count===6)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);
  }));
  await frames();
  expect(await page.evaluate(()=>window.__snowdown.snapshot().elapsed)).toBe(frozen);
  await page.evaluate(()=>{window.__pads[0].buttons[9].pressed=false;});
  await frames();
  await page.evaluate(()=>{window.__pads[0].buttons[9].pressed=true;});
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','playing');
  await frames();
  await expect(page.locator('#game-root')).toHaveAttribute('data-state','playing');
  const advanced=await page.evaluate(()=>window.__snowdown.snapshot().elapsed);
  expect(advanced).toBeGreaterThan(frozen);
  expect(errors).toEqual([]);
});
