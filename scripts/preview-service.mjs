#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleKanbanRequest } from './kanban-bridge.mjs';
import { handleGameDevRequest } from './game-dev-api.mjs';
import { operatorRequestPolicy, operatorCsrfPolicy } from './operator-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const host = process.env.PREVIEW_HOST || '0.0.0.0';
const port = Number(process.env.PREVIEW_PORT || 4173);
const publicBaseUrl = process.env.PREVIEW_PUBLIC_URL || `http://100.104.27.125:${port}`;
const previewSurface = process.env.PREVIEW_SURFACE || 'all';
const operatorSurface = previewSurface === 'apps' || port === 4175 || Boolean(process.env.GAME_DEV_PUBLIC_URL);
const gameDevShell = new Map([
  ['/games/dev/', 'games/dev/index.html'],
  ['/games/dev/index.html', 'games/dev/index.html'],
  ['/games/dev/app.js', 'games/dev/app.js'],
  ['/games/dev/styles.css', 'games/dev/styles.css'],
  ...['index.html','styles.css','app.js','game-dev.js','playtest-capture.js','build-evidence.js','evidence-validation.mjs','transport.js']
    .map(name=>[`/apps/kanban/${name}`,`apps/kanban/${name}`])
]);

function servesGames() {
  return !operatorSurface && (previewSurface === 'all' || previewSurface === 'games');
}

function servesApps() {
  return operatorSurface || previewSurface === 'all' || previewSurface === 'apps';
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webm', 'video/webm'],
  ['.wasm', 'application/wasm']
]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(!operatorSurface ? { 'access-control-allow-origin': '*' } : {})
  });
  res.end(JSON.stringify(payload, null, 2));
}

function healthPayload() {
  const payload = {
    ok: true,
    service: 'agent-apps-preview',
    surface: previewSurface
  };
  if (servesGames()) {
    payload.arcadeUrl = `${publicBaseUrl}/games/arcade/`;
    payload.manifestUrl = `${publicBaseUrl}/games/manifest.json`;
  }
  if (servesApps()) {
    payload.appDashboardUrl = `${publicBaseUrl}/apps/`;
    payload.kanbanUrl = `${publicBaseUrl}/apps/kanban/`;
  }
  return payload;
}

function safeStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decodedPath).replace(/^[/\\]+/, '');

  const allowed = (servesGames() && (
    normalized.startsWith('games/')
    || normalized === 'games'
    || normalized.startsWith('node_modules/three/build/')
  )) || (servesApps() && (
    normalized.startsWith('apps/')
    || normalized === 'apps'
  ));
  const hasPrivateSegment = normalized.split(/[\\/]+/).some((segment) => segment.startsWith('.'));
  if (!allowed || hasPrivateSegment) return null;

  const fullPath = path.resolve(repoRoot, normalized);
  if (!fullPath.startsWith(repoRoot + path.sep) && fullPath !== repoRoot) return null;
  return fullPath;
}

async function serveStatic(req, res, trustedFile = null) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;
  let filePath = trustedFile ? path.join(repoRoot, trustedFile) : safeStaticPath(pathname);
  if (!filePath) return sendJson(res, 403, { error: 'forbidden' });

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': mimeTypes.get(ext) || 'application/octet-stream',
      'cache-control': ext === '.html' || ext === '.json' ? 'no-store' : 'public, max-age=60',
      ...(!operatorSurface ? { 'access-control-allow-origin': '*' } : {})
    });
    res.end(body);
  } catch (error) {
    sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code || error.message });
  }
}

