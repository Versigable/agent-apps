import { test } from 'node:test';

test('general small-target operations ignore more than 8MiB of unrelated archived history with scoped gates off',()=>isolated(async()=>{
 process.env.GAME_DEV_READS_ENABLED='false';process.env.GAME_DEV_WRITES_ENABLED='false';
 sql("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1100) INSERT INTO task_comments(task_id,body,author) SELECT 'old',replace(hex(zeroblob(4000)),'0','x'),'archive' FROM n");
 assert.ok(sql("SELECT sum(length(body)) AS bytes FROM task_comments WHERE task_id='old'")[0].bytes>8*1024*1024);
 const route='/api/kanban/tasks/same';
 const get=await api(route+'/show?board=default');assert.equal(get.status,200,JSON.stringify(get));
 for(const text of ['Small comment','Small comment']) {
  const r=await api(route+'/comments?board=default',{text});assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(r.data.detail.comments.map(c=>c.id),sql("SELECT id FROM task_comments WHERE task_id='same' ORDER BY created_at").map(c=>c.id));
 }
 for(const action of [{action:'assign',assignee:'QA'},{action:'block',reason:'Check'},{action:'unblock'},{action:'archive'}]) {
  const r=await api(route+'/actions?board=default',action);assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(r.data.detail.events.map(e=>e.id),sql("SELECT id FROM task_events WHERE task_id='same' ORDER BY created_at,id").map(e=>e.id));
 }
 const archived=await api(route+'/show?board=default');assert.equal(archived.status,200);assert.equal(archived.data.task.status,'archived');
}));

test('completion projection and edit use installed chronological order rather than highest run ID',()=>isolated(async()=>{
 sql("UPDATE tasks SET status='done',result='Initial' WHERE id='same'");
 for(const [id,started,ended,summary] of [[1,10,100,'Newest'],[2,20,30,'Backfill'],[3,null,null,'Undated'],[4,90,null,'Started fallback']]) sql('INSERT INTO task_runs(id,task_id,outcome,summary,metadata,started_at,ended_at) VALUES(?,?,?,?,?,?,?)',[id,'same','completed',summary,'{}',started,ended]);
 assert.equal((await api(scoped+'/tasks/same')).data.completion.summary,'Newest');
 const edit=await api(scoped+'/tasks/same/actions',{action:'edit',result:'Edited',summary:'Updated newest',metadata:{ordered:true}});
 assert.equal(edit.status,200,JSON.stringify(edit));assert.equal(edit.data.detail.completion.summary,'Updated newest');
 assert.equal(sql('SELECT summary FROM task_runs WHERE id=1')[0].summary,'Updated newest');
 assert.equal(sql('SELECT summary FROM task_runs WHERE id=4')[0].summary,'Started fallback');
 sql("INSERT INTO task_runs(id,task_id,outcome,summary,ended_at) VALUES(5,'same','completed','Tie winner',100)");
 assert.equal((await api(scoped+'/tasks/same')).data.completion.summary,'Tie winner');
}));


test('identical locked retries accept archived same-game parents but never foreign reclassified parents',()=>isolated(async()=>{
 for(const lost of [false,true]) {
  sql("UPDATE tasks SET status='triage' WHERE id='peer'");
  const payload=creation({parents:['peer'],idempotency_key:'parent-'+lost});
  if(lost) process.env.OPERATOR_LOSE_REPLY='1';
  const made=await api(scoped+'/tasks',payload);assert.equal(made.status,lost?502:201);delete process.env.OPERATOR_LOSE_REPLY;
  const id=sql('SELECT id FROM tasks WHERE idempotency_key=?',[payload.idempotency_key])[0].id;
  assert.equal((await api(scoped+'/tasks/peer/actions',{action:'archive'})).status,200);
  const count=sql('SELECT count(*) AS n FROM calls')[0].n;
  const retry=await api(scoped+'/tasks',payload);assert.equal(retry.status,201,JSON.stringify(retry));assert.equal(retry.data.task.id,id);
  assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,count);
  assert.equal((await api(scoped+'/tasks',{...payload,title:'Conflict'})).status,409);
  assert.equal((await api(scoped+'/tasks',{...payload,idempotency_key:'new-parent-'+lost})).status,409);
 }
 const entered=deferred(),release=deferred();
 const held=withTaskLocks('default',['peer'],async()=>{entered.resolve();await release.promise;});await entered.promise;
 const pending=api(scoped+'/tasks',creation({parents:['peer'],idempotency_key:'parent-true'}));await delay(60);
 sql("UPDATE tasks SET body=(SELECT body FROM tasks WHERE id='foreign') WHERE id='peer'");
 release.resolve();await held;
 assert.equal((await pending).status,404);
 assert.equal(sql("SELECT count(*) AS n FROM tasks WHERE idempotency_key LIKE 'parent-%'")[0].n,2);
}));


