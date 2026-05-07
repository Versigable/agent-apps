#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BOARD_COLUMNS = ['triage', 'todo', 'ready', 'running', 'blocked', 'done'];
const DEFAULT_FIXTURE_PATH = path.join('apps', 'kanban', 'fixtures', 'default-board.json');
const WRITE_AUTHOR = process.env.KANBAN_WRITE_AUTHOR || 'app-preview';

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function safeBoardName(value) {
  const board = value || process.env.KANBAN_BOARD || 'default';
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(board)) {
    const error = new Error('invalid board slug');
    error.statusCode = 400;
    throw error;
  }
  return board;
}

function safeTaskId(value) {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) {
    const error = new Error('invalid task id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function cleanText(value, maxLength, field) {
  const text = String(value || '').trim();
  if (!text) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  if (text.length > maxLength) {
    const error = new Error(`${field} is too long`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function optionalText(value, maxLength, field) {
  if (value === undefined || value === null || value === '') return null;
  return cleanText(value, maxLength, field);
}

function resolveMode() {
  const requested = (process.env.KANBAN_MODE || '').toLowerCase();
  if (['fixture', 'live'].includes(requested)) return requested;
  if (process.env.PREVIEW_PORT === '4174' || process.env.CI) return 'fixture';
  return 'live';
}

function readOnlyMode() {
  return parseBoolean(process.env.KANBAN_READONLY, true);
}

function writesEnabled() {
  return !readOnlyMode();
}

function publicTask(task) {
  return {
    id: task.id,
    title: task.title || '(untitled)',
    body: task.body || '',
    status: BOARD_COLUMNS.includes(task.status) ? task.status : 'todo',
    assignee: task.assignee || null,
    tenant: task.tenant || null,
    priority: Number(task.priority || 0),
    created_at: task.created_at || null,
    updated_at: task.updated_at || null,
    latest_summary: task.latest_summary || task.result || null,
    comment_count: Number(task.comment_count || 0),
    link_counts: task.link_counts || { parents: 0, children: 0 },
    progress: task.progress || null,
    warnings: task.warnings || null,
    diagnostics: task.diagnostics || []
  };
}

function emptyCounts() {
  return Object.fromEntries(BOARD_COLUMNS.map((name) => [name, 0]));
}

function incrementCount(target, key) {
  if (!key) return;
  target[key] = Number(target[key] || 0) + 1;
}

function buildSummary(columns) {
  const byStatus = emptyCounts();
  const byAssignee = {};
  const byTenant = {};
  let total = 0;
  let active = 0;
  let withWarnings = 0;
  let withDiagnostics = 0;
  let unassigned = 0;
  let maxPriority = null;
  let newestUpdatedAt = null;

  for (const column of columns) {
    const status = BOARD_COLUMNS.includes(column.name) ? column.name : 'todo';
    for (const task of Array.isArray(column.tasks) ? column.tasks : []) {
      total += 1;
      byStatus[status] += 1;
      if (!['done'].includes(status)) active += 1;
      if (task.assignee) incrementCount(byAssignee, task.assignee);
      else unassigned += 1;
      if (task.tenant) incrementCount(byTenant, task.tenant);
      if (task.warnings) withWarnings += 1;
      if (Array.isArray(task.diagnostics) && task.diagnostics.length) withDiagnostics += 1;
      const priority = Number(task.priority || 0);
      maxPriority = maxPriority === null ? priority : Math.max(maxPriority, priority);
      const updatedAt = Number(task.updated_at || task.created_at || 0);
      if (updatedAt) newestUpdatedAt = newestUpdatedAt === null ? updatedAt : Math.max(newestUpdatedAt, updatedAt);
    }
  }

  return {
    total,
    active,
    by_status: byStatus,
    by_assignee: byAssignee,
    by_tenant: byTenant,
    unassigned,
    with_warnings: withWarnings,
    with_diagnostics: withDiagnostics,
    max_priority: maxPriority,
    newest_updated_at: newestUpdatedAt
  };
}

function attachSummary(boardPayload) {
  boardPayload.summary = buildSummary(boardPayload.columns);
  return boardPayload;
}

function emptyBoard(board, mode = 'live') {
  return attachSummary({
    board,
    mode,
    readOnly: readOnlyMode(),
    writesEnabled: writesEnabled(),
    columns: BOARD_COLUMNS.map((name) => ({ name, tasks: [] })),
    tenants: [],
    assignees: [],
    latest_event_id: 0,
    now: Math.floor(Date.now() / 1000)
  });
}

function normalizeBoard(payload, board, mode) {
  const out = emptyBoard(board || payload.board || 'default', mode);
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  for (const column of columns) {
    if (!BOARD_COLUMNS.includes(column.name)) continue;
    const target = out.columns.find((item) => item.name === column.name);
    target.tasks = Array.isArray(column.tasks) ? column.tasks.map(publicTask) : [];
  }
  out.tenants = Array.isArray(payload.tenants) ? payload.tenants.filter(Boolean) : [];
  out.assignees = Array.isArray(payload.assignees) ? payload.assignees.filter(Boolean) : [];
  out.latest_event_id = Number(payload.latest_event_id || 0);
  out.now = Number(payload.now || Math.floor(Date.now() / 1000));
  return attachSummary(out);
}

async function fixtureBoard(repoRoot, board) {
  const fixturePath = process.env.KANBAN_FIXTURE_PATH || DEFAULT_FIXTURE_PATH;
  const fullPath = path.resolve(repoRoot, fixturePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) {
    const error = new Error('fixture path must stay inside repo');
    error.statusCode = 400;
    throw error;
  }
  const payload = JSON.parse(await fs.readFile(fullPath, 'utf8'));
  return normalizeBoard(payload, board, 'fixture');
}

function hermesBin() {
  return process.env.HERMES_BIN || path.join(process.env.HOME || '/home/merquery', '.local', 'bin', 'hermes');
}

async function runHermesKanban(board, args, options = {}) {
  const { stdout } = await execFileAsync(hermesBin(), ['kanban', '--board', board, ...args], {
    timeout: options.timeout || 10_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env }
  });
  return stdout;
}

async function liveBoard(board) {
  const stdout = await runHermesKanban(board, ['list', '--json']);
  const tasks = JSON.parse(stdout || '[]');
  const payload = emptyBoard(board, 'live');
  const tenants = new Set();
  const assignees = new Set();
  for (const rawTask of Array.isArray(tasks) ? tasks : []) {
    const task = publicTask(rawTask);
    const column = payload.columns.find((item) => item.name === task.status) || payload.columns.find((item) => item.name === 'todo');
    column.tasks.push(task);
    if (task.tenant) tenants.add(task.tenant);
    if (task.assignee) assignees.add(task.assignee);
  }
  payload.tenants = [...tenants].sort();
  payload.assignees = [...assignees].sort();
  return attachSummary(payload);
}

async function loadBoard(repoRoot, board) {
  const mode = resolveMode();
  if (mode === 'fixture') return fixtureBoard(repoRoot, board);
  try {
    return await liveBoard(board);
  } catch (error) {
    if ((process.env.KANBAN_LIVE_FALLBACK || 'fixture') === 'none') throw error;
    return fixtureBoard(repoRoot, board);
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function requireWritable(mode) {
  if (readOnlyMode()) {
    const error = new Error('kanban bridge is read-only');
    error.statusCode = 423;
    throw error;
  }
  if (mode !== 'live') {
    const error = new Error('kanban writes require live mode');
    error.statusCode = 409;
    throw error;
  }
}

function parseCreatedTask(stdout) {
  try {
    const parsed = JSON.parse(stdout || '{}');
    return parsed.task || parsed;
  } catch {
    return { raw: stdout.trim() };
  }
}

async function createTriageTask(board, payload) {
  const title = cleanText(payload.title, 180, 'title');
  const body = optionalText(payload.body, 8000, 'body') || '';
  const assignee = optionalText(payload.assignee, 80, 'assignee');
  const tenant = optionalText(payload.tenant, 80, 'tenant');
  const priority = Number(payload.priority || 0);
  if (!Number.isFinite(priority) || priority < -1000 || priority > 1000) {
    const error = new Error('priority must be between -1000 and 1000');
    error.statusCode = 400;
    throw error;
  }

  const args = [
    'create', title,
    '--body', body,
    '--priority', String(Math.trunc(priority)),
    '--triage',
    '--created-by', WRITE_AUTHOR,
    '--json'
  ];
  if (assignee) args.push('--assignee', assignee);
  if (tenant) args.push('--tenant', tenant);
  const stdout = await runHermesKanban(board, args);
  return parseCreatedTask(stdout);
}

async function commentTask(board, taskId, payload) {
  const text = cleanText(payload.text, 8000, 'comment');
  const author = optionalText(payload.author, 80, 'author') || WRITE_AUTHOR;
  await runHermesKanban(board, ['comment', taskId, text, '--author', author]);
  return { id: taskId, commented: true };
}

async function runTaskAction(board, taskId, payload) {
  const action = String(payload.action || '').toLowerCase();
  if (action === 'assign') {
    const assignee = optionalText(payload.assignee, 80, 'assignee') || 'none';
    await runHermesKanban(board, ['assign', taskId, assignee]);
    return { id: taskId, action, assignee };
  }
  if (action === 'block') {
    const reason = optionalText(payload.reason, 2000, 'reason') || 'Blocked from app-preview';
    await runHermesKanban(board, ['block', taskId, reason]);
    return { id: taskId, action, reason };
  }
  if (action === 'unblock') {
    await runHermesKanban(board, ['unblock', taskId]);
    return { id: taskId, action };
  }
  if (action === 'complete') {
    const result = optionalText(payload.result, 4000, 'result') || 'Completed from app-preview';
    await runHermesKanban(board, ['complete', taskId, '--result', result, '--summary', result]);
    return { id: taskId, action, result };
  }
  if (action === 'archive') {
    await runHermesKanban(board, ['archive', taskId]);
    return { id: taskId, action };
  }

  const error = new Error('unsupported task action');
  error.statusCode = 400;
  throw error;
}

export async function handleKanbanRequest(req, res, { repoRoot }) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathName = url.pathname;
  const board = safeBoardName(url.searchParams.get('board'));
  const mode = resolveMode();

  try {
    if (pathName === '/api/kanban/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'agent-apps-kanban-bridge',
        mode,
        board,
        readOnly: readOnlyMode(),
        writesEnabled: writesEnabled(),
        writeMode: writesEnabled() ? 'operator' : 'disabled',
        allowedWrites: writesEnabled() ? ['create-triage', 'comment', 'assign', 'block', 'unblock', 'complete', 'archive'] : [],
        columns: BOARD_COLUMNS
      });
    }

    if (pathName === '/api/kanban/board' && req.method === 'GET') {
      const boardPayload = await loadBoard(repoRoot, board);
      return sendJson(res, 200, boardPayload);
    }

    if (pathName === '/api/kanban/tasks' && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const task = await createTriageTask(board, payload);
      return sendJson(res, 201, { ok: true, board, readOnly: false, task });
    }

    const commentMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/comments$/);
    if (commentMatch && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await commentTask(board, safeTaskId(commentMatch[1]), payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    const actionMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/actions$/);
    if (actionMatch && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await runTaskAction(board, safeTaskId(actionMatch[1]), payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    const taskMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      const boardPayload = await loadBoard(repoRoot, board);
      const task = boardPayload.columns.flatMap((column) => column.tasks).find((item) => item.id === taskMatch[1]);
      if (!task) return sendJson(res, 404, { error: 'task not found' });
      return sendJson(res, 200, { board, readOnly: boardPayload.readOnly, writesEnabled: boardPayload.writesEnabled, task });
    }

    if (pathName.startsWith('/api/kanban/')) {
      return sendJson(res, 404, { error: 'kanban route not found' });
    }
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message || 'kanban bridge error' });
  }

  return false;
}
