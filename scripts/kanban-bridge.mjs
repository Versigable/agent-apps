import { parseBoolean, safeSlug, safeTaskId, optionalText, runHermesRaw, runHermesKanban } from './kanban-commands.mjs';
import { writeTask, createTask, writeLink } from './kanban-writes.mjs';
import { readTaskSnapshot, readTaskHistory } from './kanban-operations.mjs';
import fs from 'node:fs/promises';
import { loadGames, parseGameDev } from './kanban-games.mjs';
import { parseEvidence } from './kanban-evidence.mjs';
import path from 'node:path';


const BOARD_COLUMNS = ['triage', 'todo', 'scheduled', 'ready', 'running', 'review', 'blocked', 'done'];
const DEFAULT_FIXTURE_PATH = path.join('apps', 'kanban', 'fixtures', 'default-board.json');
const DEFAULT_ROSTER_PATH = path.join('apps', 'kanban', 'operator-roster.json');

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
  return resolveMode() !== 'live' || parseBoolean(process.env.KANBAN_READONLY, true);
}

function writesEnabled() {
  return !readOnlyMode();
}

function executionEnabled() {
  return writesEnabled() && parseBoolean(process.env.KANBAN_EXECUTION_ENABLED, false);
}

function requireExecution() {
  if (!executionEnabled()) {
    const error = new Error('execution disabled');
    error.statusCode = 423;
    throw error;
  }
}

