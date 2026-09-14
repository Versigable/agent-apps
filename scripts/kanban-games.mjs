import fs from 'node:fs/promises';
import path from 'node:path';

export const GAME_DEV_DISCIPLINES = ['gameplay', 'art', 'audio', 'performance', 'qa', 'design'];
export const GAME_DEV_MILESTONE_MAX = 120;

export function validateGameDev(value, games) {
  const fail = message => { const error = new Error(message); error.statusCode = 400; throw error; };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('game_dev must be an object');
  if (typeof value.game_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value.game_id)) fail('invalid game_dev.game_id');
  if (games && !games.some(game => game.id === value.game_id)) fail('unknown game_dev.game_id');
  if (typeof value.milestone !== 'string' || !value.milestone.trim() || value.milestone.length > GAME_DEV_MILESTONE_MAX || /[\x00-\x1f`]/.test(value.milestone)) fail('game_dev.milestone must be 1-120 characters without controls or backticks');
  if (!GAME_DEV_DISCIPLINES.includes(value.discipline)) fail('invalid game_dev.discipline');
  return { game_id: value.game_id, milestone: value.milestone.trim(), discipline: value.discipline };
}

export function parseGameDev(body) {
  if (typeof body !== 'string') return null;
  const matches = [...body.matchAll(/^```game-dev\r?\n([^]*?)\r?\n```[ \t]*(?=\r?\n|$)/gm)];
  if (matches.length !== 1 || (body.match(/```game-dev/g) || []).length !== 1 || matches[0][1].length > 1024) return null;
  try { return validateGameDev(JSON.parse(matches[0][1])); } catch { return null; }
}

export function encodeGameDev(body, value) {
  const metadata = validateGameDev(value);
  if (typeof body !== 'string' || body.includes('```game-dev')) {
    const error = new Error('body must not contain reserved game-dev metadata'); error.statusCode = 400; throw error;
  }
  return `${body}${body ? '\n\n' : ''}\`\`\`game-dev\n${JSON.stringify(metadata)}\n\`\`\``;
}

export const GAME_PREVIEW_ORIGIN = 'https://game-preview.ninjaprivacy.org';

// Only the game surface is approved. Never map repository/app/private paths.
export async function resolveGameUrl(value, repoRoot, { evidence = false } = {}) {
  if (typeof value !== 'string' || !value || /[\\\s\x00-\x1f]/.test(value) || value.startsWith('//')) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.split(/[/?#]/).some(part => part === '..' || part.startsWith('.env') || part === '.git') || /[\\\x00-\x1f]/.test(decoded)) return null;
    const url = new URL(value, `${GAME_PREVIEW_ORIGIN}/games/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== GAME_PREVIEW_ORIGIN || url.username || url.password || !url.pathname.startsWith('/games/')) return null;
    if (evidence) {
      if (!url.pathname.startsWith('/games/artifacts/')) return null;
      const canonicalRepo = await fs.realpath(repoRoot);
      const root = path.join(canonicalRepo, 'games', 'artifacts');
      if (await fs.realpath(root) !== root) return null;
      const file = await fs.realpath(path.join(canonicalRepo, decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !(await fs.stat(file)).isFile()) return null;
    }
    return url.href;
  } catch { return null; }
}

export async function loadGames(repoRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'games/manifest.json'), 'utf8'));
  const text = value => typeof value === 'string' ? value : '';
  const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  return Promise.all((Array.isArray(manifest.games) ? manifest.games : []).filter(game => game && typeof game.id === 'string').map(async game => ({
    id: game.id,
    title: text(game.title),
    summary: text(game.summary),
    status: text(game.status),
    previewUrl: await resolveGameUrl(game.previewUrl || game.previewPath || game.playUrl, repoRoot),
    screenshotUrl: await resolveGameUrl(game.artifacts?.latestScreenshot, repoRoot, { evidence: true }) || await resolveGameUrl(game.screenshot, repoRoot, { evidence: true }),
    videoUrl: await resolveGameUrl(game.artifacts?.latestVideo, repoRoot, { evidence: true }),
    testCommand: text(game.testCommand),
    manualChecklist: strings(game.manualChecklist),
    nextIdeas: strings(game.nextIdeas)
  })));
}
