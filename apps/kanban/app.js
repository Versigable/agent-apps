import { createGameDev } from './game-dev.js';
import { createPlaytestCapture } from './playtest-capture.js';
import { renderEvidence } from './build-evidence.js';
const boardEl = document.querySelector('#board');
const statusEl = document.querySelector('[data-testid="bridge-status"]');
const safetyEl = document.querySelector('[data-testid="safety-banner"]');
const createForm = document.querySelector('#create-task-form');
const createBoardForm = document.querySelector('#create-board-form');
const boardSelector = document.querySelector('#board-selector');
const boardStatus = document.querySelector('[data-testid="board-status"]');
const assigneeRosterEl = document.querySelector('[data-testid="assignee-roster"]');
const assigneeOptions = document.querySelector('#assignee-options');
const tenantOptions = document.querySelector('#tenant-options');
const createStatus = document.querySelector('[data-testid="create-status"]');
const drawer = document.querySelector('#drawer');
const drawerBody = document.querySelector('#drawer-body');
const drawerClose = document.querySelector('#drawer-close');
const refreshButton = document.querySelector('#refresh-board');
const lastRefreshEl = document.querySelector('[data-testid="last-refresh"]');
const filterCountEl = document.querySelector('[data-testid="filter-count"]');
const filterSearch = document.querySelector('#filter-search');
const filterAssignee = document.querySelector('#filter-assignee');
const filterTenant = document.querySelector('#filter-tenant');
const filterStatus = document.querySelector('#filter-status');
const dispatchForm = document.querySelector('#dispatch-form');
const claimForm = document.querySelector('#claim-form');
const executionStatusEl = document.querySelector('[data-testid="execution-status"]');
const executionOutputEl = document.querySelector('[data-testid="execution-output"]');
const summaryEls = {
  total: document.querySelector('[data-testid="summary-total"]'),
  active: document.querySelector('[data-testid="summary-active"]'),
  triage: document.querySelector('[data-testid="summary-triage"]'),
  blocked: document.querySelector('[data-testid="summary-blocked"]')
};


let currentBoard = null;
let activeBoard = new URLSearchParams(window.location.search).get('board') || 'default';
let currentBoards = [];
let currentAssignees = [];
let currentExecution = null;
let lastRefreshDate = null;
let activeDrawerTaskId = null;
let refreshGeneration = 0;
let drawerGeneration = 0;
const gameDev = createGameDev({ onViewChange: () => refreshBoard(), onFilterChange: () => { if (currentBoard) renderFilteredBoard(); updateCreateFormState(); } });
const playtestCapture = createPlaytestCapture({ gameDev, captureView, writesEnabled, postJson, refreshBoard });

function text(value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function formatDate(epochSeconds) {
  if (!epochSeconds) return 'unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epochSeconds * 1000));
}

function formatClock(date) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(date);
}

function taskMeta(task) {
  return [text(task.tenant, 'no tenant'), text(task.assignee, 'unassigned'), `priority ${Number(task.priority || 0)}`];
}

function allTasks(board = currentBoard) {
  return board?.columns?.flatMap((column) => column.tasks || []) || [];
}

function writesEnabled() {
  return Boolean(currentBoard && !currentBoard.readOnly && currentBoard.writesEnabled);
}

function executionEnabled() {
  return Boolean(currentExecution && currentExecution.executionEnabled && writesEnabled());
}

// A response may update UI only while its initiating view is current.
function captureView(includeDrawer = false) {
  const board = activeBoard;
  const generation = refreshGeneration;
  const detailGeneration = drawerGeneration;
  return { board, isCurrent: () => board === activeBoard && generation === refreshGeneration
    && (!includeDrawer || detailGeneration === drawerGeneration) };
}

function boardParam(board = activeBoard) {
  return `board=${encodeURIComponent(board)}`;
}

function setActiveBoard(board) {
  activeBoard = board || 'default';
  const url = new URL(window.location.href);
  url.searchParams.set('board', activeBoard);
  window.history.replaceState({}, '', url);
}

