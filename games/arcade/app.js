const gamesEl = document.querySelector('#games');
const statusEl = document.querySelector('#status');

function scorecardItems(scorecard) {
  return Object.entries(scorecard ?? {}).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
    return `<li><strong>${label}</strong><br>${value ?? 'unrated'}/10</li>`;
  }).join('');
}

function checklistItems(items) {
  return (items ?? []).map((item) => `<li>${item}</li>`).join('');
}

function artifactLinks(game) {
  if (!game.artifacts) return '';
  const links = [];
  if (game.artifacts.latestVideo) {
    links.push(`<a href="${game.artifacts.latestVideo.replace(/^\.\//, '../')}">Latest video artifact</a>`);
  }
  if (game.artifacts.latestSummary) {
    links.push(`<a href="${game.artifacts.latestSummary.replace(/^\.\//, '../')}">Latest run summary</a>`);
  }
  return links.length ? `<p class="meta artifact-links"><strong>Artifacts:</strong> ${links.join(' · ')}</p>` : '';
}

function renderGame(game) {
  const card = document.createElement('article');
  card.className = 'game-card';
  card.dataset.testid = `game-card-${game.id}`;
  card.setAttribute('data-testid', `game-card-${game.id}`);
  card.innerHTML = `
    <h3>${game.title}</h3>
    <p class="meta">${game.summary}</p>
    <div class="badges">
      <span class="badge">${game.type}</span>
      <span class="badge">${game.status}</span>
      <span class="badge">${game.agent}</span>
      <span class="badge">${game.model}</span>
    </div>
    <div class="card-actions">
      <a class="button" href="${game.playUrl.replace(/^\.\//, '../')}" aria-label="Play ${game.title}">Play ${game.title}</a>
      ${game.previewUrl ? `<a class="button secondary" href="${game.previewUrl}" aria-label="One-click internal preview for ${game.title}">One-click internal preview</a>` : ''}
    </div>
    <p class="meta"><strong>Automated test:</strong> <code>${game.testCommand}</code></p>
    ${game.artifactCommand ? `<p class="meta"><strong>Video workflow:</strong> <code>${game.artifactCommand}</code></p>` : ''}
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
    gamesEl.replaceChildren(...manifest.games.map(renderGame));
    statusEl.textContent = `${manifest.games.length} game${manifest.games.length === 1 ? '' : 's'} registered`;
  } catch (error) {
    statusEl.textContent = 'Manifest failed to load';
    const errorCard = document.createElement('article');
    errorCard.className = 'game-card error';
    errorCard.textContent = `Could not load games/manifest.json: ${error.message}`;
    gamesEl.replaceChildren(errorCard);
  }
}

loadManifest();