async function handler(req, res) {
  if (operatorSurface) {
    const policy = operatorRequestPolicy(req);
    if (policy.status) return sendJson(res, policy.status, { error: policy.error });
    const csrf = operatorCsrfPolicy(req, policy);
    if (csrf.status) return sendJson(res, csrf.status, { error: csrf.error });
    if (csrf.session) {
      if (csrf.setCookie) res.setHeader('set-cookie',csrf.setCookie);
      return sendJson(res,200,csrf.session);
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (policy.scope === 'game-dev') {
      if (pathname.startsWith('/api/game-dev/')) return handleGameDevRequest(req, res, { repoRoot });
      if (pathname === '/' || pathname === '/games/dev') {
        res.writeHead(pathname === '/' ? 302 : 308, { location: '/games/dev/' });
        return res.end();
      }
      if (pathname === '/healthz') return sendJson(res, 200, { ok: true, service: 'agent-apps-preview', surface: 'game-dev' });
      if (gameDevShell.has(pathname)) return serveStatic(req, res, gameDevShell.get(pathname));
      return sendJson(res, 403, { error: 'forbidden' });
    }
    // Even an accidental `all` surface on 4175 must not expose player code.
    if (!(pathname === '/' || pathname === '/healthz' || pathname === '/apps' || pathname.startsWith('/apps/') || pathname.startsWith('/api/kanban/'))) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // Legacy local preview has no operator session. This compatibility discovery
  // response issues no token/cookie and cannot activate the scoped write path.
  if (!operatorSurface && req.url === '/api/operator/session') {
    return sendJson(res,req.method==='GET' ? 200 : 405,req.method==='GET' ? {csrfRequired:false} : {error:'Method not allowed'});
  }
  if (url.pathname.startsWith('/api/game-dev/')) {
    if (!servesGames()) return sendJson(res, 403, { error: 'forbidden' });
    if (!['GET','HEAD'].includes(req.method)) return sendJson(res,405,{error:'Scoped writes require the operator surface'});
    return handleGameDevRequest(req, res, { repoRoot });
  }
  if (servesGames() && url.pathname === '/games/dev') {
    res.writeHead(308, { location: '/games/dev/' });
    return res.end();
  }
  if (servesApps() && url.pathname.startsWith('/api/kanban/')) {
    return handleKanbanRequest(req, res, { repoRoot });
  }
  if (url.pathname === '/') {
    res.writeHead(302, { location: servesApps() && !servesGames() ? '/apps/' : '/games/arcade/' });
    return res.end();
  }
  if (servesApps() && url.pathname === '/apps') {
    res.writeHead(308, { location: '/apps/' });
    return res.end();
  }
  if (servesApps() && url.pathname === '/apps/kanban') {
    res.writeHead(308, { location: '/apps/kanban/' });
    return res.end();
  }
  if (url.pathname === '/healthz') {
    return sendJson(res, 200, healthPayload());
  }
  if (url.pathname === '/__preview/manifest') {
    if (!servesGames()) return sendJson(res, 403, { error: 'forbidden' });
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'games/manifest.json'), 'utf8'));
    return sendJson(res, 200, { ...manifest, resolvedAt: new Date().toISOString() });
  }
  return serveStatic(req, res);
}

async function healthcheck() {
  const url = `http://127.0.0.1:${port}/healthz`;
  const headers = operatorSurface ? { host: new URL(process.env.PREVIEW_PUBLIC_URL).host } : {};
  const payload = await new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Preview healthcheck failed: ${response.statusCode}`));
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('Preview healthcheck timed out')));
  });
  console.log(JSON.stringify(payload, null, 2));
}

if (process.argv.includes('--healthcheck')) {
  healthcheck().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  const server = http.createServer((req, res) => handler(req, res).catch((error) => sendJson(res, 500, { error: error.message })));
  server.listen(port, host, () => {
    console.log(`agent-apps-preview listening on http://${host}:${port}`);
    if (servesGames()) console.log(`Arcade: ${publicBaseUrl}/games/arcade/`);
    if (servesApps()) console.log(`App dock: ${publicBaseUrl}/apps/`);
    if (servesApps()) console.log(`Kanban: ${publicBaseUrl}/apps/kanban/`);
  });
}
