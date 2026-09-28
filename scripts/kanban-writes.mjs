// Shared writes for both protected adapters. Locks coordinate this process ONLY.
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { withEvidenceLock, evidenceError, validateEvidence, encodeEvidence, sameEvidencePayload } from './kanban-evidence.mjs';
import { gameTask, gameBoard as gameBoardForCreateRead, readTaskSnapshot } from './kanban-operations.mjs';
import { parseGameDev as parseGameDevForCreate } from './kanban-games.mjs';
import { withScopedCommands, scopedWritesEnabled, commentTask, cleanText, optionalText, safeTaskId, prepareCreate, createTriageTask, parseBoolean, runHermesKanban, runTaskAction, runLinkAction } from './kanban-commands.mjs';

const fail=(message,status=400)=>{throw evidenceError(message,status);};

async function scopedOperation(ctx, operation) {
  if (!ctx.game) return operation();
  if (!scopedWritesEnabled()) fail('Transactional scoped writer is not configured',423);
  return withScopedCommands({game:ctx.game,database:await storeIdentity('default')},operation);
}
export const writeTask = (ctx,...args) => scopedOperation(ctx,()=>writeTaskInternal(ctx,...args));
export const createTask = (ctx,...args) => scopedOperation(ctx,()=>createTaskInternal(ctx,...args));
export const writeLink = (ctx,...args) => scopedOperation(ctx,()=>writeLinkInternal(ctx,...args));

