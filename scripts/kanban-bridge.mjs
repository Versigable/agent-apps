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

function safeSlug(value, field = 'slug') {
  const slug = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
    const error = new Error(`invalid ${field}`);
    error.statusCode = 400;
    throw error;
  }
  return slug;
}

function optionalSlug(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return safeSlug(value, field);
}

function safeTaskId(value) {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9_.:_-]{1,160}$/.test(id)) {
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

function jsonObject(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('not object');
    return JSON.stringify(parsed);
  } catch {
    const error = new Error(`${field} must be a JSON object`);
    error.statusCode = 400;
    throw error;
  }
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
    status: BOARD_COLUMNS.includes(task.status) ? task.status : 'todo',
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

function findTask(boardPayload, taskId) {
  return boardPayload.columns.flatMap((column) => column.tasks).find((item) => item.id === taskId);
}

async function readFixturePayload(repoRoot) {
  const fixturePath = process.env.KANBAN_FIXTURE_PATH || DEFAULT_FIXTURE_PATH;
  const fullPath = path.resolve(repoRoot, fixturePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) {
    const error = new Error('fixture path must stay inside repo');
    error.statusCode = 400;
    throw error;
  }
  return JSON.parse(await fs.readFile(fullPath, 'utf8'));
}

async function fixtureBoard(repoRoot, board) {
  const payload = await readFixturePayload(repoRoot);
  return normalizeBoard(payload, board, 'fixture');
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
  const payload = await readFixturePayload(repoRoot);
  const names = new Set(Array.isArray(payload.assignees) ? payload.assignees : []);
  return {
    mode: 'fixture',
    assignees: ['default', ...[...names].sort()].map((name) => ({
      name,
      on_disk: name === 'default',
      source: name === 'default' ? 'profile' : 'fixture-board',
      counts: {}
    }))
  };
}

function sanitizeBoard(item, currentBoard = 'default') {
  const slug = item.slug || item.board || 'default';
  const counts = item.counts && typeof item.counts === 'object' ? Object.fromEntries(Object.entries(item.counts).filter(([key]) => BOARD_COLUMNS.includes(key) || key === 'archived')) : {};
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

async function liveAssignees() {
  const stdout = await runHermesRaw(['kanban', 'assignees', '--json']);
  const assignees = JSON.parse(stdout || '[]');
  return {
    mode: 'live',
    assignees: (Array.isArray(assignees) ? assignees : []).map((item) => ({
      name: item.name,
      on_disk: Boolean(item.on_disk),
      counts: item.counts && typeof item.counts === 'object' ? item.counts : {}
    })).filter((item) => item.name)
  };
}

async function loadBoards(repoRoot, currentBoard) {
  if (resolveMode() === 'fixture') return fixtureBoards(repoRoot, currentBoard);
  try {
    return await liveBoards(currentBoard);
  } catch (error) {
    if ((process.env.KANBAN_LIVE_FALLBACK || 'fixture') === 'none') throw error;
    return fixtureBoards(repoRoot, currentBoard);
  }
}

async function loadAssignees(repoRoot) {
  if (resolveMode() === 'fixture') return fixtureAssignees(repoRoot);
  try {
    return await liveAssignees();
  } catch (error) {
    if ((process.env.KANBAN_LIVE_FALLBACK || 'fixture') === 'none') throw error;
    return fixtureAssignees(repoRoot);
  }
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
  try {
    return await liveExecutionStatus(repoRoot, board);
  } catch (error) {
    if ((process.env.KANBAN_LIVE_FALLBACK || 'fixture') === 'none') throw error;
    return fixtureExecutionStatus(repoRoot, board);
  }
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
  const boardPayload = normalizeBoard(raw, board, 'fixture');
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
    events: Array.isArray(details.events) ? details.events : [],
    dependencies: details.dependencies || { parents: [], children: [] },
    runs: Array.isArray(details.runs) ? details.runs : [],
    log: details.log || 'No worker log yet.',
    context: details.context || 'Full worker context would appear here.',
    diagnostics: Array.isArray(details.diagnostics) ? details.diagnostics : []
  };
}

function hermesBin() {
  return process.env.HERMES_BIN || path.join(process.env.HOME || '/home/merquery', '.local', 'bin', 'hermes');
}

async function runHermesRaw(args, options = {}) {
  const { stdout } = await execFileAsync(hermesBin(), args, {
    timeout: options.timeout || 10_000,
    maxBuffer: options.maxBuffer || 1024 * 1024,
    env: { ...process.env }
  });
  return stdout;
}

async function runHermesKanban(board, args, options = {}) {
  return runHermesRaw(['kanban', '--board', board, ...args], options);
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
  const workspace = optionalText(payload.workspace, 256, 'workspace') || 'scratch';
  if (!/^(scratch|worktree|dir:[^\0]+)$/.test(workspace)) {
    const error = new Error('workspace must be scratch, worktree, or dir:<path>');
    error.statusCode = 400;
    throw error;
  }
  const maxRuntime = optionalText(payload.max_runtime || payload.maxRuntime, 40, 'max_runtime');
  const idempotencyKey = optionalText(payload.idempotency_key || payload.idempotencyKey, 160, 'idempotency_key');
  const parents = Array.isArray(payload.parents) ? payload.parents.map((item) => safeTaskId(item)) : optionalText(payload.parent || payload.parents, 2000, 'parents')?.split(/[\s,]+/).filter(Boolean).map((item) => safeTaskId(item)) || [];
  const skills = Array.isArray(payload.skills) ? payload.skills.map((item) => optionalSlug(item, 'skill')).filter(Boolean) : optionalText(payload.skills, 2000, 'skills')?.split(/[\s,]+/).filter(Boolean).map((item) => optionalSlug(item, 'skill')) || [];
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
    '--workspace', workspace,
    '--created-by', WRITE_AUTHOR,
    '--json'
  ];
  if (parseBoolean(payload.triage, true)) args.push('--triage');
  if (assignee) args.push('--assignee', assignee);
  if (tenant) args.push('--tenant', tenant);
  if (idempotencyKey) args.push('--idempotency-key', idempotencyKey);
  if (maxRuntime) args.push('--max-runtime', maxRuntime);
  for (const parent of parents) args.push('--parent', parent);
  for (const skill of skills) args.push('--skill', skill);
  const stdout = await runHermesKanban(board, args);
  return parseCreatedTask(stdout);
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
    const result = optionalText(payload.result, 8000, 'result') || 'Completed from app-preview';
    const summary = optionalText(payload.summary, 8000, 'summary') || result;
    const metadata = jsonObject(payload.metadata, 'metadata');
    const args = ['complete', taskId, '--result', result, '--summary', summary];
    if (metadata) args.push('--metadata', metadata);
    await runHermesKanban(board, args);
    return { id: taskId, action, result, summary };
  }
  if (action === 'archive') {
    await runHermesKanban(board, ['archive', taskId]);
    return { id: taskId, action };
  }
  if (action === 'reclaim') {
    const reason = optionalText(payload.reason, 2000, 'reason') || 'Reclaimed from app-preview';
    await runHermesKanban(board, ['reclaim', '--reason', reason, taskId]);
    return { id: taskId, action, reason };
  }
  if (action === 'reassign') {
    const assignee = optionalText(payload.assignee, 80, 'assignee') || 'none';
    const reason = optionalText(payload.reason, 2000, 'reason');
    const args = ['reassign'];
    if (parseBoolean(payload.reclaim, false)) args.push('--reclaim');
    if (reason) args.push('--reason', reason);
    args.push(taskId, assignee);
    await runHermesKanban(board, args);
    return { id: taskId, action, assignee, reclaim: parseBoolean(payload.reclaim, false) };
  }
  if (action === 'edit') {
    const result = cleanText(payload.result, 8000, 'result');
    const summary = optionalText(payload.summary, 8000, 'summary');
    const metadata = jsonObject(payload.metadata, 'metadata');
    const args = ['edit', taskId, '--result', result];
    if (summary) args.push('--summary', summary);
    if (metadata) args.push('--metadata', metadata);
    await runHermesKanban(board, args);
    return { id: taskId, action };
  }

  const error = new Error('unsupported task action');
  error.statusCode = 400;
  throw error;
}

