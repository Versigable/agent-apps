import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import net from 'node:net';
const repo = path.resolve(import.meta.dirname, '..');
async function server(surface, store, fn, extra = {}) {
 const reservation=net.createServer(); reservation.listen(0,'127.0.0.1'); await once(reservation,'listening'); const port=reservation.address().port; await new Promise(resolve=>reservation.close(resolve));
 const child = spawn(process.execPath, ['scripts/preview-service.mjs'], {cwd:repo, env:{...process.env, PREVIEW_HOST:'127.0.0.1',PREVIEW_PORT:String(port),PREVIEW_PUBLIC_URL:surface==='gamedev'?`http://localhost:${port}`:`http://127.0.0.1:${port}`,GAME_DEV_PUBLIC_URL:surface==='gamedev'?`http://127.0.0.1:${port}`:'',PREVIEW_SURFACE:surface==='gamedev'?'apps':surface,KANBAN_MODE:'fixture',KANBAN_READONLY:'false',KANBAN_EXECUTION_ENABLED:'true', GAME_BUILD_STORE:store,GAME_DEV_READS_ENABLED:'false',...extra},stdio:['ignore','pipe','pipe']});
 try {
  const address = await new Promise((resolve,reject)=>{let output=''; const timer=setTimeout(()=>reject(new Error('startup timeout')),10000); child.stdout.on('data', chunk=>{output+=chunk; const m=output.match(/listening on http:\/\/127.0.0.1:(\d+)/); if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}}); child.once('exit',()=>{clearTimeout(timer);reject(new Error('server exited'));});});
  await fn(address);
 } finally {child.kill(); await once(child,'exit');}
}
test('protected gamedev exposes scoped data and exact ZIP downloads without player/general routes', async () => {
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'game-surface-fixture-')); const store=path.join(tmp,'store');
 try {
  const zip=path.join(tmp,'fixture.zip');
  spawnSync('python3',['-c','import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("FIXTURE-NOT-A-BUILD.txt","Explicit test ZIP fixture")',zip]);
  const published=spawnSync('python3',['scripts/publish-game-build.py','--store',store,'--game','fps-gauntlet','--version','1.2.3-test','--platform','linux-x64','--notes','Explicit ZIP fixture, not a shipped build','--zip',zip],{cwd:repo,encoding:'utf8'}); assert.equal(published.status,0,published.stderr);
  await server('gamedev',store,async base=>{
   assert.equal((await fetch(base+'/games/dev/')).status,200);
   const games=await (await fetch(base+'/api/game-dev/games')).json(); assert.ok(games.games.length);
   const response=await fetch(base+'/api/game-dev/games/fps-gauntlet/builds'); assert.equal(response.status,200);
   const {builds}=await response.json(); assert.equal(builds.length,1); const b=builds[0];
   assert.equal(b.version,'1.2.3-test'); assert.equal(b.platform,'linux-x64'); assert.equal(b.notes,'Explicit ZIP fixture, not a shipped build'); assert.ok(b.date); assert.match(b.sha256,/^[a-f0-9]{64}$/);
   const download=await fetch(base+b.downloadUrl); assert.equal(download.status,200); assert.match(download.headers.get('content-disposition'),/^attachment;/); assert.equal(download.headers.get('x-content-type-options'),'nosniff');
   const data=Buffer.from(await download.arrayBuffer()); assert.equal(data.length,b.size); assert.equal(createHash('sha256').update(data).digest('hex'),b.sha256);
   assert.equal((await fetch(base+b.downloadUrl,{method:'HEAD'})).headers.get('content-length'),String(b.size));
   for(const route of ['/api/kanban/health','/api/kanban/board','/api/kanban/execution/status','/apps/kanban/','/api/game-dev/board','/api/game-dev/games/fps-gauntlet/tasks/other','/api/game-dev/games/fps-gauntlet/builds/%2e%2e/x/download']) assert.ok((await fetch(base+route)).status>=400,route);
   assert.equal((await fetch(base+'/api/game-dev/games',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,405);
   assert.equal((await fetch(base+'/api/game-dev/games/fps-gauntlet/tasks')).status,403, 'task reads default disabled even with Kanban write/execution flags');
   const artifacts=process.env.GAME_BUILD_TEST_ARTIFACTS || tmp; await fs.mkdir(artifacts,{recursive:true});
   const browser=await chromium.launch({headless:true});
   try {
    const page=await browser.newPage(); await page.goto(base+'/games/dev/?game=fps-gauntlet&version=1.2.3-test&platform=linux-x64');
    await page.getByRole('link',{name:'Download ZIP'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Download ZIP'}).getAttribute('href'),b.downloadUrl);
    assert.match(await page.locator('.published-builds').innerText(),/1.2.3-test/);
    assert.match(await page.locator('.published-builds').innerText(),new RegExp(b.sha256));
    assert.match(await page.locator('#board').innerText(),/not activated/);
    assert.equal(await page.locator('#create-task-form button[type=submit]').isDisabled(),true);
    const native=games.games.find(g=>g.projectType==='native');
    if(native) {await page.locator('#game-selector').selectOption(native.id);await page.getByText('No published builds yet.',{exact:false}).waitFor();}
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile does not overflow');
    await page.screenshot({path:path.join(artifacts,'builds-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000}); await page.screenshot({path:path.join(artifacts,'builds-desktop.png'),fullPage:true});
   } finally {await browser.close();}
   const unknown=await fetch(base+'/api/game-dev/games/nonexistent/builds'); assert.equal(unknown.status,404);
   const buildDir=path.join(store,'fps-gauntlet--1.2.3-test--linux-x64'); await fs.chmod(buildDir,0o755); await fs.unlink(path.join(buildDir,'build.zip')); await fs.symlink('/etc/passwd',path.join(buildDir,'build.zip'));
   assert.ok((await fetch(base+b.downloadUrl)).status>=400,'symlink never downloaded');
   await fs.unlink(path.join(buildDir,'build.zip')); await fs.copyFile(zip,path.join(buildDir,'build.zip'));
   await fs.writeFile(path.join(buildDir,'build.zip'),Buffer.alloc(b.size,65));
   const corrupt=await fetch(base+b.downloadUrl); assert.equal(corrupt.status,404); assert.doesNotMatch(await corrupt.text(),/\/tmp\//);
   await fs.rename(buildDir,buildDir+'-saved'); await fs.symlink(buildDir+'-saved',buildDir);
   assert.equal((await fetch(base+b.downloadUrl)).status,404,'linked parent rejected');
   for(const route of ['%252e%252e','%2fetc','%5csecret','bad%00id']) assert.ok((await fetch(base+`/api/game-dev/games/${route}/builds`)).status>=400);
   assert.equal((await fetch(base+'/api/game-dev/games/fps-gauntlet/builds?path=/etc/passwd')).status,400);
  });
  const fixture=path.join(repo,`tests/.game-build-board-${process.pid}.json`);
  const body='```game-dev\n'+JSON.stringify({game_id:'fps-gauntlet',milestone:'fixture',discipline:'qa'})+'\n```';
  await fs.writeFile(fixture,JSON.stringify({board:'default',columns:[{name:'triage',tasks:[{id:'fixture-game-task',title:'Labeled fixture task',status:'triage',body},{id:'fixture-private-task',title:'Not game data',body:'Private fixture'}]}]}));
  await server('gamedev',store,async base=>{
   const payload=await (await fetch(base+'/api/game-dev/games/fps-gauntlet/tasks')).json();
   assert.deepEqual(payload.tasks.map(t=>t.id),['fixture-game-task']);assert.equal(payload.writesEnabled,false);assert.equal(payload.tasks[0].body,undefined);
   assert.equal((await fetch(base+'/api/game-dev/games/fps-gauntlet/tasks?board=other')).status,400);
   assert.equal((await fetch(base+'/api/game-dev/games/fps-gauntlet/tasks',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,405);
   assert.equal((await fetch(base+'/api/kanban/board')).status,403);
  },{GAME_DEV_READS_ENABLED:'true',KANBAN_FIXTURE_PATH:fixture,KANBAN_BOARD:'default'});
  await server('apps',store,async base=>{assert.equal((await fetch(base+'/api/game-dev/games')).status,403); const html=await (await fetch(base+'/apps/kanban/')).text(); assert.match(html,/https:\/\/gamedev.ninjaprivacy.org\//); assert.equal((await fetch(base+'/api/kanban/health')).status,200);});
 } finally {await fs.rm(path.join(repo,`tests/.game-build-board-${process.pid}.json`),{force:true});spawnSync('chmod',['-R','u+w',tmp]);await fs.rm(tmp,{recursive:true,force:true});}
});
