import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createPlayableServer } from '../scripts/playable-service.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const reviewedLinks = ['/games/snowdown/', '/games/rift-runner/', '/games/fps-gauntlet/', '/games/void-garden/', '/games/signal-salvage/'];
async function serve(t, registry) {
  const server = await createPlayableServer({ root, registry });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

// Actual rendered colors, not source-token assertions. All text surfaces are opaque.
function contrast(a, b) {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3)
    .map(v => Number(v) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (x + 0.05) / (y + 0.05);
}

test('public arcade retains its styled accessible launcher without scripts or extra links', { timeout: 30000 }, async t => {
  const registry = JSON.parse(await fs.readFile(new URL('../deploy/playable-registry.json', import.meta.url)));
  const base = await serve(t, registry);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ javaScriptEnabled: false });
  const requests = [], errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  const screenshots = process.env.ARCADE_SCREENSHOT_DIR;
  if (screenshots) await fs.mkdir(screenshots, { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['narrow', 320, 740]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/games/arcade/`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(7, 16, 24)', 'public launcher must retain its dark styled surface');
    assert.equal(await page.locator('h1').textContent(), 'Agent Game Arcade');
    assert.equal(await page.title(), 'Agent Game Arcade');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('script, link, img, iframe').count(), 0);
    assert.deepEqual(await page.locator('a').evaluateAll(links => links.map(a => a.getAttribute('href'))), reviewedLinks);
    assert.deepEqual(await page.locator('.game-card h3').allTextContents(), registry.games.map(g => g.title));
    const layout = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      grid: getComputedStyle(document.querySelector('.game-grid')).display,
      fits: document.documentElement.scrollWidth <= innerWidth,
      columns: getComputedStyle(document.querySelector('.game-grid')).gridTemplateColumns.split(' ').length,
    }));
    assert.equal(layout.background, 'rgb(7, 16, 24)');
    assert.match(layout.font, /sans-serif/);
    assert.equal(layout.grid, 'grid');
    assert.ok(layout.fits, `${name}: no horizontal overflow`);
    assert.equal(layout.columns, name === 'desktop' ? 3 : 1);
    // Every visible text node must meet normal-text WCAG AA, even headings.
    const colors = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(el => {
        let surface = el;
        while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
        return { text: el.textContent.trim(), foreground: getComputedStyle(el).color, background: getComputedStyle(surface).backgroundColor };
      }));
    for (const color of colors) assert.ok(contrast(color.foreground, color.background) >= 4.5, `${name} contrast: ${JSON.stringify(color)}`);
    for (const href of reviewedLinks) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement, css = getComputedStyle(el), rect = el.getBoundingClientRect();
        return { href: el.getAttribute('href'), outline: css.outlineStyle, width: parseFloat(css.outlineWidth), color: css.outlineColor, background: getComputedStyle(el.parentElement).backgroundColor, height: rect.height };
      });
      assert.equal(focus.href, href);
      assert.equal(focus.outline, 'solid');
      assert.ok(focus.width >= 3);
      assert.ok(focus.height >= 44);
      assert.ok(contrast(focus.color, focus.background) >= 3);
    }
    await page.locator('a').first().focus();
    await page.evaluate(() => scrollTo(0, 0));
    if (screenshots && name !== 'narrow') await page.screenshot({ path: path.join(screenshots, `arcade-${name}.png`), fullPage: true });
  }
  // 200% text reflow on the smallest viewport.
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url === `${base}/games/arcade/`), 'launcher makes no asset/API requests');
  for (const href of reviewedLinks) assert.equal((await fetch(`${base}${href}`)).status, 200, href);
  assert.equal((await fetch(`${base}/games/arcade/`, { method: 'HEAD' })).status, 200);
});

test('launcher escapes registry titles and ignores unreviewed metadata', async t => {
  const title = '<script>"&\'unsafe</script>';
  const base = await serve(t, { games: [{ id: 'demo', title, files: ['index.html'], url: 'https://unreviewed.invalid', description: 'PRIVATE METADATA', task: '/api/kanban/board' }], runtime: [] });
  const response = await fetch(`${base}/games/arcade/`);
  const html = await response.text();
  assert.match(html, /&lt;script&gt;&quot;&amp;&#39;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|PRIVATE METADATA|unreviewed\.invalid|\/api\/|\/downloads\//);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/games/demo/']);
});
