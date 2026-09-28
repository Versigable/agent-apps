import { scopedWritesEnabled } from './kanban-commands.mjs';
import { loadGames } from './kanban-games.mjs';
import { gameBoard, gameTask, gameRoster } from './kanban-operations.mjs';
import { listBuilds, downloadBuild } from './game-build-store.mjs';
function json(res,status,data) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(data));
}
import { writeTask, createTask, writeLink, readWriteJson } from './kanban-writes.mjs';
export async function handleGameDevRequest(req,res,{repoRoot}) {
  if(req.method==='POST' && scopedWritesEnabled()) {
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.search) return json(res,400,{error:'Query parameters are not supported'});
      const link=url.pathname.match(/^\/api\/game-dev\/games\/([a-zA-Z0-9_-]{1,64})\/links$/);
      if(link) return json(res,200,{ok:true,board:'default',...await writeLink({repoRoot,game:link[1]},await readWriteJson(req))});
      const create=url.pathname.match(/^\/api\/game-dev\/games\/([a-zA-Z0-9_-]{1,64})\/tasks$/);
      if(create) return json(res,201,{ok:true,board:'default',task:await createTask({repoRoot,game:create[1]},await readWriteJson(req))});
      const match=url.pathname.match(/^\/api\/game-dev\/games\/([a-zA-Z0-9_-]{1,64})\/tasks\/([a-zA-Z0-9_.:_-]{1,160})\/(comments|evidence|actions)$/);
      if(!match) return json(res,404,{error:'Not found'});
      const result=await writeTask({repoRoot,game:match[1]},({comments:'comment',evidence:'evidence',actions:'action'})[match[3]],match[2],await readWriteJson(req));
      return json(res,200,match[3]==='evidence' ? {evidence:result} : {ok:true,board:'default',...result});
    } catch(error) {
      return json(res,error.statusCode || 502,{error:error.statusCode===404 ? 'Not found' : 'Write rejected or could not be verified'});
    }
  }
  if(!['GET','HEAD'].includes(req.method)) {
    res.setHeader('allow','GET, HEAD');return json(res,405,{error:'Read-only endpoint'});
  }
  const url=new URL(req.url,'http://localhost');
  if(url.search) return json(res,400,{error:'Query parameters are not supported'});
  try {
    const games=await loadGames(repoRoot);
    const enabled=process.env.GAME_DEV_READS_ENABLED==='true';
    if(url.pathname==='/api/game-dev/games') return json(res,200,{games,taskReadsEnabled:enabled,writesEnabled:scopedWritesEnabled()});
    const capability=url.pathname.match(/^\/api\/game-dev\/games\/([a-zA-Z0-9_-]{1,64})\/(capabilities|roster)$/);
    if(capability && games.some(g=>g.id===capability[1])) {
      if(capability[2]==='capabilities') return json(res,200,{board:'default',game:capability[1],reads:enabled ? ['board','tasks','task-detail','roster'] : [],writes:scopedWritesEnabled() ? ['create-triage','capture','comment','assign','block','unblock','complete','archive','reassign','reclaim','edit','link','unlink','evidence'] : [],execution:false});
      if(!enabled) return json(res,403,{error:'Task view is not activated. Use the approved app operator surface.'});
      return json(res,200,await gameRoster(repoRoot,capability[1]));
    }
    const read=url.pathname.match(/^\/api\/game-dev\/games\/([a-zA-Z0-9_-]{1,64})\/(board|tasks)(?:\/([a-zA-Z0-9_.:_-]{1,160}))?$/);
    if(read && games.some(g=>g.id===read[1]) && (!read[3] || read[2]==='tasks')) {
      // Deployment gate only, NOT authentication. No production activation here.
      if(!enabled) return json(res,403,{error:'Task view is not activated. Use the approved app operator surface.'});
      if(read[3]) return json(res,200,await gameTask(repoRoot,read[1],read[3]));
      const board=await gameBoard(repoRoot,read[1]);
      return json(res,200,read[2]==='board' ? board : {mode:board.mode,readOnly:!scopedWritesEnabled(),writesEnabled:scopedWritesEnabled(),tasks:board.columns.flatMap(c=>c.tasks)});
    }
    const build=url.pathname.match(/^\/api\/game-dev\/games\/([a-zA-Z0-9_-]{1,64})\/builds(?:\/([a-zA-Z0-9_.-]{1,80})\/([a-zA-Z0-9_-]{1,80})\/download)?$/);
    if(!build || !games.some(g=>g.id===build[1])) return json(res,404,{error:'Not found'});
    if(build[2]) return await downloadBuild(req,res,build[1],build[2],build[3]);
    return json(res,200,{game:build[1],builds:await listBuilds(build[1])});
  } catch {
    if(res.headersSent) {res.destroy();return;}
    return json(res,404,{error:'Game data or build unavailable'});
  }
}
