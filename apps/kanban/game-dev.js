// Game Dev is a filtered lens on the same authoritative Hermes board.
export function createGameDev({ transport, onViewChange, onFilterChange, onGameChange }) {
  const panel = document.querySelector('#game-dev-panel');
  const selector = document.querySelector('#game-selector');
  const milestone = document.querySelector('#game-milestone-filter');
  const discipline = document.querySelector('#game-discipline-filter');
  const details = document.querySelector('#game-details');
  const status = document.querySelector('#game-catalog-status');
  let active = transport?.scoped || new URLSearchParams(location.search).get('view') === 'game-dev';
  let games = [];
  let generation = 0;
  let selectionGeneration = 0;
  function sync() {
    panel.hidden = !active;
    for (const link of document.querySelectorAll('[data-kanban-view]')) {
      const url = new URL(location.href);
      if (link.dataset.kanbanView === 'game-dev') url.searchParams.set('view', 'game-dev');
      else url.searchParams.delete('view');
      link.href = url.href;
      link.setAttribute('aria-current', (link.dataset.kanbanView === 'game-dev') === active ? 'page' : 'false');
    }
  }
  for (const link of document.querySelectorAll('[data-kanban-view]')) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      active = link.dataset.kanbanView === 'game-dev';
      history.replaceState({}, '', link.href);
      sync();
      onViewChange();
    });
  }
  let buildGeneration = 0;
  let selectedBuild = null;
  function selected() {
    const game = games.find(game => game.id === selector.value);
    return game && selectedBuild ? {...game, selectedBuild} : game;
  }
  async function renderBuilds(game) {
    const token = ++buildGeneration;
    selectedBuild = null;
    const section = document.createElement('section'); section.className = 'published-builds';
    const label = document.createElement('label'); label.textContent = 'Published build ';
    const picker = document.createElement('select'); picker.setAttribute('aria-label', 'Published build'); picker.disabled = true;
    const state = document.createElement('p'); state.textContent = 'Loading published builds…';
    const info = document.createElement('details');
    label.append(picker); section.append(label, state, info); details.append(section);
    try {
      const data = await transport.request(`/api/game-dev/games/${encodeURIComponent(game.id)}/builds`);
      if(token !== buildGeneration) return;
      const builds = data.builds || [];
      picker.replaceChildren(new Option('No exact build selected', ''), ...builds.map(build => new Option(`${build.version} · ${build.platform}`, `${build.version}/${build.platform}`)));
      picker.disabled = !builds.length;
      function choose(updateUrl) {
        selectedBuild = builds.find(build => `${build.version}/${build.platform}` === picker.value) || null;
        info.replaceChildren(); info.hidden = !selectedBuild;
        state.textContent = builds.length ? 'Published ZIPs are executable downloads, not proof of testing or platform compatibility.' : `No published builds yet.${game.projectType === 'native' ? ' Native build identity remains unknown.' : ''}`;
        if(selectedBuild) {
          const build = selectedBuild;
          const summary = document.createElement('summary'); summary.textContent = 'Selected build details & download';
          const notes = document.createElement('p'); notes.textContent = `${build.date} · ${Number(build.size).toLocaleString()} bytes · ${build.notes || 'No release notes supplied.'}`;
          const digest = document.createElement('code'); digest.textContent = `SHA-256 ${build.sha256}`;
          const a = document.createElement('a'); a.textContent = 'Download ZIP'; a.href = build.downloadUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
          info.append(summary, notes, digest, a); info.open = true;
        }
        if(updateUrl) {
          const url = new URL(location.href);
          for(const key of ['version', 'platform']) selectedBuild ? url.searchParams.set(key, selectedBuild[key]) : url.searchParams.delete(key);
          history.replaceState({}, '', url);
        }
        onFilterChange();
      }
      const query = new URLSearchParams(location.search);
      const requested = `${query.get('version')}/${query.get('platform')}`;
      picker.value = builds.some(build => `${build.version}/${build.platform}` === requested) ? requested : '';
      choose(false);
      if(query.has('version') && !selectedBuild) state.textContent = 'Requested exact build is unavailable. No substitute was selected.';
      picker.addEventListener('change', () => choose(true));
    } catch(error) { if(token === buildGeneration) state.textContent = `Builds unavailable: ${error.message}`; }
  }
  function renderDetails() {
    details.replaceChildren();
    const game = selected();
    if (!game) return;
    for (const link of document.querySelectorAll('[data-game-dev-launch]')) {
      const url = new URL('https://gamedev.ninjaprivacy.org/games/dev/');
      const query = new URLSearchParams(location.search);
      url.searchParams.set('game', game.id);
      if (selectionGeneration === 0 && query.get('game') === game.id) {
        for (const key of ['version', 'platform']) if (query.has(key)) url.searchParams.set(key, query.get(key));
      }
      link.href = url.href;
    }
    const heading = document.createElement('h2'); heading.textContent = game.title;
    const summary = document.createElement('p'); summary.textContent = game.summary || 'No summary supplied.';
    const native = game.projectType === 'native';
    const identity = document.createElement('p');
    identity.textContent = [native ? 'Native' : 'Browser', game.engine, game.target || (native ? 'Target unspecified' : 'Browser')].filter(Boolean).join(' · ');
    details.append(heading);
    if (native) details.append(identity);
    details.append(summary);
    const links = document.createElement('div'); links.className = 'game-links';
    const targetLink = native ? ['Download native build', game.downloadUrl] : ['Play build', game.previewUrl];
    for (const [label, value] of [targetLink, ['Screenshot', game.screenshotUrl], ['Video', game.videoUrl]]) {
      let url;
      try { url = value ? new URL(value, location.href) : null; } catch { url = null; }
      if (url && ['http:', 'https:'].includes(url.protocol)) {
        const link = document.createElement('a'); link.href = value; link.textContent = label; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link);
      } else {
        const note = document.createElement('span'); note.textContent = `${label} unavailable`; links.append(note);
      }
    }
    details.append(links);
    const reference = document.createElement('details'); reference.className = 'game-reference';
    const toggle = document.createElement('summary'); toggle.textContent = 'Test command & manual checklist';
    reference.append(toggle);
    const command = document.createElement('pre'); command.textContent = game.testCommand || 'Test command unavailable';
    reference.append(command);
    const list = document.createElement('ul');
    const checklist = Array.isArray(game.manualChecklist) ? game.manualChecklist : [];
    for (const item of checklist.length ? checklist : ['Manual checklist unavailable']) {
      const li = document.createElement('li'); li.textContent = item; list.append(li);
    }
    reference.append(list);
    details.append(reference);
    if (transport?.scoped) renderBuilds(game);
  }
  selector.addEventListener('change', () => { selectionGeneration++; selectedBuild = null;
    if (transport?.scoped) { const url=new URL(location.href); url.searchParams.set('game',selector.value); url.searchParams.delete('version'); url.searchParams.delete('platform'); history.replaceState({},'',url); }
    renderDetails(); onFilterChange(); if (transport?.scoped) onGameChange(); });
  for (const control of [milestone, discipline]) control.addEventListener('input', onFilterChange);
  sync();
  return {
    get active() { return active; },
    captureSelection() {
      const token = selectionGeneration;
      const id = selected()?.id;
      const wasActive = active;
      return () => active === wasActive && token === selectionGeneration && id === selected()?.id;
    },
    selected,
    sync,
    async load() {
      const token = ++generation;
      sync();
      if (!active || (transport?.scoped && games.length)) return;
      games = []; details.replaceChildren(); selector.disabled = true;
      status.textContent = 'Loading game catalog…';
      try {
        const data = await transport.request('/api/kanban/games');
        if (!Array.isArray(data.games) || data.games.some(game => !game || typeof game.id !== 'string' || typeof game.title !== 'string')) throw new Error('Invalid catalog response');
        if (token !== generation || !active) return;
        const previous = selector.value || new URLSearchParams(location.search).get('game');
        games = data.games;
        selector.replaceChildren(...games.map(game => new Option(game.title, game.id)));
        if (games.some(game => game.id === previous)) selector.value = previous;
        else if (transport?.scoped && previous) selector.selectedIndex = -1;
        selector.disabled = !games.length;
        status.textContent = games.length ? 'Build links and checklists are references, not test results.' : 'No games in the catalog.';
        renderDetails(); onFilterChange();
      } catch (error) {
        if (token !== generation || !active) return;
        selector.replaceChildren();
        status.textContent = `Game catalog unavailable: ${error.message}. Refresh board to retry. General tasks remain available.`;
        onFilterChange();
      }
    },
    matches(task) {
      if (!active) return true;
      const meta = task.game_dev;
      return Boolean(meta && (!selector.value || meta.game_id === selector.value)
        && (!milestone.value.trim() || meta.milestone === milestone.value.trim())
        && (!discipline.value || meta.discipline === discipline.value));
    },
    reset() { milestone.value = ''; discipline.value = ''; },
    label(meta) { return `${games.find(game => game.id === meta.game_id)?.title || meta.game_id} · ${meta.milestone || 'No milestone'} · ${meta.discipline}`; }
  };
}
