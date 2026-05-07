#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BOARD_COLUMNS = ['triage', 'todo', 'ready', 'running', 'blocked', 'done'];
const DEFAULT_FIXTURE_PATH = path.join('apps', 'kanban', 'fixtures', 'default-board.json');

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

function resolveMode() {
  const requested = (process.env.KANBAN_MODE || '').toLowerCase();
  if (['fixture', 'live'].includes(requested)) return requested;
  if (process.env.PREVIEW_PORT === '4174' || process.env.CI) return 'fixture';
  return 'live';
}

function readOnlyMode() {
  return parseBoolean(process.env.KANBAN_READONLY, true);
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

function emptyBoard(board, mode = 'live') {
  return {
    board,
    mode,
    readOnly: readOnlyMode(),
    columns: BOARD_COLUMNS.map((name) => ({ name, tasks: [] })),
    tenants: [],
    assignees: [],
    latest_event_id: 0,
    now: Math.floor(Date.now() / 1000)
  };
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
  return out;
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

async function liveBoard(board) {
  const { stdout } = await execFileAsync(hermesBin(), ['kanban', '--board', board, 'list', '--json'], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env }
  });
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
  return payload;
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

export async function handleKanbanRequest(req, res, { repoRoot }) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathName = url.pathname;
  const board = safeBoardName(url.searchParams.get('board'));
  const mode = resolveMode();

  if (pathName === '/api/kanban/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'agent-apps-kanban-bridge',
      mode,
      board,
      readOnly: readOnlyMode(),
      columns: BOARD_COLUMNS
    });
  }

  if (pathName === '/api/kanban/board' && req.method === 'GET') {
    const boardPayload = await loadBoard(repoRoot, board);
    return sendJson(res, 200, boardPayload);
  }

  const taskMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === 'GET') {
    const boardPayload = await loadBoard(repoRoot, board);
    const task = boardPayload.columns.flatMap((column) => column.tasks).find((item) => item.id === taskMatch[1]);
    if (!task) return sendJson(res, 404, { error: 'task not found' });
    return sendJson(res, 200, { board, readOnly: boardPayload.readOnly, task });
  }

  if (pathName === '/api/kanban/tasks' && req.method === 'POST') {
    await readRequestJson(req);
    return sendJson(res, readOnlyMode() ? 423 : 501, {
      error: readOnlyMode() ? 'kanban bridge is read-only' : 'triage writes are not implemented in M1',
      allowedM1Writes: []
    });
  }

  if (pathName.startsWith('/api/kanban/')) {
    return sendJson(res, 404, { error: 'kanban route not found' });
  }

  return false;
}
