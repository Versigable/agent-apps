import { test, expect } from '@playwright/test';
const record = {id:'record-1',build_id:'build-a',check:'Restart <img src=x>',result:'passed',performed_at:'2026-09-15T12:00:00Z',reporter:'Operator',source:'operator-reported',screenshot_url:'javascript:alert(1)',video_url:'https://example.com/video.mp4'};
async function setup(page, records=[], post) {
 const writes=[]; let stored=[...records]; let reads=0;
 await page.route('**/api/kanban/**',async route=>{
  const u=new URL(route.request().url()), board=u.searchParams.get('board')||'default';
  const task={id:'a',title:'Game A',status:'triage',game_dev:{game_id:'snowdown',capture:{build:{identifier:'build-a',url:'https://example.com/play'},screenshot:{mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='}}}};
  if(route.request().method()==='POST'){const data=route.request().postDataJSON();writes.push(data);if(post)return post(route,data,writes.length, value=>stored.push(value));stored.push({...data,source:'operator-reported'});return route.fulfill({json:{evidence:stored.at(-1)}});}
  let json;
  if(u.pathname.endsWith('/show')){reads++;json={task:{...task,id:u.pathname.split('/').at(-2)},build_evidence:stored,comments:[]};}
  else if(u.pathname.endsWith('/boards'))json={boards:[{slug:'default'},{slug:'second'}]};
  else if(u.pathname.endsWith('/assignees'))json={assignees:[]};
  else json={board,mode:'live',readOnly:false,writesEnabled:true,columns:[{name:'triage',tasks:[task,{...task,id:'b',title:'Game B'}]}]};
  await route.fulfill({json});
 });
 await page.goto('/apps/kanban/');await page.getByRole('button',{name:'Open Game A',exact:true}).click();await page.getByRole('tab',{name:'Evidence',exact:true}).click();
 return {writes,reads:()=>reads};
}
async function draft(page){await page.getByText('Add evidence',{exact:true}).click();await page.getByLabel('Check / scope',{exact:true}).fill('Restart');await page.getByLabel('Reporter',{exact:true}).fill('Manual operator');await page.getByLabel('Playable URL',{exact:true}).fill('https://example.com/play');}
const save=page=>page.getByRole('button',{name:'Save evidence',exact:true});
test('client rejects backend-invalid evidence before POST',async({page})=>{
 const state=await setup(page);await draft(page);
 for(const [name,value] of [['performed_at','2026-02-30T12:00:00Z'],['screenshot_url','https://evil.example/shot.png'],['playable_url','https://example.com/%252e%252e/play'],['check','bad\u007fcheck'],['reporter','x'.repeat(121)],['check','界'.repeat(1000)]]){
  const input=page.locator(`[name="${name}"]`);const old=await input.inputValue();
  await input.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  if(value==='界'.repeat(1000)) { await page.locator('[name="screenshot_url"]').fill('https://game-preview.ninjaprivacy.org/games/artifacts/'+ 'a'.repeat(1900)); await page.locator('[name="playable_url"]').fill('https://example.com/'+ 'a'.repeat(2000));await page.locator('[name="video_url"]').fill('https://game-preview.ninjaprivacy.org/games/artifacts/'+ 'a'.repeat(1900)); }
  await save(page).click();await expect(page.getByTestId('evidence-status')).toHaveClass(/is-error/);expect(state.writes).toHaveLength(0);await input.fill(old);
 }
});

test('missing readback never fabricates persisted evidence; mobile capture stays bounded',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,[],(route,data)=>route.fulfill({json:{evidence:data}}));await draft(page);await save(page).click();await expect(page.getByTestId('evidence-status')).toContainText('not confirmed');await expect(page.getByTestId('evidence-records')).toContainText('Not tested');await expect(page.getByLabel('Check / scope',{exact:true})).toHaveValue('Restart');expect((await page.locator('.evidence-capture').boundingBox()).height).toBeLessThanOrEqual(240);
 await page.getByRole('tab',{name:'Details',exact:true}).click();await page.getByRole('tab',{name:'Evidence',exact:true}).click();await expect(page.getByLabel('Check / scope',{exact:true})).toHaveValue('Restart');
});
test('evidence is scoped to captured build and safe references',async({page})=>{
 await setup(page,[record,{...record,id:'2',build_id:'other'},{...record,id:'3',build_id:null},{...record,id:'4',result:'failed'},{...record,id:'5',result:'skipped'},{...record,id:'6',result:'error'}]);
 const panel=page.getByTestId('evidence-panel');await expect(panel).toContainText('Reported pass matching captured build');await expect(panel).toContainText('Older/other build evidence');await expect(panel).toContainText('Unverified build association');await expect(panel).toContainText('Failed check');await expect(panel).toContainText('Skipped');await expect(panel).toContainText('Error');await expect(panel).toContainText('operator-reported');await expect(panel.locator('a[href^="javascript:"]')).toHaveCount(0);await expect(panel.locator('img')).toHaveCount(1);await expect(panel).toContainText('Restart <img src=x>');
});
test('write readback reload and empty state',async({page})=>{
 const state=await setup(page);await expect(page.getByTestId('evidence-panel')).toContainText('Not tested');await draft(page);await save(page).click();await expect(page.getByTestId('evidence-status')).toContainText('Persisted');expect(state.reads()).toBe(2);expect(state.writes).toHaveLength(1);await page.reload();await page.getByRole('button',{name:'Open Game A',exact:true}).click();await page.getByRole('tab',{name:'Evidence',exact:true}).click();await expect(page.getByTestId('evidence-records')).toContainText('Restart');
});
test('validation and failed retries preserve draft identity',async({page})=>{
 const state=await setup(page,[],route=>route.fulfill({status:503,json:{error:'Retry later'}}));await draft(page);await page.getByLabel('Screenshot URL',{exact:true}).fill('javascript:alert(1)');await save(page).click();expect(state.writes).toHaveLength(0);await page.getByLabel('Screenshot URL',{exact:true}).fill('');await save(page).click();await expect(page.getByTestId('evidence-status')).toContainText('Retry later');await save(page).click();await expect.poll(()=>state.writes.length).toBe(2);expect(state.writes[0].id).toBe(state.writes[1].id);await page.getByLabel('Check / scope',{exact:true}).fill('Changed');await save(page).click();await expect.poll(()=>state.writes.length).toBe(3);expect(state.writes[2].id).not.toBe(state.writes[1].id);await expect(page.getByLabel('Check / scope',{exact:true})).toHaveValue('Changed');
});
for(const phase of ['post','readback'])test(`delayed tab switch reconciles ${phase}`,async({page})=>{
 let release;
 const state=await setup(page,[],phase==='post'?(route,data,n,store)=>new Promise(resolve=>{release=async()=>{store(data);await route.fulfill({json:{evidence:data}});resolve();};}):undefined);
 await draft(page);
 if(phase==='readback') await page.route('**/tasks/a/show?**',route=>new Promise(resolve=>{release=async()=>{await route.fulfill({json:{task:{id:'a'},build_evidence:state.writes}});resolve();};}));
 await save(page).click();await expect.poll(()=>Boolean(release)).toBe(true);
 await page.evaluate(()=>{window.detachedEvidence=document.querySelector('[data-testid="evidence-panel"]');});
 await page.getByRole('tab',{name:'Details',exact:true}).click();
 await release();
 // Let the authoritative readback finish before reattaching the cached panel.
 await expect.poll(()=>state.reads()).toBe(phase==='post'?2:1);
 await expect.poll(()=>page.evaluate(()=>window.detachedEvidence.querySelector('button').disabled)).toBe(false);
 await page.getByRole('tab',{name:'Evidence',exact:true}).click();
 await expect(page.getByTestId('evidence-status')).toContainText('Persisted');
 await expect(page.getByTestId('evidence-records')).toContainText('Restart');
 await expect(page.getByLabel('Check / scope',{exact:true})).toHaveValue('Restart');
});
for(const mode of ['drawer','board','edit','close'])test(`delayed write guards ${mode}`,async({page})=>{
 let release;const state=await setup(page,[],(route,data,n,store)=>new Promise(resolve=>{release=async()=>{store(data);await route.fulfill({json:{evidence:data}});resolve();};}));await draft(page);await save(page).click();await expect.poll(()=>state.writes.length).toBe(1);
 if(mode==='edit')await page.getByLabel('Check / scope',{exact:true}).fill('New draft');
 else if(mode==='board'){await page.locator('#board-selector').selectOption('second');await expect(page.getByTestId('bridge-status')).toContainText('second');await page.locator('#board-selector').selectOption('default');}
 else {await page.locator('#drawer-close').click();if(mode==='drawer'){await page.getByRole('button',{name:'Open Game B',exact:true}).click();await page.locator('#drawer-close').click();await page.getByRole('button',{name:'Open Game A',exact:true}).click();await page.getByRole('tab',{name:'Evidence',exact:true}).click();}}
 await release();if(mode==='edit'){await expect(save(page)).toBeEnabled();await expect(page.getByLabel('Check / scope',{exact:true})).toHaveValue('New draft');}else await expect(page.getByTestId('evidence-status')).not.toContainText('Persisted');
});
