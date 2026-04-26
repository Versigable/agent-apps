#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const host = process.env.PREVIEW_HOST || '0.0.0.0';
const port = Number(process.env.PREVIEW_PORT || 4173);
const publicBaseUrl = process.env.PREVIEW_PUBLIC_URL || `http://100.104.27.125:${port}`;

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
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function safeStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decodedPath).replace(/^[/\\]+/, '');

  const allowed = normalized.startsWith('games/')
    || normalized === 'games'
    || normalized.startsWith('node_modules/three/build/');
  const hasPrivateSegment = normalized.split(/[\\/]+/).some((segment) => segment.startsWith('.'));
  if (!allowed || hasPrivateSegment) return null;

  const fullPath = path.resolve(repoRoot, normalized);
  if (!fullPath.startsWith(repoRoot + path.sep) && fullPath !== repoRoot) return null;
  return fullPath;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/games/arcade/';
  let filePath = safeStaticPath(pathname);
  if (!filePath) return sendJson(res, 403, { error: 'forbidden' });

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': mimeTypes.get(ext) || 'application/octet-stream',
      'cache-control': ext === '.html' || ext === '.json' ? 'no-store' : 'public, max-age=60',
      'access-control-allow-origin': '*'
    });
    res.end(body);
  } catch (error) {
    sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code || error.message });
  }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/healthz') {
    return sendJson(res, 200, {
      ok: true,
      service: 'agent-apps-preview',
      arcadeUrl: `${publicBaseUrl}/games/arcade/`,
      manifestUrl: `${publicBaseUrl}/games/manifest.json`
    });
  }
  if (url.pathname === '/__preview/manifest') {
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'games/manifest.json'), 'utf8'));
    return sendJson(res, 200, { ...manifest, resolvedAt: new Date().toISOString() });
  }
  return serveStatic(req, res);
}

async function healthcheck() {
  const url = `http://127.0.0.1:${port}/healthz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Preview healthcheck failed: ${response.status}`);
  const payload = await response.json();
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
    console.log(`Arcade: ${publicBaseUrl}/games/arcade/`);
  });
}