// Mirror readonly/installed DB selection; realpath joins symlink aliases. Board
// identity is encoded by its actual DB path, not a caller's alias for that DB.
export async function storeIdentity(board) {
  const expand=p=>p==='~' ? process.env.HOME : p.startsWith('~/') ? path.join(process.env.HOME,p.slice(2)) : p;
  const canonical=async p=>{try{return await fs.realpath(p);}catch(e){if(e.code!=='ENOENT') throw e;return path.resolve(p);}};
  const native=await canonical(path.join(process.env.HOME || '/home/merquery','.hermes'));
  let root=native;
  if(process.env.HERMES_HOME) {
    const home=await canonical(expand(process.env.HERMES_HOME));
    if(home!==native && !home.startsWith(native+path.sep)) root=path.basename(path.dirname(home))==='profiles' ? path.dirname(path.dirname(home)) : home;
  }
  if(process.env.HERMES_KANBAN_HOME?.trim()) root=expand(process.env.HERMES_KANBAN_HOME.trim());
  return canonical(process.env.HERMES_KANBAN_DB ? expand(process.env.HERMES_KANBAN_DB) :
    (board==='default' ? path.join(root,'kanban.db') : path.join(root,'kanban/boards',board,'kanban.db')));
}
export async function withTaskLocks(board,ids,operation) {
  const store=await storeIdentity(board);
  const keys=[...new Set(ids)].sort().map(id=>JSON.stringify([store,'task',id]));
  const lock=index=>index===keys.length ? operation() : withEvidenceLock(keys[index],()=>lock(index+1));
  return lock(0);
}
export function fields(payload,allowed) {
  if(!payload || typeof payload!=='object' || Array.isArray(payload) || Object.keys(payload).some(k=>!allowed.includes(k))) fail('Invalid fields');
  for(const [key,value] of Object.entries(payload)) {
    if(['triage','reclaim'].includes(key) && typeof value!=='boolean') fail('Invalid boolean');
    if(key==='priority' && (typeof value!=='number' || !Number.isInteger(value))) fail('Invalid priority');
    if(['parents','skills'].includes(key) && (!Array.isArray(value) || value.some(v=>typeof v!=='string'))) fail('Invalid list');
    if(['title','body','text','author','action','assignee','tenant','workspace','max_runtime','idempotency_key','parent_id','child_id','result','summary','reason'].includes(key)) {
      if(value===null && ['assignee','tenant'].includes(key)) continue;
      if(typeof value!=='string' || value.includes('\0')) fail('Invalid text field');
    }
  }
}
async function detailFor(ctx,id) {
  const detail=ctx.game ? await gameTask(ctx.repoRoot,ctx.game,id) : await ctx.readDetail(id);
  if(!detail || detail.task?.id!==id) fail('Not found',404);
  return detail;
}
async function writeTaskInternal(ctx,operation,id,payload) {
  id=safeTaskId(id);
  const board=ctx.game ? 'default' : ctx.board;
  if(ctx.game && !scopedWritesEnabled()) fail('Writes are not activated',423);
  if(!['comment','evidence','action'].includes(operation)) fail('Unsupported operation');
  return withTaskLocks(board,[id],async()=>{
    const before=await detailFor(ctx,id);
    if(operation==='action') {
      const action=String(payload.action || '').toLowerCase();
      const allowed={assign:['assignee'],block:['reason'],unblock:[],complete:['result','summary','metadata'],archive:[],reclaim:['reason'],reassign:['assignee','reclaim','reason'],edit:['result','summary','metadata']};
      if(!Object.hasOwn(allowed,action)) fail('Unsupported task action');
      if(ctx.game) fields(payload,['action',...allowed[action]]);
      if(action==='archive' && before.task.status==='archived') return {id,action,detail:before};
      if(ctx.game && before.task.status==='archived') fail('Archived task is read-only',409);
      if(ctx.game) {
        const from={block:['running','ready'],unblock:['blocked','scheduled'],complete:['running','ready','blocked','review'],edit:['done'],reclaim:['running']};
        if(from[action] && !from[action].includes(before.task.status)) fail('Invalid transition',409);
        if(['assign','reassign'].includes(action) && before.task.status==='running' && !(action==='reassign' && payload.reclaim===true)) fail('Explicit reclaim is required',409);
      }
      const result=await runTaskAction(board,id,payload);
      const detail=await detailFor(ctx,id);
      // State and history, never command stdout, establish a successful write.
      const kind={assign:'assigned',reassign:'assigned',block:'blocked',unblock:'unblocked',complete:'completed',archive:'archived',reclaim:'reclaimed',edit:'edited'}[action];
      const event=detail.events.some(e=>((e.kind || e.event)===kind || (action==='block' && (e.kind || e.event)==='block_loop_detected')) && !before.events.some(old=>old.id===e.id));
      const states={block:['blocked','todo','triage'],unblock:['ready','todo','review'],complete:['done'],edit:['done'],archive:['archived'],reclaim:['ready','todo','review']};
      const assignment=['assign','reassign'].includes(action) ? (detail.task.assignee || 'none')===result.assignee : true;
      if(!event || !assignment || (states[action] && !states[action].includes(detail.task.status))) fail('Action write could not be verified',502);
      if(ctx.game && ['complete','edit'].includes(action)) {
        const expectedResult=action==='complete' ? result.result : cleanText(payload.result,8000,'result');
        const expectedSummary=action==='complete' ? result.summary : (optionalText(payload.summary,8000,'summary') || expectedResult);
        if(detail.task.result!==expectedResult) fail('Result readback failed',502);
        if(detail.completion?.summary!==expectedSummary) fail('Summary readback failed',502);
        if(payload.metadata!==undefined && payload.metadata!==null && payload.metadata!=='' && !isDeepStrictEqual(detail.completion?.metadata,typeof payload.metadata==='string' ? JSON.parse(payload.metadata) : payload.metadata)) fail('Metadata readback failed',502);
      }
      return {...result,detail};
    }
    if(operation==='evidence') {
      const input=validateEvidence(payload);
      const gameId=before.task.game_dev?.game_id;
      if(!gameId) fail('Evidence requires a game task');
      const existing=before.build_evidence.filter(r=>r.id===input.id);
      if(existing.length) {
        if(existing.length!==1 || existing.some(r=>!sameEvidencePayload(r,input))) fail('Evidence id already has a different payload',409);
        return existing[0];
      }
      if(ctx.game && before.task.status==='archived') fail('Archived task is read-only',409);
      const record={...input,version:1,source:'operator-reported',recorded_at:new Date().toISOString(),game_id:gameId};
      const body=encodeEvidence(record);
      await runHermesKanban(board,['comment',id,body,'--author',process.env.KANBAN_WRITE_AUTHOR || 'app-preview']);
      const detail=await detailFor(ctx,id);
      if(!detail.comments.some(c=>(c.body ?? c.text)===body) || !detail.build_evidence.some(r=>JSON.stringify(r)===JSON.stringify(record))) fail('Evidence write could not be verified',502);
      return record;
    }
    if(ctx.game) fields(payload,['text','author']);
    const text=cleanText(payload.text,8000,'comment');
    const author=optionalText(payload.author,80,'author') || process.env.KANBAN_WRITE_AUTHOR || 'app-preview';
    if(ctx.game && before.task.status==='archived') fail('Archived task is read-only',409);
    const result=await commentTask(board,id,payload);
    const detail=await detailFor(ctx,id);
    if(!detail.comments.some(c=>(c.body ?? c.text)===text && c.author===author && !before.comments.some(old=>old.id===c.id))) fail('Comment write could not be verified',502);
    return {...result,detail};
  });
}
export async function readWriteJson(req) {
  let size=0;const chunks=[];
  for await(const chunk of req) {
    size+=Buffer.byteLength(chunk);
    if(size>128000) fail('Request body is too large',413);
    chunks.push(Buffer.from(chunk));
  }
  let value;
  try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Invalid JSON');}
  if(!value || typeof value!=='object' || Array.isArray(value)) fail('Invalid JSON object');
  return value;
}


