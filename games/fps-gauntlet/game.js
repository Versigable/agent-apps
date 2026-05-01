import * as THREE from 'three';

const root = document.querySelector('#game-root');
const canvas = document.querySelector('#game-canvas');
const startButton = document.querySelector('#start-button');
const overlay = document.querySelector('#overlay');
const message = document.querySelector('#message');
const radar = document.querySelector('#radar');
const threatCount = document.querySelector('#threat-count');
const weaponStatus = document.querySelector('#weapon-status');
const hud = {
  health: document.querySelector('#health'),
  score: document.querySelector('#score'),
  wave: document.querySelector('#wave'),
  heat: document.querySelector('#heat'),
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
  keys: new Set(),
  enemies: [],
  projectiles: [],
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

function makeArena() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 72, 36, 36),
    new THREE.MeshStandardMaterial({ color: 0x07101f, metalness: 0.65, roughness: 0.35 })
  );
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);

  const grid = new THREE.GridHelper(72, 36, 0x23e6ff, 0x193b5a);
  grid.material.opacity = 0.32;
  grid.material.transparent = true;
  world.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x111d36, emissive: 0x071a34, metalness: 0.4, roughness: 0.42 });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x23e6ff });
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

function spawnEnemy(index = state.enemies.length) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.75, 1),
    new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0x5f0920, metalness: 0.25, roughness: 0.25 })
  );
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0x76ff8f }));
  group.add(body, core);
  const angle = index * 2.399 + state.wave;
  const radius = 16 + (index % 4) * 2.5;
  group.position.set(Math.cos(angle) * radius, 1.2, Math.sin(angle) * radius - 7);
  group.userData = { hp: 3 + Math.floor(state.wave / 2), speed: 2.0 + state.wave * 0.18, wobble: Math.random() * 10 };
  world.add(group);
  state.enemies.push(group);
}

function resetGame() {
  state.health = 100; state.score = 0; state.wave = 1; state.heat = 0; state.shotsFired = 0;
  state.yaw = 0; state.pitch = 0; state.velocity.set(0, 0, 0); camera.position.set(0, 1.7, 8);
  for (const enemy of state.enemies) world.remove(enemy);
  for (const projectile of state.projectiles) world.remove(projectile.mesh);
  state.enemies = []; state.projectiles = [];
  for (let i = 0; i < 7; i++) spawnEnemy(i);
  updateHud();
}

function startGame() {
  resetGame();
  state.running = true;
  root.dataset.state = 'running';
  overlay.style.display = '';
  message.textContent = 'Breach live. Clear the drones.';
  canvas.requestPointerLock?.();
  state.clock.getDelta();
}

function endGame() {
  state.running = false;
  root.dataset.state = 'game-over';
  overlay.style.display = 'block';
  overlay.querySelector('h1').textContent = 'Breach Failed';
  overlay.querySelector('p').textContent = `Final score ${state.score}. Restart and push the wave higher.`;
  startButton.textContent = 'Restart Breach';
  message.textContent = 'Drone swarm overran the vault.';
  document.exitPointerLock?.();
}

function shoot() {
  if (!state.running) return;
  const now = performance.now();
  if (now - state.lastShot < 145 || state.heat > 92) return;
  state.lastShot = now;
  state.shotsFired += 1;
  state.heat = Math.min(100, state.heat + 14);

  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0x76ff8f }));
  mesh.position.copy(camera.position).add(direction.clone().multiplyScalar(0.8));
  world.add(mesh);
  state.projectiles.push({ mesh, direction, life: 1.1 });
  updateHud();
}

function showDamage(enemy) {
  const pop = document.createElement('div');
  pop.className = 'damage-pop';
  pop.textContent = '+25';
  const projected = enemy.position.clone().project(camera);
  pop.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
  pop.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  document.body.append(pop);
  setTimeout(() => pop.remove(), 700);
}

function flashBreach() {
  root.classList.remove('hit');
  void root.offsetWidth;
  root.classList.add('hit');
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
    dot.className = 'radar-dot';
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
  hud.healthBar.style.transform = `scaleX(${healthPct})`;
  hud.heatBar.style.transform = `scaleX(${heatPct})`;
  threatCount.textContent = state.enemies.length;
  weaponStatus.textContent = state.heat > 92 ? 'VENTING' : state.heat > 70 ? 'HOT' : 'READY';
  weaponStatus.classList.toggle('overheat', state.heat > 70);
  root.dataset.shotsFired = String(state.shotsFired);
  root.dataset.enemyCount = String(state.enemies.length);
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
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -30, 30);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -30, 30);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

function updateEnemies(dt) {
  const playerFlat = camera.position.clone(); playerFlat.y = 1.2;
  for (const enemy of [...state.enemies]) {
    const toPlayer = playerFlat.clone().sub(enemy.position);
    const distance = toPlayer.length();
    if (distance > 0.001) enemy.position.addScaledVector(toPlayer.normalize(), enemy.userData.speed * dt);
    enemy.rotation.x += dt * 1.4;
    enemy.rotation.y += dt * 2.1;
    enemy.position.y = 1.2 + Math.sin(performance.now() / 300 + enemy.userData.wobble) * 0.25;
    if (distance < 1.45 && performance.now() - state.lastHit > 550) {
      state.lastHit = performance.now();
      state.health -= 12;
      message.textContent = 'Hull breach -12';
      flashBreach();
      if (state.health <= 0) endGame();
    }
  }
  if (state.enemies.length === 0 && state.running) {
    state.wave += 1;
    message.textContent = `Wave ${state.wave}. Drones adapting.`;
    for (let i = 0; i < 6 + state.wave * 2; i++) spawnEnemy(i);
  }
}

function updateProjectiles(dt) {
  for (const projectile of [...state.projectiles]) {
    projectile.life -= dt;
    projectile.mesh.position.addScaledVector(projectile.direction, 28 * dt);
    for (const enemy of [...state.enemies]) {
      if (projectile.mesh.position.distanceTo(enemy.position) < 0.95) {
        enemy.userData.hp -= 1;
        showDamage(enemy);
        world.remove(projectile.mesh);
        state.projectiles.splice(state.projectiles.indexOf(projectile), 1);
        if (enemy.userData.hp <= 0) {
          world.remove(enemy);
          state.enemies.splice(state.enemies.indexOf(enemy), 1);
          state.score += 25;
          message.textContent = 'Drone neutralized +25';
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.04, state.clock.getDelta());
  if (state.running) {
    state.heat = Math.max(0, state.heat - dt * 18);
    updateMovement(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateHud();
  }
  renderer.render(scene, camera);
}

startButton.addEventListener('click', startGame);
window.addEventListener('keydown', (event) => {
  state.keys.add(event.code);
  if (event.code === 'KeyF' || event.code === 'Space') shoot();
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
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetGame();
animate();
