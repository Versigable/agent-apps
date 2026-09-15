// Session-local, per-board/game drafts. No uploads or task writes until Submit.
export function createPlaytestCapture({ gameDev, captureView, writesEnabled, postJson, refreshBoard }) {
  const form = document.querySelector('#capture-form');
  const status = document.querySelector('#capture-status');
  const context = document.querySelector('#capture-context');
  const play = document.querySelector('#capture-play');
  const image = document.querySelector('#capture-image');
  const drafts = new Map();
  const fields = ['title', 'notes', 'build_url', 'build_identifier'];
  let current, key;
  function message(text, error = false) {
    if (current) { current.message = text; current.error = error; }
    status.textContent = text; status.classList.toggle('is-error', error);
  }
  function safeUrl(value) {
    try { const url = new URL(value); return value.length <= 2048 && !/[\s\\\x00-\x1f`]/.test(value) && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }
  function showMedia() {
    const url = current?.build_url;
    if (safeUrl(url || '')) { play.href = url; play.hidden = false; }
    else { play.removeAttribute('href'); play.hidden = true; }
    image.hidden = !current?.screenshot;
    if (current?.screenshot) image.src = `data:image/png;base64,${current.screenshot.base64}`;
    else image.removeAttribute('src');
  }
  function controls() {
    const enabled = writesEnabled() && gameDev.active && Boolean(gameDev.selected());
    for (const field of form.elements) field.disabled = !enabled;
    form.querySelector('[type=submit]').disabled = !enabled || Boolean(current?.pending || current?.reading);
  }
  function sync() {
    const game = gameDev.selected();
    const nextKey = game ? `${captureView().board}/${game.id}` : null;
    if (nextKey !== key) {
      key = nextKey;
      if (key && !drafts.has(key)) drafts.set(key, { title: '', notes: '', build_url: game.previewUrl || '', build_identifier: '', screenshot: null, revision: 0, reading: false, pending: false });
      current = drafts.get(key);
      for (const field of fields) form.elements[field].value = current?.[field] || '';
      form.elements.screenshot.value = '';
      message(current?.message || (current ? 'Capture notes here; drafts stay in this tab per board and game.' : 'Select an available game to capture a playtest.'), current?.error);
    }
    context.textContent = game ? `${game.title} · Board: ${captureView().board}` : 'No game selected';
    showMedia(); controls();
  }
  for (const field of fields) form.elements[field].addEventListener('input', () => {
    if (!current) return;
    current[field] = form.elements[field].value; current.revision++; showMedia();
  });
  document.querySelector('#capture-remove-image').addEventListener('click', () => {
    if (!current) return;
    current.revision++; current.imageGeneration = (current.imageGeneration || 0) + 1;
    current.screenshot = null; current.reading = false; current.imageError = null;
    form.elements.screenshot.value = ''; showMedia(); controls(); message('Screenshot removed.');
  });
  form.elements.screenshot.addEventListener('change', async () => {
    const draft = current, view = captureView(), selection = gameDev.captureSelection();
    const file = form.elements.screenshot.files[0];
    if (!draft || !file) return;
    const token = draft.imageGeneration = (draft.imageGeneration || 0) + 1;
    const isCurrent = () => current === draft && view.isCurrent() && selection() && token === draft.imageGeneration;
    draft.revision++; draft.reading = true; draft.imageError = null; controls();
    try {
      const screenshot = await prepareScreenshot(file);
      if (!isCurrent()) return;
      draft.screenshot = screenshot; message('Screenshot ready. Preview is the resized image that will be stored.');
    } catch (error) {
      if (!isCurrent()) return;
      draft.imageError = error.message; message(error.message, true);
    } finally {
      if (token === draft.imageGeneration) draft.reading = false;
      if (isCurrent()) showMedia();
      controls();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const draft = current, game = gameDev.selected(), view = captureView(), selection = gameDev.captureSelection();
    if (!draft || !game || !writesEnabled() || draft.pending || draft.reading) return;
    const revision = draft.revision;
    const isCurrent = () => current === draft && view.isCurrent() && selection() && revision === draft.revision;
    try {
      if (!draft.title.trim() || draft.title.length > 180) throw new Error('Capture title must be 1-180 characters.');
      if (!draft.notes.trim() || draft.notes.length > 4000 || draft.notes.includes('```game-dev')) throw new Error('Playtest notes must be 1-4000 characters without reserved metadata.');
      if (!safeUrl(draft.build_url)) throw new Error('Supply an absolute HTTP(S) playable build URL without credentials.');
      if (draft.build_identifier.length > 160 || /[\x00-\x1f`]/.test(draft.build_identifier)) throw new Error('Build identifier must be at most 160 characters without controls or backticks.');
      if (draft.imageError) throw new Error(draft.imageError + ' Choose a valid PNG, JPEG or WebP or remove the screenshot.');
      const payload = { title: draft.title.trim(), body: draft.notes, triage: true,
        game_dev: { game_id: game.id, milestone: 'Playtest', discipline: 'qa', capture: { version: 1,
          build: { url: draft.build_url, identifier: draft.build_identifier.trim() || null }, screenshot: draft.screenshot } } };
      // Retrying an unchanged observation reuses its key, even after a lost reply.
      const fingerprint = JSON.stringify(payload);
      if (draft.fingerprint !== fingerprint) { draft.fingerprint = fingerprint; draft.idempotency = `playtest-${crypto.randomUUID()}`; }
      payload.idempotency_key = draft.idempotency;
      draft.pending = true; controls(); message(`Creating playtest triage task on ${view.board}…`);
      const result = await postJson(`/api/kanban/tasks?board=${encodeURIComponent(view.board)}`, payload);
      if (!isCurrent()) return;
      draft.title = ''; draft.notes = ''; draft.screenshot = null; draft.fingerprint = null; draft.revision++;
      for (const field of fields) form.elements[field].value = draft[field];
      form.elements.screenshot.value = ''; showMedia();
      message(`Created triage task ${result.task?.id || ''}. Unassigned; not dispatched.`);
      await refreshBoard();
    } catch (error) { if (isCurrent()) message(error.message, true); }
    finally { draft.pending = false; controls(); }
  });
  return { sync };
}

async function prepareScreenshot(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP file no larger than 8 MiB; SVG/HTML are not accepted.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Not a valid PNG, JPEG or WebP image.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096) throw new Error('Image dimensions must be at most 4096 × 4096.');
    let scale = Math.min(1, 1024 / bitmap.width, 1024 / bitmap.height);
    for (let attempt = 0; attempt < 12; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(bitmap.width * scale)); canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode screenshot.');
      // Canvas output is freshly rasterized. Drop ancillary metadata chunks so
      // the server accepts only IHDR/IDAT/IEND, never embedded text or animation.
      const encoded = new Uint8Array(await blob.arrayBuffer()), parts = [encoded.slice(0, 8)];
      for (let offset = 8; offset + 12 <= encoded.length;) {
        const length = new DataView(encoded.buffer).getUint32(offset), end = offset + length + 12;
        const type = String.fromCharCode(...encoded.slice(offset + 4, offset + 8));
        if (['IHDR', 'IDAT', 'IEND'].includes(type)) parts.push(encoded.slice(offset, end));
        offset = end;
      }
      const cleaned = new Uint8Array(await new Blob(parts).arrayBuffer());
      if (cleaned.length <= 65536) return { mime: 'image/png', base64: btoa(Array.from(cleaned, byte => String.fromCharCode(byte)).join('')) };
      scale *= 0.7;
    }
    throw new Error('Screenshot could not fit the 64 KiB storage limit.');
  } finally { bitmap.close(); }
}
