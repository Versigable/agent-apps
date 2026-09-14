// Game Dev is a filtered lens on the same authoritative Hermes board.
export function createGameDev({ onViewChange, onFilterChange }) {
  const panel = document.querySelector('#game-dev-panel');
  const selector = document.querySelector('#game-selector');
  const milestone = document.querySelector('#game-milestone-filter');
  const discipline = document.querySelector('#game-discipline-filter');
  const details = document.querySelector('#game-details');
  const status = document.querySelector('#game-catalog-status');
  let active = new URLSearchParams(location.search).get('view') === 'game-dev';
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
  function selected() { return games.find(game => game.id === selector.value); }
  function renderDetails() {
    details.replaceChildren();
    const game = selected();
    if (!game) return;
    const heading = document.createElement('h2'); heading.textContent = game.title;
    const summary = document.createElement('p'); summary.textContent = game.summary || 'No summary supplied.';
    details.append(heading, summary);
    const links = document.createElement('div'); links.className = 'game-links';
    for (const [label, value] of [['Play build', game.previewUrl], ['Screenshot', game.screenshotUrl], ['Video', game.videoUrl]]) {
      let url;
      try { url = value ? new URL(value, location.href) : null; } catch { url = null; }
      if (url && ['http:', 'https:'].includes(url.protocol)) {
        const link = document.createElement('a'); link.href = value; link.textContent = label; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link);
      } else {
        const note = document.createElement('span'); note.textContent = `${label} unavailable`; links.append(note);
      }
    }
    details.append(links);
    const command = document.createElement('pre'); command.textContent = game.testCommand || 'Test command unavailable';
    details.append(command);
    const list = document.createElement('ul');
    const checklist = Array.isArray(game.manualChecklist) ? game.manualChecklist : [];
    for (const item of checklist.length ? checklist : ['Manual checklist unavailable']) {
      const li = document.createElement('li'); li.textContent = item; list.append(li);
    }
    details.append(list);
  }
  selector.addEventListener('change', () => { selectionGeneration++; renderDetails(); onFilterChange(); });
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
      if (!active) return;
      games = []; details.replaceChildren(); selector.disabled = true;
      status.textContent = 'Loading game catalog…';
      try {
        const response = await fetch('/api/kanban/games', { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.games) || data.games.some(game => !game || typeof game.id !== 'string' || typeof game.title !== 'string')) throw new Error('Invalid catalog response');
        if (token !== generation || !active) return;
        const previous = selector.value;
        games = data.games;
        selector.replaceChildren(...games.map(game => new Option(game.title, game.id)));
        if (games.some(game => game.id === previous)) selector.value = previous;
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
