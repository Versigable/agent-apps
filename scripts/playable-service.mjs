#!/usr/bin/env node
// Public playable process: builtins only. Never import an operator adapter.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { downloadRecords, downloadRoute, sendDownload } from './playable-downloads.mjs';

// Linux fd-relative walk: every component is no-follow, including root ancestors.
// Keep the release root-owned/read-only: no untrusted concurrent file writers.
export async function readPublicFile(root, relative) {
  if (!/^[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(relative) || relative.split('/').some(s => !s || s.startsWith('.'))) throw new Error('Invalid path');
  const parts = [...path.resolve(root).split('/').filter(Boolean), ...relative.split('/')];
  let handle = await fs.open('/', constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    for (let i = 0; i < parts.length; i++) {
      const next = await fs.open(`/proc/self/fd/${handle.fd}/${parts[i]}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | (i < parts.length - 1 ? constants.O_DIRECTORY : 0));
      await handle.close(); handle = next;
    }
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 32 * 1024 * 1024) throw new Error('Invalid asset');
    return await handle.readFile();
  } finally { await handle.close(); }
}
import { pathToFileURL } from 'node:url';

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
export function publicFiles(registry) {
  if (!Array.isArray(registry.games) || !Array.isArray(registry.runtime)) throw new Error('Invalid registry');
  const ids = new Set();
  const files = [];
  for (const game of registry.games) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id) || ['dev', 'arcade', 'artifacts', 'scorecards'].includes(game.id) || ids.has(game.id) || typeof game.title !== 'string' || !Array.isArray(game.files) || !game.files.includes('index.html')) throw new Error('Invalid game');
    ids.add(game.id);
    for (const file of game.files) {
      if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-z0-9]+$/.test(file) || !mime[path.extname(file)]) throw new Error('Invalid asset');
      files.push(`games/${game.id}/${file}`);
    }
  }
  for (const file of registry.runtime) {
    if (!/^node_modules\/three\/build\/three\.[a-z.]+\.js$/.test(file)) throw new Error('Invalid runtime');
    files.push(file);
  }
  if (new Set(files).size !== files.length) throw new Error('Duplicate asset');
  return files;
}
export async function createPlayableServer({ root, registry, downloadRoot }) {
  registry = structuredClone(registry);
  const downloads = new Map(downloadRecords(registry.downloads).map(m => [downloadRoute(m),m]));
  const files = new Set(publicFiles(registry));
  // Self-contained player UI: only validated IDs and escaped titles enter the page.
  // Do not reconnect the legacy arcade's operator scripts, catalog or assets.
  const launcher = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Game Arcade</title>
<style>
:root { color-scheme: dark; --bg: #071018; --panel: #0e1a28; --text: #e8f7ff; --muted: #a9bdd0; --cyan: #28e7ff; --green: #69ff9f; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; }
.shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 40px 0; }
.hero { position: relative; padding: clamp(24px, 5vw, 56px); border: 1px solid #284455; border-radius: 24px; background: var(--panel); overflow: hidden; }
.hero::after { content: ""; position: absolute; width: 240px; height: 240px; right: -100px; bottom: -140px; border: 1px solid var(--cyan); border-radius: 50%; box-shadow: 0 0 0 32px #123342, 0 0 0 33px #285669, 0 0 0 65px #102634; pointer-events: none; }
.eyebrow { position: relative; z-index: 1; margin: 0 0 24px; color: var(--green); font-size: .8rem; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; }
h1 { position: relative; z-index: 1; max-width: 850px; margin: 0; font-size: clamp(2.5rem, 7vw, 5.5rem); letter-spacing: -.045em; line-height: 1.05; overflow-wrap: anywhere; }
.lede { position: relative; z-index: 1; max-width: 48ch; margin: 24px 0 0; color: var(--muted); font-size: 1.1rem; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px 24px; margin: 36px 0 16px; }
h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.02em; }
.count { margin: 0; color: var(--muted); font-size: .9rem; }
.game-grid { list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin: 0; padding: 0; }
.game-card { --accent: var(--cyan); display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid #284455; border-top: 3px solid var(--accent); border-radius: 18px; background: var(--panel); }
.game-card:nth-child(3n + 2) { --accent: #f5a5ec; }
.game-card:nth-child(3n) { --accent: var(--green); }
.number { margin: 0 0 16px; color: var(--accent); font-family: ui-monospace, monospace; font-size: .85rem; letter-spacing: .12em; }
h3 { margin: 0 0 28px; font-size: 1.55rem; line-height: 1.3; letter-spacing: -.025em; overflow-wrap: anywhere; }
.play { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; margin-top: auto; padding: 12px 16px; border: 1px solid var(--cyan); border-radius: 10px; background: #102b39; color: var(--cyan); font-weight: 750; text-decoration: none; overflow-wrap: anywhere; }
.play:hover { background: #193d4c; text-decoration: underline; }
.play:focus-visible { outline: 3px solid var(--green); outline-offset: 4px; }
.note { margin: 24px 0 0; color: var(--muted); font-size: .9rem; }
@media (max-width: 950px) { .game-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .shell { width: calc(100% - 32px); padding: 20px 0; } .game-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; } .hero::after { display: none; } .eyebrow { font-size: .75rem; letter-spacing: .1em; } .game-card { padding: 22px; } }
@media (forced-colors: active) { .play:focus-visible { outline-color: Highlight; } }
</style>
</head>
<body>
<main class="shell">
  <header class="hero">
    <p class="eyebrow">Agent-built. Ready to play.</p>
    <h1>Agent Game Arcade</h1>
    <p class="lede">Small worlds. Fresh challenges. Pick a game and jump in, right in your browser.</p>
  </header>
  <section aria-labelledby="games-heading">
    <div class="section-heading"><h2 id="games-heading">Choose your next game</h2><p class="count">${registry.games.length} browser games</p></div>
    <ul class="game-grid" role="list">${registry.games.map((g, index) => `
      <li class="game-card">
        <p class="number" aria-hidden="true">${String(index + 1).padStart(2, '0')} / PLAY</p>
        <h3>${escapeHtml(g.title)}</h3>
        <a class="play" href="/games/${g.id}/" aria-label="Play ${escapeHtml(g.title)}">Play game <span aria-hidden="true">&#8594;</span></a>
      </li>`).join('')}
    </ul>
  </section>
  <p class="note">Each game opens here, in the same tab.</p>
</main>
</body>
</html>`;
  return http.createServer(async (req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8', headers = {}) => {
      res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed', undefined, { allow: 'GET, HEAD' });
      let url = req.url.split('?')[0];
      if (downloads.has(req.url)) return await sendDownload(req,res,downloadRoot,downloads.get(req.url));
      if (url === '/healthz') return send(200, '{"ok":true,"service":"public-playable"}', 'application/json');
      if (url === '/') return send(302, '', undefined, { location: '/games/arcade/' });
      if (url === '/games/arcade/') return send(200, launcher, 'text/html; charset=utf-8');
      if (registry.games.some(g => url === `/games/${g.id}`)) return send(308, '', undefined, { location: `${url}/` });
      if (url.endsWith('/')) url += 'index.html';
      if (!files.has(url.slice(1))) return send(404, 'Not found');
      const body = await readPublicFile(root, url.slice(1));
      send(200, body, mime[path.extname(url)]);
    } catch { if (res.destroyed) return; if (res.headersSent) res.destroy(); else send(404, 'Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.env.PLAYABLE_ROOT || !process.env.PLAYABLE_REGISTRY) throw new Error();
    const registryPath = path.resolve(process.env.PLAYABLE_REGISTRY);
    const registry = JSON.parse(await readPublicFile(path.dirname(registryPath),path.basename(registryPath)));
    const server = await createPlayableServer({ root: process.env.PLAYABLE_ROOT, registry, downloadRoot: process.env.PLAYABLE_DOWNLOAD_ROOT });
    server.listen(Number(process.env.PLAYABLE_PORT || 4173), process.env.PLAYABLE_HOST || '127.0.0.1');
    server.on('error', () => { console.error('Playable service failed'); process.exitCode = 1; });
  } catch { console.error('Invalid playable configuration'); process.exitCode = 1; }
}
