const root = document.querySelector('#game-root');
const canvas = document.querySelector('#salvage-canvas');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#start-button');
const signalEl = document.querySelector('#signal');
const scoreEl = document.querySelector('#score');
const coresEl = document.querySelector('#cores');
const timerEl = document.querySelector('#timer');
const statusEl = document.querySelector('#status-panel');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const keys = new Set();
let lastFrame = performance.now();
let animationId = null;
let spawnClock = 0;
let pulseClock = 0;

const state = {
  mode: 'idle',
  signal: 100,
  score: 0,
  cores: 0,
  hits: 0,
  hazards: 0,
  timeLeft: 60,
  difficulty: 1,
  lastEvent: 'boot',
  player: { x: 640, y: 520, radius: 22, speed: 330 },
  entities: [],
  stars: Array.from({ length: 72 }, (_, index) => ({
    x: (index * 157) % WIDTH,
    y: (index * 83) % HEIGHT,
    r: 0.8 + (index % 5) * 0.35,
    glow: index % 3 === 0 ? '#33f6ff' : '#875cff'
  }))
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function syncDom() {
  root.dataset.state = state.mode;
  root.dataset.signal = String(Math.round(state.signal));
  root.dataset.score = String(state.score);
  root.dataset.coresCollected = String(state.cores);
  root.dataset.hits = String(state.hits);
  root.dataset.hazards = String(state.hazards);
  root.dataset.timeLeft = String(Math.ceil(state.timeLeft));
  root.dataset.difficulty = state.difficulty.toFixed(2);
  root.dataset.lastEvent = state.lastEvent;
  root.dataset.playerX = String(Math.round(state.player.x));
  root.dataset.playerY = String(Math.round(state.player.y));
  root.dataset.entityCount = String(state.entities.length);
  root.dataset.coreCount = String(state.entities.filter((entity) => entity.type === 'core').length);
  root.dataset.hazardCount = String(state.entities.filter((entity) => entity.type === 'hazard').length);
  signalEl.textContent = String(Math.round(state.signal));
  scoreEl.textContent = String(state.score);
  coresEl.textContent = String(state.cores);
  timerEl.textContent = String(Math.ceil(state.timeLeft));
}

function setStatus(text, event = state.lastEvent) {
  statusEl.textContent = text;
  state.lastEvent = event;
  syncDom();
}

function resetGame() {
  state.mode = 'running';
  state.signal = 100;
  state.score = 0;
  state.cores = 0;
  state.hits = 0;
  state.hazards = 0;
  state.timeLeft = 60;
  state.difficulty = 1;
  state.entities = [];
  state.player.x = 640;
  state.player.y = 520;
  spawnClock = 0;
  pulseClock = 0;
  setStatus('Signal field unstable. Collect cyan cores and avoid red interference.', 'started');
  for (let i = 0; i < 5; i += 1) spawnEntity(i % 4 === 0 ? 'hazard' : 'core');
  // Seed a few entities inside the visible playfield so smoke/video artifacts show
  // the actual collect/dodge vocabulary immediately instead of an empty opening.
  const visibleSeeds = [
    { x: 520, y: 310 },
    { x: 760, y: 350 },
    { x: 420, y: 470 },
    { x: 910, y: 250 },
    { x: 610, y: 180 }
  ];
  state.entities.forEach((entity, index) => Object.assign(entity, visibleSeeds[index]));
  if (!animationId) {
    lastFrame = performance.now();
    animationId = requestAnimationFrame(loop);
  }
}

function spawnEntity(type = Math.random() < 0.72 ? 'core' : 'hazard') {
  const lane = state.entities.length + state.cores + state.hits + 1;
  state.entities.push({
    id: `entity-${Date.now()}-${lane}`,
    type,
    x: 90 + ((lane * 173) % (WIDTH - 180)),
    y: -40 - ((lane * 47) % 220),
    radius: type === 'core' ? 16 : 20,
    vy: (92 + ((lane * 19) % 90)) * state.difficulty,
    phase: lane * 0.7
  });
}

function collectCore(entity) {
  state.cores += 1;
  state.score += 100 + Math.round(15 * state.difficulty);
  state.signal = clamp(state.signal + 4, 0, 100);
  state.difficulty = 1 + state.cores * 0.05;
  state.lastEvent = `core-${entity.id}`;
}

function hitHazard(entity) {
  state.hits += 1;
  state.hazards += 1;
  state.signal = clamp(state.signal - 18, 0, 100);
  state.lastEvent = `hazard-${entity.id}`;
  if (state.signal <= 0) endGame('lost', 'Signal collapsed under interference.');
}

function endGame(mode, text) {
  state.mode = mode;
  state.entities = [];
  setStatus(text, mode === 'won' ? 'extraction-complete' : 'signal-lost');
}

function update(dt) {
  if (state.mode !== 'running') return;
  const dx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  const dy = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
  const length = Math.hypot(dx, dy) || 1;
  state.player.x = clamp(state.player.x + (dx / length) * state.player.speed * dt, 34, WIDTH - 34);
  state.player.y = clamp(state.player.y + (dy / length) * state.player.speed * dt, 120, HEIGHT - 60);

  state.timeLeft = Math.max(0, state.timeLeft - dt);
  state.signal = clamp(state.signal - dt * 0.45, 0, 100);
  spawnClock += dt;
  pulseClock = Math.max(0, pulseClock - dt);
  if (spawnClock > Math.max(0.34, 1.04 - state.difficulty * 0.05)) {
    spawnClock = 0;
    spawnEntity();
  }

  for (const entity of state.entities) {
    entity.y += entity.vy * dt;
    entity.x += Math.sin(performance.now() / 600 + entity.phase) * 28 * dt;
  }

  const survivors = [];
  for (const entity of state.entities) {
    const distance = Math.hypot(entity.x - state.player.x, entity.y - state.player.y);
    if (distance < entity.radius + state.player.radius) {
      if (entity.type === 'core') collectCore(entity);
      else hitHazard(entity);
      continue;
    }
    if (entity.y > HEIGHT + 50) {
      if (entity.type === 'core') {
        state.signal = clamp(state.signal - 5, 0, 100);
        state.lastEvent = 'missed-core';
      }
      continue;
    }
    survivors.push(entity);
  }
  state.entities = survivors;

  if (state.timeLeft <= 0) endGame('won', `Extraction complete: ${state.cores} cores secured for ${state.score} points.`);
  if (state.signal <= 0) endGame('lost', 'Signal collapsed before extraction.');
  syncDom();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(71, 248, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#030813');
  gradient.addColorStop(0.52, '#071224');
  gradient.addColorStop(1, '#14051f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid();

  for (const star of state.stars) {
    ctx.fillStyle = star.glow;
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(WIDTH / 2, HEIGHT / 2);
  ctx.strokeStyle = 'rgba(255, 100, 220, 0.18)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 210, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(99, 247, 255, 0.24)';
  ctx.strokeRect(-460, -250, 920, 500);
  ctx.restore();

  for (const entity of state.entities) {
    ctx.save();
    ctx.translate(entity.x, entity.y);
    if (entity.type === 'core') {
      ctx.fillStyle = '#58f7ff';
      ctx.shadowColor = '#58f7ff';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6 + performance.now() / 900;
        const r = i % 2 ? entity.radius * 0.72 : entity.radius;
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#ff315f';
      ctx.shadowColor = '#ff315f';
      ctx.shadowBlur = 18;
      ctx.rotate(performance.now() / 700 + entity.phase);
      ctx.fillRect(-entity.radius, -entity.radius, entity.radius * 2, entity.radius * 2);
      ctx.strokeStyle = '#ffd1dc'; ctx.strokeRect(-entity.radius * 0.55, -entity.radius * 0.55, entity.radius * 1.1, entity.radius * 1.1);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(state.player.x, state.player.y);
  ctx.shadowColor = pulseClock > 0 ? '#ffffff' : '#63f7ff';
  ctx.shadowBlur = pulseClock > 0 ? 42 : 24;
  ctx.fillStyle = '#dffcff';
  ctx.beginPath();
  ctx.moveTo(0, -26); ctx.lineTo(24, 18); ctx.lineTo(0, 8); ctx.lineTo(-24, 18); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#63f7ff'; ctx.lineWidth = 3; ctx.stroke();
  if (pulseClock > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath(); ctx.arc(0, 0, 90 * pulseClock, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  draw();
  animationId = requestAnimationFrame(loop);
}

function pulseScan() {
  if (state.mode !== 'running') return;
  pulseClock = 1;
  let collected = 0;
  state.entities = state.entities.filter((entity) => {
    if (entity.type === 'core' && Math.hypot(entity.x - state.player.x, entity.y - state.player.y) < 120) {
      collectCore(entity);
      collected += 1;
      return false;
    }
    return true;
  });
  setStatus(collected ? `Pulse recovered ${collected} nearby core${collected === 1 ? '' : 's'}.` : 'Pulse scan found no cores inside the drone radius.', 'pulse-scan');
}

function pointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  state.player.x = clamp(((event.clientX - rect.left) / rect.width) * WIDTH, 34, WIDTH - 34);
  state.player.y = clamp(((event.clientY - rect.top) / rect.height) * HEIGHT, 120, HEIGHT - 60);
  syncDom();
}

startButton.addEventListener('click', resetGame);
window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'KeyF') pulseScan();
  if ((state.mode === 'won' || state.mode === 'lost') && event.code === 'Enter') resetGame();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
canvas.addEventListener('pointerdown', (event) => { pointerMove(event); canvas.setPointerCapture?.(event.pointerId); });
canvas.addEventListener('pointermove', (event) => { if (event.buttons) pointerMove(event); });

window.__signalSalvageTest = {
  start: resetGame,
  collectCore() {
    collectCore({ id: 'test-core' });
    setStatus('Test core recovered.', 'test-core');
  },
  forceCollision() {
    hitHazard({ id: 'test-hazard' });
    setStatus('Test interference collision registered.', 'test-hazard');
  },
  winRun() {
    state.timeLeft = 0;
    update(0);
  },
  loseRun() {
    state.signal = 1;
    hitHazard({ id: 'test-fatal' });
  },
  movePlayer(x, y) {
    state.player.x = clamp(x, 34, WIDTH - 34);
    state.player.y = clamp(y, 120, HEIGHT - 60);
    syncDom();
  },
  snapshot() {
    return JSON.parse(JSON.stringify({ ...state, entities: state.entities.slice(0, 8) }));
  }
};

syncDom();
draw();
