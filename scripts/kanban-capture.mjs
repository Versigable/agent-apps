import { inflateSync } from 'node:zlib';

export const CAPTURE_BODY_MAX = 100000;
const IMAGE_MAX = 65536;
function fail(message) { const error = new Error(`playtest capture: ${message}`); error.statusCode = 400; throw error; }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('invalid fields');
}
function crc(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); }
  return (n ^ 0xffffffff) >>> 0;
}
// No general-purpose file serving: bounded raster bytes travel in the existing
// private task body. Reject ancillary chunks (including text), APNG, trailing
// bytes, palette/interlace modes, CRC errors and decompression bombs.
function validatePng(base64) {
  if (typeof base64 !== 'string' || base64.length > 87384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail('invalid PNG base64');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > IMAGE_MAX || bytes.toString('base64') !== base64 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('PNG must be at most 64 KiB');
  let offset = 8, header, ended = false;
  const data = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length) fail('truncated PNG');
    const type = bytes.toString('ascii', offset + 4, offset + 8), body = bytes.subarray(offset + 8, end - 4);
    if (crc(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) fail('PNG checksum mismatch');
    if (type === 'IHDR' && !header && offset === 8 && size === 13) {
      const width = body.readUInt32BE(0), height = body.readUInt32BE(4);
      if (!width || !height || width > 2048 || height > 2048 || body[8] !== 8 || ![2, 6].includes(body[9]) || body[10] || body[11] || body[12]) fail('PNG must be 8-bit RGB/RGBA, noninterlaced, at most 2048 × 2048');
      header = { width, height, channels: body[9] === 6 ? 4 : 3 };
    } else if (type === 'IDAT' && header && !ended) data.push(body);
    else if (type === 'IEND' && header && data.length && size === 0 && end === bytes.length) ended = true;
    else fail('unsupported PNG chunks; export a plain RGB/RGBA PNG');
    offset = end;
  }
  if (!ended || offset !== bytes.length) fail('incomplete PNG');
  const stride = header.width * header.channels + 1, expected = stride * header.height;
  let raw;
  try {
    const compressed = Buffer.concat(data);
    const result = inflateSync(compressed, { maxOutputLength: expected, info: true });
    if (result.engine.bytesWritten !== compressed.length) fail('trailing compressed bytes');
    raw = result.buffer;
  } catch { fail('invalid PNG pixel data'); }
  if (raw.length !== expected) fail('invalid PNG pixel length');
  for (let i = 0; i < raw.length; i += stride) if (raw[i] > 4) fail('invalid PNG filter');
  return { mime: 'image/png', base64 };
}

export function validateCapture(value) {
  object(value, ['version', 'build', 'screenshot']);
  if (value.version !== 1) fail('unsupported version');
  object(value.build, ['url', 'identifier']);
  const { url, identifier } = value.build;
  if (typeof url !== 'string' || url.length > 2048 || /[\s\\\x00-\x1f`]/.test(url)) fail('build URL must be an absolute HTTP(S) URL');
  try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('unsafe build URL'); }
  catch { fail('build URL must be an absolute HTTP(S) URL without credentials'); }
  if (identifier !== null && (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 160 || /[\x00-\x1f`]/.test(identifier))) fail('build identifier must be 1-160 characters or explicit null (unknown)');
  let screenshot = null;
  if (value.screenshot !== null) {
    object(value.screenshot, ['mime', 'base64']);
    if (value.screenshot.mime !== 'image/png') fail('only PNG screenshots are accepted');
    screenshot = validatePng(value.screenshot.base64);
  }
  return { version: 1, build: { url, identifier: identifier === null ? null : identifier.trim() }, screenshot };
}
