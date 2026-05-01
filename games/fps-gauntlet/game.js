import * as THREE from 'three';

const root = document.querySelector('#game-root');
const canvas = document.querySelector('#game-canvas');
const startButton = document.querySelector('#start-button');
const overlay = document.querySelector('#overlay');
const message = document.querySelector('#message');
const waveBanner = document.querySelector('#wave-banner');
const runSummary = document.querySelector('#run-summary');
const radar = document.querySelector('#radar');
const threatCount = document.querySelector('#threat-count');
const weaponStatus = document.querySelector('#weapon-status');
const hud = {
  health: document.querySelector('#health'),
  score: document.querySelector('#score'),
  wave: document.querySelector('#wave'),
  heat: document.querySelector('#heat'),
  accuracy: document.querySelector('#accuracy'),
  kills: document.querySelector('#kills'),
  shotsFired: document.querySelector('#shots-fired'),
  highScore: document.querySelector('#high-score'),
  healthBar: document.querySelector('#health-bar'),
  heatBar: document.querySelector('#heat-bar')
};

const state = {
  running: false,
  health: 100,
  score: 0,
  wave: 1,
  heat: 0,
  shotsFired: 0,
  yaw: 0,
  pitch: 0,
  velocity: new THREE.Vector3(),
  verticalVelocity: 0,
  grounded: true,
  jumps: 0,
  hits: 0,
  kills: 0,
  wavesCleared: 0,
  highScore: Number(localStorage.getItem('neon-breach-high-score') || '0'),
  waveStatus: 'idle',
  waveTimer: 0,
  summary: '',
  keys: new Set(),
  enemies: [],
  arenaLandmarks: [],
  projectiles: [],
  effects: [],
  lastShot: 0,
  lastHit: 0,
  clock: new THREE.Clock()
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x071426, 0.035);
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 8);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x050817, 1);

const world = new THREE.Group();
scene.add(world);
scene.add(new THREE.HemisphereLight(0x95e8ff, 0x141228, 1.1));
const keyLight = new THREE.PointLight(0x23e6ff, 80, 70);
keyLight.position.set(0, 9, 0);
scene.add(keyLight);
const pinkLight = new THREE.PointLight(0xff37df, 35, 60);
pinkLight.position.set(-12, 4, -10);
scene.add(pinkLight);

function registerLandmark(name) {
  state.arenaLandmarks.push(name);
}