test('canonical create intent survives cross-adapter lost replies with nondefault execution fields',()=>isolated(async dir=>{
 const routes=[scoped+'/tasks','/api/kanban/tasks?board=default'];
 for(const [i,route] of routes.entries()) {
  const payload=creation({idempotency_key:'canonical-'+i,assignee:'QA',workspace:'dir: ~/work',skills:['testing','qa'],max_runtime:'5m'});
  process.env.OPERATOR_LOSE_REPLY='1';assert.equal((await api(route,payload)).status,i===0?502:500);delete process.env.OPERATOR_LOSE_REPLY;
  const retry=await api(routes[1-i],payload);assert.equal(retry.status,201,JSON.stringify(retry));
  const id=retry.data.task.id;
  const row=sql('SELECT * FROM tasks WHERE id=?',[id])[0];assert.equal(row.assignee,'qa');assert.equal(row.workspace_path,dir+'/work');assert.equal(row.max_runtime_seconds,300);
  assert.equal((await api(route,{...payload,assignee:'qa',workspace:'dir:'+dir+'/work',max_runtime:'300s'})).data.task.id,id);
  const args=JSON.parse(sql('SELECT args FROM calls WHERE args LIKE ? ORDER BY id DESC LIMIT 1',['%"create"%'])[0].args);
  assert.equal(args[args.indexOf('--assignee')+1],'qa');assert.equal(args[args.indexOf('--workspace')+1],'dir:'+dir+'/work');
  assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',[payload.idempotency_key])[0].n,1);
  const ordinary=await api(route,{...payload,idempotency_key:'ordinary-'+i});assert.equal(ordinary.status,201,JSON.stringify(ordinary));
  assert.equal((await api(routes[1-i],{...payload,idempotency_key:'ordinary-'+i})).data.task.id,ordinary.data.task.id);
 }
}));


test('both adapters canonicalize mixed-case assignment and every unassignment alias before commands',()=>isolated(async()=>{
 for(const base of [scoped,'/api/kanban']) for(const action of ['assign','reassign']) {
  for(const [assignee,expected] of [['QA','qa'],['none',null],['Qa','qa'],['NULL',null],['qA','qa'],['-',null],['QA','qa'],['NoNe',null],['QA','qa'],['null',null],['QA','qa'],['',null],[null,null]]) {
   const r=await api(base+'/tasks/same/actions'+(base===scoped?'':'?board=default'),{action,assignee});
   assert.equal(r.status,200,JSON.stringify({assignee,r}));assert.equal(r.data.detail.task.assignee || null,expected);
   const args=JSON.parse(sql('SELECT args FROM calls WHERE args LIKE ? ORDER BY id DESC LIMIT 1',['%"'+action+'"%'])[0].args);
   assert.equal(args.at(-1),expected || 'none');
  }
 }
}));


test('installed-shaped show cannot hide persisted IDs for general repeated comments and create-action',()=>isolated(async()=>{
 delete process.env.GAME_DEV_WRITES_ENABLED;
 const made=await api('/api/kanban/tasks?board=default',creation());assert.equal(made.status,201);
 const id=made.data.task.id;
 for(const text of ['First','Second','Second']) {
  const r=await api('/api/kanban/tasks/'+id+'/comments?board=default',{text});
  assert.equal(r.status,200,JSON.stringify(r));
  if(text==='Second') assert.deepEqual(r.data.detail.comments.map(c=>c.id),sql('SELECT id FROM task_comments WHERE task_id=? ORDER BY id',[id]).map(c=>c.id));
 }
 const assigned=await api('/api/kanban/tasks/'+id+'/actions?board=default',{action:'assign',assignee:'qa'});
 assert.equal(assigned.status,200,JSON.stringify(assigned));
 assert.deepEqual(assigned.data.detail.events.map(e=>e.id),sql('SELECT id FROM task_events WHERE task_id=? ORDER BY id',[id]).map(e=>e.id));
}));

test('general exact history preserves chronological order, lexical dependencies and raw event fields',()=>isolated(async()=>{
 sql('ALTER TABLE task_events ADD COLUMN run_id INTEGER');
 for(const [id,time] of [[10,30],[30,10],[20,10]]) {
  sql('INSERT INTO task_comments(id,task_id,body,author,created_at) VALUES(?,?,?,?,?)',[id,'old','body-'+id,'author',time]);
  sql('INSERT INTO task_events(id,task_id,kind,payload,created_at,run_id) VALUES(?,?,?,?,?,?)',[id,'old','custom',id===10?'not-json':JSON.stringify({private:id}),time,id+100]);
 }
 for(const peer of ['same','peer','general']) {
  sql('INSERT INTO task_links VALUES(?,?)',[peer,'old']);sql('INSERT INTO task_links VALUES(?,?)',['old',peer]);
 }
 const r=await api('/api/kanban/tasks/old/show?board=default');assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.data.task.status,'archived');
 assert.deepEqual(r.data.comments.map(c=>c.id),[20,30,10]);
 assert.deepEqual(r.data.events.map(e=>e.id),[20,30,10]);
 assert.deepEqual(r.data.dependencies,{parents:['general','peer','same'],children:['general','peer','same']});
 assert.deepEqual(r.data.events.map(e=>[e.task_id,e.run_id,e.payload]),[['old',120,{private:20}],['old',130,{private:30}],['old',110,'not-json']]);
}));