function setMessage(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('is-error', isError);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { headers: { accept: 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

async function postJson(url, payload) {
  return requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function taskMatchesFilters(task) {
  if (!gameDev.matches(task)) return false;
  const query = filterSearch.value.trim().toLowerCase();
  const assignee = filterAssignee.value;
  const tenant = filterTenant.value;
  const status = filterStatus.value;
  if (assignee && task.assignee !== assignee) return false;
  if (tenant && task.tenant !== tenant) return false;
  if (status && task.status !== status) return false;
  if (!query) return true;
  const haystack = [task.title, task.body, task.latest_summary, task.assignee, task.tenant, task.status]
    .map((value) => String(value || '').toLowerCase())
    .join('\n');
  return haystack.includes(query);
}

function filteredColumns() {
  return (currentBoard?.columns || []).map((column) => ({ ...column, tasks: (column.tasks || []).filter(taskMatchesFilters) }));
}

function updateFilterOptions() {
  const columnNames = (currentBoard?.columns || []).map((column) => column.name);
  const preserve = { assignee: filterAssignee.value, tenant: filterTenant.value, status: filterStatus.value };
  const tasks = allTasks();
  const assigneeNames = [...new Set([...currentAssignees.map((item) => item.name), ...(currentBoard?.assignees || []), ...tasks.map((task) => task.assignee)].filter(Boolean))].sort();
  const tenants = [...new Set([...(currentBoard?.tenants || []), ...tasks.map((task) => task.tenant)].filter(Boolean))].sort();

  filterAssignee.replaceChildren(new Option('All assignees', ''), ...assigneeNames.map((item) => new Option(item, item)));
  filterTenant.replaceChildren(new Option('All tenants', ''), ...tenants.map((item) => new Option(item, item)));
  filterStatus.replaceChildren(new Option('All statuses', ''), ...columnNames.map((item) => new Option(item, item)));

  filterAssignee.value = assigneeNames.includes(preserve.assignee) ? preserve.assignee : '';
  filterTenant.value = tenants.includes(preserve.tenant) ? preserve.tenant : '';
  filterStatus.value = columnNames.includes(preserve.status) ? preserve.status : '';
}

function updateAssigneeRoster() {
  const names = [...new Set([...currentAssignees.map((item) => item.name), ...(currentBoard?.assignees || [])].filter(Boolean))].sort();
  const tenants = [...new Set([...(currentBoard?.tenants || []), ...allTasks().map((task) => task.tenant)].filter(Boolean))].sort();
  assigneeOptions.replaceChildren(...names.map((name) => new Option(name, name)));
  tenantOptions?.replaceChildren(...tenants.map((name) => new Option(name, name)));
  assigneeRosterEl.textContent = names.length ? `Assignees: ${names.join(', ')}` : 'Assignees: none discovered';
}

function updateBoards(payload) {
  currentBoards = payload.boards || [];
  boardSelector.replaceChildren(...currentBoards.map((board) => new Option(`${board.icon ? `${board.icon} ` : ''}${board.name || board.slug} (${board.slug})`, board.slug)));
  if (!currentBoards.some((board) => board.slug === activeBoard)) {
    boardSelector.append(new Option(activeBoard, activeBoard));
  }
  boardSelector.value = activeBoard;
  setMessage(boardStatus, currentBoards.length ? `${currentBoards.length} boards available` : 'No boards discovered');
}

function renderTaskButton(task, taskBoard) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'task-card';
  button.setAttribute('aria-label', `Open ${task.title}`);

  const title = document.createElement('strong');
  title.textContent = task.title;
  button.append(title);

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  meta.textContent = taskMeta(task).join(' · ');
  button.append(meta);
  if (task.game_dev) {
    const gameMeta = document.createElement('div');
    gameMeta.className = 'task-meta game-meta';
    gameMeta.textContent = gameDev.label(task.game_dev);
    button.append(gameMeta);
  }

  if (task.latest_summary) {
    const summary = document.createElement('p');
    summary.className = 'summary';
    summary.textContent = task.latest_summary;
    button.append(summary);
  }

  const counts = document.createElement('div');
  counts.className = 'task-counts';
  counts.textContent = `comments: ${Number(task.comment_count || 0)} · parents: ${Number(task.link_counts?.parents || 0)} · children: ${Number(task.link_counts?.children || 0)}`;
  button.append(counts);

  button.addEventListener('click', () => openDrawer(task, taskBoard));
  return button;
}

function renderColumn(column) {
  const section = document.createElement('section');
  section.className = 'column';
  section.dataset.testid = `kanban-column-${column.name}`;

  const heading = document.createElement('h2');
  heading.textContent = column.name;
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = String(column.tasks.length);
  heading.append(count);
  section.append(heading);

  if (!column.tasks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No cards';
    section.append(empty);
    return section;
  }

  for (const task of column.tasks) section.append(renderTaskButton(task, currentBoard.board));
  return section;
}

function renderFilteredBoard() {
  const columns = filteredColumns();
  const visible = columns.reduce((total, column) => total + column.tasks.length, 0);
  const total = currentBoard?.summary?.total ?? allTasks().length;
  filterCountEl.textContent = `${visible} of ${total} cards`;
  if (!visible && (total > 0 || gameDev.active)) {
    const empty = document.createElement('p');
    empty.className = 'empty no-match';
    empty.textContent = gameDev.active ? 'No game tasks match this selection. Create a game task below, or adjust filters. Existing General cards are unchanged.' : 'No cards match current filters.';
    boardEl.replaceChildren(empty);
    return;
  }
  boardEl.replaceChildren(...columns.map(renderColumn));
}

function renderSummary(board) {
  const summary = board.summary || {};
  summaryEls.total.textContent = String(summary.total ?? allTasks(board).length);
  summaryEls.active.textContent = String(summary.active ?? allTasks(board).filter((task) => task.status !== 'done').length);
  summaryEls.triage.textContent = String(summary.by_status?.triage ?? 0);
  summaryEls.blocked.textContent = String(summary.by_status?.blocked ?? 0);
}

function formField(label, name, options = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = options.multiline ? document.createElement('textarea') : document.createElement('input');
  input.name = name;
  input.placeholder = options.placeholder || '';
  if (options.type) input.type = options.type;
  if (options.required) input.required = true;
  if (options.value !== undefined) input.value = options.value;
  if (options.rows) input.rows = options.rows;
  wrap.append(span, input);
  return wrap;
}

function updateCreateFormState() {
  playtestCapture.sync();
  const enabled = writesEnabled();
  for (const field of createForm.elements) field.disabled = !enabled;
  const gameFields = document.querySelector('#game-task-fields');
  gameFields.hidden = !gameDev.active;
  gameFields.disabled = !enabled || !gameDev.active || !gameDev.selected();
  const submit = createForm.querySelector('button[type=submit]');
  submit.textContent = gameDev.active ? 'Create game task' : 'Create triage card';
  submit.disabled = !enabled || (gameDev.active && !gameDev.selected());
  for (const field of createBoardForm.elements) field.disabled = !enabled;
  setMessage(createStatus, enabled ? 'Writes enabled: create triage or direct todo cards with workspace, parents, runtime, skills, and idempotency metadata.' : 'Read-only mode: creation is disabled.');
  updateExecutionFormState();
}

function updateExecutionFormState() {
  const enabled = executionEnabled();
  for (const field of dispatchForm.elements) field.disabled = !enabled;
  for (const field of claimForm.elements) field.disabled = !enabled;
  const stats = currentExecution?.stats || {};
  const counts = stats.by_status || {};
  const mode = currentExecution?.mode || 'unknown';
  const state = enabled ? 'execution enabled' : 'execution disabled';
  executionStatusEl.textContent = `${state} · ${mode} · total ${stats.total ?? 0} · ready ${counts.ready ?? 0} · running ${counts.running ?? 0} · blocked ${counts.blocked ?? stats.blocked ?? 0}`;
}

function setExecutionOutput(payload) {
  executionOutputEl.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
}

async function handleDispatch(event) {
  event.preventDefault();
  const view = captureView();
  const submitter = event.submitter;
  const form = new FormData(dispatchForm);
  const dryRun = submitter?.value === 'dry-run' ? true : form.get('dry_run') === 'on';
  try {
    setExecutionOutput('Dispatch request running…');
    const response = await postJson(`/api/kanban/execution/dispatch?${boardParam(view.board)}`, {
      confirm: form.get('confirm'),
      dry_run: dryRun,
      max: Number(form.get('max') || 1),
      failure_limit: Number(form.get('failure_limit') || 5)
    });
    if (!view.isCurrent()) return;
    setExecutionOutput(response);
    await refreshBoard();
  } catch (error) {
    if (!view.isCurrent()) return;
    setExecutionOutput(`Dispatch failed: ${error.message}`);
  }
}

async function handleClaim(event) {
  event.preventDefault();
  const view = captureView();
  const form = new FormData(claimForm);
  const taskId = String(form.get('task_id') || '').trim();
  try {
    setExecutionOutput(`Claiming ${taskId}…`);
    const response = await postJson(`/api/kanban/tasks/${encodeURIComponent(taskId)}/claim?${boardParam(view.board)}`, {
      confirm: form.get('confirm'),
      ttl: Number(form.get('ttl') || 900)
    });
    if (!view.isCurrent()) return;
    setExecutionOutput(response);
    await refreshBoard();
  } catch (error) {
    if (!view.isCurrent()) return;
    setExecutionOutput(`Claim failed: ${error.message}`);
  }
}

function splitList(value) {
  return String(value || '').split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

async function handleCreate(event) {
  event.preventDefault();
  const view = captureView();
  const selectionIsCurrent = gameDev.captureSelection();
  const form = new FormData(createForm);
  const payload = {
    title: form.get('title'),
    body: form.get('body'),
    assignee: form.get('assignee'),
    tenant: form.get('tenant'),
    priority: Number(form.get('priority') || 0),
    workspace: form.get('workspace') || 'scratch',
    parents: splitList(form.get('parents')),
    skills: splitList(form.get('skills')),
    max_runtime: form.get('max_runtime'),
    idempotency_key: form.get('idempotency_key'),
    triage: form.get('triage') === 'on'
  };
  if (!writesEnabled()) return;
  if (gameDev.active) {
    const game = gameDev.selected();
    if (!game) { setMessage(createStatus, 'Select an available game before creating a game task.', true); return; }
    const milestone = String(form.get('game_milestone') || '');
    if (!milestone.trim() || milestone.length > 120 || /[\x00-\x1f`]/.test(milestone)) {
      setMessage(createStatus, 'Game task milestone must be 1-120 characters without controls or backticks.', true);
      return;
    }
    payload.game_dev = { game_id: game.id, milestone: milestone.trim(), discipline: form.get('game_discipline') };
  }
  try {
    setMessage(createStatus, `Creating card on ${activeBoard}…`);
    await postJson(`/api/kanban/tasks?${boardParam(view.board)}`, payload);
    if (!view.isCurrent() || !selectionIsCurrent()) return;
    createForm.reset();
    createForm.elements.priority.value = '0';
    createForm.elements.workspace.value = 'scratch';
    createForm.elements.triage.checked = true;
    setMessage(createStatus, 'Card created. Refreshing board…');
    await refreshBoard();
  } catch (error) {
    if (!view.isCurrent() || !selectionIsCurrent()) return;
    setMessage(createStatus, error.message, true);
  }
}

async function handleCreateBoard(event) {
  event.preventDefault();
  const view = captureView();
  const form = new FormData(createBoardForm);
  try {
    setMessage(boardStatus, 'Creating board…');
    const response = await postJson('/api/kanban/boards', {
      slug: form.get('slug'),
      name: form.get('name')
    });
    if (!view.isCurrent()) return;
    createBoardForm.reset();
    setActiveBoard(response.board?.slug || form.get('slug'));
    const pending = refreshBoard();
    const selectedView = captureView();
    await pending;
    if (selectedView.isCurrent() && currentBoard) setMessage(boardStatus, `Board ${activeBoard} created and selected.`);
  } catch (error) {
    if (!view.isCurrent()) return;
    setMessage(boardStatus, error.message, true);
  }
}

function line(label, value) {
  const item = document.createElement('div');
  item.className = 'detail-line';
  const key = document.createElement('strong');
  key.textContent = label;
  const val = document.createElement('span');
  val.textContent = text(value);
  item.append(key, val);
  return item;
}

function preBlock(content) {
  const pre = document.createElement('pre');
  pre.className = 'drawer-pre';
  pre.textContent = text(content, '—').replace(/```(?:game-dev|build-evidence)\s*\n[\s\S]*?```/g, '[Structured metadata is displayed in Evidence.]');
  return pre;
}

function renderList(items, emptyText, renderItem) {
  if (!items?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty compact-empty';
    empty.textContent = emptyText;
    return empty;
  }
  const list = document.createElement('div');
  list.className = 'timeline-list';
  items.forEach((item) => list.append(renderItem(item)));
  return list;
}

function renderDetailPanel(detail) {
  const task = detail.task;
  const panel = document.createElement('div');
  panel.append(
    line('Task id', task.id),
    line('Status', task.status),
    line('Assignee', task.assignee || 'unassigned'),
    line('Tenant', task.tenant || 'none'),
    line('Priority', Number(task.priority || 0)),
    line('Created', formatDate(task.created_at)),
    line('Updated', formatDate(task.updated_at)),
    line('Parents', (detail.dependencies?.parents || []).join(', ') || 'none'),
    line('Children', (detail.dependencies?.children || []).join(', ') || 'none')
  );
  const body = document.createElement('section');
  body.className = 'drawer-section';
  body.append(Object.assign(document.createElement('h3'), { textContent: 'Body' }), preBlock(String(task.body || '').replace(/```game-dev\s*\n[\s\S]*?```/g, '').trim() || 'No task body supplied.'));
  panel.append(body);
  if (task.latest_summary) panel.append(line('Latest summary', task.latest_summary));
  return panel;
}

function renderCommentsEventsPanel(detail) {
  const panel = document.createElement('div');
  const commentsHeading = document.createElement('h3');
  commentsHeading.textContent = 'Comments';
  panel.append(commentsHeading);
  panel.append(renderList((detail.comments || []).filter(comment => !/^```build-evidence\s/.test(comment.text || comment.body || '')), 'No comments yet.', (comment) => {
    const item = document.createElement('article');
    item.className = 'timeline-item';
    item.append(line(text(comment.author, 'unknown'), formatDate(comment.created_at)), preBlock(comment.text));
    return item;
  }));
  const eventsHeading = document.createElement('h3');
  eventsHeading.textContent = 'Events';
  panel.append(eventsHeading);
  panel.append(renderList(detail.events, 'No events returned.', (event) => {
    const item = document.createElement('article');
    item.className = 'timeline-item';
    item.append(line(text(event.event || event.type, 'event'), `${text(event.actor, 'system')} · ${formatDate(event.created_at || event.ts)}`));
    if (event.summary || event.message) item.append(preBlock(event.summary || event.message));
    return item;
  }));
  return panel;
}

function renderRunsPanel(detail) {
  return renderList(detail.runs, 'No worker runs yet.', (run) => {
    const item = document.createElement('article');
    item.className = 'timeline-item';
    item.append(line(text(run.profile, 'run'), `${text(run.outcome || run.status)} · ${text(run.elapsed || run.elapsed_seconds)}`));
    if (run.summary || run.result) item.append(preBlock(run.summary || run.result));
    return item;
  });
}

function renderDiagnosticsPanel(detail) {
  return renderList(detail.diagnostics, 'No diagnostics for this task.', (diag) => {
    const item = document.createElement('article');
    item.className = 'timeline-item';
    item.append(line(text(diag.severity, 'diagnostic'), text(diag.kind || diag.code)));
    item.append(preBlock(diag.message || JSON.stringify(diag, null, 2)));
    return item;
  });
}

function renderTabPanel(detail, tab) {
  if (tab === 'evidence') return renderEvidence(detail, { writesEnabled, captureView, postJson, loadTaskDetail });
  if (tab === 'details') return renderDetailPanel(detail);
  if (tab === 'comments') return renderCommentsEventsPanel(detail);
  if (tab === 'runs') return renderRunsPanel(detail);
  if (tab === 'log') return preBlock(detail.log || 'No worker log yet.');
  if (tab === 'context') return preBlock(detail.context || 'No worker context returned.');
  if (tab === 'diagnostics') return renderDiagnosticsPanel(detail);
  return document.createTextNode('Unknown tab');
}

function appendTabs(container, detail) {
  const tabs = [
    ['details', 'Details'],
    ['evidence', 'Evidence'],
    ['comments', 'Comments & Events'],
    ['runs', 'Runs'],
    ['log', 'Log'],
    ['context', 'Context'],
    ['diagnostics', 'Diagnostics']
  ];
  const tabList = document.createElement('div');
  tabList.className = 'drawer-tabs';
  tabList.setAttribute('role', 'tablist');
  const panel = document.createElement('section');
  panel.className = 'drawer-tab-panel';
  panel.dataset.testid = 'drawer-tab-panel';

  let tabGeneration = 0;
  let evidencePanel;
  const loaded = new Set();
  async function activate(tabName) {
    const generation = ++tabGeneration;
    for (const button of tabList.querySelectorAll('button')) button.setAttribute('aria-selected', String(button.dataset.tab === tabName));
    if (['runs', 'log', 'context', 'diagnostics'].includes(tabName) && !loaded.has(tabName)) {
      panel.replaceChildren(preBlock('Loading…'));
      try {
        const data = await requestJson(`/api/kanban/tasks/${encodeURIComponent(detail.task.id)}/${tabName}?${boardParam(detail.board)}`);
        detail[tabName] = data[tabName];
        loaded.add(tabName);
      } catch (error) {
        if (generation === tabGeneration) panel.replaceChildren(preBlock(`Unable to load ${tabName}: ${error.message}. Select tab to retry.`));
        return;
      }
    }
    if (generation === tabGeneration) {
      if (tabName === 'evidence') evidencePanel ||= renderTabPanel(detail, tabName);
      panel.replaceChildren(tabName === 'evidence' ? evidencePanel : renderTabPanel(detail, tabName));
    }
  }

  for (const [tabName, label] of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.dataset.tab = tabName;
    button.textContent = label;
    button.addEventListener('click', () => activate(tabName));
    tabList.append(button);
  }
  container.append(tabList, panel);
  activate('details');
}

function appendDrawerWriteControls(task, taskBoard) {
  const boardParam = () => `board=${encodeURIComponent(taskBoard)}`;
  const view = captureView(true);
  async function refreshAfterWrite(reopen = true) {
    if (!view.isCurrent()) return;
    const pending = refreshBoard();
    const refreshedView = captureView(true);
    await pending;
    if (!refreshedView.isCurrent() || !currentBoard || !reopen) return;
    await openDrawer(allTasks().find(item => item.id === task.id) || task, taskBoard);
  }
  if (!writesEnabled()) return;

  const panel = document.createElement('section');
  panel.className = 'drawer-actions';

  const heading = document.createElement('h3');
  heading.textContent = 'Operator writes';
  panel.append(heading);

  const status = document.createElement('p');
  status.className = 'action-status';
  status.dataset.testid = 'drawer-action-status';
  status.textContent = 'Comments, metadata updates, dependency links, recovery actions, and terminal state changes are enabled. Dispatch and claim require separate execution authorization.';
  panel.append(status);

  function actionEndpoint(payload) {
    return postJson(`/api/kanban/tasks/${encodeURIComponent(task.id)}/actions?${boardParam()}`, payload);
  }

  const commentForm = document.createElement('form');
  commentForm.className = 'drawer-form';
  commentForm.append(formField('Comment', 'text', { multiline: true, required: true, rows: 3, placeholder: 'Add operator context…' }));
  commentForm.append(Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Add comment' }));
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setMessage(status, 'Adding comment…');
      await postJson(`/api/kanban/tasks/${encodeURIComponent(task.id)}/comments?${boardParam()}`, { text: new FormData(commentForm).get('text') });
      if (!view.isCurrent()) return;
      setMessage(status, 'Comment added. Refreshing board…');
      await refreshAfterWrite();
    } catch (error) {
      if (!view.isCurrent()) return;
      setMessage(status, error.message, true);
    }
  });
  panel.append(commentForm);

  const assignForm = document.createElement('form');
  assignForm.className = 'drawer-form compact';
  assignForm.append(formField('Assignee', 'assignee', { placeholder: 'profile or none', value: task.assignee || '' }));
  assignForm.append(Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Assign' }));
  assignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const assignee = new FormData(assignForm).get('assignee') || 'none';
      setMessage(status, 'Assigning…');
      await actionEndpoint({ action: 'assign', assignee });
      if (!view.isCurrent()) return;
      setMessage(status, 'Assignment updated. Refreshing board…');
      await refreshAfterWrite();
    } catch (error) {
      if (!view.isCurrent()) return;
      setMessage(status, error.message, true);
    }
  });
  panel.append(assignForm);

  const completeForm = document.createElement('form');
  completeForm.className = 'drawer-form';
  completeForm.append(
    formField('Completion result', 'result', { multiline: true, required: true, rows: 2, placeholder: 'What changed?' }),
    formField('Handoff summary', 'summary', { multiline: true, rows: 2, placeholder: 'Structured downstream handoff…' }),
    formField('Metadata JSON', 'metadata', { multiline: true, rows: 2, placeholder: '{"tests_run": ["npm test"]}' })
  );
  completeForm.append(Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Complete with result' }));
  completeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(completeForm);
    try {
      setMessage(status, 'Completing…');
      await actionEndpoint({ action: 'complete', result: form.get('result'), summary: form.get('summary'), metadata: form.get('metadata') });
      if (!view.isCurrent()) return;
      setMessage(status, 'Completed. Refreshing board…');
      await refreshAfterWrite(false);
    } catch (error) {
      if (!view.isCurrent()) return;
      setMessage(status, error.message, true);
    }
  });
  panel.append(completeForm);

  const blockForm = document.createElement('form');
  blockForm.className = 'drawer-form compact';
  blockForm.append(formField('Block reason', 'reason', { placeholder: 'Why blocked?' }));
  blockForm.append(Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Block' }));
  blockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setMessage(status, 'Blocking…');
      await actionEndpoint({ action: 'block', reason: new FormData(blockForm).get('reason') });
      if (!view.isCurrent()) return;
      setMessage(status, 'Blocked. Refreshing board…');
      await refreshAfterWrite();
    } catch (error) {
      if (!view.isCurrent()) return;
      setMessage(status, error.message, true);
    }
  });
  panel.append(blockForm);

  const recoveryForm = document.createElement('form');
  recoveryForm.className = 'drawer-form';
  recoveryForm.append(
    formField('Reassign profile', 'assignee', { placeholder: 'new profile or none', value: task.assignee || '' }),
    formField('Recovery reason', 'reason', { placeholder: 'Why reclaim/reassign?' })
  );
  const recoverRow = document.createElement('div');
  recoverRow.className = 'action-row';
  for (const [action, label] of [['reassign', 'Reassign'], ['reassign-reclaim', 'Reassign + reclaim'], ['reclaim', 'Reclaim']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      const form = new FormData(recoveryForm);
      try {
        setMessage(status, `${label}…`);
        if (action === 'reclaim') await actionEndpoint({ action: 'reclaim', reason: form.get('reason') });
        else await actionEndpoint({ action: 'reassign', assignee: form.get('assignee'), reason: form.get('reason'), reclaim: action === 'reassign-reclaim' });
        if (!view.isCurrent()) return;
        setMessage(status, `${label} done. Refreshing board…`);
        await refreshAfterWrite();
      } catch (error) {
      if (!view.isCurrent()) return;
        setMessage(status, error.message, true);
      }
    });
    recoverRow.append(button);
  }
  recoveryForm.append(recoverRow);
  panel.append(recoveryForm);

  const linkForm = document.createElement('form');
  linkForm.className = 'drawer-form';
  linkForm.append(
    formField('Parent task id', 'parent_id', { placeholder: 'parent id', value: task.id }),
    formField('Child task id', 'child_id', { placeholder: 'child id' })
  );
  const linkRow = document.createElement('div');
  linkRow.className = 'action-row';
  for (const [action, label] of [['link', 'Link dependency'], ['unlink', 'Unlink dependency']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      const form = new FormData(linkForm);
      try {
        setMessage(status, `${label}…`);
        await postJson(`/api/kanban/links?${boardParam()}`, { action, parent_id: form.get('parent_id'), child_id: form.get('child_id') });
        if (!view.isCurrent()) return;
        setMessage(status, `${label} done. Refreshing board…`);
        await refreshAfterWrite();
      } catch (error) {
      if (!view.isCurrent()) return;
        setMessage(status, error.message, true);
      }
    });
    linkRow.append(button);
  }
  linkForm.append(linkRow);
  panel.append(linkForm);

  const editForm = document.createElement('form');
  editForm.className = 'drawer-form';
  editForm.append(
    formField('Backfill result', 'result', { multiline: true, rows: 2, placeholder: 'Correct completed task result…' }),
    formField('Backfill summary', 'summary', { multiline: true, rows: 2, placeholder: 'Correct handoff summary…' }),
    formField('Backfill metadata JSON', 'metadata', { multiline: true, rows: 2, placeholder: '{"reviewed_by":"operator"}' })
  );
  editForm.append(Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Edit completed result' }));
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(editForm);
    try {
      setMessage(status, 'Editing completed result…');
      await actionEndpoint({ action: 'edit', result: form.get('result'), summary: form.get('summary'), metadata: form.get('metadata') });
      if (!view.isCurrent()) return;
      setMessage(status, 'Completed result edited. Refreshing board…');
      await refreshAfterWrite();
    } catch (error) {
      if (!view.isCurrent()) return;
      setMessage(status, error.message, true);
    }
  });
  panel.append(editForm);

  const quickRow = document.createElement('div');
  quickRow.className = 'action-row';
  for (const [action, label] of [['unblock', 'Unblock'], ['archive', 'Archive']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      try {
        setMessage(status, `${label}…`);
        await actionEndpoint({ action });
        if (!view.isCurrent()) return;
        setMessage(status, `${label} done. Refreshing board…`);
        await refreshAfterWrite(action !== 'archive');
      } catch (error) {
      if (!view.isCurrent()) return;
        setMessage(status, error.message, true);
      }
    });
    quickRow.append(button);
  }
  panel.append(quickRow);
  drawerBody.append(panel);
}

