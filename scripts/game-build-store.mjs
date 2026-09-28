import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

// Linux fd-relative opens pin each directory and reject symlinks at every step.
// Store owner is trusted; no web writes or user-supplied file paths exist.
const slug = value => typeof value === 'string' && value.length <= 80 && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}(?:\.[a-zA-Z0-9_-]+)*$/.test(value) && !value.includes('--');
const fail = () => { throw new Error('Build unavailable'); };
const fdPath = (handle, name) => `/proc/self/fd/${handle.fd}/${name}`;
async function directory(file) {
 const h = await fs.open(file, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
 const s = await h.stat();
 if (s.mode & 0o022) { await h.close(); fail(); }
 return h;
}
async function rootHandle() {
 const root = path.resolve(process.env.GAME_BUILD_STORE || path.join(os.homedir(), '.local/share/agent-game-builds'));
 // Walk without following any symlink, including ancestors.
 let current = await fs.open('/', constants.O_RDONLY | constants.O_DIRECTORY);
 try {
  for (const part of root.split('/').filter(Boolean)) {
   if (['brain','.git','.hermes'].includes(part) || part.endsWith('-brain')) fail();
   const next = await fs.open(fdPath(current,part),constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
   await current.close(); current = next;
   try { await fs.lstat(fdPath(current,'.git')); fail(); } catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  if ((await current.stat()).mode & 0o022) fail();
  return current;
 } catch(e) { await current.close(); throw e; }
}
async function regular(dir, name, max) {
 const h = await fs.open(fdPath(dir,name),constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 const s=await h.stat();
 if (!s.isFile() || s.nlink!==1 || s.size>max) {await h.close();fail();}
 return h;
}
async function readBuild(root, game, version, platform, withFile=false) {
 if (![game,version,platform].every(slug)) fail();
 const dir=await directory(fdPath(root,`${game}--${version}--${platform}`));
 let file;
 try {
  // Match publish-game-build.py: total serialized bytes and Unicode code points,
  // not JS UTF-16 code units. Publication checks both before the final rename.
  const handle=await regular(dir,'metadata.json',16384); let meta;
  try {meta=JSON.parse(await handle.readFile('utf8'));} finally {await handle.close();}
  if(meta.game!==game || meta.version!==version || meta.platform!==platform || !/^[a-f0-9]{64}$/.test(meta.sha256) || !Number.isSafeInteger(meta.size) || meta.size<1 || meta.size>2*1024**3 || typeof meta.notes!=='string' || [...meta.notes].length>4000 || typeof meta.date!=='string' || !Number.isFinite(Date.parse(meta.date))) fail();
  file=await regular(dir,'build.zip',2*1024**3);
  if ((await file.stat()).size!==meta.size) fail();
  const result={game,version,platform,date:meta.date,size:meta.size,notes:meta.notes,sha256:meta.sha256,downloadUrl:`/api/game-dev/games/${game}/builds/${version}/${platform}/download`};
  if(withFile) {const retained=file;file=null;return {meta:result,file:retained};}
  return result;
 } finally {await file?.close();await dir.close();}
}
export async function listBuilds(game) {
 if(!slug(game)) fail();
 let root;
 try {root=await rootHandle();} catch(e) {if(e.code==='ENOENT') return []; throw e;}
 try {
  const builds=[];
  for(const name of await fs.readdir(fdPath(root,''))) {
   const parts=name.split('--'); if(parts.length!==3 || parts[0]!==game) continue;
   try {builds.push(await readBuild(root,...parts));} catch { /* invalid entries are never advertised */ }
  }
  return builds.sort((a,b)=>b.date.localeCompare(a.date)||a.version.localeCompare(b.version)||a.platform.localeCompare(b.platform));
 } finally {await root.close();}
}
export async function downloadBuild(req,res,game,version,platform) {
 const root=await rootHandle(); let build;
 try {build=await readBuild(root,game,version,platform,true);} finally {await root.close();}
 const {meta,file}=build;
 try {
  // Hash from the same pinned fd, bounded-memory; never advertise corrupt bytes.
  const hash=createHash('sha256');
  for await(const chunk of file.createReadStream({autoClose:false,start:0})) hash.update(chunk);
  if(hash.digest('hex')!==meta.sha256) fail();
  res.writeHead(200,{'content-type':'application/zip','content-length':meta.size,'content-disposition':`attachment; filename="${game}-${version}-${platform}.zip"`,'x-content-type-options':'nosniff','cache-control':'private, max-age=31536000, immutable','etag':`"sha256-${meta.sha256}"`});
  if(req.method==='HEAD') res.end();
  else await pipeline(file.createReadStream({autoClose:false,start:0}),res);
 } finally {await file.close();}
}
