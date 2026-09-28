import {createTransport} from '/apps/kanban/transport.js';
// Mount the very same trusted forms and renderer, never game code or an iframe.
try {
  const response=await fetch('/apps/kanban/index.html',{credentials:'same-origin'});
  if(!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Operator shell unavailable. Sign in and refresh.');
  const doc=new DOMParser().parseFromString(await response.text(),'text/html');
  const main=doc.querySelector('main.shell'),drawer=doc.querySelector('#drawer');
  if(!main || !drawer) throw new Error('Invalid operator shell');
  main.querySelector('h1').textContent='Game Dev';
  main.querySelector('.lede').textContent='Editable game tasks, playtest capture and build evidence on the authoritative Hermes board.';
  main.querySelector('.board-controls').hidden=true;
  main.querySelector('.execution-panel').hidden=true;
  const nav=main.querySelector('.view-switch');nav.replaceChildren();
  for(const [label,href] of [['General board & execution ↗','https://app-preview.ninjaprivacy.org/apps/kanban/'],['Play games ↗','https://game-preview.ninjaprivacy.org/games/arcade/']]) {
    const link=document.createElement('a');Object.assign(link,{textContent:label,href,target:'_blank',rel:'noopener noreferrer'});nav.append(link);
  }
  document.body.replaceChildren(main,drawer);
  window.kanbanTransport=createTransport({scoped:true,game:()=>document.querySelector('#game-selector').value});
  await import('/apps/kanban/app.js');
} catch(error) {
  const status=document.createElement('p');status.setAttribute('role','alert');status.textContent=error.message;document.body.replaceChildren(status);
}