async function runLinkAction(board, payload) {
  const action = String(payload.action || 'link').toLowerCase();
  const parentId = safeTaskId(payload.parent_id || payload.parentId);
  const childId = safeTaskId(payload.child_id || payload.childId);
  if (action === 'link') {
    await runHermesKanban(board, ['link', parentId, childId]);
    return { action, parent_id: parentId, child_id: childId };
  }
  if (action === 'unlink') {
    await runHermesKanban(board, ['unlink', parentId, childId]);
    return { action, parent_id: parentId, child_id: childId };
  }
  const error = new Error('unsupported link action');
  error.statusCode = 400;
  throw error;
}

async function loadTaskDetail(repoRoot, board, taskId) {
  const mode = resolveMode();
  if (mode === 'fixture') return fixtureDetail(repoRoot, board, taskId);
  try {
    const stdout = await runHermesKanban(board, ['show', taskId, '--json']);
    const parsed = JSON.parse(stdout || '{}');
    const task = publicTask(parsed.task || parsed);
    return {
      board,
      mode: 'live',
      readOnly: readOnlyMode(),
      writesEnabled: writesEnabled(),
      task,
      comments: parsed.comments || parsed.task?.comments || [],
      events: parsed.events || parsed.task?.events || [],
      dependencies: parsed.dependencies || parsed.links || { parents: parsed.parents || [], children: parsed.children || [] },
      runs: parsed.runs || [],
      log: parsed.log || null,
      context: parsed.context || null,
      diagnostics: parsed.diagnostics || task.diagnostics || []
    };
  } catch (error) {
    if ((process.env.KANBAN_LIVE_FALLBACK || 'fixture') === 'none') throw error;
    return fixtureDetail(repoRoot, board, taskId);
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
      return sendJson(res, 200, await loadAssignees(repoRoot));
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
      const task = await createTriageTask(board, payload);
      return sendJson(res, 201, { ok: true, board, readOnly: false, task });
    }

    if (pathName === '/api/kanban/links' && req.method === 'POST') {
      const payload = await readRequestJson(req);
      requireWritable(mode);
      const result = await runLinkAction(board, payload);
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