async function createTaskInternal(ctx,payload) {
  const board=ctx.game ? 'default' : ctx.board;
  if(ctx.game) {
    if(!scopedWritesEnabled()) fail('Writes are not activated',423);
    fields(payload,['title','body','game_dev','triage','assignee','tenant','workspace','priority','parents','skills','max_runtime','idempotency_key']);
    fields(payload.game_dev,['game_id','milestone','discipline','capture']);
    if(payload.game_dev.game_id!==ctx.game) fail('Game does not match route');
    if(!parseBoolean(payload.triage,true)) fail('Scoped creation requires triage');
  }
  const prepared=await prepareCreate(board,payload,ctx.repoRoot);
  const store=await storeIdentity(board);
  // The existing general adapter keeps its pre-migration create response while
  // the shared scoped gate is off. When enabled both adapters use this stricter
  // persisted retry/readback contract. No second implementation of commands.
  const strict=Boolean(ctx.game || scopedWritesEnabled());
  const key=JSON.stringify([store,'create',prepared.idempotencyKey || 'unkeyed']);
  const snapshot=()=>readTaskSnapshot(ctx.repoRoot,board,'write');
  const runtime=value=>{
    if(!value) return null;
    const match=/^(\d+)([smhd]?)$/.exec(value);
    if(!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1])<1) fail('Invalid max_runtime');
    return Number(match[1])*({'':1,s:1,m:60,h:3600,d:86400}[match[2]]);
  };
  const maxRuntime=runtime(prepared.maxRuntime);
  const same=(task,data)=> {
    const creation=data.details[task.id].creation;
    if(!creation || (creation.status==='triage')!==parseBoolean(payload.triage,true)) return false;
    const parents=creation.parents || [];
    const workspace=task.workspace_kind==='dir' ? `dir:${task.workspace_path}` : (task.workspace_kind || 'scratch');
    let skills=task.skills || [];
    if(typeof skills==='string') skills=JSON.parse(skills);
    return task.title===prepared.title && task.body===prepared.body
      && (creation.assignee || null)===prepared.assignee && (creation.tenant || null)===prepared.tenant
      && Number(task.priority || 0)===prepared.priority && workspace===prepared.workspace
      && (task.max_runtime_seconds || null)===maxRuntime
      && JSON.stringify([...(skills || [])].sort())===JSON.stringify([...new Set(prepared.skills)].sort())
      && JSON.stringify([...parents].sort())===JSON.stringify([...new Set(prepared.parents)].sort());
  };
  return withEvidenceLock(key,async()=>{
    if(!strict) return withTaskLocks(board,prepared.parents,()=>createTriageTask(board,payload,ctx.repoRoot));
    // Discover the existing retry target, then acquire ALL endpoint locks in one
    // sorted pass. Reread below: this discovery snapshot never authorizes writes.
    const found=prepared.idempotencyKey ? (await snapshot()).tasks.filter(t=>t.idempotency_key===prepared.idempotencyKey) : [];
    if(found.length>1) fail('Ambiguous idempotency key',409);
    return withTaskLocks(board,[...prepared.parents,...found.map(t=>t.id)],async()=>{
      const parents=[];
      if(ctx.game) {
        await gameBoardForCreateRead(ctx.repoRoot,ctx.game);
        // Membership always applies, including archived endpoints on retries.
        for(const id of prepared.parents) parents.push(await detailFor(ctx,id));
      }
      const before=await snapshot();
      const existing=prepared.idempotencyKey ? before.tasks.filter(t=>t.idempotency_key===prepared.idempotencyKey) : [];
      if(existing.length!==found.length || existing.some(t=>!found.some(f=>f.id===t.id))) fail('Retry target changed; retry request',409);
      if(existing.length) {
        const detail=await detailFor(ctx,existing[0].id);
        if(!same(existing[0],before)) fail('Idempotency key has a different payload',409);
        return {...detail.task,game_dev:parseGameDevForCreate(detail.task.body)};
      }
      // Existing identical intent is read-only; only NEW relationships reject
      // archived same-game parents. All endpoint locks are still held here.
      if(parents.some(d=>d.task.status==='archived')) fail('Archived parent',409);
      const created=await createTriageTask(board,payload,ctx.repoRoot);
      const after=await snapshot();
      const task=after.tasks.find(t=>t.id===created.id);
      if(!task || !same(task,after)) fail('Creation could not be verified',502);
      // New ID was not known before the command. Reauthorize exact persisted
      // target before returning; external processes still require owner fencing.
      const detail=await detailFor(ctx,task.id);
      return {...detail.task,game_dev:parseGameDevForCreate(detail.task.body)};
    });
  });
}