function publicTask(task) {
  return {
    id: task.id,
    title: task.title || '(untitled)',
    body: task.body || '',
    game_dev: parseGameDev(task.body),
    status: task.status || 'unknown',
    assignee: task.assignee || null,
    tenant: task.tenant || null,
    priority: Number(task.priority || 0),
    created_at: task.created_at || null,
    updated_at: task.updated_at || null,
    latest_summary: task.latest_summary || task.summary || task.result || null,
    comment_count: Number(task.comment_count || task.comments_count || 0),
    link_counts: task.link_counts || { parents: Number(task.parent_count || 0), children: Number(task.child_count || 0) },
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
    const status = column.name;
    for (const task of Array.isArray(column.tasks) ? column.tasks : []) {
      total += 1;
      incrementCount(byStatus, status);
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
    const name = column.name || 'unknown';
    let target = out.columns.find((item) => item.name === name);
    if (!target) out.columns.push(target = { name, tasks: [] });
    target.tasks.push(...(Array.isArray(column.tasks) ? column.tasks.map((task) => publicTask({ ...task, status: name })) : []));
  }
  out.tenants = Array.isArray(payload.tenants) ? payload.tenants.filter(Boolean) : [];
  out.assignees = Array.isArray(payload.assignees) ? payload.assignees.filter(Boolean) : [];
  out.latest_event_id = Number(payload.latest_event_id || 0);
  out.now = Number(payload.now || Math.floor(Date.now() / 1000));
  return attachSummary(out);
}

function findTask(boardPayload, taskId) {
  return boardPayload.columns.flatMap((column) => column.tasks).find((item) => item.id === taskId);
}

function resolveRepoFile(repoRoot, relativePath, label) {
  const fullPath = path.resolve(repoRoot, relativePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) {
    const error = new Error(`${label} path must stay inside repo`);
    error.statusCode = 400;
    throw error;
  }
  return fullPath;
}

async function readFixturePayload(repoRoot) {
  const fixturePath = process.env.KANBAN_FIXTURE_PATH || DEFAULT_FIXTURE_PATH;
  const fullPath = resolveRepoFile(repoRoot, fixturePath, 'fixture');
  return JSON.parse(await fs.readFile(fullPath, 'utf8'));
}

async function readOperatorRoster(repoRoot) {
  const rosterPath = process.env.KANBAN_ROSTER_PATH || DEFAULT_ROSTER_PATH;
  try {
    const fullPath = resolveRepoFile(repoRoot, rosterPath, 'roster');
    const parsed = JSON.parse(await fs.readFile(fullPath, 'utf8'));
    return {
      assignees: Array.isArray(parsed.assignees) ? parsed.assignees : [],
      tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { assignees: [], tenants: [], workspaces: [] };
    throw error;
  }
}

function rosterAssigneeItems(roster) {
  return (roster.assignees || [])
    .map((item) => (typeof item === 'string' ? { name: item } : item))
    .filter((item) => item && item.name)
    .map((item) => ({
      name: String(item.name),
      on_disk: false,
      source: item.source || 'operator-roster',
      role: item.role || '',
      counts: {}
    }));
}

function mergeAssigneeItems(...groups) {
  const byName = new Map();
  for (const item of groups.flat()) {
    if (!item?.name) continue;
    const existing = byName.get(item.name) || {};
    byName.set(item.name, {
      ...item,
      ...existing,
      name: item.name,
      on_disk: Boolean(existing.on_disk || item.on_disk),
      counts: { ...(item.counts || {}), ...(existing.counts || {}) },
      source: existing.source || item.source
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function mergeNames(...groups) {
  return [...new Set(groups.flat().filter(Boolean).map((item) => String(item)))].sort();
}

async function fixtureBoard(repoRoot, board) {
  const [payload, roster] = await Promise.all([readFixturePayload(repoRoot), readOperatorRoster(repoRoot)]);
  const source = board === (payload.board || 'default') ? payload : (payload.board_data?.[board] || { columns: [] });
  const normalized = normalizeBoard(source, board, 'fixture');
  normalized.tenants = mergeNames(normalized.tenants, roster.tenants);
  normalized.assignees = mergeNames(normalized.assignees, rosterAssigneeItems(roster).map((item) => item.name));
  normalized.workspaces = mergeNames(roster.workspaces);
  return attachSummary(normalized);
}

async function fixtureBoards(repoRoot, currentBoard = 'default') {
  const payload = await readFixturePayload(repoRoot);
  const boards = Array.isArray(payload.boards) ? payload.boards : [
    { slug: 'default', name: 'Default', is_current: currentBoard === 'default', total: normalizeBoard(payload, 'default', 'fixture').summary.total },
    { slug: 'agent-apps', name: 'Agent Apps', description: 'Fixture secondary board', is_current: currentBoard === 'agent-apps', total: 0 }
  ];
  return {
    currentBoard,
    mode: 'fixture',
    readOnly: readOnlyMode(),
    writesEnabled: writesEnabled(),
    boards: boards.map((item) => sanitizeBoard(item, currentBoard))
  };
}

async function fixtureAssignees(repoRoot) {
  const [payload, roster] = await Promise.all([readFixturePayload(repoRoot), readOperatorRoster(repoRoot)]);
  const names = new Set(Array.isArray(payload.assignees) ? payload.assignees : []);
  const fixtureItems = ['default', ...[...names].sort()].map((name) => ({
    name,
    on_disk: name === 'default',
    source: name === 'default' ? 'profile' : 'fixture-board',
    counts: {}
  }));
  return {
    mode: 'fixture',
    assignees: mergeAssigneeItems(fixtureItems, rosterAssigneeItems(roster))
  };
}

function sanitizeBoard(item, currentBoard = 'default') {
  const slug = item.slug || item.board || 'default';
  const counts = item.counts && typeof item.counts === 'object' ? { ...item.counts } : {};
  return {
    slug,
    name: item.name || slug,
    description: item.description || '',
    icon: item.icon || '',
    color: item.color || '',
    archived: Boolean(item.archived),
    is_current: Boolean(item.is_current || slug === currentBoard),
    counts,
    total: Number(item.total || Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0))
  };
}

async function liveBoards(currentBoard) {
  const stdout = await runHermesRaw(['kanban', 'boards', 'list', '--json']);
  const boards = JSON.parse(stdout || '[]');
  return {
    currentBoard,
    mode: 'live',
    readOnly: readOnlyMode(),
    writesEnabled: writesEnabled(),
    boards: (Array.isArray(boards) ? boards : []).map((item) => sanitizeBoard(item, currentBoard))
  };
}

async function liveAssignees(repoRoot, board) {
  const [stdout, roster] = await Promise.all([runHermesKanban(board, ['assignees', '--json']), readOperatorRoster(repoRoot)]);
  const assignees = JSON.parse(stdout || '[]');
  const liveItems = (Array.isArray(assignees) ? assignees : []).map((item) => ({
    name: item.name,
    on_disk: Boolean(item.on_disk),
    source: item.on_disk ? 'profile' : 'kanban-board',
    counts: item.counts && typeof item.counts === 'object' ? item.counts : {}
  })).filter((item) => item.name);
  return {
    mode: 'live',
    assignees: mergeAssigneeItems(liveItems, rosterAssigneeItems(roster))
  };
}

async function loadBoards(repoRoot, currentBoard) {
  if (resolveMode() === 'fixture') return fixtureBoards(repoRoot, currentBoard);
  return liveBoards(currentBoard);
}

async function loadAssignees(repoRoot, board) {
  if (resolveMode() === 'fixture') return fixtureAssignees(repoRoot);
  return liveAssignees(repoRoot, board);
}

async function fixtureExecutionStatus(repoRoot, board) {
  const boardPayload = await fixtureBoard(repoRoot, board);
  return {
    board,
    mode: 'fixture',
    readOnly: readOnlyMode(),
    writesEnabled: writesEnabled(),
    executionEnabled: executionEnabled(),
    dryRunAvailable: true,
    stats: {
      total: boardPayload.summary.total,
      active: boardPayload.summary.active,
      by_status: boardPayload.summary.by_status,
      blocked: boardPayload.summary.by_status.blocked || 0
    }
  };
}

async function liveExecutionStatus(repoRoot, board) {
  let stats = null;
  try {
    const stdout = await runHermesKanban(board, ['stats', '--json']);
    stats = JSON.parse(stdout || '{}');
  } catch {
    const boardPayload = await loadBoard(repoRoot, board);
    stats = {
      total: boardPayload.summary.total,
      active: boardPayload.summary.active,
      by_status: boardPayload.summary.by_status,
      blocked: boardPayload.summary.by_status.blocked || 0
    };
  }
  return {
    board,
    mode: 'live',
    readOnly: readOnlyMode(),
    writesEnabled: writesEnabled(),
    executionEnabled: executionEnabled(),
    dryRunAvailable: true,
    stats
  };
}

async function loadExecutionStatus(repoRoot, board) {
  if (resolveMode() === 'fixture') return fixtureExecutionStatus(repoRoot, board);
  return liveExecutionStatus(repoRoot, board);
}

function boundedInteger(value, min, max, field, defaultValue) {
  const number = Number(value === undefined || value === null || value === '' ? defaultValue : value);
  if (!Number.isInteger(number) || number < min || number > max) {
    const error = new Error(`${field} must be an integer between ${min} and ${max}`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

async function dispatchExecution(board, payload) {
  requireExecution();
  if (payload.confirm !== 'DISPATCH') {
    const error = new Error('dispatch requires confirm=DISPATCH');
    error.statusCode = 400;
    throw error;
  }
  const args = ['dispatch', '--json'];
  if (parseBoolean(payload.dry_run, true)) args.push('--dry-run');
  args.push('--max', String(boundedInteger(payload.max, 1, 20, 'max', 1)));
  args.push('--failure-limit', String(boundedInteger(payload.failure_limit ?? payload.failureLimit, 1, 20, 'failure_limit', 5)));
  const stdout = await runHermesKanban(board, args, { timeout: 60_000, maxBuffer: 1024 * 1024 * 4 });
  return { action: 'dispatch', result: JSON.parse(stdout || '{}') };
}

async function claimExecutionTask(board, taskId, payload) {
  requireExecution();
  if (payload.confirm !== 'CLAIM') {
    const error = new Error('claim requires confirm=CLAIM');
    error.statusCode = 400;
    throw error;
  }
  const ttl = boundedInteger(payload.ttl, 30, 86_400, 'ttl', 900);
  const stdout = await runHermesKanban(board, ['claim', taskId, '--ttl', String(ttl)], { timeout: 30_000 });
  return { action: 'claim', task_id: taskId, ttl, output: stdout.trim() };
}

async function fixtureDetail(repoRoot, board, taskId) {
  const raw = await readFixturePayload(repoRoot);
  const boardPayload = await fixtureBoard(repoRoot, board);
  const task = findTask(boardPayload, taskId);
  if (!task) return null;
  const details = raw.task_details?.[taskId] || {};
  return {
    board,
    mode: 'fixture',
    readOnly: boardPayload.readOnly,
    writesEnabled: boardPayload.writesEnabled,
    task,
    comments: Array.isArray(details.comments) ? details.comments : [],
    build_evidence: parseEvidence(details.comments, task.game_dev?.game_id),
    events: Array.isArray(details.events) ? details.events : [],
    dependencies: details.dependencies || { parents: [], children: [] },
    runs: Array.isArray(details.runs) ? details.runs : [],
    log: details.log || 'No worker log yet.',
    context: details.context || 'Full worker context would appear here.',
    diagnostics: Array.isArray(details.diagnostics) ? details.diagnostics : []
  };
}

async function liveBoard(repoRoot, board) {
  const [tasks, roster] = await Promise.all([readTaskSnapshot(repoRoot, board), readOperatorRoster(repoRoot)]);
  const payload = emptyBoard(board, 'live');
  const tenants = new Set(roster.tenants || []);
  const assignees = new Set(rosterAssigneeItems(roster).map((item) => item.name));
  for (const rawTask of Array.isArray(tasks) ? tasks : []) {
    const task = publicTask(rawTask);
    let column = payload.columns.find((item) => item.name === task.status);
    if (!column) payload.columns.push(column = { name: task.status, tasks: [] });
    column.tasks.push(task);
    if (task.tenant) tenants.add(task.tenant);
    if (task.assignee) assignees.add(task.assignee);
  }
  payload.tenants = [...tenants].sort();
  payload.assignees = [...assignees].sort();
  payload.workspaces = mergeNames(roster.workspaces);
  return attachSummary(payload);
}

async function loadBoard(repoRoot, board) {
  const mode = resolveMode();
  if (mode === 'fixture') return fixtureBoard(repoRoot, board);
  return liveBoard(repoRoot, board);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function readRequestJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128000) { const error = new Error('request body is too large'); error.statusCode = 413; throw error; }
    chunks.push(chunk);
  }
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

async function createBoard(payload) {
  const slug = safeSlug(payload.slug);
  const args = ['kanban', 'boards', 'create', slug];
  const name = optionalText(payload.name, 120, 'name');
  const description = optionalText(payload.description, 1000, 'description');
  const icon = optionalText(payload.icon, 16, 'icon');
  const color = optionalText(payload.color, 32, 'color');
  if (name) args.push('--name', name);
  if (description) args.push('--description', description);
  if (icon) args.push('--icon', icon);
  if (color) args.push('--color', color);
  await runHermesRaw(args);
  return { slug, name: name || slug, description: description || '', icon: icon || '', color: color || '' };
}


async function loadTaskDetail(repoRoot, board, taskId) {
  const mode = resolveMode();
  if (mode === 'fixture') return fixtureDetail(repoRoot, board, taskId);
  try {
    const stdout = await runHermesKanban(board, ['show', taskId, '--json']);
    const parsed = JSON.parse(stdout || '{}');
    // Installed show omits history IDs. Only original persisted rows can prove
    // a new mutation; never synthesize IDs from timestamps or array positions.
    const persisted = await readTaskHistory(repoRoot, board, taskId);
    if (!persisted) return null;
    parsed.comments = persisted.comments;
    parsed.events = persisted.events;
    parsed.dependencies = persisted.dependencies;
    const task = publicTask({ ...(parsed.task || parsed), latest_summary: parsed.latest_summary || parsed.task?.latest_summary });
    return {
      board,
      mode: 'live',
      readOnly: readOnlyMode(),
      writesEnabled: writesEnabled(),
      task,
      comments: (parsed.comments || parsed.task?.comments || []).map((item) => ({ ...item, text: item.body ?? item.text })),
      build_evidence: parseEvidence(parsed.comments || parsed.task?.comments || [], task.game_dev?.game_id),
      events: (parsed.events || parsed.task?.events || []).map((item) => ({ ...item, event: item.kind || item.event || item.type, summary: item.summary || item.message || (item.payload ? JSON.stringify(item.payload) : '') })),
      dependencies: parsed.dependencies || parsed.links || { parents: parsed.parents || [], children: parsed.children || [] },
      runs: parsed.runs || [],
      log: parsed.log || null,
      context: parsed.context || null,
      diagnostics: parsed.diagnostics || task.diagnostics || []
    };
  } catch (error) {
    throw error;
  }
}

async function taskRuns(repoRoot, board, taskId) {
  if (resolveMode() === 'fixture') {
    const detail = await fixtureDetail(repoRoot, board, taskId);
    return detail ? detail.runs : null;
  }
  const stdout = await runHermesKanban(board, ['runs', taskId, '--json']);
  const parsed = JSON.parse(stdout || '[]');
  return Array.isArray(parsed) ? parsed : parsed.runs || [];
}

async function taskLog(repoRoot, board, taskId, tail = '20000') {
  if (resolveMode() === 'fixture') {
    const detail = await fixtureDetail(repoRoot, board, taskId);
    return detail ? detail.log : null;
  }
  return (await runHermesKanban(board, ['log', taskId, '--tail', String(tail)], { maxBuffer: 1024 * 1024 })).trim() || 'No worker log yet.';
}

async function taskContext(repoRoot, board, taskId) {
  if (resolveMode() === 'fixture') {
    const detail = await fixtureDetail(repoRoot, board, taskId);
    return detail ? detail.context : null;
  }
  return (await runHermesKanban(board, ['context', taskId], { maxBuffer: 1024 * 1024 })).trim();
}

async function taskDiagnostics(repoRoot, board, taskId) {
  if (resolveMode() === 'fixture') {
    const detail = await fixtureDetail(repoRoot, board, taskId);
    return detail ? detail.diagnostics : null;
  }
  const stdout = await runHermesKanban(board, ['diagnostics', '--task', taskId, '--json']);
  const parsed = JSON.parse(stdout || '[]');
  return Array.isArray(parsed) ? parsed : parsed.diagnostics || [];
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
        executionEnabled: executionEnabled(),
        writeMode: writesEnabled() ? 'operator' : 'disabled',
        allowedWrites: writesEnabled() ? ['create-triage', 'create-task', 'create-board', 'comment', 'assign', 'block', 'unblock', 'complete', 'archive', 'reclaim', 'reassign', 'edit', 'link', 'unlink', ...(executionEnabled() ? ['dispatch', 'claim'] : [])] : [],
        columns: BOARD_COLUMNS
      });
    }

    if (pathName === '/api/kanban/games' && req.method === 'GET') {
      return sendJson(res, 200, { games: await loadGames(repoRoot) });
    }

    if (pathName === '/api/kanban/board' && req.method === 'GET') {
      const boardPayload = await loadBoard(repoRoot, board);
      return sendJson(res, 200, boardPayload);
    }

    if (pathName === '/api/kanban/boards' && req.method === 'GET') {
      return sendJson(res, 200, await loadBoards(repoRoot, board));
    }

    if (pathName === '/api/kanban/boards' && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const created = await createBoard(payload);
      return sendJson(res, 201, { ok: true, board: created });
    }

    if (pathName === '/api/kanban/assignees' && req.method === 'GET') {
      return sendJson(res, 200, await loadAssignees(repoRoot, board));
    }

    if (pathName === '/api/kanban/execution/status' && req.method === 'GET') {
      return sendJson(res, 200, await loadExecutionStatus(repoRoot, board));
    }

    if (pathName === '/api/kanban/execution/dispatch' && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await dispatchExecution(board, payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    if (pathName === '/api/kanban/tasks' && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const task = await createTask({repoRoot,board,readDetail:id=>loadTaskDetail(repoRoot,board,id)},payload);
      return sendJson(res, 201, { ok: true, board, readOnly: false, task });
    }

    if (pathName === '/api/kanban/links' && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await writeLink({repoRoot,board,readDetail:id=>loadTaskDetail(repoRoot,board,id)},payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    const detailMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/(show|runs|log|context|diagnostics)$/);
    if (detailMatch && req.method === 'GET') {
      const taskId = safeTaskId(detailMatch[1]);
      const type = detailMatch[2];
      if (type === 'show') {
        const detail = await loadTaskDetail(repoRoot, board, taskId);
        if (!detail) return sendJson(res, 404, { error: 'task not found' });
        return sendJson(res, 200, detail);
      }
      if (type === 'runs') {
        const runs = await taskRuns(repoRoot, board, taskId);
        if (runs === null) return sendJson(res, 404, { error: 'task not found' });
        return sendJson(res, 200, { board, task_id: taskId, runs });
      }
      if (type === 'log') {
        const log = await taskLog(repoRoot, board, taskId, url.searchParams.get('tail') || '20000');
        if (log === null) return sendJson(res, 404, { error: 'task not found' });
        return sendJson(res, 200, { board, task_id: taskId, log });
      }
      if (type === 'context') {
        const context = await taskContext(repoRoot, board, taskId);
        if (context === null) return sendJson(res, 404, { error: 'task not found' });
        return sendJson(res, 200, { board, task_id: taskId, context });
      }
      if (type === 'diagnostics') {
        const diagnostics = await taskDiagnostics(repoRoot, board, taskId);
        if (diagnostics === null) return sendJson(res, 404, { error: 'task not found' });
        return sendJson(res, 200, { board, task_id: taskId, diagnostics });
      }
    }

    const evidenceMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/evidence$/);
    if (evidenceMatch && req.method === 'POST') {
      requireWritable(mode);
      const payload = await readRequestJson(req);
      const evidence = await writeTask({repoRoot,board,readDetail:id=>loadTaskDetail(repoRoot,board,id)},'evidence',safeTaskId(evidenceMatch[1]),payload);
      return sendJson(res, 200, { evidence });
    }

    const commentMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/comments$/);
    if (commentMatch && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await writeTask({repoRoot,board,readDetail: id=>loadTaskDetail(repoRoot,board,id)}, 'comment', safeTaskId(commentMatch[1]), payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    const actionMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/actions$/);
    if (actionMatch && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await writeTask({repoRoot,board,readDetail:id=>loadTaskDetail(repoRoot,board,id)},'action',safeTaskId(actionMatch[1]),payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    const claimMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)\/claim$/);
    if (claimMatch && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await claimExecutionTask(board, safeTaskId(claimMatch[1]), payload);
      return sendJson(res, 200, { ok: true, board, ...result });
    }

    const taskMatch = pathName.match(/^\/api\/kanban\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      const boardPayload = await loadBoard(repoRoot, board);
      const task = findTask(boardPayload, taskMatch[1]);
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
