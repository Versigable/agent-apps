import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
const repo=path.resolve(import.meta.dirname,'..');
const app='https://app-preview.example.test', game='https://gamedev.example.test';
async function isolated(fn, extra={}) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'operator-security-'));
 let child;
 try {
  const cli=path.join(dir,'synthetic-hermes');
  await fs.copyFile(path.join(repo,'tests/helpers/operator-fixture.py'),cli); await fs.chmod(cli,0o700);
  const env={...process.env,HOME:dir,HERMES_HOME:dir,HERMES_KANBAN_HOME:dir,HERMES_KANBAN_DB:path.join(dir,'fixture.db'),HERMES_BIN:cli,GAME_DEV_SCOPED_WRITER:cli,KANBAN_SCOPED_GUARD:path.join(repo,'scripts/game-dev-scoped-writer.py'),KANBAN_MODE:'live',KANBAN_READONLY:'false',KANBAN_EXECUTION_ENABLED:'true',GAME_DEV_READS_ENABLED:'true',GAME_DEV_WRITES_ENABLED:'true',PREVIEW_SURFACE:'apps',PREVIEW_HOST:'127.0.0.1',PREVIEW_PUBLIC_URL:app,GAME_DEV_PUBLIC_URL:game,...extra};
  const seed=spawnSync(cli,['--seed'],{env,encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
  const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  child=spawn(process.execPath,['scripts/preview-service.mjs'],{cwd:repo,env:{...env,PREVIEW_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('listener timeout')),10000);child.stdout.on('data',data=>{if(String(data).includes('listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error(`listener exit ${code}`));});});
  const request=(route,{host=new URL(app).host,origin=app,type='application/json',method='POST',body='{"text":"security observation"}',headers={}}={})=>new Promise((resolve,reject)=>{
   const h={host};if(origin!==null)h.origin=origin;if(type!==null)h['content-type']=type;Object.assign(h,headers);
   const req=http.request({agent:false,hostname:'127.0.0.1',port,path:route,method,headers:Object.entries(h).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).flatMap(item=>[k,item]))},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(['GET','HEAD'].includes(method)?undefined:body);
  });
  const fingerprint=async()=>Object.fromEntries(await Promise.all((await fs.readdir(dir)).filter(n=>n.startsWith('fixture.db')).sort().map(async n=>[n,(await fs.readFile(path.join(dir,n))).toString('base64')])));
  await fn({request,fingerprint,env:{...env,PREVIEW_PORT:String(port)},dir});
 } finally {if(child && child.exitCode===null){child.kill();await once(child,'exit');}await fs.rm(dir,{recursive:true,force:true});}
}
test('requested scoped activation denies tokenless writes on both hosts before DB access',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();
 for(const [origin,route] of [[app,'/api/kanban/tasks/same/comments?board=default'],[game,'/api/game-dev/games/fps-gauntlet/tasks/same/comments']]) {
  const r=await request(route,{host:new URL(origin).host,origin});assert.equal(r.status,403,r.body);
 }
 assert.deepEqual(await fingerprint(),before);
}));
test('CSRF browser sessions issue host-only cookies and allow paired persisted writes on both hosts',()=>isolated(async({request})=>{
 for(const [origin,route] of [[app,'/api/kanban/tasks/same/comments?board=default'],[game,'/api/game-dev/games/fps-gauntlet/tasks/same/comments']]) {
  const options={host:new URL(origin).host,origin};
  const session=await request('/api/operator/session',{...options,method:'GET'});assert.equal(session.status,200,session.body);
  const token=JSON.parse(session.body);assert.equal(token.csrfRequired,true);assert.match(token.csrfToken,/^[a-zA-Z0-9_-]{43}$/);
  const cookie=session.headers['set-cookie'][0];assert.match(cookie,/^__Host-operator-csrf=/);assert.match(cookie,/; Secure;/);assert.match(cookie,/; HttpOnly;/);assert.match(cookie,/; Path=\//);assert.ok(!cookie.includes('Domain='));
  assert.equal(session.headers['cache-control'],'no-store');assert.equal(session.headers['access-control-allow-origin'],undefined);
  const r=await request(route,{...options,headers:{cookie:cookie.split(';')[0],'x-operator-csrf':token.csrfToken}});assert.equal(r.status,200,r.body);
 }
}));
test('foreign Origin cannot persist a general comment through the real operator dispatcher',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();
 const r=await request('/api/kanban/tasks/same/comments?board=default',{origin:'https://game-preview.example.test'});
 assert.equal(r.status,403,r.body);assert.deepEqual(await fingerprint(),before);
}));
test('operator writes reject simple form media types before consuming JSON-shaped bodies',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();
 for(const type of [null,'text/plain','application/x-www-form-urlencoded','multipart/form-data; boundary=x','application/jsonx','application/json; charset=iso-8859-1']) {
  const r=await request('/api/kanban/tasks/same/comments?board=default',{type});
  assert.equal(r.status,415,`${type}: ${r.body}`);
 }
 assert.deepEqual(await fingerprint(),before);
}));
test('gamedev serves only scoped API and explicit trusted shell, never a general app alias',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint(); const options={host:new URL(game).host,origin:game,method:'GET'};
 for(const route of ['/api/kanban/health','/api/kanban/boards','/api/kanban/tasks/same/show','/api/kanban/execution/status','/apps/','/apps/kanban/','/apps/kanban/operator-roster.json','/games/fps-gauntlet/','/games/manifest.json','/node_modules/three/build/three.module.js','/games/dev/../fps-gauntlet/']) {
  assert.equal((await request(route,options)).status,403,route);
 }
 assert.equal((await request('/',options)).headers.location,'/games/dev/');
 assert.equal((await request('/games/dev',options)).status,308);
 for(const route of ['/games/dev/','/games/dev/index.html','/games/dev/app.js','/games/dev/styles.css','/api/game-dev/games',...['index.html','styles.css','app.js','game-dev.js','playtest-capture.js','build-evidence.js','evidence-validation.mjs','transport.js'].map(name=>'/apps/kanban/'+name)]) assert.equal((await request(route,options)).status,200,route);
 const scoped=await request('/api/game-dev/games/fps-gauntlet/tasks/same',options);
 assert.equal(scoped.status,200,scoped.body);
 assert.deepEqual(await fingerprint(),before);
}));
test('operator responses never grant wildcard CORS, including static files and failures',()=>isolated(async({request})=>{
 for(const [host,origin,routes] of [[new URL(app).host,app,['/api/kanban/health','/apps/kanban/','/healthz','/private']],[new URL(game).host,game,['/api/game-dev/games','/games/dev/app.js','/healthz','/apps/']]]) {
  for(const route of routes) {
   const r=await request(route,{host,origin,method:'GET'});
   assert.equal(r.headers['access-control-allow-origin'],undefined,route);
   assert.equal(r.headers['access-control-allow-credentials'],undefined,route);
  }
 }
}));
test('ambiguous headers, absolute targets and contradictory Fetch Metadata cannot bypass the boundary',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();
 for(const options of [{headers:{'sec-fetch-site':'same-site'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'sec-fetch-mode':'navigate'}},{headers:{origin:[app,app]}},{headers:{host:[new URL(app).host,new URL(game).host]}},{headers:{'content-type':['application/json','text/plain']}}]) {
  const r=await request('/api/kanban/tasks/same/comments?board=default',options);assert.ok(r.status>=400,r.body);
 }
 assert.ok((await request('https://evil.example.test/api/kanban/tasks/same/comments?board=default')).status>=400);
 for(const method of ['OPTIONS','PUT','PATCH','DELETE','TRACE']) assert.equal((await request('/apps/kanban/',{method})).status,405,method);
 assert.deepEqual(await fingerprint(),before);
}));
const generalRoutes=['/boards','/execution/dispatch','/tasks','/links','/tasks/same/evidence','/tasks/same/comments','/tasks/same/actions','/tasks/same/claim'].map(p=>'/api/kanban'+p+'?board=default');
test('local healthcheck uses configured app Host without accepting backend aliases',()=>isolated(async({env})=>{
 const r=spawnSync(process.execPath,['scripts/preview-service.mjs','--healthcheck'],{cwd:repo,env,encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).surface,'apps');
}));
const scopedRoutes=['/tasks','/links','/tasks/same/evidence','/tasks/same/comments','/tasks/same/actions'].map(p=>'/api/game-dev/games/fps-gauntlet'+p);
test('every discovered mutation family rejects missing/null/foreign/cross-host Origin and forms without DB changes',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();
 for(const [origin,routes] of [[app,generalRoutes],[game,scopedRoutes]]) {
  const host=new URL(origin).host;
  for(const route of routes) {
   for(const badOrigin of [null,'null','https://game-preview.example.test',origin+'/',origin+'.evil',origin===app?game:app]) {
    const r=await request(route,{host,origin:badOrigin,headers:{'x-forwarded-host':host,'x-forwarded-proto':'https','x-authentik-username':'MetaVersig',cookie:'authentik=fake-domain-wide-cookie'}});
    assert.equal(r.status,403,`${route} ${badOrigin}: ${r.body}`);
   }
   for(const type of [null,'text/plain','application/x-www-form-urlencoded','multipart/form-data; boundary=x']) assert.equal((await request(route,{host,origin,type})).status,415,route);
  }
 }
 for(const route of generalRoutes) assert.equal((await request(route,{host:new URL(game).host,origin:game})).status,403,route);
 for(const method of ['PUT','PATCH','DELETE','OPTIONS']) assert.ok((await request('/api/kanban/tasks/same/actions?board=default',{method,origin:null})).status>=400);
 assert.deepEqual(await fingerprint(),before,'DB, CLI call log and all SQLite sidecars remain byte-identical');
}));
test('trusted general and scoped comments persist in one store; general controls remain routed',()=>isolated(async({request,env})=>{
 let appSession;
 for(const [origin,route] of [[app,'/api/kanban/tasks/same/comments?board=default'],[game,'/api/game-dev/games/fps-gauntlet/tasks/same/comments']]) {
  const session=await request('/api/operator/session',{host:new URL(origin).host,origin,method:'GET'});
  const headers={cookie:session.headers['set-cookie'][0].split(';')[0],'x-operator-csrf':JSON.parse(session.body).csrfToken};
  if(origin===app)appSession=headers;
  const r=await request(route,{host:new URL(origin).host,origin,type:'application/json; charset=utf-8',headers:{...headers,'sec-fetch-site':'same-origin','sec-fetch-mode':'cors'}});
  assert.equal(r.status,200,r.body);
 }
 const scoped=JSON.parse((await request('/api/game-dev/games/fps-gauntlet/tasks/same',{method:'GET',host:new URL(game).host,origin:game})).body);
 assert.equal(scoped.comments.length,2);
 const count=spawnSync('python3',['-c',`import sqlite3,os; c=sqlite3.connect(os.environ['HERMES_KANBAN_DB']); print(c.execute('SELECT count(*) FROM task_comments').fetchone()[0])`],{env,encoding:'utf8'});assert.equal(count.status,0);assert.equal(count.stdout.trim(),'2');
 for(const route of ['/api/kanban/health','/apps/','/apps/kanban/']) assert.equal((await request(route,{method:'GET'})).status,200,route);
 // Invalid domain payload reaches the existing general validator, not Host/Origin rejection.
 for(const route of ['/api/kanban/boards','/api/kanban/execution/dispatch','/api/kanban/tasks/same/claim']) {
  const r=await request(route,{body:'{}',headers:appSession});assert.equal(r.status,400,`${route}: ${r.body}`);
 }
}));
test('scoped writes stay default disabled even with a trusted browser request',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();const r=await request('/api/game-dev/games/fps-gauntlet/tasks/same/comments',{host:new URL(game).host,origin:game});
 assert.equal(r.status,405,r.body);assert.deepEqual(await fingerprint(),before);
},{GAME_DEV_WRITES_ENABLED:''}));
test('a configured Game Dev host cannot regain player assets through the legacy all surface',()=>isolated(async({request})=>{
 for(const route of ['/games/fps-gauntlet/','/games/manifest.json','/apps/%2e%2e%2fgames/manifest.json']) assert.equal((await request(route,{method:'GET'})).status,403,route);
 assert.equal((await request('/',{method:'GET'})).headers.location,'/apps/');
 assert.equal((await request('/apps/kanban/',{method:'GET'})).status,200);
},{PREVIEW_SURFACE:'all'}));
test('unknown Host and unconfigured or ambiguous public origins fail closed, ignoring forwarded identity',async()=>{
 await isolated(async({request,fingerprint})=>{
  const before=await fingerprint();
  for(const host of ['evil.example.test','gamedev.example.test.evil','gamedev.example.test:443','GAMEDEV.example.test','gamedev.example.test.','127.0.0.1']) {
   const r=await request('/api/kanban/health',{method:'GET',host,headers:{'x-forwarded-host':new URL(app).host,forwarded:`host=${new URL(app).host};proto=https`,'x-authentik-username':'MetaVersig'}});
   assert.equal(r.status,403,`${host}: ${r.body}`);
  }
  assert.deepEqual(await fingerprint(),before);
 });
 for(const config of [{PREVIEW_PUBLIC_URL:'',GAME_DEV_PUBLIC_URL:''},{PREVIEW_PUBLIC_URL:app+'/'},{PREVIEW_PUBLIC_URL:'http://app-preview.example.test'},{PREVIEW_PUBLIC_URL:app,GAME_DEV_PUBLIC_URL:app}]) {
  await isolated(async({request,fingerprint})=>{const before=await fingerprint();assert.equal((await request('/api/kanban/tasks/same/comments?board=default')).status,403);assert.deepEqual(await fingerprint(),before);},config);
 }
});


