// Browser request policy only: Host/Origin are not authentication.
import { randomBytes, timingSafeEqual } from 'node:crypto';
const csrfCookie = '__Host-operator-csrf';
export function createOperatorCsrfPolicy({now=Date.now,ttlMs=1800000,maxSessions=1024}={}) {
 const csrfSessions = new Map();
 return function csrfPolicy(req, policy, env = process.env) {
  const enabled = env.OPERATOR_CSRF_ENABLED === 'true' || env.GAME_DEV_WRITES_ENABLED === 'true';
  const endpoint = req.url === '/api/operator/session';
  if (endpoint && req.method!=='GET') return {status:405,error:'Session endpoint requires GET'};
  if (endpoint && ((req.headers.origin && req.headers.origin!==policy.origin) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin') || (req.headers['sec-fetch-mode'] && !['cors','same-origin'].includes(req.headers['sec-fetch-mode'])))) return {status:403,error:'Cross-origin session request denied'};
  if (!enabled) return endpoint ? {session:{csrfRequired:false}} : {};
  for (const [id,value] of csrfSessions) if (value.expiresAt<=now()) csrfSessions.delete(id);
  const cookies = String(req.headers.cookie || '').split(';').map(v=>v.trim().split('='));
  if (cookies.filter(([name])=>name===csrfCookie).length>1) return {status:400,error:'Ambiguous CSRF cookie'};
  const sid = cookies.find(([name])=>name===csrfCookie)?.[1];
  let session = csrfSessions.get(sid);
  if (session?.origin !== policy.origin) session = undefined;
  if (endpoint && req.method === 'GET') {
    let setCookie;
    if (!session) {
      if (csrfSessions.size>=maxSessions) return {status:503,error:'CSRF session capacity reached'};
      const id=randomBytes(32).toString('base64url');
      session={origin:policy.origin,token:randomBytes(32).toString('base64url'),expiresAt:now()+ttlMs};
      csrfSessions.set(id,session);
      setCookie=`${csrfCookie}=${id}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`;
    }
    return {setCookie,session:{csrfRequired:true,csrfToken:session.token,expiresAt:session.expiresAt}};
  }
  if (req.method === 'POST') {
    const token=req.headers['x-operator-csrf'];
    if (!session || typeof token!=='string' || !/^[a-zA-Z0-9_-]{43}$/.test(token) || !timingSafeEqual(Buffer.from(token),Buffer.from(session.token))) return {status:403,error:'CSRF session and token required'};
  }
  return {};
 };
}
export const operatorCsrfPolicy = createOperatorCsrfPolicy();

// Read trusted configuration, never Forwarded/X-Forwarded-* or cookie identity.
function configuredOrigin(value) {
  try {
    const url = new URL(value);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (url.origin !== value || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) return null;
    return url;
  } catch { return null; }
}

export function operatorRequestPolicy(req, env = process.env) {
  // Node can discard duplicate Host/Content-Type fields; inspect the wire list.
  const counts = new Map();
  for (let i = 0; i < (req.rawHeaders || []).length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase();
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  if (['host', 'origin', 'content-type', 'cookie', 'x-operator-csrf'].some(name => counts.get(name) > 1) || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) {
    return { status: 400, error: 'Ambiguous operator request' };
  }
  const app = configuredOrigin(env.PREVIEW_PUBLIC_URL);
  const game = configuredOrigin(env.GAME_DEV_PUBLIC_URL);
  const origin = req.headers.host === app?.host ? app : req.headers.host === game?.host ? game : null;
  if (!origin || (app && game && app.host === game.host)) return { status: 403, error: 'Untrusted operator host configuration' };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!origin || req.headers.origin !== origin.origin)) {
    return { status: 403, error: 'Untrusted operator origin' };
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(req.headers['content-type'] || '')) {
    return { status: 415, error: 'Operator writes require application/json with UTF-8' };
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && ((req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') || (req.headers['sec-fetch-mode'] && !['cors', 'same-origin'].includes(req.headers['sec-fetch-mode'])))) {
    return { status: 403, error: 'Cross-origin operator write denied' };
  }
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) return { status: 405, error: 'Method not allowed' };
  return { scope: origin === game && game ? 'game-dev' : 'apps', origin: origin.origin };
}
