import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });
test('snowdown keeps real WebGL draw submissions bounded', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.route('**/snowdown/game.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source + '\nwindow.__renderStats = () => ({...renderer.info.render, geometries:renderer.info.memory.geometries, shadowAutoUpdate:renderer.shadowMap.autoUpdate, pixelRatio:renderer.getPixelRatio()});' });
  });
  await page.goto('/games/snowdown/');
  await page.getByRole('button', { name: 'Ride together' }).click();
  const initialStats = await page.evaluate(() => window.__renderStats());
  await page.keyboard.down('f');
  await page.keyboard.down('k');
  const measurement = await page.evaluate(async () => {
    const start = performance.now(), simulation = window.__snowdown.snapshot().elapsed;
    let frames = 0;
    await new Promise(resolve => {
      function sample() { frames++; if (performance.now() - start >= 6000) resolve(); else requestAnimationFrame(sample); }
      requestAnimationFrame(sample);
    });
    const wallSeconds = (performance.now()-start)/1000;
    return { wallSeconds, simulationSeconds:window.__snowdown.snapshot().elapsed-simulation, fps:frames/wallSeconds, stats:window.__renderStats() };
  });
  await page.keyboard.up('f'); await page.keyboard.up('k');
  console.log('SNOWDOWN_REAL_PERFORMANCE', JSON.stringify(measurement));
  await page.screenshot({path:testInfo.outputPath('snowdown-performance.png')});
  await testInfo.attach('performance', {body:JSON.stringify(measurement,null,2),contentType:'application/json'});
  // Submission budget is hardware-independent; timing is reported, not gated.
  expect(initialStats.calls).toBeLessThan(200);
  expect(measurement.stats.shadowAutoUpdate).toBe(false);
});
