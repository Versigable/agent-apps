const root = document.querySelector('#game-root');
const canvas = document.querySelector('#garden-stage');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#start-button');
const whisperEl = document.querySelector('#whisper');
const specimenEl = document.querySelector('#specimens');
const weirdnessEl = document.querySelector('#weirdness');
const heartbeatEl = document.querySelector('#heartbeat');
const logEl = document.querySelector('#specimen-log');

const cursor = { x: 640, y: 360 };
const spores = [];
const blooms = [];
const whispers = [
  'Your cursor tastes like thunder.',
  'The moon-mouth has accepted a tiny apology.',
  'A fern just remembered being a staircase.',
  'The greenhouse is hungry, but politely.',
  'Something under the soil is applauding backwards.'
];

let state = 'idle';
let petals = 0;
let specimens = 0;
let weirdness = 0;
let heartbeat = 0;
let lastTime = performance.now();
let whisperIndex = 0;
let animationFrame = 0;

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function syncHud() {
  root.dataset.state = state;
  root.dataset.petalsGrown = String(petals);
  root.dataset.specimens = String(specimens);
  specimenEl.textContent = String(specimens);
  weirdnessEl.textContent = String(weirdness);
  heartbeatEl.textContent = String(heartbeat);
}

function addLog(text) {
  const item = document.createElement('li');
  item.textContent = text;
  logEl.prepend(item);
  while (logEl.children.length > 5) logEl.lastElementChild.remove();
}

function setWhisper(text) {
  whisperEl.textContent = text;
}

function spawnSpore(force = false) {
  const angle = Math.random() * Math.PI * 2;
  const distance = force ? 40 : 160 + Math.random() * 360;
  spores.push({
    x: cursor.x + Math.cos(angle) * distance,
    y: cursor.y + Math.sin(angle) * distance,
    vx: Math.cos(angle + Math.PI) * (20 + Math.random() * 24),
    vy: Math.sin(angle + Math.PI) * (20 + Math.random() * 24),
    r: 6 + Math.random() * 12,
    hue: Math.random() > 0.5 ? 305 : 95,
    age: 0
  });
}

function feedGarden() {
  if (state !== 'growing') return;
  petals += 1;
  weirdness += 7;
  heartbeat = (heartbeat + 13) % 100;
  spawnSpore(true);
  blooms.push({ x: cursor.x, y: cursor.y, r: 12, age: 0, hue: 300 + (petals * 23) % 90 });
  specimens = Math.max(specimens, Math.floor(petals / 2) + 1);
  setWhisper(whispers[whisperIndex % whispers.length]);
  whisperIndex += 1;
  addLog(`Specimen ${specimens}: petal ${petals} learned to hum.`);
  syncHud();
}

function blinkMoonMouth() {
  if (state !== 'growing') return;
  weirdness += 11;
  heartbeat = (heartbeat + 29) % 100;
  for (let i = 0; i < 4; i += 1) spawnSpore(true);
  setWhisper('The moon-mouth blinked. Several shadows changed ownership.');
  syncHud();
}

function startGame() {
  state = 'growing';
  petals = 0;
  specimens = 0;
  weirdness = 1;
  heartbeat = 4;
  spores.length = 0;
  blooms.length = 0;
  logEl.replaceChildren();
  for (let i = 0; i < 18; i += 1) spawnSpore(false);
  setWhisper('The greenhouse is hungry. Feed it with F. Blink it with Space.');
  addLog('Specimen 0: a seed opened one violet eye.');
  syncHud();
}