function makeArena() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 72, 36, 36),
    new THREE.MeshStandardMaterial({ color: 0x07101f, emissive: 0x02060f, metalness: 0.65, roughness: 0.35 })
  );
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);

  const grid = new THREE.GridHelper(72, 36, 0x23e6ff, 0x193b5a);
  grid.material.opacity = 0.38;
  grid.material.transparent = true;
  world.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x111d36, emissive: 0x071a34, metalness: 0.4, roughness: 0.42 });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x23e6ff });
  const pinkMat = new THREE.MeshBasicMaterial({ color: 0xff37df });
  const amberMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

  const reactor = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.8, 4.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x10283f, emissive: 0x0a4966, metalness: 0.55, roughness: 0.24 })
  );
  core.position.y = 2.2;
  const reactorGlow = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 16), new THREE.MeshBasicMaterial({ color: 0x76ff8f, transparent: true, opacity: 0.72 }));
  reactorGlow.position.y = 3.35;
  const reactorRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.055, 10, 56), pinkMat);
  reactorRing.rotation.x = Math.PI / 2;
  reactorRing.position.y = 2.2;
  const reactorSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 10, 16), new THREE.MeshBasicMaterial({ color: 0x76ff8f }));
  reactorSpire.position.y = 5.2;
  const reactorCrown = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.08, 10, 72), neonMat);
  reactorCrown.position.y = 6.8;
  reactor.add(core, reactorGlow, reactorRing, reactorSpire, reactorCrown);
  world.add(reactor);
  const laneMat = new THREE.MeshBasicMaterial({ color: 0x23e6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const crossLane = new THREE.Mesh(new THREE.PlaneGeometry(68, 0.38), laneMat);
  crossLane.rotation.x = -Math.PI / 2;
  crossLane.position.y = 0.035;
  world.add(crossLane);
  const longLane = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 68), laneMat.clone());
  longLane.rotation.x = -Math.PI / 2;
  longLane.position.y = 0.04;
  world.add(longLane);
  const reactorLight = new THREE.PointLight(0x76ff8f, 95, 42);
  reactorLight.position.set(0, 6.4, 0);
  scene.add(reactorLight);
  registerLandmark('central-reactor');

  const quadrants = [
    { name: 'north-tower', x: 0, z: -24, color: 0x23e6ff, mat: neonMat },
    { name: 'east-tower', x: 24, z: 0, color: 0xffd166, mat: amberMat },
    { name: 'south-tower', x: 0, z: 24, color: 0xff37df, mat: pinkMat },
    { name: 'west-tower', x: -24, z: 0, color: 0x76ff8f, mat: new THREE.MeshBasicMaterial({ color: 0x76ff8f }) }
  ];
  for (const quadrant of quadrants) {
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8, 1.4), wallMat);
    mast.position.y = 4;
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), quadrant.mat);
    beacon.position.y = 8.65;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11, 12), quadrant.mat);
    beam.position.y = 5.5;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.72, 0.22), quadrant.mat);
    sign.position.y = 4.4;
    sign.lookAt(0, 4.4, 0);
    tower.add(mast, beacon, beam, sign);
    tower.position.set(quadrant.x, 0, quadrant.z);
    world.add(tower);
    const beaconLight = new THREE.PointLight(quadrant.color, 26, 22);
    beaconLight.position.set(quadrant.x, 9.2, quadrant.z);
    scene.add(beaconLight);
    registerLandmark(quadrant.name);
  }

  const boundaryPieces = [
    [0, 1.8, -34.5, 72, 3.6, 0.7], [0, 1.8, 34.5, 72, 3.6, 0.7],
    [-34.5, 1.8, 0, 0.7, 3.6, 72], [34.5, 1.8, 0, 0.7, 3.6, 72]
  ];
  for (const [x, y, z, w, h, d] of boundaryPieces) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, y, z);
    world.add(wall);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.9), 0.12, Math.max(d, 0.9)), neonMat);
    rail.position.set(x, y + h / 2 + 0.12, z);
    world.add(rail);
  }
  registerLandmark('boundary-wall');

  const coverPositions = [
    [-13, 0.8, -10, Math.PI / 10], [13, 0.8, -10, -Math.PI / 10],
    [-15, 0.8, 12, -Math.PI / 8], [15, 0.8, 12, Math.PI / 8],
    [-7, 0.8, 21, Math.PI / 2], [7, 0.8, -21, Math.PI / 2]
  ];
  for (const [x, y, z, ry] of coverPositions) {
    const barricade = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 1.6, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x132742, emissive: 0x06182a, metalness: 0.5, roughness: 0.35 })
    );
    barricade.position.set(x, y, z);
    barricade.rotation.y = ry;
    world.add(barricade);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(5.35, 0.08, 0.78), neonMat);
    trim.position.set(x, y + 0.84, z);
    trim.rotation.copy(barricade.rotation);
    world.add(trim);
  }
  registerLandmark('cover-barricades');

  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2;
    const radius = 33;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6 + (i % 4), 1.2), wallMat);
    pillar.position.set(Math.cos(angle) * radius, pillar.geometry.parameters.height / 2, Math.sin(angle) * radius);
    pillar.lookAt(0, pillar.position.y, 0);
    world.add(pillar);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, pillar.geometry.parameters.height + 0.15, 0.08), neonMat);
    strip.position.copy(pillar.position).add(new THREE.Vector3(0, 0, 0.64));
    strip.rotation.copy(pillar.rotation);
    world.add(strip);
  }
}
makeArena();

