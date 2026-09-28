import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'..');
export async function surface(run, {builds=[],native=false,query='game=fps-gauntlet',capabilities=null}={}) {
 const server=http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://local').pathname;const file=path.join(root,p==='/'?'games/dev/index.html':p);res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const calls=[];const game={id:'fps-gauntlet',title:'Neon Breach',previewUrl:'https://game-preview.ninjaprivacy.org/games/fps-gauntlet/',projectType:native?'native':'browser'};
 const task={id:'task-a',title:'Scoped fixture task',status:'ready',game_dev:{game_id:game.id,milestone:'MVP',discipline:'qa'},body:'Fixture task'};
 const detail={board:'default',task,comments:[],events:[],dependencies:{parents:[],children:[]},build_evidence:[]};
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,method:req.method(),payload:req.postDataJSON()});
 let data={};if(url.pathname==='/api/operator/session')data={csrfRequired:true,csrfToken:'fixture-token'};
 else if(url.pathname==='/api/game-dev/games')data={games:[game,{...game,id:'other-game',title:'Other game'}],taskReadsEnabled:true,writesEnabled:true};
 else if(url.pathname.endsWith('/capabilities'))data=capabilities || {reads:['board'],writes:['create-triage','capture','comment','assign','block','unblock','complete','archive','reassign','reclaim','edit','link','unlink','evidence']};
 else if(url.pathname.endsWith('/board'))data={board:'default',game:url.pathname.split('/')[4],mode:'fixture',readOnly:false,writesEnabled:true,columns:[{name:'ready',tasks:[{...task,game_dev:{...task.game_dev,game_id:url.pathname.split('/')[4]}}]}]};
 else if(url.pathname.endsWith('/roster'))data={assignees:[{name:'merquery'}],tenants:['default']};
 else if(url.pathname.endsWith('/builds'))data={builds};
 else if(url.pathname.endsWith('/tasks/task-a'))data=detail;
 else if(req.method()==='POST'){
  const payload=req.postDataJSON();
  if(url.pathname.endsWith('/evidence'))detail.build_evidence.push(payload);
  if(url.pathname.endsWith('/comments'))detail.comments.push({body:payload.text,id:detail.comments.length+1});
  if(payload.action==='assign')task.assignee=payload.assignee;
  data={ok:true,task:{id:'new-task'},detail};
 }
 else return route.fulfill({status:404,json:{error:'No fixture route'}});
 await route.fulfill({json:data});});
 try {await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`);await run({page,calls,detail,task});}finally{await browser.close();await new Promise(r=>server.close(r));}
}
test('trusted Game Dev shell mounts shared editable board without general API calls',async()=>surface(async({page,calls})=>{
 await page.locator('#board .task-card').waitFor({timeout:5000});
 assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('#create-task-form').isVisible(),true);
 assert.equal(await page.locator('#create-board-form').isVisible(),false);
 assert.equal(await page.locator('.execution-panel').isVisible(),false);
 await page.getByRole('button',{name:'Open Scoped fixture task'}).click();
 await page.getByRole('button',{name:'Add comment',exact:true}).waitFor();
 assert.equal(await page.getByRole('tab',{name:'Log',exact:true}).count(),0);
 assert.equal(calls.some(c=>c.path.startsWith('/api/kanban')),false,JSON.stringify(calls));
}));
test('exact build picker retains version/platform link and never substitutes native capture with browser identity',async()=>surface(async({page})=>{
 await page.getByLabel('Published build').waitFor({timeout:3000});
 await page.getByLabel('Published build').selectOption('v1/linux-x64');
 assert.match(page.url(),/version=v1/);assert.match(page.url(),/platform=linux-x64/);
 assert.match(await page.getByRole('link',{name:'Download ZIP',exact:true}).getAttribute('href'),/v1\/linux-x64\/download/);
 await page.locator('#playtest-capture summary').click();
 assert.equal(await page.locator('#capture-form [name=build_url]').inputValue(),'http://127.0.0.1:'+new URL(page.url()).port+'/api/game-dev/games/fps-gauntlet/builds/v1/linux-x64/download');
 assert.equal(await page.locator('#capture-form [name=build_identifier]').inputValue(),'v1 / linux-x64 / sha256:'+'a'.repeat(64));
}, {native:true,builds:[{version:'v1',platform:'linux-x64',date:'2026-09-01',size:42,sha256:'a'.repeat(64),notes:'Fixture build',downloadUrl:'/api/game-dev/games/fps-gauntlet/builds/v1/linux-x64/download'}]}));
test('scoped creation is triage-only and per-game drafts survive A-B-A',async()=>surface(async({page,calls})=>{
 await page.locator('#board .task-card').waitFor();
 const form=page.locator('#create-task-form');
 await form.locator('[name=title]').fill('A draft');await form.locator('[name=game_milestone]').fill('MVP');
 assert.equal(await form.locator('[name=triage]').isDisabled(),true);
 await page.locator('#game-selector').selectOption('other-game');
 assert.equal(await form.locator('[name=title]').inputValue(),'');
 await form.locator('[name=title]').fill('B draft');
 await page.locator('#game-selector').selectOption('fps-gauntlet');
 assert.equal(await form.locator('[name=title]').inputValue(),'A draft');
 let release;await page.route('**/api/game-dev/games/fps-gauntlet/tasks',async route=>{
  await new Promise(r=>release=r);await route.fulfill({json:{task:{id:'created'}}});
 });
 await form.getByRole('button',{name:'Create game task',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=create-status]').textContent.includes('Creating'));
 await form.locator('[name=title]').fill('Newer draft');
 while(!release)await new Promise(r=>setTimeout(r,5));release();
 await page.waitForTimeout(100);
 assert.equal(await form.locator('[name=title]').inputValue(),'Newer draft');
 assert.equal(calls.some(c=>c.path.startsWith('/api/kanban')),false);
}));
test('scoped board first-screen hierarchy and mobile viewport remain bounded',async()=>surface(async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.locator('#board .task-card').waitFor();
 assert.ok((await page.locator('#board').boundingBox()).y<950);
 if(process.env.GAME_DEV_FRONTEND_ARTIFACTS){await fs.mkdir(process.env.GAME_DEV_FRONTEND_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.GAME_DEV_FRONTEND_ARTIFACTS,'scoped-desktop.png'),fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.GAME_DEV_FRONTEND_ARTIFACTS)await page.screenshot({path:path.join(process.env.GAME_DEV_FRONTEND_ARTIFACTS,'scoped-mobile.png'),fullPage:true});
}));
test('ordinary management, capture and evidence reuse full scoped forms',async()=>surface(async({page,calls})=>{
 const open=async()=>{await page.getByRole('button',{name:'Open Scoped fixture task'}).click();await page.getByRole('button',{name:'Add comment',exact:true}).waitFor();};
 await open();
 await page.getByLabel('Comment',{exact:true}).fill('Scoped comment');await page.getByRole('button',{name:'Add comment',exact:true}).click();
 await page.getByRole('tab',{name:'Comments & Events'}).click();await page.getByText('Scoped comment',{exact:true}).waitFor();
 for(const [button,fields,action] of [
  ['Assign',{'Assignee':'merquery'},'assign'],['Block',{'Block reason':'Fixture block'},'block'],['Unblock',{},'unblock'],
  ['Reassign',{'Reassign profile':'merquery'},'reassign'],['Reassign + reclaim',{'Reassign profile':'merquery'},'reassign'],['Reclaim',{},'reclaim'],
  ['Link dependency',{'Child task id':'peer'},'link'],['Unlink dependency',{'Child task id':'peer'},'unlink'],
  ['Edit completed result',{'Backfill result':'Corrected result'},'edit'],['Complete with result',{'Completion result':'Fixture complete'},'complete'],['Archive',{},'archive']]){
   if(await page.locator('#drawer').isHidden())await open();
   for(const [label,value] of Object.entries(fields))await page.locator('#drawer').getByLabel(label,{exact:true}).fill(value);
   const response=page.waitForResponse(r=>r.request().method()==='POST' && r.url().includes('/api/game-dev/'));
   await page.getByRole('button',{name:button,exact:true}).click();await response;
   await page.waitForTimeout(80);
   assert.equal(calls.filter(c=>c.method==='POST').at(-1).payload.action,action);
 }
 await open();await page.getByRole('tab',{name:'Evidence',exact:true}).click();await page.getByText('Add evidence',{exact:true}).click();
 await page.getByLabel('Check / scope',{exact:true}).fill('Restart');await page.getByLabel('Reporter',{exact:true}).fill('Fixture operator');await page.getByLabel('Playable URL',{exact:true}).fill('https://game-preview.ninjaprivacy.org/games/fps-gauntlet/');
 await page.getByRole('button',{name:'Save evidence',exact:true}).click();await page.getByTestId('evidence-status').filter({hasText:'Persisted'}).waitFor();
 await page.locator('#drawer-close').click();await page.locator('#playtest-capture summary').click();
 await page.locator('#capture-form [name=title]').fill('Capture fixture');await page.locator('#capture-form [name=notes]').fill('Observed restart');
 await page.getByRole('button',{name:'Create playtest triage task',exact:true}).click();
 await page.locator('#capture-status').filter({hasText:'Created triage task'}).waitFor();
 const capture=calls.filter(c=>c.method==='POST').at(-1);assert.equal(capture.payload.triage,true);assert.equal(capture.payload.game_dev.game_id,'fps-gauntlet');assert.ok(capture.payload.idempotency_key);
 assert.equal(calls.some(c=>c.path.startsWith('/api/kanban')),false);
}));
test('delayed evidence after game A-B does not read task through the new game',async()=>surface(async({page,calls})=>{
 await page.getByRole('button',{name:'Open Scoped fixture task'}).click();
 await page.getByRole('tab',{name:'Evidence',exact:true}).click();await page.getByText('Add evidence',{exact:true}).click();
 await page.getByLabel('Check / scope',{exact:true}).fill('Restart');await page.getByLabel('Reporter',{exact:true}).fill('Fixture');await page.getByLabel('Playable URL',{exact:true}).fill('https://game-preview.ninjaprivacy.org/games/fps-gauntlet/');
 let release;await page.route('**/tasks/task-a/evidence',async route=>{await new Promise(r=>release=r);await route.fulfill({json:{ok:true}});});
 await page.getByRole('button',{name:'Save evidence',exact:true}).click();
 while(!release)await new Promise(r=>setTimeout(r,5));
 await page.locator('#game-selector').selectOption('other-game');release();await page.waitForTimeout(100);
 assert.equal(calls.some(c=>c.path==='/api/game-dev/games/other-game/tasks/task-a'),false);
}));
test('unknown requested game never substitutes another game board',async()=>surface(async({page,calls})=>{
 await page.locator('#board .error').waitFor({timeout:3000});
 assert.equal(await page.locator('#game-selector').inputValue(),'');
 assert.equal(calls.some(c=>c.path.endsWith('/board')),false);
}, {query:'game=not-registered'}));
test('delayed ordinary write preserves newer drawer edits',async()=>surface(async({page})=>{
 await page.getByRole('button',{name:'Open Scoped fixture task'}).click();
 const assign=page.locator('.drawer-form').filter({has:page.getByRole('button',{name:'Assign',exact:true})});
 await assign.getByLabel('Assignee',{exact:true}).fill('qa');
 let release;await page.route('**/tasks/task-a/actions',async route=>{await new Promise(r=>release=r);await route.fulfill({json:{ok:true}});});
 await assign.getByRole('button',{name:'Assign',exact:true}).click();
 while(!release)await new Promise(r=>setTimeout(r,5));
 await page.getByLabel('Comment',{exact:true}).fill('Newer unsent drawer draft');release();await page.waitForTimeout(150);
 assert.equal(await page.getByLabel('Comment',{exact:true}).inputValue(),'Newer unsent drawer draft');
}));
test('scoped capability subset disables unsupported forms without removing comments',async()=>surface(async({page})=>{
 await page.locator('#board .task-card').waitFor();
 assert.equal(await page.locator('#create-task-form button[type=submit]').isDisabled(),true);
 await page.getByRole('button',{name:'Open Scoped fixture task'}).click();
 assert.equal(await page.getByRole('button',{name:'Add comment',exact:true}).isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'Assign',exact:true}).isDisabled(),true);
}, {capabilities:{reads:['board'],writes:['comment']}}));
test('empty build picker and scoped create copy stay honest',async()=>surface(async({page})=>{
 await page.locator('#board .task-card').waitFor();
 assert.equal(await page.getByLabel('Published build').inputValue(),'');
 assert.equal(await page.getByLabel('Published build').evaluate(el=>el.selectedOptions[0]?.textContent),'No exact build selected');
 assert.equal(await page.locator('.published-builds details').isVisible(),false);
 assert.doesNotMatch(await page.getByTestId('create-status').innerText(),/direct todo/);
}));
test('scoped drawer renders projected comment bodies, event kinds and dependency identities',async()=>surface(async({page,detail})=>{
 detail.comments=[{id:1,body:'Authoritative scoped comment',author:'operator'}];
 detail.events=[{id:2,kind:'assigned'}];detail.dependencies.parents=[{id:'parent-a',title:'Parent task'}];
 await page.getByRole('button',{name:'Open Scoped fixture task'}).click();
 await page.getByText('parent-a',{exact:true}).waitFor({timeout:3000});
 await page.getByRole('tab',{name:'Comments & Events'}).click();
 await page.getByText('Authoritative scoped comment',{exact:true}).waitFor({timeout:3000});
 await page.getByText('assigned',{exact:true}).waitFor({timeout:3000});
}));
