import { FIELDS, STAMPS, MAX_BYTES, evidenceError, timestamp, validateEvidence } from '../apps/kanban/evidence-validation.mjs';
export { evidenceError, validateEvidence } from '../apps/kanban/evidence-validation.mjs';
export function encodeEvidence(record) {
  const body = '```build-evidence\n' + JSON.stringify(record) + '\n```';
  if (Buffer.byteLength(body) > MAX_BYTES) throw evidenceError('evidence is too large');
  return body;
}
// Comments are operator assertions, never independent verification, even if forged.
export function parseEvidence(comments, gameId) {
  if (!gameId || !Array.isArray(comments)) return [];
  return comments.flatMap(comment => {
    const body = comment?.body ?? comment?.text;
    if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BYTES) return [];
    const match = /^```build-evidence\r?\n([^]*?)\r?\n```$/.exec(body);
    if (!match) return [];
    try {
      const raw = JSON.parse(match[1]);
      if (!raw || typeof raw !== 'object' || raw.version !== 1 || raw.game_id !== gameId || Object.keys(raw).some(k => !FIELDS.includes(k) && !STAMPS.includes(k))) return [];
      const payload = Object.fromEntries(FIELDS.filter(k => Object.hasOwn(raw,k)).map(k => [k,raw[k]]));
      return [{ ...validateEvidence(payload), version:1, source:'operator-reported', recorded_at:timestamp(raw.recorded_at,'recorded_at'), game_id:gameId }];
    } catch { return []; }
  });
}
export function sameEvidencePayload(record, payload) {
  return FIELDS.every(field => record[field] === payload[field]);
}
const taskLocks = new Map();
export async function withEvidenceLock(key, operation) {
  const previous = taskLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  taskLocks.set(key, current);
  try { return await current; } finally { if (taskLocks.get(key) === current) taskLocks.delete(key); }
}