const ENEMY_TYPES = {
  skitter: {
    label: 'Skitter',
    color: 0xff4d6d,
    emissive: 0x5f0920,
    core: 0x76ff8f,
    hp: 2,
    speed: 2.65,
    score: 20,
    damage: 9,
    radius: 0.82,
    scale: [0.78, 0.78, 0.78]
  },
  brute: {
    label: 'Brute',
    color: 0xffd166,
    emissive: 0x5b3300,
    core: 0xff37df,
    hp: 5,
    speed: 1.38,
    score: 45,
    damage: 17,
    radius: 1.18,
    scale: [1.25, 1.25, 1.25]
  },
  warden: {
    label: 'Warden',
    color: 0x23e6ff,
    emissive: 0x063a55,
    core: 0xffffff,
    hp: 3,
    speed: 1.95,
    score: 35,
    damage: 12,
    radius: 0.98,
    scale: [0.95, 1.35, 0.95]
  }
};
const ENEMY_TYPE_ORDER = ['skitter', 'brute', 'warden'];

function pickEnemyType(index, wave = state.wave) {
  if (wave < 2) return index % 5 === 4 ? 'brute' : 'skitter';
  return ENEMY_TYPE_ORDER[(index + wave) % ENEMY_TYPE_ORDER.length];
}

function spawnWave(wave = state.wave) {
  state.waveStatus = 'intro';
  state.waveTimer = 1.25;
  root.dataset.waveStatus = state.waveStatus;
  waveBanner.textContent = `Wave ${wave} Incoming`;
  waveBanner.classList.add('visible');
  for (let i = 0; i < 6 + wave * 2; i++) spawnEnemy(i);
}

function spawnEnemy(index = state.enemies.length, forcedType = null) {
  const typeKey = forcedType || pickEnemyType(index);
  const type = ENEMY_TYPES[typeKey] || ENEMY_TYPES.skitter;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    typeKey === 'brute' ? new THREE.DodecahedronGeometry(0.82, 0) : new THREE.IcosahedronGeometry(0.75, 1),
    new THREE.MeshStandardMaterial({ color: type.color, emissive: type.emissive, metalness: 0.25, roughness: 0.25 })
  );
  body.scale.set(...type.scale);
  const core = new THREE.Mesh(new THREE.SphereGeometry(typeKey === 'brute' ? 0.28 : 0.22, 16, 12), new THREE.MeshBasicMaterial({ color: type.core }));
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(typeKey === 'warden' ? 0.82 : 0.62, 0.035, 8, 28),
    new THREE.MeshBasicMaterial({ color: type.core, transparent: true, opacity: 0.74 })
  );
  halo.rotation.x = Math.PI / 2;
  if (typeKey === 'brute') halo.scale.set(1.25, 1.25, 1.25);
  if (typeKey === 'skitter') halo.position.y = -0.2;
  group.add(body, core, halo);
  const angle = index * 2.399 + state.wave;
  const radius = 16 + (index % 4) * 2.5;
  group.position.set(Math.cos(angle) * radius, 1.2, Math.sin(angle) * radius - 7);
  group.userData = {
    type: typeKey,
    label: type.label,
    hp: type.hp + Math.floor(state.wave / 3),
    maxHp: type.hp + Math.floor(state.wave / 3),
    speed: type.speed + state.wave * 0.12,
    score: type.score,
    damage: type.damage,
    radius: type.radius,
    wobble: Math.random() * 10
  };
  world.add(group);
  state.enemies.push(group);
}

function resetGame() {
  state.health = 100; state.score = 0; state.wave = 1; state.heat = 0; state.shotsFired = 0; state.jumps = 0; state.hits = 0; state.kills = 0; state.wavesCleared = 0; state.waveStatus = 'idle'; state.waveTimer = 0; state.summary = '';
  state.yaw = 0; state.pitch = 0; state.velocity.set(0, 0, 0); state.verticalVelocity = 0; state.grounded = true; camera.position.set(0, 1.7, 8);
  for (const enemy of state.enemies) world.remove(enemy);
  for (const projectile of state.projectiles) world.remove(projectile.mesh);
  for (const effect of state.effects) world.remove(effect.mesh);
  state.enemies = []; state.projectiles = []; state.effects = [];
  waveBanner.classList.remove('visible', 'cleared');
  runSummary.classList.remove('visible');
  runSummary.textContent = '';
  spawnWave(1);
  updateHud();
}

function startGame() {
  resetGame();
  state.running = true;
  root.dataset.state = 'running';
  overlay.style.display = '';
  message.textContent = 'Breach live. Clear the drones.';
  state.waveStatus = 'combat';
  root.dataset.waveStatus = state.waveStatus;
  canvas.requestPointerLock?.();
  state.clock.getDelta();
}

