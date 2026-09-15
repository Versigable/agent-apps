import { test, expect } from '@playwright/test';

test('edits after failed submission get a fresh retry key',async({page})=>{
 const writes=await setup(page,route=>route.fulfill({status:503,json:{error:'Ambiguous failure'}}));
 await title(page).fill('Original');await page.getByLabel('Playtest notes').fill('Notes');
 await submit(page).click();await expect(page.locator('#capture-status')).toContainText('Ambiguous');
 await page.getByLabel('Playtest notes').fill('Changed notes');await submit(page).click();
 await expect.poll(()=>writes.length).toBe(2);expect(writes[1].idempotency_key).not.toBe(writes[0].idempotency_key);
 await expect(title(page)).toHaveValue('Original');
});
for(const kind of ['board','game']) {
 async function roundtrip(page){
  const select=page.locator(kind==='board'?'#board-selector':'#game-selector');
  await select.selectOption(kind==='board'?'second':'runner');
  await expect(page.locator('#capture-context')).toContainText(kind==='board'?'second':'Runner');
  await select.selectOption(kind==='board'?'default':'snowdown');
  await expect(page.locator('#capture-context')).toContainText(kind==='board'?'default':'Snowdown');
 }
 test(`${kind} A-B-A ignores delayed POST without clearing draft`,async({page})=>{
  let release;const writes=await setup(page,route=>new Promise(resolve=>{release=async()=>{await route.fulfill({json:{task:{id:'late'}}});resolve();};}));
  await title(page).fill('Keep me');await page.getByLabel('Playtest notes').fill('Keep notes');await submit(page).click();
  await expect.poll(()=>writes.length).toBe(1);await roundtrip(page);await release();
  await expect(submit(page)).toBeEnabled();await expect(title(page)).toHaveValue('Keep me');
  await expect(page.locator('#capture-status')).not.toContainText('Created triage task');
 });
 test(`${kind} A-B-A ignores delayed screenshot decode`,async({page})=>{
  await setup(page);await page.evaluate(()=>{const original=window.createImageBitmap;window.createImageBitmap=(...args)=>new Promise(resolve=>{window.releaseImage=async()=>resolve(await original(...args));});});
  await page.getByLabel('Screenshot attachment').setInputFiles({name:'screen.png',mimeType:'image/png',buffer:image});
  await roundtrip(page);await page.evaluate(()=>window.releaseImage());
  await expect(submit(page)).toBeEnabled();await expect(page.locator('#capture-image')).toBeHidden();
 });
}
test('invalid and oversized images show bounded errors; remove recovers',async({page})=>{
 await setup(page);
 for(const file of [{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('invalid')},{name:'huge.png',mimeType:'image/png',buffer:Buffer.alloc(8*1024*1024+1)},{name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')}]){
  await page.getByLabel('Screenshot attachment').setInputFiles(file);
  await expect(page.locator('#capture-status')).toHaveClass(/is-error/);await expect(page.locator('#capture-image')).toBeHidden();
  await page.getByRole('button',{name:'Remove screenshot',exact:true}).click();await expect(page.locator('#capture-status')).toContainText('removed');
 }
});
for(const mime of ['image/jpeg','image/webp']) test(`${mime} noisy screenshot resizes to valid bounded PNG`,async({page})=>{
 const writes=await setup(page);
 const data=await page.evaluate(mime=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const ctx=c.getContext('2d'),d=ctx.createImageData(c.width,c.height);for(let i=0;i<d.data.length;i++) d.data[i]=i%4===3?255:Math.random()*256;ctx.putImageData(d,0,0);return c.toDataURL(mime).split(',')[1];},mime);
 await page.getByLabel('Screenshot attachment').setInputFiles({name:'normal.'+(mime==='image/jpeg'?'jpg':'webp'),mimeType:mime,buffer:Buffer.from(data,'base64')});
 await expect(page.locator('#capture-status')).toContainText('Screenshot ready');
 await title(page).fill('Screenshot');await page.getByLabel('Playtest notes').fill('Noise');await submit(page).click();
 await expect.poll(()=>writes.length).toBe(1);const capture=writes[0].game_dev.capture;
 expect(Buffer.from(capture.screenshot.base64,'base64').length).toBeLessThanOrEqual(65536);
 const {validateCapture}=await import('../scripts/kanban-capture.mjs');expect(validateCapture(capture)).toEqual(capture);
});

const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
async function setup(page, post, previewUrl='https://game-preview.ninjaprivacy.org/games/snowdown/') {
 const writes=[];
 await page.route('**/api/kanban/**',async route=>{
  const url=new URL(route.request().url());const board=url.searchParams.get('board')||'default';
  if(route.request().method()==='POST'){writes.push(route.request().postDataJSON());return post?post(route,writes.length):route.fulfill({json:{task:{id:'saved'}}});}
  const json=url.pathname.endsWith('/games')?{games:[{id:'snowdown',title:'Snowdown',previewUrl},{id:'runner',title:'Runner',previewUrl:'https://game-preview.ninjaprivacy.org/games/runner/'}]}
   :url.pathname.endsWith('/boards')?{boards:[{slug:'default'},{slug:'second'}]}
   :url.pathname.endsWith('/assignees')?{assignees:[]}
   :{board,mode:'live',writesEnabled:true,readOnly:false,columns:[],summary:{total:0}};
  return route.fulfill({json});
 });
 await page.goto('/apps/kanban/?view=game-dev');await page.locator('#playtest-capture summary').click();return writes;
}
const title=page=>page.getByLabel('Capture title',{exact:true});
const submit=page=>page.getByRole('button',{name:'Create playtest triage task',exact:true});

test('prominent playtest captures PNG and explicit unknown build; errors preserve draft and retry key',async({page})=>{
 const writes=await setup(page,(route,n)=>route.fulfill(n===1?{status:503,json:{error:'Retry later'}}:{json:{task:{id:'saved'}}}));
 await expect(page.getByRole('heading',{name:'Playtest → task capture'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Play selected build',exact:true})).toHaveAttribute('target','_blank');
 await expect(page.getByLabel('Build identifier / commit')).toHaveValue('');
 await expect(page.locator('#playtest-capture')).toContainText('Unknown');
 await title(page).fill('Jump clips');await page.getByLabel('Playtest notes').fill('Jump against wall');
 await page.getByLabel('Screenshot attachment').setInputFiles({name:'screen.png',mimeType:'image/png',buffer:image});
 await submit(page).click();await expect(page.locator('#capture-status')).toContainText('Retry later');
 await expect(title(page)).toHaveValue('Jump clips');await expect(page.getByLabel('Playtest notes')).toHaveValue('Jump against wall');
 await submit(page).click();await expect(page.locator('#capture-status')).toContainText('Created triage task saved');
 expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);
 expect(writes[0]).toMatchObject({title:'Jump clips',body:'Jump against wall',triage:true,game_dev:{game_id:'snowdown',milestone:'Playtest',discipline:'qa',capture:{version:1,build:{identifier:null,url:'https://game-preview.ninjaprivacy.org/games/snowdown/'},screenshot:{mime:'image/png'}}}});
 const { validateCapture } = await import('../scripts/kanban-capture.mjs');
 expect(validateCapture(writes[0].game_dev.capture)).toEqual(writes[0].game_dev.capture);
 expect(writes[0].assignee).toBeUndefined();expect(writes[0].idempotency_key).toBeTruthy();
});
