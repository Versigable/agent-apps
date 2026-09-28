import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { createPlayableServer } from '../scripts/playable-service.mjs';
import { handleKanbanRequest } from '../scripts/kanban-bridge.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readTaskSnapshot } from '../scripts/kanban-operations.mjs';
import { handleGameDevRequest } from '../scripts/game-dev-api.mjs';
const repo = path.resolve(import.meta.dirname, '..');
const body = game => '```game-dev\n'+JSON.stringify({game_id:game,milestone:'test',discipline:'qa'})+'\n```';
async function fixture(fn) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'operator-read-'));
 await fs.mkdir(path.join(root,'apps/kanban/fixtures'),{recursive:true});
 await fs.mkdir(path.join(root,'games'),{recursive:true});
 await fs.copyFile(path.join(repo,'games/manifest.json'),path.join(root,'games/manifest.json'));
 await fs.writeFile(path.join(root,'apps/kanban/fixtures/default-board.json'),JSON.stringify({board:'default',columns:[{name:'future-state',tasks:[{id:'same',title:'Same game',body:body('fps-gauntlet'),diagnostics:['SECRET']},{id:'foreign',title:'SECRET',body:body('other')},{id:'general',title:'SECRET',body:'private'}]}],board_data:{other:{columns:[]}}}));
 const saved={...process.env}; Object.assign(process.env,{KANBAN_MODE:'fixture',KANBAN_BOARD:'other',GAME_DEV_READS_ENABLED:'true'});delete process.env.KANBAN_FIXTURE_PATH;
 try {await fn(root);} finally {process.env=saved;await fs.rm(root,{recursive:true,force:true});}
}
async function request(root,route,method='GET') {
 let status, payload; const headers={};
 const res={writeHead(s,h){status=s;Object.assign(headers,h);},setHeader(k,v){headers[k]=v;},end(s){payload=s?JSON.parse(s):null;}};
 await handleGameDevRequest({url:'/api/game-dev/games/'+route,method},res,{repoRoot:root});return {status,payload,headers};
}
test('detail keeps same-game history but never unrelated links or event payloads',()=>fixture(async root=>{
 const file=path.join(root,'apps/kanban/fixtures/default-board.json');const raw=JSON.parse(await fs.readFile(file));
 raw.columns[0].tasks.push({id:'peer',title:'Peer',body:body('fps-gauntlet')});
 raw.task_details={same:{comments:[{id:7,task_id:'same',body:'History',author:'operator',created_at:5,secret:'SECRET'}],events:[{id:8,task_id:'same',kind:'task_created',ts:6,payload:{private:'SECRET'}},{id:9,task_id:'same',kind:'dependency_added',payload:{parent_id:'foreign'}}],dependencies:{parents:[{id:'peer'},{id:'foreign'}],children:[]},runs:['SECRET'],context:'SECRET',log:'SECRET',diagnostics:['SECRET']}};
 await fs.writeFile(file,JSON.stringify(raw));
 const r=await request(root,'fps-gauntlet/tasks/same');assert.equal(r.status,200);
 assert.equal(r.payload.task.id,'same');assert.equal(r.payload.task.body,body('fps-gauntlet'));
 assert.deepEqual(r.payload.comments,[{id:7,task_id:'same',body:'History',author:'operator',created_at:5}]);
 assert.deepEqual(r.payload.events,[{id:8,task_id:'same',kind:'task_created',ts:6}]);
 assert.deepEqual(r.payload.dependencies.parents.map(t=>t.id),['peer']);
 assert.doesNotMatch(JSON.stringify(r.payload),/SECRET|foreign|diagnostics|context|runs|payload/);
 for(const id of ['foreign','general','missing']) assert.equal((await request(root,'fps-gauntlet/tasks/'+id)).status,404);
}));
test('capabilities and roster advertise reads only without unrelated board aggregates',()=>fixture(async root=>{
 await fs.writeFile(path.join(root,'apps/kanban/operator-roster.json'),JSON.stringify({assignees:[{name:'qa',role:'tester',counts:{secret:9},path:'SECRET'}],tenants:['games'],workspaces:['SECRET']}));
 const c=await request(root,'fps-gauntlet/capabilities');assert.equal(c.status,200);
 assert.deepEqual(c.payload,{board:'default',game:'fps-gauntlet',reads:['board','tasks','task-detail','roster'],writes:[],execution:false});
 const r=await request(root,'fps-gauntlet/roster');assert.equal(r.status,200);
 assert.deepEqual(r.payload,{board:'default',game:'fps-gauntlet',assignees:[{name:'qa',role:'tester'}],tenants:['games']});
 process.env.GAME_DEV_READS_ENABLED='false';
 assert.deepEqual((await request(root,'fps-gauntlet/capabilities')).payload.reads,[]);
 assert.equal((await request(root,'fps-gauntlet/roster')).status,403);
 for(const route of ['missing/capabilities','fps-gauntlet/boards','fps-gauntlet/tasks/same/log','fps-gauntlet/board?board=default','fps-gauntlet/board?x=1']) assert.ok((await request(root,route)).status>=400);
 assert.equal((await request(root,'fps-gauntlet/tasks','POST')).status,405);
}));
test('live snapshot includes archived detail, shares default DB, never migrates or writes',()=>fixture(async root=>{
 const db=path.join(root,'isolated.db');
 const init=spawnSync('python3',['-c',`import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.executescript('CREATE TABLE tasks(id TEXT, title TEXT, body TEXT, status TEXT, priority INT, created_at INT); CREATE TABLE task_comments(id INT,task_id TEXT,body TEXT,author TEXT,created_at INT); CREATE TABLE task_events(id INT,task_id TEXT,kind TEXT,payload TEXT,created_at INT); CREATE TABLE task_links(parent_id TEXT,child_id TEXT);')
c.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?)',('same','Same',sys.argv[2],'future-state',0,1))
c.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?)',('old','Archived',sys.argv[2],'archived',0,1))
c.execute('INSERT INTO task_comments VALUES(7,?,?,?,5)',('same','History','operator'))
c.execute('INSERT INTO task_events VALUES(8,?,?,?,6)',('same','task_created','SECRET'))
c.execute('ALTER TABLE tasks ADD COLUMN assignee TEXT')
c.execute('ALTER TABLE tasks ADD COLUMN tenant TEXT')
c.execute('ALTER TABLE tasks ADD COLUMN updated_at INT')
c.commit();c.close()`,db,body('fps-gauntlet')],{encoding:'utf8'});assert.equal(init.status,0,init.stderr);
 Object.assign(process.env,{KANBAN_MODE:'live',HOME:root,HERMES_HOME:path.join(root,'.hermes'),HERMES_KANBAN_HOME:root,HERMES_KANBAN_DB:db});
 const fingerprint=async()=>Object.fromEntries(await Promise.all((await fs.readdir(root)).filter(n=>n.startsWith('isolated.db')).map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(root,n))).digest('hex')])));
 const before=await fingerprint();
 const snapshot=await readTaskSnapshot(repo,'default',true);assert.ok(snapshot.tasks,'snapshot object required');
 assert.deepEqual(snapshot.tasks.map(t=>t.id),['same','old']);
 // The adapter runs the same actual reader, not the Hermes CLI show/list paths.
 await fs.mkdir(path.join(root,'scripts'));await fs.copyFile(path.join(repo,'scripts/kanban-readonly.py'),path.join(root,'scripts/kanban-readonly.py'));
 const detail=await request(root,'fps-gauntlet/tasks/same');assert.equal(detail.status,200);assert.equal(detail.payload.comments[0].id,7);
 assert.equal(detail.payload.events[0].created_at,6);
 assert.equal((await request(root,'fps-gauntlet/tasks/old')).payload.task.status,'archived');
 assert.equal((await request(root,'fps-gauntlet/board')).payload.summary.total,1);
 assert.deepEqual((await readTaskSnapshot(repo,'default')).map(t=>t.id),['same']);
 assert.deepEqual(await fingerprint(),before);
 process.env.HERMES_KANBAN_DB=path.join(root,'missing.db');
 assert.equal((await request(root,'fps-gauntlet/board')).status,404);
 assert.equal(await fs.access(process.env.HERMES_KANBAN_DB).then(()=>true,()=>false),false);
}));
test('installed Hermes schema and history remain readable without helper side effects', {skip:!process.env.KANBAN_AUDIT_SOURCE}, ()=>fixture(async root=>{
 const source=process.env.KANBAN_AUDIT_SOURCE;
 Object.assign(process.env,{KANBAN_MODE:'live',HOME:root,HERMES_HOME:path.join(root,'.hermes'),HERMES_KANBAN_HOME:path.join(root,'.hermes'),HERMES_KANBAN_DB:path.join(root,'.hermes/kanban.db'),PYTHONPATH:source,PYTHONDONTWRITEBYTECODE:'1'});
 const python=process.env.KANBAN_AUDIT_PYTHON || 'python3';
 const seeded=spawnSync(python,['-c',`import json,sys
from hermes_cli import kanban_db as kb
import sqlite3,os
from pathlib import Path
Path(os.environ['HERMES_KANBAN_DB']).parent.mkdir(parents=True,exist_ok=True)
c=sqlite3.connect(os.environ['HERMES_KANBAN_DB'])
c.executescript(kb.SCHEMA_SQL)
id='installed-schema-fixture'
c.execute('INSERT INTO tasks(id,title,body,status,created_at) VALUES(?,?,?,?,?)',(id,'Isolated fixture',sys.argv[1],'triage',1))
c.execute('INSERT INTO task_comments(task_id,author,body,created_at) VALUES(?,?,?,?)',(id,'audit','Retained history',2))
c.execute('INSERT INTO task_events(task_id,kind,payload,created_at) VALUES(?,?,?,?)',(id,'created','SECRET',1))
c.execute('INSERT INTO tasks(id,title,body,status,created_at) VALUES(?,?,?,?,?)',('peer','Same game peer',sys.argv[1],'triage',1))
c.execute('INSERT INTO task_events(task_id,kind,payload,created_at) VALUES(?,?,?,?)',(id,'linked',json.dumps({'parent':'peer','child':id,'extra':'SECRET'}),2))
c.commit();c.close()
print(json.dumps({'id':id}))`,body('fps-gauntlet')],{env:process.env,encoding:'utf8'});
 assert.equal(seeded.status,0,seeded.stderr);const {id}=JSON.parse(seeded.stdout);
 await fs.mkdir(path.join(root,'scripts'));await fs.copyFile(path.join(repo,'scripts/kanban-readonly.py'),path.join(root,'scripts/kanban-readonly.py'));
 // Pin DELETE journal only for the byte fingerprint batch. WAL is audited separately.
 const close=spawnSync(python,['-c','import sqlite3,os; c=sqlite3.connect(os.environ["HERMES_KANBAN_DB"]); c.execute("PRAGMA journal_mode=DELETE"); c.close()'],{env:process.env});assert.equal(close.status,0);
 const fingerprint=async()=>Object.fromEntries(await Promise.all((await fs.readdir(path.dirname(process.env.HERMES_KANBAN_DB))).filter(n=>n.startsWith('kanban.db')).map(async n=>[n,createHash('sha256').update(await fs.readFile(path.join(root,'.hermes',n))).digest('hex')])));
 const before=await fingerprint();
 const r=await request(root,'fps-gauntlet/tasks/'+id);assert.equal(r.status,200,JSON.stringify(r.payload));
 assert.equal(r.payload.comments[0].body,'Retained history');assert.ok(r.payload.events.some(e=>e.kind==='created'));
 assert.equal(r.payload.events.find(e=>e.kind==='linked').parent_id,'peer');assert.doesNotMatch(JSON.stringify(r.payload),/SECRET/);
 for(const route of ['board','tasks','roster']) assert.equal((await request(root,'fps-gauntlet/'+route)).status,200);
 assert.equal((await readTaskSnapshot(repo,'default'))[0].id,id);
 assert.deepEqual(await fingerprint(),before);
}));
async function serving(server, fn) {
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {await fn('http://127.0.0.1:'+server.address().port);} finally {await new Promise(resolve=>server.close(resolve));}
}
test('public static service has no new operator API even with deployment flags enabled',()=>fixture(async root=>{
 process.env.KANBAN_READONLY='false';process.env.KANBAN_EXECUTION_ENABLED='true';
 await serving(await createPlayableServer({root,registry:{games:[],runtime:[]}}),async base=>{
  for(const route of ['capabilities','board','roster','tasks','tasks/same']) {
   const r=await fetch(base+'/api/game-dev/games/fps-gauntlet/'+route);assert.equal(r.status,404);assert.equal(r.headers.get('access-control-allow-origin'),null);
  }
 });
}));
test('scoped HTTP denies overrides and methods; general board retains same IDs',()=>fixture(async root=>{
 await serving(http.createServer((req,res)=>handleGameDevRequest(req,res,{repoRoot:root})),async base=>{
  const prefix=base+'/api/game-dev/games/fps-gauntlet/';
  assert.equal((await fetch(prefix+'tasks/same')).status,200);
  const head=await fetch(prefix+'board',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const route of ['board?board=default','board?board=x&board=default','board?tenant=x','tasks/same?include=diagnostics']) assert.equal((await fetch(prefix+route)).status,400);
  for(const route of ['tasks/foreign','tasks/general','tasks/same/context','tasks/%2fsame','tasks/%252fsame','execution/status','boards']) assert.equal((await fetch(prefix+route)).status,404);
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) assert.equal((await fetch(prefix+'tasks/same',{method})).status,405);
  assert.equal((await fetch(prefix+'board')).headers.get('access-control-allow-origin'),null);
 });
 await serving(http.createServer((req,res)=>handleKanbanRequest(req,res,{repoRoot:root})),async base=>{
  const general=await (await fetch(base+'/api/kanban/board?board=default')).json();
  assert.deepEqual(general.columns.flatMap(c=>c.tasks).map(t=>t.id),['same','foreign','general']);
  assert.equal(general.columns.flatMap(c=>c.tasks)[0].status,'future-state');
 });
}));
test('same-game dependency history survives but foreign and unknown event payloads do not',()=>fixture(async root=>{
 const file=path.join(root,'apps/kanban/fixtures/default-board.json');const raw=JSON.parse(await fs.readFile(file));
 raw.columns[0].tasks.push({id:'peer',title:'Peer',body:body('fps-gauntlet')});
 raw.task_details={same:{events:[
  {id:1,task_id:'same',kind:'linked',created_at:4,payload:JSON.stringify({parent:'peer',child:'same',extra:'SECRET'})},
  {id:2,task_id:'same',kind:'linked',payload:{parent:'foreign',child:'same'}},
  {id:3,task_id:'same',kind:'new-secret-event',payload:'SECRET'},
  {id:4,task_id:'foreign',kind:'created'},
  {id:5,task_id:'same',kind:'assigned',payload:{assignee:'qa',extra:'SECRET'}}]}};
 await fs.writeFile(file,JSON.stringify(raw));
 const r=await request(root,'fps-gauntlet/tasks/same');assert.equal(r.status,200);
 assert.deepEqual(r.payload.events,[{id:1,task_id:'same',kind:'linked',created_at:4,parent_id:'peer',child_id:'same'},{id:5,task_id:'same',kind:'assigned'}]);
}));
test('fixed default board scopes columns and counts, preserves unknown statuses',()=>fixture(async root=>{
 const r=await request(root,'fps-gauntlet/board');assert.equal(r.status,200);
 assert.equal(r.payload.board,'default');assert.equal(r.payload.summary.total,1);
 assert.deepEqual(r.payload.columns.flatMap(c=>c.tasks).map(t=>[t.id,t.status]),[['same','future-state']]);
 assert.doesNotMatch(JSON.stringify(r.payload),/SECRET|diagnostics|foreign|general/);
}));