function endGame() {
  state.running = false;
  root.dataset.state = 'game-over';
  overlay.style.display = 'block';
  overlay.querySelector('h1').textContent = 'Breach Failed';
  state.highScore = Math.max(state.highScore, state.score);
  localStorage.setItem('neon-breach-high-score', String(state.highScore));
  state.summary = summarizeRun();
  root.dataset.runSummary = state.summary;
  overlay.querySelector('p').textContent = `${state.summary}. Restart and push the wave higher.`;
  runSummary.textContent = state.summary;
  runSummary.classList.add('visible');
  startButton.textContent = 'Restart Breach';
  message.textContent = 'Drone swarm overran the vault.';
  document.exitPointerLock?.();
}

function pulseClass(className) {
  root.classList.remove(className);
  void root.offsetWidth;
  root.classList.add(className);
}

function shoot() {
  if (!state.running) return;
  const now = performance.now();
  if (now - state.lastShot < 145 || state.heat > 92) return;
  state.lastShot = now;
  state.shotsFired += 1;
  state.heat = Math.min(100, state.heat + 14);
  pulseClass('firing');
  pulseClass('recoil');
  camera.position.add(new THREE.Vector3(0, 0, 0.055).applyQuaternion(camera.quaternion));

  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0x76ff8f }));
  const trail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.08, 1.1, 8),
    new THREE.MeshBasicMaterial({ color: 0x23e6ff, transparent: true, opacity: 0.62 })
  );
  trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  mesh.add(trail);
  mesh.position.copy(camera.position).add(direction.clone().multiplyScalar(0.8));
  world.add(mesh);
  state.projectiles.push({ mesh, direction, life: 1.1 });
  updateHud();
}

function spawnBurst(position, color = 0x76ff8f, count = 10) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 + Math.random() * 0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    mesh.position.copy(position);
    const velocity = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4.5, (Math.random() - 0.5) * 6);
    world.add(mesh);
    state.effects.push({ mesh, velocity, life: 0.45 + Math.random() * 0.28, maxLife: 0.73 });
  }
}

function showDamage(enemy) {
  const pop = document.createElement('div');
  pop.className = 'damage-pop';
  pop.textContent = '+25';
  const projected = enemy.position.clone().project(camera);
  pop.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
  pop.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  document.body.append(pop);
  pulseClass('hit-confirm');
  spawnBurst(enemy.position, 0x76ff8f, 7);
  setTimeout(() => pop.remove(), 700);
}

function flashBreach() {
  pulseClass('hit');
}

function renderRadar() {
  if (!radar) return;
  radar.querySelectorAll('.radar-dot').forEach((dot) => dot.remove());
  const range = 32;
  for (const enemy of state.enemies.slice(0, 20)) {
    const relative = enemy.position.clone().sub(camera.position);
    const x = THREE.MathUtils.clamp(relative.x / range, -1, 1);
    const z = THREE.MathUtils.clamp(relative.z / range, -1, 1);
    const dot = document.createElement('span');
    dot.className = `radar-dot radar-dot--${enemy.userData.type || 'skitter'}`;
    dot.style.left = `${50 + x * 42}%`;
    dot.style.top = `${50 + z * 42}%`;
    radar.append(dot);
  }
}

function updateHud() {
  const healthPct = THREE.MathUtils.clamp(state.health / 100, 0, 1);
  const heatPct = THREE.MathUtils.clamp(state.heat / 100, 0, 1);
  hud.health.textContent = Math.max(0, Math.round(state.health));
  hud.score.textContent = state.score;
  hud.wave.textContent = state.wave;
  hud.heat.textContent = Math.round(state.heat);
  hud.accuracy.textContent = `${getAccuracy()}%`;
  hud.kills.textContent = state.kills;
  hud.shotsFired.textContent = state.shotsFired;
  hud.highScore.textContent = state.highScore;
  hud.healthBar.style.transform = `scaleX(${healthPct})`;
  hud.heatBar.style.transform = `scaleX(${heatPct})`;
  threatCount.textContent = state.enemies.length;
  weaponStatus.textContent = state.heat > 92 ? 'VENTING' : state.heat > 70 ? 'HOT' : 'READY';
  weaponStatus.classList.toggle('overheat', state.heat > 70);
  root.dataset.shotsFired = String(state.shotsFired);
  root.dataset.enemyCount = String(state.enemies.length);
  root.dataset.enemyTypes = [...new Set(state.enemies.map((enemy) => enemy.userData.type || 'skitter'))].sort().join(',');
  root.dataset.arenaLandmarks = state.arenaLandmarks.join(',');
  root.dataset.jumps = String(state.jumps);
  root.dataset.shotsHit = String(state.hits);
  root.dataset.kills = String(state.kills);
  root.dataset.accuracy = String(getAccuracy());
  root.dataset.wavesCleared = String(state.wavesCleared);
  root.dataset.highScore = String(state.highScore);
  root.dataset.waveStatus = state.waveStatus;
  root.dataset.runSummary = state.summary || summarizeRun();
  renderRadar();
}

