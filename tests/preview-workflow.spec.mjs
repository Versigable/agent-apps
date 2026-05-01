import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

test('package exposes one-click preview service and video artifact commands', async () => {
  const pkg = await readJson('package.json');
  expect(pkg.scripts).toMatchObject({
    'serve:preview': 'node scripts/preview-service.mjs',
    'preview:health': 'node scripts/preview-service.mjs --healthcheck',
    'artifacts:video': 'node scripts/capture-game-video.mjs'
  });
});

test('manifest advertises internal preview and artifact workflow metadata', async () => {
  const manifest = await readJson('games/manifest.json');
  expect(manifest.previewService).toMatchObject({
    name: 'agent-apps-preview',
    bindHost: '0.0.0.0',
    port: 4173,
    arcadePath: '/games/arcade/',
    healthPath: '/healthz'
  });
  expect(manifest.artifactWorkflow).toMatchObject({
    screenshotDir: 'games/artifacts/test-results/smoke-screenshots',
    videoDir: 'games/artifacts/videos',
    latestSummary: 'games/artifacts/latest-run.json'
  });

  const fps = manifest.games.find((game) => game.id === 'fps-gauntlet');
  expect(fps.previewPath).toBe('/games/fps-gauntlet/');
  expect(fps.previewUrl).toContain('/games/fps-gauntlet/');
  expect(fps.artifacts.latestVideo).toBe('./artifacts/videos/fps-gauntlet-latest.webm');
  expect(fps.artifacts.latestScreenshot).toBe('./artifacts/test-results/smoke-screenshots/fps-gauntlet-latest.png');
  expect(fps.artifacts.latestSummary).toBe('./artifacts/latest-run.json');

  const voidGarden = manifest.games.find((game) => game.id === 'void-garden');
  expect(voidGarden.previewPath).toBe('/games/void-garden/');
  expect(voidGarden.previewUrl).toContain('/games/void-garden/');
  expect(voidGarden.artifactCommand).toBe('npm run artifacts:video -- void-garden');
  expect(voidGarden.artifacts.latestVideo).toBe('./artifacts/videos/void-garden-latest.webm');
  expect(voidGarden.artifacts.latestScreenshot).toBe('./artifacts/test-results/smoke-screenshots/void-garden-latest.png');
  expect(voidGarden.artifacts.latestSummary).toBe('./artifacts/latest-run.json');
});

test('preview service exposes health and denies repo-private paths', async ({ request }) => {
  const health = await request.get('/healthz');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({
    ok: true,
    service: 'agent-apps-preview'
  });

  await expect((await request.get('/games/manifest.json')).status()).toBe(200);
  await expect((await request.get('/node_modules/three/build/three.module.js')).status()).toBe(200);

  for (const privatePath of ['/.git/config', '/package.json', '/scripts/preview-service.mjs', '/.env']) {
    const response = await request.get(privatePath);
    expect(response.status(), `${privatePath} should not be publicly served`).not.toBe(200);
  }
});

test('arcade renders one-click preview and artifact actions', async ({ page }) => {
  await page.goto('/games/arcade/');
  const card = page.getByTestId('game-card-fps-gauntlet');
  await expect(card.getByRole('link', { name: /play neon breach/i })).toHaveAttribute('href', '../fps-gauntlet/');
  await expect(card.getByRole('link', { name: /one-click internal preview/i })).toHaveAttribute('href', /\/games\/fps-gauntlet\//);
  await expect(card.getByText('npm run artifacts:video')).toBeVisible();
  await expect(card.getByText('Latest video artifact')).toBeVisible();
});

test('preview service and video workflow scripts are present and executable', async () => {
  const expected = [
    'scripts/preview-service.mjs',
    'scripts/capture-game-video.mjs',
    'deploy/systemd/user/agent-apps-preview.service'
  ];
  for (const file of expected) {
    const stat = await fs.stat(file);
    expect(stat.isFile()).toBe(true);
  }
  const service = await fs.readFile('deploy/systemd/user/agent-apps-preview.service', 'utf8');
  expect(service).toContain('ExecStart=/usr/bin/env npm run serve:preview');
  expect(service).toContain('WorkingDirectory=/home/merquery/repos/agent-apps');
});
