// Shared command construction; no HTTP routing or scope selection.
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
const scopedCommandContext = new AsyncLocalStorage();
export const withScopedCommands = (scope, operation) => scopedCommandContext.run(scope, operation);
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadGames, parseGameDev, encodeGameDev, validateGameDev } from './kanban-games.mjs';
import { CAPTURE_BODY_MAX } from './kanban-capture.mjs';
const execFileAsync = promisify(execFile);
const WRITE_AUTHOR = process.env.KANBAN_WRITE_AUTHOR || 'app-preview';

export function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

export function safeSlug(value, field = 'slug') {
  const slug = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
    const error = new Error(`invalid ${field}`);
    error.statusCode = 400;
    throw error;
  }
  return slug;
}

export function optionalSlug(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return safeSlug(value, field);
}

export function safeTaskId(value) {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9_.:_-]{1,160}$/.test(id)) {
    const error = new Error('invalid task id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

export function cleanText(value, maxLength, field) {
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

export function optionalText(value, maxLength, field) {
  if (value === undefined || value === null || value === '') return null;
  return cleanText(value, maxLength, field);
}

function canonicalAssignee(value, unassignAliases = false) {
  const name = optionalText(value, 80, 'assignee')?.toLowerCase() || null;
  return unassignAliases && ['none', '-', 'null'].includes(name) ? null : name;
}

export function jsonObject(value, field) {
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

export function hermesBin() {
  return process.env.HERMES_BIN || path.join(process.env.HOME || '/home/merquery', '.local', 'bin', 'hermes');
}

export async function runHermesRaw(args, options = {}) {
  const scope = scopedCommandContext.getStore();
  if (scope && (!scopedWritesEnabled() || args[0] !== 'kanban' || args[2] !== 'default')) throw new Error('Scoped writer unavailable');
  // The dedicated writer must authorize membership and mutate in ONE database
  // transaction. Never check here then fall back to the legacy CLI.
  const executable = scope ? process.env.GAME_DEV_SCOPED_WRITER : hermesBin();
  const argv = scope ? ['--protocol', 'game-dev-write-v1', '--database', scope.database, '--game', scope.game, '--', ...args] : args;
  const pythonWriter = scope && executable.endsWith('.py');
  const { stdout } = await execFileAsync(pythonWriter ? (process.env.KANBAN_PYTHON || 'python3') : executable, pythonWriter ? [executable,...argv] : argv, {
    timeout: options.timeout || 10_000,
    maxBuffer: options.maxBuffer || 1024 * 1024,
    env: { ...process.env, ...(scope ? {KANBAN_NODE:process.execPath} : {}) }
  });
  return stdout;
}

export async function runHermesKanban(board, args, options = {}) {
  return runHermesRaw(['kanban', '--board', board, ...args], options);
}

export function parseCreatedTask(stdout) {
  try {
    const parsed = JSON.parse(stdout || '{}');
    return parsed.task || parsed;
  } catch {
    return { raw: stdout.trim() };
  }
}

export async function prepareCreate(board, payload, repoRoot) {
  const title = cleanText(payload.title, 180, 'title');
  let body = optionalText(payload.body, 8000, 'body') || '';
  if (body.includes('```game-dev')) {
    const error = new Error('body must not contain reserved game-dev metadata; use game_dev'); error.statusCode = 400; throw error;
  }
  if (Object.hasOwn(payload, 'game_dev')) {
    const metadata = validateGameDev(payload.game_dev, await loadGames(repoRoot));
    if (payload.body !== undefined && typeof payload.body !== 'string') {
      const error = new Error('body must be a string'); error.statusCode = 400; throw error;
    }
    body = encodeGameDev(payload.body || '', metadata);
    if (body.length > (metadata.capture ? CAPTURE_BODY_MAX : 8000) || Buffer.byteLength(body, 'utf8') > (metadata.capture ? CAPTURE_BODY_MAX : 120000)) {
      const error = new Error('body including game-dev metadata is too long'); error.statusCode = 400; throw error;
    }
  }
  const assignee = canonicalAssignee(payload.assignee);
  const tenant = optionalText(payload.tenant, 80, 'tenant');
  let workspace = optionalText(payload.workspace, 256, 'workspace') || 'scratch';
  if (!/^(scratch|worktree|dir:[^\0]+)$/.test(workspace)) {
    const error = new Error('workspace must be scratch, worktree, or dir:<path>');
    error.statusCode = 400;
    throw error;
  }
  if (workspace.startsWith('dir:')) {
    let directory = cleanText(workspace.slice(4), 252, 'workspace path');
    if (directory.startsWith('~')) {
      // Match installed os.path.expanduser, including ~user and unknown users;
      // do not resolve relative paths or normalize '..' differently from CLI.
      const { stdout } = await execFileAsync(process.env.KANBAN_PYTHON || 'python3',
        ['-c', 'import os,sys,json; print(json.dumps(os.path.expanduser(sys.argv[1])))', directory],
        { timeout: 10000, env: { ...process.env } });
      directory = JSON.parse(stdout);
    }
    workspace = `dir:${directory}`;
  }
  const maxRuntime = optionalText(payload.max_runtime || payload.maxRuntime, 40, 'max_runtime');
  const idempotencyKey = optionalText(payload.idempotency_key || payload.idempotencyKey, 160, 'idempotency_key');
  if (payload.game_dev?.capture && (!parseBoolean(payload.triage, true) || assignee || !idempotencyKey)) {
    const error = new Error('playtest capture requires unassigned triage and an idempotency_key'); error.statusCode = 400; throw error;
  }
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
  return {args,title,body,idempotencyKey,parents,assignee,tenant,priority:Math.trunc(priority),workspace,skills,maxRuntime};
}

export async function createTriageTask(board, payload, repoRoot) {
  const {args}=await prepareCreate(board,payload,repoRoot);
  const stdout = await runHermesKanban(board, args);
  const created = parseCreatedTask(stdout);
  return Object.hasOwn(payload, 'game_dev') ? { ...created, game_dev: parseGameDev(created.body) } : created;
}

export async function commentTask(board, taskId, payload) {
  const text = cleanText(payload.text, 8000, 'comment');
  const author = optionalText(payload.author, 80, 'author') || WRITE_AUTHOR;
  await runHermesKanban(board, ['comment', taskId, text, '--author', author]);
  return { id: taskId, commented: true };
}

export async function runTaskAction(board, taskId, payload) {
  const action = String(payload.action || '').toLowerCase();
  if (action === 'assign') {
    const assignee = canonicalAssignee(payload.assignee, true) || 'none';
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
    const assignee = canonicalAssignee(payload.assignee, true) || 'none';
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

export async function runLinkAction(board, payload) {
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

export function scopedWritesEnabled() {
  return path.isAbsolute(process.env.GAME_DEV_SCOPED_WRITER || '')
    && process.env.GAME_DEV_READS_ENABLED==='true' && process.env.GAME_DEV_WRITES_ENABLED==='true'
    && process.env.KANBAN_MODE==='live' && ['false','0','no','off'].includes((process.env.KANBAN_READONLY || '').toLowerCase());
}
