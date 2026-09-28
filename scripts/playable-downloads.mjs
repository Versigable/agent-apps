// Public read-only ZIP reader: builtins only; no publisher/store/operator imports.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const fail = () => { throw new Error('Download unavailable'); };
const slug = value => typeof value === 'string' && value.length <= 80 && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}(?:\.[a-zA-Z0-9_-]+)*$/.test(value) && !value.includes('--');
export const downloadKey = m => `${m.game}--${m.version}--${m.platform}`;
export const downloadRoute = m => `/downloads/${m.game}/${m.version}/${m.platform}.zip`;
export function downloadRecords(records = []) {
  if (!Array.isArray(records) || records.length > 10000) fail();
  const seen = new Set();
  return records.map(m => {
    if (!m || ![m.game,m.version,m.platform].every(slug) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(m.game) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(m.platform) || typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.size) || m.size < 1 || m.size > 2*1024**3 || typeof m.notes !== 'string' || [...m.notes].length > 4000 || /[\x00-\x08\x0b-\x1f]/.test(m.notes) || typeof m.date !== 'string' || !Number.isFinite(Date.parse(m.date)) || Buffer.byteLength(JSON.stringify(m)) > 16384) fail();
    const clean = {game:m.game,version:m.version,platform:m.platform,date:m.date,size:m.size,notes:m.notes,sha256:m.sha256};
    if (Object.keys(m).some(k => !Object.hasOwn(clean,k)) || seen.has(downloadKey(m))) fail();
    seen.add(downloadKey(m)); return clean;
  });
}
// Pin every ancestor and the final fd; no path reopen after validation.
export async function openDownloadFile(root, relative, max) {
  if (!root || relative.split('/').some(p => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(p) || p.length > 240)) fail();
  const rootParts = path.resolve(root).split('/').filter(Boolean);
  const parts = [...rootParts,...relative.split('/')];
  let handle = await fs.open('/',constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    for (let i=0;i<parts.length;i++) {
      const next = await fs.open(`/proc/self/fd/${handle.fd}/${parts[i]}`,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | (i<parts.length-1 ? constants.O_DIRECTORY : 0));
      await handle.close(); handle=next;
      if (i >= rootParts.length-1 && i < parts.length-1 && ((await handle.stat()).mode & 0o022)) fail();
    }
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > max || (stat.mode & 0o222)) fail();
    const result=handle; handle=null; return result;
  } finally { await handle?.close(); }
}
const unchanged = (a,b) => a.dev===b.dev && a.ino===b.ino && a.size===b.size && a.mtimeNs===b.mtimeNs && a.ctimeNs===b.ctimeNs && b.nlink===1n;
export async function verifiedDownload(root, meta, signal) {
  signal?.throwIfAborted();
  const file = await openDownloadFile(root,`${downloadKey(meta)}/build.zip`,2*1024**3);
  try {
    signal?.throwIfAborted();
    const before = await file.stat({bigint:true});
    if (before.size !== BigInt(meta.size)) fail();
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({autoClose:false,start:0,highWaterMark:64*1024,signal})) {
      signal?.throwIfAborted();
      hash.update(chunk);
    }
    if (hash.digest('hex') !== meta.sha256 || !unchanged(before,await file.stat({bigint:true}))) fail();
    signal?.throwIfAborted();
    return file;
  } catch (error) { await file.close(); throw error; }
}
export async function sendDownload(req,res,root,meta) {
  const controller = new AbortController();
  const { signal } = controller;
  // IncomingMessage 'close' also means a normally completed GET: not an abort.
  const socket = req.socket;
  const cancelDownload = () => { if (!res.writableFinished) controller.abort(); };
  res.once('close',cancelDownload);
  socket.once('close',cancelDownload);
  let file;
  try {
    if (req.aborted || res.destroyed || socket.destroyed) controller.abort();
    signal.throwIfAborted();
    file = await verifiedDownload(root,meta,signal);
    signal.throwIfAborted();
    res.writeHead(200,{'content-type':'application/zip','content-length':meta.size,'content-disposition':`attachment; filename="${meta.game}-${meta.version}-${meta.platform}.zip"`,'x-content-type-options':'nosniff','cache-control':'private, max-age=31536000, immutable','etag':`"sha256-${meta.sha256}"`});
    if (req.method === 'HEAD') res.end();
    else await pipeline(file.createReadStream({autoClose:false,start:0,end:meta.size-1,highWaterMark:64*1024,signal}),res,{signal});
  } finally {
    res.off('close',cancelDownload);
    socket.off('close',cancelDownload);
    await file?.close();
  }
}