function updateMovement(dt) {
  const forward = Number(state.keys.has('KeyW')) - Number(state.keys.has('KeyS'));
  const strafe = Number(state.keys.has('KeyD')) - Number(state.keys.has('KeyA'));
  const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
  const speed = sprint ? 8.5 : 5.2;
  const direction = new THREE.Vector3(strafe, 0, -forward);
  if (direction.lengthSq() > 0) direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
  state.velocity.lerp(direction.multiplyScalar(speed), 0.22);
  camera.position.addScaledVector(state.velocity, dt);
  state.verticalVelocity -= 22 * dt;
  camera.position.y += state.verticalVelocity * dt;
  if (camera.position.y <= 1.7) {
    camera.position.y = 1.7;
    state.verticalVelocity = 0;
    state.grounded = true;
  }
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -30, 30);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -30, 30);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

function getAccuracy() {
  return state.shotsFired > 0 ? Math.round((state.hits / state.shotsFired) * 100) : 0;
}

function summarizeRun() {
  return `Score ${state.score} · Waves ${state.wavesCleared} · Kills ${state.kills} · Accuracy ${getAccuracy()}%`;
}

function clearWave() {
  if (!state.running || state.waveStatus === 'cleared') return;
  state.wavesCleared += 1;
  state.score += 100 + state.wave * 50;
  state.highScore = Math.max(state.highScore, state.score);
  localStorage.setItem('neon-breach-high-score', String(state.highScore));
  state.waveStatus = 'cleared';
  state.waveTimer = 1.55;
  root.dataset.waveStatus = state.waveStatus;
  waveBanner.textContent = `Wave ${state.wave} Clear · +${100 + state.wave * 50}`;
  waveBanner.classList.add('visible', 'cleared');
  message.textContent = `Wave ${state.wave} clear. Reloading breach gates.`;
  spawnBurst(camera.position.clone().add(new THREE.Vector3(0, 0, -2).applyQuaternion(camera.quaternion)), 0x23e6ff, 18);
  updateHud();
}

function advanceWaveTimers(dt) {
  if (state.waveTimer <= 0) return;
  state.waveTimer -= dt;
  if (state.waveTimer > 0) return;
  if (state.waveStatus === 'cleared') {
    state.wave += 1;
    message.textContent = `Wave ${state.wave}. Drones adapting.`;
    spawnWave(state.wave);
  } else if (state.waveStatus === 'intro') {
    state.waveStatus = 'combat';
    root.dataset.waveStatus = state.waveStatus;
    waveBanner.classList.remove('visible', 'cleared');
  }
}

function updateEnemies(dt) {
  const playerFlat = camera.position.clone(); playerFlat.y = 1.2;
  for (const enemy of [...state.enemies]) {
    const toPlayer = playerFlat.clone().sub(enemy.position);
    const distance = toPlayer.length();
    if (distance > 0.001) enemy.position.addScaledVector(toPlayer.normalize(), enemy.userData.speed * dt);
    const turnRate = enemy.userData.type === 'brute' ? 1.05 : enemy.userData.type === 'warden' ? 2.8 : 2.1;
    enemy.rotation.x += dt * (enemy.userData.type === 'warden' ? 0.7 : 1.4);
    enemy.rotation.y += dt * turnRate;
    enemy.position.y = 1.2 + Math.sin(performance.now() / (enemy.userData.type === 'skitter' ? 210 : 340) + enemy.userData.wobble) * (enemy.userData.type === 'warden' ? 0.45 : 0.25);
    if (distance < 1.1 + enemy.userData.radius && performance.now() - state.lastHit > 550) {
      state.lastHit = performance.now();
      state.health -= enemy.userData.damage;
      message.textContent = `${enemy.userData.label} breach -${enemy.userData.damage}`;
      flashBreach();
      if (state.health <= 0) endGame();
    }
  }
  if (state.enemies.length === 0 && state.running) clearWave();
}