function drawBackground(time) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.55, 30, width * 0.5, height * 0.55, Math.max(width, height));
  gradient.addColorStop(0, '#2a0738');
  gradient.addColorStop(0.5, '#07020d');
  gradient.addColorStop(1, '#020103');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#9dff5f';
  ctx.lineWidth = 1;
  for (let y = -60; y < height + 60; y += 44) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 32) {
      const wave = Math.sin(x * 0.012 + time * 0.0015 + y * 0.03) * 13;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoonMouth(time) {
  const pulse = Math.sin(time * 0.004) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(window.innerWidth * 0.5, window.innerHeight * 0.52);
  ctx.rotate(Math.sin(time * 0.0007) * 0.18);
  ctx.fillStyle = `rgba(255, 79, 216, ${0.12 + pulse * 0.08})`;
  ctx.strokeStyle = `rgba(157, 255, 95, ${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 180 + pulse * 32, 56 + pulse * 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 18; i += 1) {
    const x = -155 + i * 18;
    const tooth = 16 + Math.sin(time * 0.006 + i) * 9;
    ctx.beginPath();
    ctx.moveTo(x, -38);
    ctx.lineTo(x + 8, -38 - tooth);
    ctx.lineTo(x + 16, -38);
    ctx.stroke();
  }
  ctx.restore();
}

function update(dt) {
  if (state !== 'growing') return;
  heartbeat = Math.min(99, Math.floor((Math.sin(performance.now() * 0.003) * 0.5 + 0.5) * 80 + weirdness % 19));
  if (Math.random() < dt * 0.0018 && spores.length < 36) spawnSpore(false);

  for (const spore of spores) {
    const dx = cursor.x - spore.x;
    const dy = cursor.y - spore.y;
    const len = Math.hypot(dx, dy) || 1;
    spore.vx += (dx / len) * dt * 0.03;
    spore.vy += (dy / len) * dt * 0.03;
    spore.x += spore.vx * dt / 1000;
    spore.y += spore.vy * dt / 1000;
    spore.age += dt;
    if (Math.hypot(dx, dy) < 36 && spore.age > 250) {
      petals += 1;
      weirdness += 1;
      specimens = Math.max(specimens, Math.floor(petals / 4));
      spore.age = 0;
      spore.x += (Math.random() - 0.5) * 420;
      spore.y += (Math.random() - 0.5) * 260;
    }
  }
  for (const bloom of blooms) {
    bloom.age += dt;
    bloom.r += dt * 0.05;
  }
  while (blooms.length > 24) blooms.shift();
  syncHud();
}

function render(time) {
  const dt = Math.min(64, time - lastTime);
  lastTime = time;
  update(dt);
  drawBackground(time);
  drawMoonMouth(time);

  for (const bloom of blooms) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - bloom.age / 2400);
    ctx.strokeStyle = `hsl(${bloom.hue} 100% 72%)`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.ellipse(bloom.x, bloom.y, bloom.r + i * 4, bloom.r * 0.32, i * Math.PI / 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const spore of spores) {
    ctx.save();
    ctx.translate(spore.x, spore.y);
    ctx.rotate(time * 0.002 + spore.r);
    ctx.fillStyle = `hsla(${spore.hue} 100% 68% / 0.75)`;
    ctx.shadowColor = `hsl(${spore.hue} 100% 64%)`;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const radius = spore.r * (i % 2 ? 0.55 : 1.25);
      const a = i * Math.PI / 3;
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#ff4fd8';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, 16 + Math.sin(time * 0.008) * 4, 0, Math.PI * 2);
  ctx.moveTo(cursor.x - 26, cursor.y);
  ctx.lineTo(cursor.x + 26, cursor.y);
  ctx.moveTo(cursor.x, cursor.y - 26);
  ctx.lineTo(cursor.x, cursor.y + 26);
  ctx.stroke();
  ctx.restore();

  animationFrame = requestAnimationFrame(render);
}

window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('pointermove', (event) => {
  cursor.x = event.clientX;
  cursor.y = event.clientY;
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF') feedGarden();
  if (event.code === 'Space') {
    event.preventDefault();
    blinkMoonMouth();
  }
});
startButton.addEventListener('click', startGame);

resizeCanvas();
syncHud();
setWhisper('The garden is sleeping under your cursor.');
cancelAnimationFrame(animationFrame);
animationFrame = requestAnimationFrame(render);
