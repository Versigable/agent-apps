import { validateEvidence } from './evidence-validation.mjs';
// Evidence is an operator report, never a deployment or CI attestation.
const node = (tag, text, className) => Object.assign(document.createElement(tag), {textContent:text || '', ...(className ? {className} : {})});
function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function link(parent, label, value) {
  const url = safeUrl(value);
  if (!url) return;
  const a = node('a',label); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; parent.append(a);
}
export function evidenceState(record, captured) {
  const association = !record.build_id || !captured ? 'Unverified build association' : record.build_id === captured ? 'Matching captured build' : 'Older/other build evidence';
  if (record.result === 'failed') return `Failed check · ${association}`;
  if (record.result === 'error') return `Error · ${association}`;
  if (record.result === 'skipped') return `Skipped — Not tested · ${association}`;
  return record.result === 'passed' && record.build_id && captured === record.build_id ? 'Reported pass matching captured build' : `Reported ${record.result || 'unknown'} · ${association}`;
}
export function renderEvidence(detail, {writesEnabled, captureView, postJson, loadTaskDetail}) {
  const task=detail.task, capture=task.game_dev?.capture;
  const panel=node('section', '', 'build-evidence'); panel.dataset.testid='evidence-panel';
  panel.append(node('h3','Evidence'),node('p','Operator-reported checks compare only to the captured build identifier. They do not establish live deployed identity or independent CI verification. Catalog checklists are reference only.'));
  if(capture){
    panel.append(node('h4','Captured observation'),node('p',`Captured build: ${capture.build?.identifier || 'Unknown'}`));
    link(panel,'Captured playable target',capture.build?.url);
    const shot=capture.screenshot;
    if(shot?.mime==='image/png' && typeof shot.base64==='string' && shot.base64.length<=90000 && /^[A-Za-z0-9+/]+={0,2}$/.test(shot.base64)){
      const img=node('img');img.alt='Captured playtest screenshot';img.src=`data:image/png;base64,${shot.base64}`;img.className='evidence-capture';panel.append(img);
    }
    panel.append(node('p','Capture is an observation, not a passing check. Media references may change and do not establish historical build identity.'));
  }
  const records=node('div');records.dataset.testid='evidence-records';panel.append(records);
  function renderRecords(){
    records.replaceChildren();const entries=Array.isArray(detail.build_evidence)?detail.build_evidence:[];
    if(!entries.length)records.append(node('p','Not tested — no recorded checks.'));
    for(const entry of entries){
      const article=node('article','','timeline-item');article.append(node('h4',evidenceState(entry,capture?.build?.identifier)),node('p',`${entry.check} · ${entry.result}`),node('p',`Build: ${entry.build_id || 'Unknown'} · Commit: ${entry.commit_sha || 'Unknown'}`),node('p',`${entry.performed_at || 'Unknown date'} · ${entry.reporter || 'Unknown reporter'} · operator-reported`));
      if(entry.recorded_at)article.append(node('p',`Recorded: ${entry.recorded_at}`));
      const links=node('div','','game-links');for(const [label,key] of [['Playable target','playable_url'],['Screenshot','screenshot_url'],['Video','video_url']])link(links,label,entry[key]);article.append(links);records.append(article);
    }
  }
  renderRecords();
  if(!task.game_dev || !writesEnabled())return panel;
  const disclosure=node('details');disclosure.append(node('summary','Add evidence'),node('p','Enter the target actually checked. Screenshot/video references must use the approved game-preview /games/artifacts/ location. No checks are executed by this form.'));
  const form=node('form','','drawer-form evidence-form');form.noValidate=true;
  for(const [name,label,value] of [['check','Check / scope',''],['result','Result','passed'],['performed_at','Performed at (ISO)',new Date().toISOString()],['reporter','Reporter',''],['build_id','Tested build identifier',''],['commit_sha','Full commit SHA',''],['playable_url','Playable URL',''],['screenshot_url','Screenshot URL',''],['video_url','Video URL','']]){
    const wrap=node('label','','field');wrap.append(node('span',label));
    const input=document.createElement(name==='result'?'select':'input');input.name=name;input.setAttribute('aria-label',label);
    if(name==='result')for(const result of ['passed','failed','error','skipped'])input.append(new Option(result,result));
    else {input.type='text';input.maxLength=({check:1000,reporter:120,build_id:160,commit_sha:40,performed_at:40})[name] || 2048;}
    input.value=value;wrap.append(input);form.append(wrap);
  }
  const button=node('button','Save evidence');button.type='submit';
  const status=node('p','','action-status');status.dataset.testid='evidence-status';status.setAttribute('role','status');form.append(button,status);disclosure.append(form);panel.append(disclosure);
  let revision=0,lastPayload='',draftId=null,busy=false;
  form.addEventListener('input',()=>revision++);
  form.addEventListener('change',()=>revision++);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !writesEnabled())return;
    const view=captureView(true),edit=revision;
    // Tab switching detaches this cached panel without invalidating its drawer.
    const current=()=>view.isCurrent() && edit===revision;
    const payload=Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,String(value).trim() || null]));
    try{
      const serialized=JSON.stringify(payload);if(serialized!==lastPayload){draftId=crypto.randomUUID();lastPayload=serialized;}
      validateEvidence({id:draftId,...payload});
      busy=true;button.disabled=true;status.textContent='Saving operator report…';status.classList.remove('is-error');
      await postJson(`/api/kanban/tasks/${encodeURIComponent(task.id)}/evidence?board=${encodeURIComponent(detail.board)}`,{id:draftId,...payload});
      // Always confirm persistence with the authoritative detail endpoint.
      const saved=await loadTaskDetail(task.id,detail.board);
      if(!current())return;
      if(saved.task?.id!==task.id || !saved.build_evidence?.some(item=>item.id===draftId))throw new Error('Write not confirmed by readback. Retry the unchanged draft.');
      detail.build_evidence=saved.build_evidence;renderRecords();status.textContent='Persisted operator report (read back from task).';
    }catch(error){if(current()){status.textContent=error.message;status.classList.add('is-error');}}
    finally{busy=false;button.disabled=false;}
  });
  return panel;
}
