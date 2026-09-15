import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { handleKanbanRequest } from '../scripts/kanban-bridge.mjs';

function crc(bytes) { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i=0;i<8;i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type); const out = Buffer.alloc(data.length+12); out.writeUInt32BE(data.length); t.copy(out,4); data.copy(out,8); out.writeUInt32BE(crc(Buffer.concat([t,data])),out.length-4); return out; }
export function png() { const h=Buffer.alloc(13);h.writeUInt32BE(1);h.writeUInt32BE(1,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]); }
test('capture rejects unsafe/oversized images, unbounded fields and fabricated build certainty', async () => {
 const { validateGameDev, encodeGameDev, parseGameDev } = await import('../scripts/kanban-games.mjs');
 const meta = c => ({game_id:'snowdown',milestone:'Playtest',discipline:'qa',capture:c});
 const c = capture();
 for (const bad of [null, {}, {...c,version:2}, {...c,extra:true}, {...c,build:{url:'javascript:alert(1)',identifier:null}}, {...c,build:{url:c.build.url}}, {...c,build:{...c.build,identifier:''}}, {...c,build:{...c.build,identifier:'x'.repeat(161)}}, {...c,screenshot:{mime:'image/svg+xml',base64:Buffer.from('<svg/>').toString('base64')}}, {...c,screenshot:{mime:'image/png',base64:Buffer.from('<html/>').toString('base64')}}, {...c,screenshot:{mime:'image/png',base64:Buffer.alloc(65537).toString('base64')}}, {...c,screenshot:{mime:'image/png',base64:Buffer.concat([png(),Buffer.from('<script/>')]).toString('base64')}}]) {
  expect(() => validateGameDev(meta(bad))).toThrow();
 }
 const corrupt=png();corrupt[45]^=1;expect(()=>validateGameDev(meta({...c,screenshot:{mime:'image/png',base64:corrupt.toString('base64')}}))).toThrow();
 expect(validateGameDev(meta({...c,screenshot:null})).capture.build.identifier).toBeNull();
 expect(validateGameDev(meta({...c,build:{...c.build,identifier:'commit:6199556'}})).capture.build.identifier).toBe('commit:6199556');
 // A real screenshot larger than the legacy 1KB metadata parser survives.
 const h=Buffer.alloc(13);h.writeUInt32BE(100);h.writeUInt32BE(100,4);h[8]=8;h[9]=6;
 const raw=Buffer.alloc(40100);for(let i=0;i<100;i++) for(let j=1;j<=400;j++) raw[i*401+j]=(i*131+j*17)%256;
 const image=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 const big=meta({...c,screenshot:{mime:'image/png',base64:image.toString('base64')}});
 expect(JSON.stringify(big).length).toBeGreaterThan(1024);expect(parseGameDev(encodeGameDev('notes',big))).toEqual(big);
});

const capture = () => ({ version: 1, build: { url: 'https://game-preview.ninjaprivacy.org/games/snowdown/', identifier: null }, screenshot: { mime: 'image/png', base64: png().toString('base64') } });
async function api(url, payload) { const req=Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);Object.assign(req,{url,method:payload===undefined?'GET':'POST',headers:{host:'localhost'}});let code,data;await handleKanbanRequest(req,{writeHead(v){code=v;},end(v){data=JSON.parse(v);}},{repoRoot:path.resolve('.')});return {code,data}; }

test('playtest persists through ordinary create, idempotent retry and readonly SQLite board roundtrip', async () => {
 const saved={...process.env};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'playtest-db-'));
 try {
  const db=path.join(dir,'kanban.db'), cli=path.join(dir,'hermes');
  await fs.writeFile(cli, `#!/usr/bin/env python3\nimport os,sys,json,sqlite3\na=sys.argv\ndef get(k): return a[a.index(k)+1]\nwith sqlite3.connect(os.environ['HERMES_KANBAN_DB']) as c:\n c.execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT, title TEXT, body TEXT, status TEXT, ikey TEXT UNIQUE)')\n c.execute('INSERT OR IGNORE INTO tasks VALUES (?,?,?,?,?)',('capture-1',a[a.index('create')+1],get('--body'),'triage',get('--idempotency-key')))\n row=c.execute('SELECT id,title,body,status FROM tasks WHERE ikey=?',(get('--idempotency-key'),)).fetchone()\n print(json.dumps(dict(zip(['id','title','body','status'],row)) | {'args':a}))\n`);await fs.chmod(cli,0o700);
  Object.assign(process.env,{KANBAN_MODE:'live',KANBAN_READONLY:'false',HERMES_BIN:cli,HERMES_KANBAN_DB:db});
  const game_dev={game_id:'snowdown',milestone:'Playtest',discipline:'qa',capture:capture()};
  const payload={title:'Landing clips',body:'Jump near the wall',triage:true,idempotency_key:'playtest-one',game_dev};
  for (const extra of [{triage:false},{assignee:'worker'},{idempotency_key:''}]) expect((await api('/api/kanban/tasks',{...payload,...extra})).code).toBe(400);
  expect((await api('/api/kanban/tasks',{...payload,body:'x'.repeat(200000)})).code).toBe(413);
  // Valid incompressible raster + multibyte notes fits character cap, not byte cap.
  const h=Buffer.alloc(13);h.writeUInt32BE(120);h.writeUInt32BE(120,4);h[8]=8;h[9]=6;
  const raw=Buffer.alloc(57720);let seed=12345;for(let i=0;i<raw.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;raw[i]=i%481===0?0:seed&255;}
  const large=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  const multilingual={...payload,body:'界'.repeat(7900),game_dev:{...game_dev,capture:{...capture(),screenshot:{mime:'image/png',base64:large.toString('base64')}}}};
  const {encodeGameDev}=await import('../scripts/kanban-games.mjs');const encoded=encodeGameDev(multilingual.body,multilingual.game_dev);
  expect(encoded.length).toBeLessThan(100000);expect(Buffer.byteLength(encoded,'utf8')).toBeGreaterThan(100000);
  expect((await api('/api/kanban/tasks',multilingual)).code).toBe(400);
  const created=await api('/api/kanban/tasks',payload);
  expect(created.code).toBe(201);expect(created.data.task.game_dev).toEqual(game_dev);
  expect(created.data.task.args).toContain('--triage');expect(created.data.task.args).not.toContain('--assignee');
  expect((await api('/api/kanban/tasks',payload)).data.task.id).toBe(created.data.task.id);
  const board=await api('/api/kanban/board');expect(board.code).toBe(200);
  const tasks=board.data.columns.flatMap(c=>c.tasks);expect(tasks).toHaveLength(1);expect(tasks[0].game_dev).toEqual(game_dev);
  expect(Buffer.from(tasks[0].game_dev.capture.screenshot.base64,'base64')).toEqual(png());
  expect(execFileSync('python3',['-c',`import sqlite3;print(sqlite3.connect(${JSON.stringify(db)}).execute('select count(*) from tasks').fetchone()[0])`],{encoding:'utf8'}).trim()).toBe('1');
 } finally {process.env=saved;await fs.rm(dir,{recursive:true,force:true});}
});
