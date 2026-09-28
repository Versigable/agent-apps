// Domain reads only: no HTTP router, CLI initialization, writable DB or lock copy.
import { scopedWritesEnabled } from './kanban-commands.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadGames, parseGameDev } from './kanban-games.mjs';
import { parseEvidence } from './kanban-evidence.mjs';
const exec = promisify(execFile);
const columns = ['triage','todo','scheduled','ready','running','review','blocked','done'];

export async function readTaskHistory(repoRoot, board, taskId) {
  const { stdout } = await exec(process.env.KANBAN_PYTHON || 'python3',
    [path.join(repoRoot,'scripts/kanban-readonly.py'),board,'--general-task',taskId],
    {timeout:10000,maxBuffer:8*1024*1024,env:{...process.env}});
  return JSON.parse(stdout);
}
export async function readTaskSnapshot(repoRoot, board, snapshot = false) {
  const { stdout } = await exec(process.env.KANBAN_PYTHON || 'python3',
    [path.join(repoRoot,'scripts/kanban-readonly.py'),board,...(snapshot ? [snapshot==='write' ? '--write-snapshot' : '--snapshot'] : [])],
    {timeout:10000,maxBuffer:8*1024*1024,env:{...process.env}});
  return JSON.parse(stdout);
}
function missing() { return Object.assign(new Error('Not found'),{statusCode:404}); }
function pick(value, keys) {
  return Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
}
function card(task) {
  const meta=parseGameDev(task.body);
  return {...pick(task,['id','title','assignee','tenant','priority','created_at','updated_at']),
    status:task.status || 'unknown',game_dev:pick(meta,['game_id','milestone','discipline'])};
}
async function gameSnapshot(repoRoot, game) {
  if(!(await loadGames(repoRoot)).some(g=>g.id===game)) throw missing();
  const requested=(process.env.KANBAN_MODE || '').toLowerCase();
  const mode=['fixture','live'].includes(requested) ? requested :
    (process.env.CI || process.env.PREVIEW_PORT==='4174' ? 'fixture' : 'live');
  let data;
  if(mode==='fixture') {
    const file=path.resolve(repoRoot,process.env.KANBAN_FIXTURE_PATH || 'apps/kanban/fixtures/default-board.json');
    if(!file.startsWith(path.resolve(repoRoot)+path.sep)) throw missing();
    const raw=JSON.parse(await fs.readFile(file,'utf8'));
    const board=(raw.board || 'default')==='default' ? raw : raw.board_data?.default;
    data={tasks:(board?.columns || []).flatMap(c=>(c.tasks || []).map(t=>({...t,status:c.name}))),details:raw.task_details || {}};
  } else data=await readTaskSnapshot(repoRoot,'default',true);
  return {...data,mode,tasks:data.tasks.filter(t=>parseGameDev(t.body)?.game_id===game)};
}
export async function gameBoard(repoRoot, game) {
  const snapshot=await gameSnapshot(repoRoot,game);
  const tasks=snapshot.tasks.filter(t=>t.status!=='archived').map(card);
  const names=[...new Set([...columns,...tasks.map(t=>t.status)])];
  const lanes=names.map(name=>({name,tasks:tasks.filter(t=>t.status===name)}));
  return {board:'default',game,mode:snapshot.mode,readOnly:!scopedWritesEnabled(),writesEnabled:scopedWritesEnabled(),columns:lanes,
    summary:{total:tasks.length,by_status:Object.fromEntries(lanes.map(c=>[c.name,c.tasks.length]))}};
}
export async function gameRoster(repoRoot, game) {
  const board=await gameBoard(repoRoot,game);
  const file=path.resolve(repoRoot,process.env.KANBAN_ROSTER_PATH || 'apps/kanban/operator-roster.json');
  if(!file.startsWith(path.resolve(repoRoot)+path.sep)) throw missing();
  let roster;
  try { roster=JSON.parse(await fs.readFile(file,'utf8')); }
  catch(error) { if(error.code!=='ENOENT') throw error; roster={}; }
  const tasks=board.columns.flatMap(c=>c.tasks);
  const assignees=new Map();
  for(const item of roster.assignees || []) {
    const entry=typeof item==='string' ? {name:item} : item;
    if(typeof entry?.name==='string') assignees.set(entry.name,pick(entry,['name','role']));
  }
  for(const task of tasks) if(task.assignee && !assignees.has(task.assignee)) assignees.set(task.assignee,{name:task.assignee});
  return {board:'default',game,assignees:[...assignees.values()].sort((a,b)=>a.name.localeCompare(b.name)),
    tenants:[...new Set([...(roster.tenants || []),...tasks.map(t=>t.tenant)].filter(t=>typeof t==='string' && t))].sort()};
}
export async function gameTask(repoRoot, game, id) {
  const snapshot=await gameSnapshot(repoRoot,game);
  const task=snapshot.tasks.find(t=>t.id===id);
  if(!task) throw missing();
  const detail=snapshot.details?.[id] || {};
  const comments=(detail.comments || []).filter(c=>c.task_id===id)
    .map(c=>pick(c,['id','task_id','body','author','created_at']));
  // Project event headers only. Link history requires both endpoints still in
  // this game; arbitrary payloads and execution/unknown events never cross.
  const ids=new Set(snapshot.tasks.map(t=>t.id));
  const events=(detail.events || []).flatMap(e=>{
    if(e.task_id!==id) return [];
    const header=pick(e,['id','task_id','kind','ts','created_at']);
    if(['linked','unlinked'].includes(e.kind)) {
      let payload=e.payload;
      try { if(typeof payload==='string') payload=JSON.parse(payload); } catch { return []; }
      const parent=payload?.parent, child=payload?.child;
      return ids.has(parent) && ids.has(child) && (parent===id || child===id)
        ? [{...header,parent_id:parent,child_id:child}] : [];
    }
    return ['created','completed','archived','blocked','unblocked','assigned','comment_added',
      'edited','reclaimed','block_loop_detected','task_created','task_completed','task_archived','task_blocked','task_unblocked'].includes(e.kind) ? [header] : [];
  });
  const dependencies=Object.fromEntries(['parents','children'].map(direction=>[direction,
    (detail.dependencies?.[direction] || []).flatMap(link=>{
      const peer=snapshot.tasks.find(t=>t.id===(typeof link==='string' ? link : link.id));
      return peer ? [card(peer)] : [];
    })]));
  return {board:'default',game,mode:snapshot.mode,readOnly:!scopedWritesEnabled(),writesEnabled:scopedWritesEnabled(),
    task:{...card(task),game_dev:parseGameDev(task.body),...pick(task,['result']),body:task.body || ''},...(detail.completion ? {completion:pick(detail.completion,['summary','metadata'])} : {}),comments,events,dependencies,build_evidence:parseEvidence(comments,game)};
}