async function writeLinkInternal(ctx,payload) {
  if(ctx.game) {
    if(!scopedWritesEnabled()) fail('Writes are not activated',423);
    fields(payload,['action','parent_id','child_id']);
  }
  const parent=safeTaskId(payload.parent_id || payload.parentId),child=safeTaskId(payload.child_id || payload.childId);
  const action=String(payload.action || 'link').toLowerCase();
  if(!['link','unlink'].includes(action) || parent===child) fail('Invalid link action');
  const board=ctx.game ? 'default' : ctx.board;
  return withTaskLocks(board,[parent,child],async()=>{
    const before=await Promise.all([detailFor(ctx,parent),detailFor(ctx,child)]);
    if(ctx.game && before.some(d=>d.task.status==='archived')) fail('Archived endpoint is read-only',409);
    const result=await runLinkAction(board,{action,parent_id:parent,child_id:child});
    const details=await Promise.all([detailFor(ctx,parent),detailFor(ctx,child)]);
    const ids=links=>links.map(t=>typeof t==='string' ? t : t.id);
    if(ids(details[0].dependencies.children).includes(child)!==(action==='link') || ids(details[1].dependencies.parents).includes(parent)!==(action==='link')) fail('Dependency write could not be verified',502);
    return {...result,details};
  });
}