async function loadTaskDetail(taskId, taskBoard) {
  return requestJson(`/api/kanban/tasks/${encodeURIComponent(taskId)}/show?${boardParam(taskBoard)}`);
}

async function openDrawerById(taskId) {
  const task = allTasks().find((item) => item.id === taskId) || { id: taskId, title: taskId };
  return openDrawer(task);
}

async function openDrawer(task, taskBoard = activeBoard) {
  if (taskBoard !== activeBoard) return;
  const generation = ++drawerGeneration;
  drawer.hidden = false;
  activeDrawerTaskId = task.id;
  drawerBody.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = task.title;
  drawerBody.append(heading);

  const status = document.createElement('p');
  status.className = 'drawer-meta';
  status.textContent = `${task.status || 'unknown'} · ${taskMeta(task).join(' · ')} · updated ${formatDate(task.updated_at)}`;
  drawerBody.append(status);

  const counts = document.createElement('p');
  counts.className = 'drawer-counts';
  counts.textContent = `comments: ${Number(task.comment_count || 0)} · parents: ${Number(task.link_counts?.parents || 0)} · children: ${Number(task.link_counts?.children || 0)}`;
  drawerBody.append(counts);

  const loading = document.createElement('p');
  loading.className = 'drawer-summary';
  loading.textContent = 'Loading task details…';
  drawerBody.append(loading);

  try {
    const detail = await loadTaskDetail(task.id, taskBoard);
    if (generation !== drawerGeneration || taskBoard !== activeBoard || activeDrawerTaskId !== task.id) return;
    loading.remove();
    appendTabs(drawerBody, { ...detail, board: taskBoard });
    const safety = document.createElement('div');
    safety.className = 'drawer-safety';
    safety.textContent = writesEnabled()
      ? 'Operator writes are enabled. Dispatch and claim use the high-friction panel. Assignment and recovery can affect worker eligibility.'
      : 'Execution and write controls are intentionally absent in read-only mode.';
    drawerBody.append(safety);
    appendDrawerWriteControls(detail.task || task, taskBoard);
  } catch (error) {
    loading.textContent = `Task detail failed: ${error.message}`;
    loading.classList.add('is-error');
  }
}

