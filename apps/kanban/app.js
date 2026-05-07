const boardEl = document.querySelector('#board');
const statusEl = document.querySelector('[data-testid="bridge-status"]');
const safetyEl = document.querySelector('[data-testid="safety-banner"]');
const createForm = document.querySelector('#create-task-form');
const createStatus = document.querySelector('[data-testid="create-status"]');
const drawer = document.querySelector('#drawer');
const drawerBody = document.querySelector('#drawer-body');
const drawerClose = document.querySelector('#drawer-close');

let currentBoard = null;

function text(value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function formatDate(epochSeconds) {
  if (!epochSeconds) return 'unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epochSeconds * 1000));
}

function taskMeta(task) {
  return [
    text(task.tenant, 'no tenant'),
    text(task.assignee, 'unassigned'),
    `priority ${Number(task.priority || 0)}`
  ];
}

function writesEnabled() {
  return Boolean(currentBoard && !currentBoard.readOnly && currentBoard.writesEnabled);
}

function setMessage(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('is-error', isError);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function renderTaskButton(task) {
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

  button.addEventListener('click', () => openDrawer(task));
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

  for (const task of column.tasks) section.append(renderTaskButton(task));
  return section;
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
  wrap.append(span, input);
  return wrap;
}

function updateCreateFormState() {
  const enabled = writesEnabled();
  for (const field of createForm.elements) field.disabled = !enabled;
  setMessage(createStatus, enabled ? 'Writes enabled: new cards are created in triage for operator routing.' : 'Read-only mode: creation is disabled.');
}

async function handleCreate(event) {
  event.preventDefault();
  const form = new FormData(createForm);
  const payload = {
    title: form.get('title'),
    body: form.get('body'),
    assignee: form.get('assignee'),
    tenant: form.get('tenant'),
    priority: Number(form.get('priority') || 0)
  };
  try {
    setMessage(createStatus, 'Creating triage card…');
    await postJson('/api/kanban/tasks?board=default', payload);
    createForm.reset();
    createForm.elements.priority.value = '0';
    setMessage(createStatus, 'Triage card created. Refreshing board…');
    await refreshBoard();
  } catch (error) {
    setMessage(createStatus, error.message, true);
  }
}

function appendDrawerWriteControls(task) {
  if (!writesEnabled()) return;

  const panel = document.createElement('section');
  panel.className = 'drawer-actions';

  const heading = document.createElement('h3');
  heading.textContent = 'Operator writes';
  panel.append(heading);

  const status = document.createElement('p');
  status.className = 'action-status';
  status.dataset.testid = 'drawer-action-status';
  status.textContent = 'Comment, assign, block, unblock, complete, or archive this card. No dispatcher controls are exposed.';
  panel.append(status);

  const commentForm = document.createElement('form');
  commentForm.className = 'drawer-form';
  commentForm.append(formField('Comment', 'text', { multiline: true, required: true, placeholder: 'Add operator context…' }));
  const commentButton = document.createElement('button');
  commentButton.type = 'submit';
  commentButton.textContent = 'Add comment';
  commentForm.append(commentButton);
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setMessage(status, 'Adding comment…');
      await postJson(`/api/kanban/tasks/${encodeURIComponent(task.id)}/comments?board=default`, { text: new FormData(commentForm).get('text') });
      setMessage(status, 'Comment added. Refreshing board…');
      await refreshBoard();
    } catch (error) {
      setMessage(status, error.message, true);
    }
  });
  panel.append(commentForm);

  const assignForm = document.createElement('form');
  assignForm.className = 'drawer-form compact';
  assignForm.append(formField('Assignee', 'assignee', { placeholder: 'profile or none', value: task.assignee || '' }));
  const assignButton = document.createElement('button');
  assignButton.type = 'submit';
  assignButton.textContent = 'Assign';
  assignForm.append(assignButton);
  assignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const assignee = new FormData(assignForm).get('assignee') || 'none';
      setMessage(status, 'Assigning…');
      await postJson(`/api/kanban/tasks/${encodeURIComponent(task.id)}/actions?board=default`, { action: 'assign', assignee });
      setMessage(status, 'Assignment updated. Refreshing board…');
      await refreshBoard();
    } catch (error) {
      setMessage(status, error.message, true);
    }
  });
  panel.append(assignForm);

  const actionRow = document.createElement('div');
  actionRow.className = 'action-row';
  const actions = [
    ['block', 'Block'],
    ['unblock', 'Unblock'],
    ['complete', 'Complete'],
    ['archive', 'Archive']
  ];
  for (const [action, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      const reason = action === 'block' ? window.prompt('Block reason?', 'Blocked from app-preview') : undefined;
      const result = action === 'complete' ? window.prompt('Completion summary?', 'Completed from app-preview') : undefined;
      try {
        setMessage(status, `${label}…`);
        await postJson(`/api/kanban/tasks/${encodeURIComponent(task.id)}/actions?board=default`, { action, reason, result });
        setMessage(status, `${label} done. Refreshing board…`);
        await refreshBoard();
        if (action === 'archive') drawer.hidden = true;
      } catch (error) {
        setMessage(status, error.message, true);
      }
    });
    actionRow.append(button);
  }
  panel.append(actionRow);
  drawerBody.append(panel);
}

function openDrawer(task) {
  drawer.hidden = false;
  drawerBody.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = task.title;
  drawerBody.append(heading);

  const status = document.createElement('p');
  status.className = 'drawer-meta';
  status.textContent = `${task.status} · ${taskMeta(task).join(' · ')} · updated ${formatDate(task.updated_at)}`;
  drawerBody.append(status);

  const body = document.createElement('p');
  body.textContent = text(task.body, 'No task body supplied.');
  drawerBody.append(body);

  const summary = document.createElement('p');
  summary.className = 'drawer-summary';
  summary.textContent = task.latest_summary ? `Latest summary: ${task.latest_summary}` : 'No worker summary yet.';
  drawerBody.append(summary);

  const counts = document.createElement('p');
  counts.className = 'drawer-counts';
  counts.textContent = `comments: ${Number(task.comment_count || 0)} · parents: ${Number(task.link_counts?.parents || 0)} · children: ${Number(task.link_counts?.children || 0)}`;
  drawerBody.append(counts);

  const safety = document.createElement('div');
  safety.className = 'drawer-safety';
  safety.textContent = writesEnabled()
    ? 'Operator writes are enabled. Dispatcher execution controls are still intentionally absent.'
    : 'Execution and write controls are intentionally absent in read-only mode.';
  drawerBody.append(safety);
  appendDrawerWriteControls(task);
}

async function loadBoard() {
  const response = await fetch('/api/kanban/board?board=default', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Kanban bridge failed: ${response.status}`);
  return response.json();
}

function renderBoard(board) {
  currentBoard = board;
  statusEl.textContent = `${board.mode} mode · ${board.readOnly ? 'read-only' : 'writes enabled'} · board ${board.board}`;
  safetyEl.innerHTML = board.readOnly
    ? '<strong>Read-only safety mode.</strong> Triage review is visible, but writes are disabled.'
    : '<strong>Writes enabled.</strong> You can create triage cards and update card metadata. Dispatcher controls and automatic ready promotion remain absent.';
  boardEl.replaceChildren(...board.columns.map(renderColumn));
  updateCreateFormState();
}

async function refreshBoard() {
  const board = await loadBoard();
  renderBoard(board);
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
});

createForm.addEventListener('submit', handleCreate);
main();
