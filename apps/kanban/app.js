const boardEl = document.querySelector('#board');
const statusEl = document.querySelector('[data-testid="bridge-status"]');
const drawer = document.querySelector('#drawer');
const drawerBody = document.querySelector('#drawer-body');
const drawerClose = document.querySelector('#drawer-close');

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
  safety.textContent = 'Execution controls are intentionally absent in this milestone.';
  drawerBody.append(safety);
}

async function loadBoard() {
  const response = await fetch('/api/kanban/board?board=default', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Kanban bridge failed: ${response.status}`);
  return response.json();
}

async function main() {
  try {
    const board = await loadBoard();
    statusEl.textContent = `${board.mode} mode · ${board.readOnly ? 'read-only' : 'writes enabled'} · board ${board.board}`;
    boardEl.replaceChildren(...board.columns.map(renderColumn));
  } catch (error) {
    statusEl.textContent = 'Bridge error';
    boardEl.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

drawerClose.addEventListener('click', () => {
  drawer.hidden = true;
});

main();
