export const GAME_PREVIEW_ORIGIN = 'https://game-preview.ninjaprivacy.org';

export const FIELDS = ['id', 'build_id', 'commit_sha', 'playable_url', 'screenshot_url', 'video_url', 'check', 'result', 'performed_at', 'reporter'];
export const STAMPS = ['version', 'source', 'recorded_at', 'game_id'];
export const MAX_BYTES = 8000;
export function evidenceError(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function text(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw evidenceError(`invalid evidence ${field}`);
  return value;
}
export function timestamp(value, field) {
  text(value, 40, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw evidenceError(`invalid evidence ${field}`);
  const [year, month, day] = value.slice(0,10).split('-').map(Number);
  const calendar = new Date(`${value.slice(0,10)}T00:00:00Z`);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day || Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59 || Number(value.slice(17,19)) > 59) throw evidenceError(`invalid evidence ${field}`);
  return value;
}
function safeUrl(value, field, media = false) {
  text(value, 2048, field);
  try {
    let decoded = value;
    for (let i = 0; i < 4; i++) {
      if (/[\\\s\x00-\x1f\x7f]/.test(decoded) || decoded.split(/[/?#]/).some(part => part === '.' || part === '..' || part === '.git' || part.startsWith('.env'))) throw new Error();
      const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next;
    }
    if (/%[0-9a-f]{2}/i.test(decoded)) throw new Error();
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !/^https?:\/\//i.test(value)) throw new Error();
    if (media && (url.origin !== GAME_PREVIEW_ORIGIN || !url.pathname.startsWith('/games/artifacts/'))) throw new Error();
    return value;
  } catch { throw evidenceError(`unsafe evidence ${field}`); }
}
export function validateEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !FIELDS.includes(key))) throw evidenceError('invalid evidence fields');
  const id = text(value.id, 160, 'id');
  if (!/^[a-zA-Z0-9_.:-]+$/.test(id)) throw evidenceError('invalid evidence id');
  const optional = (field, validate) => value[field] == null ? null : validate(value[field], field);
  const record = {
    id,
    build_id: optional('build_id', (v, f) => text(v, 160, f)),
    commit_sha: optional('commit_sha', v => { if (typeof v !== 'string' || !/^[0-9a-f]{40}$/i.test(v)) throw evidenceError('commit_sha must be a full SHA'); return v; }),
    playable_url: safeUrl(value.playable_url, 'playable_url'),
    screenshot_url: optional('screenshot_url', (v,f) => safeUrl(v,f,true)),
    video_url: optional('video_url', (v,f) => safeUrl(v,f,true)),
    check: text(value.check, 1000, 'check'),
    result: value.result,
    performed_at: timestamp(value.performed_at, 'performed_at'),
    reporter: text(value.reporter, 120, 'reporter')
  };
  if (!['passed','failed','error','skipped'].includes(record.result)) throw evidenceError('invalid evidence result');
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > MAX_BYTES - 512) throw evidenceError('evidence is too large');
  return record;
}
