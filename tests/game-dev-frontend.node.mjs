import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const path=new URL('../apps/kanban/transport.js',import.meta.url);
test('scoped transport loads board/roster/capabilities without general or execution requests',async()=>{
 assert.equal(await fs.access(path).then(()=>true,()=>false),true,'shared injectable transport exists');
 const {createTransport}=await import(path);
 const calls=[];
 const transport=createTransport({scoped:true,game:()=> 'fps-gauntlet',fetcher:async(url)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('capabilities')?{reads:['board'],writes:['create-triage']}:{board:'default',game:'fps-gauntlet',columns:[]} ),{headers:{'content-type':'application/json'}});}});
 const [board]=await transport.loadBoard('default');
 assert.equal(board.board,'default');
 assert.deepEqual(calls.sort(),['board','capabilities','roster'].map(x=>'/api/game-dev/games/fps-gauntlet/'+x).sort());
 await assert.rejects(()=>transport.request('/api/kanban/boards'));
 await assert.rejects(()=>transport.request('/api/kanban/execution/status'));
 assert.equal(calls.length,3);
});
test('writes obtain session CSRF with same-origin credentials and never replay rejected POST',async()=>{
 const {createTransport}=await import(path); const calls=[];
 const transport=createTransport({scoped:true,game:()=> 'fps-gauntlet',fetcher:async(url,options)=>{
  calls.push({url,options});
  return new Response(JSON.stringify(url==='/api/operator/session'?{csrfRequired:true,csrfToken:'fixture-session-token',expiresAt:Date.now()+60000}:{error:'expired'}),{status:url==='/api/operator/session'?200:403,headers:{'content-type':'application/json'}});
 }});
 await assert.rejects(()=>transport.request('/api/kanban/tasks?board=default',{method:'POST',body:'{}'}),/expired/);
 assert.equal(calls[0].url,'/api/operator/session');
 assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(calls[1].options.headers['X-Operator-CSRF'],'fixture-session-token');
 assert.equal(calls[1].url,'/api/game-dev/games/fps-gauntlet/tasks');
 assert.equal(calls.length,2);
});
test('only explicit legacy csrfRequired false permits a tokenless general write',async()=>{
 const {createTransport}=await import(path);
 for(const response of [{},{csrfRequired:false}]){
  const calls=[];const transport=createTransport({fetcher:async(url)=>{calls.push(url);return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});}});
  if(response.csrfRequired===false) await transport.request('/api/kanban/tasks',{method:'POST'});
  else await assert.rejects(()=>transport.request('/api/kanban/tasks',{method:'POST'}));
  assert.equal(calls.length,response.csrfRequired===false?2:1);
 }
});