import { readTaskHistory } from '../scripts/kanban-operations.mjs';
test('general exact history is parameterized, archive-aware and fails closed without a readable schema',()=>isolated(async dir=>{
 assert.equal(await readTaskHistory(repo,'default','missing'),null);
 assert.equal(await readTaskHistory(repo,'default',"old' OR 1=1 --"),null);
 sql('INSERT INTO task_comments(task_id,body) VALUES(?,?)',['missing','orphan']);
 assert.equal(await readTaskHistory(repo,'default','missing'),null);
 assert.deepEqual(await readTaskHistory(repo,'default','old'),{comments:[],events:[],dependencies:{parents:[],children:[]}});
 const bytes=await fs.readFile(process.env.HERMES_KANBAN_DB);
 delete process.env.HERMES_KANBAN_DB;
 await fs.mkdir(path.join(dir,'kanban/boards/other'),{recursive:true});
 await fs.writeFile(path.join(dir,'kanban/boards/other/kanban.db'),bytes);
 assert.deepEqual(await readTaskHistory(repo,'other','old'),{comments:[],events:[],dependencies:{parents:[],children:[]}});
 process.env.HERMES_KANBAN_DB=path.join(dir,'fixture.db');
 sql('DROP TABLE task_comments');
 await assert.rejects(readTaskHistory(repo,'default','same'),/task_comments/);
 const count=sql('SELECT count(*) AS n FROM calls')[0].n;
 const failed=await api('/api/kanban/tasks/same/comments?board=default',{text:'Must not write'});assert.equal(failed.status,500);
 assert.equal(sql("SELECT count(*) AS n FROM calls WHERE args LIKE '%\"comment\"%'")[0].n,0); // failed show rolls back its own call log
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,count);
 process.env.HERMES_KANBAN_DB=path.join(dir,'absent.db');
 await assert.rejects(readTaskHistory(repo,'default','same'),/unable to open/);
 await assert.rejects(fs.stat(process.env.HERMES_KANBAN_DB),{code:'ENOENT'});
}));

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { handleKanbanRequest } from '../scripts/kanban-bridge.mjs';
import { handleGameDevRequest } from '../scripts/game-dev-api.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const scoped='/api/game-dev/games/fps-gauntlet';
async function api(route,payload) {
 const req=Readable.from(payload===undefined?[]:[Buffer.from(JSON.stringify(payload))]);
 Object.assign(req,{url:route,method:payload===undefined?'GET':'POST',headers:{host:'localhost'}});
 let status,data;const headers={};
 const res={writeHead(s,h){status=s;Object.assign(headers,h);},setHeader(k,v){headers[k]=v;},end(v){data=JSON.parse(v);}};
 await (route.startsWith('/api/kanban/')?handleKanbanRequest:handleGameDevRequest)(req,res,{repoRoot:repo});
 return {status,data,headers};
}
function sql(statement,params=[]) {
 const r=spawnSync('python3',['-c',`import os,sqlite3,json,sys
with sqlite3.connect(os.environ['HERMES_KANBAN_DB']) as c:
 c.row_factory=sqlite3.Row
 rows=c.execute(sys.argv[1],json.loads(sys.argv[2])).fetchall()
 print(json.dumps([dict(r) for r in rows]))`,statement,JSON.stringify(params)],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
async function isolated(fn) {
 const saved={...process.env},dir=await fs.mkdtemp(path.join(os.tmpdir(),'operator-write-'));
 try {
  const cli=path.join(dir,'synthetic-hermes');await fs.copyFile(path.join(repo,'tests/helpers/operator-fixture.py'),cli);await fs.chmod(cli,0o700);
  Object.assign(process.env,{HOME:dir,HERMES_HOME:dir,HERMES_KANBAN_HOME:dir,HERMES_KANBAN_DB:path.join(dir,'fixture.db'),HERMES_BIN:cli,GAME_DEV_SCOPED_WRITER:cli,KANBAN_SCOPED_GUARD:path.join(repo,'scripts/game-dev-scoped-writer.py'),KANBAN_MODE:'live',KANBAN_READONLY:'false',GAME_DEV_READS_ENABLED:'true',GAME_DEV_WRITES_ENABLED:'true',KANBAN_BOARD:'other'});
  const seed=spawnSync(cli,['--seed'],{encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
  await fn(dir);
 } finally {process.env=saved;await fs.rm(dir,{recursive:true,force:true});}
}
test('scoped activation without a transactional writer fails closed before invoking legacy CLI',()=>isolated(async()=>{
 delete process.env.GAME_DEV_SCOPED_WRITER;
 const before=sql('SELECT count(*) AS n FROM calls')[0].n;
 const result=await api(scoped+'/tasks/same/comments',{text:'Must never reach legacy CLI'});
 assert.equal(result.status,405);
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,before);
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,0);
}));
test('scoped writer failure never falls back to the unguarded installed command path',()=>isolated(async dir=>{
 process.env.GAME_DEV_SCOPED_WRITER=path.join(dir,'missing-transaction-writer');
 for(const [suffix,payload] of [['/tasks/same/comments',{text:'Denied'}],['/tasks',creation()],['/links',{parent_id:'same',child_id:'peer'}]]) {
  const r=await api(scoped+suffix,payload);assert.equal(r.status,502,JSON.stringify(r.data));
 }
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,0);
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,0);
}));
test('scoped comment persists on fixed board and is read back through both adapters',()=>isolated(async()=>{
 const r=await api(scoped+'/tasks/same/comments',{text:'Original observation',author:'QA'});
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.detail.task.id,'same');
 const general=await api('/api/kanban/tasks/same/show?board=default');
 const detail=await api(scoped+'/tasks/same');
 assert.deepEqual(detail.data.comments,general.data.comments.map(({text,...c})=>c));
 assert.equal(detail.data.comments[0].body,'Original observation');
 assert.equal(detail.data.comments[0].author,'QA');
 assert.equal(detail.data.events[0].id,general.data.events[0].id);
 const calls=sql('SELECT args FROM calls').map(r=>JSON.parse(r.args));
 assert.ok(calls.every(a=>a[2]==='default'));
}));

