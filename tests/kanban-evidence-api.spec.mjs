import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
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
async function isolated(fn) {
 const saved={...process.env}, dir=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-api-'));
 try {
  const db=path.join(dir,'tasks.json'),cli=path.join(dir,'hermes');
  await fs.writeFile(db,JSON.stringify({task:{id:'game',body:encodeGameDev('Observation',{game_id:'snowdown',milestone:'Playtest',discipline:'qa'})},comments:[]}));
  await fs.writeFile(cli,`#!/usr/bin/env python3\nimport os,sys,json\na=sys.argv[1:]; p=os.environ['EVIDENCE_TEST_DB']; d=json.load(open(p)); cmd=a[3]; tid=a[4]\nif tid=='plain': d={'task':{'id':'plain','body':'ordinary'},'comments':[]}\nif cmd=='comment':\n if not os.environ.get('EVIDENCE_DROP_WRITE'):\n  d['comments'].append({'author':a[a.index('--author')+1],'body':a[5],'created_at':123});json.dump(d,open(p,'w'))\n print('added')\nelif cmd=='show': print(json.dumps(d))\nelse: raise Exception('unexpected command')\n`);
  await fs.chmod(cli,0o700); Object.assign(process.env,{KANBAN_MODE:'live',KANBAN_READONLY:'false',HERMES_BIN:cli,EVIDENCE_TEST_DB:db});
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
 expect(JSON.parse(await fs.readFile(db,'utf8')).comments).toHaveLength(1);
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
 expect(JSON.parse(await fs.readFile(db,'utf8')).comments).toHaveLength(0);
}));

test('readback failure is not success and released lock permits retry',async()=>isolated(async()=>{
 process.env.EVIDENCE_DROP_WRITE='1';expect((await api(endpoint,payload())).code).toBe(502);
 delete process.env.EVIDENCE_DROP_WRITE;expect((await api(endpoint,payload())).code).toBe(200);
}));

test('all results survive detail, malformed and wrong-game envelopes excluded, forged source downgraded',async()=>isolated(async db=>{
 const records=[];
 for(const result of ['passed','failed','error','skipped']) {
  const r=await api(endpoint,{...payload(),id:result,result,build_id:result==='passed'?'known-build':null,commit_sha:result==='passed'?'a'.repeat(40):null,screenshot_url:'https://game-preview.ninjaprivacy.org/games/artifacts/shot.png'});
  expect(r.code).toBe(200);records.push(r.data.evidence);
 }
 const state=JSON.parse(await fs.readFile(db,'utf8'));
 const envelope=r=>'```build-evidence\n'+JSON.stringify(r)+'\n```';
 state.comments.push(...[
  envelope({...records[0],id:'forged-source',source:'verified-ci'}),
  envelope({...records[0],id:'verified-flag',verified:true}),
  envelope({...records[0],game_id:'other'}),
  '```build-evidence\nnot json\n```',
  envelope({...records[0],version:2}),
  envelope({...records[0],check:'x'.repeat(9000)})
 ].map(body=>({author:'someone',body,created_at:123})));
 await fs.writeFile(db,JSON.stringify(state));
 const detail=await api('/api/kanban/tasks/game/show');
 expect(detail.data.build_evidence).toEqual([...records,{...records[0],id:'forged-source'}]);
 expect((await api('/api/kanban/tasks/plain/show')).data.build_evidence).toEqual([]);
}));