function renderBoard(board) {
  currentBoard = board;
  statusEl.textContent = `${board.mode} mode · ${board.readOnly ? 'read-only' : 'writes enabled'} · board ${board.board}`;
  safetyEl.innerHTML = board.readOnly
    ? '<strong>Read-only safety mode.</strong> Triage review is visible, but writes are disabled.'
    : '<strong>Writes enabled.</strong> You can create triage cards and update card metadata. Assignment and recovery can affect worker eligibility; dispatch and claim require separate authorization.';
  renderSummary(board);
  updateAssigneeRoster();
  updateFilterOptions();
  renderFilteredBoard();
  updateCreateFormState();
}

async function refreshBoard() {
  const generation = ++refreshGeneration;
  gameDev.load();
  const selectedBoard = activeBoard;
  const query = boardParam(selectedBoard);
  boardEl.replaceChildren(preBlock('Loading board…'));
  currentBoard = null;
  currentExecution = null;
  drawer.hidden = true;
  activeDrawerTaskId = null;
  drawerGeneration++;
  updateCreateFormState();
  refreshButton.disabled = true;
  lastRefreshEl.textContent = 'Refreshing…';
  try {
    const [board, boards, assignees, execution] = await Promise.all([
      requestJson(`/api/kanban/board?${query}`),
      requestJson(`/api/kanban/boards?${query}`),
      requestJson(`/api/kanban/assignees?${query}`),
      requestJson(`/api/kanban/execution/status?${query}`)
    ]);
    if (generation !== refreshGeneration || selectedBoard !== activeBoard) return;
    if (board.board !== selectedBoard) throw new Error('Board response scope mismatch');
    currentAssignees = assignees.assignees || [];
    currentExecution = execution;
    updateBoards(boards);
    renderBoard(board);
    lastRefreshDate = new Date();
    lastRefreshEl.textContent = `Last refresh: ${formatClock(lastRefreshDate)}`;
  } catch (error) {
    if (generation !== refreshGeneration) return;
    currentBoard = null;
    currentExecution = null;
    updateCreateFormState();
    statusEl.textContent = `Bridge error · board ${selectedBoard}`;
    safetyEl.textContent = 'Board unavailable. Writes disabled until a successful refresh.';
    boardEl.replaceChildren(Object.assign(document.createElement('p'), { className: 'error', textContent: error.message }));
    for (const el of Object.values(summaryEls)) el.textContent = '—';
    filterCountEl.textContent = 'Board unavailable';
    lastRefreshEl.textContent = 'Refresh failed — retry';
  } finally {
    if (generation === refreshGeneration) refreshButton.disabled = false;
  }
}