test('CSRF session state expires and is bounded without evicting active sessions',async()=>{
 const module=await import('../scripts/operator-policy.mjs');
 assert.equal(typeof module.createOperatorCsrfPolicy,'function');
 let now=1000; const policy=module.createOperatorCsrfPolicy({now:()=>now,ttlMs:100,maxSessions:1});
 const env={OPERATOR_CSRF_ENABLED:'true'}, host={origin:app};
 const req={method:'GET',url:'/api/operator/session',headers:{},rawHeaders:[]};
 const first=policy(req,host,env);assert.equal(first.session.csrfRequired,true);
 assert.equal(policy(req,host,env).status,503);
 const cookie=first.setCookie.split(';')[0];
 const write={method:'POST',url:'/api/kanban/tasks',headers:{cookie,'x-operator-csrf':first.session.csrfToken},rawHeaders:[]};
 assert.equal(policy(write,host,env).status,undefined);
 now=1100;assert.equal(policy(write,host,env).status,403);
 assert.equal(policy(req,host,env).session.csrfRequired,true);
});


test('CSRF denies sibling token minting, ambiguous cookies and foreign session pairs without persistence',()=>isolated(async({request,fingerprint})=>{
 const get=async origin=>{
  const r=await request('/api/operator/session',{method:'GET',host:new URL(origin).host,origin});assert.equal(r.status,200);
  return {cookie:r.headers['set-cookie'][0].split(';')[0],token:JSON.parse(r.body).csrfToken};
 };
 const a=await get(app),b=await get(app),g=await get(game), before=await fingerprint();
 for(const options of [{origin:'https://game-preview.example.test'},{headers:{'sec-fetch-site':'same-site'}},{headers:{'sec-fetch-mode':'navigate'}},{method:'HEAD'}]) {
  const r=await request('/api/operator/session',{method:'GET',...options});assert.ok(r.status>=400,r.body);assert.equal(r.headers['set-cookie'],undefined);
 }
 for(const headers of [
  {cookie:a.cookie,'x-operator-csrf':b.token},
  {cookie:g.cookie,'x-operator-csrf':g.token},
  {cookie:a.cookie+'; '+b.cookie,'x-operator-csrf':a.token},
  {cookie:a.cookie+'; '+a.cookie,'x-operator-csrf':a.token},
  {cookie:[a.cookie,a.cookie],'x-operator-csrf':a.token},
  {cookie:a.cookie,'x-operator-csrf':[a.token,a.token]},
  {cookie:a.cookie,'x-operator-csrf':'é'.repeat(43)},
  {cookie:'__Host-operator-csrf=attacker','x-operator-csrf':a.token},
 ]) {
  const r=await request('/api/kanban/tasks/same/comments?board=default',{headers});assert.ok([400,403].includes(r.status),r.body);
 }
 assert.deepEqual(await fingerprint(),before);
}));


test('legacy development preview reports no CSRF session but cannot activate scoped writes',()=>isolated(async({request,fingerprint})=>{
 const before=await fingerprint();
 const session=await request('/api/operator/session',{method:'GET'});
 assert.equal(session.status,200,session.body);assert.deepEqual(JSON.parse(session.body),{csrfRequired:false});assert.equal(session.headers['set-cookie'],undefined);
 const write=await request('/api/game-dev/games/fps-gauntlet/tasks/same/comments');assert.equal(write.status,405,write.body);
 assert.deepEqual(await fingerprint(),before);
},{PREVIEW_SURFACE:'all',GAME_DEV_PUBLIC_URL:'',PREVIEW_PUBLIC_URL:'',OPERATOR_CSRF_ENABLED:''}));
