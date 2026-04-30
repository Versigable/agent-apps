const gamesEl = document.querySelector('#games');
const statusEl = document.querySelector('#status');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function manifestRelativeUrl(path) {
  return path?.replace(/^\.\//, '../') ?? '';
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

function humanizeScorecardKey(key) {
  const labels = {
    visualClarity: 'Visual clarity',
    agentSelfTest: 'Agent self-test quality',
    agentSelfTestQuality: 'Agent self-test quality'
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function scorecardEntries(scorecard) {
  if (!scorecard) return [];
  if (Array.isArray(scorecard)) {
    return scorecard.map((item) => [item.label ?? item.name ?? item.key, item]);
  }
  const ratings = scorecard.ratings ?? scorecard.scorecard ?? scorecard;
  return Object.entries(ratings ?? {});
}

function scorecardItems(scorecard) {
  return scorecardEntries(scorecard).map(([key, value]) => {
    const label = value?.label ?? humanizeScorecardKey(key);
    const rating = typeof value === 'object' && value !== null
      ? value.rating ?? value.score ?? value.value
      : value;
    const note = typeof value === 'object' && value !== null ? value.note ?? value.notes : null;
    const ratingText = rating ?? 'unrated';
    const noteHtml = note ? `<p class="score-note">${escapeHtml(note)}</p>` : '';
    return `
      <li>
        <strong>${escapeHtml(label)}</strong>
        <span class="score-rating">${escapeHtml(ratingText)}/10</span>
        ${noteHtml}
      </li>
    `;
  }).join('');
}

function checklistItems(items) {
  return (items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function artifactLinks(game) {
  if (!game.artifacts) return '';
  const links = [];
  if (game.artifacts.latestVideo) {
    links.push(`<a href="${safeHref(manifestRelativeUrl(game.artifacts.latestVideo))}">Latest video artifact</a>`);
  }
  if (game.artifacts.latestSummary) {
    links.push(`<a href="${safeHref(manifestRelativeUrl(game.artifacts.latestSummary))}">Latest run summary</a>`);
  }
  return links.length ? `<p class="meta artifact-links"><strong>Artifacts:</strong> ${links.join(' · ')}</p>` : '';
}

async function loadScorecard(game) {
  if (!game.scorecardUrl) return game;
  try {
    const response = await fetch(manifestRelativeUrl(game.scorecardUrl), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Scorecard request failed: ${response.status}`);
    const externalScorecard = await response.json();
    return { ...game, scorecard: externalScorecard };
  } catch (error) {
    console.warn(`Could not load scorecard for ${game.id}: ${error.message}`);
    return game;
  }
}

function renderGame(game) {
  const card = document.createElement('article');
  card.className = 'game-card';
  card.dataset.testid = `game-card-${game.id}`;
  card.setAttribute('data-testid', `game-card-${game.id}`);
  card.innerHTML = `
    <h3>${escapeHtml(game.title)}</h3>
    <p class="meta">${escapeHtml(game.summary)}</p>
    <div class="badges">
      <span class="badge">${escapeHtml(game.type)}</span>
      <span class="badge">${escapeHtml(game.status)}</span>
      <span class="badge">${escapeHtml(game.agent)}</span>
      <span class="badge">${escapeHtml(game.model)}</span>
    </div>
    <div class="card-actions">
      <a class="button" href="${safeHref(manifestRelativeUrl(game.playUrl))}" aria-label="Play ${escapeHtml(game.title)}">Play ${escapeHtml(game.title)}</a>
      ${game.previewUrl ? `<a class="button secondary" href="${safeHref(game.previewUrl)}" aria-label="One-click internal preview for ${escapeHtml(game.title)}">One-click internal preview</a>` : ''}
    </div>
    <p class="meta"><strong>Automated test:</strong> <code>${escapeHtml(game.testCommand)}</code></p>
    ${game.artifactCommand ? `<p class="meta"><strong>Video workflow:</strong> <code>${escapeHtml(game.artifactCommand)}</code></p>` : ''}
    ${artifactLinks(game)}
    <h4>Manual scorecard</h4>
    <ul class="scorecard">${scorecardItems(game.scorecard)}</ul>
    <h4>Manual checklist</h4>
    <ol class="checklist">${checklistItems(game.manualChecklist)}</ol>
  `;
  return card;
}

async function loadManifest() {
  try {
    const response = await fetch('../manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
    const manifest = await response.json();
    const games = await Promise.all(manifest.games.map(loadScorecard));
    gamesEl.replaceChildren(...games.map(renderGame));
    statusEl.textContent = `${games.length} game${games.length === 1 ? '' : 's'} registered`;
  } catch (error) {
    statusEl.textContent = 'Manifest failed to load';
    const errorCard = document.createElement('article');
    errorCard.className = 'game-card error';
    errorCard.textContent = `Could not load games/manifest.json: ${error.message}`;
    gamesEl.replaceChildren(errorCard);
  }
}

loadManifest();
