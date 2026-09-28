// Injected at the trusted shell. The scoped adapter has no general-router fallback.
export function createTransport({scoped=false, game=()=>null, fetcher=globalThis.fetch.bind(globalThis)}={}) {
  async function request(url,options={}) {
    if(scoped && url.startsWith('/api/kanban/')) {
      const source=new URL(url,'http://local');
      const route=source.pathname.slice('/api/kanban/'.length);
      if(route==='games') url='/api/game-dev/games';
      else if (/^(tasks(?:\/[a-zA-Z0-9_.:_-]+(?:\/(show|comments|actions|evidence))?)?|links)$/.test(route)) {
        url=`${base()}/${route.replace(/\/show$/, '')}`;
      } else throw new Error('Unavailable on the scoped Game Dev surface');
    }
    if(scoped && !/^\/api\/game-dev\/games(?:\/|$)/.test(url)) throw new Error('Unavailable on the scoped Game Dev surface');
    const headers={accept:'application/json',...options.headers};
    if(options.method && !['GET','HEAD'].includes(options.method.toUpperCase())) {
      // Obtain fresh session-bound proof for this attempt. Never retry a write.
      const sessionResponse=await fetcher('/api/operator/session',{credentials:'same-origin',headers:{accept:'application/json'}});
      if(!sessionResponse.ok || !sessionResponse.headers.get('content-type')?.includes('application/json')) throw new Error('Session unavailable. Sign in and retry explicitly; your draft is retained.');
      const session=await sessionResponse.json();
      if(session.csrfRequired===true && typeof session.csrfToken==='string' && session.csrfToken) headers['X-Operator-CSRF']=session.csrfToken;
      else if(session.csrfRequired!==false || scoped) throw new Error('Session protection unavailable. Your draft is retained.');
    }
    const response=await fetcher(url,{...options,credentials:'same-origin',headers});
    if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('Session or access expired. Sign in and refresh; your draft is retained.');
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }
  function base() {
    const id=game();
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id || '')) throw new Error('Select an available game');
    return `/api/game-dev/games/${encodeURIComponent(id)}`;
  }
  return {scoped,request,
    async loadBoard(board) {
      if(!scoped) return Promise.all(['board','boards','assignees','execution/status'].map(p=>request(`/api/kanban/${p}?board=${encodeURIComponent(board)}`)));
      const prefix=base();
      const [data,roster,capabilities]=await Promise.all(['board','roster','capabilities'].map(p=>request(`${prefix}/${p}`)));
      const enabled=Boolean(data.writesEnabled && capabilities.writes?.length);
      return [{...data,capabilities,readOnly:!enabled,writesEnabled:enabled,tenants:roster.tenants}, {boards:[]},roster,{executionEnabled:false}];
    }
  };
}
