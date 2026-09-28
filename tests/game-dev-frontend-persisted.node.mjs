// Browser + shared scoped/general operations + real isolated SQLite.
// Synthetic CLI protocol writer, NOT installed-Hermes or auth/deployment proof.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {handleGameDevRequest} from '../scripts/game-dev-api.mjs';
import {handleKanbanRequest} from '../scripts/kanban-bridge.mjs';
const repo=path.resolve(import.meta.dirname,'..');
test('browser creates, manages, captures and evidences the same persisted scoped/general task IDs',async()=>{
 const saved={...process.env},dir=await fs.mkdtemp(path.join(os.tmpdir(),'frontend-persisted-'));
 let server,browser;
 try {
  const cli=path.join(dir,'fixture-cli');await fs.copyFile(path.join(repo,'tests/helpers/operator-fixture.py'),cli);await fs.chmod(cli,0o700);
  Object.assign(process.env,{HOME:dir,HERMES_HOME:dir,HERMES_KANBAN_HOME:dir,HERMES_KANBAN_DB:path.join(dir,'fixture.db'),HERMES_BIN:cli,GAME_DEV_SCOPED_WRITER:cli,KANBAN_SCOPED_GUARD:path.join(repo,'scripts/game-dev-scoped-writer.py'),KANBAN_MODE:'live',KANBAN_READONLY:'false',GAME_DEV_READS_ENABLED:'true',GAME_DEV_WRITES_ENABLED:'true'});
  const seed=spawnSync(cli,['--seed'],{encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
  const sql=(statement,params=[])=>{const result=spawnSync('python3',['-c',"import sqlite3,json,sys,os\nc=sqlite3.connect(os.environ['HERMES_KANBAN_DB']);c.row_factory=sqlite3.Row\nr=c.execute(sys.argv[1],json.loads(sys.argv[2])).fetchall();c.commit();print(json.dumps([dict(x) for x in r]))",statement,JSON.stringify(params)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  const requests=[];
  server=http.createServer(async(req,res)=>{requests.push(req.url);try{
   if(req.url==='/api/operator/session'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({csrfRequired:true,csrfToken:'isolated-fixture-session'}));}
   if(req.url.startsWith('/api/game-dev/'))return await handleGameDevRequest(req,res,{repoRoot:repo});
   if(req.url.startsWith('/api/kanban/'))return await handleKanbanRequest(req,res,{repoRoot:repo});
   const p=new URL(req.url,'http://local').pathname;
   if(p!=='/' && !/^\/(apps\/kanban|games\/dev)\/[a-z-]+\.(html|css|js|mjs)$/.test(p)){res.writeHead(404);return res.end();}
   const file=path.join(repo,p==='/'?'games/dev/index.html':p);res.setHeader('content-type',p==='/'||p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'application/javascript');res.end(await fs.readFile(file));
  }catch(e){res.writeHead(500);res.end(String(e));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(8000);page.on('response',async response=>{if(response.status()>=400) console.error('fixture response',response.status(),response.url(),await response.text().catch(()=>''));});
  await page.goto(base+'/?game=fps-gauntlet');await page.getByRole('button',{name:'Open same',exact:true}).waitFor();
  const form=page.locator('#create-task-form');await form.locator('[name=title]').fill('Persisted UI task');await form.locator('[name=body]').fill('Acceptance fixture');await form.locator('[name=game_milestone]').fill('MVP');await form.locator('[name=idempotency_key]').fill('frontend-persisted-create');
  await form.getByRole('button',{name:'Create game task',exact:true}).click();await page.getByRole('button',{name:'Open Persisted UI task'}).waitFor();
  const id=sql('SELECT id FROM tasks WHERE idempotency_key=?',['frontend-persisted-create'])[0].id;
  await page.getByRole('button',{name:'Open Persisted UI task'}).click();await page.getByLabel('Comment',{exact:true}).fill('Persisted browser comment');await page.getByRole('button',{name:'Add comment',exact:true}).click();
  await expect(async()=>{await page.getByRole('tab',{name:'Comments & Events'}).click();await expect(page.getByText('Persisted browser comment',{exact:true})).toBeVisible({timeout:1000});}).toPass({timeout:8000});
  const general=await (await fetch(base+`/api/kanban/tasks/${id}/show?board=default`)).json();assert.equal(general.task.id,id);assert.ok(general.comments.some(c=>c.body==='Persisted browser comment'||c.text==='Persisted browser comment'));
  const assign=page.locator('.drawer-form').filter({has:page.getByRole('button',{name:'Assign',exact:true})});await assign.getByLabel('Assignee',{exact:true}).fill('QA');await assign.getByRole('button',{name:'Assign',exact:true}).click();await page.getByTestId('drawer-tab-panel').filter({hasText:'qa'}).waitFor();
  assert.equal(sql('SELECT assignee FROM tasks WHERE id=?',[id])[0].assignee,'qa');
  await page.getByRole('tab',{name:'Evidence',exact:true}).click();await page.getByText('Add evidence',{exact:true}).click();await page.getByLabel('Check / scope',{exact:true}).fill('Persistence test');await page.getByLabel('Reporter',{exact:true}).fill('Fixture operator');await page.getByLabel('Playable URL',{exact:true}).fill('https://game-preview.ninjaprivacy.org/games/fps-gauntlet/');await page.getByRole('button',{name:'Save evidence',exact:true}).click();await page.getByTestId('evidence-status').filter({hasText:'Persisted'}).waitFor();
  const scoped=await (await fetch(base+`/api/game-dev/games/fps-gauntlet/tasks/${id}`)).json();assert.equal(scoped.build_evidence.length,1);assert.equal(scoped.comments.length,2);
  await page.locator('#drawer-close').click();await page.locator('#playtest-capture summary').click();await page.locator('#capture-form [name=title]').fill('Persisted capture');await page.locator('#capture-form [name=notes]').fill('Actual isolated fixture observation');await page.getByRole('button',{name:'Create playtest triage task',exact:true}).click();await page.getByRole('button',{name:'Open Persisted capture'}).waitFor();
  const capture=sql('SELECT * FROM tasks WHERE title=?',['Persisted capture']);assert.equal(capture.length,1);assert.equal(capture[0].status,'triage');assert.equal(capture[0].assignee,null);
  // Lifecycle fixture staging: dispatch is intentionally absent from this UI.
  sql("UPDATE tasks SET status='ready' WHERE id=?",[id]);await page.locator('#refresh-board').click();
  const openTask=async()=>{await page.getByRole('button',{name:'Open Persisted UI task'}).click();await page.getByRole('button',{name:'Add comment',exact:true}).waitFor();};
  await openTask();
  for(const [button,fields,check] of [
    ['Link dependency',{'Child task id':'peer'},()=>sql('SELECT * FROM task_links WHERE parent_id=? AND child_id=?',[id,'peer']).length===1],
    ['Unlink dependency',{'Child task id':'peer'},()=>sql('SELECT * FROM task_links WHERE parent_id=? AND child_id=?',[id,'peer']).length===0],
    ['Block',{'Block reason':'Fixture check'},()=>sql('SELECT status FROM tasks WHERE id=?',[id])[0].status==='blocked'],
    ['Unblock',{},()=>sql('SELECT status FROM tasks WHERE id=?',[id])[0].status==='ready'],
    ['Complete with result',{'Completion result':'Persisted result'},()=>sql('SELECT status FROM tasks WHERE id=?',[id])[0].status==='done'],
    ['Edit completed result',{'Backfill result':'Corrected result'},()=>sql('SELECT result FROM tasks WHERE id=?',[id])[0].result==='Corrected result'],
    ['Archive',{},()=>sql('SELECT status FROM tasks WHERE id=?',[id])[0].status==='archived']]) {
    for(const [label,value] of Object.entries(fields))await page.locator('#drawer').getByLabel(label,{exact:true}).fill(value);
    const done=page.waitForResponse(r=>r.request().method()==='POST' && /\/(actions|links)$/.test(new URL(r.url()).pathname));
    await page.getByRole('button',{name:button,exact:true}).click();const result=await done;assert.equal(result.status(),200,await result.text());
    await expect.poll(check).toBe(true);
    await page.locator('#refresh-board').click();await page.getByTestId('last-refresh').filter({hasText:'Last refresh:'}).waitFor();
    if(button!=='Archive')await openTask();
  }
  const archived=await (await fetch(base+`/api/kanban/tasks/${id}/show?board=default`)).json();assert.equal(archived.task.status,'archived');assert.equal(archived.task.id,id);assert.ok(archived.events.some(e=>(e.kind || e.event)==='edited'));assert.ok(archived.events.some(e=>(e.kind || e.event)==='archived'));
  assert.equal(requests.filter(x=>x.startsWith('/api/kanban/')).length,2,'only explicit test general reads; browser stays scoped');
 } finally {if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));process.env=saved;await fs.rm(dir,{recursive:true,force:true});}
});