function updateProjectiles(dt) {
  for (const projectile of [...state.projectiles]) {
    projectile.life -= dt;
    projectile.mesh.position.addScaledVector(projectile.direction, 28 * dt);
    for (const enemy of [...state.enemies]) {
      if (projectile.mesh.position.distanceTo(enemy.position) < enemy.userData.radius) {
        enemy.userData.hp -= 1;
        state.hits += 1;
        showDamage(enemy);
        world.remove(projectile.mesh);
        state.projectiles.splice(state.projectiles.indexOf(projectile), 1);
        if (enemy.userData.hp <= 0) {
          spawnBurst(enemy.position, 0xff37df, 16);
          world.remove(enemy);
          state.enemies.splice(state.enemies.indexOf(enemy), 1);
          state.kills += 1;
          state.score += enemy.userData.score;
          state.highScore = Math.max(state.highScore, state.score);
          message.textContent = `${enemy.userData.label} neutralized +${enemy.userData.score}`;
        }
        break;
      }
    }
    if (projectile.life <= 0 && state.projectiles.includes(projectile)) {
      world.remove(projectile.mesh);
      state.projectiles.splice(state.projectiles.indexOf(projectile), 1);
    }
  }
}


function updateEffects(dt) {
  for (const effect of [...state.effects]) {
    effect.life -= dt;
    effect.velocity.y -= 4.5 * dt;
    effect.mesh.position.addScaledVector(effect.velocity, dt);
    effect.mesh.material.opacity = Math.max(0, effect.life / effect.maxLife);
    if (effect.life <= 0) {
      world.remove(effect.mesh);
      state.effects.splice(state.effects.indexOf(effect), 1);
    }
  }
}

function jump() {
  if (!state.running || !state.grounded) return;
  state.verticalVelocity = 8.4;
  state.grounded = false;
  state.jumps += 1;
  message.textContent = 'Boost jump engaged.';
  updateHud();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.04, state.clock.getDelta());
  if (state.running) {
    state.heat = Math.max(0, state.heat - dt * 18);
    updateMovement(dt);
    advanceWaveTimers(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateHud();
  }
  renderer.render(scene, camera);
}

startButton.addEventListener('click', startGame);
window.addEventListener('keydown', (event) => {
  state.keys.add(event.code);
  if (event.code === 'KeyF') shoot();
  if (event.code === 'Space') jump();
});
window.addEventListener('keyup', (event) => state.keys.delete(event.code));
window.addEventListener('click', (event) => {
  if (event.target === canvas && state.running) shoot();
});
window.addEventListener('mousemove', (event) => {
  if (!state.running || document.pointerLockElement !== canvas) return;
  state.yaw -= event.movementX * 0.0025;
  state.pitch = THREE.MathUtils.clamp(state.pitch - event.movementY * 0.0025, -1.2, 1.2);
});
window.__neonBreachTest = {
  summarizeRun,
  enemyTypes: () => state.enemies.map((enemy) => ({ type: enemy.userData.type, hp: enemy.userData.hp, score: enemy.userData.score, speed: enemy.userData.speed })),
  advanceToNextWave: () => {
    if (state.waveStatus !== 'cleared') return;
    state.waveTimer = 0;
    state.wave += 1;
    message.textContent = `Wave ${state.wave}. Drones adapting.`;
    spawnWave(state.wave);
    updateHud();
  },
  clearWave: () => {
    for (const enemy of [...state.enemies]) {
      spawnBurst(enemy.position, 0xff37df, 4);
      world.remove(enemy);
    }
    state.enemies = [];
    clearWave();
  },
  state
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetGame();
animate();
