const appsEl = document.querySelector('#apps');
const statusEl = document.querySelector('#status');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHref(value) {
  const href = String(value ?? '').trim();
  if (!href) return '#';
  if (href.startsWith('../') || href.startsWith('./') || href.startsWith('/')) return escapeHtml(href);
  try {
    const url = new URL(href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return escapeHtml(url.href);
  } catch {
    // Fall through to blocked href.
  }
  return '#';
}

function listItems(items, className) {
  return (items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || `<li class="${className}">No entries yet.</li>`;
}

function renderApp(app) {
  const card = document.createElement('article');
  card.className = 'app-card';
  card.dataset.testid = `app-card-${app.id}`;
  card.setAttribute('data-testid', `app-card-${app.id}`);
  card.innerHTML = `
    <h3>${escapeHtml(app.title)}</h3>
    <p class="meta">${escapeHtml(app.summary)}</p>
    <div class="badges">
      <span class="badge">${escapeHtml(app.type)}</span>
      <span class="badge">${escapeHtml(app.status)}</span>
      <span class="badge">${escapeHtml(app.agent)}</span>
      <span class="badge">${escapeHtml(app.model)}</span>
    </div>
    <div class="card-actions">
      <a class="button primary" href="${safeHref(app.launchUrl)}" aria-label="Open ${escapeHtml(app.title)}">Open ${escapeHtml(app.title)}</a>
      ${app.healthPath ? `<a class="button secondary" href="${safeHref(app.healthPath)}" aria-label="Health check for ${escapeHtml(app.title)}">Bridge health</a>` : ''}
      ${app.previewUrl ? `<a class="button secondary" href="${safeHref(app.previewUrl)}" aria-label="Public preview for ${escapeHtml(app.title)}">Public preview</a>` : ''}
    </div>
    <p class="meta"><strong>Automated test:</strong> <code>${escapeHtml(app.testCommand)}</code></p>
    <h4>Safety posture</h4>
    <ul class="safety-list">${listItems(app.safetyPosture, 'safety-list')}</ul>
    <h4>Operator checklist</h4>
    <ol class="checklist">${listItems(app.operatorChecklist, 'checklist')}</ol>
    <h4>Next approved directions</h4>
    <ul class="next-list">${listItems(app.nextIdeas, 'next-list')}</ul>
  `;
  return card;
}

async function loadManifest() {
  try {
    const response = await fetch('./manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
    const manifest = await response.json();
    appsEl.replaceChildren(...manifest.apps.map(renderApp));
    statusEl.textContent = `${manifest.apps.length} app${manifest.apps.length === 1 ? '' : 's'} registered · ${manifest.surface?.name ?? 'app-preview'}`;
  } catch (error) {
    statusEl.textContent = 'App registry failed to load';
    const errorCard = document.createElement('article');
    errorCard.className = 'app-card error';
    errorCard.textContent = `Could not load apps/manifest.json: ${error.message}`;
    appsEl.replaceChildren(errorCard);
  }
}

loadManifest();
