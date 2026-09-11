#!/usr/bin/env node
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const gameId = process.argv[2] || 'fps-gauntlet';
const port = Number(process.env.PREVIEW_PORT || 4173);
const baseUrl = process.env.PREVIEW_BASE_URL || `http://127.0.0.1:${port}`;
const durationMs = Number(process.env.ARTIFACT_VIDEO_MS || 10_000);
const videoDir = path.join(repoRoot, 'games/artifacts/videos');
const screenshotDir = path.join(repoRoot, 'games/artifacts/test-results/smoke-screenshots');
const summaryPath = path.join(repoRoot, 'games/artifacts/latest-run.json');

async function healthOk() {
  try {
    const response = await fetch(`${baseUrl}/healthz`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await healthOk()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function killProcessGroup(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

async function ensurePreviewServer() {
  if (await healthOk()) return null;
  const child = spawn('npm', ['run', 'serve:preview'], {
    cwd: repoRoot,
    env: { ...process.env, PREVIEW_HOST: '127.0.0.1' },
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });
  if (!(await waitForHealth())) {
    killProcessGroup(child);
    throw new Error('Preview service did not become healthy');
  }
  return child;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(videoDir, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });

  let server = null;
  let browser = null;
  let context = null;
  let tempVideoDir = null;

  try {
    server = await ensurePreviewServer();
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'games/manifest.json'), 'utf8'));
    const game = manifest.games.find((candidate) => candidate.id === gameId);
    if (!game) throw new Error(`Unknown game id: ${gameId}`);

    const consoleErrors = [];
    tempVideoDir = path.join(videoDir, `.tmp-${gameId}-${Date.now()}`);
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: tempVideoDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    const previewPath = game.previewPath || game.playUrl.replace(/^\./, '/games');
    const previewUrl = `${baseUrl}${previewPath}`;
    await page.goto(previewUrl, { waitUntil: 'networkidle' });
    const startButton = gameId === 'snowdown'
      ? page.getByRole('button', { name: /ride together|play co-op|start co-op/i })
      : page.getByRole('button', { name: /start breach|open the greenhouse|start|play/i });
    if (await startButton.count()) await startButton.first().click();
    let gameplayEvidence = null;
    if (gameId === 'snowdown') {
      await page.waitForFunction(() => document.querySelector('#game-root')?.dataset.state === 'playing');
      gameplayEvidence = { before: await page.evaluate(() => window.__snowdown.snapshot()), milestones: [] };
      // Real two-player inputs: no forced progression or invulnerability.
      await page.keyboard.down('KeyF');
      await page.keyboard.down('KeyK');
      const started = Date.now();
      const routes = [['KeyW', 'ArrowUp'], ['KeyD', 'ArrowRight'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft']];
      let leg = 0, capturedBoss = false;
      while (Date.now() - started < durationMs) {
        const keys = routes[leg % routes.length];
        const chargeKey = leg % 3 === 0 ? (leg % 2 ? 'KeyJ' : 'KeyH') : null;
        for (const key of keys) await page.keyboard.down(key);
        if (chargeKey) await page.keyboard.down(chargeKey);
        if (leg % 3 === 1) { await page.keyboard.press('KeyG'); await page.keyboard.press('KeyL'); }
        await page.waitForTimeout(Math.min(1100, Math.max(0, durationMs - (Date.now() - started))));
        if (chargeKey) await page.keyboard.up(chargeKey);
        for (const key of keys) await page.keyboard.up(key);
        const sample = await page.evaluate(() => window.__snowdown.snapshot());
        gameplayEvidence.milestones.push({ wallMs: Date.now() - started, ...sample });
        if (sample.boss?.hp > 0 && !capturedBoss) {
          await page.screenshot({ path: path.join(screenshotDir, 'snowdown-boss-latest.png'), timeout: 30000 });
          capturedBoss = true;
        }
        if (sample.state === 'won' || sample.state === 'lost') break;
        leg++;
      }
      await page.keyboard.up('KeyF');
      await page.keyboard.up('KeyK');
      gameplayEvidence.after = await page.evaluate(() => window.__snowdown.snapshot());
      if (gameplayEvidence.after.shots <= gameplayEvidence.before.shots) {
        throw new Error('Snowdown capture recorded no real snowball throws');
      }
    } else {
      await page.keyboard.down('KeyW');
      await page.keyboard.down('KeyD');
      for (let i = 0; i < Math.max(3, Math.floor(durationMs / 700)); i += 1) {
        await page.keyboard.press('KeyF');
        await page.waitForTimeout(500);
      }
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyD');
    }

    const latestScreenshot = path.join(screenshotDir, `${gameId}-latest.png`);
    await page.screenshot({ path: latestScreenshot, fullPage: true });
    const video = page.video();
    await context.close();
    context = null;
    await browser.close();
    browser = null;

    const latestVideo = path.join(videoDir, `${gameId}-latest.webm`);
    if (video) {
      const actualVideo = await video.path();
      if (await fileExists(actualVideo)) await fs.copyFile(actualVideo, latestVideo);
    }
    await fs.rm(tempVideoDir, { recursive: true, force: true });
    tempVideoDir = null;

    const summary = {
      generatedAt: new Date().toISOString(),
      gameId,
      previewUrl,
      durationMs,
      ...(gameplayEvidence ? { gameplayEvidence } : {}),
      screenshot: path.relative(repoRoot, latestScreenshot),
      video: path.relative(repoRoot, latestVideo),
      consoleErrors,
      ok: consoleErrors.length === 0
    };
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(consoleErrors.length ? 1 : 0);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (tempVideoDir) await fs.rm(tempVideoDir, { recursive: true, force: true }).catch(() => {});
    if (server) {
      killProcessGroup(server);
      await new Promise((resolve) => {
        server.once('exit', resolve);
        setTimeout(resolve, 2_000).unref();
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