async function main() {
  try {
    await refreshBoard();
  } catch (error) {
    statusEl.textContent = 'Bridge error';
    boardEl.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

drawerClose.addEventListener('click', () => {
  drawer.hidden = true;
  activeDrawerTaskId = null;
  drawerGeneration++;
});

createForm.addEventListener('submit', handleCreate);
createBoardForm.addEventListener('submit', handleCreateBoard);
dispatchForm.addEventListener('submit', handleDispatch);
claimForm.addEventListener('submit', handleClaim);
boardSelector.addEventListener('change', async () => {
  setActiveBoard(boardSelector.value);
  drawer.hidden = true;
  await refreshBoard();
});
refreshButton.addEventListener('click', refreshBoard);
const resetFilters = document.createElement('button');
resetFilters.type = 'button';
resetFilters.textContent = 'Reset filters';
resetFilters.addEventListener('click', () => {
  gameDev.reset();
  for (const control of [filterSearch, filterAssignee, filterTenant, filterStatus]) control.value = '';
  renderFilteredBoard();
});
filterCountEl.before(resetFilters);
for (const control of [filterSearch, filterAssignee, filterTenant, filterStatus]) {
  control.addEventListener('input', renderFilteredBoard);
  control.addEventListener('change', renderFilteredBoard);
}
document.querySelector('#apply-game-template').addEventListener('click', () => {
  const templates = {
    feature: 'Define the player action and expected outcome.\n- [ ] Implement the action and visible feedback.\n- [ ] Cover success, failure, and restart paths with a regression test.\n- [ ] Record the build tested and manual play observations.',
    bug: 'Reproduction: [steps, build, device]. Expected: [behavior]. Actual: [behavior].\n- [ ] Add a failing regression test for the reproduction.\n- [ ] Fix the root cause and run the regression test.\n- [ ] Replay the steps and record actual results.',
    polish: 'Target interaction: [screen/action and desired feedback].\n- [ ] Capture before/after evidence at desktop and mobile sizes.\n- [ ] Verify feedback remains readable without blocking controls.\n- [ ] Confirm keyboard/touch and restart still work.',
    performance: 'Scenario and budget: [device, workload, target frame time].\n- [ ] Measure and record a baseline using a repeatable scenario.\n- [ ] Optimize the measured bottleneck.\n- [ ] Repeat measurements and report before/after values and visual regressions.',
    playtest: 'Build and session: [URL, device, controls, duration].\n- [ ] Play the core loop, failure, and restart paths.\n- [ ] Record observations and reproducible bugs, with evidence links.\n- [ ] Record explicit human feedback; review status alone is not approval.'
  };
  const body = createForm.elements.body;
  const addition = `Acceptance criteria\n${templates[document.querySelector('#game-template').value]}`;
  const next = `${body.value}${body.value ? '\n\n' : ''}${addition}`;
  if (next.length > body.maxLength) { setMessage(createStatus, 'Template would exceed body limit; shorten the draft first.', true); return; }
  body.value = next;
});
main();