const creation=(extra={})=>({title:'Persisted observation',body:'Notes',triage:true,idempotency_key:'create-one',game_dev:{game_id:'fps-gauntlet',milestone:'Test',discipline:'qa'},...extra});
test('create uses shared canonical metadata and persisted bidirectional retry identity',()=>isolated(async()=>{
 const r=await api(scoped+'/tasks',creation());assert.equal(r.status,201,JSON.stringify(r.data));
 const id=r.data.task.id;
 assert.equal((await api('/api/kanban/tasks/'+id+'/show?board=default')).data.task.body,r.data.task.body);
 const retry=await api('/api/kanban/tasks?board=default',creation());assert.equal(retry.status,201,JSON.stringify(retry.data));assert.equal(retry.data.task.id,id);
 const reverse=await api('/api/kanban/tasks?board=default',creation({idempotency_key:'reverse',title:'Reverse'}));assert.equal(reverse.status,201,JSON.stringify(reverse.data));
 assert.equal((await api(scoped+'/tasks/'+reverse.data.task.id)).data.task.title,'Reverse');
 assert.equal((await api(scoped+'/tasks',creation({title:'Conflict'}))).status,409);
 assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',['create-one'])[0].n,1);
 assert.equal((r.data.task.body.match(/```game-dev/g)||[]).length,1);
 assert.equal((await api(scoped+'/tasks',creation({board:'elsewhere'}))).status,400);
 assert.equal((await api(scoped+'/tasks',creation({game_dev:{...creation().game_dev,game_id:'snowdown'}}))).status,400);
 assert.equal((await api(scoped+'/tasks',creation({body:r.data.task.body}))).status,400);
}));

const evidence=(extra={})=>({id:'evidence-one',build_id:null,commit_sha:null,playable_url:'https://game-preview.ninjaprivacy.org/games/fps-gauntlet/',screenshot_url:null,video_url:null,check:'Landing',result:'passed',performed_at:'2026-09-15T12:00:00.000Z',reporter:'QA',...extra});
test('both adapters serialize evidence, detect conflicts and recover a committed lost reply',()=>isolated(async()=>{
 const routes=[scoped+'/tasks/same/evidence','/api/kanban/tasks/same/evidence?board=default'];
 const r=await Promise.all(routes.map(route=>api(route,evidence())));
 assert.ok(r.every(v=>v.status===200),JSON.stringify(r));assert.deepEqual(r[0].data.evidence,r[1].data.evidence);
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,1);
 assert.equal((await api(routes[0],evidence({result:'failed'}))).status,409);
 process.env.OPERATOR_DROP_WRITE='1';assert.equal((await api(routes[0],evidence({id:'retry'}))).status,502);
 delete process.env.OPERATOR_DROP_WRITE;
 process.env.OPERATOR_LOSE_REPLY='1';assert.equal((await api(routes[0],evidence({id:'lost'}))).status,502);
 delete process.env.OPERATOR_LOSE_REPLY;
 const recovered=await api(routes[1],evidence({id:'lost'}));assert.equal(recovered.status,200,JSON.stringify(recovered.data));
 assert.equal((await api(routes[0],evidence({id:'retry'}))).status,200);
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,3);
}));

test('ordinary actions retain shared IDs and archive returns exact archived target',()=>isolated(async()=>{
 sql("UPDATE tasks SET status='ready' WHERE id='same'");
 const target=scoped+'/tasks/same/actions';
 for(const [payload,status,assignee] of [
  [{action:'assign',assignee:'qa'},'ready','qa'],
  [{action:'assign',assignee:''},'ready',null],
  [{action:'block',reason:'Needs test'},'blocked',null],
  [{action:'unblock'},'ready',null],
  [{action:'reassign',assignee:'other',reclaim:false},'ready','other'],
  [{action:'complete',result:'Result',summary:'Summary',metadata:{manual:true}},'done','other'],
  [{action:'edit',result:'Edited',summary:'Edited summary',metadata:{manual:false}},'done','other'],
  [{action:'archive'},'archived','other']]) {
  const r=await api(target,payload);assert.equal(r.status,200,JSON.stringify({payload,...r}));
  assert.equal(r.data.detail.task.status,status);assert.equal(r.data.detail.task.assignee || null,assignee);
  if(payload.result) {assert.equal(r.data.detail.task.result,payload.result);assert.equal(r.data.detail.completion.summary,payload.summary);assert.deepEqual(r.data.detail.completion.metadata,payload.metadata);}
  assert.equal((await api('/api/kanban/tasks/same/show?board=default')).data.task.status,status);
 }
 assert.equal((await api(target,{action:'archive'})).status,200);
 assert.equal(sql("SELECT count(*) AS n FROM task_events WHERE kind='archived'")[0].n,1);
 assert.ok(!(await api(scoped+'/board')).data.columns.flatMap(c=>c.tasks).some(t=>t.id==='same'));
 for(const action of ['assign','block','unblock','complete','edit','reclaim','reassign']) assert.equal((await api(target,{action})).status,409);
}));

test('dependency link and unlink require two same-game endpoints and persist through general reads',()=>isolated(async()=>{
 for(const action of ['link','unlink']) {
  const r=await api(scoped+'/links',{action,parent_id:'peer',child_id:'same'});assert.equal(r.status,200,JSON.stringify(r));
  const scopedDetail=(await api(scoped+'/tasks/same')).data;
  const general=(await api('/api/kanban/tasks/same/show?board=default')).data;
  assert.deepEqual(scopedDetail.dependencies.parents.map(t=>t.id),action==='link'?['peer']:[]);
  assert.deepEqual(general.dependencies.parents,scopedDetail.dependencies.parents.map(t=>t.id));
  assert.ok(scopedDetail.events.some(e=>e.kind===(action==='link'?'linked':'unlinked') && e.parent_id==='peer' && e.child_id==='same'));
 }
 for(const id of ['foreign','general','missing']) for(const swapped of [false,true]) {
  const r=await api(scoped+'/links',{action:'link',parent_id:swapped?id:'same',child_id:swapped?'same':id});assert.equal(r.status,404,JSON.stringify(r));
 }
 assert.equal((await api(scoped+'/links',{parent_id:'same',child_id:'same'})).status,400);
 assert.equal((await api(scoped+'/links',{parent_id:'old',child_id:'same'})).status,409);
 assert.equal(sql('SELECT count(*) AS n FROM task_links')[0].n,0);
}));

test('create retry conflicts include execution fields and committed failures recover without duplicate',()=>isolated(async()=>{
 const initial=await api(scoped+'/tasks',creation());assert.equal(initial.status,201);
 for(const extra of [{workspace:'worktree'},{skills:['testing']},{max_runtime:'5m'},{parents:['peer']},{priority:5},{tenant:'x'},{assignee:'qa'},{triage:false}]) {
  assert.ok([400,409].includes((await api(scoped+'/tasks',creation(extra))).status),JSON.stringify(extra));
 }
 process.env.OPERATOR_LOSE_REPLY='1';assert.equal((await api(scoped+'/tasks',creation({idempotency_key:'lost-create'}))).status,502);
 delete process.env.OPERATOR_LOSE_REPLY;
 const r=await api('/api/kanban/tasks?board=default',creation({idempotency_key:'lost-create'}));assert.equal(r.status,201,JSON.stringify(r));
 assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',['lost-create'])[0].n,1);
}));

test('enabled scoped capabilities advertise only management; default gates and broad routes deny',()=>isolated(async()=>{
 const c=await api(scoped+'/capabilities');assert.ok(c.data.writes.includes('create-triage'),JSON.stringify(c));assert.equal(c.data.execution,false);
 assert.equal((await api(scoped+'/board')).data.writesEnabled,true);
 const denied=['/execution/dispatch','/tasks/same/claim','/boards','/tasks/same/context'];
 for(const route of denied) assert.equal((await api(scoped+route,{confirm:'DISPATCH'})).status,404);
 assert.equal((await api(scoped+'/tasks/same/actions',{action:'dispatch'})).status,400);
 for(const [key,value] of [['GAME_DEV_WRITES_ENABLED',undefined],['GAME_DEV_READS_ENABLED','false'],['KANBAN_READONLY','true'],['KANBAN_MODE','fixture']]) {
  const old=process.env[key];if(value===undefined) delete process.env[key];else process.env[key]=value;
  assert.equal((await api(scoped+'/tasks/same/comments',{text:'Denied'})).status,405);
  process.env[key]=old;
 }
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,0);
}));

test('scoped mutations reject field/type smuggling and foreign identities without calling CLI',()=>isolated(async()=>{
 for(const extra of [{title:{}},{body:{}},{triage:'yes'},{assignee:{}},{parents:'peer'},{parents:[1]},{priority:'3'},{skills:'testing'},{game_dev:{...creation().game_dev,extra:true}}]) assert.equal((await api(scoped+'/tasks',creation(extra))).status,400,JSON.stringify(extra));
 for(const [route,payload] of [
  ['/tasks/same/comments',{text:{}}],['/tasks/same/comments',{text:'x',board:'other'}],
  ['/tasks/same/actions',{action:'reassign',assignee:'qa',reclaim:'false'}],
  ['/tasks/same/actions',{action:'assign',assignee:{}}],
  ['/tasks/same/actions',{action:'archive',game_id:'snowdown'}],
  ['/links',{parent_id:'peer',child_id:'same',board:'other'}]]) assert.equal((await api(scoped+route,payload)).status,400,route);
 for(const id of ['foreign','general','missing']) {
  for(const [suffix,payload] of [['comments',{text:'No'}],['actions',{action:'archive'}],['evidence',evidence()]]) {
   const r=await api(scoped+'/tasks/'+id+'/'+suffix,payload);assert.equal(r.status,404);assert.deepEqual(r.data,{error:'Not found'});
  }
  assert.equal((await api(scoped+'/tasks',creation({parents:[id]}))).status,404);
 }
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,0);
}));

test('create retries retain original intent after management and reject changed triage across adapters',()=>isolated(async()=>{
 const r=await api(scoped+'/tasks',creation());assert.equal(r.status,201);const id=r.data.task.id;
 assert.equal((await api('/api/kanban/tasks?board=default',creation({triage:false}))).status,409);
 assert.equal((await api(scoped+'/tasks/'+id+'/actions',{action:'assign',assignee:'qa'})).status,200);
 assert.equal((await api(scoped+'/tasks/'+id+'/actions',{action:'archive'})).status,200);
 const retry=await api(scoped+'/tasks',creation());assert.equal(retry.status,201,JSON.stringify(retry));assert.equal(retry.data.task.id,id);assert.equal(retry.data.task.status,'archived');
 assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',['create-one'])[0].n,1);
}));

import { withTaskLocks, storeIdentity } from '../scripts/kanban-writes.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('queued scoped operations recheck membership after shared locks on reclassification deletion and archive',()=>isolated(async()=>{
 const original=sql('SELECT body FROM tasks WHERE id=?',['same'])[0].body;
 for(const change of ['reclassify','delete','archive']) {
  for(const family of ['comments','evidence','actions','link','create']) {
   sql('INSERT OR REPLACE INTO tasks(id,title,body,status) VALUES(?,?,?,?)',['same','same',original,'triage']);
   const entered=deferred(),release=deferred();
   const held=withTaskLocks('default',['same'],async()=>{entered.resolve();await release.promise;});await entered.promise;
   const waiting=family==='link' ? api(scoped+'/links',{parent_id:'same',child_id:'peer'}) : family==='create' ? api(scoped+'/tasks',creation({parents:['same'],idempotency_key:change+family})) : api(scoped+'/tasks/same/'+family,family==='comments'?{text:'Queued'}:family==='evidence'?evidence():{action:'assign',assignee:'qa'});
   // The actual shared lock is held throughout; give the request time to reach
   // its async filesystem lookup. No mutation can execute before release.
   await delay(60);
   if(change==='delete') sql('DELETE FROM tasks WHERE id=?',['same']);
   else sql('UPDATE tasks SET '+(change==='archive'?'status':'body')+'=? WHERE id=?',[change==='archive'?'archived':'General now','same']);
   release.resolve();await held;
   const result=await waiting;assert.equal(result.status,change==='archive'?409:404,JSON.stringify({change,family,...result}));
  }
 }
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,0);
}));
test('shared task locks order opposite endpoints and collapse board and symlink aliases',()=>isolated(async dir=>{
 const identity=await storeIdentity('default');
 assert.equal(await storeIdentity('other'),identity); // explicit DB override authoritative
 const alias=path.join(dir,'alias.db');await fs.symlink(process.env.HERMES_KANBAN_DB,alias);
 const db=process.env.HERMES_KANBAN_DB;process.env.HERMES_KANBAN_DB=alias;
 assert.equal(await storeIdentity('default'),identity);process.env.HERMES_KANBAN_DB=db;
 const order=[];
 const entered=deferred();
 const first=withTaskLocks('default',['same','peer'],async()=>{order.push('first');entered.resolve();await delay(30);order.push('first-end');});
 await entered.promise;
 await Promise.all([first,withTaskLocks('other',['peer','same'],async()=>{order.push('second');})]);
 assert.deepEqual(order,['first','first-end','second']);
 await assert.rejects(withTaskLocks('default',['same'],async()=>{throw Error('test failure');}));
 await withTaskLocks('default',['same'],async()=>{order.push('released');});assert.equal(order.at(-1),'released');
}));
test('reverse adapter writes and failed commands retain IDs events and unknown statuses',()=>isolated(async()=>{
 sql("UPDATE tasks SET status='future-state' WHERE id='same'");
 const r=await api('/api/kanban/tasks/same/comments?board=default',{text:'General comment'});assert.equal(r.status,200,JSON.stringify(r));
 assert.equal((await api(scoped+'/tasks/same')).data.comments[0].id,r.data.detail.comments[0].id);
 const assigned=await api(scoped+'/tasks/same/actions',{action:'assign',assignee:'qa'});assert.equal(assigned.status,200);assert.equal(assigned.data.detail.task.status,'future-state');
 assert.equal((await api(scoped+'/tasks/same/actions',{action:'complete'})).status,409);
 sql("UPDATE tasks SET status='ready' WHERE id='same'");
 process.env.OPERATOR_DROP_WRITE='1';
 assert.equal((await api(scoped+'/tasks/same/actions',{action:'block'})).status,502);
 assert.equal((await api(scoped+'/tasks/same/comments',{text:'Dropped'})).status,502);
 assert.equal((await api(scoped+'/links',{parent_id:'same',child_id:'peer'})).status,502);
 delete process.env.OPERATOR_DROP_WRITE;
 assert.equal((await api('/api/kanban/tasks/same/actions?board=default',{action:'block'})).status,200);
 sql("UPDATE tasks SET status='running' WHERE id='same'");
 assert.equal((await api(scoped+'/tasks/same/actions',{action:'reclaim',reason:'Manual recovery'})).status,200);
 sql("UPDATE tasks SET status='running' WHERE id='same'");
 assert.equal((await api(scoped+'/tasks/same/actions',{action:'reassign',assignee:'qa',reclaim:true})).status,200);
 const d=(await api(scoped+'/tasks/same')).data;assert.ok(d.events.some(e=>e.kind==='reclaimed'));
 assert.equal(sql("SELECT count(*) AS n FROM task_comments WHERE body='Dropped'")[0].n,0);
}));

import { deflateSync } from 'node:zlib';
function png(size=1) {
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++) n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;};
 const h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;
 const stride=size*4+1,raw=Buffer.alloc(stride*size);let seed=12345;
 for(let i=0;i<raw.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;raw[i]=i%stride===0?0:seed&255;}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const capture=()=>({version:1,build:{url:'https://game-preview.ninjaprivacy.org/games/fps-gauntlet/',identifier:null},screenshot:{mime:'image/png',base64:png()}});
test('capture preserves raster and unknown identity, enforces UTF8 byte cap and unassigned triage',()=>isolated(async()=>{
 const payload=creation({game_dev:{...creation().game_dev,capture:capture()}});
 const results=await Promise.all([api(scoped+'/tasks',payload),api('/api/kanban/tasks?board=default',payload),api(scoped+'/tasks',payload)]);
 assert.ok(results.every(r=>r.status===201),JSON.stringify(results));assert.equal(new Set(results.map(r=>r.data.task.id)).size,1);
 const detail=(await api(scoped+'/tasks/'+results[0].data.task.id)).data;
 const {parseGameDev,encodeGameDev}=await import('../scripts/kanban-games.mjs');
 assert.deepEqual(detail.task.game_dev.capture,payload.game_dev.capture);
 assert.deepEqual(parseGameDev(detail.task.body).capture,payload.game_dev.capture);
 assert.equal(sql('SELECT created_by FROM tasks WHERE id=?',[detail.task.id])[0].created_by,'app-preview');
 for(const extra of [{assignee:'qa'},{triage:false},{idempotency_key:''}]) assert.equal((await api(scoped+'/tasks',{...payload,...extra})).status,400);
 const oversized={...payload,body:'界'.repeat(7900),game_dev:{...payload.game_dev,capture:{...capture(),screenshot:{mime:'image/png',base64:png(120)}}}};
 const encoded=encodeGameDev(oversized.body,oversized.game_dev);assert.ok(encoded.length<100000);assert.ok(Buffer.byteLength(encoded)>100000);
 assert.equal((await api(scoped+'/tasks',oversized)).status,400);
 for(const screenshot of [{mime:'image/svg+xml',base64:'PHN2Zz4='},{mime:'image/png',base64:'bad'}]) assert.equal((await api(scoped+'/tasks',{...payload,game_dev:{...payload.game_dev,capture:{...capture(),screenshot}}})).status,400);
 assert.equal((await api(scoped+'/tasks',{...payload,body:'x'.repeat(128001)})).status,413);
 assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',['create-one'])[0].n,1);
}));
test('self-parent retry does not deadlock and foreign key collision never echoes task',()=>isolated(async()=>{
 const created=await api(scoped+'/tasks',creation());assert.equal(created.status,201);
 const result=await Promise.race([api(scoped+'/tasks',creation({parents:[created.data.task.id]})),delay(2000).then(()=>({status:'timeout'}))]);assert.equal(result.status,409);
 sql('UPDATE tasks SET idempotency_key=? WHERE id=?',['foreign-key','foreign']);
 const r=await api(scoped+'/tasks',creation({idempotency_key:'foreign-key'}));assert.equal(r.status,404);assert.deepEqual(r.data,{error:'Not found'});
}));

test('scoped transitions reject unsupported installed states before invoking writer',()=>isolated(async()=>{
 for(const [action,status] of [['block','triage'],['block','done'],['block','future-state'],['unblock','ready'],['complete','todo'],['complete','done'],['edit','review'],['reclaim','triage']]) {
  sql('UPDATE tasks SET status=? WHERE id=?',[status,'same']);
  // Keep payload valid for the action to test transition, not field validation.
  const valid=await api(scoped+'/tasks/same/actions',{action,...(['complete','edit'].includes(action)?{result:'x'}:{})});
  assert.equal(valid.status,409,JSON.stringify({action,status,valid}));
 }
 assert.equal(sql('SELECT count(*) AS n FROM calls')[0].n,0);
}));

import http from 'node:http';
import { once } from 'node:events';
test('real HTTP write parser bounds malformed bodies and rejects queries and encoded IDs',()=>isolated(async()=>{
 const server=http.createServer((req,res)=>handleGameDevRequest(req,res,{repoRoot:repo}));server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const base='http://127.0.0.1:'+server.address().port;
  for(const body of ['{','null','[]','text=SimpleForm']) {
   const r=await fetch(base+scoped+'/tasks/same/comments',{method:'POST',body});assert.equal(r.status,400);
  }
  for(const route of ['/tasks/same/comments?board=default','/tasks/same/comments?x=1']) assert.equal((await fetch(base+scoped+route,{method:'POST',body:'{}'})).status,400);
  for(const id of ['%2Fsame','%252Fsame','a%00']) assert.equal((await fetch(base+scoped+'/tasks/'+id+'/comments',{method:'POST',body:'{}'})).status,404);
  const r=await fetch(base+scoped+'/tasks/same/comments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'HTTP original'})});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null);
  const read=await fetch(base+scoped+'/tasks/same',{method:'HEAD'});assert.equal(read.status,200);assert.equal(await read.text(),'');
 } finally {await new Promise(resolve=>server.close(resolve));}
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,1);
}));
test('readback reauthorizes after an outside writer reclassifies; it cannot undo a committed write',()=>isolated(async()=>{
 process.env.OPERATOR_RECLASS_AFTER_WRITE='1';
 const r=await api(scoped+'/tasks/same/comments',{text:'Committed, then externally moved'});assert.equal(r.status,404);assert.deepEqual(r.data,{error:'Not found'});
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,1); // Honest residual race boundary, not atomic authorization.
 assert.equal((await api(scoped+'/tasks/same')).status,404);
}));

test('optional completion fields verify effective normalized values rather than raw empty strings',()=>isolated(async()=>{
 sql("UPDATE tasks SET status='ready' WHERE id='same'");
 const r=await api(scoped+'/tasks/same/actions',{action:'complete',result:'  Result  ',summary:'',metadata:null});
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.detail.task.result,'Result');assert.equal(r.data.detail.completion.summary,'Result');
 const edit=await api(scoped+'/tasks/same/actions',{action:'edit',result:' Edited ',summary:''});assert.equal(edit.status,200,JSON.stringify(edit));assert.equal(edit.data.detail.completion.summary,'Edited');
}));

test('installed block-loop escalation is a verified management outcome, not a false failure',()=>isolated(async()=>{
 sql("UPDATE tasks SET status='ready' WHERE id='same'");process.env.OPERATOR_BLOCK_LOOP='1';
 const r=await api(scoped+'/tasks/same/actions',{action:'block',reason:'Still blocked'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.detail.task.status,'triage');assert.ok(r.data.detail.events.some(e=>e.kind==='block_loop_detected'));
}));

test('create with dropped persistence fails readback and later cross-adapter retry persists once',()=>isolated(async()=>{
 process.env.OPERATOR_DROP_WRITE='1';const r=await api(scoped+'/tasks',creation());assert.equal(r.status,502);
 assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',['create-one'])[0].n,0);
 delete process.env.OPERATOR_DROP_WRITE;
 assert.equal((await api('/api/kanban/tasks?board=default',creation())).status,201);
 assert.equal((await api(scoped+'/tasks',creation())).status,201);
 assert.equal(sql('SELECT count(*) AS n FROM tasks WHERE idempotency_key=?',['create-one'])[0].n,1);
}));
test('persisted evidence retries survive a fresh adapter process and archive without extra comments',()=>isolated(async()=>{
 const first=await api(scoped+'/tasks/same/evidence',evidence());assert.equal(first.status,200);
 const script=`import {Readable} from 'node:stream';import {handleKanbanRequest} from ${JSON.stringify(new URL('../scripts/kanban-bridge.mjs',import.meta.url).href)};
const req=Readable.from([Buffer.from(${JSON.stringify(JSON.stringify(evidence()))})]);Object.assign(req,{url:'/api/kanban/tasks/same/evidence?board=default',method:'POST',headers:{host:'localhost'}});
let status;await handleKanbanRequest(req,{writeHead(s){status=s;},end(v){console.log(JSON.stringify({status,data:JSON.parse(v)}));}},{repoRoot:${JSON.stringify(repo)}});`;
 const restarted=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:process.env});assert.equal(restarted.status,0,restarted.stderr);
 const r=JSON.parse(restarted.stdout);assert.equal(r.status,200);assert.deepEqual(r.data.evidence,first.data.evidence);
 assert.equal((await api(scoped+'/tasks/same/actions',{action:'archive'})).status,200);
 assert.deepEqual((await api(scoped+'/tasks/same/evidence',evidence())).data.evidence,first.data.evidence);
 assert.equal((await api(scoped+'/tasks/same/evidence',evidence({id:'new'}))).status,409);
 assert.equal(sql('SELECT count(*) AS n FROM task_comments')[0].n,1);
}));
