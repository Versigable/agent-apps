import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function withPreviewSurface(surface, port, callback) {
  const child = spawn('node', ['scripts/preview-service.mjs'], {
    env: {
      ...process.env,
      PREVIEW_HOST: '127.0.0.1',
      PREVIEW_PORT: String(port),
      PREVIEW_SURFACE: surface,
      PREVIEW_PUBLIC_URL: `http://127.0.0.1:${port}`,
      KANBAN_MODE: 'fixture'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const health = await fetch(`${baseUrl}/healthz`);
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {
        // keep polling until the preview process has bound its port
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(ready, `${surface} preview server should become healthy`).toBe(true);
    await callback(baseUrl);
  } finally {
    child.kill('SIGTERM');
  }
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
    service: 'agent-apps-preview',
    surface: 'all'
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

test('preview surface mode separates app-preview from game-preview routes', async () => {
  await withPreviewSurface('apps', 4195, async (baseUrl) => {
    const appHealth = await (await fetch(`${baseUrl}/healthz`)).json();
    expect(appHealth).toMatchObject({ surface: 'apps', kanbanUrl: `${baseUrl}/apps/kanban/` });
    expect(appHealth).not.toHaveProperty('arcadeUrl');
    expect(appHealth).not.toHaveProperty('manifestUrl');
    expect((await fetch(`${baseUrl}/apps/kanban/`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/kanban/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/games/arcade/`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/games/manifest.json`)).status).toBe(403);
  });

  await withPreviewSurface('games', 4196, async (baseUrl) => {
    const gameHealth = await (await fetch(`${baseUrl}/healthz`)).json();
    expect(gameHealth).toMatchObject({ surface: 'games', arcadeUrl: `${baseUrl}/games/arcade/` });
    expect(gameHealth).not.toHaveProperty('kanbanUrl');
    expect((await fetch(`${baseUrl}/games/arcade/`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/games/manifest.json`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/apps/kanban/`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/kanban/health`)).status).toBe(403);
  });
});

test('preview service and video workflow scripts are present and executable', async () => {
  const expected = [
    'scripts/preview-service.mjs',
    'scripts/install-app-preview-service.sh',
    'scripts/capture-game-video.mjs',
    'deploy/systemd/user/agent-apps-preview.service',
    'deploy/systemd/user/agent-app-preview.service'
  ];
  for (const file of expected) {
    const stat = await fs.stat(file);
    expect(stat.isFile()).toBe(true);
  }
  const service = await fs.readFile('deploy/systemd/user/agent-apps-preview.service', 'utf8');
  expect(service).toContain('ExecStart=/usr/bin/env npm run serve:preview');
  expect(service).toContain('WorkingDirectory=/home/merquery/repos/agent-apps');
  expect(service).toContain('Environment=PREVIEW_PORT=4173');
  expect(service).toContain('Environment=PREVIEW_PUBLIC_URL=https://game-preview.ninjaprivacy.org');
  expect(service).toContain('Environment=PREVIEW_SURFACE=games');

  const appService = await fs.readFile('deploy/systemd/user/agent-app-preview.service', 'utf8');
  expect(appService).toContain('ExecStart=/usr/bin/env npm run serve:preview');
  expect(appService).toContain('WorkingDirectory=/home/merquery/repos/agent-apps');
  expect(appService).toContain('Environment=PREVIEW_PORT=4175');
  expect(appService).toContain('Environment=PREVIEW_PUBLIC_URL=https://app-preview.ninjaprivacy.org');
  expect(appService).toContain('Environment=PREVIEW_SURFACE=apps');
});
