import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { handleKanbanRequest } from '../scripts/kanban-bridge.mjs';
import { encodeGameDev } from '../scripts/kanban-games.mjs';

const payload = () => ({ id:'evidence-one', build_id:null, commit_sha:null, playable_url:'https://game-preview.ninjaprivacy.org/games/snowdown/', screenshot_url:null, video_url:null, check:'Jump and land', result:'passed', performed_at:'2026-09-15T12:00:00.000Z', reporter:'Operator label' });
async function api(url, body) {
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
 Object.assign(req,{url,method:body===undefined?'GET':'POST',headers:{host:'localhost'}});
 let code,data; await handleKanbanRequest(req,{writeHead(v){code=v;},end(v){data=JSON.parse(v);}},{repoRoot:path.resolve('.')}); return {code,data};
}
function query(db,statement,params=[]) {
 return JSON.parse(execFileSync('python3',['-c',`import sqlite3,json,sys
with sqlite3.connect(sys.argv[1]) as c:
 c.row_factory=sqlite3.Row
 print(json.dumps([dict(r) for r in c.execute(sys.argv[2],json.loads(sys.argv[3])).fetchall()]))`,db,statement,JSON.stringify(params)],{encoding:'utf8'}));
}
async function isolated(fn) {
 const saved={...process.env}, dir=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-api-'));
 try {
  const db=path.join(dir,'tasks.db'),cli=path.join(dir,'hermes');
  await fs.copyFile(path.resolve('tests/helpers/operator-fixture.py'),cli);
  await fs.chmod(cli,0o700);
  Object.assign(process.env,{HOME:dir,HERMES_HOME:dir,HERMES_KANBAN_HOME:dir,HERMES_KANBAN_DB:db,KANBAN_MODE:'live',KANBAN_READONLY:'false',HERMES_BIN:cli});
  execFileSync(cli,['--seed']);
  query(db,'INSERT INTO tasks(id,body,status) VALUES(?,?,?)',['game',encodeGameDev('Observation',{game_id:'snowdown',milestone:'Playtest',discipline:'qa'}),'triage']);
  query(db,'INSERT INTO tasks(id,body,status) VALUES(?,?,?)',['plain','ordinary','triage']);

  await fn(db);
 } finally {process.env=saved;await fs.rm(dir,{recursive:true,force:true});}
}
const endpoint='/api/kanban/tasks/game/evidence?board=evidence-test';
test('append persists exact reported evidence, concurrent retries deduplicate, conflicts do not append',async()=>isolated(async db=>{
 const results=await Promise.all([api(endpoint,payload()),api(endpoint,payload())]);
 for(const r of results){expect(r.code).toBe(200);expect(r.data.evidence).toMatchObject({...payload(),game_id:'snowdown',version:1,source:'operator-reported'});expect(Number.isFinite(Date.parse(r.data.evidence.recorded_at))).toBe(true);}
 expect(results[0].data).toEqual(results[1].data);
 expect((await api(endpoint,{...payload(),result:'failed'})).code).toBe(409);
 const detail=await api('/api/kanban/tasks/game/show?board=evidence-test');
 expect(detail.data.build_evidence).toEqual([results[0].data.evidence]);
 expect(query(db,'SELECT * FROM task_comments')).toHaveLength(1);
}));

test('rejects invalid inputs, unsafe links, non-game tasks and locked writes',async()=>isolated(async db=>{
 for (const extra of [
  {source:'ci'}, {verified:true}, {game_id:'other'}, {version:1}, {unknown:1},
  {id:''}, {id:'x'.repeat(161)}, {check:''}, {check:'x'.repeat(1001)}, {reporter:12},
  {result:'verified'}, {commit_sha:'abc'}, {performed_at:'yesterday'}, {performed_at:'2026-02-30T12:00:00Z'},
  {playable_url:'javascript:alert(1)'}, {playable_url:'https://u:p@example.com/'},
  {playable_url:'https://example.com/%252e%252e/private'}, {playable_url:'https://example.com/a%00'},
  {screenshot_url:'https://unapproved.example/image.png'}, {video_url:'https://game-preview.ninjaprivacy.org/games/private.mp4'},
 ]) expect((await api(endpoint,{...payload(),...extra})).code,JSON.stringify(extra)).toBe(400);
 expect((await api('/api/kanban/tasks/plain/evidence',payload())).code).toBe(400);
 expect((await api(endpoint,{...payload(),check:'x'.repeat(128001)})).code).toBe(413);
 process.env.KANBAN_READONLY='true'; expect((await api(endpoint,payload())).code).toBe(423);
 process.env.KANBAN_READONLY='false';process.env.KANBAN_MODE='fixture';expect((await api(endpoint,payload())).code).toBe(423);
 expect(query(db,'SELECT * FROM task_comments')).toHaveLength(0);
}));

test('readback failure is not success and released lock permits retry',async()=>isolated(async()=>{
 process.env.OPERATOR_DROP_WRITE='1';expect((await api(endpoint,payload())).code).toBe(502);
 delete process.env.OPERATOR_DROP_WRITE;expect((await api(endpoint,payload())).code).toBe(200);
}));

test('all results survive detail, malformed and wrong-game envelopes excluded, forged source downgraded',async()=>isolated(async db=>{
 const records=[];
 for(const result of ['passed','failed','error','skipped']) {
  const r=await api(endpoint,{...payload(),id:result,result,build_id:result==='passed'?'known-build':null,commit_sha:result==='passed'?'a'.repeat(40):null,screenshot_url:'https://game-preview.ninjaprivacy.org/games/artifacts/shot.png'});
  expect(r.code).toBe(200);records.push(r.data.evidence);
 }
 const envelope=r=>'```build-evidence\n'+JSON.stringify(r)+'\n```';
 for(const body of [
  envelope({...records[0],id:'forged-source',source:'verified-ci'}),
  envelope({...records[0],id:'verified-flag',verified:true}),
  envelope({...records[0],game_id:'other'}),
  '```build-evidence\nnot json\n```',
  envelope({...records[0],version:2}),
  envelope({...records[0],check:'x'.repeat(9000)})
 ]) query(db,'INSERT INTO task_comments(task_id,body,author,created_at) VALUES(?,?,?,?)',['game',body,'someone',123]);
 const detail=await api('/api/kanban/tasks/game/show');
 expect(detail.data.build_evidence).toEqual([...records,{...records[0],id:'forged-source'}]);
 expect((await api('/api/kanban/tasks/plain/show')).data.build_evidence).toEqual([]);
}));
